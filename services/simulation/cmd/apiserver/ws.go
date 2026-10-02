package main

import (
	"encoding/json"
	"net/http"
	"sync"
)

// Minimal WebSocket handler: the client subscribes to tick updates.
// We implement a tiny WS server without external deps: accept the upgrade
// and push JSON tick frames. This covers the client's subscribeTicks path.

var wsClients = struct {
	sync.Mutex
	conns []http.ResponseWriter
}{}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	// Very small WS handshake: only support the client's expected upgrade.
	if r.Header.Get("Upgrade") != "websocket" {
		http.Error(w, "websocket required", http.StatusBadRequest)
		return
	}
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack not supported", http.StatusInternalServerError)
		return
	}
	conn, rw, err := hijacker.Hijack()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Accept the upgrade.
	key := r.Header.Get("Sec-WebSocket-Key")
	accept := wsAcceptKey(key)
	rw.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	rw.WriteString("Upgrade: websocket\r\nConnection: Upgrade\r\n")
	rw.WriteString("Sec-WebSocket-Accept: " + accept + "\r\n\r\n")
	rw.Flush()

	// Register and hold the connection open; broadcastTick writes frames.
	ch := make(chan []byte, 16)
	s.registerWS(ch)
	defer s.unregisterWS(ch)
	defer conn.Close()

	for msg := range ch {
		if err := wsWriteText(conn, msg); err != nil {
			return
		}
	}
}

// --- WS connection registry on Server ---

func (s *Server) registerWS(ch chan []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.wsSubs == nil {
		s.wsSubs = make(map[chan []byte]struct{})
	}
	s.wsSubs[ch] = struct{}{}
}

func (s *Server) unregisterWS(ch chan []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.wsSubs, ch)
	close(ch)
}

// tickFrame is one push to a tick subscriber, as `TickUpdate` in
// clients/campaign/src/data/types.ts.
//
// Typed rather than assembled as a string, for the same reason `fogBlock` is: this frame
// now carries a nested object with lists in it, and string concatenation is how a fog
// block ends up half-quoted on the wire with no error anywhere.
type tickFrame struct {
	Type string `json:"type"`
	// The simulation tick, which is `state.Tick` and nothing else.
	//
	// It used to be a count of frames this server had pushed since startup, which is a
	// different number: it starts at zero on every restart and drifts from the world's
	// clock, and it was in a different unit from every `lastSeenTick` on the wire. The
	// client's validator already refused these frames for having no `day` at all, so the
	// field was never usable for anything; it now means what its name says.
	Tick int64 `json:"tick"`
	// The in-game day, in the same unit and the same place as `snapshot.day`. Required:
	// the client refuses a frame without it, so a tick frame without it is a frame that
	// never reaches the screen.
	Day int `json:"day"`
	// A complete fog block, rebuilt per frame rather than as a delta.
	//
	// Complete, so the client's merge is a replacement and cannot half-apply: a sparse
	// fog block would need every client to know which of ten fields this particular
	// frame happened to carry. Rebuilding costs one pass over the towns, and the
	// subscriber queue drops frames rather than growing, so a client that cannot keep up
	// sees the next whole reading instead of a torn one.
	Fog *fogBlock `json:"fog"`
	// Notifications fired since the last frame, drained from the sim's queue.
	// The client appends these to its notification tray.
	Notifications []any `json:"notifications,omitempty"`
}

func (s *Server) broadcastTick() {
	s.mu.Lock()
	// Subscribers are collected first and the frame built second, so a server nobody has
	// connected to does not pay for the fog pass on every tick.
	subs := make([]chan []byte, 0, len(s.wsSubs))
	for ch := range s.wsSubs {
		subs = append(subs, ch)
	}
	if len(subs) == 0 {
		s.mu.Unlock()
		return
	}
	side, visible, known := fogViewFor(s)
	fog := buildFog(s, side, visible, known)
	// Notifications are drained here (under the write lock) so each one is
	// delivered exactly once, in the first tick frame after it fires.
	notifications := buildNotifications(s, side)
	frame := tickFrame{
		Type:          "tick",
		Tick:          int64(s.state.Tick),
		Day:           s.state.Tick % 365,
		Fog:           &fog,
		Notifications: notifications,
	}
	s.mu.Unlock()

	msg, err := json.Marshal(frame)
	if err != nil {
		// Unreachable for this struct, and dropping the frame is the right answer if it
		// ever is not: a malformed frame is refused by the client anyway.
		return
	}
	for _, ch := range subs {
		select {
		case ch <- msg:
		default:
		}
	}
}
