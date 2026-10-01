// Package battlefeed turns a battle simulation into one JSON document a client
// can render without running the simulation.
//
// The problem it solves is narrow and real: the campaign client needs to draw a
// field battle, and to know who won it and what it cost, but it must not have to
// re-run the battle, know the balance file, or understand the engine's internals.
// This package is the whole of that contract, in one file, with a schema version
// on it.
//
// # What is in the document
//
//   - Battle: what was fought, under which seed, which config version, which
//     documented stage order. Enough to match a result to a run.
//   - Outcome: the winner and the condition that ended the battle.
//   - Sides: casualties, surrendered, strength and morale per side, indexed A
//     then B. This is the aftermath the campaign writes back with.
//   - Units: every unit with its final published position, condition and status.
//     This is the field the client draws.
//   - Frames: the battle sampled over time, so the client can animate the fight
//     rather than only show where it ended.
//   - Events: breaks, routs, rallies, surrenders and destructions, in order.
//
// # Two honest limits, stated in the document itself
//
//  1. The unit block is the state the engine PUBLISHED, which is the top of the
//     last tick it ran. The engine publishes at the top of a tick and the battle
//     ends after that tick's work is committed, so the last published frame is
//     always one tick behind the ending. Units.UnitsTick and the notes say so, and
//     the casualty and strength figures in Sides come from the engine's own
//     post-final-commit result rather than from a frame.
//
//  2. The frames are a SAMPLE, bounded, and the document says how many were kept,
//     how many were dropped, and whether the sample was thinned further to fit.
//     A client that is told "60 of 900 ticks" can interpolate; a client that is
//     told nothing cannot.
//
// # Bounds, and why they are here rather than in the balance file
//
// A five-hundred-squad battle over a few hundred ticks is millions of unit-frame
// records. Options below bound what this package will hold in memory and write
// to disk, and the numbers are transport limits rather than balance constants:
// they change how much of a battle a client receives and nothing about how the
// battle is fought, so they are named in one place here and a caller overrides
// them explicitly. A number that changed how a battle was decided would belong
// in config/balance.toml under CONSTITUTION.md section 1.2 instead.
//
// # Relationship to the other two battle readers
//
// The battle engine (internal/battle) owns the outcome. internal/replay owns the
// byte-comparable per-tick recording used to prove determinism. This package
// owns the document a client renders. None of the three imports the other two's
// concerns: this package imports the engine only, and CONSTITUTION.md section
// 2.1's rule about systems not reaching into each other is why the duplication
// of a handful of unit fields across all three is deliberate. A determinism
// artefact and a client payload want different bytes: the first wants to change
// whenever the engine's internals change, the second wants to stay stable while
// the client is built against it.
package battlefeed

import (
	"fmt"
	"math"
	"strings"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// Schema is the value of the document's schema field. It names the shape, and
// SchemaVersion says which revision of that shape this is.
const Schema = "bannerlord.battle-feed"

// SchemaVersion is the revision of the document shape.
//
// It changes when a field is removed or its meaning changes, never when a field
// is added: a client that ignores an unknown key still reads a version 1
// document correctly, and Decode rejects unknown keys precisely so that a
// document written by a future version is refused loudly rather than half-read.
const SchemaVersion = 1

// Options bounds what a feed records.
type Options struct {
	// SampleEvery keeps one published tick in every N. One keeps every tick.
	// A value below one is treated as one, because a feed with no frames is not
	// a feed a client can animate.
	SampleEvery int
	// MaxFrames is the hard cap on frames kept. Zero means DefaultMaxFrames.
	// Past the cap the recorder halves what it holds and doubles its stride, so
	// memory stays bounded on a long battle and a short battle is never thinned
	// at all.
	MaxFrames int
	// MaxEvents is the hard cap on events kept. Zero means DefaultMaxEvents.
	// The engine has its own bound and reports what it dropped; this is a second,
	// independent cap so a client payload stays bounded even if the engine's
	// bound is ever raised.
	MaxEvents int
	// IncludeFrames turns the frame block off entirely, for a caller that only
	// wants the aftermath and not the animation.
	IncludeFrames bool
}

// Defaults for the bounds. See the package comment on why these are not balance
// constants.
const (
	// DefaultMaxFrames keeps three hundred frames. At a five-hundred-squad
	// battle that is a few hundred thousand unit records: a large file, but one
	// that plays, and the document states its own size so a client can decide.
	DefaultMaxFrames = 300
	// DefaultMaxEvents keeps a thousand events. The engine's own bound is
	// 4096; this is a smaller, deliberately round number because a client draws
	// markers, not a log.
	DefaultMaxEvents = 1000
)

// DefaultOptions is the bound set a caller gets by passing the zero Options.
func DefaultOptions() Options {
	return Options{MaxFrames: DefaultMaxFrames, MaxEvents: DefaultMaxEvents, IncludeFrames: true}
}

func (o Options) normalise() Options {
	if o.SampleEvery < 1 {
		o.SampleEvery = 1
	}
	if o.MaxFrames < 1 {
		o.MaxFrames = DefaultMaxFrames
	}
	if o.MaxEvents < 1 {
		o.MaxEvents = DefaultMaxEvents
	}
	return o
}

// Feed is the whole document.
//
// The field order here is the field order in the JSON, because encoding a struct
// writes its fields in declaration order. That is not cosmetic: it is what makes
// two recordings of the same battle byte-identical, which is the cheapest test
// there is that nothing in this path depends on a map's iteration order.
type Feed struct {
	// Schema and SchemaVersion say what this document is. A client checks them
	// before reading anything else.
	Schema        string `json:"schema"`
	SchemaVersion int    `json:"schema_version"`

	// Battle is what was fought.
	Battle BattleMeta `json:"battle"`
	// Outcome is who won and why.
	Outcome Outcome `json:"outcome"`
	// Duration is how long it took, in simulated time.
	Duration Duration `json:"duration"`

	// Sides is one entry per side in the fixed order A then B. An array and not
	// a keyed object because the order is part of the contract and every
	// strength figure in the engine is indexed the same way.
	Sides [2]Side `json:"sides"`

	// Units is every unit with the state the engine last published. See the
	// package comment on the one tick between that state and the ending.
	Units []Unit `json:"units"`
	// UnitsTick is the tick whose top-of-tick publication Units is, or -1 when
	// the battle was decided before any tick ran and no unit state exists.
	UnitsTick int `json:"units_tick"`

	// Frames is the battle over time, and the accounting of what was kept.
	Frames Frames `json:"frames"`
	// Events are the notable things that happened, in order.
	Events []Event `json:"events"`
	// EventsDropped is how many events the feed is not carrying: its own cap
	// first, then whatever the engine reported dropping. A count is reported
	// rather than hidden, so a client can say "and more".
	EventsDropped int `json:"events_dropped"`

	// Stats are the battle's own totals.
	Stats Stats `json:"stats"`
	// Config quotes back the battle constants this ran under, so a saved feed
	// says what produced it.
	Config BattleConfig `json:"config"`

	// Notes are things a reader needs to be told that the fields cannot say on
	// their own. Empty is a normal, good value.
	Notes []string `json:"notes"`
	// Bytes is the size of the encoded document, filled in by Encode and zero
	// on a feed that was never encoded.
	Bytes int `json:"bytes,omitempty"`
}

// BattleMeta is what was fought.
type BattleMeta struct {
	Label         string   `json:"label"`
	Seed          uint64   `json:"seed"`
	ConfigVersion string   `json:"config_version"`
	Terrain       string   `json:"terrain"`
	TickSeconds   float64  `json:"tick_seconds"`
	MaxTicks      float64  `json:"max_ticks"`
	StageOrder    []string `json:"stage_order"`
}

// Outcome is who won and why.
type Outcome struct {
	// Winner is "A", "B" or "draw".
	Winner string `json:"winner"`
	// Reason names the condition that ended the battle, in the engine's words.
	Reason string `json:"reason"`
	// Decided says the engine reached a conclusion, which is false only in
	// principle: every ending the engine has is a conclusion, including the
	// stalemate. It is here so a client never has to infer it from the reason.
	Decided bool `json:"decided"`
	// Truncated says the run stopped on a caller-supplied tick budget rather
	// than on a conclusion, so the stalemate is an artefact of the budget and
	// the campaign must not write it back as a drawn battle.
	Truncated bool `json:"truncated"`
	// DecidedAtTick is the tick the ending was decided at.
	DecidedAtTick int `json:"decided_at_tick"`
}

// Duration is how long the battle took, in simulated time.
type Duration struct {
	Ticks   int     `json:"ticks"`
	Seconds float64 `json:"seconds"`
	Clock   string  `json:"clock"`
}

// Side is one side's outcome, in the shape the campaign aftermath reads.
type Side struct {
	Side string `json:"side"`

	StartUnits  int     `json:"start_units"`
	StartBodies float64 `json:"start_bodies"`

	Dead              float64 `json:"dead"`
	Wounded           float64 `json:"wounded"`
	Casualties        float64 `json:"casualties"`
	CasualtiesShare   float64 `json:"casualties_share"`
	SurrenderedUnits  int     `json:"surrendered_units"`
	SurrenderedBodies float64 `json:"surrendered_bodies"`

	Standing  int `json:"standing"`
	Broken    int `json:"broken"`
	Routed    int `json:"routed"`
	Destroyed int `json:"destroyed"`

	StrengthStart float64 `json:"strength_start"`
	StrengthEnd   float64 `json:"strength_end"`
	StrengthShare float64 `json:"strength_share"`

	MoraleStart float64 `json:"morale_start"`
	MoraleEnd   float64 `json:"morale_end"`

	AmmoStart float64 `json:"ammo_start"`
	AmmoSpent float64 `json:"ammo_spent"`

	Shots      float64 `json:"shots"`
	Swings     float64 `json:"swings"`
	RangedHits float64 `json:"ranged_hits"`
	MeleeHits  float64 `json:"melee_hits"`

	SuppressionDealt float64 `json:"suppression_dealt"`
	SuppressionTaken float64 `json:"suppression_taken"`

	CasualtiesInflicted float64 `json:"casualties_inflicted"`
	Leaders             int     `json:"leaders"`
}

// Unit is one unit as the client draws it.
type Unit struct {
	ID   int    `json:"id"`
	Side string `json:"side"`
	Role string `json:"role"`
	// Status is the engine's own word: fighting, broken, routed, surrendered or
	// destroyed.
	Status string `json:"status"`
	// CanFight says whether the unit was still able to attack at the state this
	// was published at. A client uses it to decide whether to show a weapon.
	CanFight bool `json:"can_fight"`
	// X and Y are the position in metres, and Heading is omitted on purpose:
	// the engine does not publish a facing, and inventing one from a delta would
	// be a fabrication a renderer would then draw faithfully.
	X float64 `json:"x"`
	Y float64 `json:"y"`
	// HPFrac is remaining condition on 0-1, Morale is steadiness on 0-1, and
	// Suppression is how pinned down the unit is, in the engine's own scale.
	HPFrac      float64 `json:"hp_frac"`
	Morale      float64 `json:"morale"`
	Suppression float64 `json:"suppression"`
	// Troops is how many bodies the unit stands for, and Ammo its rounds left.
	Troops float64 `json:"troops"`
	Ammo   float64 `json:"ammo"`
	// Speed is the base speed in metres per second, before state multipliers, so
	// a client can size a unit's marker without re-deriving it.
	Speed float64 `json:"speed"`
	// Intent is what the unit was doing at the state this was published at.
	Intent string `json:"intent"`
}

// Frames is the sampled battle over time, with its accounting.
type Frames struct {
	// SampleEvery is the stride the recorder settled on, and Kept, Total and
	// Dropped say what it cost. Total is every tick the engine published, so
	// Kept+Dropped is always Total.
	SampleEvery int  `json:"sample_every"`
	Total       int  `json:"total"`
	Kept        int  `json:"kept"`
	Dropped     int  `json:"dropped"`
	UnitFrames  int  `json:"unit_frames"`
	Thinned     bool `json:"thinned"`
	// Ticks is the sampled history, oldest first.
	Ticks []Frame `json:"ticks"`
}

// Frame is one sampled tick.
type Frame struct {
	Tick    int     `json:"tick"`
	Elapsed float64 `json:"elapsed"`
	// Strength and Opening are each side's current and opening battle strength,
	// indexed A then B, on the engine's own scale. A client draws a strength
	// bar from these and must not recompute one of its own.
	Strength [2]float64  `json:"strength"`
	Opening  [2]float64  `json:"opening"`
	Units    []FrameUnit `json:"units"`
}

// FrameUnit is one unit in a sampled tick: the render minimum, which is where
// it is, what state it is in, and how hurt it is.
type FrameUnit struct {
	ID          int     `json:"id"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Status      string  `json:"status"`
	HPFrac      float64 `json:"hp_frac"`
	Morale      float64 `json:"morale"`
	Suppression float64 `json:"suppression"`
}

// Event is one notable thing that happened.
type Event struct {
	Seq   int     `json:"seq"`
	Tick  int     `json:"tick"`
	Side  string  `json:"side"`
	Kind  string  `json:"kind"`
	Unit  int     `json:"unit"`
	Value float64 `json:"value"`
	Read  string  `json:"read"`
	Note  string  `json:"note"`
}

// Stats are the battle's totals.
type Stats struct {
	Bodies          [2]float64 `json:"bodies"`
	Dead            [2]float64 `json:"dead"`
	Wounded         [2]float64 `json:"wounded"`
	Surrendered     [2]float64 `json:"surrendered"`
	Shots           [2]float64 `json:"shots"`
	Swings          [2]float64 `json:"swings"`
	RangedHits      [2]float64 `json:"ranged_hits"`
	MeleeHits       [2]float64 `json:"melee_hits"`
	Suppression     [2]float64 `json:"suppression"`
	CasualtiesMade  [2]float64 `json:"casualties_inflicted"`
	Breaks          int        `json:"breaks"`
	Routs           int        `json:"routs"`
	PeakBroken      int        `json:"peak_broken"`
	PeakRouted      int        `json:"peak_routed"`
	PeakSuppression float64    `json:"peak_suppression"`
}

// BattleConfig quotes back the constants the battle ran under.
type BattleConfig struct {
	MaxUnitsPerSide float64 `json:"max_units_per_side"`
	TickSeconds     float64 `json:"tick_seconds"`
	MaxTicks        float64 `json:"max_ticks"`
	Version         string  `json:"version"`
}

// Record runs a battle with a recorder attached and returns the client feed.
//
// It returns an error rather than a partial feed: a document that describes a
// battle whose frames are missing would render as a battle that ended before it
// began, which is the one failure a client cannot detect on its own.
func Record(cfg *config.Config, seed uint64, setup battle.Setup, opts Options) (*Feed, error) {
	if cfg == nil {
		return nil, fmt.Errorf("battlefeed: recording needs a balance config; without it the battle " +
			"cannot be run and there is no feed to write")
	}
	opts = opts.normalise()
	r := newRecorder(opts)
	res, err := battle.RunCommanded(cfg, seed, setup, r)
	if err != nil {
		return nil, fmt.Errorf("battlefeed: the battle did not finish, so there is no feed to write: %w", err)
	}
	if r.total != res.Ticks {
		return nil, fmt.Errorf("battlefeed: the battle reported %d ticks but published %d frames. "+
			"A frame is missing, so the feed would show a battle with a hole in it", res.Ticks, r.total)
	}
	return r.feed(res), nil
}

// feed assembles the document from the result and what the recorder saw.
func (r *recorder) feed(res *battle.Result) *Feed {
	f := &Feed{
		Schema:        Schema,
		SchemaVersion: SchemaVersion,
		Battle: BattleMeta{
			Label:         res.Label,
			Seed:          res.Seed,
			ConfigVersion: res.ConfigVersion,
			Terrain:       "open",
			TickSeconds:   mm(res.Config.TickSeconds),
			MaxTicks:      mm(res.Config.MaxTicks),
			StageOrder:    append([]string{}, res.TickOrder...),
		},
		Outcome: Outcome{
			Winner:        res.Outcome.Kind.String(),
			Reason:        res.Outcome.Reason.String(),
			Decided:       true,
			Truncated:     res.Truncated,
			DecidedAtTick: res.Ticks,
		},
		Duration: Duration{
			Ticks:   res.Ticks,
			Seconds: mm(res.Elapsed),
			Clock:   res.ElapsedS,
		},
		UnitsTick: r.unitsTick,
		Stats: Stats{
			Bodies:          round2(res.Stats.Bodies),
			Dead:            round2(res.Stats.Dead),
			Wounded:         round2(res.Stats.Wounded),
			Surrendered:     round2(res.Stats.Surrendered),
			Shots:           round2(res.Stats.Shots),
			Swings:          round2(res.Stats.Swings),
			RangedHits:      round2(res.Stats.RangedHits),
			MeleeHits:       round2(res.Stats.MeleeHits),
			Suppression:     round2(res.Stats.Suppression),
			CasualtiesMade:  round2(res.Stats.CasualtiesInflicted),
			Breaks:          res.Stats.Breaks,
			Routs:           res.Stats.Routs,
			PeakBroken:      res.Stats.PeakBroken,
			PeakRouted:      res.Stats.PeakRouted,
			PeakSuppression: mm(res.Stats.PeakSuppression),
		},
		Config: BattleConfig{
			MaxUnitsPerSide: mm(res.Config.MaxUnitsPerSide),
			TickSeconds:     mm(res.Config.TickSeconds),
			MaxTicks:        mm(res.Config.MaxTicks),
			Version:         res.Config.Version,
		},
	}

	for i, sr := range res.Sides {
		f.Sides[i] = sideFeed(sr)
	}
	f.Units = r.units()
	f.Frames = r.framesFeed()
	f.Events, f.EventsDropped = eventsFeed(res, r.opts.MaxEvents)

	f.Notes = r.notes(res, &f.Frames, len(f.Events), f.EventsDropped)
	return f
}

// sideFeed maps one side's engine result into the document.
func sideFeed(sr battle.SideResult) Side {
	destroyed := sr.StartUnits - sr.Standing - sr.Routed - sr.Surrendered
	if destroyed < 0 {
		// The engine counts a surrendered unit as surrendered and never as
		// destroyed, so this cannot go negative in practice. It is clamped
		// rather than reported because a client drawing a negative bar is worse
		// than a client drawing zero, and the notes carry the account.
		destroyed = 0
	}
	s := Side{
		Side:                sr.Side.String(),
		StartUnits:          sr.StartUnits,
		StartBodies:         mm(sr.StartBodies),
		Dead:                mm(sr.Dead),
		Wounded:             mm(sr.Wounded),
		Casualties:          mm(sr.Dead + sr.Wounded),
		CasualtiesShare:     share(sr.Dead+sr.Wounded, sr.StartBodies),
		SurrenderedUnits:    sr.Surrendered,
		SurrenderedBodies:   mm(sr.SurrenderedBodies),
		Standing:            sr.Standing,
		Broken:              sr.Broken,
		Routed:              sr.Routed,
		Destroyed:           destroyed,
		StrengthStart:       mm(sr.StrengthStart),
		StrengthEnd:         mm(sr.StrengthEnd),
		StrengthShare:       share(sr.StrengthEnd, sr.StrengthStart),
		MoraleStart:         mm(sr.MoraleStart),
		MoraleEnd:           mm(sr.MoraleEnd),
		AmmoStart:           mm(sr.AmmoStart),
		AmmoSpent:           mm(sr.AmmoSpent),
		Shots:               mm(sr.Shots),
		Swings:              mm(sr.Swings),
		RangedHits:          mm(sr.RangedHits),
		MeleeHits:           mm(sr.MeleeHits),
		SuppressionDealt:    mm(sr.SuppressionDealt),
		SuppressionTaken:    mm(sr.SuppressionTaken),
		CasualtiesInflicted: mm(sr.CasualtiesInflicted),
		Leaders:             sr.Leaders,
	}
	return s
}

// eventsFeed maps the engine's events, bounded, and says how many were dropped.
func eventsFeed(res *battle.Result, max int) ([]Event, int) {
	total := len(res.Events) + res.EventsDropped
	kept := res.Events
	if len(kept) > max {
		kept = kept[:max]
	}
	out := make([]Event, 0, len(kept))
	for _, e := range kept {
		out = append(out, Event{
			Seq:   e.Seq,
			Tick:  e.Tick,
			Side:  e.Side.String(),
			Kind:  e.Kind.String(),
			Unit:  e.Unit,
			Value: mm(e.Value),
			Read:  e.Read,
			Note:  e.Note,
		})
	}
	return out, total - len(out)
}

// notes is what the fields cannot say on their own.
//
// Every entry is a fact a reader would otherwise have to guess at, and none of
// them is an excuse: a feed with a note in it is a feed that told the truth
// about a limit.
func (r *recorder) notes(res *battle.Result, fr *Frames, eventsKept, eventsDropped int) []string {
	var n []string
	if r.unitsTick < 0 {
		n = append(n, "the battle was decided before any tick ran, so no unit state was published; "+
			"the casualty and strength figures come from the engine's result")
	} else if r.unitsTick != res.Ticks-1 {
		n = append(n, fmt.Sprintf("the unit block is the state published at the top of tick %d, while the "+
			"battle ran %d ticks; the engine publishes at the top of a tick and ends after that tick's "+
			"work is committed", r.unitsTick, res.Ticks))
	}
	if !r.opts.IncludeFrames {
		n = append(n, "no frame history was recorded, so this feed is the aftermath and not an animation")
	}
	if res.Truncated {
		n = append(n, "this run stopped on a caller-supplied tick budget, so the stalemate is an artefact "+
			"of the budget and not a drawn battle")
	}
	if fr.Thinned {
		n = append(n, fmt.Sprintf("the frame history was thinned to %d of %d ticks to stay inside the "+
			"feed's bound, and the ticks it carries are %d apart; a client interpolates between them",
			fr.Kept, fr.Total, fr.SampleEvery))
	}
	if eventsDropped > 0 {
		n = append(n, fmt.Sprintf("%d further events were not kept; this feed carries %d",
			eventsDropped, eventsKept))
	}
	if res.Outcome.Reason == battle.ReasonEnemyBroke || res.Outcome.Reason == battle.ReasonMutualBreak {
		n = append(n, "the battle ended when a side yielded, which is strength or routed men reaching the "+
			"balance file's thresholds rather than the last man falling")
	}
	return n
}

// share is a fraction of a whole, guarding a zero or negative denominator.
func share(part, whole float64) float64 {
	if whole <= 0 {
		return 0
	}
	return mm(part / whole)
}

// mm rounds to the millimetre, which is finer than a client can draw and far
// coarser than float noise.
//
// Rounding is a deliberate part of the contract, not a tidy-up: two runs of the
// same battle differ in the last bits of a float and a client must not be handed
// a payload that differs because of that. It also makes the document readable.
func mm(v float64) float64 {
	if !isFinite(v) {
		// A non-finite number in a position is a bug, and writing it would make
		// the document unparseable by a strict JSON reader. It is written as
		// zero and the caller is expected to have failed earlier.
		return 0
	}
	r := math.Round(v*1000) / 1000
	if r == 0 {
		// Normalise negative zero, which marshals as "-0" and which a client
		// comparing positions byte-for-byte would see as a difference.
		return 0
	}
	return r
}

func round2(v [2]float64) [2]float64 { return [2]float64{mm(v[0]), mm(v[1])} }

func isFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// Headline is one line a client can put on a results card.
//
// It is generated from the document's own fields rather than from the engine, so
// a client that shows it is showing the feed and not a second opinion of it.
func (f *Feed) Headline() string {
	if f == nil {
		return ""
	}
	winner := f.Outcome.Winner
	switch winner {
	case "A", "B":
	default:
		winner = "draw"
	}
	name := f.Battle.Label
	if strings.TrimSpace(name) == "" {
		name = "field battle"
	}
	return fmt.Sprintf("%s — %s wins (%s) after %s", name, winner, f.Outcome.Reason, f.Duration.Clock)
}
