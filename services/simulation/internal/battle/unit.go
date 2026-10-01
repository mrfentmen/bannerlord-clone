// Package battle is the headless battle core: the resolution of a field battle
// from a tick loop, with no client and no renderer.
//
// # WHAT THIS IS
//
// Given two forces and a seed, it runs a battle to a conclusion and reports
// the casualties, the length of the fight, and the winner. It implements
// COMBAT.md: units with hit points and morale, melee and ranged resolution,
// suppression, morale breaks, routs, and surrender.
//
// # WHAT THIS IS NOT
//
// Deliberately out of scope, and named here so that nothing reads as working
// when it is not:
//
//   - Cover, terrain, and weather. Setup.Terrain accepts only TerrainOpen and
//     returns ErrTerrainUnsupported for anything else rather than simulating
//     open ground under cover rules.
//   - Vehicles. No vehicle unit type exists.
//   - The player character and formation orders. Both sides are commanded by
//     the same intent model, described below.
//   - Sieges, ambushes, and the other COMBAT.md section 2 battle types. Only
//     the field battle is modelled.
//
// # WHY IT CANNOT ASSUME A SIZE
//
// Nothing in this package allocates against a fixed unit count. Every array,
// every spatial hash, and every per-tick target list is sized from the forces
// the caller supplies. battle.max_units_per_side is a validation limit that
// produces an error when exceeded; it is never a cap that quietly truncates a
// force. SPEC.md section 5.1's 300 and 1000 unit figures are client rendering
// budgets and have nothing to do with how much simulation this can run.
//
// # HOW A TICK WORKS
//
// SPEC.md section 4 and CONSTITUTION.md section 2.1 require a fixed system
// order in which each system reads a snapshot of the previous state and writes
// the next, so results never depend on which system ran first. A tick is five
// stages run in this order, documented in tickOrder:
//
//  1. intent      read snapshot, decide what each unit is doing
//  2. targeting   read snapshot, pick each unit's targets
//  3. aimed fire  read snapshot, resolve shots
//  4. melee       read snapshot, resolve blows
//  5. morale      read snapshot, compute morale deltas, breaks, routs
//
// Every stage reads only the snapshot taken at the top of the tick and writes
// into a delta buffer. The commit at the end merges all deltas before applying
// them, which has one consequence worth stating plainly: casualties are
// computed from the SUM of the damage aimed at a unit in a tick, not from the
// order the attackers were processed in. Two attackers who between them deal
// more than a unit's remaining hit points kill it exactly once, whichever is
// resolved first.
//
// # DETERMINISM
//
// All randomness comes from one rng.Rng derived from the caller's seed, split
// into one named substream per stage per tick, in the pattern the campaign
// engine already uses. Unit iteration is always by ascending unit id. The
// spatial hashes store ids in ascending order because they are built by
// walking units in that order, and they are only ever read by computed cell
// coordinates, never by ranging over the map. Given the same seed and the same
// forces, two runs produce identical results, which TestDeterminism asserts.
package battle

import (
	"math"

	"mbclone/simulation/internal/config"
)

// Side is which army a unit belongs to.
type Side int

const (
	// SideA is the first force. There is no "neutral" side: a battle has two.
	SideA Side = 0
	// SideB is the second force.
	SideB Side = 1
)

// Opposing returns the other side. Asking an int for its opposite is the kind
// of thing that silently becomes "a - a" somewhere, so it is named.
func (s Side) Opposing() Side {
	if s == SideA {
		return SideB
	}
	return SideA
}

// String names the side for reports and error messages.
func (s Side) String() string {
	switch s {
	case SideA:
		return "A"
	case SideB:
		return "B"
	default:
		return "?"
	}
}

// sides is the set of sides, in the fixed order every loop over "both sides"
// uses. Nothing ranges over a map of sides, because map order would make
// results depend on Go's hash seed.
var sides = [...]Side{SideA, SideB}

// Role is what a unit is equipped to do.
type Role uint8

const (
	// RoleMelee closes and fights with hand weapons. A melee unit can still
	// be shot at.
	RoleMelee Role = iota
	// RoleRanged carries a firearm. A ranged unit can still fight at melee
	// range at a heavy penalty, because COMBAT.md section 4 keeps melee in the
	// game for close quarters and desperate moments.
	RoleRanged
)

// String names the role for reports.
func (r Role) String() string {
	switch r {
	case RoleMelee:
		return "melee"
	case RoleRanged:
		return "ranged"
	default:
		return "unknown"
	}
}

// Intent is what a unit is currently doing, decided once per tick from the
// snapshot. It is deliberately the only steering behaviour in the package: both
// sides are commanded identically, so a battle result is a property of the
// forces and not of which side the AI is playing.
type Intent uint8

const (
	// IntentAdvance is closing on the enemy.
	IntentAdvance Intent = iota
	// IntentEngage is in contact and fighting.
	IntentEngage
	// IntentWithdraw is a broken unit backing off rather than running.
	IntentWithdraw
	// IntentRout is running from the field.
	IntentRout
)

// String names the intent for reports.
func (i Intent) String() string {
	switch i {
	case IntentAdvance:
		return "advance"
	case IntentEngage:
		return "engage"
	case IntentWithdraw:
		return "withdraw"
	case IntentRout:
		return "rout"
	default:
		return "unknown"
	}
}

// Status is a unit's condition, which decides whether it acts at all.
type Status uint8

const (
	// StatusFighting means the unit is on the field and taking part.
	StatusFighting Status = iota
	// StatusBroken means shaken: still on the field, fighting at reduced
	// effect, and not advancing.
	StatusBroken
	// StatusRouted means running: off the attack, taking extra exposure, and
	// spreading panic.
	StatusRouted
	// StatusSurrendered means out of the fight and captured. Still on the
	// battlefield map for the client's render layer, inert to the simulation.
	StatusSurrendered
	// StatusDestroyed means out of the fight, dead or wounded. Terminal.
	StatusDestroyed
)

// String names the status for reports.
func (s Status) String() string {
	switch s {
	case StatusFighting:
		return "fighting"
	case StatusBroken:
		return "broken"
	case StatusRouted:
		return "routed"
	case StatusSurrendered:
		return "surrendered"
	case StatusDestroyed:
		return "destroyed"
	default:
		return "unknown"
	}
}

// OnField reports whether a status still participates in targeting and morale.
// A surrendered unit is deliberately not on the field for morale: men who have
// given up do not frighten their neighbours any more, and counting them would
// let a side that has already lost keep panicking its own troops.
func (s Status) OnField() bool {
	return s == StatusFighting || s == StatusBroken || s == StatusRouted
}

// Actable reports whether a status may still attack. A broken unit holds and
// strikes; a routed or surrendered one does not.
func (s Status) Actable() bool {
	return s == StatusFighting || s == StatusBroken
}

// Leader is a commander on the field. A leader is not a combatant and cannot
// be attacked: it exists to steady the units near it, which is
// morale_leader_bonus and morale_leader_radius in the balance file. Keeping it
// non-targetable is a deliberate simplification; a commander who can be shot is
// a different model, and silently pretending otherwise would be worse than
// saying so here.
type Leader struct {
	// ID identifies the leader in the result's event list.
	ID int
	// Side is the army the leader commands.
	Side Side
	// Influence is the leader's standing, which scales how much steadying
	// they provide. RULERS.md section 4 made mechanical.
	Influence float64
	// X and Y are the leader's position on the field.
	X, Y float64
}

// Unit is one combatant on the field. A unit represents Troops bodies: one
// soldier, or a squad of ten. Every casualty figure in the result follows
// Troops exactly, so "500 against 500 troops" is fifty squads of ten and is
// counted the same as five hundred individuals.
type Unit struct {
	// ID is the unit's index in the battle's unit array. It is assigned by Run,
	// densely and in ascending order across both sides, and is stable for the
	// whole battle. Every loop over units uses it, so it is also the tie-break
	// that makes targeting deterministic.
	//
	// It is OUTPUT ONLY. A Unit handed to Run may carry any ID and it is
	// overwritten. Honouring caller IDs would need either a sparse slice or a
	// map, and would make it possible to supply two units under one ID and have
	// one silently shadow the other. The roster generator sets it, because a
	// generated slice is useful to look at before it is run.
	ID int
	// Side is the army the unit fights for.
	Side Side
	// Role is what it is equipped to do.
	Role Role

	// HP is the unit's remaining condition, in hit points, and MaxHP is what
	// it started with. HP below FatalHPFraction does not kill a unit outright:
	// it fights on, badly, until a later blow finishes it. See
	// battle.fatal_hp_fraction in the balance file.
	HP, MaxHP float64

	// Morale is the unit's steadiness, 0-1. It is the whole of COMBAT.md
	// section 6's "low morale causes rout".
	Morale float64

	// MeleeSkill and RangedSkill are 0-1 skill scores. Both matter: a shooter
	// caught in a brawl swings badly.
	MeleeSkill, RangedSkill float64

	// Speed is the unit's base speed in metres per second, before the state
	// multiplier and exhaustion.
	Speed float64

	// Troops is how many bodies the unit represents.
	Troops float64

	// MeleeCooldown and RangedCooldown are the seconds left before this unit may
	// next swing and next shoot, per battle.melee_swing_seconds and
	// battle.ranged_fire_interval.
	//
	// They are committed state rather than something a stage keeps to itself,
	// because a stage writes to the delta buffer and a cooldown written onto the
	// unit inside a stage would let one unit's rate depend on which stage the
	// loop reached first. As snapshot and delta fields they are read at the top
	// of the tick like everything else, which is what keeps the stage order
	// irrelevant to the result.
	MeleeCooldown, RangedCooldown float64

	// Ammo is rounds remaining for a ranged unit. A ranged unit at zero
	// ammunition falls back to melee and starts losing morale for being
	// unable to fight back, per battle.morale_unarmed_hit.
	Ammo float64
	// AmmoStart is the opening load, recorded so a report can say what a side
	// carried and not only what it fired. The roster generator sets it; a caller
	// that leaves it at zero has its units credited with the configured load
	// instead, which is stated in the report rather than hidden.
	AmmoStart float64

	// Suppression is 0 to SuppressionCap. It accumulates under fire, decays
	// in a lull, and reduces both damage and accuracy while it is high.
	Suppression float64

	// Exhaustion is 0 to ExhaustionCap. Combat is a sprint: it accumulates
	// with attacks and distance and only partly recovers.
	Exhaustion float64

	// Status is the unit's condition.
	Status Status
	// Intent is what it is doing this tick, decided in the intent stage.
	Intent Intent

	// X and Y are the unit's position in metres. Side A starts on negative x
	// and advances toward positive x; side B the other way.
	X, Y float64
	// VX and VY are the velocity applied this tick, kept so the client and the
	// aftermath can see how the unit actually moved rather than only where it
	// ended up.
	VX, VY float64

	// MeleeTarget and RangedTarget are the ids this unit is engaging, or -1.
	// A target is a reference for reporting and for exhaustion accounting;
	// damage resolution re-derives distance from the snapshot.
	MeleeTarget, RangedTarget int

	// --- per-battle tallies ---
	// Shots and Swings count the attacks this unit made. They are written in
	// the commit, never in a stage, because a stage writes to the delta buffer
	// and a tally written straight onto the unit would let one unit's count
	// depend on another unit's stage having run first.
	Shots  float64
	Swings float64
}

// hpFrac is the unit's remaining condition on a 0-1 scale.
func (u *Unit) hpFrac() float64 {
	if u.MaxHP <= 0 {
		return 0
	}
	return u.HP / u.MaxHP
}

// alive reports whether the unit is still in the fight. Destroyed and
// surrendered units are out; everything else is in.
func (u *Unit) alive() bool { return u.Status.OnField() }

// effectiveness is how well the unit fights right now, before skill. A routed
// unit swings at a fraction of its normal damage and a broken unit at rather
// less than half, which is what makes the break threshold a real decision
// point rather than a label.
func (u *Unit) effectiveness(c config.Battle) float64 {
	base := 1.0
	switch u.Status {
	case StatusBroken:
		base = c.MeleeBrokenEffectiveness
	case StatusRouted, StatusSurrendered, StatusDestroyed:
		base = c.MeleeRoutedEffectiveness
	}
	return base
}

// snapshot is the read-only copy of a unit's mutable state taken at the top of
// a tick. Stages read snapshots and never the live units, which is what makes
// the order of stages irrelevant to the result.
type snapshot struct {
	HP, Morale, Suppression, Exhaustion float64
	Ammo                                float64
	// MeleeCooldown and RangedCooldown are the seconds left on each attack
	// timer. The combat stages read them to decide whether a unit acts at all
	// this tick, which is what makes battle.melee_swing_seconds and
	// battle.ranged_fire_interval rates rather than labels.
	MeleeCooldown, RangedCooldown float64
	Status                        Status
	X, Y                          float64
	// VX and VY are the velocity the unit actually had going into this tick.
	// They are the basis of the charge bonus in the melee stage, which is why
	// they are part of the state every stage reads rather than something a
	// stage infers.
	VX, VY float64
}

// take copies a unit's tick-visible state.
func take(u *Unit) snapshot {
	return snapshot{
		HP:             u.HP,
		Morale:         u.Morale,
		Suppression:    u.Suppression,
		Exhaustion:     u.Exhaustion,
		Ammo:           u.Ammo,
		MeleeCooldown:  u.MeleeCooldown,
		RangedCooldown: u.RangedCooldown,
		Status:         u.Status,
		X:              u.X,
		Y:              u.Y,
		VX:             u.VX,
		VY:             u.VY,
	}
}

// delta is everything one tick stages about one unit. Stages add to it; the
// commit merges every field and applies once. Two stages contributing to the
// same field therefore sum, and neither can see the other's number, which is
// what makes the order of the stages irrelevant to the result.
type delta struct {
	// HP is a signed hit-point change, negative from damage.
	HP float64
	// Morale is a signed morale change.
	Morale float64
	// Suppression is an added amount, clamped at the cap on commit.
	Suppression float64
	// Exhaustion is an added amount, clamped at the cap on commit.
	Exhaustion float64
	// DX and DY are the metres to move this tick.
	DX, DY float64

	// intent is the decided Intent. It is staged rather than assigned so the
	// intent stage is the only thing that sets it.
	intent    Intent
	intentSet bool

	// meleeTarget and rangedTarget are the staged target ids, or -1 for none.
	meleeTarget, rangedTarget int

	// meleeSwings and shots are the attacks made and the ammunition spent this
	// tick, for the tallies and for exhaustion.
	meleeSwings, shots float64
	// swingFired and shotFired say whether this tick's swing and shot actually
	// happened. The commit uses them to reload the attack timers, and they are
	// the reason the timers cannot be set by a stage directly: a stage records
	// that it fired and the commit does the arithmetic, so the interval is
	// applied once, from committed state, whatever order the stages ran in.
	swingFired, shotFired bool
	// meleeHits and rangedHits count the attacks that connected.
	meleeHits, rangedHits float64
	// suppressionDealt is the suppression this unit put on others this tick.
	suppressionDealt float64

	// newStatus is the status the commit will set, and newStatusSet is true
	// once a stage has staged one.
	newStatus    Status
	newStatusSet bool
}

// reset clears a delta for reuse across ticks. The array is allocated once and
// reused, because a battle at four thousand units a side would otherwise
// allocate eight thousand small structs a tick.
func (d *delta) reset() {
	*d = delta{meleeTarget: -1, rangedTarget: -1}
}

// stageStatus records a status change. First writer in a tick wins, and the
// intent stage runs first, so a rout decided from morale is never overwritten by
// a later calculation that read the old status.
//
// It reports whether it was the writer, and callers that have side effects to
// attach to the change MUST gate on that report rather than on their own
// intention. CONSTITUTION.md section 2.2 requires a cause row for every tracked
// write, and a row emitted for a write that another stage pre-empted is a cause
// row for something that did not happen: a battle report that lists a surrender
// its own statistics do not contain is a report nobody can act on. It is also
// not a cheap mistake. A routed unit reaches the surrender test every tick it
// spends routed, the intent stage has already staged StatusRouted by then, and
// an unguarded surrender event is a formatted string built and thrown away
// several times a second for every routed unit on the field — which is where
// twelve million discarded events and a fourteen minute battle came from.
func (d *delta) stageStatus(s Status) bool {
	if d.newStatusSet {
		return false
	}
	d.newStatusSet = true
	d.newStatus = s
	return true
}

// supersedeStatus overwrites whatever status has been staged this tick.
//
// It exists for exactly one transition, surrender, and the reason it is needed
// is that surrender was otherwise unreachable. The intent stage re-asserts
// StatusRouted for every routed unit on every tick, so it always claimed the
// tick's status first, so a surrender staged later could never win the race —
// and a 20000 tick battle in which four hundred men ran for the horizon
// recorded not one surrender, because the mechanic existed and did nothing.
// That is CONSTITUTION.md section 1.3's silent fallback, reached from a rule
// that was supposed to be first-writer-wins.
//
// The hold the intent stage asserts and the surrender the morale stage decides
// are answering different questions, and the surrender is the right answer to
// both: the man is out of the fight either way, and a unit marked Surrendered is
// off the field for morale, for targeting, and for the casualty totals, whereas
// one left at Routed runs for the rest of the battle and is still counted as
// part of the side's strength.
//
// stageIntent no longer re-asserts status at all, so this is now the only writer
// that ignores first-writer-wins, and it is reached only from stageMorale after
// every other status write for that unit has had its chance. See the section on
// the status slot in intent.go.
func (d *delta) supersedeStatus(s Status) {
	d.newStatusSet = true
	d.newStatus = s
}

// strength is a side's battle strength: bodies weighted by condition and by
// how well they are currently fighting. A full side at full morale is its
// starting strength, so every later comparison is a share of what was there.
func strength(units []*Unit, side Side, c config.Battle) float64 {
	total := 0.0
	for _, u := range units {
		if u.Side != side || !u.alive() {
			continue
		}
		total += u.Troops * u.hpFrac() * u.effectiveness(c)
	}
	return total
}

// routedBodies is the share of a side's opening bodies that are currently
// running. It is the quantity battle.rout_strength_fraction is defined against:
// "share of a side's starting strength made of routed units at which the whole
// side is treated as routed and yields".
//
// It deliberately does NOT multiply by Unit.effectiveness. That discount is what
// a routed unit contributes to battle strength — it is the measure of how much
// fighting the side has left — and applying it here as well measured the rout
// ending twice over in the wrong direction: a routed unit counted as a fifteenth
// of the man he was, so an army with 86% of its units running registered as 13%
// routed and could never reach a 0.55 threshold. Both sides then routed almost
// completely, nothing could kill anybody, and the battle ran to
// battle.max_ticks and reported a stalemate — a fight that could not end.
//
// The fix is to measure the share the constant names: bodies that are running,
// against bodies that started. hpFrac still counts, because a routed unit that
// has been shot to pieces is less of a man who is still on his feet, but a unit
// that has turned its back is a man who has stopped fighting, and that is the
// whole of what this ending tests.
func routedBodies(units []*Unit, side Side) float64 {
	total := 0.0
	for _, u := range units {
		if u.Side != side || u.Status != StatusRouted {
			continue
		}
		total += u.Troops * u.hpFrac()
	}
	return total
}

// actableBodies is how many bodies on a side can still fight. A side with none
// left has lost whatever its strength arithmetic says.
func actableBodies(units []*Unit, side Side) float64 {
	total := 0.0
	for _, u := range units {
		if u.Side == side && u.Status.Actable() {
			total += u.Troops * u.hpFrac()
		}
	}
	return total
}

// clamp01 bounds v to [0,1].
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// clamp bounds v to [lo,hi].
func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// isFinite reports whether v is a real number. A NaN that reaches a hit-point
// field would poison it forever and quietly corrupt every later comparison,
// because every comparison against NaN is false. Anything that computes a
// division or a square root checks the result here.
func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}
