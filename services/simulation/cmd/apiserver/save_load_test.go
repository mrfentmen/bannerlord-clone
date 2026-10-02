package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestSaveLoadPathSanitization verifies directory traversal is blocked.
func TestSaveLoadPathSanitization(t *testing.T) {
	s := &Server{}
	// Test save with traversal attempt
	reqBody, _ := json.Marshal(map[string]string{"path": "../../../etc/passwd"})
	req := httptest.NewRequest("POST", "/v1/save", bytes.NewReader(reqBody))
	w := httptest.NewRecorder()
	s.handleSave(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for traversal path, got %d", w.Code)
	}
}
