package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestRecruitEndpoint verifies /v1/recruit queues a recruit order through the
// real route table.
func TestRecruitEndpoint(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	body, _ := json.Marshal(map[string]int{"townId": 100, "amount": 5})
	req := httptest.NewRequest("POST", "/v1/recruit", bytes.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/recruit: expected 200, got %d", w.Code)
	}
	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["accepted"] != true {
		t.Errorf("accepted = %v, want true", resp["accepted"])
	}
}

// TestRecruitBadRequest verifies malformed bodies are rejected.
func TestRecruitBadRequest(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	req := httptest.NewRequest("POST", "/v1/recruit", bytes.NewReader([]byte("not json")))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}
