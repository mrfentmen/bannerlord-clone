// Package influence converts service, victories, and honour into the political
// currency that lets a ruler call armies, buy loyalty, and hold a side together.
//
// Reads governance quality, victories, broken oaths, and desertions, and writes
// influence, renown, and a ruler's standing with their leader. It is the
// political half of chain 9: an atrocity costs influence before it costs
// territory.
package influence

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the influence system.
func System() sim.System {
	return sim.System{
		Name: "influence",
		Doc:  "turns governance, victories, and honour into influence and renown, and tracks loyalty to a leader",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[id]
		if !r.IsAlive {
			continue
		}
		// --- service ---
		// Governing competently earns influence. Competence is read from the
		// ruler's own holdings: a ruler whose towns are calm and solvent is
		// serving their side, and that is visible to the leadership without
		// anyone having to say so. A ruler with no town cannot earn service
		// income, which is why land is the route to power (RULERS.md section 3).
		service := 0.0
		townsHeld := 0
		quality := 0.0
		if r.TownID >= 0 {
			town := v.State.Towns[r.TownID]
			if town != nil {
				townsHeld = 1
				// A calm, solvent, loyal town means a competent governor.
				calm := 1 - shared.Clamp01(town.Unrest)
				solvent := shared.Clamp01(shared.SafeDiv(town.Money, shared.SafeDiv(town.Population, 1)*c.World.StartMoneyPerCapita*20))
				loyal := shared.Clamp01(town.Loyalty)
				quality = (calm + solvent + loyal) / 3
				// A merciful and generous holder governs better than their
				// treasury alone suggests, which is how traits reach outcomes.
				quality *= 0.8 + 0.4*((r.Traits.Mercy+r.Traits.Generosity)/2)
				// An honest holder's service is worth more to a leader who can
				// trust it.
				quality *= 0.9 + 0.2*r.Traits.Honor
				quality = shared.Clamp01(quality)
				w.Set(model.KindRuler, id, "service_quality", quality,
					shared.ReadString(
						shared.Pair("unrest", town.Unrest),
						shared.Pair("loyalty", town.Loyalty),
						shared.PairF("money", town.Money)),
					v.Log.RecentFor(model.KindTown, r.TownID, []string{"unrest", "loyalty", "money"}, 3), "")
			}
		}
		// Leadership overhead: being a leader is a job, and it consumes the
		// influence it generates. Without this a leader would accumulate power
		// without limit.
		if r.Leader {
			service -= c.Influence.LeadershipUpkeep
		}
		service = service * (1 - c.Influence.ServiceUnrestWeight*(1-quality)) * c.Influence.ServicePerDay
		w.Add(model.KindRuler, id, "influence", service,
			shared.ReadString(
				shared.PairI("towns_held", townsHeld),
				shared.Pair("service_quality", quality),
				shared.PairB("leader", r.Leader)),
			v.Log.RecentFor(model.KindRuler, id, []string{"service_quality", "influence", "loyalty_to_leader"}, 3),
			"service")

		// --- renown ---
		// Renown is standing earned by deeds, and it decays. A ruler nobody
		// remembers has no claim on anyone's obedience.
		renownDecay := c.Influence.RenownDecay * r.Renown
		w.Add(model.KindRuler, id, "renown", -renownDecay,
			shared.PairF("renown", r.Renown), nil, "renown fades")

		// Influence decays too, but slower: standing with a leader is fresher
		// than public fame.
		influenceDecay := c.Influence.InfluenceDecay * r.Influence
		w.Add(model.KindRuler, id, "influence", -influenceDecay,
			shared.PairF("influence", r.Influence), nil, "")

		// --- loyalty to a leader ---
		// Vassals owe service. Loyalty to the leader falls when the leader is
		// losing, because a ruler's calculation about their own future does not
		// stop at loyalty. It rises when the leader is winning, which is the
		// honest dynamic of a coalition: people join whoever is winning and
		// leave whoever is not, without anyone scripting that.
		loyalty := r.LoyaltyToLeader
		if r.Leader {
			loyalty = 1
		} else if r.SideID >= 0 {
			side := v.State.Sides[r.SideID]
			if side != nil {
				// A leader who is visibly winning keeps their vassals. A leader
				// who is exhausted, broke, or presiding over collapsing towns
				// does not, and that is chain 7's mechanism: a war that empties
				// a treasury empties a coalition before it loses a battle.
				fortune := 0.0
				fortune -= c.Influence.LoyaltyWearinessWeight * shared.Clamp01(side.WarWeariness)
				fortune -= c.Influence.LoyaltyTreasuryWeight * shared.Clamp01(side.DebtTotal/shared.SafeDiv(shared.SafeDiv(side.Treasury, 1), 1))
				fortune += c.Influence.LoyaltyVictoryWeight * shared.Clamp01(side.Stability)
				loyalty += fortune
			}
			// A ruler whose own town is collapsing stops believing in the
			// leader who cannot hold it.
			if r.TownID >= 0 {
				if town := v.State.Towns[r.TownID]; town != nil {
					loyalty -= c.Influence.LoyaltyOwnTownWeight * shared.Clamp01(town.Unrest)
					loyalty += c.Influence.LoyaltyOwnTownBonus * shared.Clamp01(town.Loyalty)
				}
			}
		}
		w.Set(model.KindRuler, id, "loyalty_to_leader", shared.Clamp01(loyalty),
			shared.ReadString(
				shared.Pair("loyalty_to_leader", r.LoyaltyToLeader),
				shared.PairB("leader", r.Leader),
				shared.PairI("side", r.SideID)),
			v.Log.RecentFor(model.KindRuler, id,
				[]string{"loyalty_to_leader", "broken_oaths", "service_quality", "influence"}, 4), "")
	}
}
