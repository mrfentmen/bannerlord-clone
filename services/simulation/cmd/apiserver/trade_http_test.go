package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestTradeEndpoint verifies /v1/trade queues a trade order through the real
// route table.
func TestTradeEndpoint(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	body, _ := json.Marshal(map[string]any{"townId": 100, "good": "food", "amount": 10})
	req := httptest.NewRequest("POST", "/v1/trade", bytes.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/trade: expected 200, got %d", w.Code)
	}
	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["accepted"] != true {
		t.Errorf("accepted = %v, want true", resp["accepted"])
	}
}

// TestTradeBadRequest verifies malformed bodies are rejected.
func TestTradeBadRequest(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	req := httptest.NewRequest("POST", "/v1/trade", bytes.NewReader([]byte("not json")))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}
