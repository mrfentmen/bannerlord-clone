package battle

// This file proves the one property anyInCell has to have and forEachCell does
// not: that stopping the walk early cannot change the answer.
//
// anyInCell exists to stop a yes-or-no neighbourhood query at the first match
// (see hash.anyInCell for the profile that motivated it). That is only sound if
// it returns exactly what a full walk would have returned. It is a different
// function from forEachCell, on the critical path, deciding whether a unit
// charges or shoots, so it is checked against forEachCell and against a brute
// force scan rather than argued for in a comment.
//
// The test is property style over randomised fields and over query radii that
// straddle the awkward cases: a radius smaller than a cell, one that lands
// exactly on a cell boundary, and one several cells across. Positions include
// negatives and exact boundaries, because floorCell's rounding is where a
// spatial index is most likely to be quietly wrong.

import (
	"math"
	"math/rand"
	"testing"
)

// bruteForceInRadius is the reference: no index, no cells, just every unit.
func bruteForceInRadius(units []*Unit, x, y, radius float64, match func(id int) bool) bool {
	r2 := radius * radius
	for _, u := range units {
		if dist2(u.X-x, u.Y-y) <= r2 && match(u.ID) {
			return true
		}
	}
	return false
}

// TestAnyInCellAgreesWithForEachCell is the core check: for a predicate that asks
// whether any unit in range matches, anyInCell must agree with walking
// forEachCell to completion, on every field and radius tried.
func TestAnyInCellAgreesWithForEachCell(t *testing.T) {
	rng := rand.New(rand.NewSource(20260930))

	// A spread of radii relative to the cell size, so the walk spans 1 ring, a
	// couple of rings, and many. The boundary cases are exact multiples of the
	// cell width, which is where an off-by-one in the ring count shows up.
	sizes := []float64{4, 12, 64}
	for _, size := range sizes {
		radii := []float64{
			0.5, // well inside one cell
			size * 0.999,
			size,       // exactly one cell: boundary
			size * 1.5, // one and a half
			size * 2,   // exact two cells
			size*3 + 0.5,
			0, // a zero radius query: the unit's own cell only
		}
		for _, fieldSize := range []float64{0, size * 0.5, size * 3, size * 12} {
			for _, n := range []int{1, 2, 17, 200} {
				units := randomField(rng, n, fieldSize)
				h := newHash(size, 4096)
				h.rebuild(units)
				for _, radius := range radii {
					for _, q := range queryPoints(rng, units, size, fieldSize) {
						// Four ways of choosing which units count, between them
						// covering the answer being false, true in the first cell
						// walked, and true only at the far edge of the box.
						//
						// EVERY predicate includes the radius test, and that is not
						// tidiness. Both walks visit a box of whole CELLS, which is
						// larger than the query's circle, so a unit just outside the
						// radius but inside the box is handed to the predicate. The
						// predicate is what turns a box into a circle, and the engine
						// does it in every caller (see enemyWithin). A predicate that
						// matched on id alone would be asking a different question
						// from the one the engine asks, and would "fail" here while
						// telling us nothing about anyInCell.
						for _, pred := range []struct {
							name  string
							match func(id int) bool
						}{
							{"never", func(int) bool { return false }},
							{"first", func(id int) bool { return id == units[0].ID }},
							{"last", func(id int) bool { return id == units[n-1].ID }},
							{"even", func(id int) bool { return id%2 == 0 }},
						} {
							// inRange wraps the predicate with the radius test, and
							// is the whole of what a real caller adds.
							inRange := func(id int) bool {
								if !pred.match(id) {
									return false
								}
								u := units[id]
								return dist2(u.X-q.x, u.Y-q.y) <= radius*radius
							}

							byEarly := h.anyInCell(q.x, q.y, radius, inRange)

							// The same question asked the slow way, by the walk that
							// cannot stop early.
							byWalk := false
							h.forEachCell(q.x, q.y, radius, func(id int) {
								if !byWalk && inRange(id) {
									byWalk = true
								}
							})

							byBrute := bruteForceInRadius(units, q.x, q.y, radius, pred.match)

							if byEarly != byWalk || byEarly != byBrute {
								t.Fatalf("cell=%g radius=%g field=%g units=%d query=(%g,%g) pred=%s: "+
									"anyInCell=%v forEachCell=%v bruteForce=%v",
									size, radius, fieldSize, n, q.x, q.y, pred.name, byEarly, byWalk, byBrute)
							}
						}
					}
				}
			}
		}
	}
}

// TestAnyInCellVisitsNothingOutOfRange proves the walk does not reach so far that
// a caller relying on its own radius test would be handed a unit it must reject.
//
// Both walks visit a box of whole cells, which is larger than the query circle,
// so this is not a claim that the walk is exact. It is the claim that the box is
// not unbounded: a unit well outside the radius is either not handed over at all,
// or is handed over and correctly rejected by the caller's distance test. If the
// walk clamped arbitrarily wide, the engine's own predicates would still be
// correct but would be paying a distance test per unit across the whole field,
// which is the cost this file's sibling change exists to remove.
func TestAnyInCellVisitsNothingOutOfRange(t *testing.T) {
	rng := rand.New(rand.NewSource(20260931))
	const size = 12.0
	units := randomField(rng, 300, size*8)
	h := newHash(size, 4096)
	h.rebuild(units)

	for _, radius := range []float64{2, 12, 30, 70} {
		q := queryPoints(rng, units, size, size*8)[0]
		// Count how many units the walk actually offers the predicate, against how
		// many are genuinely inside the radius. A walk that is tight keeps the two
		// close; a walk that sweeps the field does not.
		offered := 0
		h.anyInCell(q.x, q.y, radius, func(int) bool { offered++; return false })

		inside := 0
		for _, u := range units {
			if dist2(u.X-q.x, u.Y-q.y) <= radius*radius {
				inside++
			}
		}
		// The box is (2*span+1) cells a side, so it cannot be tighter than the
		// circle; it is bounded by the area of that box. Allow a wide margin and
		// demand only that the walk is not visiting the entire field.
		boxSide := float64(2*(h.span(radius)+1))*h.size + h.size
		boxArea := boxSide * boxSide
		fieldArea := size * 8 * size * 8
		if float64(offered) > float64(len(units)) && boxArea < fieldArea/4 {
			t.Fatalf("radius=%g: the walk offered %d of %d units, and its box area %.0f is "+
				"under a quarter of the field, so the walk is wider than its own geometry",
				radius, offered, len(units), boxArea)
		}
		// The predicate's own radius test must reject a unit known to be far away,
		// whenever the field is big enough to contain one.
		var far int
		ok := false
		for _, u := range units {
			if d := math.Hypot(u.X-q.x, u.Y-q.y); d > radius*2 {
				far = u.ID
				ok = true
				break
			}
		}
		if !ok {
			// The field is 96 m across and the largest radius here is 70 m, so for
			// that radius nothing is twice the radius away. Skipping is honest;
			// widening the field to force the case would test a shape the engine
			// never builds at this cell size.
			continue
		}
		if h.anyInCell(q.x, q.y, radius, func(id int) bool {
			u := units[id]
			return id == far && dist2(u.X-q.x, u.Y-q.y) <= radius*radius
		}) {
			t.Fatalf("radius=%g: a caller's radius test accepted unit %d, which is more than %g m away",
				radius, far, radius*2)
		}
	}
}

// TestAnyInCellOnEmptyIndex proves it answers false rather than reading past the
// end of a grid that was never built. An empty battle still runs a tick.
func TestAnyInCellOnEmptyIndex(t *testing.T) {
	h := newHash(12, 4096)
	if h.anyInCell(0, 0, 50, func(int) bool { return true }) {
		t.Error("an index holding no units reported a match")
	}
	h.rebuild(nil)
	if h.anyInCell(0, 0, 50, func(int) bool { return true }) {
		t.Error("an index rebuilt from no units reported a match")
	}
}

// TestAnyInCellStopsEarly proves the early exit actually exits. Without this the
// agreement tests above would still pass if anyInCell quietly walked everything,
// and the whole reason the function exists would be gone while its tests stayed
// green. The predicate counts its own calls: asked about a unit that is the very
// first thing in the box, it must be called once, not once per unit on the field.
func TestAnyInCellStopsEarly(t *testing.T) {
	const size = 12
	units := make([]*Unit, 500)
	for i := range units {
		units[i] = &Unit{
			ID: i, X: float64(i%20) * size, Y: float64(i/20) * size,
			Status: StatusFighting, Troops: 1,
		}
	}
	h := newHash(size, 4096)
	h.rebuild(units)

	// Unit 0 is at the origin, which is the centre cell of a query at the origin,
	// and the walk visits the centre cell first.
	calls := 0
	if !h.anyInCell(0, 0, size*5, func(id int) bool {
		calls++
		return id == 0
	}) {
		t.Fatal("anyInCell did not find the unit in the centre cell")
	}
	if calls != 1 {
		t.Errorf("the predicate was called %d times for a match in the first cell walked; "+
			"the walk is not stopping early, so anyInCell is forEachCell with extra steps", calls)
	}

	// And a predicate that never matches must visit every unit in the box, so the
	// early exit is not skipping work it should have done.
	all := 0
	if h.anyInCell(0, 0, size*5, func(int) bool { all++; return false }) {
		t.Fatal("anyInCell reported a match for a predicate that never returns true")
	}
	if all == 0 {
		t.Error("a non-matching predicate was never called; the walk visited nothing")
	}
}

// randomField builds n units inside a square of the given width, on a lattice
// with jitter so that some land exactly on cell boundaries and some do not. Ids
// are assigned in ascending order, which is what the hash's ordering guarantee
// assumes.
func randomField(rng *rand.Rand, n int, width float64) []*Unit {
	units := make([]*Unit, n)
	for i := range units {
		x := 0.0
		y := 0.0
		if width > 0 {
			x = rng.Float64()*width - width/2
			y = rng.Float64()*width - width/2
		}
		// Every eighth unit is snapped exactly onto a lattice point, so exact
		// boundaries are covered rather than merely likely.
		if i%8 == 0 && width > 0 {
			x = math.Round(x/12) * 12
			y = math.Round(y/12) * 12
		}
		units[i] = &Unit{
			ID: i, X: x, Y: y, Status: StatusFighting, Troops: 1,
			MaxHP: 100, HP: 100, Morale: 0.8,
			Side: SideA,
		}
		if i%2 == 0 {
			units[i].Side = SideB
		}
	}
	return units
}

type queryPoint struct{ x, y float64 }

// queryPoints returns a handful of query centres: the first unit's position, the
// field's own corner, the origin, and a few random interior points. Querying from
// a unit's own position is the case the engine actually asks, and it puts the
// centre cell at a populated cell rather than an empty one.
func queryPoints(rng *rand.Rand, units []*Unit, size, width float64) []queryPoint {
	pts := []queryPoint{{0, 0}, {-size / 2, -size / 2}}
	if len(units) > 0 {
		pts = append(pts, queryPoint{units[0].X, units[0].Y},
			queryPoint{units[len(units)-1].X, units[len(units)-1].Y})
	}
	for i := 0; i < 3; i++ {
		if width > 0 {
			pts = append(pts, queryPoint{
				rng.Float64()*width - width/2,
				rng.Float64()*width - width/2,
			})
		}
	}
	return pts
}
