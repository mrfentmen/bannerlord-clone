// Package formation is troop and formation AI: the shapes a body of troops can
// hold, the orders a commander can give it, and where every unit should stand
// given both. It is COMBAT.md section 7 and AI.md section 5 made mechanical,
// and SPEC.md section 5.2's "formation-level movement and engagement,
// individual units offset inside the formation".
//
// UNITS ARE METRES, SECONDS, AND RADIANS. Nothing here knows about a tick of
// the campaign clock or about leagues. A battle is a real-time, real-distance
// thing, and a man is 1.4 m/s and turns at a few radians a second.
//
// DECOUPLING (CONSTITUTION.md section 2.1). This package imports nothing from
// the rest of the simulation: not the state model, not the config loader, not
// the RNG, not the cause log. It is a set of pure functions over plain data —
// Vec, Unit, Enemy, Order, Formation, Config — that read a snapshot and return
// a new snapshot. Two systems that both want formation positions read this
// package's output from shared state; neither calls the other, and neither
// calls this. It also means it can be unit-tested against hand-written
// numbers and run in a scenario without a world.
//
// THE SHARED CONFIG FILE. Its constants live in the [formation] section of
// config/balance.toml, per CONSTITUTION.md section 1.2: no number hides in
// code. It reads that section itself rather than importing internal/config,
// because importing another internal package is exactly the coupling section
// 2.1 forbids. The consequence is stated plainly in config.go: internal/config
// rejects a key in balance.toml that no system claims, so the [formation]
// section also has to be declared in internal/config before the campaign
// runner will start. That is a declaration, not a dependency — the two
// loaders stay independent, and each fails loudly rather than defaulting.
//
// DETERMINISM. Same input, same output, byte for byte, on any machine. There
// is no global RNG, no map iteration, no wall clock, and no float shortcut
// whose result depends on evaluation order: slots are assigned by sorting unit
// IDs, the loose-order scatter comes from a hash of (seed, unit ID), and every
// pass walks units in ID order. Two sides that meet produce the same battle
// twice, which is the precondition for every balance run and every bug report.
//
// NO SILENT STUBS. Anything not implemented returns an error naming what was
// wrong. An unimplemented order or a missing balance key fails loudly at the
// call that hit it instead of quietly producing a formation that does nothing.
package formation

import "math"

// eps is the tolerance used when comparing two lengths that were computed
// rather than measured, so that a formation standing exactly on its standoff is
// not told it has not arrived because of the last bit of a float64.
//
// It is a floating-point guard, not a balance number: nothing a designer would
// tune reads it, and every balance constant lives in balance.toml per
// CONSTITUTION.md section 1.2. It is a nanometre, four orders of magnitude
// below any spacing a man can stand in.
const eps = 1e-9

// Vec is a position or offset in the battle plane, in metres. The battle plane
// is flat ground: X and Y, with no Z, because a formation's shape is a
// ground plan and vertical terrain belongs to the terrain system, which reads
// these positions rather than being consulted by them.
type Vec struct {
	X float64
	Y float64
}

// Add returns v+o.
func (v Vec) Add(o Vec) Vec { return Vec{v.X + o.X, v.Y + o.Y} }

// Sub returns v-o.
func (v Vec) Sub(o Vec) Vec { return Vec{v.X - o.X, v.Y - o.Y} }

// Scale returns v scaled by k.
func (v Vec) Scale(k float64) Vec { return Vec{v.X * k, v.Y * k} }

// Dot returns the scalar product of v and o. It is the projection of one
// direction onto another: how far along a formation's heading a man stands.
func (v Vec) Dot(o Vec) float64 { return v.X*o.X + v.Y*o.Y }

// Len returns the length of v.
func (v Vec) Len() float64 { return math.Hypot(v.X, v.Y) }

// Dist returns the distance from v to o.
func (v Vec) Dist(o Vec) float64 { return math.Hypot(v.X-o.X, v.Y-o.Y) }

// UnitVec returns v at unit length, and an error if v has no direction to
// speak of. Dividing a zero vector would produce NaN positions that then
// spread silently through a whole formation, so it is refused here instead.
func UnitVec(v Vec) (Vec, error) {
	l := v.Len()
	if l <= 0 || math.IsNaN(l) || math.IsInf(l, 0) {
		return Vec{}, errorf("UnitVec", "vector", "a zero-length vector has no direction (length %g)", l)
	}
	return Vec{v.X / l, v.Y / l}, nil
}

// FromBearing returns the point at distance r from the origin on bearing b.
// Bearing is measured counter-clockwise from +X, which is the convention the
// whole package uses, so a facing of math.Pi/2 looks north (+Y).
func FromBearing(b float64, r float64) Vec {
	return Vec{math.Cos(b) * r, math.Sin(b) * r}
}

// Bearing returns the angle from `from` to `to`. It returns 0 when the two
// points coincide, because there is no bearing between a point and itself and
// a caller that gets that wrong should get a stable number to debug rather
// than a NaN.
func Bearing(from, to Vec) float64 {
	return math.Atan2(to.Y-from.Y, to.X-from.X)
}

// Distance returns the metres between two points.
func Distance(from, to Vec) float64 { return from.Dist(to) }

// rotateVec turns v counter-clockwise by a radians. Counter-clockwise is the
// positive direction because that is how facings and bearings are measured
// here; a left turn is therefore a negative rotation everywhere.
func rotateVec(v Vec, a float64) Vec {
	c, s := math.Cos(a), math.Sin(a)
	return Vec{v.X*c - v.Y*s, v.X*s + v.Y*c}
}

// clamp constrains v to [lo, hi].
func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// wrapAngle folds a radians into (-pi, pi], so an accumulated heading can be
// compared and printed without drifting to values like 6.3 radians.
func wrapAngle(a float64) float64 {
	if math.IsNaN(a) || math.IsInf(a, 0) {
		return a
	}
	a = math.Mod(a+math.Pi, 2*math.Pi)
	if a <= 0 {
		a += 2 * math.Pi
	}
	return a - math.Pi
}

// turnToward moves from `from` to `to` by at most `maxStep` radians, taking the
// short way round. Turning the long way round is how a formation ends up
// marching away from the battle for a second and a half before noticing.
func turnToward(from, to, maxStep float64) float64 {
	diff := wrapAngle(to - from)
	if diff > maxStep {
		diff = maxStep
	}
	if diff < -maxStep {
		diff = -maxStep
	}
	return wrapAngle(from + diff)
}

// centroid returns the mean position of units. It errors on an empty list
// because there is no such thing as the centre of nobody.
func centroid(units []Unit) (Vec, error) {
	if len(units) == 0 {
		return Vec{}, errorf("centroid", "units", "an empty formation has no centre")
	}
	var sx, sy float64
	for _, u := range units {
		sx += u.Pos.X
		sy += u.Pos.Y
	}
	n := float64(len(units))
	return Vec{sx / n, sy / n}, nil
}

// circularMeanFacing returns the mean facing of units as an angle. Facings are
// angles, so an arithmetic mean is wrong: a formation looking west (pi) and
// east (0) averages to pi/2 under plain addition, which would spin it north.
// Summing the unit vectors first is the mean that survives the wrap.
func circularMeanFacing(units []Unit) (float64, error) {
	if len(units) == 0 {
		return 0, errorf("circularMeanFacing", "units", "an empty formation has no facing")
	}
	var sx, sy float64
	for _, u := range units {
		sx += math.Cos(u.Facing)
		sy += math.Sin(u.Facing)
	}
	if sx == 0 && sy == 0 {
		// Every facing is exactly opposed to another, so there is no majority
		// direction. Facing north is a stated convention, not a silent pick:
		// the caller's error path for a nonsensical input is upstream of here.
		return 0, errorf("circularMeanFacing", "units",
			"facings cancel out exactly (%d units), so the formation has no majority facing", len(units))
	}
	return math.Atan2(sy, sx), nil
}
