// Package workshop runs organization-owned production buildings (Tier 3.2).
//
// Workshops convert raw goods into finished goods and generate income for
// the owning organization. They are the economic engine that makes an
// organization more than a name: an organization with workshops has money
// to field armies, and one without them must raid or trade.
//
// The 11 workshop types and their recipes (input -> output):
//   - machine shop: metal -> firearms
//   - tannery: hides -> leather
//   - textile mill: wool -> cloth
//   - brewery: grain -> beer
//   - ceramics: clay -> ceramics
//   - lumber mill: hardwood -> lumber
//   - oil press: olives -> oil/biofuel
//   - jeweler: silver -> jewelry
//   - meat packing: livestock -> meat
//   - bakery: grain -> bread
//   - candle works: tallow -> candles
//
// Throughput scales with level (1-3) and workers. Competition: multiple
// workshops of the same type in one town split the local market, reducing
// each one's efficiency. Caps: max 4 workshops per town, max 2 of the same
// type per town.
//
// The town's market buys the output; if the town is blockaded or broke,
// output piles up unsold.
package workshop

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// maxWorkshopsPerTown caps total workshops in a town.
// maxSameTypePerTown caps workshops of one type in a town (competition).
const (
	maxWorkshopsPerTown = 4
	maxSameTypePerTown  = 2
	competitionPenalty  = 0.3 // efficiency loss per competing workshop
)

// recipe defines the input/output for a workshop type.
type recipe struct {
	input  string  // town field consumed
	output string  // workshop output (abstract)
	ratio  float64 // input units per output unit
}

// recipes maps WorkshopType to its production recipe.
var recipes = map[model.WorkshopType]recipe{
	model.WorkshopMachineShop: {input: "metal", output: "firearms", ratio: 2.0},
	model.WorkshopTannery:     {input: "hides", output: "leather", ratio: 1.5},
	model.WorkshopTextileMill: {input: "wool", output: "cloth", ratio: 1.5},
	model.WorkshopBrewery:     {input: "grain", output: "beer", ratio: 2.0},
	model.WorkshopCeramics:    {input: "clay", output: "ceramics", ratio: 1.0},
	model.WorkshopLumberMill:  {input: "hardwood", output: "lumber", ratio: 1.0},
	model.WorkshopOilPress:    {input: "olives", output: "biofuel", ratio: 3.0},
	model.WorkshopJeweler:     {input: "silver", output: "jewelry", ratio: 0.5},
	model.WorkshopMeatPacking: {input: "livestock", output: "meat", ratio: 1.0},
	model.WorkshopBakery:      {input: "grain", output: "bread", ratio: 1.5},
	model.WorkshopCandleWorks: {input: "tallow", output: "candles", ratio: 1.0},
}

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
	// Count workshops by town and type for competition/caps.
	byTown := make(map[int][]*model.Workshop)
	for _, id := range v.State.WorkshopIDs() {
		wk := v.State.Workshops[id]
		if wk == nil || wk.OwnerOrganizationID < 0 {
			continue
		}
		byTown[wk.TownID] = append(byTown[wk.TownID], wk)
	}

	for townID, workshops := range byTown {
		t := v.State.Towns[townID]
		if t == nil {
			continue
		}
		// Enforce cap: if over max, only the first N produce.
		if len(workshops) > maxWorkshopsPerTown {
			workshops = workshops[:maxWorkshopsPerTown]
		}
		// Count by type for competition.
		byType := make(map[model.WorkshopType]int)
		for _, wk := range workshops {
			byType[wk.Type]++
		}

		for _, wk := range workshops {
			r, ok := recipes[wk.Type]
			if !ok {
				continue
			}
			// Competition: each additional workshop of same type reduces
			// efficiency. Cap the count at maxSameTypePerTown.
			competitors := byType[wk.Type]
			if competitors > maxSameTypePerTown {
				competitors = maxSameTypePerTown
			}
			efficiency := 1.0 - float64(competitors-1)*competitionPenalty
			if efficiency < 0.1 {
				efficiency = 0.1
			}

			// Production: workers * throughput * efficiency, limited by input.
			rate := throughput(wk.Level) * wk.Workers * efficiency
			produced := rate / r.ratio
			if produced > wk.InputStock {
				produced = wk.InputStock
			}
			// Sell output at the town's price level. A blockaded town cannot
			// export, so output accumulates; a broke town buys less.
			price := t.PriceIndex
			if price < 0.1 {
				price = 0.1
			}
			available := wk.OutputStock + produced
			sold := 0.0
			revenue := 0.0
			if t.Blockade < 0.5 && t.Money > 0 {
				// The town buys what it can afford. If it cannot buy anything the
				// output simply stays in the stockpile, so both branches differ only
				// in how much leaves it.
				affordable := t.Money / price
				sold = available
				if sold > affordable {
					sold = affordable
				}
				revenue = sold * price * c.Workshop.ProfitMargin
			}
			read := shared.ReadString(
				shared.Pair("workers", wk.Workers),
				shared.PairI("level", wk.Level),
				shared.Pair("produced", produced),
				shared.Pair("revenue", revenue),
			)
			causes := v.Log.RecentFor(model.KindWorkshop, wk.ID,
				[]string{"workshop_workers", "workshop_input_stock"}, 3)
			// Stocks move as deltas read off committed state, never by writing to
			// wk. Mutating the entity here would commit before the engine applies
			// the write set, letting a later system in this tick see the change and
			// leaving a failed tick half-applied.
			w.Add(model.KindWorkshop, wk.ID, "workshop_output_stock", produced-sold,
				read, causes, "workshop output ("+r.output+")")
			w.Add(model.KindWorkshop, wk.ID, "workshop_input_stock", -produced,
				read, causes, "workshop "+r.input+" consumed")
			w.Set(model.KindWorkshop, wk.ID, "workshop_income", revenue,
				read, causes, "workshop sales")
			// Income flows to the owning organization's leader.
			if revenue > 0 {
				if cl := v.State.Organizations[wk.OwnerOrganizationID]; cl != nil {
					if leader := v.State.Leaders[cl.LeaderID]; leader != nil {
						w.Add(model.KindLeader, leader.ID, "money", revenue,
							read, causes, "workshop income")
					}
				}
			}
		}
	}
}
