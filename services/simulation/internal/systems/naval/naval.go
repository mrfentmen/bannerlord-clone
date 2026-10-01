// Package naval models sea trade between port towns (Tier 6).
//
// CAUSE_EFFECT.md chain 8 describes a port blockade: "food imports stop,
// prices spike, unrest rises." ECONOMY.md section 8 assumes waterborne
// food exports. But no naval layer existed — the food system's imports
// were an abstract formula, not actual trade. This system makes sea trade
// concrete.
//
// Mechanics:
//   - Port towns (IsPort) with food surplus export via sea; port towns
//     with deficit import via sea.
//   - Sea trade pairs the largest exporter with the largest importer,
//     moving food at higher volume than land caravans (ships carry more
//     than wagons).
//   - Both ports collect tariff income on the trade (Town.Money increases).
//   - Blockade (Town.Blockade 0-1) cuts a port's sea trade proportionally.
//     A fully blockaded port gets no sea imports — this is what makes
//     chain 8 real instead of a formula.
//
// Sea trade is abstracted as direct port-to-port transfers, not ship
// entities. The logistics system already models land caravans as parties;
// ships would duplicate that machinery for little gain at the sim level.
// What matters is the economic flow and its interruption by blockade.
//
// Tuning constants are package-level until the config system's current
// round of edits settles, then they should move to balance.toml.
package naval

import (
	"sort"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants. See package doc for why these live here.
const (
	// seaTradeRate is the share of a port's surplus/deficit moved by sea per tick.
	seaTradeRate = 0.1
	// tariffRate is the share of trade value each port collects as tariffs.
	tariffRate = 0.05
	// foodPricePerUnit is the assumed price for tariff calculation.
	foodPricePerUnit = 2.0
	// maxTradePerPair caps food moved between one pair per tick.
	maxTradePerPair = 500.0
)

// System returns the naval trade system.
func System() sim.System {
	return sim.System{
		Name: "naval",
		Doc:  "sea trade between ports; blockades cut imports (chain 8)",
		Runs: run,
	}
}

// portTrade holds a port's sea trade position.
type portTrade struct {
	town    *model.Town
	surplus float64 // positive = exporter, negative = importer (deficit)
	// blockadeCut is 1 - blockade, the share of sea trade that gets through.
	blockadeCut float64
}

func run(v *sim.View, w *sim.WriteSet) {
	var exporters []*portTrade
	var importers []*portTrade

	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil || !t.IsPort {
			continue
		}
		// Surplus/deficit from food balance. Use FoodProduction vs
		// FoodDemand as the signal.
		balance := t.FoodProduction - t.FoodDemand
		cut := 1.0 - shared.Clamp(t.Blockade, 0, 1)
		pt := &portTrade{town: t, surplus: balance, blockadeCut: cut}
		if balance > 0 {
			exporters = append(exporters, pt)
		} else if balance < 0 {
			importers = append(importers, pt)
		}
	}

	if len(exporters) == 0 || len(importers) == 0 {
		return
	}

	// Sort: largest exporters and largest importers first, so the biggest
	// needs are met first.
	sort.Slice(exporters, func(i, j int) bool {
		return exporters[i].surplus > exporters[j].surplus
	})
	sort.Slice(importers, func(i, j int) bool {
		return importers[i].surplus < importers[j].surplus
	})

	// Pair them greedily.
	for _, exp := range exporters {
		if exp.surplus <= 0 {
			continue
		}
		for _, imp := range importers {
			if imp.surplus >= 0 {
				continue
			}
			if exp.surplus <= 0 {
				break
			}
			// Trade volume limited by exporter surplus, importer deficit,
			// the per-pair cap, and both ports' blockade cuts. If either
			// port is fully blockaded, no trade flows.
			available := exp.surplus * seaTradeRate * exp.blockadeCut
			needed := -imp.surplus * seaTradeRate * imp.blockadeCut
			volume := available
			if needed < volume {
				volume = needed
			}
			if volume > maxTradePerPair {
				volume = maxTradePerPair
			}
			if volume <= 0 {
				continue
			}

			// Execute the trade.
			exp.surplus -= volume
			imp.surplus += volume

			tariff := volume * foodPricePerUnit * tariffRate
			read := shared.ReadString(
				shared.Pair("exporter", float64(exp.town.ID)),
				shared.Pair("importer", float64(imp.town.ID)),
				shared.Pair("volume", volume),
			)
			causes := v.Log.RecentFor(model.KindTown, exp.town.ID,
				[]string{"food_production", "food_demand", "blockade"}, 3)

			// Exporter: food leaves, tariff income arrives.
			w.Add(model.KindTown, exp.town.ID, "food_stock", -volume,
				read, causes, "sea export")
			w.Add(model.KindTown, exp.town.ID, "money", tariff,
				read, causes, "export tariff")
			// Importer: food arrives, tariff income arrives.
			w.Add(model.KindTown, imp.town.ID, "food_stock", volume,
				read, causes, "sea import")
			w.Add(model.KindTown, imp.town.ID, "money", tariff,
				read, causes, "import tariff")
		}
	}
}
