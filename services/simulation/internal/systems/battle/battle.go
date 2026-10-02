// Package battle auto-resolves field battles between opposing parties
// (Tier 4).
//
// When parties from hostile sides occupy the same town or are adjacent,
// this system resolves the engagement: it computes relative strength from
// troops, morale, and leader skill, applies casualties to both sides, and
// determines a victor. The victor's leader gains renown (feeding clan
// renown, Tier 1); the defeated leader may be captured.
//
// Casualties are also decided by what the winner is armed with. A blunt weapon
// takes men alive instead of killing them, so a share of the loser's casualties
// becomes prisoners in chains rather than corpses, which turns the victor's
// template into a loadout choice with an economic payoff (Tier 6.2 weapon
// classes, docs/missing-vs-bannerlord.md item 2.4).
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
//
// Everything here is a property of one army: how many men, how steady, how
// experienced, what they are made of. Nothing here depends on who is opposite,
// because a matchup is a property of two parties and strength is called once
// per party, from inside findPair's pair enumeration, before either of the two
// has been chosen. The formation bonus is applied in the resolution loop where
// both templates are in hand; see matchupBonus.
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
	// Troop XP: every 100 XP = +1% effectiveness, capped at +50%.
	// Veterans hit harder than green recruits.
	xpMult := 1.0 + shared.Clamp(p.TroopXP/100.0*0.01, 0, 0.5)
	// Cohesion: 0.7x to 1.0x. A fracturing army fights poorly.
	cohesionMult := 0.7 + 0.3*shared.Clamp(p.Cohesion, 0, 1)
	// What the party is made of (Tier 6.2). The same number of men is not the
	// same fighting strength: an armoured core hits harder than a skirmish
	// screen. This is a separate multiplier from the march system's speed
	// factor deliberately, so a party is not automatically at its strongest
	// where it is quickest.
	combatMult := template.CombatFactor(v, p)
	return base * moraleMult * valorMult * xpMult * cohesionMult * combatMult
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

// weaponClass reports the weapon class a party fights with.
//
// It is a pure function of the party's template, so it is read out of the
// balance table rather than held as a field on the party. A party field would
// be a second copy of something party_template already determines, and the only
// way the two could disagree is if one of them went stale, in which case the
// battle would resolve on one value and the cause log would explain it with the
// other.
//
// The index is bounds-checked rather than assumed. A party whose template is
// outside the table would index past the end of it and panic the tick, and a
// party with a corrupt template should fight with a sharp weapon rather than
// stop the world.
func weaponClass(v *sim.View, p *model.Party) model.WeaponClass {
	if p.Template < 0 || int(p.Template) >= model.TemplateCount {
		return model.WeaponPiercing
	}
	return v.Cfg.Template.WeaponOfTemplate[p.Template]
}

// bluntCaptureShare returns the share of a defeated party's casualties the
// victor takes alive instead of killing, which is nonzero only for a blunt
// weapon.
//
// The question is asked of the victor, not of the party findPair nominated as
// attacker. findPair calls the stronger of the two the attacker, and the
// stronger party can still lose, and a party that is losing is still fighting:
// it holds nobody. Asking the winner is also what makes the rule mean what a
// player expects, that the side winning a fight walks away with men in chains
// when its men are armed with clubs and walks away with bodies when they are
// armed with swords.
//
// The share is clamped rather than trusted because it multiplies a casualty
// count: a balance file that raised it past one would otherwise hand a victor
// more prisoners than there were men to take, which is the one number in this
// system that has to be impossible rather than merely unlikely.
func bluntCaptureShare(v *sim.View, winner *model.Party) float64 {
	if weaponClass(v, winner) != model.WeaponBlunt {
		return 0
	}
	return shared.Clamp01(v.Cfg.Battle.BluntCaptureShare)
}

// matchupBonus returns how much stronger a party fighting in shape `self` is
// against a party fighting in shape `other`, from the balance table.
//
// Two decisions are baked into the signature, and both of them are the reason
// this is a function taking two shapes rather than one party.
//
// The first is that the table is antisymmetric: the same call with the
// arguments the other way round returns the reciprocal, and the config
// validator refuses a table where the two do not multiply to one. A matchup is
// a relative advantage, so a stance line that holds against a mounted wing is
// saying the mounted wing does not hold against the line. A directional table
// would let both cells read above one, and then meeting would make both armies
// stronger, which is not a matchup and cannot change who wins a fight between
// equal armies.
//
// The second is that `self` is the nominal attacker, which findPair nominates as
// the stronger of the two before the fight is resolved. That is deliberate and
// it is the trap in this function: the stronger party is not always the winner,
// so reading the cell by "who won" would make the multiplier a function of the
// answer. The call sites always pass the same order, attacker first, and
// TestMatchupIsReadAsAttackerVersusDefender pins that by reading the two
// orientations out of the cause log.
//
// The shape comes from the published class counts rather than from
// party_template, so a party mid-refit, or one whose counts have drifted from
// its template, is matched on what it is made of. A shape outside the table
// cannot be indexed and is treated as neutral rather than allowed to panic the
// tick, for the same reason weaponClass is bounds-checked.
func matchupBonus(v *sim.View, self, other model.PartyTemplate) float64 {
	if self < 0 || int(self) >= model.TemplateCount ||
		other < 0 || int(other) >= model.TemplateCount {
		return 1
	}
	return v.Cfg.Battle.FormationBonus[self][other]
}

// shapeOf is the template a party is actually fighting in, as published class
// counts rather than as the party_template field.
func shapeOf(v *sim.View, p *model.Party) model.PartyTemplate {
	return template.Shape(v, p)
}

// situational applies every modifier that depends on the encounter rather than
// on one army, and clamps the product.
//
// The clamp is the reason this is one function rather than two multiplications
// in the resolution loop. The matchup table and the terrain table are each
// within their own validated range, and their product is not: 2.0 times 2.0 is
// four, and a designer raising one of them has no way to see the other. The
// band comes from the balance file for the same reason, so the limit on how far
// ground and formation may depart from an even fight is a balance decision and
// not a constant in a line of Go.
func situational(v *sim.View, product float64) float64 {
	c := v.Cfg.Battle
	return shared.Clamp(product, c.SituationalClampMin, c.SituationalClampMax)
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
		// Blunt capture: a club beats a man down and he comes back in chains,
		// where a sword finishes him. Only a blunt victor takes prisoners, and
		// it takes them out of the casualty pool rather than in addition to it,
		// so every casualty is exactly one of three things: killed, wounded, or
		// captive. Adding the captives on top would make the loser's wounded and
		// the winner's chains the same men counted twice, and the attrition
		// system would eventually hand a man in chains back to the loser as a
		// recovered wound.
		captured := loserLoss * bluntCaptureShare(v, winner)
		winnerWounded := winnerLoss * winnerWoundedFrac
		// What is left of the loser's casualties once the captives are set
		// aside is the pool medicine splits between wounded and killed, so the
		// three shares still sum to the casualties that fell.
		loserWounded := (loserLoss - captured) * loserWoundedFrac

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
		// The captives join the victor's own prisoner count, which the prisoner
		// system already reads: it builds their conformity and feeds them, so a
		// blunt column's prisoners are a second recruitment pool that costs food
		// to hold. Nothing else has to learn that battles produce prisoners.
		//
		// Unlike a captured ruler, a captured rank of file names no captor and
		// needs no leader on the state, so a raider band that wins can hold men
		// even though it has nobody to ransom them for.
		if captured > 0 {
			// Its own read string rather than the battle's shared one: this row
			// has to be readable on its own in the Why panel, and the chain that
			// explains it is the winner's template and the weapon class that
			// template carries, not the strength figures the casualty rows quote.
			captureRead := shared.ReadString(
				shared.Pair("winner_template", float64(winner.Template)),
				shared.Pair("weapon_class", float64(weaponClass(v, winner))),
				shared.Pair("casualties", loserLoss),
				shared.Pair("captured", captured),
			)
			w.Add(model.KindParty, winner.ID, "prisoners", captured,
				captureRead, causes, "battle prisoners: blunt weapons take men alive")
		}
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
		// Troop XP: winners gain XP based on enemy casualties inflicted;
		// losers gain a smaller participation amount. XP improves future
		// combat effectiveness (Tier 5.5).
		winnerXP := loserLoss * 0.5
		loserXP := winnerLoss * 0.2
		w.Add(model.KindParty, winner.ID, "troop_xp", winnerXP,
			read, causes, "battle experience")
		w.Add(model.KindParty, loser.ID, "troop_xp", loserXP,
			read, causes, "battle experience")
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
