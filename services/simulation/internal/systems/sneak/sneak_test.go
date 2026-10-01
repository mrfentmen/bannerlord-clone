package sneak

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	// Two sides at war.
	s.Sides[1] = &model.Side{ID: 1, Name: "Side A"}
	s.Sides[2] = &model.Side{ID: 2, Name: "Side B"}
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, EndTick: -1} // active war

	s.Towns[1] = &model.Town{
		ID: 1, Name: "Hostile Town",
		HolderSide: 2, Garrison: 50,
		X: 100, Y: 100,
	}
	s.Parties[1] = &model.Party{
		ID: 1, SideID: 1, Troops: 20, Morale: 0.5,
		DestTown: 1, X: 90, Y: 90, // close to town (100,100)
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "sneak" {
		t.Errorf("expected sneak, got %s", System().Name)
	}
}

func TestSneakChance(t *testing.T) {
	// Small party, no garrison: high chance.
	if c := sneakChance(10, 0); c < 0.7 {
		t.Errorf("expected high chance for small party, got %f", c)
	}
	// Large party: low chance.
	if c := sneakChance(100, 0); c > 0.35 {
		t.Errorf("expected low chance for large party, got %f", c)
	}
	// Floors at min.
	if c := sneakChance(1000, 1000); c != minSneakChance {
		t.Errorf("expected floor %f, got %f", minSneakChance, c)
	}
}

func TestSneakAttempt(t *testing.T) {
	v, w := testView()
	run(v, w)
	// Either success (morale up) or failure (morale down + dest cleared).
	// With seed 42 and these params, we just verify writes happened.
	writes := w.Debug()
	if len(writes) == 0 {
		t.Error("expected sneak attempt writes")
	}
}

func TestTooBigToSneak(t *testing.T) {
	v, w := testView()
	v.State.Parties[1].Troops = 200 // over maxSneakSize
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Error("large party should not attempt sneak")
	}
}

func TestFriendlyTownNoSneak(t *testing.T) {
	v, w := testView()
	v.State.Towns[1].HolderSide = 1 // same side as party
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Error("friendly town should not trigger sneak")
	}
}

func TestNoDestinationNoSneak(t *testing.T) {
	v, w := testView()
	v.State.Parties[1].DestTown = -1
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Error("no destination should not trigger sneak")
	}
}
