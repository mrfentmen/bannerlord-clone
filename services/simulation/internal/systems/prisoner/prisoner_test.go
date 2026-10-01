package prisoner

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Parties[1] = &model.Party{
		ID: 1, SideID: 1, Troops: 100, Food: 50,
		Prisoners: 10, PrisonerConformity: 0.0,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "prisoner" {
		t.Errorf("expected prisoner, got %s", System().Name)
	}
}

func TestConformityGrows(t *testing.T) {
	v, w := testView()
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Field == "prisoner_conformity" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected prisoner_conformity write")
	}
}

func TestNoPrisonersNoWrites(t *testing.T) {
	v, w := testView()
	v.State.Parties[1].Prisoners = 0
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no writes when no prisoners")
	}
}
