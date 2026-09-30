package formation

import "math"

// Slot is one man's place in a formation, in the formation's own frame: X runs
// to the formation's right and Y runs forward, the direction the formation
// looks. Slots are local because the same shape is reused at any position and
// any facing — a wedge in front of the enemy at the start of the battle and the
// same wedge around their flank thirty seconds later are the same shape, and
// storing them in world coordinates would hide that.
type Slot struct {
	// Right is metres to the right of the formation anchor.
	Right float64
	// Forward is metres ahead of the formation anchor.
	//
	// The anchor is the formation's centre of mass, so the shape is centred on
	// it: the mean of every slot's Forward is zero, and slots run positive in
	// front of it and negative behind. That matters more than it looks. A shape
	// whose front rank sat at zero would be permanently out of step with its
	// own anchor, and every man in it would spend the battle walking backwards
	// toward the slot he had been told to hold.
	Forward float64
}

// world returns the slot placed at an anchor with a given heading, in radians
// counter-clockwise from +X. Forward is the heading direction and right is
// forward turned a quarter turn clockwise, which is what "to the right of a man
// facing that way" means on the ground.
func (s Slot) world(anchor Vec, heading float64) Vec {
	forward := Vec{math.Cos(heading), math.Sin(heading)}
	right := Vec{forward.Y, -forward.X}
	return Vec{
		X: anchor.X + right.X*s.Right + forward.X*s.Forward,
		Y: anchor.Y + right.Y*s.Right + forward.Y*s.Forward,
	}
}

// Layout computes the slots for a shape. The returned slice is in assignment
// order: slots[i] belongs to ids[i]. The caller decides that order — this
// package sorts by unit ID before calling, so the same men always form the
// same shape and the shape never depends on the order they arrived in.
//
// Each shape is laid out from its front rank backwards, because that is how a
// body of troops forms up: the front rank goes where the commander wants it,
// and the ranks behind fill in. Whatever men are left over make a short final
// rank, centred on the spine, rather than being dropped: a formation of any
// size is a formation, not a formation minus a remainder.
func Layout(kind Formation, ids []int, c Config) ([]Slot, error) {
	if !kind.Valid() {
		return nil, errorf("Layout", "formation", "%v is not implemented, so it has no layout", kind)
	}
	if len(ids) == 0 {
		return nil, errorf("Layout", "ids", "a formation of nobody has no layout")
	}
	if err := c.Validate(); err != nil {
		return nil, err
	}
	var slots []Slot
	switch kind {
	case FormationLine:
		slots = ranks(len(ids), int(c.LineFrontWidth), c)
	case FormationColumn:
		slots = ranks(len(ids), int(c.ColumnFrontWidth), c)
	case FormationWedge:
		slots = wedge(len(ids), c)
	case FormationLoose:
		slots = loose(ids, c)
	default:
		// Unreachable, because Valid has already been checked. Kept anyway: a
		// shape added to the enum without a layout here must fail loudly here
		// rather than return an empty formation that reads as bad data in the
		// caller's.
		return nil, errorf("Layout", "formation", "%v has no layout implemented", kind)
	}
	centreOnMass(slots)
	return slots, nil
}

// centreOnMass shifts a shape so its centre of mass sits on the anchor.
//
// Both axes have to be centred, and the second one is not optional. A shape is
// rarely symmetric: a line of 200 men at sixteen to a rank has a part-filled
// rear rank, and a wedge is wider at the back than the front. If the shape's
// mean offset is not zero, then a formation standing exactly on its slots has
// its centre of mass somewhere other than the anchor, the anchor is by
// definition the centre of mass, and the two disagree — so every tick the
// anchor steps a little further along the frame's own axis while the frame
// rotates. Left alone that walks a holding line clean off its own position
// over a couple of minutes of battle, and nothing about it looks wrong until
// you measure where the line started.
func centreOnMass(slots []Slot) {
	if len(slots) == 0 {
		return
	}
	var sumR, sumF float64
	for _, s := range slots {
		sumR += s.Right
		sumF += s.Forward
	}
	n := float64(len(slots))
	for i := range slots {
		slots[i].Right -= sumR / n
		slots[i].Forward -= sumF / n
	}
}

// ranks lays out a fixed-width block of men rank by rank: the first rank abreast
// at the front, the next behind it, and so on. Line and column are the same
// shape with a different width, which is why they share this code and only the
// balance file's front-width knobs tell them apart.
func ranks(n, width int, c Config) []Slot {
	slots := make([]Slot, n)
	for i := range slots {
		col := i % width
		rank := i / width
		slots[i] = Slot{
			// A rank is centred on the spine. An odd count centres a man on
			// it; an even count straddles it, which is correct, because there
			// is no man in the middle of an even rank.
			Right:   (float64(col) - float64(width-1)/2) * c.FrontSpacing,
			Forward: -float64(rank) * c.RankSpacing,
		}
	}
	return slots
}

// wedge lays out a pointed arrow: the tip at the front, each rank behind it
// wider by the configured growth on each side.
//
// The first unit in assignment order takes the point, because that is the rank
// that goes in first and a wedge is an argument about who goes in first. One
// man at the tip with two added per side is a 45-degree arrow; one added per
// side is a narrow shape that is barely a wedge, and that is a balance decision
// the config file makes rather than one this code decides.
//
// A wedge widens as it goes back, so if the men run out partway through a rank
// that rank is short. It is still centred on the spine, so a partial wedge
// reads as one body of troops with a thin rear rather than as a triangle with a
// stub hanging off it.
func wedge(n int, c Config) []Slot {
	tip := int(c.WedgeTipUnits)
	growth := int(c.WedgeRowGrowth)
	slots := make([]Slot, 0, n)
	for rank := 0; len(slots) < n; rank++ {
		// Rank r is the tip widened by r growths on each side.
		width := tip + 2*growth*rank
		if remaining := n - len(slots); width > remaining {
			width = remaining
		}
		for k := 0; k < width; k++ {
			slots = append(slots, Slot{
				Right:   (float64(k) - float64(width-1)/2) * c.FrontSpacing,
				Forward: -float64(rank) * c.RankSpacing,
			})
		}
	}
	return slots
}

// loose scatters men on a lattice. Loose order exists to make aimed fire
// wasteful, so the lattice is loose spacing apart rather than shoulder to
// shoulder, and each man is then pushed off his lattice point by a scatter
// derived from his own ID.
//
// The scatter is not a draw from a generator. It is a hash of (seed, unit ID,
// slot), so the same men in the same loose order always stand in the same
// scattered places. That matters twice over: a battle has to be reproducible
// from a seed alone, and a man who appears to teleport between ticks because
// something else in the simulation consumed a random number is a bug that no
// screenshot would show and every log would.
func loose(ids []int, c Config) []Slot {
	side := int(math.Ceil(math.Sqrt(float64(len(ids)))))
	if side < 1 {
		side = 1
	}
	slots := make([]Slot, len(ids))
	for i, id := range ids {
		col := i % side
		row := i / side
		jx, jy := scatter(c.LooseSeedInt(), id, i, c.LooseJitterFraction*c.LooseSpacing)
		slots[i] = Slot{
			Right:   (float64(col)-float64(side-1)/2)*c.LooseSpacing + jx,
			Forward: (float64(row)-float64(side-1)/2)*c.LooseSpacing + jy,
		}
	}
	return slots
}

// splitmix64 is a finalising mix of a 64-bit value. It is used here as a
// deterministic scatter source, not as an RNG: the same inputs always give the
// same outputs on every machine and every Go version, and no state is carried
// between calls. A real generator would make a formation's shape depend on how
// many times anything else had drawn from it.
func splitmix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	z := x
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}

// scatter returns the two offsets, in metres, that push the man in slot i off
// his lattice point. Both are bounded by amp, and amp is bounded by the config
// to below half the loose spacing, so two neighbours cannot be pushed into each
// other however the hash falls.
func scatter(seed int64, id, i int, amp float64) (float64, float64) {
	h := splitmix64(uint64(seed) ^ splitmix64(uint64(int64(id))*0x100000001B3^uint64(i)))
	// One hash is folded into two values in [-amp, amp] through 53 bits, the
	// most a float64 can hold exactly.
	const mantissa = float64(uint64(1) << 53)
	a := float64(h>>11) / mantissa
	b := float64(splitmix64(h)>>11) / mantissa
	return (2*a - 1) * amp, (2*b - 1) * amp
}

// Bounds returns how far a set of slots reaches: right and left of the
// anchor, and forward and back from it. The flank order needs the forward
// extent, because a formation has to clear its own depth and the enemy's depth
// plus a clearance before it can turn in behind them.
func Bounds(slots []Slot) (minRight, maxRight, minForward, maxForward float64, err error) {
	if len(slots) == 0 {
		return 0, 0, 0, 0, errorf("Bounds", "slots", "a formation of nobody has no extent")
	}
	minRight, maxRight = slots[0].Right, slots[0].Right
	minForward, maxForward = slots[0].Forward, slots[0].Forward
	for _, s := range slots[1:] {
		minRight = math.Min(minRight, s.Right)
		maxRight = math.Max(maxRight, s.Right)
		minForward = math.Min(minForward, s.Forward)
		maxForward = math.Max(maxForward, s.Forward)
	}
	return minRight, maxRight, minForward, maxForward, nil
}

// MinPairDistance returns the smallest distance between any two slots. It is
// the check that a shape is actually a formation: men standing on the same
// lattice are apart by the configured spacing, and if that ever stops being
// true the spacing pass would fight the shape forever instead of the men
// arriving in a shape.
func MinPairDistance(slots []Slot) (float64, error) {
	if len(slots) < 2 {
		return 0, errorf("MinPairDistance", "slots", "need at least two slots to measure a gap")
	}
	best := math.Inf(1)
	for i := range slots {
		for j := i + 1; j < len(slots); j++ {
			d := math.Hypot(slots[i].Right-slots[j].Right, slots[i].Forward-slots[j].Forward)
			if d < best {
				best = d
			}
		}
	}
	return best, nil
}
