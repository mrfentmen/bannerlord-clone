// Package kingdomcrime models per-kingdom crime consequences (Tier 6).
//
// Bannerlord tracks crimes per faction: commit crimes in a kingdom and
// that kingdom remembers. This system aggregates the town-level crime
// counters (from the base crime system) to the side/kingdom level and
// produces kingdom-wide consequences:
//
//   - Enforcement cost: sides with high aggregate crime pay law
//     enforcement from their treasury.
//   - Security response: high-crime towns get garrison reinforcements.
//   - Lawlessness: sides whose crime share exceeds a threshold take a
//     relation_score penalty (other kingdoms distrust lawless realms).
//
// This runs after the base crime system in the same tick.
package kingdomcrime

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// enforcementCostPerCrime is treasury spent per unit of aggregate crime.
	enforcementCostPerCrime = 50.0
	// garrisonResponsePerCrime is the garrison boost per crime unit.
	garrisonResponsePerCrime = 5.0
	// lawlessThreshold is the aggregate crime share that marks a side lawless.
	lawlessThreshold = 2.0
	// lawlessRelationPenalty is the relation_score hit for lawless sides.
	lawlessRelationPenalty = 0.1
)

// System returns the kingdomcrime system.
func System() sim.System {
	return sim.System{
		Name: "kingdomcrime",
		Doc:  "aggregates town crimes to per-side enforcement costs and lawlessness",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	// Aggregate crime by holder side.
	crimeBySide := make(map[int]float64)
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.Crime <= 0 || t.HolderSide < 0 {
			continue
		}
		crimeBySide[t.HolderSide] += t.Crime

		// Local response: garrison reinforcement in high-crime towns.
		// Only reinforce if garrison is below the level needed for the
		// current crime (prevents unbounded growth from persistent crime).
		needed := t.Crime * 100.0
		if t.Garrison < needed {
			boost := (needed - t.Garrison) * 0.1
			read := shared.ReadString(
				shared.Pair("crime", t.Crime),
				shared.Pair("garrison", t.Garrison),
			)
			causes := v.Log.RecentFor(model.KindTown, tid, []string{"crime"}, 3)
			w.Add(model.KindTown, tid, "garrison",
				boost, read, causes,
				"security response to crime")
		}
	}

	// Per-side consequences.
	for sid, amount := range crimeBySide {
		side := v.State.Sides[sid]
		if side == nil {
			continue
		}
		read := shared.ReadString(
			shared.Pair("crime_amount", amount),
			shared.Pair("side_treasury", side.Treasury),
		)
		causes := v.Log.RecentFor(model.KindSide, sid, []string{"side_treasury"}, 3)

		// Enforcement cost from the side treasury.
		cost := amount * enforcementCostPerCrime
		w.Add(model.KindSide, sid, "side_treasury", -cost, read, causes,
			"law enforcement costs")

		// Lawlessness: high aggregate crime marks the side.
		if amount >= lawlessThreshold {
			w.Add(model.KindSide, sid, "relation_score",
				-lawlessRelationPenalty, read, causes,
				"lawless realm distrusted")
		}
	}
}
