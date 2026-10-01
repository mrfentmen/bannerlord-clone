// Package construction runs settlement projects: Bannerlord's "Manage Town"
// building list, ported to a modern American setting. Ten buildings, three
// tiers each, one project under construction per town at a time.
//
// Reads each town's building levels, the active construction queue, and town
// money. Writes construction progress, completed tiers, the daily effects of
// every standing building, and the holder AI's own build orders.
//
// The building list follows Bannerlord's town projects:
//
//	Bannerlord        Modern name          Effect
//	Fortifications    City Walls           slows siege breach work per tier
//	Garrison Barracks Police Barracks      raises garrison cap per tier
//	Training Fields   Training Grounds     garrison morale per tier
//	Fairgrounds       Community Center     loyalty per day per tier
//	Marketplace       Commercial District  tax income bonus per tier
//	Granary           Food Warehouse       food storage cap per tier
//	Orchards          Urban Farms          food per day per tier
//	Militia Grounds   Neighborhood Watch   militia per day per tier
//	Aqueducts         Infrastructure       prosperity per day per tier
//	Forum             Civic Center         influence per day to the holder
package construction

import (
	"fmt"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Building indexes the project list. The order is the canonical order stored
// in the town's ConstructionBuilding field.
const (
	Walls = iota
	Barracks
	Training
	Community
	Commercial
	Warehouse
	Farms
	Watch
	Infra
	Civic
	BuildingCount
)

// Def describes one project.
type Def struct {
	// Field is the town accessor field holding the 0-3 level.
	Field string
	// Name is the modern display name.
	Name string
	// Bannerlord is the original Bannerlord project name.
	Bannerlord string
	// Blurb is the one-line effect description.
	Blurb string
}

// List returns the building defs in canonical order.
func List() []Def {
	return []Def{
		{Field: "building_walls", Name: "City Walls", Bannerlord: "Fortifications", Blurb: "slows siege breach work"},
		{Field: "building_barracks", Name: "Police Barracks", Bannerlord: "Garrison Barracks", Blurb: "raises garrison cap"},
		{Field: "building_training", Name: "Training Grounds", Bannerlord: "Training Fields", Blurb: "garrison morale up"},
		{Field: "building_community", Name: "Community Center", Bannerlord: "Fairgrounds", Blurb: "loyalty per day"},
		{Field: "building_commercial", Name: "Commercial District", Bannerlord: "Marketplace", Blurb: "tax income bonus"},
		{Field: "building_warehouse", Name: "Food Warehouse", Bannerlord: "Granary", Blurb: "food storage cap"},
		{Field: "building_farms", Name: "Urban Farms", Bannerlord: "Orchards", Blurb: "food per day"},
		{Field: "building_watch", Name: "Neighborhood Watch", Bannerlord: "Militia Grounds", Blurb: "militia per day"},
		{Field: "building_infra", Name: "Infrastructure", Bannerlord: "Aqueducts", Blurb: "prosperity per day"},
		{Field: "building_civic", Name: "Civic Center", Bannerlord: "Forum", Blurb: "influence per day to holder"},
	}
}

// Costs returns the tier 1/2/3 build costs for a building from config.
func Costs(c *config.Config, b int) [3]float64 {
	cc := c.Construction
	switch b {
	case Walls:
		return cc.CostWalls
	case Barracks:
		return cc.CostBarracks
	case Training:
		return cc.CostTraining
	case Community:
		return cc.CostCommunity
	case Commercial:
		return cc.CostCommercial
	case Warehouse:
		return cc.CostWarehouse
	case Farms:
		return cc.CostFarms
	case Watch:
		return cc.CostWatch
	case Infra:
		return cc.CostInfra
	case Civic:
		return cc.CostCivic
	}
	return [3]float64{}
}

// System returns the construction system.
func System() sim.System {
	return sim.System{
		Name: "construction",
		Doc:  "builds settlement projects and applies their daily effects",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil {
			continue
		}
		progressConstruction(v, w, c, id, t)
		applyBuildingEffects(v, w, c, id, t)
		autoBuild(v, w, c, id, t)
	}
}

// buildingLevel reads a town's tier for a building index directly from the
// struct, so the canonical order stays in one place.
func buildingLevel(t *model.Town, b int) float64 {
	switch b {
	case Walls:
		return t.BuildingWalls
	case Barracks:
		return t.BuildingBarracks
	case Training:
		return t.BuildingTraining
	case Community:
		return t.BuildingCommunity
	case Commercial:
		return t.BuildingCommercial
	case Warehouse:
		return t.BuildingWarehouse
	case Farms:
		return t.BuildingFarms
	case Watch:
		return t.BuildingWatch
	case Infra:
		return t.BuildingInfra
	case Civic:
		return t.BuildingCivic
	}
	return 0
}

// progressConstruction advances the active project and completes it.
func progressConstruction(v *sim.View, w *sim.WriteSet, c *config.Config, id int, t *model.Town) {
	b := int(t.ConstructionBuilding)
	if b < 0 || b >= BuildingCount {
		return
	}
	defs := List()
	left := t.ConstructionDaysLeft - 1
	read := shared.ReadString(
		shared.PairI("building", b),
		shared.PairF("days_left", t.ConstructionDaysLeft))
	causes := v.Log.RecentFor(model.KindTown, id, []string{"construction_days_left", "money"}, 3)
	if left > 0 {
		// Additive so a player order starting construction this same tick
		// (an absolute Set) does not collide with today's progress.
		w.Add(model.KindTown, id, "construction_days_left", -1, read, causes, "construction continues")
		return
	}
	// Complete: raise the tier, clear the queue.
	level := buildingLevel(t, b)
	next := level + 1
	max := c.Construction.MaxLevel
	if next > max {
		next = max
	}
	w.Set(model.KindTown, id, defs[b].Field, next, read, causes,
		"completed "+defs[b].Name+" tier "+fmt.Sprintf("%d", int(next)))
	w.Set(model.KindTown, id, "construction_building", -1, read, causes, "project complete")
	w.Set(model.KindTown, id, "construction_days_left", 0, read, causes, "project complete")
}

// applyBuildingEffects applies the daily effects of every standing building.
func applyBuildingEffects(v *sim.View, w *sim.WriteSet, c *config.Config, id int, t *model.Town) {
	cc := c.Construction

	level := func(b int) float64 { return buildingLevel(t, b) }

	// Community Center: loyalty per day.
	if lv := level(Community); lv > 0 {
		gain := lv * cc.CommunityLoyaltyPerLevel
		w.Add(model.KindTown, id, "loyalty", gain,
			shared.ReadString(shared.PairF("community_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"loyalty", "building_community"}, 3),
			"community center programs")
	}
	// Infrastructure: prosperity per day.
	if lv := level(Infra); lv > 0 {
		gain := lv * cc.InfraProsperityPerLevel
		w.Add(model.KindTown, id, "prosperity", gain,
			shared.ReadString(shared.PairF("infra_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"prosperity", "building_infra"}, 3),
			"civic infrastructure investment")
	}
	// Urban Farms: food per day.
	if lv := level(Farms); lv > 0 {
		gain := lv * cc.FarmsFoodPerLevel
		w.Add(model.KindTown, id, "food_stock", gain,
			shared.ReadString(shared.PairF("farms_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"food_stock", "building_farms"}, 3),
			"urban farms harvest")
	}
	// Neighborhood Watch: militia per day.
	if lv := level(Watch); lv > 0 {
		gain := lv * cc.WatchMilitiaPerLevel
		w.Add(model.KindTown, id, "militia", gain,
			shared.ReadString(shared.PairF("watch_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"militia", "building_watch"}, 3),
			"neighborhood watch recruitment")
	}
	// Commercial District: tax income bonus (read by the currency system).
	if lv := level(Commercial); lv > 0 {
		bonus := lv * cc.CommercialTaxPerLevel
		w.Set(model.KindTown, id, "tax_bonus", bonus,
			shared.ReadString(shared.PairF("commercial_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"tax_bonus", "building_commercial"}, 3),
			"commercial district tax base")
	}
	// Food Warehouse: food storage cap; enforce it.
	{
		lv := level(Warehouse)
		cap := cc.WarehouseBaseCap + lv*cc.WarehouseFoodCapPerLevel
		w.Set(model.KindTown, id, "food_cap", cap,
			shared.ReadString(shared.PairF("warehouse_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"food_cap", "building_warehouse"}, 3),
			"warehouse storage capacity")
		if t.FoodStock > cap {
			w.Set(model.KindTown, id, "food_stock", cap,
				shared.ReadString(shared.PairF("food_stock", t.FoodStock), shared.PairF("food_cap", cap)),
				v.Log.RecentFor(model.KindTown, id, []string{"food_stock", "food_cap"}, 3),
				"spoilage beyond warehouse capacity")
		}
	}
	// Police Barracks: garrison cap; enforce it.
	{
		lv := level(Barracks)
		cap := cc.GarrisonBaseCap
		if lv >= 1 && lv <= 3 {
			cap += cc.BarracksGarrisonCapPerLevel[int(lv)-1]
		}
		w.Set(model.KindTown, id, "garrison_cap", cap,
			shared.ReadString(shared.PairF("barracks_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"garrison_cap", "building_barracks"}, 3),
			"barracks housing capacity")
		if t.Garrison > cap {
			w.Set(model.KindTown, id, "garrison", cap,
				shared.ReadString(shared.PairF("garrison", t.Garrison), shared.PairF("garrison_cap", cap)),
				v.Log.RecentFor(model.KindTown, id, []string{"garrison", "garrison_cap"}, 3),
				"garrison exceeds barracks capacity")
		}
	}
	// Training Grounds: garrison morale (better-trained troops fight better,
	// on defense and when the garrison marches out as a field force).
	if lv := level(Training); lv > 0 {
		gain := lv * cc.TrainingMoralePerLevel
		w.Add(model.KindTown, id, "garrison_morale", gain,
			shared.ReadString(shared.PairF("training_level", lv)),
			v.Log.RecentFor(model.KindTown, id, []string{"garrison_morale", "building_training"}, 3),
			"training grounds drills")
	}
	// Civic Center: influence per day to the holder.
	if lv := level(Civic); lv > 0 && t.Holder > 0 {
		gain := lv * cc.CivicInfluencePerLevel
		w.Add(model.KindRuler, t.Holder, "influence", gain,
			shared.ReadString(fmt.Sprintf("town=%s", t.Name), shared.PairF("civic_level", lv)),
			v.Log.RecentFor(model.KindRuler, t.Holder, []string{"influence"}, 3),
			"civic center prestige in "+t.Name)
	}
}

// autoBuild is the holder AI: a town with money above the reserve and no
// active project starts its lowest-tier building.
func autoBuild(v *sim.View, w *sim.WriteSet, c *config.Config, id int, t *model.Town) {
	if t.Holder <= 0 {
		return
	}
	if int(t.ConstructionBuilding) >= 0 {
		return
	}
	if t.Money < c.Construction.AutoBuildReserve {
		return
	}
	// Pick the lowest-tier building; ties go to the earlier (military-first)
	// entry, so defenses come before civic projects.
	best := -1
	bestLevel := 99.0
	for b := 0; b < BuildingCount; b++ {
		lv := buildingLevel(t, b)
		if lv < c.Construction.MaxLevel && lv < bestLevel {
			best, bestLevel = b, lv
		}
	}
	if best < 0 {
		return
	}
	cost := Costs(c, best)[int(bestLevel)]
	if t.Money < cost+c.Construction.AutoBuildReserve {
		return
	}
	startConstruction(v, w, c, id, t, best, cost, "holder's build program")
}

// StartConstruction validates and queues a project. Shared by the player
// order handler and the holder AI.
func StartConstruction(v *sim.View, w *sim.WriteSet, c *config.Config, id int, t *model.Town, b int, reason string) bool {
	if b < 0 || b >= BuildingCount {
		return false
	}
	if int(t.ConstructionBuilding) >= 0 {
		return false
	}
	lv := buildingLevel(t, b)
	if lv >= c.Construction.MaxLevel {
		return false
	}
	cost := Costs(c, b)[int(lv)]
	if t.Money < cost {
		return false
	}
	startConstruction(v, w, c, id, t, b, cost, reason)
	return true
}

func startConstruction(v *sim.View, w *sim.WriteSet, c *config.Config, id int, t *model.Town, b int, cost float64, reason string) {
	defs := List()
	lv := buildingLevel(t, b)
	days := cost * c.Construction.DaysPerCost
	if days < 1 {
		days = 1
	}
	read := shared.ReadString(
		shared.PairI("building", b),
		shared.PairF("tier", lv+1),
		shared.PairF("cost", cost),
		shared.PairF("days", days))
	causes := v.Log.RecentFor(model.KindTown, id, []string{"money", "construction_building"}, 3)
	w.Add(model.KindTown, id, "money", -cost, read, causes, "construction started: "+defs[b].Name)
	w.Set(model.KindTown, id, "construction_building", float64(b), read, causes, reason)
	w.Set(model.KindTown, id, "construction_days_left", days, read, causes, reason)
}
