package replay

import (
	"fmt"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// recorder is the Commander that watches a battle.
//
// It satisfies battle.Commander and deliberately writes no orders: a recorder
// that ordered units about would not be recording the battle the engine decides,
// it would be recording a different one. Every field of every UnitCommand is
// left zero, and Set is false, which the battle reads as "no order given".
//
// Determinism is a requirement of the seam and not a nicety of this type: a
// battle is reproducible from a seed, and an observer that drew from a clock or
// an unseeded generator would break that for every run it watched.
type recorder struct {
	// frames are the published states, one per tick, in tick order.
	frames []Frame
	// setup is the battle input, kept so the recording can be re-simulated.
	setup battle.Setup
	// tickSeconds and maxTicks come from the engine's own published view, so the
	// recording's time constants are the ones that ran rather than ones read out
	// of the config a second time.
	tickSeconds float64
	maxTicks    float64
}

// Frame is one tick's published state: what the battle told an outside layer it
// was doing, at the moment it told it.
//
// It is a value, not a view into the engine's buffers. battle.View is reused
// between ticks, so a recorder that kept the view would end up with a hundred
// copies of the last frame, and a recording of that kind is worth nothing.
type Frame struct {
	// Tick is the number of ticks completed before this one.
	Tick int
	// Elapsed is the simulated seconds before this tick, and TickSeconds is how
	// long the tick is.
	Elapsed     float64
	TickSeconds float64
	// Strength and Opening are each side's current battle strength and its
	// opening strength, indexed A then B.
	Strength [2]float64
	Opening  [2]float64
	// Units is every unit on the field, ascending by id, both sides together.
	Units []UnitFrame
}

// UnitFrame is one unit as published, at one tick.
//
// Every field here is copied out of battle.UnitView. The field set is the
// battle's published set and not a chosen subset, so a diff of two recordings
// compares everything an outside layer was ever told.
type UnitFrame struct {
	ID          int
	Side        battle.Side
	Role        battle.Role
	Status      battle.Status
	Intent      battle.Intent
	X           float64
	Y           float64
	HPFrac      float64
	Morale      float64
	Suppression float64
	Troops      float64
	Speed       float64
	Ammo        float64
}

// Command is the battle.Commander method. It copies the field and returns
// without writing an order.
//
// The two constants it returns are the engine's own tick length and bound,
// published in the same view, so the recording carries the time constants that
// actually ran rather than a second reading of the config that could disagree
// with them.
func (r *recorder) Command(v *battle.View) error {
	if v == nil {
		return fmt.Errorf("replay: the battle published a nil view at tick %d", len(r.frames))
	}
	if len(v.Units) != len(v.Commands) {
		return fmt.Errorf("replay: the battle published %d units and %d command slots at tick %d; "+
			"they are parallel by contract, so one of them is wrong",
			len(v.Units), len(v.Commands), v.Tick)
	}
	f := Frame{
		Tick:        v.Tick,
		Elapsed:     v.Elapsed,
		TickSeconds: v.TickSeconds,
		Strength:    v.Strength,
		Opening:     v.Opening,
		Units:       make([]UnitFrame, len(v.Units)),
	}
	for i := range v.Units {
		u := &v.Units[i]
		f.Units[i] = UnitFrame{
			ID:          u.ID,
			Side:        u.Side,
			Role:        u.Role,
			Status:      u.Status,
			Intent:      u.Intent,
			X:           u.X,
			Y:           u.Y,
			HPFrac:      u.HPFrac,
			Morale:      u.Morale,
			Suppression: u.Suppression,
			Troops:      u.Troops,
			Speed:       u.Speed,
			Ammo:        u.Ammo,
		}
	}
	// The frame is appended last, so a frame that was only half copied never
	// reaches the recording at all.
	r.frames = append(r.frames, f)
	if v.TickSeconds > 0 {
		r.tickSeconds = v.TickSeconds
	}
	return nil
}

// Recording is a whole observed battle: what it was, what happened, and why.
//
// It holds both the engine's own answer (Result) and this package's reading of
// it (Frames and Causes). Keeping them together is what lets a test check one
// against the other: the frames say which units died and the result says how
// many, and if those disagree then one of them is lying.
type Recording struct {
	// Seed and ConfigVersion identify what produced this recording.
	Seed          uint64
	ConfigVersion string
	// Label and Terrain are the battle's name and ground.
	Label   string
	Terrain battle.Terrain
	// TickOrder is the engine's documented stage order.
	TickOrder []string
	// MaxTicks is the engine's own bound, as it ran, and TickSeconds is its tick
	// length. Both are the engine's numbers, read from its result and its
	// published view rather than from a second reading of the config.
	MaxTicks    float64
	TickSeconds float64
	// Setup is the battle input, verbatim, so the fight can be re-simulated
	// rather than only played back.
	Setup battle.Setup
	// Frames are the published states, one per tick, in tick order.
	Frames []Frame
	// Causes is the cause log derived from the frames.
	Causes *CauseLog
	// Result is the engine's own outcome, complete.
	Result *battle.Result
	// Bytes is the size of the encoded JSONL, filled in by Encode and zero on a
	// recording that was never encoded.
	Bytes int

	// hdr and res are the decoded header and result lines, kept so that Decode can
	// read a file without rebuilding those values from a Recording it has not
	// finished constructing.
	hdr *jsonHeader
	res *jsonResult
}

// record runs a battle with a recorder attached and returns what it saw.
//
// It returns the recording rather than only the result, and the recording's
// Frames cover every tick the engine ran, because the recorder is the
// Commander and the engine calls it once per tick. A recording whose frame count
// does not match the result's tick count would mean the seam was skipped, and
// Record refuses to return one, because a replay with a hole in it looks exactly
// like a replay of a battle that had one.
func record(cfg *config.Config, seed uint64, setup battle.Setup) (*Recording, error) {
	r := &recorder{setup: setup}
	res, err := battle.RunCommanded(cfg, seed, setup, r)
	if err != nil {
		return nil, err
	}
	if len(r.frames) != res.Ticks {
		return nil, fmt.Errorf("replay: the battle reported %d ticks but published %d frames. "+
			"A frame is missing, so this recording has a hole in it and cannot be played back",
			res.Ticks, len(r.frames))
	}
	rec := &Recording{
		Seed:          seed,
		ConfigVersion: res.ConfigVersion,
		Label:         res.Label,
		Terrain:       setup.Terrain,
		TickOrder:     append([]string{}, res.TickOrder...),
		// The bound and the tick length both come from the engine's own result
		// rather than from a second reading of the config, so the recording states
		// the constants that actually ran.
		MaxTicks: res.Config.MaxTicks,
		Setup:    setup,
		Frames:   r.frames,
		Result:   res,
	}
	if r.tickSeconds > 0 {
		rec.TickSeconds = r.tickSeconds
	}
	rec.Causes = deriveCauses(rec.Frames)
	return rec, nil
}
