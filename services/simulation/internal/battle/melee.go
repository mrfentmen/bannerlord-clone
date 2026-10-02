package battle

import (
	"math"
	"strconv"

	"mbclone/simulation/internal/rng"
)

// stageMelee resolves every unit's melee blow for this tick.
//
// A blow, in order:
//
//  1. Reach. The target must be within battle.melee_range. A unit whose staged
//     target has moved out of reach simply does not swing, and it pays nothing
//     for the attempt.
//  2. Damage. Skill and closing speed set the mean, per
//     battle.melee_damage_skill_weight and battle.melee_damage_speed_weight.
//     The speed term is what makes a charge a decision: closing at pace hurts,
//     and a man who arrives exhausted and slow does not. The shape each man is
//     standing in scales it, from the [formation] section of the balance file.
//  3. Armour. A share of the damage is removed, capped.
//  4. Condition. Suppression, exhaustion, and the attacker's status cut it
//     further. A pinned man cannot get his head up, a tired man's swing is
//     heavy, and a routed man's swing is worth almost nothing.
//  5. Variance, then the target's condition: a routed target is caught with its
//     back turned, and a unit already below the fatal fraction is finished off
//     harder.
//  6. Fatigue. A share of the blow lands as exhaustion rather than injury,
//     which is why a battle tires the men who survive it.
//
// The stage reads the snapshot and writes to the delta buffer, so the damage a
// unit takes this tick is the sum of every blow aimed at it and not the result
// of whichever attacker the loop reached first. See commit for why that matters.
func (b *Battle) stageMelee() {
	c := b.c
	r := b.rngFor("melee")
	for i := range b.units {
		u := b.units[i]
		s := &b.snap[i]
		d := &b.deltas[i]
		if !s.Status.Actable() {
			continue
		}
		// A unit still working through its swing cannot swing again. Without this
		// gate battle.melee_swing_seconds would be a constant in the balance file
		// that no part of the engine reads, and every unit in contact would swing
		// once per tick instead of once per interval.
		if s.MeleeCooldown > 0 {
			continue
		}
		tid := d.meleeTarget
		if tid < 0 || tid >= len(b.byID) {
			continue
		}
		target := b.byID[tid]
		dx, dy := target.X-s.X, target.Y-s.Y
		if dist2(dx, dy) > c.MeleeRange*c.MeleeRange {
			continue
		}
		ts := &b.snap[tid]

		d.meleeSwings = 1
		d.swingFired = true
		d.Exhaustion += c.ExhaustionPerAttack

		// A shooter with no skill at hand fights with the butt of the weapon.
		// That is a real and much weaker attack, not a refusal, and because it
		// is expressed as a skill term it needs no branch of its own. The
		// fraction is battle.melee_ranged_skill_scale, which was a literal 0.35
		// here.
		skill := u.MeleeSkill
		if u.Role == RoleRanged {
			skill *= c.MeleeRangedSkillScale
		}

		dmg := c.MeleeDamageBase + c.MeleeDamageSkillWeight*skill
		closing := math.Max(0, closingRate(s, ts, dx, dy))
		dmg += c.MeleeDamageSpeedWeight * closing

		// What the two men are standing in. A wedge hits harder at the run, a
		// wedge caught from the side takes more, a square turns a fast mover
		// away, and a man in skirmish order pays for being scattered. Both
		// multipliers come from the balance file and are exactly one for a unit
		// in no formation, so a battle nobody commanded fights exactly as it did
		// before formations existed.
		dmg *= b.meleeDealtScale(i, math.Hypot(s.VX, s.VY))
		dmg *= b.meleeTakenScale(tid, target.X, target.Y, s.X, s.Y, math.Hypot(s.VX, s.VY))

		dmg *= 1 - clamp(c.MeleeArmorReduction, 0, c.MeleeArmorReductionCap)
		dmg *= 1 - clamp01(s.Suppression/c.SuppressionCap)*c.SuppressionMeleePenalty
		dmg *= 1 - clamp01(s.Exhaustion/c.ExhaustionCap)*c.ExhaustionDamagePenalty
		dmg *= u.effectiveness(c)

		// Variance. Two uniform draws summed, which gives a triangular spread in
		// one line and needs no trigonometry in the hot loop. Without it every
		// blow of a given skill lands identically and a battle has no texture.
		dmg *= 1 + c.MeleeDamageVariance*(r.Float64()+r.Float64()-1)

		if ts.Status == StatusRouted {
			dmg *= 1 + c.RoutedExposure
		}
		if ts.HP < target.MaxHP*c.FatalHPFraction {
			dmg *= c.FinishingBlowScale
		}
		if dmg < 0 || !isFinite(dmg) {
			dmg = 0
		}

		d.meleeHits = 1
		td := &b.deltas[tid]
		td.HP -= dmg
		td.Exhaustion += dmg * c.MeleeFatiguePerDamage
	}
}

// closingRate is how fast the distance between two units is shrinking, in
// metres per second: the rate at which the attacker is bearing down on the
// target, positive when they close and zero or negative when they part.
//
// It is the vector from the attacker to the target dotted with the difference in
// their velocities, which is exactly the rate of change of the gap. Both
// velocities come from the snapshot, so this is a read of committed state like
// everything else in a stage and not an inference from a staged position.
//
// A blow thrown from a standstill gets no speed term. That is why a charge is
// worth choosing and a standing brawl is not.
func closingRate(us, ts *snapshot, dx, dy float64) float64 {
	dist := math.Sqrt(dist2(dx, dy))
	if dist <= 0 || !isFinite(dist) {
		return 0
	}
	return (dx*(us.VX-ts.VX) + dy*(us.VY-ts.VY)) / dist
}

// rngFor is a stage's named substream for this tick.
//
// Kept as one helper so the derivation format is written once and every stage's
// stream is visibly named the same way. The per-stage split is what stops a draw
// added to one stage from shifting another's sequence, which is what would
// otherwise invalidate every saved run the moment combat is retuned.
func (b *Battle) rngFor(stage string) *rng.Rng {
	return b.rng.Derive("tick-" + itoa(b.tickNo) + "-" + stage)
}

// itoa formats an integer for a stream name.
func itoa(v int) string { return strconv.Itoa(v) }
