package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestMarchPlanEndpoint verifies /v1/march/plan returns a route plan through
// the real route table.
func TestMarchPlanEndpoint(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	body, _ := json.Marshal(map[string]int{"destinationTownId": 100})
	req := httptest.NewRequest("POST", "/v1/march/plan", bytes.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/march/plan: expected 200, got %d", w.Code)
	}
	var plan map[string]any
	if err := json.NewDecoder(w.Body).Decode(&plan); err != nil {
		t.Fatalf("decode plan: %v", err)
	}
}

// TestMarchCommitEndpoint verifies /v1/march/commit queues a march order.
func TestMarchCommitEndpoint(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	body, _ := json.Marshal(map[string]int{"destinationTownId": 200})
	req := httptest.NewRequest("POST", "/v1/march/commit", bytes.NewReader(body))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /v1/march/commit: expected 200, got %d", w.Code)
	}
}

// TestMarchPlanBadRequest verifies malformed bodies are rejected.
func TestMarchPlanBadRequest(t *testing.T) {
	st := fogWorld()
	s := fogServer(t, st)
	mux := s.routes()

	req := httptest.NewRequest("POST", "/v1/march/plan", bytes.NewReader([]byte("not json")))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", w.Code)
	}
}
