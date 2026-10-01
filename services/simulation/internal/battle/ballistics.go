package battle

import (
	"fmt"
	"math"
)

// Modern ballistics: hitscan-with-travel, spread, recoil, cover, ammo types.
//
// The pre-existing aimed fire stage resolves a shot as one hit-chance roll
// and one damage roll. That is honest for muskets and inadequate for rifles,
// which is what this file adds without rewriting that stage:
//
//   - Travel: every round has a muzzle velocity. Flight time over the shot
//     distance sets the gravity drop, and the drop is a vertical miss
//     distance, not a fudge factor on the chance.
//   - Spread: every weapon has a base angular spread, widened by movement,
//     suppression, stance, and the shooter's own accumulated recoil, and
//     narrowed by skill. Spread is a lateral error in metres at the target's
//     distance, and the hit chance falls off against the target's radius.
//   - Cover: discrete obstacles with a height class, a barrier rating, and
//     hit points. A round that cannot penetrate the barrier stops in the
//     cover; a wooden fence stops three rounds and then fails.
//   - Ammo: ball, hollow-point, armor-piercing, less-lethal, each with a
//     damage and a penetration rating. Armor-piercing defeats light vehicle
//     armor that ball cannot touch.
//
// Every number a balance pass might want lives in the [battle] section of
// balance.toml under ballistics_*. The weapon and ammo tables below are data
// rows, not logic: the resolution functions never branch on a weapon name.

const (
	// barrierCarDoor is the rating of a car door. Ball defeats it.
	barrierCarDoor = 1.0
	// barrierLightVehicleArmor is the rating of light vehicle armor, e.g. an
	// armored van's flank. Ball cannot defeat it; armor-piercing can. Vehicle
	// agents are not implemented yet; when they land they will carry these
	// ratings on their facings.
	barrierLightVehicleArmor = 2.0
	// barrierEngineBlock is the rating of an engine block. No small-arms round
	// in the table defeats it: a rifle round penetrates car doors, not engine
	// blocks.
	barrierEngineBlock = 2.5
	// barrierConcrete is the rating of a concrete wall.
	barrierConcrete = 4.0
)

// AmmoType is the cartridge a weapon fires.
type AmmoType uint8

const (
	// AmmoBall is standard full-metal-jacket: the reference round.
	AmmoBall AmmoType = iota
	// AmmoHollowPoint mushrooms in flesh: more damage to the unprotected,
	// poor against hard barriers.
	AmmoHollowPoint
	// AmmoArmorPiercing trades wounding for penetration: it defeats light
	// vehicle armor that ball cannot.
	AmmoArmorPiercing
	// AmmoLessLethal is a baton/beanbag round: little injury, heavy
	// suppression.
	AmmoLessLethal
)

// String names the ammo type for reports and event bundles.
func (a AmmoType) String() string {
	switch a {
	case AmmoBall:
		return "ball"
	case AmmoHollowPoint:
		return "hollow-point"
	case AmmoArmorPiercing:
		return "armor-piercing"
	case AmmoLessLethal:
		return "less-lethal"
	default:
		return "unknown"
	}
}

type ammoProfile struct {
	damageMul      float64
	penetration    float64
	suppressionMul float64
}

// ammoTable is the data row per ammo type. No resolution function below
// branches on a type name; everything reads these three numbers.
var ammoTable = [4]ammoProfile{
	AmmoBall:          {damageMul: 1.0, penetration: 1.5, suppressionMul: 1.0},
	AmmoHollowPoint:   {damageMul: 1.35, penetration: 0.75, suppressionMul: 1.1},
	AmmoArmorPiercing: {damageMul: 0.85, penetration: 3.0, suppressionMul: 0.9},
	AmmoLessLethal:    {damageMul: 0.20, penetration: 0.25, suppressionMul: 2.0},
}

// WeaponKind is the class of small arm a unit carries.
type WeaponKind uint8

const (
	// WeaponRifle is the default service rifle.
	WeaponRifle WeaponKind = iota
	// WeaponCarbine is a short rifle: handier, slightly weaker.
	WeaponCarbine
	// WeaponPistol is a sidearm: short-ranged and loose.
	WeaponPistol
	// WeaponLMG is a light machine gun: built for sustained fire.
	WeaponLMG
	// WeaponMarksman is a scoped rifle: tight and hard-kicking.
	WeaponMarksman
)

// String names the weapon for reports and event bundles.
func (w WeaponKind) String() string {
	switch w {
	case WeaponRifle:
		return "rifle"
	case WeaponCarbine:
		return "carbine"
	case WeaponPistol:
		return "pistol"
	case WeaponLMG:
		return "lmg"
	case WeaponMarksman:
		return "marksman"
	default:
		return "unknown"
	}
}

type weaponProfile struct {
	muzzleVelocity float64 // metres per second
	baseSpread     float64 // radians, one sigma
	recoilKick     float64 // radians added per shot
	recoilRecovery float64 // radians recovered per second
	damageMul      float64
	ammo           AmmoType
}

// weaponTable is the data row per weapon. Muzzle velocities are real-world
// service values; the spreads are balance numbers in the same units. Kick is
// sized so full-auto fire (10 rounds/s) outruns recovery and climbs toward
// the cap, while aimed fire at the configured fire interval recovers fully
// between shots.
var weaponTable = [5]weaponProfile{
	WeaponRifle:    {muzzleVelocity: 940, baseSpread: 0.008, recoilKick: 0.020, recoilRecovery: 0.10, damageMul: 1.0, ammo: AmmoBall},
	WeaponCarbine:  {muzzleVelocity: 880, baseSpread: 0.010, recoilKick: 0.016, recoilRecovery: 0.12, damageMul: 0.9, ammo: AmmoBall},
	WeaponPistol:   {muzzleVelocity: 360, baseSpread: 0.020, recoilKick: 0.012, recoilRecovery: 0.15, damageMul: 0.55, ammo: AmmoBall},
	WeaponLMG:      {muzzleVelocity: 915, baseSpread: 0.012, recoilKick: 0.014, recoilRecovery: 0.08, damageMul: 0.95, ammo: AmmoBall},
	WeaponMarksman: {muzzleVelocity: 1000, baseSpread: 0.004, recoilKick: 0.024, recoilRecovery: 0.10, damageMul: 1.3, ammo: AmmoBall},
}

// CoverHeight is whether an obstacle is low (fence, sandbags: crouch behind)
// or high (wall, vehicle: stand behind).
type CoverHeight uint8

const (
	// CoverLow is waist-high cover.
	CoverLow CoverHeight = iota
	// CoverHigh is head-high cover.
	CoverHigh
)

// String names the cover height for reports.
func (h CoverHeight) String() string {
	if h == CoverHigh {
		return "high"
	}
	return "low"
}

// Cover is one destructible obstacle on the field.
type Cover struct {
	X, Y   float64
	Radius float64
	Height CoverHeight
	// HP is the rounds the cover still stops before failing. A wooden fence
	// arrives with 3: it stops three rounds, and the fourth goes through.
	HP float64
	// MaxHP is what it started with, for the report.
	MaxHP float64
	// Protection is the barrier rating: a round penetrates it only if its
	// ammo's penetration meets or beats this.
	Protection float64
	// Name is free text for reports: "wooden fence", "concrete wall".
	Name string
}

// destroyed reports whether the cover has failed.
func (c *Cover) destroyed() bool { return c.HP <= 0 }

// flightTime is how long a round is in the air over distanceM metres.
func flightTime(distanceM, muzzleVelocity float64) float64 {
	if muzzleVelocity <= 0 {
		return 0
	}
	return distanceM / muzzleVelocity
}

// bulletDrop is the vertical fall of a round over distanceM metres, in
// metres: one half g t^2 with t the flight time. A rifle round (940 m/s) at
// 200 m falls about 0.22 m, which is a documented miss distance, not a
// tuning knob: gravity is set in balance.toml as ballistics_gravity.
func bulletDrop(distanceM, muzzleVelocity, gravity float64) float64 {
	t := flightTime(distanceM, muzzleVelocity)
	return 0.5 * gravity * t * t
}

// spreadErrorM converts an angular spread to a lateral one-sigma error in
// metres at the target's distance.
func spreadErrorM(spreadRad, distanceM float64) float64 {
	return distanceM * math.Tan(spreadRad)
}

// chanceFromError is the share of a circular normal error distribution that
// lands inside the target's radius: r^2/(r^2+e^2). A sprinting man at 30 m
// with a 4 m error is inside a 0.45 m circle about one time in a hundred,
// which is the model's way of saying he cannot hit.
func chanceFromError(errorM, targetRadiusM float64) float64 {
	if targetRadiusM <= 0 {
		return 0
	}
	r2 := targetRadiusM * targetRadiusM
	return r2 / (r2 + errorM*errorM)
}

// penetrates reports whether ammo defeats a barrier rating.
func penetrates(ammo AmmoType, barrierRating float64) bool {
	return ammoTable[ammo].penetration >= barrierRating
}

// applyRecoil advances accumulated recoil: one kick added, recovery over
// dtSecs subtracted, clamped to [0, max]. Firing faster than recovery is what
// makes a mag dump climb: 30 kicks at 0.012 with 0.10/s recovery over 3
// seconds lands near the cap, while burst fire with pauses stays low.
func applyRecoil(current, kick, recoveryPerSec, dtSecs, maxRecoil float64) float64 {
	v := current + kick - recoveryPerSec*dtSecs
	if v < 0 {
		v = 0
	}
	if v > maxRecoil {
		v = maxRecoil
	}
	return v
}

// shotSpread assembles the total angular spread for one shot from the
// shooter's state: base weapon spread, widened by movement, suppression,
// and accumulated recoil, narrowed by skill and by a set stance.
//
// Stance is derived, not stored: a unit holding position and stationary is
// set (braced); a moving one pays the movement price; a sprinting one pays
// the sprint price. Suppression shakes the aim twice: once here on the
// spread, once on the hit chance, because a pinned man both wobbles and
// keeps his head down.
func (b *Battle) shotSpread(s *snapshot, u *Unit) float64 {
	c := b.c
	w := weaponTable[u.Weapon]
	speed := math.Hypot(s.VX, s.VY)

	spread := w.baseSpread
	// Movement: a moving shooter is worse, a sprinting one far worse.
	switch {
	case speed >= c.BallisticsSprintSpeed:
		spread *= c.BallisticsSprintSpreadMult
	case speed >= 0.5:
		spread *= c.BallisticsMoveSpreadMult
	default:
		// Stationary and holding: braced, steadier than the weapon's base.
		if u.Intent == IntentHold {
			spread *= c.BallisticsSetStanceSpreadMult
		}
	}
	// Suppression shakes the aim.
	suppFrac := clamp01(s.Suppression / c.SuppressionCap)
	spread *= 1 + suppFrac*c.BallisticsSuppressionSpreadMult
	// Skill tightens it: a perfect shot groups at 70% of base.
	spread *= 1.3 - 0.6*u.RangedSkill
	// Accumulated recoil: every unrecovered kick is still in the arms.
	spread += s.Recoil
	return spread
}

// ballisticHitChance extends the aimed-fire hit chance with the modern
// ballistics terms: spread falloff with distance, gravity drop as a vertical
// miss distance, and the explicit suppression accuracy penalty. The base
// chance underneath is unchanged, so every existing balance number still
// means what it meant.
func (b *Battle) ballisticHitChance(s, ts *snapshot, u *Unit, distM float64) float64 {
	c := b.c
	base := b.rangedHitChance(s, ts, u)
	w := weaponTable[u.Weapon]

	spread := b.shotSpread(s, u)
	errM := spreadErrorM(spread, distM)
	spreadFactor := chanceFromError(errM, c.BallisticsTargetRadius)

	drop := bulletDrop(distM, w.muzzleVelocity, c.BallisticsGravity)
	dropFactor := chanceFromError(drop, c.BallisticsTargetRadius)

	suppFrac := clamp01(s.Suppression / c.SuppressionCap)
	suppFactor := 1 - suppFrac*(1-c.BallisticsSuppressionAccuracyMult)

	// Cover at the target's position makes the target smaller to hit.
	coverMult := 1.0
	if ci := b.interceptingCover(s.X, s.Y, ts.X, ts.Y); ci >= 0 {
		if b.covers[ci].Height == CoverHigh {
			coverMult = c.BallisticsCoverHighMult
		} else {
			coverMult = c.BallisticsCoverLowMult
		}
	}
	return clamp01(base * spreadFactor * dropFactor * suppFactor * coverMult)
}

// interceptingCover returns the index of the nearest live cover between the
// shooter and the target, or -1. A cover protects the target only if it
// stands on the target's half of the shot line: a fence behind the shooter
// is scenery, not cover.
func (b *Battle) interceptingCover(sx, sy, tx, ty float64) int {
	best := -1
	bestT := 0.5
	dx := tx - sx
	dy := ty - sy
	len2 := dx*dx + dy*dy
	if len2 <= 0 {
		return -1
	}
	for i := range b.covers {
		cv := &b.covers[i]
		if cv.destroyed() {
			continue
		}
		// Projection of the cover centre onto the shot line, as a fraction.
		t := ((cv.X-sx)*dx + (cv.Y-sy)*dy) / len2
		if t <= 0.5 || t >= 1 {
			continue
		}
		px := sx + t*dx
		py := sy + t*dy
		odx := cv.X - px
		ody := cv.Y - py
		if odx*odx+ody*ody > cv.Radius*cv.Radius {
			continue
		}
		if t > bestT {
			bestT = t
			best = i
		}
	}
	return best
}

// resolveCoverHit applies a connecting hit against a target behind cover.
// It returns the damage the target actually takes. The cover always loses
// one HP per round that reaches it, penetrated or not: rounds chew cover
// up. A destroyed cover is reported through coverFailed so the event bundle
// can say the fence came down.
func (b *Battle) resolveCoverHit(coverIdx int, ammo AmmoType, damage float64) (toTarget float64, coverFailed bool) {
	cv := &b.covers[coverIdx]
	cv.HP--
	coverFailed = cv.destroyed()
	if penetrates(ammo, cv.Protection) {
		// Through, but spent: the round arrives weakened.
		toTarget = damage * b.c.BallisticsCoverBleed
	} else {
		toTarget = 0
	}
	return toTarget, coverFailed
}

// bufferShotEvent records the one event bundle for a fired shot: muzzle
// flash, tracer, impact effect, and the suppression crack, all in the Read
// field for the client. Every shot appends exactly one bundle, hit or miss,
// so the client can count shots and play effects from events alone.
//
// The bundle is buffered, not emitted: the commit flushes the buffer at a
// fixed point, which keeps the event log independent of the stage order.
func (b *Battle) bufferShotEvent(u *Unit, targetID int, w WeaponKind, ammo AmmoType, hit bool, impact string, damage float64, coverFailed bool) {
	read := fmt.Sprintf("muzzle=1 tracer=1 weapon=%s ammo=%s impact=%s crack=%d",
		w, ammo, impact, boolToInt(!hit))
	note := fmt.Sprintf("unit %d fired %s (%s)", u.ID, w, ammo)
	if hit {
		note += fmt.Sprintf(", hit unit %d for %.1f", targetID, damage)
	} else {
		note += ", missed"
	}
	if coverFailed {
		note += "; cover destroyed"
	}
	b.shotEvents = append(b.shotEvents, Event{
		Tick:  b.tickNo,
		Side:  u.Side,
		Kind:  EventShotFired,
		Unit:  u.ID,
		Value: damage,
		Read:  read,
		Note:  note,
	})
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
