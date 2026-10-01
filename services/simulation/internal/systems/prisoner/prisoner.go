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
		foodCost := p.Prisoners * 0.1
		if foodCost > 0 {
			w.Add(model.KindParty, pid, "food", -foodCost, read, causes,
				"prisoners consume food")
		}
	}
}
