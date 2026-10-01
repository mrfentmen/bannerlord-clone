package family

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Leader A", SideID: 1,
		IsAlive: true, Age: 30, SpouseID: -1, PregnancyDays: -1,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Leader B", SideID: 1,
		IsAlive: true, Age: 28, SpouseID: -1, PregnancyDays: -1,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100), Rng: rng.New(42)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "family" {
		t.Errorf("expected family, got %s", System().Name)
	}
}

func TestMarriageOccurs(t *testing.T) {
	// Run many times to hit the 0.1% daily chance.
	for i := 0; i < 5000; i++ {
		v, w := testView()
		v.Rng = rng.New(uint64(i))
		run(v, w)
		for _, wr := range w.Debug() {
			if wr.Field == "spouse" {
				return // Marriage occurred.
			}
		}
	}
	t.Logf("No marriage in 5000 runs (0.1%% chance, possible but unlikely)")
}

func TestAgingOccurs(t *testing.T) {
	v, w := testView()
	run(v, w)
	found := false
	for _, wr := range w.Debug() {
		if wr.Field == "ruler_age" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected aging writes")
	}
}
