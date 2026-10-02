package battle

import "math"

// stageIntent decides what every unit is doing this tick, and stages the
// movement that follows from it.
//
// It runs first and reads only the snapshot, so every later stage can look at a
// unit's staged Intent and know it is the same decision this stage made from the
// same state, rather than one derived from a mixture of half-applied changes.
//
// The four intents, in the order they are tested:
//
//	rout     the unit is running. It ignores its weapons entirely and moves
//	         directly away from the nearest enemy it can see, at
//	         rout_speed_scale.
//	withdraw the unit is broken. It backs off and keeps its weapons up, at
//	         withdraw_speed_scale, which is slower than the rout that would
//	         follow. A shaken line can be pushed back and rallied rather than
//	         lost outright, which is why breaking and routing are separate
//	         thresholds.
//	engage   the unit is in contact and stands and fights, easing aside from
//	         the mass of its own side so that a block in contact spreads
//	         across its front instead of folding onto one point.
//	advance  the unit is closing on the enemy army, at approach_speed_scale,
//	         or at charge_speed_scale when the gap is beyond charge_distance.
//
// There is no hold, no flank, and no per-unit behaviour to tune. Both sides get
// exactly the same logic, which is what makes a battle result a property of the
// two forces rather than of which side the computer happens to be playing.
//
// # WHY THE INTENT STAGE DOES NOT CLAIM THE STATUS SLOT
//
// This stage used to re-assert each unit's current status with d.stageStatus,
// to stop a later stage from deciding a routed man was still running. It held
// the value correctly and it cost the battle its ending.
//
// d.stageStatus is first-writer-wins, one slot per unit per tick, and this
// stage runs first. So re-asserting StatusBroken on a broken unit claimed the
// slot before stageMorale ran, and stageMorale then could not write anything.
// Measured on the 500 v 500 battle at tick 340, every one of the 471 units still
// on the field was Broken at morale exactly 0.0000, which is below
// morale_rout_threshold 0.14:
//
//	intent stage claims Broken .............. true
//	morale stage then writes Routed ......... false
//	rally path would write Fighting ......... false
//
// A unit in that state has no exit. It cannot be marked Routed, because the
// write is pre-empted, so routedBodies stays 0 and the rout_strength_fraction
// ending never fires. It cannot rally, for the same reason. It cannot recover,
// because battle.morale_recovery is gated on Status == StatusFighting
// (morale.go), which a broken unit can never become. It still counts as actable
// (Status.Actable includes Broken), so the actableBodies ending does not fire
// either. Both sides sat at 22% strength, above the 12% surrender threshold,
// with nobody able to do anything about it, until battle.max_ticks returned a
// stalemate twenty thousand ticks later. That is CONSTITUTION.md section 1.3's
// silent fallback: a mechanic that existed, was reachable in principle, and did
// nothing at all.
//
// The re-assertion was never needed. commit writes u.Status only when
// newStatusSet is true (battle.go), so a unit with no staged status keeps the
// status it already had. Not writing the slot holds the value just as well; it
// simply leaves the slot free for the stage that actually measures the thing a
// transition is decided from. This stage decides movement from a status. It does
// not decide status, and it must not write one.
//
// # WHY THE ADVANCE IS TWO-DIMENSIONAL
//
// Advancing units steer toward the enemy army's centre of mass rather than
// marching along a fixed axis, and that is a correctness requirement rather
// than a nicety. An axial advance cannot heal a lateral offset: two units that
// drift apart across the field close in x and pass one another while the gap in
// y never shrinks, so they end up permanently out of contact, out of ranged
// reach, and unable to damage each other. Both sides then sit there at full
// strength with nothing left to decide the battle, and checkEnding — which
// rightly refuses to call a stalemate while both armies can still fight —
// never fires. The battle does not end; it runs to the tick bound. A battle
// that cannot end is not a battle, so the units steer.
func (b *Battle) stageIntent() {
	c := b.c

	// Where each side's enemy is, computed once per tick rather than per unit.
	// It is two linear passes over the field per tick, and it replaces a
	// per-unit neighbourhood query that would otherwise be paid by every unit on
	// both sides. Only units that can still fight count: the aim is the enemy
	// army that is holding the field, not the men already running away from it,
	// and a formation that turned to chase a rout would be a formation that
	// stopped fighting.
	aimAX, aimAY, hasAimA := b.enemyStronghold(SideA)
	aimBX, aimBY, hasAimB := b.enemyStronghold(SideB)

	for i := range b.units {
		u := b.units[i]
		s := &b.snap[i]
		d := &b.deltas[i]
		if !u.alive() {
			continue
		}

		if s.Status == StatusRouted {
			// The unit keeps running this tick. The status is deliberately NOT
			// staged here: commit only writes u.Status when newStatusSet is true
			// (battle.go), so leaving it unstaged holds the unit at Routed just
			// as well as re-asserting it, without consuming the tick's single
			// status write.
			//
			// That slot belongs to the morale stage, which is the only stage that
			// computes the thing a status transition is decided from. Claiming it
			// here made this stage the authority on a value it never measures, and
			// it silently destroyed the two transitions that matter most. See
			// WHY THE INTENT STAGE DOES NOT CLAIM THE STATUS SLOT below.
			d.intentSet, d.intent = true, IntentRout
			ex, ey, found := b.enemyCentre(b.meleeHash, u.Side, s.X, s.Y, c.RoutFleeRadius)
			if !found {
				b.stageMove(i, b.awayAxis(u.Side), 0)
				continue
			}
			b.stageMoveAway(i, ex, ey, c.RoutSpeedScale)
			continue
		}

		if s.Status == StatusBroken {
			d.intentSet, d.intent = true, IntentWithdraw
			ex, ey, found := b.enemyCentre(b.meleeHash, u.Side, s.X, s.Y, c.RoutFleeRadius)
			if !found {
				continue
			}
			b.stageMoveAway(i, ex, ey, c.WithdrawSpeedScale)
			continue
		}

		// A fighting unit decides between standing to fight and closing, by
		// whether anything of the enemy is within reach.
		if u.Role == RoleRanged && s.Ammo >= 1 {
			if b.inFireArc(s.X, s.Y, u.Side) {
				d.intentSet, d.intent = true, IntentEngage
				b.stageSeparate(i, u, s)
				continue
			}
		} else if b.contact[i] {
			d.intentSet, d.intent = true, IntentEngage
			b.stageSeparate(i, u, s)
			continue
		}

		// A man cannot walk through the man in front of him. This is the rule
		// that makes a block a block instead of a queue.
		//
		// WHY THIS IS HERE: THE RANKS WERE WALKING THROUGH EACH OTHER
		//
		// Measured on the 500 v 500 battle before this rule, the two blocks did
		// not meet along a front. They passed through one another, and 96.8% of
		// units were never inside a swing of an enemy at any point:
		//
		//	peak units in melee reach at any one tick: 10 of 400 (2.5%)
		//	units that were NEVER inside a swing of an enemy: 387 of 400 (96.8%)
		//	units that finished the battle PAST their enemy:  102
		//
		// The mechanism was shear. Nothing stopped an advancing unit from moving
		// through a friendly who had already stopped to fight, so the second rank
		// overtook the first, the third overtook the second, and the block's x
		// depth grew by roughly one unit's step per tick for the whole approach
		// while its y width stayed put: 61.8 m of depth became 213.6 m. The block
		// was not moving, its length was increasing. At tick 275, with the leading
		// edge already past the enemy, 148 of 200 units were still advancing and
		// the 52 that had engaged were strung from x=-208 to x=-1 BEHIND them.
		//
		// A first attempt at this rule blocked on any friendly within
		// battle.standoff_distance ahead, and it froze the army on tick 20. A
		// column is four metres deep by battle.roster_formation_depth, so every man
		// has a man ahead of him inside the standoff distance from the first tick,
		// and a rule that cannot tell a column from a queue stops both. Measured:
		// 171 of 200 units engaged at tick 20 and the block never closed again.
		//
		// So the rule blocks on a friendly who is IN CONTACT with the enemy, not
		// merely on one who is nearby. That is the physical constraint and not an
		// approximation of it: a man who is fighting has his ground, and you cannot
		// occupy it. It does not freeze a column, because in a column advancing on
		// open ground nobody is in contact until the front rank reaches the enemy,
		// and it does not let a rank walk through, because the rank in front of it
		// is in contact by then.
		//
		// It also leaves ranged units out of it deliberately. A shooter stops to
		// trade fire at battle.ranged_range, which is two hundred and forty metres,
		// and a shooter is not in melee contact, so he does not block the men
		// behind him from closing. If he did block them, the back rank of a mixed
		// force would stand off at two hundred and forty metres and the battle
		// would never reach a swing. The blocking test is contact, so the rule
		// fires for the front rank that is actually in the fight and for nothing
		// else.
		//
		// Contact is read from the per-tick contact flags rather than re-queried
		// per candidate: asking "is he in contact" inside the walk over the
		// standoff box would be a neighbourhood query inside a neighbourhood
		// query, per friendly candidate, per unit, per tick. The flags cost one
		// pass over the field per tick and are read by both this rule and the
		// intent decisions below, so the question has one answer.
		if b.blockedByContact(i, u, s) {
			d.intentSet, d.intent = true, IntentEngage
			b.stageSeparate(i, u, s)
			continue
		}

		d.intentSet, d.intent = true, IntentAdvance
		scale := c.ApproachSpeedScale
		// Charge only from a gap wide enough for the extra speed to buy
		// something. From a short gap it is a sprint that arrives no sooner and
		// only tires the man.
		if u.Role == RoleMelee && !b.enemyWithin(s.X, s.Y, u.Side, c.ChargeDistance) {
			scale = c.ChargeSpeedScale
		}
		aimX, aimY, hasAim := aimAX, aimAY, hasAimA
		if u.Side == SideB {
			aimX, aimY, hasAim = aimBX, aimBY, hasAimB
		}
		if !hasAim {
			b.stageMove(i, b.towardAxis(u.Side)*scale, 0)
			continue
		}
		b.stageMoveToward(i, aimX, aimY, scale)
		b.stageSeparate(i, u, s)
	}
}

// enemyStronghold is the bodies-weighted centre of mass of the units on the
// opposing side that can still fight, and whether there are any.
//
// Two linear passes per tick, one per side, which is what makes the advance
// steerable without paying a neighbourhood query per unit. Routed units are
// excluded deliberately: a man who has turned his back is no longer something
// the line moves toward.
func (b *Battle) enemyStronghold(side Side) (float64, float64, bool) {
	enemy := side.Opposing()
	sumX, sumY, weight := 0.0, 0.0, 0.0
	for _, o := range b.units {
		if o.Side != enemy || !o.Status.Actable() {
			continue
		}
		w := o.Troops
		sumX += o.X * w
		sumY += o.Y * w
		weight += w
	}
	if weight <= 0 {
		return 0, 0, false
	}
	return sumX / weight, sumY / weight, true
}

// awayAxis is the direction a unit with nothing to run from runs: backwards
// along the battle axis, away from the enemy side. Side A starts on negative x
// and so flees toward negative x, and side B the other way.
func (b *Battle) awayAxis(s Side) float64 { return -b.towardAxis(s) }

// towardAxis is the direction a unit closes in: side A toward positive x, side B
// toward negative x.
func (b *Battle) towardAxis(s Side) float64 {
	if s == SideA {
		return 1
	}
	return -1
}

// stageMove moves a unit along an axis at the given speed scale.
func (b *Battle) stageMove(i int, dirX, dirY float64) {
	u := b.units[i]
	d := &b.deltas[i]
	d.DX += u.Speed * dirX * b.c.TickSeconds
	d.DY += u.Speed * dirY * b.c.TickSeconds
	b.clampStep(d)
}

// stageMoveAway moves a unit directly away from a point at the given speed
// scale. It serves both the withdraw and the rout; what separates those two is
// the scale and the fact that a routed unit never stops to strike.
func (b *Battle) stageMoveAway(i int, tx, ty, scale float64) {
	u := b.units[i]
	s := &b.snap[i]
	d := &b.deltas[i]
	dx, dy := s.X-tx, s.Y-ty
	dist := math.Sqrt(dist2(dx, dy))
	if dist <= 0 || !isFinite(dist) {
		// Standing on top of what it is running from. Step backwards along the
		// battle axis rather than dividing by a zero distance.
		b.stageMove(i, b.awayAxis(u.Side)*scale, 0)
		return
	}
	step := u.Speed * scale * b.c.TickSeconds
	d.DX += dx / dist * step
	d.DY += dy / dist * step
	b.clampStep(d)
}

// stageMoveToward moves a unit directly toward a point at the given speed
// scale. It is the advance: unlike a march along the battle axis it closes in
// both axes, so a unit that has been pushed sideways rejoins rather than
// sidestepping past the enemy forever.
func (b *Battle) stageMoveToward(i int, tx, ty, scale float64) {
	u := b.units[i]
	s := &b.snap[i]
	d := &b.deltas[i]
	dx, dy := tx-s.X, ty-s.Y
	dist := math.Sqrt(dist2(dx, dy))
	if dist <= 0 || !isFinite(dist) {
		// Standing on the aim point. Fall back to the battle axis rather than
		// dividing by a zero distance.
		b.stageMove(i, b.towardAxis(u.Side)*scale, 0)
		return
	}
	step := u.Speed * scale * b.c.TickSeconds
	d.DX += dx / dist * step
	d.DY += dy / dist * step
	b.clampStep(d)
}

// stageSeparate eases a unit away from the mass of its own side's nearby units,
// so that a block in contact spreads across its front instead of every man in
// it converging on the same point.
//
// battle.standoff_distance is the separation radius, which is what that constant
// is for: the balance file describes it as the spacing that stops a line
// collapsing into a single point, and this is the rule that honours it.
//
// The push is away from the centre of mass of the unit's OWN side, which is the
// whole point. An earlier version of this rule was mirrored by side — side A
// slid one way and side B the other — on the reasoning that the two blocks
// should spread apart rather than fold together. It does spread them apart, all
// the way: the drift had no restoring force, so every unit that had once been
// in contact kept sliding, and the two armies slowly peeled apart across the
// field until nothing was in reach of anything. A separation that pushes a
// whole army away from its opponent is not a separation, it is a retreat, and
// a retreat applied to both sides at once is a battle that can never be won or
// lost. Nothing here has a side-dependent term, so the two armies close instead.
func (b *Battle) stageSeparate(i int, u *Unit, s *snapshot) {
	c := b.c
	if c.StandoffDistance <= 0 {
		return
	}
	r2 := c.StandoffDistance * c.StandoffDistance
	sumX, sumY, weight, distSum := 0.0, 0.0, 0.0, 0.0
	hf := &b.hot
	mySide := uint8(u.Side)
	b.meleeHash.forEachCell(s.X, s.Y, c.StandoffDistance, func(id int) {
		if id == u.ID {
			return
		}
		if hf.side[id] != mySide || !hf.alive[id] {
			return
		}
		d2 := dist2(hf.x[id]-s.X, hf.y[id]-s.Y)
		if d2 > r2 {
			return
		}
		w := hf.troops[id]
		sumX += hf.x[id] * w
		sumY += hf.y[id] * w
		weight += w
		// The bodies-weighted mean squared distance to the neighbours inside the
		// standoff, which is what the crowding scale below is read from.
		distSum += d2 * w
	})
	if weight <= 0 {
		// Nothing of its own side nearby: nothing to spread away from.
		return
	}
	// The push is away from the centre of mass of the neighbours, on BOTH axes,
	// and it is scaled by how crowded this unit actually is, so that
	// battle.standoff_distance is an EQUILIBRIUM SPACING rather than a velocity.
	//
	// # WHY IT IS SCALED, MEASURED
	//
	// An earlier version of this rule pushed a constant battle.lateral_drift
	// every tick with no restoring force, which is not a spacing rule at all: a
	// unit pushed outward leaves the radius and stops being pushed, and the edge
	// of a block is always its most crowded part, so the edge always gains. On
	// the 500 v 500 battle the block's width went from 61 m to 111 m by tick 300
	// while the constant pushed a single unit 0.6 m a tick for three hundred
	// ticks in one direction, and the two sides' fronts stopped facing each
	// other at all. Sliced into 4 m bands of y at the tick of closest approach,
	// the gap between the leading men swung from -16 m (crossed) to +358 m (never
	// touched) from one band to the next.
	//
	// # WHY IT IS ON BOTH AXES, MEASURED
	//
	// Limiting the push to the lateral axis was the next attempt and it was
	// worse, because it left the other half of the problem in place. Nothing then
	// stopped a rank from advancing THROUGH the rank in front of it: the
	// rank-blocking rule above only stops a man whose blocker is IN CONTACT, and
	// contact is a two-deep effect, so it propagates two ranks and no further.
	// Measured, the block was still 207 m deep at tick 300 against a
	// roster_formation_depth of 4 m and about thirteen ranks, which is about 52 m,
	// and 166 of 400 units finished the battle on the wrong side of their enemy.
	//
	// A symmetric push with crowding scaling has the property the block needs in
	// both directions at once. At the standoff the scale is zero and the block
	// holds its shape, whatever shape that is. Inside it, a unit is pushed back
	// out along the axis it crowded, which for a rear-rank man crowding the rank
	// ahead is BACKWARD, exactly the restoring force that stops a rank
	// overtaking. And a block that has been stretched in depth re-converges,
	// because the leading man of each rank is the one with nobody in front of him
	// and stays put while the rear of the rank is pushed forward into place.
	//
	// The push being away from the centre of mass of the unit's OWN side, with no
	// side-dependent term, is still what keeps the two armies closing on each
	// other. An earlier mirrored version pushed side A one way and side B the
	// other and peeled the armies apart across the field until nothing was in
	// reach of anything.
	//
	// dx is computed but not applied when the crowd is zero, so the early return
	// below it cannot read an uninitialised value.
	meanD := math.Sqrt(distSum / weight)
	crowd := 1 - meanD/c.StandoffDistance
	if crowd <= 0 || !isFinite(crowd) {
		return
	}
	if crowd > 1 {
		crowd = 1
	}
	dx := s.X - sumX/weight
	dy := s.Y - sumY/weight
	dist := math.Sqrt(dist2(dx, dy))
	if dist <= 0 || !isFinite(dist) {
		// Exactly on the centre of mass of his neighbours: no direction to be
		// pushed in. A man inside a solid block has this problem, and there is
		// no honest direction to invent for him.
		return
	}
	d := &b.deltas[i]
	step := c.LateralDrift * crowd
	d.DX += dx / dist * step
	d.DY += dy / dist * step
	b.clampStep(d)
}

// clampStep bounds a staged move to max_step_per_tick in total length.
//
// This is a hard bound, not a tuning value: it guarantees that no combination of
// speed, state multiplier, and exhaustion can move a unit further in one tick
// than the simulation's own step limit allows. Without it a misconfigured speed
// would let a unit cross the field between two snapshots and the tick would stop
// meaning anything.
func (b *Battle) clampStep(d *delta) {
	length := math.Sqrt(dist2(d.DX, d.DY))
	if length > b.c.MaxStepPerTick && length > 0 {
		scale := b.c.MaxStepPerTick / length
		d.DX *= scale
		d.DY *= scale
	}
}

// markContact fills b.contact with, for every unit, whether a living enemy of
// its own side is within a swing of it.
//
// It is one pass over the field per tick, computed once and read by both the
// intent decisions and the rank-blocking rule below. The alternative was measured
// and is worse: the blocking rule asks "is this friendly in contact" once per
// friendly found in the standoff box, so computing it on demand is a
// neighbourhood query inside a neighbourhood query, per candidate, per unit, per
// tick, on a question the whole tick already knows the answer to.
func (b *Battle) markContact() {
	c := b.c
	r2 := c.MeleeRange * c.MeleeRange
	for i, u := range b.units {
		s := &b.snap[i]
		b.contact[i] = false
		if !u.alive() || !s.Status.Actable() {
			continue
		}
		enemy := uint8(u.Side.Opposing())
		hf := &b.hot
		b.meleeHash.anyInCell(s.X, s.Y, c.MeleeRange, func(id int) bool {
			if hf.side[id] != enemy || !hf.alive[id] {
				return false
			}
			if dist2(hf.x[id]-s.X, hf.y[id]-s.Y) > r2 {
				return false
			}
			b.contact[i] = true
			return true
		})
	}
}

// blockedByContact reports whether a friendly in contact with the enemy stands
// between this unit and the enemy, within battle.standoff_distance.
//
// "Ahead" is measured along the direction the side closes in, not toward the
// enemy: a unit's own side advances along a fixed axis (side A toward positive x,
// side B toward negative x), and a man is in front of his comrades when he is
// further along that axis than they are and no more than the standoff distance
// away from them. Measuring toward the enemy instead would make the test depend
// on where the enemy army's centre happens to be, which moves as the battle
// moves, and a unit would be released and re-blocked as the centre swung past it.
//
// A routed friendly does not block. He is running away from the enemy, so he is
// not in front of anybody, and blocking on him would mean a man fleeing the
// battlefield holds up the line behind him. A broken friendly does block: he has
// stopped where he is and struck, and the ground he is on is occupied.
//
// The walk stops at the first blocking man found rather than visiting every cell
// in the standoff box, because the answer is a yes or a no and this is asked of
// every advancing unit on both sides every tick.
func (b *Battle) blockedByContact(i int, u *Unit, s *snapshot) bool {
	c := b.c
	if c.StandoffDistance <= 0 {
		return false
	}
	axis := b.towardAxis(u.Side)
	r2 := c.StandoffDistance * c.StandoffDistance
	blocked := false
	mySide := uint8(u.Side)
	b.meleeHash.anyInCell(s.X, s.Y, c.StandoffDistance, func(id int) bool {
		if blocked {
			return true
		}
		if id == i {
			return false
		}
		hf := &b.hot
		if hf.side[id] != mySide || !hf.alive[id] || hf.routed[id] {
			return false
		}
		if dist2(hf.x[id]-s.X, hf.y[id]-s.Y) > r2 {
			return false
		}
		if !b.contact[id] {
			return false
		}
		if axis > 0 {
			blocked = hf.x[id] > s.X
		} else {
			blocked = hf.x[id] < s.X
		}
		return blocked
	})
	return blocked
}

// enemyInMelee reports whether any living enemy is within a swing of a point.
// It uses the melee hash, whose cells are about one swing wide, so the query
// touches nine cells regardless of how many units are on the field.
func (b *Battle) enemyInMelee(x, y float64, side Side) bool {
	r2 := b.c.MeleeRange * b.c.MeleeRange
	enemy := uint8(side.Opposing())
	hf := &b.hot
	return b.meleeHash.anyInCell(x, y, b.c.MeleeRange, func(id int) bool {
		if hf.side[id] != enemy || !hf.alive[id] {
			return false
		}
		return dist2(hf.x[id]-x, hf.y[id]-y) <= r2
	})
}

// enemyWithin reports whether any living enemy is within a radius, using the
// coarse fire hash. It is the long-range question, so it is asked with the hash
// built for long-range questions.
//
// It is a yes-or-no question asked once per unit per tick, over a radius that can
// be two hundred and forty metres, which is why it goes through anyInCell rather
// than forEachCell. See hash.anyInCell for the measured cost of not doing that.
func (b *Battle) enemyWithin(x, y float64, side Side, radius float64) bool {
	r2 := radius * radius
	enemy := uint8(side.Opposing())
	hf := &b.hot
	return b.fireHash.anyInCell(x, y, radius, func(id int) bool {
		if hf.side[id] != enemy || !hf.alive[id] {
			return false
		}
		return dist2(hf.x[id]-x, hf.y[id]-y) <= r2
	})
}

// inFireArc reports whether a shooter has an enemy inside its minimum and
// maximum ranges. The minimum matters: a shooter who has the enemy point blank
// does not stand and trade shots, because the shot would be the slowest possible
// way to deal with the problem.
func (b *Battle) inFireArc(x, y float64, side Side) bool {
	return b.enemyWithin(x, y, side, b.c.RangedRange) &&
		!b.enemyWithin(x, y, side, b.c.RangedMinRange)
}

// enemyCentre returns the centre of mass of the living enemies within a radius.
// It is the one place both the intent stage and the morale stage ask where the
// enemy is, so that both ask the same question of the same snapshot.
//
// Heavier units pull harder, which is what makes a squad a squad: a line that
// has lost its heavy elements does not have the same centre of mass it did.
func (b *Battle) enemyCentre(h *hash, side Side, x, y, radius float64) (float64, float64, bool) {
	enemy := uint8(side.Opposing())
	sumX, sumY, weight := 0.0, 0.0, 0.0
	r2 := radius * radius
	hf := &b.hot
	h.forEachCell(x, y, radius, func(id int) {
		if hf.side[id] != enemy || !hf.alive[id] {
			return
		}
		if dist2(hf.x[id]-x, hf.y[id]-y) > r2 {
			return
		}
		w := hf.troops[id]
		sumX += hf.x[id] * w
		sumY += hf.y[id] * w
		weight += w
	})
	if weight <= 0 {
		return 0, 0, false
	}
	return sumX / weight, sumY / weight, true
}

// dist2 is the squared distance between two points. Squared distances are used
// throughout because every test here is a comparison against a squared range,
// and the square root is only taken when a direction is genuinely needed.
func dist2(dx, dy float64) float64 { return dx*dx + dy*dy }
