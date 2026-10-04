package battle

// The spatial index.
//
// Two of them, with opposite shapes, because the battle has two kinds of
// neighbourhood query and they want opposite cells:
//
//   - The melee index uses battle.grid_cell_size, which must be at least
//     battle.melee_range. A swing is two and a half metres, so the cell is
//     small and a query looks at the nine cells around the unit. It wants the
//     smallest cell that holds the query, because every extra cell is a lookup
//     and a distance check.
//
//   - The aimed-fire index uses battle.ranged_grid_cell_size, which is tens of
//     metres. A shot reaches a quarter of a kilometre, so with melee-sized cells
//     a shooter would have to walk outwards through twenty rings of cells to
//     find one enemy. With coarse cells the first ring it looks at usually has
//     targets in it.
//
// WHY THIS IS A DENSE ARRAY AND NOT A MAP
//
// The first version of this was a map[cell][]int. A CPU profile of the 500 v 500
// battle put 96% of the run inside forEachCell and 42% inside runtime.mapaccess1
// on its own, with aeshashbody, matchH2, memhash128, and memequal128 together
// accounting for roughly 27% of flat time: the index was spending half the
// battle hashing two-word cell keys to find out where its units were. Every
// unit asked every stage several neighbourhood questions per tick, and each
// question cost one hash per cell in the box.
//
// The replacement is a dense CSR grid — counts, a prefix sum, and one flat array
// of unit ids — so a cell lookup is an index into a slice and nothing else. The
// grid is sized to the actual extent of the units on the field every tick, and
// every id in it is placed by walking the unit array in ascending id order, so
// each cell's ids come out sorted and a query visits candidates in a fixed order
// whatever Go does with map iteration. Determinism is preserved exactly; only
// the cost of finding a cell changed.
//
// WHY THE INDEX CELL CAN BE COARSER THAN THE CONFIGURED ONE
//
// A routed unit runs, and over a long battle it can run a long way, so the
// extent of the field is not bounded in advance and a dense grid sized for the
// worst case would be absurd. Rather than cap the grid and clamp units into
// edge cells — which would silently corrupt every distance in the tick — the
// grid keeps a fixed cell budget and, when the field is too spread out to fit
// at the configured cell size, uses a coarser INDEX cell so that it does fit.
//
// A coarser index is always correct, because a query's ring count is computed
// from the index cell size it actually has, so the walk still covers the whole
// query radius. It only changes how much of the field each cell holds: fewer
// cells to look in, more units to distance-test in the ones that are found. That
// is a graceful trade rather than a fallback path, there is no second code path
// to keep in step, and no configuration of the field can make it wrong.

// cell is a grid coordinate pair in the CONFIGURED cell size. It is comparable,
// so it remains usable as a map key, and is what the index reports for a unit.
type cell struct {
	CX, CY int
}

// maxIndexCells is gone. It used to be a constant in this file and it is now
// battle.grid_max_cells in the balance file, because CONSTITUTION.md section 1.2
// has no exceptions and because a cell budget is exactly the kind of number
// that has to change when the machine changes. The default in the file is the
// value that used to live here, so nothing about the default run changed.
//
// The reasoning it carried is kept, because it is the answer to "why is there a
// ceiling at all". It is a memory and clearing budget, not a simulation limit.
// Exceeding it coarsens the index cell, which costs distance tests and never
// costs correctness. 65536 cells is 256 KiB of counts per index, cleared once
// per tick. A battle with a thousand units a side is nowhere near it; only a
// field spread over hundreds of kilometres by men who have been running for
// hours reaches it, and at that spread each cell holds about one man anyway.

// hash is a spatial index of unit ids by position, stored densely.
type hash struct {
	// size is the width in metres of one cell of the DENSE index, which is the
	// configured cell size until the field is too spread out to fit the cell
	// budget, and coarser than it after that. Queries compute their ring count
	// from this, so the walk always covers the query radius.
	size float64
	// wantSize is the configured cell width, kept so a report can say what the
	// balance file asked for as against what the index could afford.
	wantSize float64
	// maxCells is the ceiling on how many cells this index may hold, from
	// battle.grid_max_cells.
	maxCells int

	// minX and minY are the world coordinates of cell (0,0), and w and h are the
	// grid's extent in cells. Together they turn a world point into an index
	// with two subtractions, a floor, and a multiply.
	minX, minY float64
	w, h       int

	// counts is scratch for the rebuild: how many units land in each cell.
	counts []int32
	// starts is the prefix sum over counts, so cell i owns items[starts[i]:
	// starts[i+1]]. It has w*h+1 entries, the last being the total.
	starts []int32
	// cursor is scratch for the scatter pass.
	cursor []int32
	// items holds every unit id, grouped by cell and ascending within a cell.
	items []int

	// count is how many units were inserted, so a caller can tell a genuinely
	// empty index from one that was never built.
	count int
	// cellCount is how many cells are occupied, for a performance note.
	cellCount int
	// coarsened records that the index cell had to be made larger than the
	// configured size to fit its budget.
	coarsened bool
}

// newHash returns an empty index with the given configured cell width and the
// given ceiling on how many cells it may hold.
//
// A budget below four is raised to four, because the grid always adds a one cell
// margin on each axis and so cannot be smaller than 2x2. Raising it here rather
// than honouring it is the only safe reading: the alternative is an index that
// can never satisfy the budget, and rebuild's coarsening loop would then have
// no way to terminate. Config validation refuses such a budget outright, so this
// clamp only matters to a caller that built a config struct by hand rather than
// loading one.
func newHash(size float64, maxCells int) *hash {
	const minCells = 4 // 2x2: rebuild's one cell margin on each axis
	if maxCells < minCells {
		maxCells = minCells
	}
	return &hash{wantSize: size, size: size, maxCells: maxCells, counts: make([]int32, 0, 1024)}
}

// cellOf returns the cell containing a point, in the configured cell size.
func (h *hash) cellOf(x, y float64) cell {
	return cell{CX: floorCell(x, h.wantSize), CY: floorCell(y, h.wantSize)}
}

// extent returns the index cell containing a point. It is the hot path's only
// coordinate work: no hashing, and no division beyond the floor.
func (h *hash) extent(x, y float64) (int, int) {
	return floorCell(x-h.minX, h.size), floorCell(y-h.minY, h.size)
}

// rebuild refits the index to the units and inserts all of them.
//
// Dead units are inserted too, and stay for the rest of the battle. They are
// still evidence: COMBAT.md section 6 has a formation's morale moved by the
// casualties it can see, and a casualty that vanished from the field at the
// instant of death could never be seen by anyone. Every query filters on the
// candidate's own status, so a dead unit occupies a cell slot but is never
// returned as a target or a neighbour in the force.
//
// The slice must be in ascending id order, which it is: the battle's unit array
// is built in setup and is never reordered. That is what makes every cell's ids
// ascending without a sort, and so what keeps targeting reproducible.
func (h *hash) rebuild(units []*Unit) {
	n := len(units)
	if n == 0 {
		h.w, h.h, h.count, h.cellCount = 0, 0, 0, 0
		return
	}

	// The extent of the field, which sets the grid. This is the only pass over
	// the units before the counting pass.
	minX, minY := units[0].X, units[0].Y
	maxX, maxY := minX, minY
	for _, u := range units[1:] {
		if u.X < minX {
			minX = u.X
		} else if u.X > maxX {
			maxX = u.X
		}
		if u.Y < minY {
			minY = u.Y
		} else if u.Y > maxY {
			maxY = u.Y
		}
	}
	spanX := maxX - minX
	spanY := maxY - minY

	// The configured cell size if it fits the budget, and otherwise the smallest
	// size that does. Working out the side lengths first and then taking the
	// larger of the two ratios keeps the grid close to square, because a long
	// thin grid spends its whole budget on one axis and wastes the other.
	//
	// The "+2" on each side is a one cell margin so a query at the edge of the
	// field still has a cell to walk into, and it means the smallest grid this
	// can ever produce is 2x2, or four cells. The loop below therefore cannot
	// converge on a budget below four, and an earlier version of it, with the
	// budget hard coded at 65536, was safe by accident rather than by argument:
	// a budget small enough to reach this loop with a floor of 4 spun forever.
	// The budget is configurable now, so the floor is stated in two places, as a
	// clamp in newHash and as a bound in config validation, and the loop carries
	// its own termination guard as well. See battle.grid_max_cells.
	cell := h.wantSize
	w := int(spanX/cell) + 2
	hh := int(spanY/cell) + 2
	if w > 0 && hh > 0 && w*hh > h.maxCells {
		for w*hh > h.maxCells {
			cell *= 2
			w = int(spanX/cell) + 2
			hh = int(spanY/cell) + 2
			// Past this point every cell spans more than the whole field, so w
			// and hh are at their floor of 2 and doubling cell changes nothing.
			// Breaking here rather than spinning is what makes the loop's
			// termination a property of this code instead of of its caller.
			if int(spanX/cell) == 0 && int(spanY/cell) == 0 {
				break
			}
		}
		h.coarsened = true
	} else {
		h.coarsened = false
	}
	if w < 1 {
		w = 1
	}
	if hh < 1 {
		hh = 1
	}

	h.size = cell
	h.minX, h.minY = minX, minY
	h.w, h.h = w, hh
	cells := w * hh
	h.fit(cells)

	// Clear and count. The clear is a memclr over 4 bytes a cell, which is the
	// price of not hashing anything.
	clear(h.counts[:cells])
	for _, u := range units {
		cx, cy := h.extent(u.X, u.Y)
		h.counts[cx+h.w*cy]++
	}
	h.count = n

	// Prefix sum into starts, and remember the occupied cells for cellCount.
	// Occupancy is counted here rather than in a third pass because the
	// scatter below already has to walk every cell to place the ids.
	occupied := 0
	var run int32
	for i := 0; i < cells; i++ {
		h.starts[i] = run
		c := h.counts[i]
		if c > 0 {
			occupied++
		}
		run += c
	}
	h.starts[cells] = run
	h.cellCount = occupied

	copy(h.cursor[:cells], h.starts[:cells])
	if cap(h.items) < n {
		h.items = make([]int, n)
	}
	items := h.items[:n]
	for _, u := range units {
		cx, cy := h.extent(u.X, u.Y)
		i := cx + h.w*cy
		items[h.cursor[i]] = u.ID
		h.cursor[i]++
	}
}

// fit makes the per-cell arrays the right size for this grid, reusing the
// existing allocation when it is already big enough. Allocating once and
// clearing per tick is what keeps a long battle from churning the heap.
func (h *hash) fit(cells int) {
	// Each array is checked on its own rather than on counts, because they are
	// not grown together: newHash seeds counts and the other two start nil.
	if cap(h.counts) >= cells {
		h.counts = h.counts[:cells]
	} else {
		h.counts = make([]int32, cells)
	}
	if cap(h.starts) >= cells+1 {
		h.starts = h.starts[:cells+1]
	} else {
		h.starts = make([]int32, cells+1)
	}
	if cap(h.cursor) >= cells {
		h.cursor = h.cursor[:cells]
	} else {
		h.cursor = make([]int32, cells)
	}
}

// span is how many cells a query of the given radius reaches out from the centre
// cell.
//
// The extra cell is not slack, it is the difference between covering the query
// and missing part of it. The centre cell of a query is the cell CONTAINING the
// query point, so the point can be anywhere from 0 to one full cell width from
// that cell's near edge. A target exactly radius away can therefore sit as much
// as radius+size from the near edge, which is floor(radius/size)+1 cells out,
// not floor(radius/size).
//
// Understating it by one cell does not make a query slightly optimistic, it
// silently drops candidates that are inside the radius, and it drops them
// exactly where a crowd is densest. Measured against the shipped balance file:
// with grid_cell_size 12 and melee_range 2.6, two men 2.5 m apart either side of
// a cell boundary were reported as NOT in melee reach, because the walk visited
// only the centre cell. The melee stage therefore never resolved a blow in any
// battle, because a crowd in contact is always straddling boundaries, and a
// battle in which nobody can hit anybody produces almost no casualties and no
// decision. The same off-by-one truncated every ranged query at 192 m instead of
// 240 m and every morale neighbourhood at its edge, which is why shooters found
// almost nothing to shoot at.
func (h *hash) span(radius float64) int {
	n := int(floorCell(radius, h.size))
	if n < 0 {
		return 0
	}
	// +1 to reach the cell a target at exactly radius can fall in, measured
	// from the near edge of the centre cell rather than from the query point.
	return n + 1
}

// forEachCell calls fn with the id of every unit in the cells overlapping the
// square of side 2*radius centred on (x,y), in a fixed order.
//
// The order is ring by ring outward from the centre cell, and within a ring a
// fixed walk of the perimeter. It is deterministic, which is the only property
// that matters; it is not especially cache friendly and does not need to be,
// because the alternative is a non-reproducible battle.
func (h *hash) forEachCell(x, y, radius float64, fn func(id int)) {
	if h.count == 0 {
		return
	}
	cx, cy := h.extent(x, y)
	last := h.span(radius)
	items := h.items
	starts := h.starts
	w := h.w
	// visit walks one index cell. Bounds are clamped rather than tested per
	// side: the walk knows the cell it is looking at came from the centre cell
	// plus a ring, so only the grid's edges can fall outside it.
	visit := func(ix, iy int) {
		if ix < 0 || iy < 0 || ix >= w || iy >= h.h {
			return
		}
		i := ix + w*iy
		for _, id := range items[starts[i]:starts[i+1]] {
			fn(id)
		}
	}
	for ring := 0; ring <= last; ring++ {
		if ring == 0 {
			visit(cx, cy)
			continue
		}
		// The ring's perimeter, walked without repeating a corner: the top and
		// bottom edges over the full width, then the two sides over the inner
		// height. Every cell of the ring appears exactly once.
		for dx := -ring; dx <= ring; dx++ {
			visit(cx+dx, cy-ring)
			visit(cx+dx, cy+ring)
		}
		for dy := -ring + 1; dy <= ring-1; dy++ {
			visit(cx-ring, cy+dy)
			visit(cx+ring, cy+dy)
		}
	}
}

// anyInCell reports whether fn returns true for any unit in the cells
// overlapping the square of side 2*radius centred on (x,y), and stops the walk
// at the first one that does.
//
// This exists because forEachCell cannot be made to stop early. It takes a
// func(id) with no result, so a caller that only wants to know WHETHER something
// is in range has no way to end the walk, and the walk goes on visiting every
// cell in the box and calling the closure for every unit in them after the answer
// is already known.
//
// The cost of that was measured on the 500 v 500 battle. A CPU profile put
// (*Battle).enemyWithin at 28.69% cumulative and (*Battle).inFireArc at 7.79% on
// top of it, and both are yes-or-no questions: is any enemy inside the arc. Both
// walk the COARSE hash out to battle.ranged_range, which is two hundred and forty
// metres over sixty-four metre cells, so a query near the middle of the field
// covers a twenty-one-by-twenty-one block — four hundred and forty-one cells — and
// asks every unit in each of them. Worse, the shooters are exactly the units for
// which the answer is usually yes, and the melee units ask it again for
// battle.charge_distance. The engine was paying a full field sweep, per unit, per
// tick, to compute a bit that was settled in the first few cells.
//
// anyInCell takes a func(id) bool and returns as soon as it is true, so the same
// query that cost four hundred and forty-one cells now costs however many it took
// to find the answer, which in a shooting battle is one or two.
//
// DETERMINISM. The walk visits the same cells in the same ring order as
// forEachCell, and it stops at the first true. That is safe precisely because the
// caller is asking whether ANY unit matches: the answer does not depend on which
// match is found first, only on whether one exists, and a query that would have
// found a later match has already found an earlier one and reports the same true.
// A caller that needs every match, or that needs them in a particular order to
// break a tie, must use forEachCell, which is unchanged.
func (h *hash) anyInCell(x, y, radius float64, fn func(id int) bool) bool {
	if h.count == 0 {
		return false
	}
	cx, cy := h.extent(x, y)
	last := h.span(radius)
	items := h.items
	starts := h.starts
	w := h.w
	hgt := h.h
	// visit walks one index cell and reports whether fn matched anything in it.
	// Bounds are clamped rather than tested per side, for the reason given on
	// forEachCell's own visit: only the grid's edges can fall outside the walk.
	visit := func(ix, iy int) bool {
		if ix < 0 || iy < 0 || ix >= w || iy >= hgt {
			return false
		}
		i := ix + w*iy
		for _, id := range items[starts[i]:starts[i+1]] {
			if fn(id) {
				return true
			}
		}
		return false
	}
	for ring := 0; ring <= last; ring++ {
		if ring == 0 {
			if visit(cx, cy) {
				return true
			}
			continue
		}
		for dx := -ring; dx <= ring; dx++ {
			if visit(cx+dx, cy-ring) {
				return true
			}
			if visit(cx+dx, cy+ring) {
				return true
			}
		}
		for dy := -ring + 1; dy <= ring-1; dy++ {
			if visit(cx-ring, cy+dy) {
				return true
			}
			if visit(cx+ring, cy+dy) {
				return true
			}
		}
	}
	return false
}

// collectCells appends to dst the flat index of every NON-EMPTY cell the query at
// (x,y) keeps, in the same ring order forEachCell walks, and returns the
// extended slice.
//
// The index is the one the CSR grid addresses its runs by, so a caller walks its
// own candidates with items[starts[k]:starts[k+1]]. dst is the caller's own
// scratch: handing it in means the walk allocates nothing after the scratch has
// grown once, which is what keeps a per-tick loop allocation-free.
func (h *hash) collectCells(dst []int32, x, y, radius float64) []int32 {
	if h.count == 0 {
		return dst
	}
	cx, cy := h.extent(x, y)
	last := h.span(radius)
	starts := h.starts
	w := h.w
	visit := func(ix, iy int) {
		if ix < 0 || iy < 0 || ix >= w || iy >= h.h {
			return
		}
		i := ix + w*iy
		if starts[i] != starts[i+1] {
			dst = append(dst, int32(i))
		}
	}
	for ring := 0; ring <= last; ring++ {
		if ring == 0 {
			visit(cx, cy)
			continue
		}
		for dx := -ring; dx <= ring; dx++ {
			visit(cx+dx, cy-ring)
			visit(cx+dx, cy+ring)
		}
		for dy := -ring + 1; dy <= ring-1; dy++ {
			visit(cx-ring, cy+dy)
			visit(cx+ring, cy+dy)
		}
	}
	return dst
}

// occupiedCells is how many non-empty cells the index holds, reported so a
// performance note can say what the battle actually built rather than guessing.
func (h *hash) occupiedCells() int { return h.cellCount }

// floorCell is the cell coordinate of v for a cell of the given width, rounding
// toward negative infinity.
//
// Go's integer conversion truncates toward zero, which would put -0.5 and 0.5
// in the same cell. Getting this wrong splits a formation across a cell
// boundary in a way that depends on which side of zero it starts, which is
// exactly the kind of bug that looks fine at origin and wrong at scale.
func floorCell(v, size float64) int {
	f := v / size
	trunc := int(f)
	// A negative value that did not land exactly on a boundary was rounded up
	// toward zero, so step back one.
	if f < 0 && f != float64(trunc) {
		return trunc - 1
	}
	return trunc
}
