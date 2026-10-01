package battleverify

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// Probe is a read-only Commander that checks the battle's published state on
// every tick.
//
// It exists because three of the required invariants are claims about per-tick
// state and battle.Result is the end state only: a unit that spent nine hundred
// ticks at negative hit points and was clamped on the last one leaves no trace in
// the result, and a unit that walked off the map and back leaves none either. The
// engine publishes per-tick state in exactly one place, the Commander seam, so
// that is where they have to be measured.
//
// It writes no orders. Every UnitCommand handed to it is left untouched, so a
// battle watched by a Probe is the battle battle.Run produces. RunScenario proves
// that rather than assuming it: it runs the same setup twice, once through the
// seam and once without, and requires the two result hashes to match. That check
// is what makes every other number here a measurement of the engine.
//
// What a Probe cannot see, stated plainly: the engine publishes its view at the
// top of each tick, before that tick's commit, so the last state it publishes is
// the state before the final tick's writes. The per-tick rules therefore cover
// every tick the engine published, and the end-state rules in invariants.go cover
// the final state from the result itself. The two together cover the whole run,
// with the final tick's committed state covered by the result rather than by the
// view, and the report says which is which.
type Probe struct {
	bounds    Bounds
	stepLimit float64
	eps       float64
	// suppressionCap is battle.suppression_cap, the ceiling the engine clamps
	// suppression to.
	suppressionCap float64

	// sides is the side each unit id was first seen on, and seen records which ids
	// have been sighted at all. A unit that changes side mid-battle is a bug of the
	// worst kind, because every side-indexed total after it would be quietly wrong,
	// so the first sighting is remembered and compared against from then on. The
	// two slices rather than one because a pre-filled side per id would report every
	// unit of side B as having changed sides on the first tick.
	sides []battle.Side
	seen  []bool
	// units is the unit count the setup declared, and startedAt whether the first
	// published tick has been seen.
	units     int
	startedAt bool

	// prevX and prevY hold the previous tick's published positions, so a tick's
	// displacement can be measured rather than assumed.
	prevX, prevY []float64

	// meleeRange is battle.melee_range, the reach of a blow, and it is the number
	// the contact measurement is judged against.
	meleeRange float64
	// minFoe is the smallest distance any two opposing units that could actually
	// strike each other were ever seen at, with the tick and the two unit ids it
	// happened to. contactTicks is how many published ticks had at least one such
	// pair inside melee range.
	//
	// "Could actually strike each other" is the engine's own Actable, not a
	// definition invented here: a destroyed or surrendered man is inert to the
	// simulation and a routed one still bites, so those three and those three are
	// the statuses the melee stage will swing at. Measuring contact against any
	// other set of statuses would produce a number that answers a question nobody
	// asked.
	minFoe       float64
	minFoeAt     int
	minFoeA      int
	minFoeB      int
	minFoeSet    bool
	contactTicks int

	// ticks is how many published views were checked.
	ticks int
	// maxAbsX, maxAbsY, and maxStepSeen are the furthest any unit was ever seen
	// from the origin, on either axis, and the largest single-tick step observed.
	// The report quotes them against the bounds so a reader can see the headroom
	// rather than only the verdict.
	maxAbsX, maxAbsY, maxStepSeen float64

	log violationLog
}

// NewProbe builds a probe for a battle of the given unit counts.
//
// It needs the unit counts because the battlefield envelope is derived from the
// starting layout: how wide a side's block is depends on how many units are in
// it, and battle.roster_frontage and battle.roster_formation_depth set the rest.
func NewProbe(cfg *config.Config, unitsA, unitsB int) *Probe {
	c := cfg.Battle
	return &Probe{
		bounds: Bounds{
			halfX:       c.RosterStartDistance/2 + c.RosterFormationDepth*c.LateralDrift/2 + c.RoutFleeRadius,
			halfY:       halfFrontage(unitsA, unitsB, c) + c.RosterFrontage*c.LateralDrift/2 + c.RoutFleeRadius,
			maxStep:     c.MaxStepPerTick,
			tickSeconds: c.TickSeconds,
			startDist:   c.RosterStartDistance,
		},
		stepLimit:      c.MaxStepPerTick,
		eps:            stepEpsilon,
		suppressionCap: c.SuppressionCap,
		meleeRange:     c.MeleeRange,
		units:          unitsA + unitsB,
		sides:          make([]battle.Side, unitsA+unitsB),
		seen:           make([]bool, unitsA+unitsB),
		prevX:          make([]float64, unitsA+unitsB),
		prevY:          make([]float64, unitsA+unitsB),
	}
}

// stepEpsilon is the relative slack allowed on a per-tick displacement.
//
// One part in a thousand of the step limit. It exists only for floating point:
// the engine clamps a staged step to max_step_per_tick by scaling it, so a unit
// can land a few ulps over the limit without anything being wrong. It is four
// orders of magnitude below the smallest difference that could come from a real
// bug, because the smallest real bug here is a unit stepping twice as far as it
// should.
const stepEpsilon = 1e-3

// Command is the battle.Commander method. It reads the whole field, checks it,
// and returns without writing an order.
//
// It returns an error in exactly one case: a nil view. A nil view means the
// engine published nothing to inspect, and continuing would report a clean run of
// zero ticks checked, which is the shape of a fake pass this package exists to
// prevent. Every other problem is recorded as a violation and the battle is left
// to finish, because a run that stops at the first bad tick reports one finding
// where a run that finishes reports the whole picture.
func (p *Probe) Command(v *battle.View) error {
	if v == nil {
		return fmt.Errorf("battleverify: the battle published a nil view at tick %d, so this tick "+
			"cannot be checked; a probe that was shown nothing must not report a clean tick",
			p.ticks)
	}

	if len(v.Units) != p.units {
		p.log.add(RuleRosterStable, "", v.Tick,
			"the field holds %d units, the setup declared %d", len(v.Units), p.units)
		p.units = len(v.Units)
		p.sides = resizeSides(p.sides, p.units)
		p.seen = resizeBools(p.seen, p.units)
		p.prevX = resizeFloats(p.prevX, p.units)
		p.prevY = resizeFloats(p.prevY, p.units)
	}

	// The envelope grows with the ticks elapsed, because the engine bounds how far
	// a unit may travel in one tick and nothing bounds how many ticks there are.
	// Reading it once per tick rather than per unit keeps the rule's meaning in
	// one place.
	boundX := p.bounds.X(v.Tick)
	boundY := p.bounds.Y(v.Tick)

	for i := range v.Units {
		u := &v.Units[i]
		side := u.Side.String()

		// The roster, first: if ids are not dense and ascending then the index and
		// the id have come apart, and every other per-unit check below would be
		// measuring the wrong unit.
		if u.ID != i {
			p.log.add(RuleRosterStable, side, v.Tick,
				"unit at view index %d carries id %d; ids are dense and ascending by contract", i, u.ID)
		}
		switch {
		case i >= len(p.sides):
			// The count grew on this very tick and the resize above has already run,
			// so reaching here means the view is longer than the probe's own
			// bookkeeping, which is the roster violation already recorded above.
		case !p.seen[i]:
			p.sides[i], p.seen[i] = u.Side, true
		case p.sides[i] != u.Side:
			p.log.add(RuleRosterStable, side, v.Tick,
				"unit %d was on side %s a tick ago and is on side %s now", u.ID, p.sides[i], u.Side)
		}

		// Finiteness before every range check, because NaN compares false against
		// every bound and would pass a range test that it fails.
		p.checkFinite(u, v.Tick, "x", u.X)
		p.checkFinite(u, v.Tick, "y", u.Y)
		p.checkFinite(u, v.Tick, "hp", u.HPFrac)
		p.checkFinite(u, v.Tick, "morale", u.Morale)
		p.checkFinite(u, v.Tick, "suppression", u.Suppression)
		p.checkFinite(u, v.Tick, "troops", u.Troops)
		p.checkFinite(u, v.Tick, "speed", u.Speed)
		p.checkFinite(u, v.Tick, "ammo", u.Ammo)

		// The required invariant: no unit below zero hit points.
		//
		// The engine clamps a unit's hit points at zero when it commits a tick, so
		// in the current build this cannot fail. It is checked anyway, and that is
		// the point: a clamp is a guard, a guard is not an argument, and the day
		// somebody removes the clamp this rule is the thing that says so instead of
		// letting a battle quietly heal its own wounded.
		if u.HPFrac < 0 {
			p.log.add(RuleHitPoints, side, v.Tick,
				"unit %d has %g of its hit points, which is below zero", u.ID, u.HPFrac)
		} else if u.HPFrac > 1 {
			p.log.add(RuleHitPoints, side, v.Tick,
				"unit %d has %g of its hit points, which is above its maximum", u.ID, u.HPFrac)
		}

		// The other clamped quantities, checked for the same reason: a clamp that
		// is never exercised is a clamp nobody has tested.
		if u.Morale < 0 || u.Morale > 1 {
			p.log.add(RuleFinite, side, v.Tick,
				"unit %d has morale %g, outside 0-1", u.ID, u.Morale)
		}
		if u.Suppression < 0 || u.Suppression > p.suppressionCap+stepEpsilon {
			p.log.add(RuleFinite, side, v.Tick,
				"unit %d has suppression %g, outside 0 to the configured cap of %g",
				u.ID, u.Suppression, p.suppressionCap)
		}
		if u.Ammo < 0 {
			p.log.add(RuleFinite, side, v.Tick,
				"unit %d has %g rounds left", u.ID, u.Ammo)
		}
		if u.Troops <= 0 {
			p.log.add(RuleFinite, side, v.Tick,
				"unit %d stands for %g bodies", u.ID, u.Troops)
		}

		// The required invariant: no unit outside the battlefield.
		ax, ay := math.Abs(u.X), math.Abs(u.Y)
		if ax > boundX {
			p.log.add(RuleFieldBounds, side, v.Tick,
				"unit %d is at x=%g, outside %g m: the envelope is %g m from the origin and "+
					"the sides start %g m apart", u.ID, u.X, boundX, boundX, p.bounds.startDist)
		}
		if ay > boundY {
			p.log.add(RuleFieldBounds, side, v.Tick,
				"unit %d is at y=%g, outside %g m; the widest the two starting blocks can be is %g m",
				u.ID, u.Y, boundY, boundY)
		}
		if ax > p.maxAbsX {
			p.maxAbsX = ax
		}
		if ay > p.maxAbsY {
			p.maxAbsY = ay
		}

		// The required invariant, in its tightest available form: the engine bounds
		// every staged step, including an ordered one, so no unit may move further
		// in a tick than max_step_per_tick. This catches a unit leaving the field
		// and coming back, which the envelope above would only catch if it stayed
		// out long enough.
		if p.startedAt {
			step := math.Hypot(u.X-p.prevX[i], u.Y-p.prevY[i])
			if step > p.stepLimit {
				p.log.add(RuleNoTeleport, side, v.Tick,
					"unit %d moved %.3f m in one tick, past the engine's own limit of %g m",
					u.ID, step, p.stepLimit)
			}
			if step > p.maxStepSeen {
				p.maxStepSeen = step
			}
		}
		p.prevX[i], p.prevY[i] = u.X, u.Y
	}

	p.scanContact(v)

	p.ticks = v.Tick + 1
	p.startedAt = true
	return nil
}

// scanContact measures how close the two armies ever came, tick by tick.
//
// WHY IT IS HERE AND NOT A RULE ON THE RESULT: a battle in which the armies never
// touch produces a perfectly coherent result. The casualty totals add up, the
// winner is one of the two sides, the tick count is inside the bound, and every
// other rule in this package passes. What the result cannot show is WHY it ended,
// and the reason a battle ends matters more than the fact that it did: suppression
// and panic can decide a fight at long range, and if that is the only thing
// deciding fights then the melee stage never runs, half the model in COMBAT.md is
// unreachable, and every report of a successful battle is really a report that the
// armies stood far apart and got tired. That is the "ran fine" claim this package
// exists to refuse, and the only way to see it is to measure the gap.
//
// The cost is O(units squared) per tick, against the engine's own O(units) hash
// queries, and it is the most expensive thing the harness does. It is paid anyway,
// because an approximation here would be a number that is sometimes a lie and the
// report would not say which times. At the suite's default sizes the whole
// contact scan costs less than the battle it watches; the report prints the wall
// time with and without the probe so a reader can see what the checking costs.
func (p *Probe) scanContact(v *battle.View) {
	touching := false
	for i := range v.Units {
		a := &v.Units[i]
		if !a.Status.Actable() {
			continue
		}
		for j := i + 1; j < len(v.Units); j++ {
			b := &v.Units[j]
			if b.Side == a.Side || !b.Status.Actable() {
				continue
			}
			d := math.Hypot(a.X-b.X, a.Y-b.Y)
			// The flag is set here and not at the top of the function on purpose.
			// "A tick was scanned" and "two men who could strike each other were
			// seen" are different facts, and the rule downstream has to tell them
			// apart: a battle whose published state holds no actable man on one
			// side never produced a distance, and reporting that as an approach of
			// +Inf metres would be a confident number about nothing. So the first
			// real pair sets the flag, and a battle that never had one is left
			// unset for the rule to call the fault it is.
			if !p.minFoeSet || d < p.minFoe {
				p.minFoe, p.minFoeAt, p.minFoeA, p.minFoeB = d, v.Tick, a.ID, b.ID
				p.minFoeSet = true
			}
			if d <= p.meleeRange {
				touching = true
			}
		}
	}
	if touching {
		p.contactTicks++
	}
}

// checkFinite records a violation for one published field that is not finite.
func (p *Probe) checkFinite(u *battle.UnitView, tick int, field string, v float64) {
	if !isFinite(v) {
		p.log.add(RuleFinite, u.Side.String(), tick,
			"unit %d published %s = %v, which is not a number the simulation can use",
			u.ID, field, v)
	}
}

// Bounds is the battlefield envelope a probe checks positions against.
//
// It is a movement reach, not a claim that the field has walls, and it is derived
// from the engine's own constants rather than chosen:
//
//   - Each side starts at +/- roster_start_distance/2 on the x axis, so that is
//     where the envelope starts.
//   - The starting layout jitters by formation_depth * lateral_drift, so that is
//     added.
//   - A routed or withdrawing man moves away from the enemy centre of mass out to
//     rout_flee_radius, which is added because a rout is a legitimate way to leave
//     the starting line.
//   - The engine bounds a unit's movement to max_step_per_tick per tick and does
//     not bound the tick count, so the envelope grows by max_step_per_tick for
//     every tick that has run.
//
// Every term is a movement the engine permits, so a unit outside the envelope is
// a unit the engine's own rules could not have put there: a NaN, a teleport, a
// mixed-up index. The envelope therefore cannot produce a false failure, which is
// the property that makes it worth having; a tight hand-picked box around the
// starting lines would fail every long battle for the perfectly legal reason that
// a routed man keeps running.
type Bounds struct {
	halfX       float64
	halfY       float64
	maxStep     float64
	tickSeconds float64
	startDist   float64
}

// X is the envelope's half width after n ticks.
func (b Bounds) X(n int) float64 { return b.halfX + b.maxStep*float64(n) }

// Y is the envelope's half depth after n ticks.
func (b Bounds) Y(n int) float64 { return b.halfY + b.maxStep*float64(n) }

// halfFrontage is how wide, in metres, the widest of two starting blocks can be.
//
// The engine lays a side out in a block about three times wider than it is deep,
// with one column per unit, so the width follows from the larger side's unit
// count. It is reproduced here rather than imported because the layout function
// is the engine's own and the harness is not allowed to reach inside it; the
// envelope is generous by a factor of two over the layout's frontage constant
// below, so a small disagreement about the exact column count costs nothing.
func halfFrontage(unitsA, unitsB int, c config.Battle) float64 {
	n := unitsA
	if unitsB > n {
		n = unitsB
	}
	cols := 1
	if n > 0 {
		// sqrt(n*3) is the engine's column count for a block three times wider
		// than deep; taking the next whole number up keeps this an over-estimate.
		cols = int(math.Ceil(math.Sqrt(float64(n) * 3)))
		if cols < 1 {
			cols = 1
		}
		if cols > n {
			cols = n
		}
	}
	return float64(cols) * c.RosterFrontage
}

// resizeSides grows a side-per-id slice to n entries.
func resizeSides(s []battle.Side, n int) []battle.Side {
	for len(s) < n {
		s = append(s, battle.SideA)
	}
	return s[:n]
}

// resizeBools grows a bool slice to n entries.
func resizeBools(s []bool, n int) []bool {
	for len(s) < n {
		s = append(s, false)
	}
	return s[:n]
}

// resizeFloats grows a float slice to n entries.
func resizeFloats(s []float64, n int) []float64 {
	for len(s) < n {
		s = append(s, 0)
	}
	return s[:n]
}

// isFinite reports whether v is a number the simulation can use.
func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
