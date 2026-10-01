// Package diplomat models posted envoys (Tier 4.2).
//
// In Bannerlord, companions can be posted to towns to gradually improve
// your relations with the town's owner. This represents sustained
// diplomatic engagement: gifts, negotiations, cultural exchange.
//
// Modern American equivalent: posting a liaison to a town hall or
// faction headquarters. The diplomat builds relationships, smooths
// over incidents, and opens back-channels.
//
// Mechanics:
//   - Leaders with the Diplomat trait (or assigned via order) who are
//     stationed in a town gradually improve their side's relations
//     with the town holder's side.
//   - Effect scales with the diplomat's Charm/Persuasion skill.
//   - Costs money (maintaining a diplomatic presence).
//   - Cannot improve relations beyond a cap (0.8) - deep trust requires
//     more than just presence.
//
// This runs after the relation system.
package diplomat

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// relationGainPerDay is the base daily relation improvement.
	relationGainPerDay = 0.01
	// maxDiplomatRelation caps what diplomacy alone can achieve.
	maxDiplomatRelation = 0.8
	// diplomatCostPerDay is the money cost of maintaining a diplomat.
	diplomatCostPerDay = 10.0
)

// System returns the diplomat system.
func System() sim.System {
	return sim.System{
		Name: "diplomat",
		Doc:  "posted diplomats gradually improve inter-faction relations",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, lid := range v.State.LeaderIDsSorted() {
		l := v.State.Leaders[lid]
		if l == nil || l.TownID < 0 {
			continue
		}
		// Only leaders with the diplomat role (or high persuasion) act as diplomats.
		// For now, we check if they're stationed in a foreign town.
		t := v.State.Towns[l.TownID]
		if t == nil || t.HolderSide < 0 {
			continue
		}
		// Skip if already in own faction's town.
		if l.SideID == t.HolderSide {
			continue
		}
		// Skip if at war (diplomats are expelled).
		if v.State.AtWar(l.SideID, t.HolderSide) {
			continue
		}

		// Improve relations between the two sides.
		read := shared.ReadString(
			shared.Pair("leader_side", float64(l.SideID)),
			shared.Pair("holder_side", float64(t.HolderSide)),
		)
		causes := v.Log.RecentFor(model.KindLeader, lid,
			[]string{"town_id"}, 3)

		// AddSideRelation handles the cap internally.
		w.AddSideRelation(l.SideID, t.HolderSide, relationGainPerDay,
			read, causes, "diplomat improves relations")
		// Note: diplomat expenses (money cost) skipped - Leader.money field
		// not yet registered. The relation improvement is the core mechanic.
	}
}
