package kingdomcrime

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "Side A", Treasury: 1000}
	s.Towns[1] = &model.Town{ID: 1, Name: "Crime Town", HolderSide: 1, Crime: 1.0, Garrison: 50}
	s.Towns[2] = &model.Town{ID: 2, Name: "Quiet Town", HolderSide: 1, Crime: 0, Garrison: 50}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "kingdomcrime" {
		t.Errorf("expected kingdomcrime, got %s", System().Name)
	}
}

func TestEnforcementCost(t *testing.T) {
	v, w := testView()
	run(v, w)
	writes := w.Debug()
	found := false
	for _, wr := range writes {
		if wr.Kind == model.KindSide && wr.Field == "side_treasury" {
			found = true
		}
	}
	if !found {
		t.Error("expected treasury enforcement cost")
	}
}

func TestGarrisonBoost(t *testing.T) {
	v, w := testView()
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindTown && wr.Entity == 1 && wr.Field == "garrison" {
			found = true
		}
	}
	if !found {
		t.Error("expected garrison boost in crime town")
	}
}

func TestNoCrimeNoWrites(t *testing.T) {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "Side A", Treasury: 1000}
	s.Towns[1] = &model.Town{ID: 1, Name: "Quiet", HolderSide: 1, Crime: 0}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	w := sim.NewWriteSet()
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Error("no crime should produce no writes")
	}
}

func TestLawlessPenalty(t *testing.T) {
	v, w := testView()
	// Crime 1.0 < threshold 2.0, so no lawless penalty yet.
	// Add more crime to cross threshold.
	v.State.Towns[2].Crime = 1.5
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindSide && wr.Field == "relation_score" {
			found = true
		}
	}
	if !found {
		t.Error("expected lawless relation penalty")
	}
}
