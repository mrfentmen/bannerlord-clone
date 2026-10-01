package battlefeed

import (
	"fmt"

	"mbclone/simulation/internal/battle"
)

// recorder is the Commander that watches a battle.
//
// It satisfies battle.Commander and deliberately writes no orders. A recorder
// that ordered units about would not be recording the battle the engine decides,
// it would be recording a different one: every field of every UnitCommand is
// left zero and Set is false, which the engine reads as "no order given".
//
// Determinism is a requirement of the seam, not a nicety: a battle is
// reproducible from a seed, and an observer that drew from a clock or an unseeded
// generator would break that for every run it watched. Nothing here reads a
// clock, a map, or a source of randomness.
type recorder struct {
	// opts are the bounds this recorder was built with, already normalised.
	opts Options

	// total is how many ticks the engine has published.
	total int
	// stride is the tick spacing of the kept frames. It starts at SampleEvery
	// and doubles every time the kept set is halved.
	stride int
	// thinned says the kept set was ever halved, which is different from a feed
	// that was simply sampled: a thinned feed is missing ticks the engine ran.
	thinned bool
	// kept is the sampled history, oldest first.
	kept []Frame

	// lastUnits is the most recently published full unit list, and
	// unitsTick the tick it was published at. The two buffers swap, so recording
	// every tick costs no allocation per tick.
	lastUnits, pendingUnits []Unit
	unitsTick               int
}

func newRecorder(opts Options) *recorder {
	return &recorder{
		opts:   opts.normalise(),
		stride: opts.normalise().SampleEvery,
	}
}

// Command is the battle.Commander method.
//
// It copies the published field and returns without writing an order. Anything
// it cannot copy is an error rather than a silent gap: a feed missing a unit's
// position is a feed that renders a battle nobody fought.
func (r *recorder) Command(v *battle.View) error {
	if v == nil {
		return fmt.Errorf("battlefeed: the battle published no field at tick %d", r.total)
	}
	if len(v.Units) != len(v.Commands) {
		return fmt.Errorf("battlefeed: the battle published %d units and %d command slots at tick %d; "+
			"they are parallel by contract, so one of them is wrong", len(v.Units), len(v.Commands), v.Tick)
	}
	r.total++

	// The unit block is the last thing published, whatever the frame sampling
	// does, so it is written every tick into the spare buffer and swapped. The
	// client needs the final field of the battle, not a sample of it.
	if r.lastUnits == nil {
		r.lastUnits = make([]Unit, len(v.Units))
		r.pendingUnits = make([]Unit, len(v.Units))
	}
	for i := range v.Units {
		u := &v.Units[i]
		r.pendingUnits[i] = Unit{
			ID:          u.ID,
			Side:        u.Side.String(),
			Role:        u.Role.String(),
			Status:      u.Status.String(),
			CanFight:    u.Status.Actable(),
			X:           mm(u.X),
			Y:           mm(u.Y),
			HPFrac:      mm(u.HPFrac),
			Morale:      mm(u.Morale),
			Suppression: mm(u.Suppression),
			Troops:      mm(u.Troops),
			Ammo:        mm(u.Ammo),
			Speed:       mm(u.Speed),
			Intent:      u.Intent.String(),
		}
	}
	r.lastUnits, r.pendingUnits = r.pendingUnits, r.lastUnits
	r.unitsTick = v.Tick

	if !r.opts.IncludeFrames {
		return nil
	}
	if v.Tick%r.stride != 0 {
		return nil
	}
	f := Frame{
		Tick:     v.Tick,
		Elapsed:  mm(v.Elapsed),
		Strength: [2]float64{mm(v.Strength[0]), mm(v.Strength[1])},
		Opening:  [2]float64{mm(v.Opening[0]), mm(v.Opening[1])},
		Units:    make([]FrameUnit, len(v.Units)),
	}
	for i := range v.Units {
		u := &v.Units[i]
		f.Units[i] = FrameUnit{
			ID:          u.ID,
			X:           mm(u.X),
			Y:           mm(u.Y),
			Status:      u.Status.String(),
			HPFrac:      mm(u.HPFrac),
			Morale:      mm(u.Morale),
			Suppression: mm(u.Suppression),
		}
	}
	r.kept = append(r.kept, f)
	// Past twice the cap the kept set is halved and the stride doubled, so
	// memory stays bounded on a long battle while a short one is never thinned.
	// Halving keeps the oldest frame and every other one after it, which leaves
	// the first tick of the battle in the feed whatever the stride becomes.
	if len(r.kept) > 2*r.opts.MaxFrames {
		half := make([]Frame, 0, (len(r.kept)+1)/2)
		for i := 0; i < len(r.kept); i += 2 {
			half = append(half, r.kept[i])
		}
		r.kept = half
		r.stride *= 2
		r.thinned = true
	}
	return nil
}

// units is the published unit list, or nil when no tick ever published one.
func (r *recorder) units() []Unit {
	if r.unitsTick < 0 {
		return nil
	}
	return append([]Unit{}, r.lastUnits...)
}

// framesFeed is the sampled history and the accounting of what it cost.
func (r *recorder) framesFeed() Frames {
	f := Frames{}
	if !r.opts.IncludeFrames {
		f.Ticks = []Frame{}
		return f
	}
	// SampleEvery is the spacing that actually ran, not the one that was asked
	// for: it starts at Options.SampleEvery and doubles if the history had to be
	// thinned. A client interpolating between frames needs the real spacing, and
	// the doubling is exactly the thing it would otherwise get wrong.
	f.SampleEvery = r.stride
	f.Total = r.total
	f.Kept = len(r.kept)
	f.Thinned = r.thinned
	f.Ticks = append([]Frame{}, r.kept...)
	for _, fr := range f.Ticks {
		f.UnitFrames += len(fr.Units)
	}
	f.Dropped = f.Total - f.Kept
	if f.Dropped < 0 {
		// Unreachable while kept is a subset of total, which it is by
		// construction. Clamped rather than reported so a client computing a
		// percentage from it cannot divide by a negative.
		f.Dropped = 0
	}
	return f
}
