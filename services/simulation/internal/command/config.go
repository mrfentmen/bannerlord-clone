package command

import (
	"fmt"
	"strings"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/formation"
)

// Config holds every threshold this layer decides with. All of them come from
// the [command] section of config/balance.toml through FromCentral, per
// CONSTITUTION.md section 1.2: no tactics number lives in this file. What this
// package owns is what the numbers MEAN — when to advance, when to commit, when
// to fall back — and not how they were parsed out of a file.
//
// THE SPLIT WITH [formation]. This section says WHEN and the [formation]
// section says HOW FAST and IN WHAT SHAPE. There is no overlap and no fallback
// between them: a distance here is one a commander measured before giving an
// order, and every pace that turns it into movement belongs to internal/
// formation. That is why Config carries no speed, no spacing, and no standoff.
//
// IT IS NOT A SECOND COPY OF THE LOADER'S RANGES. The bounds on every key below
// are enforced once, in internal/config, which is the loader for the whole
// simulation. Validate here does the two jobs that only this package can do:
// it refuses a Config that was never filled in from the file at all, and it
// resolves the three shape names through formation.ParseFormation, which is the
// only place that knows which shapes exist. A second table of twenty bounds
// would be a second opinion about the same numbers, which is how a balance file
// ends up legal in one loader and refused in another.
type Config struct {
	// FormationsPerSide is how many formations a side's force is divided into.
	// The first is the fighting line, the last is the reserve, and the ones
	// between are flanking forces held until they are committed.
	FormationsPerSide int
	// ReserveShare is the share of a side's units kept in the reserve formation
	// at the start rather than in the line or the flank.
	ReserveShare float64

	// FrontShape, FlankShape, and ReserveShape are the shapes those three kinds
	// of formation hold, already resolved from the names in the balance file.
	FrontShape, FlankShape, ReserveShape formation.Formation

	// AdvanceTriggerRange is the distance from the enemy at which the fighting
	// line stops closing and holds to shoot.
	AdvanceTriggerRange float64
	// ChargeRange is the distance at which a formation with clear local
	// superiority is sent in at the run rather than the walk, and also the
	// radius inside which "local" is measured: the comparison is against the
	// enemy a charge would actually run into.
	ChargeRange float64
	// ChargeStrengthRatio is how much strength a formation needs against the
	// enemy in front of it before it is charged rather than walked in against.
	ChargeStrengthRatio float64
	// FlankTriggerRange is the distance the fighting line must have closed
	// before a flanking formation is committed.
	FlankTriggerRange float64
	// FlankMinStrengthFraction is the share of its own opening strength a side
	// must still hold to be allowed to commit a flank.
	FlankMinStrengthFraction float64
	// ReserveCommitStrengthFraction is the share of its own opening strength at
	// or below which the reserve is committed to the attack.
	ReserveCommitStrengthFraction float64

	// WithdrawMorale is the mean morale at or below which a formation is
	// ordered back.
	WithdrawMorale float64
	// WithdrawBrokenShare is the share of a formation's units broken at or
	// above which it is ordered back.
	WithdrawBrokenShare float64

	// DecisionIntervalTicks is how many ticks pass between full
	// re-assessments of the battle.
	DecisionIntervalTicks int
	// OrderMinTicks is how long an order stands before it may be changed, so a
	// formation sitting on a threshold does not reverse itself every
	// assessment and arrive nowhere.
	OrderMinTicks int

	// BrokenEffectiveness is battle.melee_broken_effectiveness, read from the
	// battle section rather than repeated here as a number of its own.
	//
	// It is what discounts a shaken unit when this layer measures a formation's
	// strength, and it is the engine's own discount rather than a private one on
	// purpose: a commander who thought his line was worth twice what the battle
	// engine thought it was worth would commit reserves against a strength that
	// does not exist. One measure of strength, published once and read by both.
	BrokenEffectiveness float64
}

// FromCentral copies the [command] constants, and the one [battle] constant this
// layer needs to measure strength, out of the loaded balance config.
//
// The shape names go through formation.ParseFormation here rather than being
// stored as text, so a name no shape implements is refused when the config is
// built rather than turning every formation into the same line at the first
// tick. FromCentral is a field-by-field copy rather than a conversion so the two
// structs can diverge without one silently reinterpreting the other: adding a
// knob here means adding it there, and forgetting leaves it zero, which the
// checks below refuse rather than accept.
func FromCentral(c *config.Config) (Config, error) {
	if c == nil {
		return Config{}, errorf("FromCentral", "config",
			"the tactics layer needs the balance config; this package holds no constants of its own, "+
				"because CONSTITUTION.md section 1.2 makes the balance file the only source of them")
	}
	out := Config{
		FormationsPerSide:             0,
		ReserveShare:                  c.Command.ReserveShare,
		AdvanceTriggerRange:           c.Command.AdvanceTriggerRange,
		ChargeRange:                   c.Command.ChargeRange,
		ChargeStrengthRatio:           c.Command.ChargeStrengthRatio,
		FlankTriggerRange:             c.Command.FlankTriggerRange,
		FlankMinStrengthFraction:      c.Command.FlankMinStrengthFraction,
		ReserveCommitStrengthFraction: c.Command.ReserveCommitStrengthFraction,
		WithdrawMorale:                c.Command.WithdrawMorale,
		WithdrawBrokenShare:           c.Command.WithdrawBrokenShare,
		DecisionIntervalTicks:         0,
		OrderMinTicks:                 0,
		BrokenEffectiveness:           c.Battle.MeleeBrokenEffectiveness,
	}
	// Counts arrive as float64 because every constant in the balance file is a
	// number, and a fractional formation count is a typo rather than a setting:
	// "three and a half formations" is refused rather than rounded quietly to
	// three, because a designer who typed it wants to know.
	n, err := wholeNumber("command.formations_per_side", c.Command.FormationsPerSide)
	if err != nil {
		return Config{}, err
	}
	out.FormationsPerSide = n
	if out.DecisionIntervalTicks, err = wholeNumber("command.decision_interval_ticks", c.Command.DecisionIntervalTicks); err != nil {
		return Config{}, err
	}
	if out.OrderMinTicks, err = wholeNumber("command.order_min_ticks", c.Command.OrderMinTicks); err != nil {
		return Config{}, err
	}
	var shapeErr error
	if out.FrontShape, shapeErr = formation.ParseFormation(c.Command.FrontShape); shapeErr != nil {
		return Config{}, shapeError("command.front_shape", c.Command.FrontShape, shapeErr)
	}
	if out.FlankShape, shapeErr = formation.ParseFormation(c.Command.FlankShape); shapeErr != nil {
		return Config{}, shapeError("command.flank_shape", c.Command.FlankShape, shapeErr)
	}
	if out.ReserveShape, shapeErr = formation.ParseFormation(c.Command.ReserveShape); shapeErr != nil {
		return Config{}, shapeError("command.reserve_shape", c.Command.ReserveShape, shapeErr)
	}
	return out, out.Validate()
}

// shapeError names the balance key that carried the bad shape, because the
// error from the formation package names the shape and the caller needs to know
// which of the three keys to edit.
func shapeError(key, value string, err error) error {
	return errorf("FromCentral", key, "%q is not a shape internal/formation implements: %v", value, err)
}

// wholeNumber converts a balance value that has to be a whole number of ticks or
// formations, and refuses a fractional one rather than rounding it.
func wholeNumber(key string, v float64) (int, error) {
	i := int(v)
	if float64(i) != v {
		return 0, errorf("FromCentral", key, "%g is not a whole number; it counts formations and ticks, "+
			"and a fractional one is a typo rather than a setting", v)
	}
	return i, nil
}

// Validate refuses a Config that was never filled in from the balance file.
//
// It checks the two things only this package can check. The first is that the
// whole table is zero, which is what an un-loaded Config looks like: a
// commander built that way would advance at range zero, never charge because
// the ratio was zero, and never fall back, which is a battle that cannot end.
//
// The second is the one the loader cannot do: the shape names. internal/config
// is the loader and cannot import internal/formation, because formation imports
// config. So the names are resolved by ParseFormation, which is where the list of
// shapes actually lives, and the per-key ranges are left where they are enforced
// once. This function repeats no bound from the loader's table.
func (c Config) Validate() error {
	if c.FormationsPerSide == 0 && c.AdvanceTriggerRange == 0 && c.ChargeRange == 0 &&
		c.ChargeStrengthRatio == 0 && c.FlankTriggerRange == 0 &&
		c.ReserveShare == 0 && c.WithdrawMorale == 0 && c.WithdrawBrokenShare == 0 {
		return errorf("Validate", "[command]",
			"every one of the tactics constants is zero, so no balance file was read; "+
				"load config/balance.toml and pass it through FromCentral")
	}
	if c.FormationsPerSide < 2 {
		return errorf("Validate", "command.formations_per_side",
			"%d formations cannot be a line, a flank, and a reserve; at least two are needed for a flank to exist",
			c.FormationsPerSide)
	}
	if c.DecisionIntervalTicks < 1 {
		return errorf("Validate", "command.decision_interval_ticks",
			"%d ticks between assessments means the commander reads the battle every %d ticks, "+
				"which is either never or always", c.DecisionIntervalTicks, c.DecisionIntervalTicks)
	}
	if c.OrderMinTicks < 1 {
		return errorf("Validate", "command.order_min_ticks",
			"%d ticks is not a length of time an order can stand for", c.OrderMinTicks)
	}
	for _, s := range []struct {
		key  string
		kind formation.Formation
	}{
		{"command.front_shape", c.FrontShape},
		{"command.flank_shape", c.FlankShape},
		{"command.reserve_shape", c.ReserveShape},
	} {
		if !s.kind.Valid() {
			return errorf("Validate", s.key, "%v is not a shape internal/formation implements", s.kind)
		}
	}
	return nil
}

// shapeFor returns the shape a post holds, which is the one named for its place
// in the order of battle. It is a lookup rather than a formula so the three
// shapes are three numbers a designer set and not a rule about which of them is
// the front.
func (c Config) shapeFor(p Post) (formation.Formation, error) {
	switch p {
	case PostFront:
		return c.FrontShape, nil
	case PostFlank:
		return c.FlankShape, nil
	case PostReserve:
		return c.ReserveShape, nil
	default:
		return formation.FormationLine, errorf("shapeFor", "post", "%v is not a place in an order of battle", p)
	}
}

// values renders the config as key = value lines in balance-file key order, so a
// test that reports which constants produced an order sequence nobody expected
// reads in the same order the file lists them.
func (c Config) values() [][2]string {
	shapes := []struct {
		key   string
		shape formation.Formation
	}{
		{"front_shape", c.FrontShape},
		{"flank_shape", c.FlankShape},
		{"reserve_shape", c.ReserveShape},
	}
	out := [][2]string{
		{"formations_per_side", fmt.Sprintf("%d", c.FormationsPerSide)},
		{"reserve_share", fmt.Sprintf("%g", c.ReserveShare)},
	}
	for _, s := range shapes {
		out = append(out, [2]string{s.key, s.shape.String()})
	}
	return append(out,
		[2]string{"advance_trigger_range", fmt.Sprintf("%g", c.AdvanceTriggerRange)},
		[2]string{"charge_range", fmt.Sprintf("%g", c.ChargeRange)},
		[2]string{"charge_strength_ratio", fmt.Sprintf("%g", c.ChargeStrengthRatio)},
		[2]string{"flank_trigger_range", fmt.Sprintf("%g", c.FlankTriggerRange)},
		[2]string{"flank_min_strength_fraction", fmt.Sprintf("%g", c.FlankMinStrengthFraction)},
		[2]string{"reserve_commit_strength_fraction", fmt.Sprintf("%g", c.ReserveCommitStrengthFraction)},
		[2]string{"withdraw_morale", fmt.Sprintf("%g", c.WithdrawMorale)},
		[2]string{"withdraw_broken_share", fmt.Sprintf("%g", c.WithdrawBrokenShare)},
		[2]string{"decision_interval_ticks", fmt.Sprintf("%d", c.DecisionIntervalTicks)},
		[2]string{"order_min_ticks", fmt.Sprintf("%d", c.OrderMinTicks)},
	)
}

func (c Config) String() string {
	vals := c.values()
	parts := make([]string, 0, len(vals))
	for _, kv := range vals {
		parts = append(parts, kv[0]+"="+kv[1])
	}
	return "command.Config{" + strings.Join(parts, " ") + "}"
}
