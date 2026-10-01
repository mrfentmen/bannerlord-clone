package main

import (
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

func (s *Server) broadcastTick() {
	s.mu.RLock()
	tick := s.tickCount
	subs := make([]chan []byte, 0, len(s.wsSubs))
	for ch := range s.wsSubs {
		subs = append(subs, ch)
	}
	s.mu.RUnlock()
	if len(subs) == 0 {
		return
	}
	msg := []byte(`{"type":"tick","tick":` + itoa(tick) + `}`)
	for _, ch := range subs {
		select {
		case ch <- msg:
		default:
		}
	}
}
