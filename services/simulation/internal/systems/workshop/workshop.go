// Package workshop runs clan-owned production buildings (Tier 3.2).
//
// Workshops convert raw goods into finished goods and generate income for
// the owning clan. They are the economic engine that makes a clan more than
// a name: a clan with workshops has money to field armies, and a clan
// without them must raid or trade.
//
// Each workshop type has an input good and an output good:
//   - smithy: metal -> weapons
//   - tannery: hides -> leather
//   - weavery: wool -> cloth
//   - brewery: grain -> beer
//   - pottery: clay -> pottery
//
// Throughput scales with level (1-3) and workers. The town's market buys
// the output; if the town is blockaded or broke, output piles up unsold.
package workshop

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the workshop system.
func System() sim.System {
	return sim.System{
		Name: "workshop",
		Doc:  "runs clan-owned workshops converting raw goods to finished goods",
		Runs: run,
	}
}

// throughput per worker per day by level.
func throughput(level int) float64 {
	switch level {
	case 3:
		return 3.0
	case 2:
		return 2.0
	default:
		return 1.0
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.WorkshopIDs() {
		wk := v.State.Workshops[id]
		if wk == nil || wk.OwnerClanID < 0 {
			continue
		}
		t := v.State.Towns[wk.TownID]
		if t == nil {
			continue
		}
		// Production: workers * throughput, limited by input stock.
		rate := throughput(wk.Level) * wk.Workers
		produced := rate
		if produced > wk.InputStock {
			produced = wk.InputStock
		}
		// Sell output at the town's price level. A blockaded town cannot
		// export, so output accumulates; a broke town buys less.
		price := t.PriceIndex
		if price < 0.1 {
			price = 0.1
		}
		sold := wk.OutputStock + produced
		revenue := 0.0
		if t.Blockade < 0.5 && t.Money > 0 {
			// The town buys what it can afford.
			affordable := t.Money / price
			if sold > affordable {
				sold = affordable
			}
			revenue = sold * price * c.Workshop.ProfitMargin
			wk.OutputStock = wk.OutputStock + produced - sold
			wk.InputStock -= produced
		} else {
			// Cannot sell: stockpile grows.
			wk.OutputStock += produced
			wk.InputStock -= produced
		}
		read := shared.ReadString(
			shared.Pair("workers", wk.Workers),
			shared.PairI("level", wk.Level),
			shared.Pair("produced", produced),
			shared.Pair("revenue", revenue),
		)
		causes := v.Log.RecentFor(model.KindWorkshop, id,
			[]string{"workshop_workers", "workshop_input_stock"}, 3)
		w.Set(model.KindWorkshop, id, "workshop_output_stock", wk.OutputStock,
			read, causes, "")
		w.Set(model.KindWorkshop, id, "workshop_input_stock", wk.InputStock,
			read, causes, "")
		w.Set(model.KindWorkshop, id, "workshop_income", revenue,
			read, causes, "workshop sales")
		// Income flows to the owning clan's leader.
		if revenue > 0 {
			if cl := v.State.Clans[wk.OwnerClanID]; cl != nil {
				if leader := v.State.Rulers[cl.LeaderID]; leader != nil {
					w.Add(model.KindRuler, leader.ID, "money", revenue,
						read, causes, "workshop income")
				}
			}
		}
	}
}
