package main

import (
	"encoding/json"
	"testing"
	"time"
)

// TestWebSocketFlow verifies the tick broadcast flow: a registered subscriber
// receives a well-formed tick frame when broadcastTick fires.
func TestWebSocketFlow(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)

	// Register a subscriber like handleWS does.
	ch := make(chan []byte, 16)
	s.registerWS(ch)
	defer s.unregisterWS(ch)

	// Fire a tick frame.
	s.broadcastTick()

	select {
	case msg := <-ch:
		var frame map[string]any
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("frame is not JSON: %v", err)
		}
		if frame["type"] != "tick" {
			t.Errorf("frame type = %v, want tick", frame["type"])
		}
		if _, ok := frame["tick"]; !ok {
			t.Error("frame missing tick")
		}
		if _, ok := frame["day"]; !ok {
			t.Error("frame missing day")
		}
		if _, ok := frame["fog"]; !ok {
			t.Error("frame missing fog")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no tick frame received within 2s")
	}
}

// TestWebSocketUnregister verifies unregistered subscribers stop receiving frames.
func TestWebSocketUnregister(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)

	ch := make(chan []byte, 16)
	s.registerWS(ch)
	s.unregisterWS(ch)

	s.broadcastTick()

	// The channel is closed on unregister; a receive yields zero value with ok=false.
	select {
	case msg, ok := <-ch:
		if ok {
			t.Errorf("unregistered subscriber received frame: %s", string(msg))
		}
		// ok=false means closed: correct.
	case <-time.After(100 * time.Millisecond):
		t.Error("channel not closed after unregister")
	}
}
