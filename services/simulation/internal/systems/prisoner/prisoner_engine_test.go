package prisoner

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test source")
	}
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	return cfg
}

// TestStarvationThroughEngine verifies prisoner starvation through the real
// engine (not just unit test). A party with prisoners but no food should see
// conformity drop and prisoners die.
func TestStarvationThroughEngine(t *testing.T) {
	s := model.NewState()
	s.Parties[1] = &model.Party{
		ID: 1, SideID: 1, Troops: 100, Food: 0, // No food!
		Prisoners: 20, PrisonerConformity: 0.5,
	}

	// Run through real engine with prisoner system.
	e := sim.NewEngine(testCfg(t), cause.NewLog(1000), 42, []sim.System{System()})
	if err := e.Tick(s); err != nil {
		t.Fatalf("tick: %v", err)
	}

	// Conformity should have dropped.
	if s.Parties[1].PrisonerConformity >= 0.5 {
		t.Errorf("conformity = %v, want < 0.5 (starvation drops conformity)",
			s.Parties[1].PrisonerConformity)
	}

	// Prisoners should have died (5% of 20 = 1).
	if s.Parties[1].Prisoners >= 20 {
		t.Errorf("prisoners = %v, want < 20 (starvation kills prisoners)",
			s.Parties[1].Prisoners)
	}
}
