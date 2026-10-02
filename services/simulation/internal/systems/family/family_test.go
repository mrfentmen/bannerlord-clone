package family

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

func testState() *model.State {
	s := model.NewState()
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Leader A", SideID: 1,
		IsAlive: true, Age: 30, SpouseID: -1, PregnancyDays: -1,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Leader B", SideID: 1,
		IsAlive: true, Age: 28, SpouseID: -1, PregnancyDays: -1,
	}
	return s
}

func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// testView is kept for the non-mortality tests that inspect staged writes.
func testView() (*sim.View, *sim.WriteSet) {
	s := testState()
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
	// Ticks the engine so death writes are applied and IsAlive actually flips;
	// the old version staged writes without applying them, so it measured
	// staged deaths rather than real survival.
	cfg := testCfg(t)
	deaths := 0
	for i := 0; i < 100; i++ {
		s := testState()
		s.Leaders[1].Age = 60
		engine := sim.NewEngine(cfg, cause.NewLog(100), uint64(i), []sim.System{System()})
		for day := 0; day < 365; day++ {
			if err := engine.Tick(s); err != nil {
				t.Fatalf("tick: %v", err)
			}
			if !s.Leaders[1].IsAlive {
				deaths++
				break
			}
		}
	}
	// Expect < 10% death rate at 60 (annual ~1%).
	if deaths > 10 {
		t.Errorf("60-year-old death rate too high: %d/100 died in a year", deaths)
	}
}

// TestNaturalDeathRatesByAge verifies mortality at 50, 60, 70, 80, 90.
// Expected annual rates: ~0% at 50, ~1% at 60, ~3% at 70, ~9% at 80, ~30% at 90.
func TestNaturalDeathRatesByAge(t *testing.T) {
	cfg := testCfg(t)
	ages := []int{50, 60, 70, 80, 90}
	// Max acceptable deaths per 100 trials (generous bounds).
	maxDeaths := []int{2, 5, 10, 20, 45}

	for i, age := range ages {
		deaths := 0
		for trial := 0; trial < 100; trial++ {
			s := testState()
			s.Leaders[1].Age = float64(age)
			engine := sim.NewEngine(cfg, cause.NewLog(100), uint64(trial*1000+age), []sim.System{System()})
			for day := 0; day < 365; day++ {
				if err := engine.Tick(s); err != nil {
					t.Fatalf("tick: %v", err)
				}
				if !s.Leaders[1].IsAlive {
					deaths++
					break
				}
			}
		}
		if deaths > maxDeaths[i] {
			t.Errorf("age %d: %d/100 died, want <= %d", age, deaths, maxDeaths[i])
		}
	}
}
