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
//
// # What decides a fight
//
// Four numbers, and every one of them is read rather than assumed:
//
//   - The two armies' strengths, which are a function of one army each: men,
//     morale, leader valor, experience, cohesion, and what they are made of.
//   - The formation matchup, which is a function of the two armies: a stance
//     line holds a mounted wing, and the table is antisymmetric so exactly one
//     side of a pairing is favoured.
//   - The ground, which is a function of the town and of each army's
//     composition: the pass is worth more to a line than to a horse column.
//
// The two situational terms are applied in the resolution loop rather than
// inside strength, because strength is called from findPair while it is still
// weighing candidate pairs and has no opponent to match against yet. Their
// product is clamped into a band from the balance file, since the two tables
// are tuned independently and a designer who has not read the other one should
// not be able to produce an army that is orders of magnitude stronger than the
// one opposite it.
//
// # Which ground a battle is fought on
//
// A battle happens in a town, and the ground is the town's own terrain. The
// nearest-route rule the template, march, and attrition systems each keep a
// copy of was considered and not used, for two reasons. It would be a fourth
// copy of a scan three systems already have to keep identical by hand, and the
// comment in the template package that says so would stop being true. And it
// answers the wrong question: a town on a river plain with one mountain road
// running to it comes out as mountain ground, which is worse than the plain it
// is standing on. Reading the field the generator already fills in is one lookup,
// with no tie-breaking rule to copy and no way for this system's idea of the
// ground to disagree with the world's.
//
// One consequence is worth stating because it looks like a bug and is not. The
// terrain table is per template and not per side, because the ground does not
// take sides: both armies are standing on it. So between two armies of the same
// template the terrain term cancels in the ratio and cannot change the winner,
// and ground decides fights between unlike armies. Making it decide fights
// between identical ones would need an asymmetric term, and there is no honest
// way to make the ground favour one of two armies that are the same kind of
// army.
package battle

import (
	"math"
	"sort"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
	"mbclone/simulation/internal/systems/template"
)

// routEventName is the cause-log event a rout is staged as, and the field the
// event is filed under. The panic rows it causes cite it by id, which is the only
// way a Why query on a neighbouring army's morale reaches the rout that took it:
// the neighbouring army's row is written in the same tick as the rout, so it
// cannot cite a log row that does not exist yet.
const routEventName = "battle rout"

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
		// A broken army does not fight. It is skipped here rather than in the
		// resolution loop so that findPair never nominates one, which is what
		// keeps a routed party from winning a fight it declined to have.
		if broken(v, pa) {
			continue
		}
		strA := strength(v, pa, v.State.Leaders[pa.LeaderID])
		for _, pidB := range pids[i+1:] {
			pb := v.State.Parties[pidB]
			if pb == nil || !hostile(v, pa.SideID, pb.SideID) {
				continue
			}
			if broken(v, pb) {
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

// terrainOf returns the ground a battle in this town is fought on.
//
// The ground is the town's own. model.Town has carried a Terrain field since the
// entity was written, and the world generator decides it for every settlement it
// places, but nothing copied it onto the town and nothing could read it, so the
// field was dead: a real, populated number that no code path could reach.
//
// The alternative, and the one this function was expected to use, is the
// nearest-route scan that the template, march, and attrition systems each keep
// their own copy of. It was rejected on purpose. A town standing on a river
// plain with one mountain road to it would come out as mountain ground, which is
// a worse answer than the plain it is actually on, and it would be a fourth copy
// of a rule that three systems already have to keep identical by hand. Reading
// the town's own ground is one lookup with no scan, no tie-breaking rule to
// copy, and no way for the battle's idea of the ground to disagree with the
// world's.
//
// A town whose ground is outside the enum is treated as plain rather than
// indexing the table with it, for the same reason weaponClass is bounds-checked:
// a corrupt number must not stop a fight.
func terrainOf(v *sim.View, townID int) int {
	t := v.State.Towns[townID]
	if t == nil {
		return model.TerrainPlain
	}
	if t.Terrain < 0 || t.Terrain >= model.TerrainCount {
		return model.TerrainPlain
	}
	return t.Terrain
}

// terrainBonus returns what the ground is worth to a party fighting in this
// shape on it.
//
// The table is per template and not per terrain alone, because ground suits
// some kinds of soldier more than others: the trees are the skirmish screen's,
// and a horse is close to useless in a mountain pass. The table is symmetric, so
// the same cell is read for both parties, and the two figures cancel in the
// ratio between two armies of the same template. That is why the shape is
// multiplied into strength rather than the terrain being a flat bonus to one
// side: a flat bonus would move both strengths by the same factor and change
// nothing at all, which is a term that looks like a mechanic and is not one.
//
// The product with the formation matchup is clamped by situational, because
// these two tables are tuned independently and a designer who has not looked at
// the other one should not be able to produce an army that is orders of magnitude
// stronger than the one opposite it.
func terrainBonus(v *sim.View, terrain int, shape model.PartyTemplate) float64 {
	if shape < 0 || int(shape) >= model.TemplateCount {
		return 1
	}
	if terrain < 0 || terrain >= model.TerrainCount {
		return 1
	}
	return v.Cfg.TerrainCombat.PerTemplate[terrain][shape]
}

// broken reports whether an army has routed: its morale is at or below the
// threshold in the balance file.
//
// The test is >=, so the threshold itself counts as broken. An army at exactly
// the configured line is an army that has just got there, and a rule that needed
// it to be one ten-thousandth lower would be a rule with a knife edge in it.
//
// This is a pure function of committed morale, which is what makes the rout flag
// derivable rather than latched: see markRouted.
func broken(v *sim.View, p *model.Party) bool {
	return p.Morale <= v.Cfg.Battle.RoutMoraleThreshold
}

// markRouted brings one party's rout flag into line with its morale.
//
// The flag is recomputed rather than latched, and that is the whole design of
// the rout state machine: there is none. An army recovers morale through the
// supply, upkeep, and march systems, and the tick its morale comes back above
// the threshold is the tick it is a candidate to fight in again. A latched flag
// would need something to clear it, and the something would have to be a system
// calling into the battle system, which is the coupling the constitution forbids.
//
// The write is staged only on a change, so a settled world pays nothing for the
// flag and the cause log gets a row exactly when the state of the army changes.
func markRouted(v *sim.View, w *sim.WriteSet, p *model.Party) {
	is := broken(v, p)
	if is == p.Routed {
		return
	}
	read := shared.ReadString(
		shared.Pair("morale", p.Morale),
		shared.Pair("rout_threshold", v.Cfg.Battle.RoutMoraleThreshold),
		shared.PairF("troops", p.Troops),
	)
	causes := v.Log.RecentFor(model.KindParty, p.ID, []string{"morale", "troops"}, 3)
	note := "the army holds: morale is back above the rout threshold"
	if is {
		note = "battle rout: the army has broken and stops fighting"
	}
	w.Set(model.KindParty, p.ID, "routed", boolFlag(is), read, causes, note)
}

func boolFlag(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

// fleeMen is how many men walk off the field when an army breaks.
//
// It is rounded to whole men here rather than left as a share, because troops is
// a whole-number field and a share of one man is not a fraction of a man: the
// engine would round it, and a routed share that rounds to zero would be a rout
// that costs nobody anything, which is the one outcome a rout must not have.
//
// The share is also capped so that at least one man is left standing. Casualties
// alone never take a party to zero troops, because the loser's loss rate tops out
// below one; letting flight break that would erase a party from the map in a
// single tick, and a party that has been erased cannot be shown to have run.
func fleeMen(troops, share float64) float64 {
	if troops <= 0 || share <= 0 {
		return 0
	}
	fled := math.Round(troops * share)
	if fled < 1 {
		fled = 1
	}
	if cap := troops - 1; fled > cap {
		if cap < 1 {
			return 0
		}
		fled = cap
	}
	return fled
}

// panicSpread takes morale from every other army of the broken army's side
// standing in the same town.
//
// This is the mechanic COMBAT.md section 6 asks for and the reason rout matters
// beyond one army's roster: routing troops spread panic, so a defeat in one
// corner of a town can break the rest of the army in the same day. It is applied
// in the same tick rather than the next one, which is a deliberate choice.
//
// The alternatives were a persisted flag and a second tick of effects, or no
// propagation at all. Same-tick propagation was chosen because the cost is
// bounded by the number of armies in one town, which is small and already
// enumerated by the loop this runs in; because the effect is a cause-log row that
// cites the rout, so the Why panel walks from a broken army to the army that
// broke beside it; and because the next-tick version is a state machine with its
// own flag, its own recovery rule, and its own way to be got wrong, for the sake
// of a one-day delay nobody would notice. Recorded in CHANGELOG.md under
// Decisions.
//
// Only the broken army's own side is hit. Panic is not something that spreads
// between enemies of the loser, and an unaffiliated band such as a raider group
// has no side to spread it within, so it is left alone.
func panicSpread(v *sim.View, w *sim.WriteSet, routed *model.Party, townPids []int,
	read string, causedBy []int) {
	per := v.Cfg.Battle.RoutPanicPerRout
	if per <= 0 {
		return
	}
	for _, pid := range townPids {
		if pid == routed.ID {
			continue
		}
		other := v.State.Parties[pid]
		if other == nil || other.SideID < 0 || other.SideID != routed.SideID {
			continue
		}
		if broken(v, other) {
			// Already broken. There is nothing to panic about in an army that
			// has run, and the flag is already set, so a write here would be a
			// row saying nothing changed.
			continue
		}
		w.Add(model.KindParty, other.ID, "morale", -per, read, causedBy,
			"panic: the army beside it broke")
	}
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
		// Every army standing in a contested town is either broken or fighting,
		// so the rout flag is settled for all of them before anybody is picked.
		// A broken army is not a candidate: it is not fighting, and letting it
		// attack would let an army that has run win the town it ran from.
		for _, pid := range pids {
			if p := v.State.Parties[pid]; p != nil {
				markRouted(v, w, p)
			}
		}
		// The two strongest hostile parties fight; others are bystanders this
		// tick. With no hostile pair there is no battle, which is the common
		// case in a town holding one side's parties.
		pa, bestStrA, pb, bestStrB := findPair(v, pids)
		if pa == nil || pb == nil {
			continue
		}
		la, lb := v.State.Leaders[pa.LeaderID], v.State.Leaders[pb.LeaderID]
		// The two situational terms, applied once per side with both shapes and
		// the ground in hand. They are deliberately not inside strength():
		// strength is called from findPair while it is still comparing candidate
		// pairs, when there is no opponent to match against yet and no ground to
		// fight on, and applying them there would give the loser's penalty and
		// the winner's bonus to both sides of every candidate it weighed.
		//
		// findPair already nominated pa as the attacker, so pa's matchup cell is
		// read first and pb's second, every time, whichever party happens to be
		// stronger. The two cells are reciprocals, so the pair is unaffected as a
		// whole and only the balance between them moves. The ground is read once
		// for the town, because both armies are standing on it.
		shapeA, shapeB := shapeOf(v, pa), shapeOf(v, pb)
		terrain := terrainOf(v, townID)
		// The two terms kept apart as well as multiplied, because the Why panel
		// has to be able to say which of the two did the work: "your line was
		// worth 1.3 against his cavalry and 1.2 on this ground" is a different
		// statement from "you were 1.044 times his strength".
		matchupCellA := matchupBonus(v, shapeA, shapeB)
		matchupCellB := matchupBonus(v, shapeB, shapeA)
		groundA := terrainBonus(v, terrain, shapeA)
		groundB := terrainBonus(v, terrain, shapeB)
		modA := situational(v, matchupCellA*groundA)
		modB := situational(v, matchupCellB*groundB)
		strA := bestStrA * modA
		strB := bestStrB * modB
		// Resolve: casualty rate scales with the loser's relative weakness.
		// The winner takes 10-30% casualties; the loser 40-80%.
		total := strA + strB
		if total <= 0 {
			continue
		}
		shareA := strA / total
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
			// The strengths are the post-matchup figures, because those are the
			// numbers the decision below was made on. Quoting the pre-matchup
			// ones here would make the panel explain a result with inputs the
			// system did not use.
			shared.Pair("attacker_strength", strA),
			shared.Pair("defender_strength", strB),
			shared.PairI("town", townID),
			// Note the two senses of "attacker" in one read string, which is
			// pre-existing and deliberate on the first pair: attacker_template
			// and loser_template name the winner and the defeated party, because
			// that is what the cause rows are about. The matchup_* keys name the
			// nominal attacker, which is findPair's nomination and is not always
			// the winner. They are prefixed so that a reader does not have to
			// guess which is which.
			shared.Pair("attacker_template", float64(winner.Template)),
			shared.Pair("loser_template", float64(loser.Template)),
			// The formation figures the two strengths already include, so the
			// Why panel can show what the shapes of the two armies did rather
			// than only that one side came out ahead. The shapes are the class
			// counts, not party_template, and can differ from the templates
			// above for a party mid-refit.
			shared.Pair("matchup_attacker_shape", float64(shapeA)),
			shared.Pair("matchup_defender_shape", float64(shapeB)),
			// The ground, and each of the two terms separately from the product
			// the strengths above used. A fight in a mountain pass that reads as
			// having taken place on a plain is a result the player cannot be shown
			// the reason for, and a single combined figure cannot be taken apart
			// again to show which table was responsible.
			shared.PairI("terrain", terrain),
			shared.Pair("attacker_matchup", matchupCellA),
			shared.Pair("defender_matchup", matchupCellB),
			shared.Pair("terrain_attacker", groundA),
			shared.Pair("terrain_defender", groundB),
			shared.Pair("attacker_modifier", modA),
			shared.Pair("defender_modifier", modB),
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
		//
		// Rout adds a fourth fate, and it is taken out of the pool for the same
		// reason. A man who ran was never in the fight, so counting him as a
		// casualty would put the same man in the casualty pool and off the
		// roster: the casualty arithmetic below would be describing a battle
		// that was larger than the one that happened. The men who run come off
		// Troops; the men who stood take casualties out of what is left.
		//
		// The test is against the loser's morale *after* the defeat, not before
		// it, and that is the only way the mechanic can fire at all. broken()
		// excludes an army from the fight entirely, so an army that was already
		// broken when the two met never lost this battle and cannot break from
		// it. What breaks an army is the defeat itself: an army already close
		// to the line goes over it by losing, which is what COMBAT.md section 6
		// describes and the only reading under which rout is reachable.
		afterDefeat := loser.Morale - c.Battle.LoserMoraleHit
		routing := afterDefeat <= c.Battle.RoutMoraleThreshold
		fled := 0.0
		// The rout is staged as an event before the rows it causes, and every
		// row below that the rout produced cites it. That is the house pattern
		// the barter system uses for a struck deal, and it is what makes a Why
		// query on a neighbouring army's morale reach the rout that took it
		// rather than stopping at the arithmetic.
		var routCauses []int
		var routRead string
		if routing {
			fled = fleeMen(loser.Troops, c.Battle.RoutFleeShare)
			// The casualty pool is what is left of the army after the men who
			// walked off, capped at that, so the pool can never describe more
			// casualties than there were men present to take them.
			if pool := loser.Troops - fled; loserLoss > pool {
				loserLoss = pool
			}
			routRead = shared.ReadString(
				shared.Pair("morale_before", loser.Morale),
				shared.Pair("morale_after_defeat", afterDefeat),
				shared.Pair("rout_threshold", c.Battle.RoutMoraleThreshold),
				shared.Pair("fled", fled),
				shared.PairF("troops", loser.Troops),
				shared.Pair("casualties", loserLoss),
				shared.Pair("army", float64(loser.ID)),
			)
			token := w.RecordEvent(
				routEventName, model.KindParty, loser.ID, "routed", routRead,
				"the line broke: the army runs",
				v.Log.RecentFor(model.KindParty, loser.ID,
					[]string{"morale", "troops"}, 3))
			routCauses = []int{int(token)}
		}
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
		// The loser's roster loses the casualties and, if it broke, the men who
		// walked away. They are one write rather than two because the engine
		// merges every contribution to a field into a single committed change
		// and a single cause row, so a second write here would not produce a
		// second row to read: the flight is explained on the routed row below,
		// which is the row a player would look for anyway.
		loserNote := "battle casualties"
		if routing {
			loserNote = "battle casualties, and the men who ran"
		}
		// The loser's rows cite the rout as well as the log behind the fight,
		// because a defeat that broke the army is not the same event as a defeat
		// that did not and the Why panel has to be able to say which happened.
		loserCauses := causes
		if routing {
			loserCauses = append(append([]int{}, causes...), routCauses...)
		}
		w.Add(model.KindParty, loser.ID, "troops", -(loserLoss + fled),
			read, loserCauses, loserNote)
		w.Add(model.KindParty, loser.ID, "wounded", loserWounded,
			read, loserCauses, "battle wounded")
		// Morale. The battle system read morale for its strength multiplier for a
		// long time and wrote none, which made it the only combat-relevant system
		// that fed nothing back into the field six others write. A win steadies an
		// army, a defeat shakes it, and breaking shakes it more than losing does.
		w.Add(model.KindParty, winner.ID, "morale", c.Battle.VictorMoraleGain,
			read, causes, "the army saw its enemy beaten")
		loserMoraleHit := c.Battle.LoserMoraleHit
		if routing {
			loserMoraleHit += c.Battle.RoutMoraleHit
		}
		w.Add(model.KindParty, loser.ID, "morale", -loserMoraleHit,
			read, loserCauses, "the army was beaten")
		// The flag the event above described, and the panic it spreads to the
		// armies of the same side standing in this town. Both cite the rout, so
		// the chain runs from a broken army to the army that broke beside it.
		if routing {
			w.Set(model.KindParty, loser.ID, "routed", 1, routRead, routCauses,
				"battle rout: the line broke and the army runs")
			panicSpread(v, w, loser, pids, routRead, routCauses)
		}
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
