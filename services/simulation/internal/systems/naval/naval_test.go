package naval

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// testView builds two ports: one with surplus, one with deficit.
func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Towns[1] = &model.Town{
		ID:             1,
		Name:           "Port Export",
		IsPort:         true,
		FoodProduction: 1000.0,
		FoodDemand:     400.0,
		FoodStock:      5000.0,
		Money:          1000.0,
	}
	s.Towns[2] = &model.Town{
		ID:             2,
		Name:           "Port Import",
		IsPort:         true,
		FoodProduction: 200.0,
		FoodDemand:     800.0,
		FoodStock:      1000.0,
		Money:          1000.0,
	}
	v := &sim.View{State: s, Log: cause.NewLog(100)}
	return v, sim.NewWriteSet()
}

func TestSystemName(t *testing.T) {
	if System().Name != "naval" {
		t.Errorf("expected name naval, got %s", System().Name)
	}
}

func TestSeaTradeFlows(t *testing.T) {
	v, w := testView()
	run(v, w)
	writes := w.Debug()
	// Expect 4 writes: exporter food_stock + money, importer food_stock + money.
	if len(writes) != 4 {
		t.Fatalf("expected 4 writes, got %d", len(writes))
	}
}

func TestBlockadeStopsTrade(t *testing.T) {
	v, w := testView()
	// Fully blockade the importer.
	v.State.Towns[2].Blockade = 1.0
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no trade under full blockade, got %d writes", len(w.Debug()))
	}
}

func TestPartialBlockadeReducesTrade(t *testing.T) {
	// Partial blockade should still allow some trade (volume reduced).
	// We verify it runs without error and produces writes.
	v, w := testView()
	v.State.Towns[2].Blockade = 0.5
	run(v, w)
	if len(w.Debug()) != 4 {
		t.Errorf("expected 4 writes under partial blockade, got %d", len(w.Debug()))
	}
}

func TestNonPortIgnored(t *testing.T) {
	v, w := testView()
	v.State.Towns[1].IsPort = false
	v.State.Towns[2].IsPort = false
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no trade without ports, got %d writes", len(w.Debug()))
	}
}

func TestNoSurplusNoTrade(t *testing.T) {
	v, w := testView()
	// Both balanced: no surplus, no deficit.
	v.State.Towns[1].FoodProduction = 400.0
	v.State.Towns[2].FoodProduction = 800.0
	run(v, w)
	if len(w.Debug()) != 0 {
		t.Errorf("expected no trade when balanced, got %d writes", len(w.Debug()))
	}
}
