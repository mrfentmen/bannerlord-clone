// Package prisoner models captive handling (Tier 2.3, 1.8).
//
// In Bannerlord, defeated lords can be taken prisoner. Prisoners can be:
//   - Ransomed for money
//   - Executed (the nuclear political option - destroys relations)
//   - Recruited via conformity (a second recruitment economy)
//
// Modern American equivalent: captured enemy leaders are detained.
// They can be ransomed, released, or (in extreme cases) eliminated.
// High-value detainees can be turned through persuasion.
//
// Mechanics:
//   - Parties have a Prisoners count (captured troops/leaders).
//   - Conformity builds over time: prisoners gradually become recruitable.
//   - Recruiting prisoners costs morale (your troops distrust turncoats).
//   - Executing a leader prisoner: massive relation penalty with their
//     faction, but removes a dangerous enemy.
//   - Ransoming: converts prisoners to money.
//
// This system handles the background conformity gain and the political
// consequences. The actual capture happens in the battle system.
package prisoner

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// conformityPerDay is the daily conformity gain for prisoners.
	conformityPerDay = 0.05
	// recruitMoraleCost is the morale cost per prisoner recruited.
	recruitMoraleCost = 0.02
	// executionRelationPenalty is the relation hit for executing a leader.
	executionRelationPenalty = 0.5
	// ransomPerPrisoner is the money gained per prisoner ransomed.
	ransomPerPrisoner = 100.0
)

// System returns the prisoner system.
func System() sim.System {
	return sim.System{
		Name: "prisoner",
		Doc:  "prisoner conformity, recruitment, ransom, and execution consequences",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	// Default values if config is nil (e.g., in tests).
	deathRate := 0.05
	conformityDrop := 0.20
	foodUpkeep := 0.10
	if c != nil {
		deathRate = c.RulerAI.PrisonerStarvationDeathRate
		conformityDrop = c.RulerAI.PrisonerStarvationConformityDrop
		foodUpkeep = c.RulerAI.PrisonerFoodUpkeep
	}
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.Prisoners <= 0 {
			continue
		}
		// Conformity builds over time. Prisoners gradually become willing
		// to join. This is a background drift; actual recruitment is a
		// player/AI order.
		read := shared.ReadString(
			shared.Pair("prisoners", p.Prisoners),
			shared.Pair("conformity", p.PrisonerConformity),
		)
		causes := v.Log.RecentFor(model.KindParty, pid,
			[]string{"prisoners"}, 3)

		newConformity := p.PrisonerConformity + conformityPerDay
		if newConformity > 1 {
			newConformity = 1
		}
		if newConformity != p.PrisonerConformity {
			w.Set(model.KindParty, pid, "prisoner_conformity",
				newConformity, read, causes, "prisoner conformity grows")
		}

		// Prisoners consume food (they need to eat).
		//
		// The registered field name is party_food. A write to "food" is not a
		// field that happens to be missing, it is a name the party kind does not
		// have, and the engine rejects it by aborting the tick, so a party with
		// prisoners in it would stop the world rather than cost its owner
		// something. Nothing set prisoners before battles began taking men
		// alive, which is why this sat here doing nothing.
		foodCost := p.Prisoners * foodUpkeep
		if foodCost > 0 {
			w.Add(model.KindParty, pid, "party_food", -foodCost, read, causes,
				"prisoners consume food")
		}

		// Starvation check: if the party has no food, prisoners starve.
		// Conformity drops fast and prisoners may die or escape.
		if p.Prisoners > 0 && p.Food <= 0 {
			// Conformity collapses when unfed.
			w.Add(model.KindParty, pid, "prisoner_conformity", -conformityDrop,
				read, causes, "prisoners starving: conformity collapses")
			// Prisoners die per day without food (configurable rate).
			deaths := p.Prisoners * deathRate
			if deaths >= 1 {
				w.Add(model.KindParty, pid, "prisoners", -deaths,
					read, causes, "prisoners starved to death")
			}
		}

		// Broken prisoners: at 0 conformity, prisoners die from despair.
		// This is separate from starvation; even fed prisoners with 0 conformity
		// are at risk.
		if p.Prisoners > 0 && p.PrisonerConformity <= 0 {
			deaths := p.Prisoners * 0.02 // 2% per day at 0 conformity
			if deaths >= 1 {
				w.Add(model.KindParty, pid, "prisoners", -deaths,
					read, causes, "prisoners died from despair (0 conformity)")
			}
		}
	}
}
