package siegeengine

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Sieges[1] = &model.Siege{
		ID: 1, AttackerID: 1, TownID: 1, Outcome: model.SiegeOngoing,
		Breach: 0.2,
	}
	s.Parties[1] = &model.Party{ID: 1, Troops: 100}
	s.Set(model.KindParty, 1, "party_metal", 100.0)
	s.Set(model.KindSiege, 1, "breach_progress", 0.2)
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "siegeengine" {
		t.Errorf("expected siegeengine, got %s", System().Name)
	}
}

func TestEnginesDamage(t *testing.T) {
	v, w := testView()
	// Run several ticks; engines should add breach.
	for i := 0; i < 10; i++ {
		run(v, w)
	}
	found := false
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindSiege && wr.Entity == 1 && wr.Field == "breach_progress" {
			found = true
		}
	}
	if !found {
		t.Error("expected breach_progress writes from engines")
	}
}

func TestNoMetalNoEngines(t *testing.T) {
	v, w := testView()
	v.State.Set(model.KindParty, 1, "party_metal", 10.0) // below threshold
	for i := 0; i < 10; i++ {
		run(v, w)
	}
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindSiege {
			t.Error("no metal should mean no engines")
		}
	}
}

func TestNoSiegeNoEngines(t *testing.T) {
	v, w := testView()
	v.State.Sieges[1].Outcome = model.SiegeBreached
	for i := 0; i < 10; i++ {
		run(v, w)
	}
	for _, wr := range w.Debug() {
		if wr.Kind == model.KindSiege {
			t.Error("ended siege should have no engines")
		}
	}
}
