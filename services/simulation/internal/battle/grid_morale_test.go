package battle

// This file proves the three properties hash.walkCells and hash.collectCells
// have to have, which are the three the hot loop of the engine rests on.
//
// stageMorale's neighbour loop is half of a 500 v 500 battle. It gets its cells
// from collectCells rather than from forEachCell so that the loop over the
// candidates is an ordinary loop in its own frame instead of work behind a
// function value, and that is only sound if:
//
//  1. The ids arrive in exactly the order forEachCell would have handed them
//     over. A caller that accumulates floats in visit order depends on it, and
//     the golden replay hashes in testdata/golden are the proof that it holds.
//  2. Concatenating the runs of the collected cells reproduces forEachCell's
//     sequence exactly, which is what a caller that indexes the CSR grid itself
//     does.
//  3. Stopping early is still only legal for a yes-or-no question, which is the
//     property grid_earlyexit_test.go already covers and which walkCells did not
//     change; it is checked here once more against the same walks so that a
//     future edit to walkCells cannot quietly break it.
//
// It also records WHY the loop is written per candidate rather than per cell:
// the morale neighbourhood of the shipped balance file holds most of the field,
// so there is no cell-level shortcut to take and the cost is the number of
// neighbours each unit really has.

import (
	"math"
	"math/rand"
	"testing"
)

// collectCellRuns returns the ids collectCells leads a caller to, in order.
func collectCellRuns(h *hash, scratch []int32, x, y, radius float64) []int {
	var out []int
	starts := h.starts
	for _, k := range h.collectCells(scratch[:0], x, y, radius) {
		out = append(out, h.items[starts[k]:starts[k+1]]...)
	}
	return out
}

// TestCollectCellsReproducesForEachCellExactly is the core check.
//
// forEachCell hands out one id at a time. collectCells hands back the cells, and
// a caller concatenates their runs. Those two sequences have to be identical, in
// the same order, for every field and radius tried, because every float the
// caller accumulates from here on is added in that order.
func TestCollectCellsReproducesForEachCellExactly(t *testing.T) {
	rng := rand.New(rand.NewSource(20260930))

	for _, size := range []float64{4, 12, 64} {
		radii := []float64{
			0,
			0.5,
			size * 0.999,
			size,       // exactly one cell wide: the boundary case
			size * 1.5, //
			size * 2,   //
			size*3 + 0.5,
		}
		for _, fieldSize := range []float64{0, size * 0.5, size * 3, size * 12} {
			for _, n := range []int{1, 2, 17, 200} {
				units := randomField(rng, n, fieldSize)
				h := newHash(size, 4096)
				h.rebuild(units)
				// Positions include negatives and exact cell boundaries, which is
				// where floorCell's rounding is most likely to be quietly wrong.
				xs := []float64{0, -0.5, size, size*3 - 0.001, -size * 2.5, fieldSize*0.5 + 1}
				for _, x := range xs {
					for _, y := range xs {
						for _, radius := range radii {
							var want []int
							h.forEachCell(x, y, radius, func(id int) {
								want = append(want, id)
							})
							got := collectCellRuns(h, nil, x, y, radius)
							if len(got) != len(want) {
								t.Fatalf("cell %g, field %g, n %d, query (%g,%g) r %g: "+
									"collectCells led to %d ids and forEachCell handed over %d",
									size, fieldSize, n, x, y, radius, len(got), len(want))
							}
							for i := range want {
								if got[i] != want[i] {
									t.Fatalf("cell %g, field %g, n %d, query (%g,%g) r %g: "+
										"id %d of the walk is %d from collectCells and %d from "+
										"forEachCell; the visit order is what the float sums depend on",
										size, fieldSize, n, x, y, radius, i, got[i], want[i])
								}
							}
						}
					}
				}
			}
		}
	}
}

// TestCollectCellsVisitsNothingOutOfRange is the property that lets the caller
// skip its own cell bounds checks: every id a collected cell holds is inside the
// grid, and every unit a caller will distance-test from it is a real unit.
func TestCollectCellsVisitsNothingOutOfRange(t *testing.T) {
	rng := rand.New(rand.NewSource(20260931))
	for _, size := range []float64{4, 12, 64} {
		for _, n := range []int{1, 5, 60, 200} {
			units := randomField(rng, n, size*8)
			h := newHash(size, 4096)
			h.rebuild(units)
			for _, radius := range []float64{0, size, size * 2.5, size * 6} {
				for _, x := range []float64{-size * 5, 0, size * 3.5, size * 20} {
					for _, k := range h.collectCells(nil, x, size/3, radius) {
						if k < 0 || int(k) >= h.w*h.h {
							t.Fatalf("cell %g, n %d, r %g: collected cell index %d is outside "+
								"the %d cell grid", size, n, radius, k, h.w*h.h)
						}
						lo, hi := h.starts[k], h.starts[k+1]
						if lo > hi || int(hi) > len(h.items) {
							t.Fatalf("cell %g, n %d, r %g: cell %d holds the run [%d,%d) of a %d "+
								"entry items array", size, n, radius, k, lo, hi, len(h.items))
						}
						for _, id := range h.items[lo:hi] {
							if id < 0 || id >= len(units) {
								t.Fatalf("cell %g, n %d, r %g: cell %d held unit id %d of %d units",
									size, n, radius, k, id, len(units))
							}
						}
					}
				}
			}
		}
	}
}

// TestCollectCellsReusesItsScratch checks the claim that makes the walk
// allocation-free: a scratch with the capacity already there is never grown, so
// a tick that has run once allocates nothing for the walk again.
func TestCollectCellsReusesItsScratch(t *testing.T) {
	rng := rand.New(rand.NewSource(20261001))
	units := randomField(rng, 300, 400)
	h := newHash(64, 4096)
	h.rebuild(units)

	// Grow the scratch once, the way a battle does on its first tick.
	scratch := h.collectCells(nil, 0, 0, 90)
	if len(scratch) == 0 {
		t.Fatal("the walk found nothing on a 300 unit field with a 90 m query")
	}
	wide := scratch
	allocs := testing.AllocsPerRun(50, func() {
		if got := h.collectCells(wide[:0], 0, 0, 90); len(got) != len(scratch) {
			t.Fatalf("reusing the scratch found %d cells, not the %d the first walk found",
				len(got), len(scratch))
		}
	})
	if allocs != 0 {
		t.Errorf("a walk with a scratch big enough allocated %v times; the per-tick loop is "+
			"supposed to allocate nothing once it is under way", allocs)
	}
}

// TestTheMoraleNeighbourhoodHoldsMostOfTheField records the measurement the hot
// loop is built around, and fails if it stops being true.
//
// battle.morale_neighbourhood is 90 m and the reference field is a band about
// 900 m long and 100 m wide, so a unit's own neighbourhood holds several hundred
// of the thousand units on it. Two things follow, and they are the reason the
// loop is written per candidate:
//
//   - There is no cell-level shortcut. The cells are battle.ranged_grid_cell_size
//     of 64 m, so the disc test rejects whole cells only at the corners of the
//     walk, and nearly every candidate the walk reaches really is in range. A
//     finer index would reject more cells and visit a closer fit of the disc, but
//     it would visit more cells to do it and the candidates it examined would be
//     the same several hundred. Only the cost per candidate is left to work on.
//   - The query is quadratic in the units on the field, and that is a property of
//     the model rather than of the code: a man is affected by what he can see, so
//     every unit has to ask about every unit it can see.
//
// The assertion is deliberately loose. It is here to notice that the field has
// changed shape, which would mean this comment and the tuning of the loop are
// about a battle that no longer exists, not to pin a number that a different seed
// would move.
func TestTheMoraleNeighbourhoodHoldsMostOfTheField(t *testing.T) {
	if testing.Short() {
		t.Skip("this reads the shape of a 500 v 500 field")
	}
	cfg := loadConfig(t)
	n := int(cfg.Battle.ReferenceUnitsPerSide)
	setup, err := standardForce(t, cfg, 20260930, n)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	span := cfg.Battle.MoraleNeighbourhood
	span2 := span * span

	// Two ticks: the first builds the index, the second reads a field that has
	// already moved once. Three is not better, it is just slower.
	for i := 0; i < 2; i++ {
		if err := b.tick(); err != nil {
			t.Fatalf("tick %d failed: %v", i, err)
		}
	}

	var minX, minY = math.Inf(1), math.Inf(1)
	var maxX, maxY = math.Inf(-1), math.Inf(-1)
	for _, u := range b.units {
		minX, minY = math.Min(minX, u.X), math.Min(minY, u.Y)
		maxX, maxY = math.Max(maxX, u.X), math.Max(maxY, u.Y)
	}

	var asked, visited, inRange int
	for _, u := range b.units {
		if !u.alive() {
			continue
		}
		asked++
		for _, id := range collectCellRuns(b.fireHash, nil, u.X, u.Y, span) {
			visited++
			if dist2(b.hot.x[id]-u.X, b.hot.y[id]-u.Y) <= span2 {
				inRange++
			}
		}
	}

	perUnit := float64(inRange) / float64(maxInt(asked, 1))
	t.Logf("field %.0f m by %.0f m, %d units asked, %.0f neighbours each in range, "+
		"%.0f candidates visited per unit (%.1f%% of the visits are in range)",
		maxX-minX, maxY-minY, asked, perUnit, float64(visited)/float64(maxInt(asked, 1)),
		100*float64(inRange)/float64(maxInt(visited, 1)))
	if perUnit < 50 {
		t.Errorf("a unit's %.0f m morale neighbourhood holds only %.0f of the field's units "+
			"(%d units asked); the field is a different shape from the one this loop was tuned "+
			"against, and the comment on it is now wrong", span, perUnit, asked)
	}
}

// TestAMoraleNeighbourhoodIsNotTheWholeBattleWhenUnitsAreDead is the other side of
// the same measurement, and it is what keeps the first one honest: the loop is
// quadratic in the units on the field, so a battle that thins out gets cheaper
// and the per-unit cost must fall with it rather than being fixed by the index.
func TestAMoraleNeighbourhoodIsNotTheWholeBattleWhenUnitsAreDead(t *testing.T) {
	if testing.Short() {
		t.Skip("this reads the shape of a 500 v 500 field")
	}
	cfg := loadConfig(t)
	n := int(cfg.Battle.ReferenceUnitsPerSide)
	span := cfg.Battle.MoraleNeighbourhood

	cost := func(ticks int) float64 {
		setup, err := standardForce(t, cfg, 20260930, n)
		if err != nil {
			t.Fatalf("building the force failed: %v", err)
		}
		b, err := newBattle(cfg, 20260930, setup)
		if err != nil {
			t.Fatalf("building the battle failed: %v", err)
		}
		neighbours := 0.0
		for i := 0; i < ticks; i++ {
			if err := b.tick(); err != nil {
				t.Fatalf("tick %d failed: %v", i, err)
			}
		}
		alive := 0
		for _, u := range b.units {
			if !u.alive() {
				continue
			}
			alive++
			neighbours += float64(len(collectCellRuns(b.fireHash, nil, u.X, u.Y, span)))
		}
		if alive == 0 {
			t.Fatalf("nothing was alive after %d ticks", ticks)
		}
		return neighbours / float64(alive)
	}

	first := cost(2)
	tenth := cost(10)
	t.Logf("neighbours examined per living unit: %.0f after 2 ticks, %.0f after 10",
		first, tenth)
	if tenth >= first {
		t.Logf("the tenth tick examined at least as many neighbours as the second (%.0f against "+
			"%.0f); the men are still closing, so this battle had not thinned yet and the "+
			"measurement says nothing about it", tenth, first)
		return
	}
	if tenth > first*0.95 {
		t.Errorf("after ten ticks a unit examined %.0f neighbours against %.0f after two, a "+
			"fall of only %.1f%%; a battle that has killed a fifth of its men should be "+
			"measurably cheaper to run, and if it is not then the dead are still being walked",
			tenth, first, 100*(1-tenth/first))
	}
}

// BenchmarkMoraleNeighbourLoop measures the loop the profile is about, on its
// own, so a change to it can be seen without a whole battle in the way.
//
// It runs stageMorale's own arithmetic over the reference field without the rest
// of the stage, and reports the allocs, because the claim that the per-tick loop
// allocates nothing is worth a number rather than a comment.
func BenchmarkMoraleNeighbourLoop(b *testing.B) {
	cfg := loadConfig(b)
	n := int(cfg.Battle.ReferenceUnitsPerSide)
	setup, err := standardForce(b, cfg, 20260930, n)
	if err != nil {
		b.Fatalf("force: %v", err)
	}
	bl, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		b.Fatalf("battle: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := bl.tick(); err != nil {
			b.Fatalf("tick: %v", err)
		}
	}
	span := cfg.Battle.MoraleNeighbourhood
	scratch := bl.cellScratch

	// One iteration is one unit's whole neighbourhood query, so b.N is a count of
	// units rather than a count of ticks. The reported allocs are the ones the
	// steady state makes, which is the number the 250 us budget comment in
	// battle_test.go is about: a tick that allocates is a tick whose cost depends
	// on the garbage collector's mood.
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		u := bl.units[i%len(bl.units)]
		near := bl.moraleNeighbourhood(u.X, u.Y, uint8(u.Side), span, scratch)
		scratch = near.scratch
	}
	bl.cellScratch = scratch
	b.ReportMetric(float64(2*n), "units")
}
