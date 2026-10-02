package succession

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

func testState() *model.State {
	s := model.NewState()
	s.Organizations[1] = &model.Organization{
		ID: 1, Name: "Test Clan", LeaderID: 1,
		MemberIDs: []int{1, 2, 3},
	}
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Dead Leader", IsAlive: false, HeirID: -1}
	s.Leaders[2] = &model.Leader{ID: 2, Name: "Eldest", IsAlive: true, Age: 40}
	s.Leaders[3] = &model.Leader{ID: 3, Name: "Youngest", IsAlive: true, Age: 25}
	return s
}

// runSuccession ticks the engine with only the succession system and returns
// the clan's leader afterwards. This verifies the applied outcome, not just
// that a write was staged.
func runSuccession(t *testing.T, s *model.State) int {
	t.Helper()
	engine := sim.NewEngine(testCfg(t), cause.NewLog(100), 1, []sim.System{System()})
	if err := engine.Tick(s); err != nil {
		t.Fatalf("tick: %v", err)
	}
	return s.Organizations[1].LeaderID
}

// testCfg loads the shipped balance file.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// Task 34: Designated heir inherits.
func TestDesignatedHeirInherits(t *testing.T) {
	s := testState()
	s.Leaders[1].HeirID = 3
	if got := runSuccession(t, s); got != 3 {
		t.Errorf("designated heir should inherit: got leader %d, want 3", got)
	}
}

// Task 35: Eldest fallback when no heir designated.
func TestEldestFallbackWhenNoHeir(t *testing.T) {
	s := testState()
	if got := runSuccession(t, s); got != 2 {
		t.Errorf("eldest should inherit when no heir designated: got leader %d, want 2", got)
	}
}

// Task 36: Invalid designated heir falls back to eldest.
func TestInvalidHeirFallsBackToEldest(t *testing.T) {
	s := testState()
	s.Leaders[1].HeirID = 999
	if got := runSuccession(t, s); got != 2 {
		t.Errorf("invalid heir should fall back to eldest: got leader %d, want 2", got)
	}
}

// Task 37: Dead designated heir falls back to eldest.
func TestDeadHeirFallsBackToEldest(t *testing.T) {
	s := testState()
	s.Leaders[1].HeirID = 3
	s.Leaders[3].IsAlive = false
	if got := runSuccession(t, s); got != 2 {
		t.Errorf("dead heir should fall back to eldest: got leader %d, want 2", got)
	}
}

// Task 38: Clan dissolves with no valid heirs.
func TestClanDissolvesWithNoHeirs(t *testing.T) {
	s := testState()
	s.Leaders[2].IsAlive = false
	s.Leaders[3].IsAlive = false
	engine := sim.NewEngine(testCfg(t), cause.NewLog(100), 1, []sim.System{System()})
	if err := engine.Tick(s); err != nil {
		t.Fatalf("tick: %v", err)
	}
	// Dissolution deletes the organization; the leader write of -1 is the
	// cause-log record, but the entity itself is gone.
	if _, ok := s.Organizations[1]; ok {
		t.Errorf("clan should dissolve with no heirs: organization still exists with leader %d",
			s.Organizations[1].LeaderID)
	}
}
