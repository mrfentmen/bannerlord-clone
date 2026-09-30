// Package food implements the food system from CAUSE_EFFECT.md section 3.
//
// It reads workers, production, demand, stock, and road safety, and writes
// food_stock, food_production, food_demand, food_imports, and food_exports.
// It does not decide who is hungry; that is the starvation system reading the
// stock this one leaves behind.
package food

import (
	"fmt"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the food system.
func System() sim.System {
	return sim.System{
		Name: "food",
		Doc:  "grows, stores, spoils, and trades food; a negative balance drains the larder",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			continue
		}

		// Delivered cargo first. The logistics system stages what arrived into
		// arriving_cargo_food; this system is the only one that turns it into
		// food_stock. That is how a caravan that survived the road becomes a
		// town that is fed, and how a caravan that did not leaves nothing at
		// all (CAUSE_EFFECT.md section 3).
		arriving := t.ArrivingFood
		if arriving > 0 {
			w.Add(model.KindTown, id, "food_stock", arriving,
				"caravan delivered food", nil, "imports delivered")
			// The accumulator is cleared here because this system is its only
			// consumer. An absolute write is safe because nothing else writes
			// it, which the engine enforces.
			w.Set(model.KindTown, id, "arriving_cargo_food", 0, "consumed", nil, "")
		}

		// --- production ---
		// Yield is farmland-limited labour output. A town of ten million in a
		// city with no hinterland cannot feed itself, which is the honest
		// reading of ECONOMY.md section 3 and gives the Pacific and Atlantic
		// sides their real food problem (FACTIONS.md section 4).
		farm := shared.Clamp(t.Population*c.Food.FarmlandFactor, c.Food.FarmlandMin, c.Food.FarmlandMax)
		yieldPerWorker := c.Food.BaseYieldPerWorker * farm
		// Unhappy and unhealthy towns farm worse: unrest wastes labour through
		// strikes and protests, and sick workers cannot work the fields.
		healthFactor := (1 - t.Infected) * (1 - 0.5*t.Unrest) * (0.5 + 0.5*shared.Clamp(t.Sanitation, 0, 1))
		prod := t.Workers * yieldPerWorker * healthFactor
		// A harvest shock is a random weather event, not a scripted outcome.
		// CAUSE_EFFECT.md section 7 bans scripted events; a seeded draw each
		// day is the honest mechanism.
		if v.Rng.Chance(c.Food.ShockChance) {
			prod *= 1 - c.Food.ShockFraction
		}
		w.Set(model.KindTown, id, "food_yield", prod,
			fmt.Sprintf("workers=%.0f, farmland=%.3f, sanitation=%.3f, infected=%.4f, unrest=%.3f",
				t.Workers, farm, t.Sanitation, t.Infected, t.Unrest),
			v.Log.RecentFor(model.KindTown, id, []string{"workers", "sanitation", "infected"}, 4),
			"harvest")

		// Villages feed their town. A village that has been raided produces
		// less, which is the raiding link in ECONOMY.md section 9.
		villageYield := 0.0
		for _, vid := range v.State.VillageIDs() {
			vl := v.State.Villages[vid]
			if vl.TownID != id {
				continue
			}
			// RaidMemory is a decaying counter: a raided village takes months
			// to recover, so raiding has lasting bite.
			raidPenalty := 1 - shared.Clamp(vl.RaidMemory/60, 0, 0.8)
			villageYield += vl.Yield * raidPenalty
		}
		prod += villageYield

		// --- demand ---
		// Every person eats every day, per ECONOMY.md section 3. Demand is
		// population-driven, not worker-driven, so losing workers does not
		// reduce how much food must be found.
		demand := t.Population * c.Food.PersonDaysPerPersonDay

		// --- trade ---
		// Imports and exports are the town's link to the rest of the map, and
		// both are cut by a blockade. Chain 8 requires imports to actually
		// stop, so the blockade share multiplies the import side directly.
		importCut := 1 - shared.Clamp(t.Blockade, 0, 1)
		// Safe roads let trade in; unsafe roads cut it and add their own
		// shortage, which is chain 3's link into chains 1 and 2.
		roadAccess := c.Food.TradeOutRate * (0.35 + 0.65*shared.Clamp(t.RoadSafety, 0, 1)) * importCut
		// A rich, orderly town can buy its way out of a bad harvest; a poor
		// one cannot.
		prosperityFactor := 0.5 + shared.Clamp(t.Prosperity, 0, 1)
		imports := demand * c.Food.ImportShortfall * roadAccess * prosperityFactor
		// Surplus above demand can be sold.
		surplus := prod - demand
		exports := 0.0
		if surplus > 0 {
			exports = surplus * c.Food.TradeInRate * (0.3 + 0.7*shared.Clamp(t.RoadSafety, 0, 1)) * importCut
		}

		// --- balance and stock ---
		// Net is production plus imports minus consumption and exports. A
		// negative balance drains the larder, which is the whole of the food
		// system's contract per CAUSE_EFFECT.md section 3.
		net := prod + imports - demand - exports
		// The daily swing is capped so one unlucky day cannot empty a year's
		// buffer, which keeps the difference between a bad week and a collapse.
		maxSwing := c.Food.MaxDailyNetChange * demand
		if net > maxSwing {
			net = maxSwing
		}
		if net < -maxSwing {
			net = -maxSwing
		}
		// Spoilage: food rots, faster without sanitation, per ECONOMY.md
		// section 3. This is why a neglected town wastes what little it has.
		spoilage := t.FoodStock * c.Food.SpoilageRate * (1 - c.Food.SpoilageModSanitation*shared.Clamp(t.Sanitation, 0, 1))
		newStock := t.FoodStock + net - spoilage
		if newStock < c.Food.StockFloor {
			newStock = c.Food.StockFloor
		}
		foodDays := 0.0
		if demand > 0 {
			foodDays = newStock / demand
		}

		read := fmt.Sprintf("production=%.2f, demand=%.2f, stock=%.1f, road_safety=%.3f, blockade=%.3f, imports=%.2f",
			prod, demand, t.FoodStock, t.RoadSafety, t.Blockade, imports)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"food_production", "food_demand", "road_safety", "blockade", "workers", "sanitation"}, 5)

		w.Set(model.KindTown, id, "food_production", prod, read, causes, "daily production")
		w.Set(model.KindTown, id, "food_demand", demand, read, causes, "daily consumption")
		w.Set(model.KindTown, id, "food_imports", imports, read, causes, "imports")
		w.Set(model.KindTown, id, "food_exports", exports, read, causes, "exports")
		w.Add(model.KindTown, id, "food_stock", net-spoilage, read, causes, "")
		w.Set(model.KindTown, id, "food_days", foodDays, read, causes, "")

		// The merchant's target stock, which the market system reads. High
		// taxes pull it down, and that is chain 1's first visible link: raise
		// taxes and merchants hold less.
		target := demand * c.Market.StockTargetDays * (1 - c.Market.StockTargetTaxDrag*shared.Clamp(t.TaxRate, 0, 1))
		w.Set(model.KindTown, id, "stock_target", target, read, causes, "merchant target stock")
	}
}
