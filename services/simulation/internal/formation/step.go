package formation

import "math"

// Step advances a formation by dt seconds and returns the new unit positions
// and the new plan. It is a pure function: nothing it is given is modified, so
// a caller can keep the snapshot it passed in and compare against what came
// out.
//
// The order of work inside a tick is the order a tick actually happens in, and
// the order matters. The anchor moves first, so the shape moves with it and the
// men are walking toward slots that are already where they will be. Then each
// man walks to his slot at his own pace. Then they are pushed apart, because
// men who have been in a fight are not standing where they were told to. Then
// the order is read again against the new positions. The order is never read
// and re-issued in the same breath, so nobody is told to stand somewhere that
// has already moved past him.
func Step(units []Unit, p Plan, enemy Enemy, c Config, dt float64) ([]Unit, Plan, error) {
	if err := c.Validate(); err != nil {
		return nil, Plan{}, err
	}
	if !(dt > 0) || math.IsInf(dt, 0) || math.IsNaN(dt) {
		return nil, Plan{}, errorf("Step", "dt", "%g seconds is not a length of time to move for", dt)
	}
	if len(units) == 0 {
		return nil, Plan{}, errorf("Step", "units", "there are no units to move")
	}
	if len(units) != len(p.Assignment) {
		return nil, Plan{}, errorf("Step", "units",
			"the plan assigns %d slots but there are %d units, so the two disagree about who is in this formation",
			len(p.Assignment), len(units))
	}
	if enemy.Count <= 0 {
		return nil, Plan{}, errorf("Step", "enemy", "an enemy with no units has no centre to face")
	}
	speed, err := speedFor(p.Order, c)
	if err != nil {
		return nil, Plan{}, err
	}

	// Index by ID so the assignment can be walked in unit order while each man
	// is written back to his own place in the caller's list. It is a lookup
	// table only: nothing is ever iterated out of it, so it cannot make the
	// tick depend on map order.
	byID := make(map[int]int, len(units))
	for i, u := range units {
		if !(u.Agility > 0) || math.IsInf(u.Agility, 0) || math.IsNaN(u.Agility) {
			return nil, Plan{}, errorf("Step", "unit "+itoa(u.ID),
				"agility %g is not a positive mobility, so this unit cannot be moved", u.Agility)
		}
		if _, dup := byID[u.ID]; dup {
			return nil, Plan{}, errorf("Step", "unit "+itoa(u.ID),
				"this unit ID appears more than once, so its slot would be ambiguous")
		}
		byID[u.ID] = i
	}

	// Where the anchor walks this tick. Every order but a flank goes straight
	// at its objective. A flank takes one step of the arc at the configured
	// sweep rate, so the swing is a march around the enemy's side and not a
	// jump to the end of it.
	target := p.Objective
	if p.FlankSign != 0 {
		arc, _, err := flankPoint(p.Anchor, enemy, p, c, degrees(c.FlankSweepRateDeg)*dt)
		if err != nil {
			return nil, Plan{}, err
		}
		target = arc
	}
	anchor := stepToward(p.Anchor, target, speed*dt)

	// The frame faces the enemy from where the anchor now is, so a formation
	// swinging around a flank keeps its front on them the whole way round.
	heading := wrapAngle(Bearing(anchor, enemy.Centre))

	out := make([]Unit, len(units))
	for _, a := range p.Assignment {
		i, ok := byID[a.ID]
		if !ok {
			return nil, Plan{}, errorf("Step", "unit "+itoa(a.ID),
				"the plan holds a slot for this unit but the unit list does not contain it")
		}
		if a.Slot < 0 || a.Slot >= len(p.Slots) {
			return nil, Plan{}, errorf("Step", "plan",
				"slot %s is outside a formation of %d slots", itoa(a.Slot), len(p.Slots))
		}
		u := units[i]
		goal := p.Slots[a.Slot].world(anchor, heading)
		u.Pos = stepToward(u.Pos, goal, speed*u.Agility*dt)
		out[i] = faceEnemy(u, enemy.Centre, c, dt)
	}

	separate(out, c)
	next, err := BuildPlan(out, enemy, p.Order, p.Kind, c)
	if err != nil {
		return nil, Plan{}, err
	}
	// The swing is measured from the bearing the order was issued at, so that
	// reference carries forward. Everything else about the plan is re-read from
	// the situation as it now stands: where the enemy is, where our own men
	// are, and what order we are following.
	next.FlankFrom = p.FlankFrom
	return out, next, nil
}

// stepToward moves pos toward goal by at most pace metres, and lands exactly on
// goal if goal is within reach.
//
// Landing rather than overshooting matters twice over: a man who oscillates
// around his slot for the rest of the battle is a formation that appears to be
// breathing, and an anchor that accumulates a sliver of movement every tick
// drifts off the map over a long battle.
func stepToward(pos, goal Vec, pace float64) Vec {
	delta := goal.Sub(pos)
	d := delta.Len()
	if d == 0 || pace <= 0 {
		return pos
	}
	if pace >= d {
		return goal
	}
	return pos.Add(delta.Scale(pace / d))
}

// faceEnemy turns a unit toward the enemy. It blends the bearing to the enemy
// with the direction the unit was already facing, weighted by the config, and
// turns no faster than the unit can turn.
//
// The blend is done on unit vectors rather than on angles, because two men
// facing east and west do not average to facing north. A unit that did not
// move has no direction of travel to weight in, so its existing facing stands
// in for one.
func faceEnemy(u Unit, enemyCentre Vec, c Config, dt float64) Unit {
	toEnemy, err := UnitVec(enemyCentre.Sub(u.Pos))
	if err != nil {
		// Standing exactly on the enemy's centre: there is no bearing to it,
		// so the unit keeps the facing it had rather than being given one.
		return u
	}
	desired := toEnemy
	if w := c.FaceEnemyWeight; w < 1 {
		travel := Vec{math.Cos(u.Facing), math.Sin(u.Facing)}
		blend := Vec{
			X: toEnemy.X*w + travel.X*(1-w),
			Y: toEnemy.Y*w + travel.Y*(1-w),
		}
		if d, err := UnitVec(blend); err == nil {
			desired = d
		}
	}
	maxTurn := c.TurnRate * c.FaceTurnRateScale * u.Agility * dt
	u.Facing = turnToward(u.Facing, math.Atan2(desired.Y, desired.X), maxTurn)
	return u
}

// separate pushes men apart until no two are closer than the configured
// minimum. This is what keeps a formation a formation after a fight: a man who
// has been shoved, has charged past a neighbour, or has come round a corner of
// the enemy line ends up inside someone else, and without this pass the
// formation quietly collapses into a crowd.
//
// Each man gives way by half the overlap, times a fraction of a pass, and
// never by more than the per-tick cap: one heavy overlap must not fire men
// across the field. Units are visited in ascending ID order and the pass count
// is fixed by the config, so the result depends only on the positions it was
// given.
func separate(units []Unit, c Config) {
	passes := int(c.SeparationIterations)
	if passes <= 0 || c.MinSeparation <= 0 {
		return
	}
	idx := sortIDs(units)
	for pass := 0; pass < passes; pass++ {
		moved := false
		for a := 0; a < len(idx); a++ {
			for b := a + 1; b < len(idx); b++ {
				i, j := idx[a], idx[b]
				delta := units[j].Pos.Sub(units[i].Pos)
				d := delta.Len()
				if d >= c.MinSeparation {
					continue
				}
				// Two men on the same point have no axis between them. The axis
				// is chosen from their IDs, so it is the same on every machine
				// and every run rather than a matter of arithmetic luck.
				var axis Vec
				if d == 0 {
					if units[i].ID <= units[j].ID {
						axis = Vec{1, 0}
					} else {
						axis = Vec{-1, 0}
					}
				} else {
					axis = Vec{delta.X / d, delta.Y / d}
				}
				push := (c.MinSeparation - d) * c.SeparationPushFraction / 2
				if push > c.SeparationPushMax {
					push = c.SeparationPushMax
				}
				units[i].Pos = units[i].Pos.Sub(axis.Scale(push))
				units[j].Pos = units[j].Pos.Add(axis.Scale(push))
				moved = true
			}
		}
		if !moved {
			return
		}
	}
}
