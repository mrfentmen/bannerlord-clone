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
		} else if b.enemyInMelee(s.X, s.Y, u.Side) {
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
	sumX, sumY, weight := 0.0, 0.0, 0.0
	b.meleeHash.forEachCell(s.X, s.Y, c.StandoffDistance, func(id int) {
		if id == u.ID {
			return
		}
		o := b.byID[id]
		if o.Side != u.Side || !o.alive() {
			return
		}
		if d2 := dist2(o.X-s.X, o.Y-s.Y); d2 > r2 {
			return
		}
		w := o.Troops
		sumX += o.X * w
		sumY += o.Y * w
		weight += w
	})
	if weight <= 0 {
		// Nothing of its own side nearby: nothing to spread away from.
		return
	}
	dx, dy := s.X-sumX/weight, s.Y-sumY/weight
	dist := math.Sqrt(dist2(dx, dy))
	if dist <= 0 || !isFinite(dist) {
		// Exactly on the centre of mass: no direction to be pushed in.
		return
	}
	d := &b.deltas[i]
	d.DX += dx / dist * c.LateralDrift
	d.DY += dy / dist * c.LateralDrift
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

// enemyInMelee reports whether any living enemy is within a swing of a point.
// It uses the melee hash, whose cells are about one swing wide, so the query
// touches nine cells regardless of how many units are on the field.
func (b *Battle) enemyInMelee(x, y float64, side Side) bool {
	found := false
	r2 := b.c.MeleeRange * b.c.MeleeRange
	enemy := side.Opposing()
	b.meleeHash.forEachCell(x, y, b.c.MeleeRange, func(id int) {
		if found {
			return
		}
		cand := b.byID[id]
		if cand.Side != enemy || !cand.alive() {
			return
		}
		if dist2(cand.X-x, cand.Y-y) <= r2 {
			found = true
		}
	})
	return found
}

// enemyWithin reports whether any living enemy is within a radius, using the
// coarse fire hash. It is the long-range question, so it is asked with the hash
// built for long-range questions.
func (b *Battle) enemyWithin(x, y float64, side Side, radius float64) bool {
	found := false
	r2 := radius * radius
	enemy := side.Opposing()
	b.fireHash.forEachCell(x, y, radius, func(id int) {
		if found {
			return
		}
		cand := b.byID[id]
		if cand.Side != enemy || !cand.alive() {
			return
		}
		if dist2(cand.X-x, cand.Y-y) <= r2 {
			found = true
		}
	})
	return found
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
	enemy := side.Opposing()
	sumX, sumY, weight := 0.0, 0.0, 0.0
	r2 := radius * radius
	h.forEachCell(x, y, radius, func(id int) {
		cand := b.byID[id]
		if cand.Side != enemy || !cand.alive() {
			return
		}
		if dist2(cand.X-x, cand.Y-y) > r2 {
			return
		}
		w := cand.Troops
		sumX += cand.X * w
		sumY += cand.Y * w
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
