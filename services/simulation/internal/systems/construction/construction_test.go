package construction

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

// testView builds a minimal world: one town with a holder and money.
func testView() (*sim.View, *sim.WriteSet) {
	state := &model.State{
		Towns: map[int]*model.Town{
			1: {ID: 1, Name: "Testville", SideID: 1, State: "NY", Holder: 7,
				Money: 100000, ConstructionBuilding: -1, Loyalty: 0.5,
				Prosperity: 0.5, FoodStock: 500, Militia: 10, Garrison: 100,
				GarrisonMorale: 0.5, FoodCap: 1000, GarrisonCap: 200},
		},
		Rulers: map[int]*model.Ruler{
			7: {ID: 7, Name: "Boss", SideID: 1, IsAlive: true, Influence: 50},
		},
		Sides: map[int]*model.Side{
			1: {ID: 1, Name: "Test Faction", Treasury: 1000},
		},
	}
	cfg := &config.Config{}
	cfg.Construction.MaxLevel = 3
	cfg.Construction.DaysPerCost = 0.005
	cfg.Construction.CostWalls = [3]float64{0, 8000, 16000}
	cfg.Construction.CostWatch = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostCommunity = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostCommercial = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostWarehouse = [3]float64{1000, 1500, 2000}
	cfg.Construction.CostBarracks = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostFarms = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostInfra = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostCivic = [3]float64{2000, 3000, 4000}
	cfg.Construction.CostTraining = [3]float64{2000, 3000, 4000}
	cfg.Construction.AutoBuildReserve = 15000
	cfg.Construction.CommunityLoyaltyPerLevel = 0.002
	cfg.Construction.InfraProsperityPerLevel = 0.002
	cfg.Construction.FarmsFoodPerLevel = 6
	cfg.Construction.WatchMilitiaPerLevel = 0.5
	cfg.Construction.CommercialTaxPerLevel = 0.05
	cfg.Construction.CivicInfluencePerLevel = 0.5
	cfg.Construction.TrainingMoralePerLevel = 0.01
	cfg.Construction.WarehouseFoodCapPerLevel = 200
	cfg.Construction.WarehouseBaseCap = 1000
	cfg.Construction.BarracksGarrisonCapPerLevel = [3]float64{30, 60, 100}
	cfg.Construction.GarrisonBaseCap = 200
	return &sim.View{
		State: state,
		Log:   cause.NewLog(1000),
		Cfg:   cfg,
		Rng:   rng.New(42),
		Tick:  100,
	}, sim.NewWriteSet()
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

func TestListHasTenBuildings(t *testing.T) {
	if n := len(List()); n != 10 {
		t.Errorf("expected 10 buildings, got %d", n)
	}
	if BuildingCount != 10 {
		t.Errorf("expected BuildingCount 10, got %d", BuildingCount)
	}
}

func TestStartConstructionQueuesProject(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	if !StartConstruction(v, w, v.Cfg, 1, town, Watch, "test") {
		t.Fatal("expected construction to start")
	}
	if !wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected construction_building write")
	}
	if !wroteField(w, model.KindTown, 1, "money") {
		t.Error("expected money to be deducted")
	}
}

func TestStartConstructionRejectsWhenBusy(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.ConstructionBuilding = float64(Farms)
	if StartConstruction(v, w, v.Cfg, 1, town, Watch, "test") {
		t.Error("expected rejection while a project is active")
	}
}

func TestStartConstructionRejectsMaxLevel(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.BuildingWatch = 3
	if StartConstruction(v, w, v.Cfg, 1, town, Watch, "test") {
		t.Error("expected rejection at max level")
	}
}

func TestStartConstructionRejectsBadIndex(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	if StartConstruction(v, w, v.Cfg, 1, town, 99, "test") {
		t.Error("expected rejection for bad building index")
	}
}

func TestProgressCompletesProject(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.ConstructionBuilding = float64(Watch)
	town.ConstructionDaysLeft = 1
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "building_watch") {
		t.Error("expected building_watch to be set on completion")
	}
	if !wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected construction queue to clear")
	}
}

func TestWatchAddsMilitia(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.BuildingWatch = 2
	// Disable auto-build so only the watch effect fires.
	town.Holder = 0
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "militia") {
		t.Error("expected militia to be added from Neighborhood Watch")
	}
}

func TestCommercialSetsTaxBonus(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.BuildingCommercial = 3
	town.Holder = 0
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "tax_bonus") {
		t.Error("expected tax_bonus to be set")
	}
}

func TestWarehouseEnforcesFoodCap(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.BuildingWarehouse = 1 // cap = 1000 + 200 = 1200
	town.FoodStock = 5000
	town.Holder = 0
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "food_cap") {
		t.Error("expected food_cap to be set")
	}
	if !wroteField(w, model.KindTown, 1, "food_stock") {
		t.Error("expected food_stock to be capped")
	}
}

func TestAutoBuildStartsLowestTier(t *testing.T) {
	v, w := testView()
	// Money well above reserve; holder present; nothing building.
	run(v, w)
	if !wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected holder AI to start a project")
	}
}

func TestAutoBuildSkipsWhenPoor(t *testing.T) {
	v, w := testView()
	town := v.State.Towns[1]
	town.Money = 100
	run(v, w)
	if wroteField(w, model.KindTown, 1, "construction_building") {
		t.Error("expected no construction when below reserve")
	}
}
