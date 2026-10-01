// Package courtship models persuasion and relationship building (Tier 6).
//
// In modern America, faction leaders improve relations through diplomacy,
// gifts, and successful negotiations. This system models the slow background
// improvement of a leader's diplomatic standing when their faction is at
// peace and the leader is skilled at negotiation.
//
// Mechanics:
//   - Each tick, sides at peace whose ruler is alive and has high charm
//     gain a small relation_score boost (successful diplomacy).
//   - Sides at war do not gain; war overrides courtship.
//   - This is the background process. The campaign client implements the
//     actual persuasion dialogue UI using these relation values.
//
// Note: Pair-wise ruler relations (A likes B) require model support for
// staged pair-relation writes; this system improves the side-level
// diplomatic standing that the persuasion UI reads.
package courtship

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// charmThreshold is the ruler charm needed for diplomatic drift.
	charmThreshold = 5.0
	// driftPerCharm is relation_score gained per charm point above threshold.
	driftPerCharm = 0.0005
	// maxRelation caps the diplomatic standing.
	maxRelation = 0.8
)

// System returns the courtship system.
func System() sim.System {
	return sim.System{
		Name: "courtship",
		Doc:  "peaceful sides with charming rulers gain diplomatic standing",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, rid := range v.State.LeaderIDsSorted() {
		ruler := v.State.Leaders[rid]
		if ruler == nil || !ruler.IsAlive {
			continue
		}
		sid := ruler.SideID
		// War blocks diplomacy.
		atWar := false
		for _, wid := range v.State.WarIDs() {
			wr := v.State.Wars[wid]
			if wr != nil && wr.EndTick < 0 && (wr.SideA == sid || wr.SideB == sid) {
				atWar = true
				break
			}
		}
		if atWar {
			continue
		}
		// Generous rulers make better diplomats (no Charm stat exists).
		if ruler.Traits.Generosity < charmThreshold {
			continue
		}
		// Read current relation_score via the field accessor.
		cur, ok := v.State.Get(model.KindLeader, rid, "relation_score")
		if !ok || cur >= maxRelation {
			continue
		}

		drift := (ruler.Traits.Generosity - charmThreshold) * driftPerCharm
		read := shared.ReadString(
			shared.Pair("relation_score", cur),
			shared.Pair("ruler_generosity", ruler.Traits.Generosity),
			shared.Pair("drift", drift),
		)
		causes := v.Log.RecentFor(model.KindLeader, rid,
			[]string{"relation_score"}, 3)
		w.Add(model.KindLeader, rid, "relation_score", drift, read, causes,
			"generous ruler improves diplomatic standing")
	}
}
