package formation

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Config holds every tunable number the formation code uses. All of them come
// from the [formation] section of config/balance.toml — CONSTITUTION.md
// section 1.2, no number hides in code. There are no defaults: a key that is
// absent from the file is an error, because a silently defaulted constant is
// the exact failure that rule exists to prevent. A caller that wants different
// spacing or different speeds edits the file and the change is logged in
// CHANGELOG.md with the runs that motivated it.
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

// requiredFormationKeys lists every key the [formation] section must define,
// in the order Validate reports them missing. It is the contract between this
// package and the balance file, written out in full so that a missing key is
// named rather than left at zero.
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

// bound is a required range for one key. Validate applies these, so a typo in
// the balance file that produces a nonsensical shape is caught at load time
// rather than as a formation that stretches to the horizon.
type bound struct {
	key string
	lo  float64
	hi  float64
}

// configBounds are the ranges this package enforces. They are the same ranges
// the balance file's comments quote, and they are enforced in code because a
// comment does not stop anyone typing a value.
//
// loose_seed is deliberately absent: it has no range, because any integer is a
// legal seed and clamping one would be inventing a rule. Where a range starts
// at zero, zero is a legal value and means what the balance file's comment
// says it means, not that the key is missing.
var configBounds = []bound{
	{"front_spacing", 0.3, 10},
	{"rank_spacing", 0.3, 50},
	{"line_front_width", 1, 60},
	{"column_front_width", 1, 30},
	{"wedge_tip_units", 1, 9},
	{"wedge_row_growth", 1, 12},
	{"loose_spacing", 1, 60},
	{"loose_jitter_fraction", 0, 0.45},
	{"min_separation", 0.1, 20},
	{"separation_iterations", 0, 16},
	{"separation_push_fraction", 0, 0.5},
	{"separation_push_max", 0.01, 5},
	{"hold_speed", 0.05, 8},
	{"advance_speed", 0.05, 8},
	{"charge_speed", 0.05, 12},
	{"flank_speed", 0.05, 10},
	{"retreat_speed", 0.05, 10},
	{"turn_rate", 0.05, 12},
	{"face_turn_rate_scale", 0.05, 6},
	{"face_enemy_weight", 0, 1},
	{"advance_standoff", 0, 2000},
	{"charge_standoff", 0, 500},
	{"retreat_distance", 0, 5000},
	{"flank_standoff", 0, 2000},
	{"flank_sweep_deg", 1, 180},
	{"flank_sweep_rate_deg", 0.1, 90},
}

// LooseSeedInt returns the loose-order scatter seed as an integer. The
// balance file stores every value as a number, so the seed arrives as a float
// and is converted once, here, rather than being cast at every use site.
func (c Config) LooseSeedInt() int64 { return int64(c.LooseSeed) }

// values returns every key this package reads, keyed exactly as the balance
// file spells them. It is the single mapping from key name to field, so the
// loader, the validator, and the printer cannot disagree about what a key is
// called — a mapping written out three times is a mapping that will be wrong
// once.
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

// Validate reports every value outside the range the balance file documents.
//
// It deliberately does not try to tell a missing key from a zero value. Load
// does that, and it does it exactly, because Load can see which keys the file
// actually wrote. Eight of these keys have a documented minimum of zero — a
// jitter of 0 is a clean lattice, a separation pass of 0 is switched off, a
// standoff of 0 is "walk right in", a face weight of 0 is "face the way you
// march" — so a zero is a legal answer to a question, not evidence of an
// absent one. A Config that has never been filled in at all is still refused
// here, because a spacing, a width, or a speed of zero is outside its own
// range.
func (c Config) Validate() error {
	present := c.values()
	for _, b := range configBounds {
		v := present[b.key]
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errorf("Validate", b.key, "%v is not a finite number this package can use", v)
		}
		if v < b.lo || v > b.hi {
			return errorf("Validate", b.key, "%g is outside its documented range [%g, %g]",
				v, b.lo, b.hi)
		}
	}
	// loose_seed is the one key with no range, because every integer is a legal
	// seed. It is still checked for being a number, since a non-finite seed
	// converted to an integer is a nonsense scatter rather than a different
	// scatter.
	if math.IsNaN(c.LooseSeed) || math.IsInf(c.LooseSeed, 0) {
		return errorf("Validate", "loose_seed", "%v is not a finite number this package can use", c.LooseSeed)
	}
	// min_separation is the gap the spacing pass defends. If it is larger than
	// the gap the shapes actually use, the pass would spend every tick shoving
	// men off the slot they are trying to reach, and the formation would never
	// form up. The tightest gap a shape produces is the smaller of the abreast
	// spacing and the rank spacing, or in loose order the lattice spacing less
	// the scatter from both sides.
	tightest := math.Min(c.FrontSpacing, c.RankSpacing)
	tightest = math.Min(tightest, c.LooseSpacing*(1-2*c.LooseJitterFraction))
	if c.MinSeparation > tightest {
		return errorf("Validate", "min_separation",
			"%g is wider than the tightest gap any shape produces (%g), so the spacing pass would fight the shape itself",
			c.MinSeparation, tightest)
	}
	return nil
}

// Load reads the [formation] section of a balance file.
//
// It reads only that section and deliberately does not import
// internal/config. Importing another internal package is the coupling
// CONSTITUTION.md section 2.1 forbids, and it would drag the whole world model
// into a package that only needs twenty-seven numbers.
//
// The consequence, which is not hidden: internal/config refuses to start if
// the balance file contains a key no system claims, so the [formation] keys
// must also be declared there before the campaign runner will run. That
// declaration is a name in a table, not a call: the two loaders stay
// independent, each file section has one owner, and either loader fails loudly
// rather than inventing a value for a key it cannot find.
func Load(path string) (Config, error) {
	values, err := readSection(path, "formation")
	if err != nil {
		return Config{}, err
	}
	var missing []string
	get := func(key string) float64 {
		v, ok := values[key]
		if !ok {
			missing = append(missing, key)
			return 0
		}
		return v
	}
	c := Config{
		FrontSpacing:           get("front_spacing"),
		RankSpacing:            get("rank_spacing"),
		LineFrontWidth:         get("line_front_width"),
		ColumnFrontWidth:       get("column_front_width"),
		WedgeTipUnits:          get("wedge_tip_units"),
		WedgeRowGrowth:         get("wedge_row_growth"),
		LooseSpacing:           get("loose_spacing"),
		LooseJitterFraction:    get("loose_jitter_fraction"),
		LooseSeed:              get("loose_seed"),
		MinSeparation:          get("min_separation"),
		SeparationIterations:   get("separation_iterations"),
		SeparationPushFraction: get("separation_push_fraction"),
		SeparationPushMax:      get("separation_push_max"),
		HoldSpeed:              get("hold_speed"),
		AdvanceSpeed:           get("advance_speed"),
		ChargeSpeed:            get("charge_speed"),
		FlankSpeed:             get("flank_speed"),
		RetreatSpeed:           get("retreat_speed"),
		TurnRate:               get("turn_rate"),
		FaceTurnRateScale:      get("face_turn_rate_scale"),
		FaceEnemyWeight:        get("face_enemy_weight"),
		AdvanceStandoff:        get("advance_standoff"),
		ChargeStandoff:         get("charge_standoff"),
		RetreatDistance:        get("retreat_distance"),
		FlankStandoff:          get("flank_standoff"),
		FlankSweepDeg:          get("flank_sweep_deg"),
		FlankSweepRateDeg:      get("flank_sweep_rate_deg"),
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return Config{}, errorf("Load", "[formation]", "%s is missing required keys: %s",
			path, strings.Join(missing, ", "))
	}
	// A stray key in the section is nearly always a typo, and a typo means the
	// constant the designer meant to change is not being read at all.
	var extra []string
	for k := range values {
		if !isRequiredKey(k) {
			extra = append(extra, k)
		}
	}
	if len(extra) > 0 {
		sort.Strings(extra)
		return Config{}, errorf("Load", "[formation]", "%s has keys no code reads (typo or dead constant): %s",
			path, strings.Join(extra, ", "))
	}
	if err := c.Validate(); err != nil {
		return Config{}, errorf("Load", path, "%v", err)
	}
	return c, nil
}

// LoadDefault reads the balance file that ships with the simulation, from the
// config directory beside the service. It is the path the runner and the tests
// use, so a battle reads the same constants a campaign does.
func LoadDefault() (Config, error) {
	return Load(filepath.Join("config", "balance.toml"))
}

func isRequiredKey(key string) bool {
	for _, k := range requiredFormationKeys {
		if k == key {
			return true
		}
	}
	return false
}

// readSection parses one [section] of a balance file into its key/value pairs.
//
// The grammar is the same deliberately boring subset internal/config uses —
// comments with #, [section] headers, key = number — parsed here rather than
// pulled from a library because the simulation carries no third-party
// dependencies. Sections other than the one asked for are skipped, not
// interpreted: this package has no business reading the price of wheat, and
// reading it would only give it a second opinion about numbers it does not
// own.
func readSection(path, want string) (map[string]float64, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, errorf("readSection", path, "cannot read the balance file: %v", err)
	}
	values := map[string]float64{}
	lines := map[string]int{}
	inSection := false
	found := false
	for i, line := range strings.Split(string(raw), "\n") {
		lineno := i + 1
		text := strings.TrimSpace(line)
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		if strings.HasPrefix(text, "[") {
			if !strings.HasSuffix(text, "]") {
				return nil, errorf("readSection", path, "line %d: unterminated section header %q", lineno, text)
			}
			inSection = strings.TrimSpace(text[1:len(text)-1]) == want
			found = found || inSection
			continue
		}
		if !inSection {
			continue
		}
		eq := strings.Index(text, "=")
		if eq < 0 {
			return nil, errorf("readSection", path, "line %d: expected key = value, got %q", lineno, text)
		}
		key := strings.TrimSpace(text[:eq])
		val := strings.TrimSpace(stripComment(text[eq+1:]))
		if key == "" {
			return nil, errorf("readSection", path, "line %d: empty key", lineno)
		}
		if _, dup := values[key]; dup {
			return nil, errorf("readSection", path, "line %d: duplicate key %q", lineno, key)
		}
		n, err := strconv.ParseFloat(val, 64)
		if err != nil {
			return nil, errorf("readSection", path, "line %d: %q is not a number for key %q", lineno, val, key)
		}
		values[key] = n
		lines[key] = lineno
	}
	if !found {
		return nil, errorf("readSection", path, "no [%s] section, so the formation constants are nowhere to be found", want)
	}
	return values, nil
}

// stripComment removes a trailing # comment that is not inside quotes.
func stripComment(s string) string {
	inQuote := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			inQuote = !inQuote
		case '#':
			if !inQuote {
				return strings.TrimSpace(s[:i])
			}
		}
	}
	return strings.TrimSpace(s)
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
