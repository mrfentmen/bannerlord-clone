package battle

import "mbclone/simulation/internal/rng"

// stageAimedFire resolves every shooter's shot for this tick.
//
// A shot resolves in three parts, and keeping them apart is what makes a battle
// report explainable:
//
//   - Does it hit? The chance is a function of the shooter's ranged skill, the
//     shooter's suppression (COMBAT.md section 6: a man under fire cannot shoot
//     accurately), and the target's suppression, which makes a pinned man an
//     easier target. That last term is how suppression turns into casualties a
//     few ticks later without ever converting directly.
//   - What does it do? A share of hits add suppression and the rest add injury,
//     per battle.ranged_suppression_share. Suppression is the weapon that breaks
//     a formation, and a hit that only suppresses is a real result, not a
//     consolation prize.
//   - What does it cost? One round and a little exhaustion. A unit that runs out
//     falls back to a much weaker melee and starts losing morale for being
//     unable to fight back, per battle.morale_unarmed_hit.
//
// The stage reads the snapshot and writes to the delta buffer. A unit destroyed
// earlier in this tick still fires in it, and a unit that spends its last round
// at commit time still gets its shot this tick. That is deliberate and is the
// same rule every stage follows: within a tick, a unit acts on what it could see
// when the tick began. It is why the order of the stages cannot change the
// outcome.
func (b *Battle) stageAimedFire() {
	c := b.c
	r := b.rngFor("aimed-fire")
	for i := range b.units {
		u := b.units[i]
		s := &b.snap[i]
		d := &b.deltas[i]
		if u.Role != RoleRanged || !s.Status.Actable() || s.Ammo < 1 {
			continue
		}
		// A shooter still working through its fire interval cannot fire again.
		// Without this gate battle.ranged_fire_interval would be a constant in
		// the balance file that no part of the engine reads, every shooter
		// would empty a magazine in one tick, and a battle would be decided by
		// which side happened to be holding the deeper ammunition.
		if s.RangedCooldown > 0 {
			continue
		}
		tid := d.rangedTarget
		if tid < 0 || tid >= len(b.byID) {
			continue
		}
		target := b.byID[tid]
		if !b.inRange(s.X, s.Y, target.X, target.Y, c.RangedMinRange, c.RangedRange) {
			continue
		}
		ts := &b.snap[tid]

		d.shots = 1
		d.shotFired = true
		d.Exhaustion += c.ExhaustionPerAttack

		if !r.Chance(b.rangedHitChance(s, ts, u)) {
			// A miss costs a round and a little effort, and costs no suppression.
			// A weapon that suppresses nothing when it misses is not a weapon that
			// breaks formations.
			continue
		}
		d.rangedHits = 1

		suppression := c.RangedSuppressionShare * c.RangedSuppressionPerHit
		d.suppressionDealt = suppression
		td := &b.deltas[tid]
		// What the target is standing in. Only skirmish order has anything to
		// say about aimed fire, and what it says is that men spread out do not
		// present one target: the burst lands, and a smaller share of it pins
		// him. It scales the suppression and not the injury, because spreading
		// out does not stop a bullet that has already found a man.
		td.Suppression += suppression * b.suppressionTakenScale(tid)

		injury := 1 - c.RangedSuppressionShare
		if injury <= 0 {
			continue
		}
		td.HP -= b.rangedDamage(u, r) * injury
	}
}

// rangedHitChance is the chance a shot connects.
//
// Skill sets the base, at battle.ranged_hit_chance_base for a shooter with no
// skill and base+weight for a perfect one, which leaves room for every other
// term to matter without skill being the whole answer. Both numbers were
// literals 0.25 and 0.45 in this function, which made the hit chance of the
// game's only shooting model the one thing in the [battle] section no balance
// pass could reach. Suppression on the shooter suppresses its aim; suppression
// on the target makes it easier to hit. A broken or routed shooter shoots badly
// without being under fire at all, which is why its status scales the chance as
// well as the damage.
//
// Exhaustion is deliberately not a term here. A tired man's aim is not worse
// than a rested one's; his swing of the trigger is heavier. Exhaustion is
// applied to damage instead, in rangedDamage, where it belongs.
func (b *Battle) rangedHitChance(s, ts *snapshot, u *Unit) float64 {
	c := b.c
	chance := c.RangedHitChanceBase + c.RangedHitChanceSkillWeight*u.RangedSkill
	chance *= 1 - clamp01(s.Suppression/c.SuppressionCap)*c.SuppressionRangedPenalty
	chance *= 1 - clamp01(ts.Suppression/c.SuppressionCap)*c.SuppressionRangedPenalty
	// Kept above battle.ranged_hit_effectiveness_floor, and at it when there is
	// no effectiveness at all, so a shaken shooter is worse rather than
	// incompetent. It was a literal 0.5 and 0.5 here.
	floor := c.RangedHitEffectivenessFloor
	chance *= floor + (1-floor)*u.effectiveness(c)
	return clamp01(chance)
}

// rangedDamage is the damage of a connecting shot, before the caller's split
// between suppression and injury.
//
// Variance is drawn from this stage's own substream, so adding a draw to melee
// later does not shift the shot sequence and invalidate a saved run. Two uniform
// draws are summed, which gives a triangular distribution in one line and needs
// no trigonometry in the hot loop.
func (b *Battle) rangedDamage(u *Unit, r *rng.Rng) float64 {
	c := b.c
	mean := c.RangedDamageBase + c.RangedDamageSkillWeight*u.RangedSkill
	if mean <= 0 || !isFinite(mean) {
		return 0
	}
	dmg := mean + mean*c.RangedDamageVariance*(r.Float64()+r.Float64()-1)
	dmg *= 1 - clamp01(b.snapOf(u).Exhaustion/c.ExhaustionCap)*c.ExhaustionDamagePenalty
	if dmg < 0 || !isFinite(dmg) {
		return 0
	}
	return dmg
}

// snapOf returns the snapshot of a live unit. It is only valid for the stage's
// own unit, which is why it takes the unit rather than an index: calling it for
// any other unit would be reading a stale or foreign snapshot, and the type
// makes that mistake awkward rather than easy.
func (b *Battle) snapOf(u *Unit) *snapshot { return &b.snap[u.ID] }

// inRange reports whether a point lies inside an annulus.
func (b *Battle) inRange(ux, uy, tx, ty, minR, maxR float64) bool {
	d2 := dist2(tx-ux, ty-uy)
	return d2 <= maxR*maxR && d2 >= minR*minR
}
