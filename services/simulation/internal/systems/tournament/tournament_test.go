package tournament

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// testCfg loads the shipped balance file, so an assertion about a configurable
// constant checks the wiring and the balance file rather than a copy of the
// number restated here.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/internal/systems/tournament -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

func testState() *model.State {
	s := model.NewState()
	s.Towns[1] = &model.Town{
		ID: 1, Name: "Arena Town", Prosperity: 0.8, Money: 10000,
	}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Fighter A", SideID: 1, TownID: 1,
		IsAlive: true, Renown: 0,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Fighter B", SideID: 1, TownID: 1,
		IsAlive: true, Renown: 0,
	}
	// The XP prize goes to the winner's party, so the leaders need parties.
	// (The old test had none, which is why it never saw XP in 500 runs.)
	s.Parties[1] = &model.Party{ID: 1, LeaderID: 1, Troops: 100}
	s.Parties[2] = &model.Party{ID: 2, LeaderID: 2, Troops: 100}
	return s
}

func TestSystemName(t *testing.T) {
	if System().Name != "tournament" {
		t.Errorf("expected tournament, got %s", System().Name)
	}
}

// runTournament ticks the engine with only the tournament system until a
// tournament fires or seeds run out. It returns the winning party's XP gain,
// or -1 if no tournament fired.
func runTournament(t *testing.T, cfg *config.Config, seeds int) (float64, bool) {
	t.Helper()
	for seed := 0; seed < seeds; seed++ {
		s := testState()
		engine := sim.NewEngine(cfg, cause.NewLog(100), uint64(seed), []sim.System{System()})
		if err := engine.Tick(s); err != nil {
			t.Fatalf("tick: %v", err)
		}
		for _, pid := range []int{1, 2} {
			if xp := s.Parties[pid].TroopXP; xp > 0 {
				return xp, true
			}
		}
		// Also check renown: a tournament may fire without a party match.
		for _, lid := range []int{1, 2} {
			if s.Leaders[lid].Renown > 0 {
				// Tournament ran but XP went nowhere; that is itself a failure
				// of the XP path, reported by the XP test.
				return -1, true
			}
		}
	}
	return -1, false
}

func TestTournamentRuns(t *testing.T) {
	cfg := testCfg(t)
	_, fired := runTournament(t, cfg, 500)
	if !fired {
		t.Fatalf("no tournament in 500 seeds at 2%% daily chance (p ~ 0.004%%); the chance gate is broken")
	}
}

func TestLowProsperityNoTournament(t *testing.T) {
	cfg := testCfg(t)
	for seed := 0; seed < 50; seed++ {
		s := testState()
		s.Towns[1].Prosperity = 0.1 // Below threshold.
		engine := sim.NewEngine(cfg, cause.NewLog(100), uint64(seed), []sim.System{System()})
		if err := engine.Tick(s); err != nil {
			t.Fatalf("tick: %v", err)
		}
		for _, lid := range []int{1, 2} {
			if s.Leaders[lid].Renown > 0 {
				t.Fatalf("tournament ran in low-prosperity town (seed %d)", seed)
			}
		}
	}
}

// TestTournamentXPAwarded verifies the winner's party gains exactly the
// configured XP. It fails if no tournament fires, and fails if the amount
// differs from balance.toml.
func TestTournamentXPAwarded(t *testing.T) {
	cfg := testCfg(t)
	want := cfg.RulerAI.TournamentWinnerXP
	if want <= 0 {
		t.Fatalf("tournament_winner_xp misconfigured: %v", want)
	}
	xp, fired := runTournament(t, cfg, 500)
	if !fired {
		t.Fatalf("no tournament in 500 seeds; cannot verify XP award")
	}
	if xp < 0 {
		t.Fatalf("tournament fired but no party gained XP; the XP path is broken")
	}
	if xp != want {
		t.Errorf("tournament XP = %v, want configured tournament_winner_xp = %v", xp, want)
	}
}
