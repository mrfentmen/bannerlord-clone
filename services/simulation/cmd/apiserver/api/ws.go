package api

// GET /ws streams campaign tick frames to the client.
//
// The client's HTTP provider opens this socket, sends
// {"type":"subscribe","channel":"ticks"} when it opens, and applies every frame
// with `applyTick`. The campaign bus already publishes one `wire.TickUpdate`
// frame per simulation tick (`publishTick`), and the frames are cumulative, so
// this handler is only the transport: an RFC 6455 server handshake and one text
// frame per tick payload. It is the same minimal implementation battleapi uses
// for battle streams — kept as its own copy because the two packages import
// different buses and neither should take a dependency on the other.
//
// Frames that are not KindTick are skipped. The bus carries notifications and
// clock changes too, and the client contract for this socket is the tick frame.

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"

	"mbclone/simulation/cmd/apiserver/campaign"
	"mbclone/simulation/cmd/apiserver/events"
)

// wsGUID is the WebSocket handshake magic from RFC 6455.
const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

func (s *Server) getWS(w http.ResponseWriter, r *http.Request) {
	if !isWSUpgrade(r) {
		s.writeFault(w, &campaign.Fault{
			Code: campaign.CodeBadRequest, Message: "/ws requires a WebSocket upgrade",
			Reason: "This route streams tick frames over a WebSocket, and the request was plain HTTP.",
		})
		return
	}
	conn, rw, err := hijack(w)
	if err != nil {
		s.writeFault(w, &campaign.Fault{
			Code: campaign.CodeInternal, Message: err.Error(),
			Reason: "The connection could not be upgraded to a WebSocket.",
		})
		return
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	_, _ = fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\n"+
		"Upgrade: websocket\r\n"+
		"Connection: Upgrade\r\n"+
		"Sec-WebSocket-Accept: %s\r\n\r\n", wsAccept(key))
	_ = rw.Flush()

	sub := s.camp.Bus().Subscribe()
	defer sub.Close()
	// The drain loop is what notices a closed browser tab: writing to a dead
	// connection eventually errors, and the read side fails immediately.
	done := make(chan struct{})
	go func() {
		defer close(done)
		drainClientFrames(conn)
	}()
	defer conn.Close()

	for {
		select {
		case <-done:
			return
		case ev, ok := <-sub.C:
			if !ok {
				return
			}
			if ev.Kind != events.KindTick {
				continue
			}
			payload, err := json.Marshal(ev.Payload)
			if err != nil {
				// A frame that cannot be marshalled is dropped rather than
				// killing the stream, but it is logged: a silently skipped
				// stream looks exactly like a quiet simulation.
				s.log.Printf("apiserver: /ws skipped an unmarshalable tick frame: %v", err)
				continue
			}
			if err := writeTextFrame(conn, payload); err != nil {
				return
			}
		}
	}
}

func isWSUpgrade(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	// Connection may list several tokens: "keep-alive, Upgrade".
	for _, tok := range strings.Split(r.Header.Get("Connection"), ",") {
		if strings.EqualFold(strings.TrimSpace(tok), "upgrade") {
			return r.Header.Get("Sec-WebSocket-Key") != ""
		}
	}
	return false
}

func wsAccept(key string) string {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func hijack(w http.ResponseWriter) (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("server does not support hijacking")
	}
	return hj.Hijack()
}

// writeTextFrame writes one unmasked server-to-client text frame.
func writeTextFrame(w io.Writer, payload []byte) error {
	n := len(payload)
	var hdr []byte
	hdr = append(hdr, 0x81) // FIN + text opcode
	switch {
	case n < 126:
		hdr = append(hdr, byte(n))
	case n < 65536:
		hdr = append(hdr, 126, byte(n>>8), byte(n))
	default:
		hdr = append(hdr, 127,
			byte(n>>56), byte(n>>48), byte(n>>40), byte(n>>32),
			byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
	}
	if _, err := w.Write(hdr); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

// drainClientFrames reads and discards client frames until the client closes
// or errors, so the write loop notices a dead subscriber. Control frames are
// answered minimally: a close frame ends the drain.
func drainClientFrames(conn net.Conn) {
	defer conn.Close()
	hdr := make([]byte, 2)
	for {
		if _, err := io.ReadFull(conn, hdr); err != nil {
			return
		}
		opcode := hdr[0] & 0x0F
		masked := hdr[1]&0x80 != 0
		n := int(hdr[1] & 0x7F)
		switch n {
		case 126:
			var ext [2]byte
			if _, err := io.ReadFull(conn, ext[:]); err != nil {
				return
			}
			n = int(ext[0])<<8 | int(ext[1])
		case 127:
			var ext [8]byte
			if _, err := io.ReadFull(conn, ext[:]); err != nil {
				return
			}
			n = int(uint64(ext[0])<<56 | uint64(ext[1])<<48 | uint64(ext[2])<<40 | uint64(ext[3])<<32 |
				uint64(ext[4])<<24 | uint64(ext[5])<<16 | uint64(ext[6])<<8 | uint64(ext[7]))
			if n < 0 {
				return
			}
		}
		var mask [4]byte
		if masked {
			if _, err := io.ReadFull(conn, mask[:]); err != nil {
				return
			}
		}
		if _, err := io.CopyN(io.Discard, conn, int64(n)); err != nil {
			return
		}
		if opcode == 0x8 { // close
			return
		}
	}
}
