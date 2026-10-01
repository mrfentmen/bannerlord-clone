package hideout

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
		ID: 1, Name: "Crime Town", Crime: 0.8, X: 100, Y: 100,
	}
	s.Towns[2] = &model.Town{
		ID: 2, Name: "Quiet Town", Crime: 0.2, X: 200, Y: 200,
	}
	s.Parties[1] = &model.Party{
		ID: 1, LeaderID: 1, Troops: 100, X: 100, Y: 100,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "hideout" {
		t.Errorf("expected hideout, got %s", System().Name)
	}
}

func TestLowCrimeNoAssault(t *testing.T) {
	v, w := testView()
	// Move party to quiet town.
	v.State.Parties[1].X = 200
	v.State.Parties[1].Y = 200
	// Run many ticks to be sure (assaultChance 0.3).
	for i := 0; i < 20; i++ {
		run(v, w)
	}
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 2 {
			t.Error("low-crime town should not see assaults")
		}
	}
}

func TestHighCrimeAssault(t *testing.T) {
	v, w := testView()
	// Run enough ticks that an assault is near-certain.
	for i := 0; i < 50; i++ {
		run(v, w)
	}
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 1 &&
			(wr.Field == "crime") {
			found = true
		}
	}
	if !found {
		t.Error("expected assault on high-crime town within 50 ticks")
	}
}

func TestNoRulerNoAssault(t *testing.T) {
	v, w := testView()
	v.State.Parties[1].LeaderID = -1 // not a ruler party
	for i := 0; i < 50; i++ {
		run(v, w)
	}
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 1 {
			t.Error("non-ruler party should not assault")
		}
	}
}
