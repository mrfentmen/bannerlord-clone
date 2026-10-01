// Package hideout models bandit hideouts and their assault (Tier 6).
//
// Bannerlord's map has bandit hideouts that spawn raiding parties and
// can be cleared by attacking them. This system models hideouts as an
// emergent property of high crime:
//
//   - A town with crime >= threshold is treated as having an active
//     hideout (no separate entity; the hideout IS the criminal network).
//   - Ruler parties stationed in such a town may assault the hideout.
//     Success reduces crime sharply (the network is broken); failure
//     costs the party troops.
//   - This creates the gameplay loop: high crime -> hideout -> assault
//     -> reduced crime, without new model fields.
//
// Uses staged writes to existing fields only.
package hideout

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// crimeThreshold is the crime level that indicates an active hideout.
	crimeThreshold = 0.6
	// assaultChance is the per-tick probability a ruler assaults.
	assaultChance = 0.3
	// assaultSuccessBase is the base success rate.
	assaultSuccessBase = 0.6
	// crimeCleared is how much crime drops on successful assault.
	crimeCleared = 0.4
	// maxTroopLoss is the fraction of party troops lost on failed assault.
	maxTroopLoss = 0.3
)

// System returns the hideout system.
func System() sim.System {
	return sim.System{
		Name: "hideout",
		Doc:  "rulers may assault bandit hideouts in high-crime towns",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	rng := v.Rng.Derive("hideout")
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.Crime < crimeThreshold {
			continue
		}

		// Find ruler parties stationed here.
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p == nil || p.LeaderID < 0 {
				continue
			}
			if p.X != t.X || p.Y != t.Y {
				continue
			}
			if !rng.Chance(assaultChance) {
				continue
			}

			read := shared.ReadString(
				shared.Pair("crime", t.Crime),
				shared.Pair("party_troops", p.Troops),
			)
			causes := v.Log.RecentFor(model.KindTown, tid,
				[]string{"crime"}, 3)

			// Assault: party size vs crime-scaled defender strength.
			// Higher crime = stronger hideout = harder to clear.
			defenderStrength := t.Crime * 100.0
			successChance := assaultSuccessBase * (p.Troops / defenderStrength)
			if successChance > 0.95 {
				successChance = 0.95
			}
			if rng.Chance(successChance) {
				// Victory: the criminal network is broken.
				w.Add(model.KindTown, tid, "crime", -crimeCleared,
					read, causes, "hideout cleared by assault")
			} else {
				// Defeat: the assault is repelled with losses.
				losses := p.Troops * maxTroopLoss * rng.Float64()
				w.Add(model.KindParty, pid, "troops", -losses,
					read, causes, "hideout assault repelled")
			}
			break // one assault per town per tick
		}
	}
}
