package formation

import (
	"fmt"
	"math"
	"strings"

	"mbclone/simulation/internal/config"
)

// Config holds every tunable number the formation code uses. All of them come
// from the [formation] section of config/balance.toml — CONSTITUTION.md
// section 1.2, no number hides in code. There are no defaults: a key that is
// absent from the file is an error, because a silently defaulted constant is
// the exact failure that rule exists to prevent. A caller that wants different
// spacing or different speeds edits the file and the change is logged in
// CHANGELOG.md with the runs that motivated it.
//
// The values arrive through FromCentral, which copies them out of the one
// loader the simulation uses. This package used to parse the [formation] section
// itself, and that is what made the balance file unloadable: internal/config
// rejects a balance file containing a key no caller claimed, so a section
// read by a second private parser either stopped the campaign runner from
// starting or had to be claimed in internal/config without ever being read.
// One file, one loader, one table of keys.
//
// Reading a constant is not a system calling another system
// (CONSTITUTION.md section 2.1). internal/config is the loader for the whole
// simulation, not one of the systems in CAUSE_EFFECT.md section 3, and
// internal/battle reads its own constants the same way. What this package owns
// is what these numbers mean and how a body of men is arranged from them.
type Config struct {
	// FrontSpacing is the metres between two men abreast in the same rank, for
	// line, column, and wedge. It is the shoulder-to-shoulder gap of troops
	// standing side by side, not the distance a man can shoot past his
	// neighbour.
	FrontSpacing float64
	// RankSpacing is the metres of depth between one rank and the next, shared
	// by line, column, and wedge. It is the room a rank needs to form up and
	// move off. A formation with a real-world reason to be deeper (a wedge
	// driving through a gap, say) can be given its own knob here.
	RankSpacing float64

	// LineFrontWidth is how many men stand abreast in one rank of a line. The
	// rest of the line goes into further ranks behind, so a bigger number is a
	// wider and shallower line, which fires more but arrives less deep.
	LineFrontWidth float64
	// ColumnFrontWidth is how many men stand abreast in a column. A column is
	// narrow and deep: fast to move, and able to use a road, at the cost of
	// almost no firepower to the front.
	ColumnFrontWidth float64
	// WedgeTipUnits is how many men form the point of a wedge. One is a true
	// point, which is what a wedge is for; more than one is a blunt nose, and
	// is honest about being blunt.
	WedgeTipUnits float64
	// WedgeRowGrowth is how many men are added to each side of the wedge for
	// every rank back from the point. Two gives a 45-degree wedge, one a
	// narrow column of a shape, and five a very broad, slow arrow.
	WedgeRowGrowth float64

	// LooseSpacing is the metres between neighbours in loose order. It is
	// much larger than front spacing: the whole point of loose order is that
	// one burst cannot hit ten men standing in a file.
	LooseSpacing float64
	// LooseJitterFraction is how far a man may be pushed off his loose-order
	// lattice point, as a fraction of loose spacing. The scatter is what makes
	// loose order look loose instead of like a grid with holes. It is bounded
	// below 0.5 because past that, neighbours can collide.
	LooseJitterFraction float64
	// LooseSeed is the seed for the deterministic scatter of loose order. It
	// is data, not state: the same seed and the same men always produce the
	// same scatter, so a recorded battle replays exactly and no RNG state has
	// to travel with the snapshot.
	LooseSeed float64

	// MinSeparation is the smallest gap the spacing pass will allow between
	// any two men in a formation. Below it they are pushed apart. It is what
	// keeps a formation a formation after men have been shoved, pushed, or
	// run through by the fighting.
	MinSeparation float64
	// SeparationIterations is how many passes the spacing pass makes per tick.
	// One pass resolves a single pair; a crowd needs more. Zero disables the
	// pass, which is only honest if nothing can push men into each other.
	SeparationIterations float64
	// SeparationPushFraction is the share of an overlap resolved per pass.
	// Half or less is stable: resolving more than half of an overlap in one go
	// overshoots and the formation oscillates.
	SeparationPushFraction float64
	// SeparationPushMax caps how far one pass may move one man, in metres.
	// Without the cap, a heavy overlap in a single tick would fire men across
	// the field, which looks like teleportation and is not what a man does.
	SeparationPushMax float64

	// HoldSpeed is the walking speed, in metres per second, a formation uses
	// to walk back into its slots while holding. It is a shuffle, not a march.
	HoldSpeed float64
	// AdvanceSpeed is the closing speed for an advance. An adult walking
	// unloaded covers roughly 1.4 m/s, and a formation that could not hold
	// that pace could not cross a field.
	AdvanceSpeed float64
	// ChargeSpeed is the closing speed for a charge. This is a run, and the
	// whole difference between an advance and a charge is here and in the
	// standoff they stop at.
	ChargeSpeed float64
	// FlankSpeed is the speed of a flanking move: faster than an advance,
	// because the whole value of a flank is arriving before they are ready,
	// and slower than a charge, because men running to a flank arrive as a
	// mob rather than a formation.
	FlankSpeed float64
	// RetreatSpeed is the speed of a withdrawal. It is faster than a march,
	// because nobody is waiting for anyone.
	RetreatSpeed float64
	// TurnRate is the radians per second a nominal man turns at agility 1.0.
	TurnRate float64
	// FaceTurnRateScale scales turn rate when a man is squaring up to the
	// enemy rather than following his march order. A man pivots on the spot
	// far faster than he changes direction on the move.
	FaceTurnRateScale float64
	// FaceEnemyWeight is how strongly a man faces the enemy rather than the
	// way he is walking, from 0 (follow the march) to 1 (square up). At 1 a
	// man retreating still has his front on the enemy.
	FaceEnemyWeight float64

	// AdvanceStandoff is the distance from the enemy, in metres, at which an
	// advancing formation stops closing and waits. It is a firing distance:
	// the line arrives in order and then shoots, instead of arriving as a
	// crowd and shooting from wherever it stopped.
	AdvanceStandoff float64
	// ChargeStandoff is the distance at which a charge stops closing, in
	// metres. Small, because a charge ends with men in contact.
	ChargeStandoff float64
	// RetreatDistance is how far back, in metres, a fall-back order pulls the
	// formation. It is re-evaluated every tick, so a formation that is still
	// ordered to fall back keeps falling back as the enemy advances.
	RetreatDistance float64
	// FlankStandoff is the clearance, in metres, beyond the enemy's own depth
	// that a flanking formation stands off at before turning in. Turning in
	// from inside the enemy's depth is not a flank, it is a collision.
	FlankStandoff float64
	// FlankSweepDeg is how far around the enemy's front, in degrees, a flank
	// order swings before the formation turns in and attacks.
	FlankSweepDeg float64
	// FlankSweepRateDeg is how fast that swing happens, in degrees per second
	// of simulated time. The sweep is therefore a rate, not a jump: a
	// formation walks the arc around the enemy and arrives at the flank having
	// gone round, which is what a flanking march looks like from above.
	FlankSweepRateDeg float64
}

// requiredFormationKeys lists every key the [formation] section defines, in
// balance-file key order. It is the order String prints them in, so a test that
// reports which constants produced an unexpected run reads in the same order
// the file lists them.
//
// It is no longer a list of keys this package fetches: internal/config fetches
// them, and it names a key the file lacks in a MissingError and a key in the
// file that nobody claimed in finish(). Drift between this list and the loader's
// table therefore still fails at load, naming the key.
var requiredFormationKeys = []string{
	"front_spacing",
	"rank_spacing",
	"line_front_width",
	"column_front_width",
	"wedge_tip_units",
	"wedge_row_growth",
	"loose_spacing",
	"loose_jitter_fraction",
	"loose_seed",
	"min_separation",
	"separation_iterations",
	"separation_push_fraction",
	"separation_push_max",
	"hold_speed",
	"advance_speed",
	"charge_speed",
	"flank_speed",
	"retreat_speed",
	"turn_rate",
	"face_turn_rate_scale",
	"face_enemy_weight",
	"advance_standoff",
	"charge_standoff",
	"retreat_distance",
	"flank_standoff",
	"flank_sweep_deg",
	"flank_sweep_rate_deg",
}

// LooseSeedInt returns the loose-order scatter seed as an integer. The
// balance file stores every value as a number, so the seed arrives as a float
// and is converted once, here, rather than being cast at every use site.
func (c Config) LooseSeedInt() int64 { return int64(c.LooseSeed) }

// values returns every key this package reads, keyed exactly as the balance
// file spells them. It is the single mapping from key name to field, so the
// printer and the checks below cannot disagree about what a key is called — a
// mapping written out twice is a mapping that will be wrong once.
func (c Config) values() map[string]float64 {
	return map[string]float64{
		"front_spacing":            c.FrontSpacing,
		"rank_spacing":             c.RankSpacing,
		"line_front_width":         c.LineFrontWidth,
		"column_front_width":       c.ColumnFrontWidth,
		"wedge_tip_units":          c.WedgeTipUnits,
		"wedge_row_growth":         c.WedgeRowGrowth,
		"loose_spacing":            c.LooseSpacing,
		"loose_jitter_fraction":    c.LooseJitterFraction,
		"loose_seed":               c.LooseSeed,
		"min_separation":           c.MinSeparation,
		"separation_iterations":    c.SeparationIterations,
		"separation_push_fraction": c.SeparationPushFraction,
		"separation_push_max":      c.SeparationPushMax,
		"hold_speed":               c.HoldSpeed,
		"advance_speed":            c.AdvanceSpeed,
		"charge_speed":             c.ChargeSpeed,
		"flank_speed":              c.FlankSpeed,
		"retreat_speed":            c.RetreatSpeed,
		"turn_rate":                c.TurnRate,
		"face_turn_rate_scale":     c.FaceTurnRateScale,
		"face_enemy_weight":        c.FaceEnemyWeight,
		"advance_standoff":         c.AdvanceStandoff,
		"charge_standoff":          c.ChargeStandoff,
		"retreat_distance":         c.RetreatDistance,
		"flank_standoff":           c.FlankStandoff,
		"flank_sweep_deg":          c.FlankSweepDeg,
		"flank_sweep_rate_deg":     c.FlankSweepRateDeg,
	}
}

// FromCentral copies the twenty-seven [formation] constants out of the loaded
// balance config into this package's own Config.
//
// It is a field-by-field copy rather than a type conversion so that the two
// structs can diverge without a silent reinterpretation: adding a knob here
// means adding it there, and forgetting leaves it at zero, which the checks
// below refuse rather than accept.
//
// The central loader has already enforced the documented range of every key
// that has one, and has already refused a file missing any of them, so this
// function does not repeat that work. What it does do is refuse a Config that
// was never filled in at all, because a spacing, a width, or a speed of zero is
// outside its own range and would otherwise produce a formation that stands
// nowhere and moves at nothing. A Config that fails Validate is refused, not
// returned half-built.
func FromCentral(c *config.Config) (Config, error) {
	out := Config{
		FrontSpacing:           c.Formation.FrontSpacing,
		RankSpacing:            c.Formation.RankSpacing,
		LineFrontWidth:         c.Formation.LineFrontWidth,
		ColumnFrontWidth:       c.Formation.ColumnFrontWidth,
		WedgeTipUnits:          c.Formation.WedgeTipUnits,
		WedgeRowGrowth:         c.Formation.WedgeRowGrowth,
		LooseSpacing:           c.Formation.LooseSpacing,
		LooseJitterFraction:    c.Formation.LooseJitterFraction,
		LooseSeed:              c.Formation.LooseSeed,
		MinSeparation:          c.Formation.MinSeparation,
		SeparationIterations:   c.Formation.SeparationIterations,
		SeparationPushFraction: c.Formation.SeparationPushFraction,
		SeparationPushMax:      c.Formation.SeparationPushMax,
		HoldSpeed:              c.Formation.HoldSpeed,
		AdvanceSpeed:           c.Formation.AdvanceSpeed,
		ChargeSpeed:            c.Formation.ChargeSpeed,
		FlankSpeed:             c.Formation.FlankSpeed,
		RetreatSpeed:           c.Formation.RetreatSpeed,
		TurnRate:               c.Formation.TurnRate,
		FaceTurnRateScale:      c.Formation.FaceTurnRateScale,
		FaceEnemyWeight:        c.Formation.FaceEnemyWeight,
		AdvanceStandoff:        c.Formation.AdvanceStandoff,
		ChargeStandoff:         c.Formation.ChargeStandoff,
		RetreatDistance:        c.Formation.RetreatDistance,
		FlankStandoff:          c.Formation.FlankStandoff,
		FlankSweepDeg:          c.Formation.FlankSweepDeg,
		FlankSweepRateDeg:      c.Formation.FlankSweepRateDeg,
	}
	return out, out.Validate()
}

// Validate refuses a Config that was never filled in from the balance file.
//
// Every entry point in this package calls it first, because the failure it
// catches is the one CONSTITUTION.md section 1.2 exists to prevent: a constant
// nobody set, quietly read as zero, producing a formation whose men stand on top
// of each other and never move. A spacing, a width, and a speed are all non-zero
// in any balance file, so an all-zero table means the file was never read.
//
// It deliberately does NOT repeat the per-key ranges. Those live in exactly one
// place — internal/config's validate, which enforces the bounds documented
// beside each key in balance.toml — and a second copy of twenty-six bounds in
// this package is a second opinion about the same numbers, which is how a
// balance file ends up legal in one loader and refused in the other.
//
// It also does not try to tell a missing key from a zero value, because that is
// no longer its business: internal/config names a key the file lacks in a
// MissingError, before a Config is ever built. Nine of these keys document zero
// as a legal setting — a jitter of 0 is a clean lattice, a separation pass of 0
// is switched off, a standoff of 0 is "walk right in", a face weight of 0 is
// "face the way you march" — so a zero is an answer to a question, not evidence
// of an absent one.
func (c Config) Validate() error {
	present := c.values()
	set := 0
	for _, key := range requiredFormationKeys {
		v := present[key]
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errorf("Validate", key, "%v is not a finite number this package can use", v)
		}
		if v != 0 {
			set++
		}
	}
	if set == 0 {
		return errorf("Validate", "[formation]",
			"every one of the %d formation constants is zero, so no balance file was read; "+
				"load config/balance.toml and pass it through FromCentral", len(requiredFormationKeys))
	}
	// min_separation is the gap the spacing pass defends. internal/config
	// refuses a file where it exceeds the tightest gap any shape produces; it
	// is repeated here so a Config edited in code after loading cannot spend
	// every tick shoving men off the slot they are trying to reach.
	tightest := math.Min(c.FrontSpacing, c.RankSpacing)
	tightest = math.Min(tightest, c.LooseSpacing*(1-2*c.LooseJitterFraction))
	if c.MinSeparation > tightest {
		return errorf("Validate", "min_separation",
			"%g is wider than the tightest gap any shape produces (%g), so the spacing pass would fight the shape itself",
			c.MinSeparation, tightest)
	}
	return nil
}

// speedFor returns the movement speed, in metres per second, an order uses. It
// is a lookup, not a formula, so every order's pace is a number a designer set
// in the balance file rather than something that emerges from arithmetic on
// other numbers.
func speedFor(o Order, c Config) (float64, error) {
	switch o {
	case OrderHold:
		return c.HoldSpeed, nil
	case OrderAdvance:
		return c.AdvanceSpeed, nil
	case OrderCharge:
		return c.ChargeSpeed, nil
	case OrderFlankLeft, OrderFlankRight:
		return c.FlankSpeed, nil
	case OrderRetreat:
		return c.RetreatSpeed, nil
	default:
		return 0, errorf("speedFor", "order", "%v is not implemented, so it has no speed", o)
	}
}

// String renders a config as key = value lines in balance-file key order, so
// a test can print exactly which constants produced a run that behaved in a
// way nobody expected.
func (c Config) String() string {
	values := c.values()
	parts := make([]string, 0, len(requiredFormationKeys))
	for _, k := range requiredFormationKeys {
		parts = append(parts, fmt.Sprintf("%s=%g", k, values[k]))
	}
	return "formation.Config{" + strings.Join(parts, " ") + "}"
}
