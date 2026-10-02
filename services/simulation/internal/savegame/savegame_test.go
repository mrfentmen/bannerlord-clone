package savegame

import (
	"os"
	"path/filepath"
	"testing"

	"mbclone/simulation/internal/model"
)

func testState() *model.State {
	s := model.NewState()
	s.Year = 2026
	s.Tick = 1234
	s.Towns[1] = &model.Town{ID: 1, Name: "Test Town", Population: 5000, X: 10, Y: 20}
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Test Leader", IsAlive: true, Age: 35}
	s.Parties[1] = &model.Party{ID: 1, LeaderID: 1, Troops: 100, X: 10, Y: 20}
	s.Relations[model.Pair{A: 1, B: 2}] = 0.5
	return s
}

func TestSaveLoadRoundTrip(t *testing.T) {
	s := testState()
	path := filepath.Join(t.TempDir(), "save.json")

	if err := Save(s, nil, nil, nil, nil, nil, path); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, _, _, _, _, _, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded.Tick != s.Tick {
		t.Errorf("Tick = %d, want %d", loaded.Tick, s.Tick)
	}
	if loaded.Year != s.Year {
		t.Errorf("Year = %v, want %v", loaded.Year, s.Year)
	}
	if len(loaded.Towns) != 1 {
		t.Errorf("Towns = %d, want 1", len(loaded.Towns))
	}
	if loaded.Towns[1].Name != "Test Town" {
		t.Errorf("Town name = %q, want %q", loaded.Towns[1].Name, "Test Town")
	}
	if loaded.Towns[1].Population != 5000 {
		t.Errorf("Town pop = %v, want 5000", loaded.Towns[1].Population)
	}
	if len(loaded.Leaders) != 1 {
		t.Errorf("Leaders = %d, want 1", len(loaded.Leaders))
	}
	if !loaded.Leaders[1].IsAlive {
		t.Error("Leader should be alive")
	}
	if len(loaded.Parties) != 1 {
		t.Errorf("Parties = %d, want 1", len(loaded.Parties))
	}
	if loaded.Parties[1].Troops != 100 {
		t.Errorf("Party troops = %v, want 100", loaded.Parties[1].Troops)
	}
	if got := loaded.Relations[model.Pair{A: 1, B: 2}]; got != 0.5 {
		t.Errorf("Relation = %v, want 0.5", got)
	}
}

func TestLoadBadVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "save.json")
	os.WriteFile(path, []byte(`{"version": 999, "tick": 0, "year": 0, "state": {}}`), 0644)
	if _, _, _, _, _, _, err := Load(path); err == nil {
		t.Error("expected error for bad version, got nil")
	}
}

func TestLoadMissingFile(t *testing.T) {
	if _, _, _, _, _, _, err := Load("/nonexistent/save.json"); err == nil {
		t.Error("expected error for missing file, got nil")
	}
}
