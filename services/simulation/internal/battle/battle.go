package battle

import (
	"fmt"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/rng"
)

// Terrain is the ground a battle is fought on.
//
// Only TerrainOpen is modelled. The other COMBAT.md section 8 cases exist as
// named values so that a caller who wants one gets a named error rather than a
// field that is silently ignored, which is CONSTITUTION.md section 1.3's exact
// prohibition.
type Terrain int

const (
	// TerrainOpen is level ground with no cover. It is the whole of what this
	// core simulates.
	TerrainOpen Terrain = iota
	// TerrainForest, TerrainUrban, TerrainHill, and TerrainFortified are
	// COMBAT.md section 8's cases. Requesting one returns
	// ErrTerrainUnsupported.
	TerrainForest
	TerrainUrban
	TerrainHill
	TerrainFortified
)

// String names the terrain.
func (t Terrain) String() string {
	switch t {
	case TerrainOpen:
		return "open"
	case TerrainForest:
		return "forest"
	case TerrainUrban:
		return "urban"
	case TerrainHill:
		return "hill"
	case TerrainFortified:
		return "fortified"
	default:
		return "unknown"
	}
}

// Setup is everything a battle needs to start.
//
// It is data, not behaviour: the engine reads it once and never again, which is
// what makes a battle reproducible from its setup and its seed alone.
//
// Nothing here is a limit on size. A hundred units and a hundred thousand are
// the same call with different slices.
type Setup struct {
	// A and B are the two forces. Each is a slice of units; Run validates
	// every field and rejects anything unusable rather than repairing it.
	A []Unit
	B []Unit

	// Leaders are the commanders on the field. A leader steadies nearby units
	// through battle.morale_leader_bonus; it cannot be attacked, which both
	// this comment and the Leader type say out loud rather than leaving a
	// caller to find out from a battle report.
	Leaders []Leader

	// Terrain names the ground. Only TerrainOpen is supported.
	Terrain Terrain

	// Label names the battle in the result and in event messages. It is free
	// text and is never parsed.
	Label string
}

// Stats holds the running totals of a battle.
type Stats struct {
	// Bodies is the total bodies a side started with, indexed by side.
	Bodies [2]float64
	// Dead and Wounded are the bodies removed from the fight, indexed by side.
	// Wounded includes men who would later recover: they are out of THIS
	// battle, not dead, and the aftermath needs both numbers to know whether a
	// battle cost a side thirty dead men or three hundred.
	Dead, Wounded [2]float64
	// Surrendered is how many UNITS gave themselves up, indexed by side, not
	// how many bodies: one officer speaks for a squad, and the prisoners
	// column of an aftermath is counted in men anyway.
	Surrendered [2]float64
	// Shots and Swings are the attacks made, indexed by side.
	Shots, Swings [2]float64
	// MeleeHits and RangedHits are the attacks that connected.
	MeleeHits, RangedHits [2]float64
	// Suppression is the total suppression inflicted, for comparing two fires.
	Suppression [2]float64
	// CasualtiesInflicted is the bodies one side destroyed on the other.
	CasualtiesInflicted [2]float64
	// Breaks and Routs are how many units broke and how many routed over the
	// whole battle, counted at commit. They are not the same as the peaks: a
	// unit that broke and rallied and broke again counts three times here, which
	// is the honest reading, because that is how many separate decisions its
	// officers had to make.
	Breaks, Routs int
	// PeakBroken and PeakRouted are the largest simultaneous counts of units in
	// each state. A report wants to know how many men were shaking at once, not
	// only how many decisions were made.
	PeakBroken, PeakRouted int
	// PeakSuppression is the highest suppression any single unit reached.
	PeakSuppression float64
}

// index maps a Side to its Stats array slot.
func (s Side) index() int {
	switch s {
	case SideA:
		return 0
	case SideB:
		return 1
	default:
		return -1
	}
}

// Battle is the mutable state of a running fight. One of these exists for the
// duration of a Run and is never returned, so a caller cannot read a
// half-finished tick.
type Battle struct {
	// cfg is the whole balance config. Only cfg.Battle is read here; nothing in
	// this package touches a campaign system's constants, so the battle layer
	// is not coupled to any of them (CONSTITUTION.md section 2.1).
	cfg *config.Config
	// c is cfg.Battle, hoisted so the hot loops chase one pointer.
	c config.Battle

	// seed is the caller's seed, recorded in the result so a run can be
	// reproduced.
	seed uint64
	// rng is the master stream. Each stage of each tick derives its own named
	// substream from it, in the pattern the campaign engine uses, so a draw
	// added to one stage does not shift another's sequence.
	rng *rng.Rng
	// label is the battle's name, for reports.
	label string

	// units is every unit on the field, in ascending id order, which is the
	// iteration order every loop uses.
	units []*Unit
	// byID indexes units by id for target resolution. A slice, not a map,
	// because ids are dense and assigned in order: this is a bounds check and
	// a load, where a map lookup is neither.
	byID []*Unit
	// leaders are the commanders, in the order supplied, with ids assigned.
	leaders []Leader
	// covers are the destructible obstacles on the field: fences, walls,
	// vehicles. The aimed-fire stage reads them for interception and writes
	// HP damage to them directly; it is the only stage that touches them, so
	// no staging buffer is needed. A test or a scenario sets them up before
	// the battle runs.
	covers []Cover
	// shotEvents is the per-tick buffer of shot event bundles. The aimed-fire
	// stage appends here rather than emitting directly, and the commit flushes
	// them at a fixed point. Emitting straight from the stage would interleave
	// shot events with morale events in stage-execution order, which would
	// make the event log depend on the stage order and break the decoupling
	// the stage-order test pins down.
	shotEvents []Event

	// meleeHash and fireHash are the two spatial hashes, rebuilt once per tick
	// from committed state before any stage reads them.
	meleeHash *hash
	fireHash  *hash

	// snap is the snapshot every stage reads. Allocated once, one entry per
	// unit, refilled at the top of each tick.
	snap []snapshot
	// deltas is the per-tick staging buffer, reset at the top of each tick.
	deltas []delta
	// formations is the shape each unit was last ordered into, published by the
	// command seam and read by the melee and aimed-fire stages. It is reset at
	// the top of every tick, so a unit nobody commanded this tick is in no shape
	// rather than in whatever shape it was in last tick: a formation effect that
	// outlived the order that caused it would be a bonus a man kept for the rest
	// of the battle after his officer had broken his line up.
	formations []formationState

	// meleeScratch and fireScratch are reused candidate buffers, so a tick
	// allocates nothing at all once the battle is under way.
	meleeScratch, fireScratch []int
	// attackerCount is the melee stage's concentration counter, indexed by id.
	attackerCount []int
	// contact is, for every unit, whether a living enemy of its own side is
	// within a swing of it, recomputed once per tick by markContact before the
	// intent stage reads it. It exists because two questions are asked of it and
	// neither should pay for the other: the intent stage needs it to decide
	// whether a unit is in contact, and the rank-blocking rule needs it to ask
	// whether a friendly in front of it has already reached the enemy.
	contact []bool
	// leaderScratch holds candidate leader ids for the morale stage.
	leaderScratch []int

	// tickNo is the number of ticks completed. It is not called tick because the
	// step method is, and a field and a method sharing a name would shadow.
	tickNo int
	// elapsed is the simulated seconds elapsed.
	elapsed float64

	// strengthStartA and strengthStartB are the sides' opening battle
	// strength, measured the same way as current strength so every later
	// comparison is a share of what was actually there.
	strengthStartA, strengthStartB float64

	// stats accumulates the run's totals, so the result is assembled from what
	// happened rather than recomputed at the end by a second and possibly
	// different set of rules.
	stats Stats

	// events are the notable things that happened, bounded by
	// battle.max_report_events, and eventsDropped counts what did not fit.
	events        []Event
	eventsDropped int
	// maxEvents is that bound, copied from the config at construction so the
	// hot path reads a field rather than reaching through the config every event.
	maxEvents int

	// hooks is the optional command seam, and nil on any battle nobody is
	// commanding. It carries the commander and the buffers it writes orders
	// through; the whole of it lives in command.go so the seam is one file to
	// read and one line of this loop to follow.
	hooks *commandHooks
}

// tickOrder names the stages of a tick in the order they run. It is the
// documented system order required by SPEC.md section 4 and CONSTITUTION.md
// section 2.1, and it is a value rather than a comment so a report can print it
// and a test can assert it.
//
// # WHAT THE ORDER DOES AND DOES NOT BUY, WHICH IS NOT NOTHING
//
// Three of these five stages are independent of the others and two of them are
// not, and it used to be claimed here that all five were.
//
// The intent stage and the morale stage read the snapshot taken at the top of the
// tick and write deltas nothing else reads, so they can be moved anywhere in the
// tick without changing a battle. The targeting stage cannot be moved freely: it
// writes each unit's meleeTarget and rangedTarget into the delta buffer, and the
// melee and aimed-fire stages read those choices back out of it. Choosing a target
// and acting on it are one decision split across two functions, so targeting runs
// before both of them, and running either of them first would have them act on
// whatever the previous tick happened to leave in the buffer.
//
// So the order below is fixed for two separate reasons, only one of which is
// readability. TestStageOrderDoesNotMatter proves the exact rule over all 120
// orderings of these five stages, so the dependency is tested rather than trusted,
// and a stage that later starts reading another stage's output fails there.
//
//  1. intent      advance, engage, withdraw, or rout, from morale and contact
//  2. command     hand the field to a commander, if there is one, and take
//     back the movements it ordered over the intent stage's
//  2. targeting   pick each unit's melee and aimed targets, under the
//     concentration limit
//  3. aimed fire  shots, suppression, and ammunition
//  4. melee       blows, armour, and fatigue
//  5. morale      morale, suppression and exhaustion decay, breaks, routs,
//     and surrenders
var tickOrder = []string{
	"intent",
	"targeting",
	"aimed fire",
	"melee",
	"morale",
}

// Run fights a battle from start to conclusion and reports the result.
//
// The same seed and the same Setup always produce the same Result. Every
// failure it can detect returns an error rather than a Result; there is no
// configuration under which Run returns a Result describing a battle it did not
// simulate.
func Run(cfg *config.Config, seed uint64, setup Setup) (*Result, error) {
	if cfg == nil {
		return nil, newError(ErrNilConfig,
			"Run needs a balance config; this package holds no constants of its own, "+
				"because CONSTITUTION.md section 1.2 makes the balance file the only "+
				"source of them")
	}
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		return nil, err
	}
	return b.fight()
}

// newBattle validates a setup and builds the initial state.
func newBattle(cfg *config.Config, seed uint64, setup Setup) (*Battle, error) {
	c := cfg.Battle
	if err := validateConstants(&c); err != nil {
		return nil, err
	}
	if setup.Terrain != TerrainOpen {
		return nil, &Error{
			Kind:  ErrTerrainUnsupported,
			Field: "Setup.Terrain",
			Detail: fmt.Sprintf("terrain %q is not modelled by this battle core; only %q is. "+
				"Asking for another is an error rather than a field quietly ignored",
				setup.Terrain, TerrainOpen),
		}
	}

	for _, side := range sides {
		in := setup.A
		if side == SideB {
			in = setup.B
		}
		if len(in) == 0 {
			return nil, &Error{
				Kind:   ErrEmptyForce,
				Side:   side,
				Detail: "a battle needs two forces; this side has none",
			}
		}
		if float64(len(in)) > c.MaxUnitsPerSide {
			return nil, &Error{
				Kind:  ErrForceTooLarge,
				Side:  side,
				Count: float64(len(in)),
				Limit: c.MaxUnitsPerSide,
				Detail: "raise battle.max_units_per_side in the balance file if this battle is " +
					"meant to be run; nothing in the engine assumes a unit count",
			}
		}
		if err := validateForce(in, side); err != nil {
			return nil, err
		}
	}

	b := &Battle{
		cfg:   cfg,
		c:     c,
		seed:  seed,
		rng:   rng.New(seed),
		label: setup.Label,
	}

	// Ids are assigned here, densely and in ascending order across both sides,
	// and every later loop and every target reference relies on it. A caller's
	// own Unit.ID is ignored on purpose; see Unit.ID.
	total := len(setup.A) + len(setup.B)
	b.units = make([]*Unit, 0, total)
	b.byID = make([]*Unit, total)
	for _, side := range sides {
		in := setup.A
		if side == SideB {
			in = setup.B
		}
		for i := range in {
			u := in[i]
			u.ID = len(b.units)
			u.Side = side
			b.units = append(b.units, &u)
			b.byID[u.ID] = &u
			b.stats.Bodies[side.index()] += u.Troops
		}
	}

	b.leaders = append([]Leader{}, setup.Leaders...)
	for i := range b.leaders {
		l := &b.leaders[i]
		l.ID = i
		if l.Side != SideA && l.Side != SideB {
			return nil, &Error{
				Kind:   ErrUnitInvalid,
				Field:  "Setup.Leaders[].Side",
				Detail: fmt.Sprintf("leader %d belongs to side %d, which is neither A nor B", i, l.Side),
			}
		}
		if !isFinite(l.Influence) || l.Influence < 0 {
			return nil, &Error{
				Kind:   ErrUnitInvalid,
				Side:   l.Side,
				Field:  "Setup.Leaders[].Influence",
				Detail: fmt.Sprintf("leader %d has influence %g; it must be finite and not negative", i, l.Influence),
			}
		}
		if !isFinite(l.X) || !isFinite(l.Y) {
			return nil, &Error{
				Kind:   ErrUnitInvalid,
				Side:   l.Side,
				Field:  "Setup.Leaders[].Position",
				Detail: fmt.Sprintf("leader %d has position (%g, %g); it must be finite", i, l.X, l.Y),
			}
		}
	}

	b.meleeHash = newHash(c.GridCellSize, int(c.GridMaxCells))
	b.fireHash = newHash(c.RangedGridCellSize, int(c.GridMaxCells))
	b.snap = make([]snapshot, total)
	b.deltas = make([]delta, total)
	b.formations = make([]formationState, total)
	b.meleeScratch = make([]int, 0, 128)
	b.fireScratch = make([]int, 0, 128)
	b.attackerCount = make([]int, total)
	b.contact = make([]bool, total)
	b.leaderScratch = make([]int, 0, len(b.leaders)+1)
	b.events = make([]Event, 0, 64)
	b.maxEvents = int(c.MaxReportEvents)
	if b.maxEvents < 1 {
		// Configuration validation refuses a bound below one. A build without
		// that check still has to report something, and a bound of one reports
		// the first event and counts the rest, which is visible rather than a
		// report that claims nothing happened.
		b.maxEvents = 1
	}

	// Starting positions, then the opening strength baseline. Nothing here
	// depends on a unit count: the shape of each side's block comes from its
	// own count and from the configured frontage.
	b.layout(SideA, -1)
	b.layout(SideB, 1)
	b.strengthStartA = positiveOrOne(strength(b.units, SideA, b.c))
	b.strengthStartB = positiveOrOne(strength(b.units, SideB, b.c))
	return b, nil
}

// layout places a side's units in a facing block.
//
// dir is -1 for side A, which advances toward positive x, and +1 for side B.
// Rows lie back from the front line, so row r sits r*depth behind it, and
// columns spread across the frontage. The block's width comes from the count and
// from battle.roster_front_aspect: for n units the block is laid out about that
// many times wider than it is deep, because that is what a line looks like and
// because a wide formation finds more targets per volley while a deep one
// concentrates fire.
//
// The aspect is a config value and was a literal 3 in this file. It is on the
// size table in balance.toml rather than among the unit-generation constants
// because it is the one layout number that changes what a battle means as the
// size knob is turned: at 3 a hundred a side arrives as a 44 m line and five
// hundred a side as a 100 m one, and how many enemies can reach a unit at once
// is how wide that is. Its effects are all balance and all of them are in the
// balance file; the only reason it was in code is that somebody thought a shape
// was not a number.
//
// The jitter comes from a named substream, so laying out a force does not
// disturb any other draw and the same seed always lays out the same block.
func (b *Battle) layout(side Side, dir float64) {
	c := b.c
	mine := make([]*Unit, 0, len(b.units))
	for _, u := range b.units {
		if u.Side == side {
			mine = append(mine, u)
		}
	}
	n := len(mine)
	if n == 0 {
		return
	}
	cols := int(sqrtApprox(float64(n) * c.RosterFrontAspect))
	if cols < 1 {
		cols = 1
	}
	if cols > n {
		cols = n
	}
	halfFront := float64(cols) * c.RosterFrontage / 2
	depth := c.RosterFormationDepth
	startX := c.RosterStartDistance / 2

	lay := b.rng.Derive("layout-" + side.String())
	for i, u := range mine {
		row := i / cols
		col := i % cols
		// Jitter smaller than the spacing, so it breaks up a perfectly regular
		// line without making the block unreadable or two units share a cell
		// they would then never be able to leave.
		jx := (lay.Float64() - 0.5) * depth * b.c.LateralDrift
		jy := (lay.Float64() - 0.5) * b.c.RosterFrontage * b.c.LateralDrift
		u.X = dir*(startX-float64(row)*depth) + jx
		u.Y = -halfFront + float64(col)*b.c.RosterFrontage + jy
	}
}

// frontAspect is gone. It was a literal 3 in this file and it is now
// battle.roster_front_aspect in the balance file, because CONSTITUTION.md
// section 1.2 has no exceptions and because a shape is as much a balance
// decision as a rate. The reasoning it carried is kept on the layout function
// above, which is where it is used.

// validateConstants rejects a balance file whose battle constants cannot
// produce a coherent fight. config.validate checks many of these at load;
// they are checked again here because this package is usable with a Config
// assembled by other means, and because an error found at the point of use
// names the engine that needed it.
func validateConstants(c *config.Battle) error {
	checks := []struct {
		name  string
		value float64
		lo    float64
		hi    float64
		why   string
	}{
		{"tick_seconds", c.TickSeconds, 0.0001, 1000, "a tick of zero length never advances the clock"},
		{"max_ticks", c.MaxTicks, 1, 10000000, "a tick bound below one cannot run a battle"},
		{"stalemate_ticks", c.StalemateTicks, 1, 10000000, "a no-casualty timeout below one tick would end every battle instantly"},
		{"max_units_per_side", c.MaxUnitsPerSide, 1, 10000000, "a side limit below one rejects every force"},
		{"grid_cell_size", c.GridCellSize, 0.01, 100000, "a cell must have a positive width"},
		{"ranged_grid_cell_size", c.RangedGridCellSize, 0.01, 1000000, "a cell must have a positive width"},
		{"melee_range", c.MeleeRange, 0.001, 10000, "a swing must reach something"},
		{"melee_swing_seconds", c.MeleeSwingSeconds, 0.0001, 10000, "a unit must be able to swing"},
		{"ranged_fire_interval", c.RangedFireInterval, 0.0001, 10000, "a unit must be able to fire"},
		{"fatal_hp_fraction", c.FatalHPFraction, 0, 1, "a fatal fraction outside 0-1 is not a fraction"},
		{"dead_share", c.DeadShare, 0, 1, "a dead share outside 0-1 is not a share"},
		{"max_attackers_per_target", c.MaxAttackersPerTarget, 0, 1000000, "the concentration limit must be a count"},
		{"surrender_strength_fraction", c.SurrenderStrengthFraction, 0, 1, "a surrender threshold outside 0-1 is not a fraction"},
		{"rout_strength_fraction", c.RoutStrengthFraction, 0, 1, "a rout threshold outside 0-1 is not a fraction"},
		{"roster_front_aspect", c.RosterFrontAspect, 0.1, 50, "a force laid out at or below this width is a column, and every size assumption downstream becomes a special case"},
		{"roster_leader_depth_fraction", c.RosterLeaderDepthFraction, 0, 1, "a commander stands behind his front line by a share of its depth"},
		{"roster_leader_jitter_fraction", c.RosterLeaderJitterFraction, 0, 2, "a command line's scatter is a share of a frontage"},
		{"roster_leader_influence_floor", c.RosterLeaderInfluenceFloor, 0, 1, "a commander's influence is a share of what was asked for"},
		{"roster_leader_influence_spread", c.RosterLeaderInfluenceSpread, 0, 1, "the spread of a command's influence is a share of what was asked for"},
		{"roster_morale_bias_scale", c.RosterMoraleBiasScale, 0, 1, "a morale bias is a share of the 0-1 morale scale"},
		{"melee_ranged_skill_scale", c.MeleeRangedSkillScale, 0, 1, "a shooter's share of its own skill at a swing is a share, not a multiplier"},
		{"ranged_hit_chance_base", c.RangedHitChanceBase, 0, 1, "a chance outside 0-1 is not a chance"},
		{"ranged_hit_chance_skill_weight", c.RangedHitChanceSkillWeight, 0, 1, "skill adds a share of a chance"},
		{"ranged_hit_effectiveness_floor", c.RangedHitEffectivenessFloor, 0, 1, "the share of a hit chance a shaken shooter keeps is a share"},
		{"ballistics_gravity", c.BallisticsGravity, 0.1, 30, "bullets fall; zero gravity is a different universe"},
		{"ballistics_target_radius", c.BallisticsTargetRadius, 0.1, 2, "a target radius outside man-size is not a man"},
		{"ballistics_sprint_speed", c.BallisticsSprintSpeed, 0.5, 20, "a sprint threshold below a walk is not a sprint"},
		{"ballistics_move_spread_mult", c.BallisticsMoveSpreadMult, 1, 20, "moving cannot steady the aim"},
		{"ballistics_sprint_spread_mult", c.BallisticsSprintSpreadMult, 1, 30, "sprinting cannot steady the aim"},
		{"ballistics_suppression_spread_mult", c.BallisticsSuppressionSpreadMult, 0, 10, "a spread multiplier is a multiplier"},
		{"ballistics_suppression_accuracy_mult", c.BallisticsSuppressionAccuracyMult, 0, 1, "the pinned accuracy share is a share"},
		{"ballistics_set_stance_spread_mult", c.BallisticsSetStanceSpreadMult, 0.1, 1, "a braced stance steadies, it does not scatter"},
		{"ballistics_cover_bleed", c.BallisticsCoverBleed, 0, 1, "the damage share passing through cover is a share"},
		{"ballistics_cover_low_mult", c.BallisticsCoverLowMult, 0, 1, "low cover's hit-chance share is a share"},
		{"ballistics_cover_high_mult", c.BallisticsCoverHighMult, 0, 1, "high cover's hit-chance share is a share"},
		{"ballistics_recoil_max", c.BallisticsRecoilMax, 0.01, 1, "a recoil cap below one kick is no cap at all"},
		{"morale_recovery_suppression_band", c.MoraleRecoverySuppressionBand, 0, 1, "the suppression band at which a man gets his head up is a share of full suppression"},
	}
	for _, ck := range checks {
		if ck.value < ck.lo || ck.value > ck.hi {
			return &Error{
				Kind:  ErrInvalidConfig,
				Field: "battle." + ck.name,
				Detail: fmt.Sprintf("%s is %g, outside [%g, %g]: %s",
					ck.name, ck.value, ck.lo, ck.hi, ck.why),
			}
		}
	}
	type rel struct {
		field, detail string
		bad           bool
	}
	rels := []rel{
		{"battle.grid_cell_size",
			fmt.Sprintf("grid_cell_size %g is below melee_range %g, so a melee query would scan "+
				"cells it could have stepped over", c.GridCellSize, c.MeleeRange),
			c.GridCellSize < c.MeleeRange},
		{"battle.morale_rout_threshold",
			fmt.Sprintf("morale_rout_threshold %g is not below morale_break_threshold %g; "+
				"units must break before they run", c.MoraleRoutThreshold, c.MoraleBreakThreshold),
			c.MoraleRoutThreshold >= c.MoraleBreakThreshold},
		{"battle.morale_floor",
			fmt.Sprintf("morale_floor %g is above morale_rout_threshold %g, so a unit could never rout",
				c.MoraleFloor, c.MoraleRoutThreshold),
			c.MoraleFloor > c.MoraleRoutThreshold},
		{"battle.ranged_min_range",
			fmt.Sprintf("ranged_min_range %g is not below ranged_range %g, so a ranged unit "+
				"could never fire", c.RangedMinRange, c.RangedRange),
			c.RangedMinRange >= c.RangedRange},
	}
	for _, r := range rels {
		if r.bad {
			return &Error{Kind: ErrInvalidConfig, Field: r.field, Detail: r.detail}
		}
	}
	if c.RosterMoraleStart <= 0 {
		return &Error{
			Kind:  ErrInvalidConfig,
			Field: "battle.roster_morale_start",
			Detail: "roster_morale_start must be above zero: a force whose units start already " +
				"routed is not a battle, it is a formality",
		}
	}
	return nil
}

// validateForce checks every unit in a force. It returns on the first problem,
// naming the field and the unit, because a caller with three hundred broken
// units needs the first one fixed before the rest are worth reading.
//
// Unit.ID is not among the fields checked, because Run overwrites it. See
// Unit.ID.
func validateForce(force []Unit, side Side) error {
	for i := range force {
		if err := validateUnit(&force[i], side, i); err != nil {
			return err
		}
	}
	return nil
}

// validateUnit checks one unit's fields. Every bound it enforces is a bound the
// simulation depends on, not a matter of taste: a unit with no troops
// contributes nothing but would still occupy a slot in every loop, and a NaN in
// a hit-point field would poison it permanently, because every later comparison
// against NaN is false and the unit would neither die nor be counted.
func validateUnit(u *Unit, side Side, idx int) error {
	fail := func(field, detail string) error {
		return &Error{
			Kind:   ErrUnitInvalid,
			Side:   side,
			Field:  field,
			Detail: fmt.Sprintf("force unit %d: %s", idx, detail),
		}
	}
	if u.Troops <= 0 || !isFinite(u.Troops) {
		return fail("Unit.Troops", fmt.Sprintf("troops is %g; a unit represents at least one body", u.Troops))
	}
	if u.MaxHP <= 0 || !isFinite(u.MaxHP) {
		return fail("Unit.MaxHP", fmt.Sprintf("max HP is %g; a unit must be able to survive a blow", u.MaxHP))
	}
	if u.HP <= 0 || !isFinite(u.HP) {
		return fail("Unit.HP", fmt.Sprintf("HP is %g; a unit enters the battle alive or it does not enter", u.HP))
	}
	if u.HP > u.MaxHP {
		return fail("Unit.HP", fmt.Sprintf("HP %g exceeds max HP %g", u.HP, u.MaxHP))
	}
	if u.Speed < 0 || !isFinite(u.Speed) {
		return fail("Unit.Speed", fmt.Sprintf("speed is %g; it must be finite and not negative", u.Speed))
	}
	if u.Morale < 0 || u.Morale > 1 || !isFinite(u.Morale) {
		return fail("Unit.Morale", fmt.Sprintf("morale is %g; it is on a 0-1 scale", u.Morale))
	}
	if u.MeleeSkill < 0 || u.MeleeSkill > 1 || !isFinite(u.MeleeSkill) {
		return fail("Unit.MeleeSkill", fmt.Sprintf("melee skill is %g; it is on a 0-1 scale", u.MeleeSkill))
	}
	if u.RangedSkill < 0 || u.RangedSkill > 1 || !isFinite(u.RangedSkill) {
		return fail("Unit.RangedSkill", fmt.Sprintf("ranged skill is %g; it is on a 0-1 scale", u.RangedSkill))
	}
	if u.Ammo < 0 || !isFinite(u.Ammo) {
		return fail("Unit.Ammo", fmt.Sprintf("ammo is %g; it must be finite and not negative", u.Ammo))
	}
	if u.Suppression < 0 || !isFinite(u.Suppression) {
		return fail("Unit.Suppression", fmt.Sprintf("suppression is %g; it must be finite and not negative", u.Suppression))
	}
	if u.Exhaustion < 0 || !isFinite(u.Exhaustion) {
		return fail("Unit.Exhaustion", fmt.Sprintf("exhaustion is %g; it must be finite and not negative", u.Exhaustion))
	}
	if u.Role != RoleMelee && u.Role != RoleRanged {
		return fail("Unit.Role", fmt.Sprintf("role is %d, which is neither melee nor ranged", u.Role))
	}
	if u.Status != StatusFighting {
		return fail("Unit.Status", fmt.Sprintf("status is %q; a unit enters the battle fighting", u.Status))
	}
	if !isFinite(u.X) || !isFinite(u.Y) {
		return fail("Unit.Position", fmt.Sprintf("position is (%g, %g); it must be finite", u.X, u.Y))
	}
	if u.Weapon > WeaponMarksman {
		return fail("Unit.Weapon", fmt.Sprintf("weapon is %d, which is no weapon in the table", u.Weapon))
	}
	if u.Recoil < 0 || !isFinite(u.Recoil) {
		return fail("Unit.Recoil", fmt.Sprintf("recoil is %g; it must be finite and not negative", u.Recoil))
	}
	return nil
}

// fight runs ticks until the battle is decided or the tick bound is reached,
// then assembles the result.
func (b *Battle) fight() (*Result, error) {
	for {
		if outcome, decided := b.checkEnding(); decided {
			return b.result(outcome), nil
		}
		if err := b.tick(); err != nil {
			return nil, err
		}
	}
}

// tick runs one tick: snapshot, stages, commit.
func (b *Battle) tick() error {
	// The snapshot. Everything below reads this and nothing else, which is
	// what makes the stage order irrelevant to the result.
	for i, u := range b.units {
		b.snap[i] = take(u)
		b.deltas[i].reset()
		b.attackerCount[i] = 0
		// No shape until a commander publishes one. See Battle.formations.
		b.formations[i] = formationState{}
	}

	// The hashes are rebuilt from committed state once, before any stage runs.
	// Rebuilding per stage would let a stage see another's staged position,
	// which is the coupling the snapshot exists to prevent.
	b.meleeHash.rebuild(b.units)
	b.fireHash.rebuild(b.units)

	// Contact flags, filled once from the hashes and the snapshot the stages are
	// about to read. They are not a stage and write nothing: they are the answer
	// to one question, computed once so the intent stage and the rank-blocking
	// rule inside it cannot disagree about who is touching whom.
	b.markContact()

	b.stageIntent()
	if err := b.runCommanders(); err != nil {
		return err
	}
	b.stageTargeting()
	b.stageAimedFire()
	b.stageMelee()
	b.stageMorale()
	if err := b.commit(); err != nil {
		return err
	}
	b.tickNo++
	b.elapsed += b.c.TickSeconds
	return nil
}

// checkEnding decides whether the battle is over, and if so how and why.
//
// The endings, in the order they are tested:
//
//  1. Nothing left that can fight, on both sides: a Draw, mutual collapse.
//  2. One side has nothing left that can fight: the other wins by the enemy's
//     destruction.
//  3. One side is at or below battle.surrender_strength_fraction of its
//     opening strength, or has more than battle.rout_strength_fraction of its
//     strength routed. It yields; the other wins by the enemy's break.
//  4. The tick bound is reached with neither side decided: a Draw, reported as
//     a stalemate rather than hidden behind an infinite loop.
//
// Rule 3 is what makes morale matter to the ending rather than only to the
// middle of the fight. A side that has lost four fifths of its strength as
// routed men while the rest still stand up straight is beaten, and the honest
// answer is that the battle ended when the crowd stopped fighting, not twenty
// minutes later when the rout finished killing itself.
func (b *Battle) checkEnding() (Outcome, bool) {
	c := b.c
	aAct := actableBodies(b.units, SideA)
	bAct := actableBodies(b.units, SideB)
	switch {
	case aAct == 0 && bAct == 0:
		return Outcome{Kind: ResultDraw, Reason: ReasonMutualCollapse}, true
	case bAct == 0:
		return Outcome{Kind: ResultSideA, Reason: ReasonEnemyDestroyed}, true
	case aAct == 0:
		return Outcome{Kind: ResultSideB, Reason: ReasonEnemyDestroyed}, true
	}

	as := strength(b.units, SideA, c) / b.strengthStartA
	bs := strength(b.units, SideB, c) / b.strengthStartB
	ar := routedBodies(b.units, SideA) / b.strengthStartA
	br := routedBodies(b.units, SideB) / b.strengthStartB

	aYielded := as <= c.SurrenderStrengthFraction || ar >= c.RoutStrengthFraction
	bYielded := bs <= c.SurrenderStrengthFraction || br >= c.RoutStrengthFraction
	switch {
	case aYielded && bYielded:
		return Outcome{Kind: ResultDraw, Reason: ReasonMutualBreak}, true
	case aYielded:
		return Outcome{Kind: ResultSideB, Reason: ReasonEnemyBroke}, true
	case bYielded:
		return Outcome{Kind: ResultSideA, Reason: ReasonEnemyBroke}, true
	}

	if float64(b.tickNo) >= c.MaxTicks {
		return Outcome{Kind: ResultDraw, Reason: ReasonStalemate}, true
	}
	return Outcome{}, false
}

// commit merges every delta and applies it once.
//
// This is where the order-independence of the tick becomes concrete. All the
// damage aimed at one unit has already been summed into a single delta.HP, so
// whether a unit dies is a function of the total damage aimed at it this tick
// and not of which attacker was resolved first. Two attackers who between them
// exceed its remaining hit points kill it exactly once, which is the only
// casualty accounting that survives a change to the stage order.
func (b *Battle) commit() error {
	c := b.c
	for i, u := range b.units {
		d := &b.deltas[i]
		s := b.snap[i]

		if d.intentSet {
			u.Intent = d.intent
		}
		u.MeleeTarget = d.meleeTarget
		u.RangedTarget = d.rangedTarget

		// A unit already out of the fight takes no further writes except the
		// ones that describe it, which is why this check comes before the
		// arithmetic rather than after it.
		if s.Status == StatusDestroyed || s.Status == StatusSurrendered {
			continue
		}

		u.HP = s.HP + d.HP
		if !isFinite(u.HP) {
			return &Error{
				Kind:  ErrInternal,
				Side:  u.Side,
				Field: "Unit.HP",
				Detail: fmt.Sprintf("unit %d reached %g hit points after a %g change from %g. "+
					"A non-finite condition means an engine bug, not a balance value",
					u.ID, u.HP, d.HP, s.HP),
			}
		}
		if u.HP < 0 {
			u.HP = 0
		}

		u.Morale = clamp(s.Morale+d.Morale, c.MoraleFloor, 1)
		u.Suppression = clamp(s.Suppression+d.Suppression-c.SuppressionDecay*c.TickSeconds, 0, c.SuppressionCap)
		u.Exhaustion = clamp(s.Exhaustion+d.Exhaustion-c.ExhaustionRecovery*c.TickSeconds, 0, c.ExhaustionCap)
		if u.Suppression > b.stats.PeakSuppression {
			b.stats.PeakSuppression = u.Suppression
		}

		if d.shots > 0 {
			u.Ammo = s.Ammo - d.shots
			if u.Ammo < 0 {
				u.Ammo = 0
			}
		}

		// The attack timers. A unit that acted this tick has its timer reloaded
		// to the configured interval; one that did not has whatever was left
		// counted down. This is the only place either number is written, which
		// is what makes battle.melee_swing_seconds and battle.ranged_fire_interval
		// rates rather than decoration: a unit that swung cannot swing again
		// until its swing is finished, and a shooter that fired cannot fire
		// again until its fire is finished.
		u.MeleeCooldown = cooldownAfter(d.swingFired, s.MeleeCooldown, c.MeleeSwingSeconds, c.TickSeconds)
		u.RangedCooldown = cooldownAfter(d.shotFired, s.RangedCooldown, c.RangedFireInterval, c.TickSeconds)

		// Recoil: this tick's kick is added, one tick of recovery subtracted,
		// clamped to the configured max. Firing faster than the weapon
		// recovers is what walks full-auto fire upward.
		if d.recoilKick > 0 || s.Recoil > 0 {
			w := weaponTable[u.Weapon]
			u.Recoil = applyRecoil(s.Recoil, d.recoilKick, w.recoilRecovery, c.TickSeconds, c.BallisticsRecoilMax)
		}

		u.X += d.DX
		u.Y += d.DY
		u.VX = d.DX / c.TickSeconds
		u.VY = d.DY / c.TickSeconds

		si := u.Side.index()
		if d.meleeSwings > 0 {
			u.Swings += d.meleeSwings
			b.stats.Swings[si] += d.meleeSwings
		}
		if d.shots > 0 {
			u.Shots += d.shots
			b.stats.Shots[si] += d.shots
		}
		if d.meleeHits > 0 {
			b.stats.MeleeHits[si] += d.meleeHits
		}
		if d.rangedHits > 0 {
			b.stats.RangedHits[si] += d.rangedHits
			b.stats.Suppression[si] += d.suppressionDealt
		}

		if d.newStatusSet {
			u.Status = d.newStatus
		}
		// A break and a rout are counted here, by comparing the state the unit
		// held at the top of the tick with the state it holds now. A unit that
		// breaks, rallies, and breaks again over the battle counts three times,
		// which is the honest reading: that is how many separate decisions its
		// officers had to make.
		if u.Status != s.Status && u.alive() {
			switch u.Status {
			case StatusBroken:
				b.stats.Breaks++
			case StatusRouted:
				b.stats.Routs++
			case StatusSurrendered:
				b.stats.Surrendered[u.Side.index()]++
			}
		}

		// Destruction. Below the fatal fraction a unit is destroyed, and its
		// bodies are split between dead and wounded once, here, from the
		// merged damage. See destroy for why this is not done at the blow.
		if u.alive() && u.HP < u.MaxHP*c.FatalHPFraction {
			b.destroy(u)
		}
	}

	// The peaks are taken over committed statuses in one pass rather than
	// accumulated per unit, so a unit that broke and rallied inside a single
	// tick is counted once, in the state it ended the tick in.
	broken, routed := 0, 0
	for _, u := range b.units {
		switch u.Status {
		case StatusBroken:
			broken++
		case StatusRouted:
			routed++
		}
	}
	if broken > b.stats.PeakBroken {
		b.stats.PeakBroken = broken
	}
	if routed > b.stats.PeakRouted {
		b.stats.PeakRouted = routed
	}

	// Shot bundles are flushed here, in unit-id order, after every stage has
	// run. The aimed-fire stage only buffers them, so the event log never
	// depends on where the stage sat in the tick's order.
	for _, e := range b.shotEvents {
		b.addEvent(e)
	}
	b.shotEvents = b.shotEvents[:0]
	return nil
}

// cooldownAfter is the attack timer a unit holds after a tick, given whether it
// acted.
//
// A unit that acted gets the full interval back. A unit that did not has its
// remaining time counted down by one tick, floored at zero, so a timer that has
// run out leaves the unit able to act rather than sticking it at a small
// negative number that has to be clamped at three different call sites.
func cooldownAfter(acted bool, remaining, interval, dt float64) float64 {
	if acted {
		return interval
	}
	remaining -= dt
	if remaining < 0 || !isFinite(remaining) {
		return 0
	}
	return remaining
}

// destroy removes a unit from the fight, splitting its bodies between dead and
// wounded per battle.dead_share.
//
// The wounded are out of this battle, not dead. COMBAT.md section 5 has
// injuries that heal with medicine and return a man to duty, and the aftermath
// needs both numbers to know what a fight cost: a hundred dead is a different
// political fact from three hundred, of whom two hundred will be back. Deciding
// the split here, once, from the merged damage, is also what keeps it
// independent of which attacker happened to finish the unit.
//
// The whole body count is credited to the OTHER side as casualties inflicted, so
// the two halves of the report agree by construction: what side A destroyed on
// side B is exactly what side B's dead plus wounded totals. A report whose two
// halves disagree is a report nobody can act on, and a counter that is never
// incremented is a line that always prints a confident zero.
func (b *Battle) destroy(u *Unit) {
	u.Status = StatusDestroyed
	u.HP = 0
	dead := u.Troops * b.c.DeadShare
	wounded := u.Troops - dead
	si := u.Side.index()
	b.stats.Dead[si] += dead
	b.stats.Wounded[si] += wounded
	b.stats.CasualtiesInflicted[u.Side.Opposing().index()] += u.Troops
	b.addEvent(Event{
		Tick:  b.tickNo,
		Side:  u.Side,
		Kind:  EventDestroyed,
		Unit:  u.ID,
		Value: u.Troops,
		Read:  fmt.Sprintf("troops=%.0f max_hp=%.1f", u.Troops, u.MaxHP),
		Note: fmt.Sprintf("unit %d (%s, %.0f troops, %s) destroyed at (%.1f, %.1f)",
			u.ID, u.Role, u.Troops, u.Side, u.X, u.Y),
	})
}

// addEvent records a notable event. Events past the bound are counted rather
// than dropped in silence, and the count reaches the report: truncating an
// event list without saying so is the kind of quiet loss this codebase treats
// as a bug.
func (b *Battle) addEvent(e Event) {
	if len(b.events) >= b.maxEvents {
		b.eventsDropped++
		return
	}
	e.Seq = len(b.events)
	b.events = append(b.events, e)
}

// maxEvents is gone. It used to be a constant in this file and it is now
// battle.max_report_events in the balance file. The reasoning it carried is
// kept, because it is the answer to "why is there a bound at all". It is a
// REPORTING bound, not a simulation bound: the tick loop never reads it and no
// behaviour changes because of it. It is not in the balance file because it is
// uninteresting; it is there because CONSTITUTION.md section 1.2 puts every
// number in one place and this one is now read from it. The default in the file
// is the value that used to live here, so a default run reports the same events
// it always did.

// positiveOrOne returns v when it is positive and one otherwise. A guard against
// a zero denominator in the strength ratios, named for what it is.
func positiveOrOne(v float64) float64 {
	if v > 0 && isFinite(v) {
		return v
	}
	return 1
}

// sqrtApprox returns the square root of v by Newton's method. Written out
// rather than calling math.Sqrt so the layout code reads as one idea; the result
// is rounded to a whole number of columns immediately afterwards, so the last
// couple of digits do not matter.
func sqrtApprox(v float64) float64 {
	if v <= 0 {
		return 0
	}
	x := v
	for i := 0; i < 24; i++ {
		x = 0.5 * (x + v/x)
	}
	return x
}
