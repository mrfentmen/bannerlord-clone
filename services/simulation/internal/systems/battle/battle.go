// Package battle auto-resolves field battles between opposing parties
// (Tier 4).
//
// When parties from hostile sides occupy the same town or are adjacent,
// this system resolves the engagement: it computes relative strength from
// troops, morale, and leader skill, applies casualties to both sides, and
// determines a victor. The victor's leader gains renown (feeding clan
// renown, Tier 1); the defeated leader may be captured.
//
// This is the simulation's combat resolution. The 3D client will render
// battles, but the simulation must resolve them deterministically whether
// or not a player is watching.
package battle

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the battle system.
func System() sim.System {
	return sim.System{
		Name: "battle",
		Doc:  "auto-resolves field battles between hostile parties in the same location",
		Runs: run,
	}
}

// strength computes a party's combat power.
func strength(p *model.Party, leader *model.Ruler) float64 {
	base := p.Troops
	// Morale scales effectiveness 0.5x to 1.5x.
	moraleMult := 1.0 + shared.Clamp(p.Morale, -1, 1)*0.5
	// Leader valor adds up to 30%.
	valorMult := 1.0
	if leader != nil {
		valorMult = 1.0 + leader.Traits.Valor*0.3
	}
	return base * moraleMult * valorMult
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	// Group parties by location (town).
	byTown := make(map[int][]int)
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.Troops <= 0 || p.DestTown < 0 {
			continue
		}
		byTown[p.DestTown] = append(byTown[p.DestTown], pid)
	}
	for townID, pids := range byTown {
		if len(pids) < 2 {
			continue
		}
		// Find hostile pairs. For simplicity, the two strongest hostile
		// parties fight; others are bystanders this tick.
		var bestA, bestB int = -1, -1
		bestStrA, bestStrB := 0.0, 0.0
		for _, pid := range pids {
			p := v.State.Parties[pid]
			leader := v.State.Rulers[p.RulerID]
			s := strength(p, leader)
			// Check hostility against current best.
			hostile := false
			if bestA >= 0 {
				pa := v.State.Parties[bestA]
				if v.State.SideRelations[model.Pair{A: pa.SideID, B: p.SideID}] < 0 {
					hostile = true
				}
			}
			if bestA < 0 || (hostile && s > bestStrA) {
				bestA, bestStrA = pid, s
			} else if bestB < 0 || s > bestStrB {
				// Check if hostile to A.
				pa := v.State.Parties[bestA]
				if v.State.SideRelations[model.Pair{A: pa.SideID, B: p.SideID}] < 0 {
					bestB, bestStrB = pid, s
				}
			}
		}
		if bestA < 0 || bestB < 0 {
			continue
		}
		pa, pb := v.State.Parties[bestA], v.State.Parties[bestB]
		la, lb := v.State.Rulers[pa.RulerID], v.State.Rulers[pb.RulerID]
		// Resolve: casualty rate scales with the loser's relative weakness.
		// The winner takes 10-30% casualties; the loser 40-80%.
		total := bestStrA + bestStrB
		if total <= 0 {
			continue
		}
		shareA := bestStrA / total
		// Add randomness: ±20%.
		roll := v.Rng.Range(0.8, 1.2)
		// Determine winner.
		aWins := shareA*roll > 0.5
		var winner, loser *model.Party
		var winnerLeader, loserLeader *model.Ruler
		var winnerShare float64
		if aWins {
			winner, loser = pa, pb
			winnerLeader, loserLeader = la, lb
			winnerShare = shareA
		} else {
			winner, loser = pb, pa
			winnerLeader, loserLeader = lb, la
			winnerShare = 1 - shareA
		}
		// Casualties.
		winnerLoss := winner.Troops * v.Rng.Range(0.1, 0.3) * (1.5 - winnerShare)
		loserLoss := loser.Troops * v.Rng.Range(0.4, 0.8)
		read := shared.ReadString(
			shared.Pair("attacker_strength", bestStrA),
			shared.Pair("defender_strength", bestStrB),
			shared.PairI("town", townID),
		)
		causes := v.Log.RecentFor(model.KindParty, winner.ID,
			[]string{"troops", "morale"}, 3)
		w.Add(model.KindParty, winner.ID, "troops", -winnerLoss,
			read, causes, "battle casualties")
		w.Add(model.KindParty, loser.ID, "troops", -loserLoss,
			read, causes, "battle casualties")
		// Victor gains renown; feeds clan renown (Tier 1).
		if winnerLeader != nil {
			renownGain := c.Battle.RenownPerVictory * (1.0 + (1.0-winnerShare))
			w.Add(model.KindRuler, winnerLeader.ID, "renown", renownGain,
				read, causes, "battle victory")
			// Clan renown too.
			if winnerLeader.ClanID >= 0 {
				if cl := v.State.Clans[winnerLeader.ClanID]; cl != nil {
					w.Add(model.KindClan, cl.ID, "clan_renown",
						c.Clan.RenownPerVictory, read, causes,
						"clan member victory")
				}
			}
			w.Add(model.KindRuler, winnerLeader.ID, "victories", 1,
				read, causes, "battle victory")
		}
		// Defeated leader may be captured.
		if loserLeader != nil && loser.Troops-loserLoss < c.Battle.CaptureThreshold*loser.Troops {
			if v.Rng.Float64() < c.Battle.CaptureChance {
				w.Set(model.KindRuler, loserLeader.ID, "captured_by",
					float64(winnerLeader.ID), read, causes,
					"captured in battle")
			}
		}
	}
}
