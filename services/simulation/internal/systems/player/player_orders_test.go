package player

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/construction"
)

// testView builds a minimal world: two towns in the same state, one in
// another state.
func testView() *sim.View {
	state := &model.State{
		Towns: map[int]*model.Town{
			1: {ID: 1, Name: "Albany", SideID: 1, State: "NY", Holder: 7,
				Money: 100000, ConstructionBuilding: -1, StateTaxRate: 0.03},
			2: {ID: 2, Name: "Buffalo", SideID: 1, State: "NY", Holder: 7,
				Money: 100000, ConstructionBuilding: -1, StateTaxRate: 0.03},
			3: {ID: 3, Name: "Austin", SideID: 1, State: "TX", Holder: 7,
				Money: 100000, ConstructionBuilding: -1, StateTaxRate: 0.03},
		},
		Rulers: map[int]*model.Ruler{
			7: {ID: 7, Name: "Boss", SideID: 1, IsAlive: true},
		},
		Sides: map[int]*model.Side{
			1: {ID: 1, Name: "Test Faction"},
		},
	}
	cfg := &config.Config{}
	cfg.Construction.MaxLevel = 3
	cfg.Construction.DaysPerCost = 0.005
	cfg.Construction.CostWatch = [3]float64{2000, 3000, 4000}
	cfg.Currency.TaxMaxRate = 0.5
	cfg.Taxation.StateTaxMaxRate = 0.15
	return &sim.View{
		State: state,
		Log:   cause.NewLog(1000),
		Cfg:   cfg,
		Rng:   rng.New(42),
		Tick:  100,
	}
}

// wroteField reports whether the write set contains a write for kind/entity/field.
func wroteField(w *sim.WriteSet, kind model.Kind, entity int, field string) bool {
	for _, d := range w.Debug() {
		if d.Kind == kind && d.Entity == entity && d.Field == field {
			return true
		}
	}
	return false
}

func TestOrderStartConstruction(t *testing.T) {
	v := testView()
	v.Orders = []sim.Order{{Kind: sim.OrderStartConstruction, TownID: 1, Amount: float64(construction.Watch)}}
	w := sim.NewWriteSet()
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected construction to start from player order")
	}
}

func TestOrderStartConstructionBadIndex(t *testing.T) {
	v := testView()
	v.Orders = []sim.Order{{Kind: sim.OrderStartConstruction, TownID: 1, Amount: 99}}
	w := sim.NewWriteSet()
	run(v, w)
	if wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected bad building index to be rejected")
	}
}

func TestOrderSetStateTaxAppliesToWholeState(t *testing.T) {
	v := testView()
	v.Orders = []sim.Order{{Kind: sim.OrderSetStateTax, TownID: 1, Amount: 0.08}}
	w := sim.NewWriteSet()
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "state_tax_rate") {
		t.Error("expected NY town 1 rate to change")
	}
	if !wroteField(w, model.KindTown, 2, "state_tax_rate") {
		t.Error("expected NY town 2 rate to change")
	}
	if wroteField(w, model.KindTown, 3, "state_tax_rate") {
		t.Error("expected TX town 3 rate to stay")
	}
}

func TestOrderSetStateTaxClamped(t *testing.T) {
	v := testView()
	v.Orders = []sim.Order{{Kind: sim.OrderSetStateTax, TownID: 1, Amount: 0.99}}
	w := sim.NewWriteSet()
	applyStateTax(v, w, v.Orders[0])
	// Clamped to max 0.15: the write exists (rate differs from 0.03).
	if !wroteField(w, model.KindTown, 1, "state_tax_rate") {
		t.Error("expected clamped state tax write")
	}
}
