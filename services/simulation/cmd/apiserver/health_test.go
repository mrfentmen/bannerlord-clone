package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHealthEndpoint invokes the registered /health handler through the real
// route table and verifies its response. The old version hand-wrote a 200
// without touching any handler, so it passed even if /health was unregistered
// or broken.
func TestHealthEndpoint(t *testing.T) {
	s := &Server{}
	mux := s.routes()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /health: expected 200, got %d", resp.StatusCode)
	}
	body := strings.TrimSpace(w.Body.String())
	if body != `{"ok":true}` {
		t.Errorf("GET /health: unexpected body %q, want %q", body, `{"ok":true}`)
	}
}

// TestHealthRegistered verifies /health is in the route table at all: an
// unregistered path would 404 through the mux.
func TestHealthRegistered(t *testing.T) {
	s := &Server{}
	mux := s.routes()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("/health is not registered in the route table")
	}
}
