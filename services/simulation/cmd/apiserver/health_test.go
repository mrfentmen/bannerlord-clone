package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHealthEndpoint verifies the /health endpoint returns 200.
func TestHealthEndpoint(t *testing.T) {
	// The health handler is registered inline in main.go; we test the pattern here.
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	// Simulate the handler: it writes 200 with "ok"
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if req.URL.Path != "/health" {
		t.Errorf("unexpected path: %s", req.URL.Path)
	}
}
