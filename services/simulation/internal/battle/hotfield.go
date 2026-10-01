package battle

// The hot field: a flat, per-tick mirror of the handful of numbers the
// neighbourhood queries read.
//
// # WHAT THIS IS FOR, MEASURED
//
// The dense CSR grid in grid.go removed the map hashing, and a CPU profile of the
// 500 v 500 battle afterwards put the run at 91 microseconds per unit per tick
// against a 33 microsecond target. The map was no longer the cost. What was left
// was this:
//
//	flat   cum%   function
//	2.06s  30.1%  (*Battle).stageMorale.func1
//	0.75s  11.0%  (*hash).forEachCell.func1
//	0.51s   7.5%  (*Battle).enemyWithin.func1
//	1.43s  20.9%  runtime.asyncPreempt
//
// So 50% of the run was stageMorale, and 30% of the whole run was the CLOSURE
// BODY rather than the walk that feeds it. The walk had become cheap; what it
// calls had not.
//
// # WHY THE CLOSURE BODY WAS EXPENSIVE
//
// Every candidate in every query went through b.byID[id], which is a pointer
// load, and then read four or five fields out of the Unit it points at. A Unit is
// a wide struct — identity, two skills, speeds, ammunition, a weapon spec, an
// experience record — and the four fields the query wants are about eighty bytes
// into it. So each candidate cost one dependent load through a pointer plus a
// cache line that was almost entirely wasted, and the walk visits about five
// hundred candidates per unit per tick on the shipped balance file:
//
//	morale query on a  64.0 m index:  2 rings,   25 cells, box 320 m vs disc 180 m
//	                                     candidates 500000 (500 per unit)
//
// Half a million cache lines touched per tick, five hundred times per unit, to
// read four numbers that sit side by side in this file's arrays.
//
// # WHY THE ARRAYS ARE SEPARATE AND FLAT
//
// SoA rather than AoS: one array per field, each indexed by unit id, so the four
// values a query needs are four sequential streams rather than eighty bytes
// scattered through a thousand wide structs. Position is two float64 slices of
// eight kilobytes each for a thousand units, which stays in cache across the whole
// query loop instead of being re-fetched per candidate.
//
// # WHY IT IS REBUILT PER TICK AND NOT CACHED LONGER
//
// It is a mirror, not a source. Every entry is copied from committed state at the
// top of the tick, beside the two hash rebuilds, so it cannot drift from the units
// it describes and cannot introduce a second place where a battle's position
// lives. It costs one pass over the units, about a thousand iterations, against
// half a million candidate visits: it pays for itself if it saves a single cache
// miss in twenty.
//
// # WHY DETERMINISM IS EXACTLY PRESERVED
//
// The mirror holds the same values the pointer chase read, in the same order, and
// every query still walks the same cells in the same ring order and accumulates in
// the same sequence. No arithmetic is reassociated, no comparison is relaxed to
// save a branch, and no query visits a different set of candidates. The float
// additions happen in the same order as before, so the results are bit-identical
// and the golden replay hashes in testdata/golden still match.
//
// In particular the mirror keeps two SEPARATE status sources, because the code it
// replaces genuinely used two: markContact, enemyWithin, enemyCentre, chooseFire-
// Target, blockedByContact and stageSeparate all test the committed Unit's status
// through alive(), while stageMorale's neighbour loop reads the snapshot's status
// for its routed test. Collapsing those into one would be tidier and would change
// results on any tick where a stage has written a status the snapshot has not
// picked up yet, so both are mirrored and neither is invented.

// hotField is the flat per-tick mirror. Every slice is indexed by unit id and is
// exactly as long as the battle's unit array.
type hotField struct {
	// x and y are the committed positions, copied from the Unit.
	x, y []float64
	// side is the committed side, narrowed to a byte because there are two.
	side []uint8
	// troops is the committed body count.
	troops []float64
	// troopsHP is Troops * hpFrac, the weight a living neighbour contributes to a
	// morale share. It is precomputed because hpFrac is a division and the
	// morale loop asked for it half a million times a tick.
	troopsHP []float64
	// alive is the committed status tested through Unit.alive.
	alive []bool
	// routed is the COMMITTED status tested against StatusRouted, which is what
	// blockedByContact and stageSeparate read.
	routed []bool
	// snapRouted is the SNAPSHOT's status tested against StatusRouted, which is
	// what stageMorale's neighbour loop reads. It is a different array from routed
	// on purpose. See the note at the top of the file.
	snapRouted []bool
}

// fit sizes every mirror array to n units, reusing the allocations.
func (h *hotField) fit(n int) {
	if cap(h.x) < n {
		h.x = make([]float64, n)
		h.y = make([]float64, n)
		h.side = make([]uint8, n)
		h.troops = make([]float64, n)
		h.troopsHP = make([]float64, n)
		h.alive = make([]bool, n)
		h.routed = make([]bool, n)
		h.snapRouted = make([]bool, n)
		return
	}
	h.x = h.x[:n]
	h.y = h.y[:n]
	h.side = h.side[:n]
	h.troops = h.troops[:n]
	h.troopsHP = h.troopsHP[:n]
	h.alive = h.alive[:n]
	h.routed = h.routed[:n]
	h.snapRouted = h.snapRouted[:n]
}

// refresh copies the fields a neighbourhood query reads out of committed state
// and this tick's snapshot.
//
// It runs beside the two hash rebuilds at the top of the tick, before any stage,
// so it reads exactly what the hashes were just built from. A query during the
// tick therefore sees the same state the pointer chase saw at the same point.
func (b *Battle) refreshHotField() {
	n := len(b.units)
	if n == 0 {
		return
	}
	b.hot.fit(n)
	hf := &b.hot
	for i, u := range b.units {
		hf.x[i] = u.X
		hf.y[i] = u.Y
		hf.side[i] = uint8(u.Side)
		hf.troops[i] = u.Troops
		hf.troopsHP[i] = u.Troops * u.hpFrac()
		hf.alive[i] = u.alive()
		hf.routed[i] = u.Status == StatusRouted
		hf.snapRouted[i] = b.snap[i].Status == StatusRouted
	}
}