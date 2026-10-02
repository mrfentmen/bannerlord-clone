package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"mbclone/simulation/internal/model"
)

// TestExportSnapshotForTsDecoder builds a real snapshot from a live world and
// writes it to a file the TypeScript decoder test consumes. This is the
// cross-language contract test: the Go shape must pass the TS validator.
func TestExportSnapshotForTsDecoder(t *testing.T) {
	st := fogWorld()
	st.Villages[1] = &model.Village{ID: 1, Name: "Millham", SideID: 1,
		Population: 500, X: 10, Y: 10, LastSeenTick: -1}
	// A notification to exercise that block.
	st.Notify(40, "battle", 1, 2, 100, "The Reach defeated The Marches near Millbrook")
	s := fogServer(t, st)

	snap := buildSnapshot(s)
	data, err := json.Marshal(snap)
	if err != nil {
		t.Fatalf("marshal snapshot: %v", err)
	}

	// Write to the client test fixtures dir.
	outDir := filepath.Join("..", "..", "..", "..", "clients", "campaign", "src", "data", "__fixtures__")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	outPath := filepath.Join(outDir, "go-snapshot.json")
	if err := os.WriteFile(outPath, data, 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	t.Logf("wrote %d bytes to %s", len(data), outPath)
}
