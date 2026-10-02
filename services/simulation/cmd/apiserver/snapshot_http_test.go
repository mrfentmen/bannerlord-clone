package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mbclone/simulation/internal/model"
)

// TestSnapshotEndpoint verifies /v1/snapshot returns a well-formed snapshot
// through the real route table, with the fields the client requires: towns,
// villages, notifications, and fog.
func TestSnapshotEndpoint(t *testing.T) {
	st := fogWorld()
	// Add a village so the villages block is non-empty.
	st.Villages[1] = &model.Village{ID: 1, Name: "Millham", SideID: 1,
		Population: 500, X: 10, Y: 10, LastSeenTick: -1}
	s := fogServer(t, st)
	mux := s.routes()

	req := httptest.NewRequest("GET", "/v1/snapshot", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/snapshot: expected 200, got %d", resp.StatusCode)
	}

	var snap map[string]any
	if err := json.NewDecoder(w.Body).Decode(&snap); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}

	// The client requires these top-level fields.
	for _, key := range []string{"towns", "villages", "sides", "notifications", "fog", "player", "day"} {
		if _, ok := snap[key]; !ok {
			t.Errorf("snapshot missing %q", key)
		}
	}

	// Villages block is present and shaped.
	villages, ok := snap["villages"].([]any)
	if !ok {
		t.Fatalf("villages is not a list")
	}
	if len(villages) != 1 {
		t.Fatalf("expected 1 village, got %d", len(villages))
	}
	v := villages[0].(map[string]any)
	if v["id"] != "village-1" {
		t.Errorf("village id = %v, want village-1", v["id"])
	}
	for _, key := range []string{"visible", "known", "lastSeenTick"} {
		if _, ok := v[key]; !ok {
			t.Errorf("village missing fog field %q", key)
		}
	}

	// Towns carry access info.
	towns := snap["towns"].([]any)
	if len(towns) == 0 {
		t.Fatal("expected towns in snapshot")
	}
	town := towns[0].(map[string]any)
	if _, ok := town["access"]; !ok {
		t.Error("town missing access block")
	}

	// Notifications is a list (may be empty).
	if _, ok := snap["notifications"].([]any); !ok {
		t.Error("notifications is not a list")
	}
}
