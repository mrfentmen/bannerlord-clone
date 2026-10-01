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
	"sort"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
	"mbclone/simulation/internal/systems/template"
)

// System returns the battle system.
func System() sim.System {
	return sim.System{
		Name: "battle",
		Doc:  "auto-resolves field battles between hostile parties in the same location",
		Runs: run,
	}
}

// strength computes a party's combat power. The view is taken rather than the
// party alone because a party's fighting strength depends on what it is made
// of, and that composition is shared state the template system publishes
// (Tier 6.2). Reading it is not calling into it: no decision crosses here, only
// a number the template system already committed.
func strength(v *sim.View, p *model.Party, leader *model.Leader) float64 {
	base := p.Troops
	// Morale scales effectiveness 0.5x to 1.5x.
	moraleMult := 1.0 + shared.Clamp(p.Morale, -1, 1)*0.5
	// Leader valor adds up to 30%. A party can have no leader on the state: a
	// raider band has LeaderID -1, and a map lookup of a missing key is the nil
	// pointer, so the check has to be here rather than assumed away.
	valorMult := 1.0
	if leader != nil {
		valorMult = 1.0 + leader.Traits.Valor*0.3
	}
	// What the party is made of (Tier 6.2). The same number of men is not the
	// same fighting strength: an armoured core hits harder than a skirmish
	// screen. This is a separate multiplier from the march system's speed
	// factor deliberately, so a party is not automatically at its strongest
	// where it is quickest.
	combatMult := template.CombatFactor(v, p)
	return base * moraleMult * valorMult * combatMult
}

// hostile reports whether two sides are at odds, which is the precondition for
// a field battle.
//
// The relation matrix is keyed by an unordered pair, normalised by MakePair so
// that (3,7) and (7,3) are one key. Indexing it with a hand-built Pair instead
// of going through State.SideRelation therefore looks up a key that is not
// there whenever the first id is the larger one, and a missing key reads as
// zero, which is not less than zero, so a genuinely hostile pair is silently
// treated as friendly. That is order-dependent, so the same two sides would
// fight or decline to fight depending on which party's id came first.
func hostile(v *sim.View, sideA, sideB int) bool {
	if sideA < 0 || sideB < 0 {
		// An unaffiliated party, such as a raider band, is on nobody's side and
		// so is hostile to nobody.
		return false
	}
	if sideA == sideB {
		return false
	}
	return v.State.SideRelation(sideA, sideB) < 0
}

// findPair picks the two parties that fight in one town: the strongest hostile
// pair present, meaning the pair with the greatest combined strength. Everyone
// else is a bystander this tick.
//
// It enumerates hostile pairs rather than picking the strongest party and then
// looking for an enemy of it, because the second approach quietly loses
// battles. Anchoring on the strongest party means that party must be one of
// the two, so a town whose strongest force has no enemy present fights nothing
// at all, even when two weaker rivals in the same town are at each other's
// throats. An unaffiliated raider band that happens to be the largest thing in
// town suppresses every real battle in it, because no side is hostile to a
// side of -1.
//
// Comparing pairs is also symmetric, so which party becomes the attacker
// cannot depend on the order the parties were visited in, and no candidate is
// discarded before it has been weighed against an enemy.
//
// Ties go to the first pair found, and pids is in ascending order, so a town
// with two equally strong hostile pairs always resolves the same way.
func findPair(v *sim.View, pids []int) (*model.Party, float64, *model.Party, float64) {
	var bestA, bestB *model.Party
	bestStrA, bestStrB, bestTotal := 0.0, 0.0, 0.0
	for i, pidA := range pids {
		pa := v.State.Parties[pidA]
		if pa == nil {
			continue
		}
		strA := strength(v, pa, v.State.Leaders[pa.LeaderID])
		for _, pidB := range pids[i+1:] {
			pb := v.State.Parties[pidB]
			if pb == nil || !hostile(v, pa.SideID, pb.SideID) {
				continue
			}
			strB := strength(v, pb, v.State.Leaders[pb.LeaderID])
			total := strA + strB
			if total <= bestTotal {
				continue
			}
			// The stronger party is the attacker, so the cause log's
			// attacker and defender records mean what they say. Equal
			// strengths keep the ascending id first, which is reproducible.
			if strA >= strB {
				bestA, bestStrA, bestB, bestStrB = pa, strA, pb, strB
			} else {
				bestA, bestStrA, bestB, bestStrB = pb, strB, pa, strA
			}
			bestTotal = total
		}
	}
	return bestA, bestStrA, bestB, bestStrB
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
		// A destination that names no town is a party marching into somewhere
		// that no longer exists, and there is nothing to fight over.
		if v.State.Towns[p.DestTown] == nil {
			continue
		}
		byTown[p.DestTown] = append(byTown[p.DestTown], pid)
	}
	// Towns are visited in ascending id order. A map range in Go is
	// deliberately randomised, and every battle below draws from this tick's
	// substream, so an unsorted range would hand each town a different set of
	// rolls on every run. That is the reproducibility guarantee (AI.md
	// section 1) failing through a loop rather than through a decision.
	townIDs := make([]int, 0, len(byTown))
	for townID := range byTown {
		townIDs = append(townIDs, townID)
	}
	sort.Ints(townIDs)
	for _, townID := range townIDs {
		pids := byTown[townID]
		if len(pids) < 2 {
			continue
		}
		// The two strongest hostile parties fight; others are bystanders this
		// tick. With no hostile pair there is no battle, which is the common
		// case in a town holding one side's parties.
		pa, bestStrA, pb, bestStrB := findPair(v, pids)
		if pa == nil || pb == nil {
			continue
		}
		la, lb := v.State.Leaders[pa.LeaderID], v.State.Leaders[pb.LeaderID]
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
		var winnerLeader, loserLeader *model.Leader
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
			shared.Pair("attacker_template", float64(winner.Template)),
			shared.Pair("loser_template", float64(loser.Template)),
		)
		causes := v.Log.RecentFor(model.KindParty, winner.ID,
			[]string{"troops", "morale"}, 3)
		// Casualties: split into killed vs wounded based on medicine.
		// Better medicine = more wounded (recoverable) vs killed (permanent).
		// Base: 50% of casualties are wounded; +up to 30% with full medicine.
		winnerWoundedFrac := 0.5 + 0.3*(winner.Medicine/100.0)
		if winnerWoundedFrac > 0.8 {
			winnerWoundedFrac = 0.8
		}
		loserWoundedFrac := 0.5 + 0.3*(loser.Medicine/100.0)
		if loserWoundedFrac > 0.8 {
			loserWoundedFrac = 0.8
		}
		winnerWounded := winnerLoss * winnerWoundedFrac
		loserWounded := loserLoss * loserWoundedFrac

		// Troops lose the total casualties (killed + wounded).
		// Wounded go to the wounded pool (recoverable via medicine).
		// Killed are permanent losses.
		w.Add(model.KindParty, winner.ID, "troops", -winnerLoss,
			read, causes, "battle casualties")
		w.Add(model.KindParty, winner.ID, "wounded", winnerWounded,
			read, causes, "battle wounded")
		w.Add(model.KindParty, loser.ID, "troops", -loserLoss,
			read, causes, "battle casualties")
		w.Add(model.KindParty, loser.ID, "wounded", loserWounded,
			read, causes, "battle wounded")
		// Victor gains renown; feeds clan renown (Tier 1).
		if winnerLeader != nil {
			renownGain := c.Battle.RenownPerVictory * (1.0 + (1.0 - winnerShare))
			w.Add(model.KindLeader, winnerLeader.ID, "renown", renownGain,
				read, causes, "battle victory")
			// Clan renown too.
			if winnerLeader.OrganizationID >= 0 {
				if cl := v.State.Organizations[winnerLeader.OrganizationID]; cl != nil {
					w.Add(model.KindOrganization, cl.ID, "clan_renown",
						c.Clan.RenownPerVictory, read, causes,
						"clan member victory")
				}
			}
			// The registered field name is renown_victories; "victories" is its
			// display unit. Staging the unit as the name would fail the field
			// registry check and abort the tick.
			w.Add(model.KindLeader, winnerLeader.ID, "renown_victories", 1,
				read, causes, "battle victory")
		}
		// Defeated leader may be captured. A capture names the captor, so
		// there is nothing to write when the winner has no leader on the
		// state: a raider band that wins has no ruler to hold anyone.
		if winnerLeader != nil && loserLeader != nil &&
			loser.Troops-loserLoss < c.Battle.CaptureThreshold*loser.Troops {
			if v.Rng.Chance(c.Battle.CaptureChance) {
				w.Set(model.KindLeader, loserLeader.ID, "captured_by",
					float64(winnerLeader.ID), read, causes,
					"captured in battle")
			}
		}
	}
}
