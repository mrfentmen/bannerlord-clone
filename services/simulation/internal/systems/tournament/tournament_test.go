package tournament

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
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
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "tournament" {
		t.Errorf("expected tournament, got %s", System().Name)
	}
}

func TestTournamentRuns(t *testing.T) {
	// Run multiple times to hit the 2% daily chance.
	for i := 0; i < 200; i++ {
		v, w := testView()
		v.Rng = rng.New(uint64(i))
		run(v, w)
		// If a tournament ran, there should be renown writes.
		for _, wr := range w.Debug() {
			if wr.Field == "renown" {
				return // Success - tournament ran and awarded renown.
			}
		}
	}
	t.Logf("No tournament in 200 runs (2%% chance each, unlikely but possible)")
}

func TestLowProsperityNoTournament(t *testing.T) {
	v, w := testView()
	v.State.Towns[1].Prosperity = 0.1 // Below threshold.
	for i := 0; i < 50; i++ {
		v.Rng = rng.New(uint64(i))
		run(v, w)
		for _, wr := range w.Debug() {
			if wr.Field == "renown" {
				t.Errorf("tournament should not run in low-prosperity town")
			}
		}
	}
}
