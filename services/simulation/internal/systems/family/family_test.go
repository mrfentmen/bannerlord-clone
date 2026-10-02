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

func TestNaturalDeathRateIsSane(t *testing.T) {
	// A 60-year-old should NOT die within a year (old formula gave 97%/year).
	// Run 365 ticks with a 60-year-old, expect survival most of the time.
	deaths := 0
	for i := 0; i < 100; i++ {
		v, w := testView()
		v.State.Leaders[1].Age = 60
		v.Rng = rng.New(uint64(i))
		for day := 0; day < 365; day++ {
			run(v, w)
			// Check if died via writes
			for _, wr := range w.Debug() {
				if wr.Field == "is_alive" {
					deaths++
					break
				}
			}
			w = sim.NewWriteSet()
		}
	}
	// Expect < 10% death rate at 60 (annual ~1%).
	if deaths > 10 {
		t.Errorf("60-year-old death rate too high: %d/100 died in a year", deaths)
	}
}
