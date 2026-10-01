package rebellion

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "Faction A"}
	s.Towns[1] = &model.Town{
		ID: 1, Name: "Unhappy Town",
		HolderSide: 1, Loyalty: 0.1, Garrison: 100,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "rebellion" {
		t.Errorf("expected rebellion, got %s", System().Name)
	}
}

func TestNoRebellionWhenLoyal(t *testing.T) {
	v, w := testView()
	v.State.Towns[1].Loyalty = 0.8
	run(v, w)
	// No writes expected for a loyal town.
	if len(w.Debug()) != 0 {
		t.Errorf("expected no rebellion for loyal town")
	}
}

func TestRebellionSetsIndependent(t *testing.T) {
	// Run multiple times to hit the 25% chance.
	rebelled := false
	for i := 0; i < 20; i++ {
		v, w := testView()
		v.Rng = rng.New(uint64(i))
		run(v, w)
		for _, wr := range w.Debug() {
			if wr.Field == "holder_side" {
				rebelled = true
				break
			}
		}
		if rebelled {
			break
		}
	}
	if !rebelled {
		t.Errorf("expected rebellion to occur within 20 attempts at 25 percent per day")
	}
}
