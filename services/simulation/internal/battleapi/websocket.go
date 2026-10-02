package battleapi

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
	"time"

	"mbclone/simulation/internal/battle"
)

// wsGUID is the WebSocket handshake magic from RFC 6455.
const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// streamHz is the snapshot rate the plan requires.
const streamHz = 10

// handleStream upgrades to WebSocket and pushes tick snapshots and events at
// 10 Hz. A client that subscribes mid-battle gets the full current state
// first, then deltas: every message carries the events since the previous
// one, keyed by their sequence numbers, so nothing is skipped or repeated.
//
// This is a minimal RFC 6455 server: handshake plus unmasked server-to-client
// text frames, with a read loop that drains client frames so a close is
// noticed. No external dependency; the sim module keeps zero dependencies.
func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	e, apiErr := s.lookup(q.Get("battle_id"), q.Get("campaign_session_id"))
	if apiErr != nil {
		writeAPIError(w, apiErr)
		return
	}
	if !isWSUpgrade(r) {
		writeAPIError(w, &apiError{http.StatusBadRequest, "not_websocket",
			"/v1/battle/stream requires a WebSocket upgrade"})
		return
	}
	conn, rw, err := hijack(w)
	if err != nil {
		writeAPIError(w, &apiError{http.StatusInternalServerError, "hijack", err.Error()})
		return
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	accept := wsAccept(key)
	_, _ = fmt.Fprintf(rw, "HTTP/1.1 101 Switching Protocols\r\n"+
		"Upgrade: websocket\r\n"+
		"Connection: Upgrade\r\n"+
		"Sec-WebSocket-Accept: %s\r\n\r\n", accept)
	_ = rw.Flush()

	done := make(chan struct{})
	go func() {
		defer close(done)
		drainClientFrames(conn)
	}()
	defer conn.Close()

	t := time.NewTicker(time.Second / streamHz)
	defer t.Stop()
	var lastSeq = -1
	// First message is the full state, so a mid-battle subscriber starts
	// from now, not from the battle's first tick.
	if err := s.writeStreamFrame(conn, e, &lastSeq, true); err != nil {
		return
	}
	for {
		select {
		case <-done:
			return
		case <-t.C:
			if err := s.writeStreamFrame(conn, e, &lastSeq, false); err != nil {
				return
			}
			e.mu.Lock()
			resolved := e.session.Phase() == battle.PhaseResolved
			e.mu.Unlock()
			if resolved {
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

// writeStreamFrame sends one snapshot. When full is true the message carries
// the whole state; otherwise it carries the tick, the phase, and only the
// events since the last message.
// writeStreamFrame builds one stream message from a consistent snapshot of a
// battle.
//
// It holds the BATTLE's lock, not the server's. A stream is a reader: it is open
// for the whole fight and reads ten times a second, so under the old single server
// mutex a resolve would have stopped this battle's own stream as well as every
// other request — which is the opposite of what a stream is for.
func (s *Server) writeStreamFrame(conn net.Conn, e *entry, lastSeq *int, full bool) error {
	e.mu.Lock()
	sess := e.session
	var evs []battle.Event
	for _, ev := range sess.RecentEvents(50) {
		if ev.Seq > *lastSeq {
			evs = append(evs, ev)
		}
	}
	if len(evs) > 0 {
		*lastSeq = evs[len(evs)-1].Seq
	}
	msg := map[string]any{
		"type":           "tick",
		"battle_id":      sess.ID(),
		"phase":          sess.Phase().String(),
		"tick":           sess.Tick(),
		"events":         eventDTOs(evs),
		"events_dropped": sess.EventsDropped(),
	}
	if full {
		msg["state"] = s.stateOf(e)
	}
	if sess.Decided() {
		o := sess.Outcome()
		msg["type"] = "resolved"
		msg["outcome"] = map[string]string{"kind": o.Kind.String(), "reason": o.Reason.String()}
	}
	e.mu.Unlock()

	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return writeTextFrame(conn, payload)
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
