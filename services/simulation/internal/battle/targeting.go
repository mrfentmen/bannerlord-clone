package battle

import "math"

// stageTargeting picks, for every unit that can act, what it will strike at this
// tick and what it will shoot at.
//
// Two rules shape it, and both exist because the alternative produces a battle
// whose casualty count is an artefact of iteration order rather than of the
// fight.
//
// The first is battle.max_attackers_per_target. Without it, every unit in
// contact would pick the same handful of nearest enemies, and the side that
// resolved its units first would kill them. With it, a unit in contact reaches
// only the targets that have not already been reached this tick, which is what
// makes a front a front: the men at the back of a crowd are shooting past the
// men in front, not adding their blows to the same pair.
//
// The second is battle.target_casualty_weight. A unit's target is chosen on a
// score that trades distance against how hurt the target already is, so a man
// finishes off someone who is nearly down rather than switching to the
// marginally closer healthy one. That is what a soldier does, and it is what
// turns a line into something that presses an advantage instead of only ever
// meeting the enemy head on.
//
// Targeting reads the snapshot and writes to the delta buffer, so the melee and
// aimed-fire stages cannot see each other's choices and cannot see a target
// chosen from a state that has already changed.
func (b *Battle) stageTargeting() {
	c := b.c
	reach := c.MeleeRange
	reach2 := reach * reach
	for i := range b.units {
		u := b.units[i]
		s := &b.snap[i]
		d := &b.deltas[i]
		if !u.alive() || !s.Status.Actable() {
			continue
		}

		// --- melee target ---
		// A unit with no ammunition and no melee weapon of its own still swings:
		// a rifle butt is a melee weapon. What it loses is skill, applied in the
		// melee stage, not its right to try.
		bestID, bestScore := -1, math.Inf(1)
		cap := int(c.MeleeMaxTargets)
		if cap <= 0 {
			d.meleeTarget = -1
		} else {
			b.meleeHash.forEachCell(s.X, s.Y, reach, func(id int) {
				cand := b.byID[id]
				if cand.Side == u.Side || !cand.alive() {
					return
				}
				d2 := dist2(cand.X-s.X, cand.Y-s.Y)
				if d2 > reach2 {
					return
				}
				if b.attackerCount[id] >= int(c.MaxAttackersPerTarget) {
					return
				}
				score := b.targetScore(d2, cand, reach)
				if score < bestScore {
					bestScore, bestID = score, id
				}
			})
			if bestID >= 0 {
				b.attackerCount[bestID]++
				d.meleeTarget = bestID
			}
		}

		// --- aimed target ---
		// Shooters fire independently of the concentration limit. A crowd
		// firing past its own front rank is exactly what breaks a formation, and
		// capping it would mean the second rank never shoots at all.
		if u.Role == RoleRanged && s.Ammo >= 1 {
			b.chooseFireTarget(i, s, u)
		}
	}
}

// targetScore ranks a melee candidate. Lower is better.
//
// The distance term is the squared distance over the reach, so it lands in 0-1,
// and the condition term is the fraction of hit points the target has left. A
// weight of zero makes a unit pick purely by distance; a weight at or above one
// makes it always prefer the more wounded enemy regardless of range, which is
// not what anyone does.
func (b *Battle) targetScore(d2 float64, cand *Unit, reach float64) float64 {
	distTerm := d2 / (reach * reach)
	casualtyTerm := (1 - cand.hpFrac()) * b.c.TargetCasualtyWeight
	return distTerm - casualtyTerm
}

// chooseFireTarget stages a shooter's target.
//
// The search walks the coarse fire hash outwards and stops as soon as it has
// found battle.ranged_max_targets candidates in range. Stopping early is what
// makes aimed fire affordable at four thousand units a side: a shooter normally
// finds everything it needs in the first ring of cells, so the query does not
// scale with the size of the field.
//
// A shooter with nothing in range has no target and simply does not fire. It is
// not given a fallback, because a shooter who fires at nothing is a unit
// consuming ammunition and revealing its position for no effect, and the whole
// point of a battle report is that the numbers mean something.
func (b *Battle) chooseFireTarget(i int, s *snapshot, u *Unit) {
	c := b.c
	minR2 := c.RangedMinRange * c.RangedMinRange
	maxR2 := c.RangedRange * c.RangedRange
	enemy := u.Side.Opposing()
	bestID, bestScore := -1, math.Inf(1)
	shots := 0
	limit := int(c.RangedMaxTargets)
	if limit <= 0 {
		return
	}
	b.fireHash.forEachCell(s.X, s.Y, c.RangedRange, func(id int) {
		if shots >= limit {
			return
		}
		cand := b.byID[id]
		if cand.Side != enemy || !cand.alive() {
			return
		}
		d2 := dist2(cand.X-s.X, cand.Y-s.Y)
		if d2 > maxR2 || d2 < minR2 {
			return
		}
		shots++
		score := b.targetScore(d2, cand, c.RangedRange)
		if score < bestScore {
			bestScore, bestID = score, id
		}
	})
	b.deltas[i].rangedTarget = bestID
}
