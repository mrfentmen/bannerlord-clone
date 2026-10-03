package director

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

// TestAssessmentRecorded verifies the director writes a world assessment
// event on its cadence.
func TestAssessmentRecorded(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	// Speed up: assess every day.
	cfg.Director.AssessEveryDays = 1
	cfg.Director.StagnationAssessments = 100 // never alert in this test

	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Population: 1000, Unrest: 0.1, FoodDays: 30}
	s.Tick = 1
	s.Year = 1

	log := cause.NewLog(1000)
	e := sim.NewEngine(cfg, log, 1, []sim.System{System()})
	if err := e.Tick(s); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, ev := range s.Events {
		if ev.Kind == model.EventWorldAssessment {
			found = true
			if ev.Note == "" {
				t.Error("assessment has empty note")
			}
		}
	}
	if !found {
		t.Fatal("director did not record a world assessment")
	}
}

// TestStagnationAlert verifies the director fires a stagnation alert after
// enough consecutive quiet assessments.
func TestStagnationAlert(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	cfg.Director.AssessEveryDays = 1
	cfg.Director.StagnationAssessments = 3

	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Population: 1000, Unrest: 0.1, FoodDays: 30}
	s.Tick = 1
	s.Year = 1

	log := cause.NewLog(10000)
	e := sim.NewEngine(cfg, log, 1, []sim.System{System()})
	// Tick 5 times: assessments at 1,2,3,4,5. Stagnation needs 3 consecutive.
	for i := 0; i < 5; i++ {
		s.Tick++
		if err := e.Tick(s); err != nil {
			t.Fatal(err)
		}
	}
	alerts := 0
	for _, ev := range s.Events {
		if ev.Kind == model.EventStagnationAlert {
			alerts++
		}
	}
	if alerts == 0 {
		t.Fatal("director did not fire a stagnation alert for a dead world")
	}
	t.Logf("fired %d stagnation alerts", alerts)
}

// TestNoStagnationAlertWhenActive verifies the director does NOT fire a
// *stagnation* alert when the world has an active war. (A phony-war alert is
// expected if no parties mobilize; that is a different diagnostic.)
func TestNoAlertWhenActive(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	cfg.Director.AssessEveryDays = 1
	cfg.Director.StagnationAssessments = 2

	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Population: 1000, Unrest: 0.1, FoodDays: 30}
	// An active war.
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 0, EndTick: -1}
	s.Tick = 1
	s.Year = 1

	log := cause.NewLog(10000)
	e := sim.NewEngine(cfg, log, 1, []sim.System{System()})
	for i := 0; i < 4; i++ {
		s.Tick++
		if err := e.Tick(s); err != nil {
			t.Fatal(err)
		}
	}
	for _, ev := range s.Events {
		if ev.Kind == model.EventStagnationAlert {
			// A phony-war alert is fine; a pure stagnation alert is not.
			if len(ev.Note) < 9 || ev.Note[:9] != "phony war" {
				t.Fatalf("stagnation alert fired during an active war: %s", ev.Note)
			}
		}
	}
}

// TestAssessVitals verifies the vital-signs computation.
func TestAssessVitals(t *testing.T) {
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatal(err)
	}
	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Population: 1000, Unrest: 0.8, FoodDays: 3}
	s.Towns[2] = &model.Town{ID: 2, Population: 1000, Unrest: 0.2, FoodDays: 30}
	s.Parties[1] = &model.Party{ID: 1, Troops: 50, Activity: model.ActMarching}
	s.Parties[2] = &model.Party{ID: 2, Troops: 30, Activity: model.ActIdle}
	s.Parties[3] = &model.Party{ID: 3, Troops: 10, Activity: model.ActTrading, IsCaravan: true}
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 0, EndTick: -1}

	log := cause.NewLog(1000)
	v := &sim.View{State: s, Log: log, Cfg: cfg, Tick: 1, Rng: rng.New(1)}
	vtl := assess(v)

	if vtl.ActiveWars != 1 {
		t.Errorf("ActiveWars=%d, want 1", vtl.ActiveWars)
	}
	if vtl.MobilizedParties != 2 {
		t.Errorf("MobilizedParties=%d, want 2", vtl.MobilizedParties)
	}
	if vtl.TotalParties != 3 {
		t.Errorf("TotalParties=%d, want 3", vtl.TotalParties)
	}
	if vtl.TownsInRevolt != 1 {
		t.Errorf("TownsInRevolt=%d, want 1", vtl.TownsInRevolt)
	}
	if vtl.TownsStarving != 1 {
		t.Errorf("TownsStarving=%d, want 1", vtl.TownsStarving)
	}
	if vtl.TradeCaravans != 1 {
		t.Errorf("TradeCaravans=%d, want 1", vtl.TradeCaravans)
	}
	if vtl.AvgUnrest != 0.5 {
		t.Errorf("AvgUnrest=%v, want 0.5", vtl.AvgUnrest)
	}
}
