package formation

import "math"

// Plan is one formation's intent, resolved against the enemy as it stands
// right now: which shape it is in, which order it is following, where its
// anchor is, where that order is sending it, and which slot each man is to
// stand on.
//
// It is plain data and it is recomputed from scratch every tick. That is not
// just simpler than storing a plan and patching it — it is the honest model of
// what a commander does, because the plan is a reading of the current
// situation, not a promise about a future one. A flanking order re-reads where
// the enemy is on every tick, so if the enemy turns, the flank swings with it
// instead of walking into a line that has already moved.
type Plan struct {
	// Order is the command being followed.
	Order Order
	// Kind is the shape being held.
	Kind Formation
	// Anchor is the formation's centre of mass.
	Anchor Vec
	// Heading is the direction the formation's frame faces: the bearing from
	// its anchor to the enemy. Slots are placed in this frame, so the shape
	// always squares up to the enemy however the formation is moving.
	Heading float64
	// Objective is where the order is sending the anchor. For a flank this is
	// the end of the swing, not the next step of it: the arc is walked during
	// Step, because how far along it is depends on how much time has passed.
	Objective Vec
	// Slots are the shape in local coordinates, in assignment order.
	Slots []Slot
	// Assignment pairs each unit ID with its slot number, ordered by unit ID.
	// Assignment[i].Slot is the index into Slots.
	Assignment []Assignment
	// RearExtent is how far the shape reaches behind the anchor, in metres. A
	// flank has to stand off by this much, plus the enemy's depth, before it
	// can turn in behind them.
	RearExtent float64
	// FlankSign is -1 for a left flank order and +1 for a right one, and 0 for
	// every other order. It is a sign rather than a bool because the swing is
	// a signed angle and both directions must come out of the same code path.
	FlankSign float64
	// FlankFrom is the bearing from the enemy to the anchor at the moment the
	// flank order was issued, and the swing is measured from there.
	//
	// It is held rather than recomputed each tick, and that is the whole
	// subtlety of a flanking order. A commander says "go round their left by
	// seventy-five degrees" from where the formation stands when they say it.
	// Measuring the sweep from the formation's current bearing instead would
	// make every tick's target swing further round than the last, and the
	// formation would circle their enemy instead of stopping on the flank.
	FlankFrom float64
	// Arrived reports whether the anchor is already where the order is sending
	// it. An advance that has closed to its standoff is holding; a flank that
	// has swung its full arc has turned in.
	Arrived bool
}

// Assignment is one man and the slot number he is to stand on.
type Assignment struct {
	// ID is the unit's ID.
	ID int
	// Slot is an index into Plan.Slots.
	Slot int
}

// BuildPlan resolves a formation's shape and order into a Plan. It reads a
// snapshot and returns a new value; it changes nothing it is given.
//
// The unit order it uses is ascending ID, not the order the units arrived in,
// so a formation does not reshape itself because the caller's list was rebuilt
// or sorted differently. Two men with the same ID is an error rather than a
// coin toss, because a duplicate ID means every slot assignment downstream is
// ambiguous.
func BuildPlan(units []Unit, enemy Enemy, order Order, kind Formation, c Config) (Plan, error) {
	if !order.Valid() {
		return Plan{}, errorf("BuildPlan", "order", "%v is not implemented", order)
	}
	if !kind.Valid() {
		return Plan{}, errorf("BuildPlan", "formation", "%v is not implemented", kind)
	}
	if err := c.Validate(); err != nil {
		return Plan{}, err
	}
	if len(units) == 0 {
		return Plan{}, errorf("BuildPlan", "units", "there are no units to form up")
	}
	if enemy.Count <= 0 {
		return Plan{}, errorf("BuildPlan", "enemy", "an enemy with no units has no centre to aim at")
	}
	idx := sortIDs(units)
	for i := 1; i < len(idx); i++ {
		if units[idx[i-1]].ID == units[idx[i]].ID {
			return Plan{}, errorf("BuildPlan", "units",
				"unit ID %s appears more than once, so its slot would be ambiguous", itoa(units[idx[i]].ID))
		}
	}
	slots, err := Layout(kind, idsOf(units, idx), c)
	if err != nil {
		return Plan{}, err
	}
	assignment := make([]Assignment, len(idx))
	for i, j := range idx {
		assignment[i] = Assignment{ID: units[j].ID, Slot: i}
	}
	anchor, err := centroid(units)
	if err != nil {
		return Plan{}, err
	}
	_, _, minForward, _, err := Bounds(slots)
	if err != nil {
		return Plan{}, err
	}
	// The anchor is the centre of mass and the shape is centred on it, so the
	// extent behind the anchor is measured from the mean of the slots — which
	// is where the anchor is — down to the rearmost rank.
	meanForward := meanForward(slots)
	p := Plan{
		Order:      order,
		Kind:       kind,
		Anchor:     anchor,
		Heading:    wrapAngle(Bearing(anchor, enemy.Centre)),
		Slots:      slots,
		Assignment: assignment,
		RearExtent: meanForward - minForward,
		FlankSign:  order.flankSign(),
		FlankFrom:  wrapAngle(Bearing(enemy.Centre, anchor)),
	}
	obj, arrived, err := objectiveFor(p, enemy, c)
	if err != nil {
		return Plan{}, err
	}
	p.Objective = obj
	p.Arrived = arrived
	return p, nil
}

// meanForward returns the mean forward offset of a set of slots, which is
// where the anchor sits inside the shape.
func meanForward(slots []Slot) float64 {
	var sum float64
	for _, s := range slots {
		sum += s.Forward
	}
	return sum / float64(len(slots))
}

// Slot returns the slot number assigned to a unit ID.
func (p Plan) Slot(id int) (int, error) {
	for _, a := range p.Assignment {
		if a.ID == id {
			return a.Slot, nil
		}
	}
	return 0, errorf("Plan.Slot", "unit", "unit %s is not in this formation", itoa(id))
}

// Target returns the world position a slot is to stand on, and the facing the
// man in that slot should square up to: the enemy, per COMBAT.md section 7 and
// AI.md section 5. It is the read side for an overlay that draws where a
// formation is going, which is the same number the tick uses, so what a player
// is shown is what the men are actually told to do.
func (p Plan) Target(slot int) (Vec, float64, error) {
	if slot < 0 || slot >= len(p.Slots) {
		return Vec{}, 0, errorf("Plan.Target", "slot", "slot %s is outside a formation of %d slots",
			itoa(slot), len(p.Slots))
	}
	return p.Slots[slot].world(p.Anchor, p.Heading), p.Heading, nil
}

// objectiveFor resolves an order into the point the anchor is being sent to,
// and whether it is already there.
func objectiveFor(p Plan, enemy Enemy, c Config) (Vec, bool, error) {
	switch p.Order {
	case OrderHold:
		// Hold means the anchor stays where the men already are. The men still
		// walk back to their slots, so the shape reforms on the spot.
		return p.Anchor, true, nil

	case OrderAdvance, OrderCharge:
		standoff := c.AdvanceStandoff
		if p.Order == OrderCharge {
			standoff = c.ChargeStandoff
		}
		gap := Distance(p.Anchor, enemy.Centre)
		if gap <= standoff+eps {
			// Already in contact: the order is to close to this range and no
			// further, so the anchor stops where it is and the formation fires.
			//
			// The tolerance is what makes "arrived" a fact rather than a coin
			// toss. The anchor walks to a point exactly standoff away, so the
			// distance it measures back can land a fraction of a nanometre over
			// the standoff, and a formation parked exactly where it was told to
			// park would then report that it had not arrived, on every tick,
			// forever.
			return p.Anchor, true, nil
		}
		// Stand off from the enemy along the line already running from the
		// anchor to the enemy. gap > standoff here, so the direction is never
		// a zero vector.
		dir, err := UnitVec(enemy.Centre.Sub(p.Anchor))
		if err != nil {
			return Vec{}, false, err
		}
		return enemy.Centre.Sub(dir.Scale(standoff)), false, nil

	case OrderRetreat:
		away, err := withdrawDir(p, enemy)
		if err != nil {
			return Vec{}, false, err
		}
		return p.Anchor.Add(away.Scale(c.RetreatDistance)), false, nil

	case OrderFlankLeft, OrderFlankRight:
		return flankPoint(p.Anchor, enemy, p, c, math.Inf(1))

	default:
		return Vec{}, false, errorf("objectiveFor", "order", "%v is not implemented, so it has no objective", p.Order)
	}
}

// withdrawDir returns the unit vector a falling-back formation moves along.
//
// The normal case is directly away from the enemy. When the two centres
// coincide there is no such vector, and rather than fail a tick over a
// degenerate coordinate the formation withdraws along its own heading, which
// is the only direction it has: it is already facing the enemy, so backing up
// is the same movement. This is a stated rule, not a quiet substitute for a
// missing one.
func withdrawDir(p Plan, enemy Enemy) (Vec, error) {
	away := p.Anchor.Sub(enemy.Centre)
	if away.Len() == 0 {
		return Vec{math.Cos(p.Heading), math.Sin(p.Heading)}, nil
	}
	return UnitVec(away)
}

// flankPoint returns the point on the circle around the enemy that the
// formation is aiming at, given the bearing it has already swung to.
//
// A flank is a walk around the enemy's side, not a diagonal cut across their
// front, so the target is always a point on a circle of the flank radius
// centred on the enemy, and the end of the swing is measured from the bearing
// the order was issued at. sweepRad is how much further round the formation
// goes this tick: pass an infinite sweep for the end of the swing, and Step
// passes one tick's worth.
func flankPoint(anchor Vec, enemy Enemy, p Plan, c Config, sweepRad float64) (Vec, bool, error) {
	radius := enemy.HalfDepth + p.RearExtent + c.FlankStandoff
	if radius <= 0 {
		return Vec{}, false, errorf("flankPoint", "flank radius",
			"the radius to swing around the enemy is %.4f m, so there is nowhere to stand",
			radius)
	}
	bearing := Bearing(enemy.Centre, anchor)
	target := p.FlankFrom + p.FlankSign*degrees(c.FlankSweepDeg)
	// Take at most sweepRad more of the arc, and never past the end of it. When
	// less than one step remains the point is exactly the end of the swing, so
	// "arrived" needs no tolerance constant to say so.
	step := p.FlankSign * sweepRad
	remaining := p.FlankSign * wrapAngle(target-bearing)
	if math.Abs(step) > math.Abs(remaining) {
		step = remaining
	}
	arrived := step == 0
	return enemy.Centre.Add(FromBearing(bearing+step, radius)), arrived, nil
}

// degrees converts degrees to radians. Every angle the balance file carries is
// in degrees because that is the unit a designer thinks in, and every angle the
// code uses is in radians; converting once, here, keeps the conversion out of
// the arithmetic.
func degrees(d float64) float64 { return d * math.Pi / 180 }
