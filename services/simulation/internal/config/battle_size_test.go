package config

// This file covers the BATTLE SIZE knobs: that every size number the battle
// engine uses arrives from the balance file, and that a file asking for an
// impossible size is refused at load with an error naming the key.
//
// The engine side of the same claim is in internal/battle's
// TestSizeKnobsComeFromConfig, which proves the engine reads these values rather
// than carrying its own. Between the two, "battle size is a config knob" is
// checked from both ends instead of asserted.

import (
	"fmt"
	"strings"
	"testing"
)

// TestBattleSizeKnobsLoad: every size-related constant comes back at the value
// the file states. A zero here would be a size the engine then had to invent.
func TestBattleSizeKnobsLoad(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	got := map[string]float64{
		"max_units_per_side":       c.Battle.MaxUnitsPerSide,
		"max_ticks":                c.Battle.MaxTicks,
		"grid_cell_size":           c.Battle.GridCellSize,
		"ranged_grid_cell_size":    c.Battle.RangedGridCellSize,
		"grid_max_cells":           c.Battle.GridMaxCells,
		"max_report_events":        c.Battle.MaxReportEvents,
		"reference_units_per_side": c.Battle.ReferenceUnitsPerSide,
		"roster_leaders_per_unit":  c.Battle.RosterLeadersPerUnit,
		"roster_leader_spread":     c.Battle.RosterLeaderSpread,
	}
	for key, v := range got {
		if v == 0 {
			t.Errorf("battle.%s came back as zero, so the engine would be reading nothing", key)
		}
	}
	// The three that are counts rather than measurements must be whole, because
	// each is converted to an int somewhere and a fraction is a silent
	// truncation. The shipped file is checked here rather than trusting that
	// validation ran, because this is the file the service ships.
	for key, v := range map[string]float64{
		"max_units_per_side":       c.Battle.MaxUnitsPerSide,
		"grid_max_cells":           c.Battle.GridMaxCells,
		"max_report_events":        c.Battle.MaxReportEvents,
		"reference_units_per_side": c.Battle.ReferenceUnitsPerSide,
		"roster_leaders_per_unit":  c.Battle.RosterLeadersPerUnit,
	} {
		if v != float64(int64(v)) {
			t.Errorf("battle.%s is %g, which is not a whole count", key, v)
		}
	}
	t.Logf("9 battle size constants loaded, 5 of them whole counts")
}

// TestLoadRefusesAZeroUnitLimit: the one nonsense value that would still "work"
// is a limit of zero, because it does not crash, it refuses every force. The
// error has to name the key, or the fix is a hunt.
func TestLoadRefusesAZeroUnitLimit(t *testing.T) {
	for _, bad := range []string{"0", "-1", "-4000"} {
		text := setKey(t, shippedText(t), "battle", "max_units_per_side", bad)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("battle.max_units_per_side = %s loaded, so a force of any size would be refused", bad)
		}
		if !strings.Contains(err.Error(), "battle.max_units_per_side") {
			t.Fatalf("the error does not name the key: %v", err)
		}
	}
	t.Log("zero and negative unit limits all refused by name")
}

// TestLoadRefusesAReferenceSizeAboveTheLimit: the size knob and the limit it is
// measured against are different numbers, and setting the first above the second
// means the reference run is refused by the very limit it exists to exercise.
// That is provable only in the direction that always fails, so it is a load
// error rather than a surprise at run time.
func TestLoadRefusesAReferenceSizeAboveTheLimit(t *testing.T) {
	text := setKey(t, shippedText(t), "battle", "reference_units_per_side", "5000")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a reference run larger than max_units_per_side loaded, so the size knob could only ever fail")
	}
	if !strings.Contains(err.Error(), "reference_units_per_side") || !strings.Contains(err.Error(), "max_units_per_side") {
		t.Fatalf("the error does not name both numbers: %v", err)
	}
	t.Logf("reference above limit: %v", err)
}

// TestLoadRefusesFractionalCounts: each of these becomes an int, so 999.9 cells
// is 999 cells and the file that asked for 999.9 has been told a different
// number than the one it wrote. That is a silent lie about a size, which is the
// shape of bug section 1.2 exists to prevent.
func TestLoadRefusesFractionalCounts(t *testing.T) {
	for _, key := range []string{
		"max_units_per_side", "grid_max_cells", "max_report_events",
		"reference_units_per_side", "roster_leaders_per_unit",
	} {
		text := setKey(t, shippedText(t), "battle", key, "250.5")
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("battle.%s = 250.5 loaded, so it is silently truncated to 250", key)
		}
		if !strings.Contains(err.Error(), "battle."+key) {
			t.Fatalf("the error does not name %s: %v", key, err)
		}
		if !strings.Contains(err.Error(), "whole number") {
			t.Fatalf("the error for %s does not say why a fraction is wrong: %v", key, err)
		}
	}
	t.Log("five fractional counts all refused, each naming itself")
}

// TestLoadRefusesAnAbsurdCellBudget: a cell budget below one cannot hold even a
// one unit field, and the coarsening loop in grid.go would spin. Above a few
// million it is not a budget, it is a memory leak with a comment.
func TestLoadRefusesAnAbsurdCellBudget(t *testing.T) {
	// 1 and 2 are below the 2x2 floor the index can build at, so they are the
	// values that used to spin the coarsening loop forever.
	for _, bad := range []string{"1", "2", "0", "0.5", "9000000"} {
		text := setKey(t, shippedText(t), "battle", "grid_max_cells", bad)
		if _, err := Load(writeFile(t, text)); err == nil {
			t.Fatalf("battle.grid_max_cells = %s loaded", bad)
		}
	}
	t.Log("cell budget refused at 1, 2 (below the 2x2 floor), 0, 0.5, and 9e6")
}

// TestLoadRefusesAnAbsurdSimulatedLength: tick_seconds and max_ticks multiply
// into the longest battle the engine will simulate. Their individual ranges both
// permit a product of years, and a run that reaches it burns real wall clock to
// discover a typo in one factor.
func TestLoadRefusesAnAbsurdSimulatedLength(t *testing.T) {
	// 100 s a tick for the 1,000,000 ticks both ranges allow is over three years
	// of simulated fighting, and passes both individual bound checks.
	text := setKey(t, shippedText(t), "battle", "tick_seconds", "100")
	text = setKey(t, text, "battle", "max_ticks", "1000000")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a three year battle loaded, so the tick bound can be a typo nobody notices until a run")
	}
	if !strings.Contains(err.Error(), "tick_seconds") || !strings.Contains(err.Error(), "max_ticks") {
		t.Fatalf("the error does not name both factors of the product: %v", err)
	}
	t.Logf("absurd length: %v", err)
}

// TestLoadRefusesAZeroReportBound: a report that keeps no events reports a battle
// that did nothing, and every "this battle was quiet" conclusion drawn from it
// would be an artefact of the bound rather than of the fight.
func TestLoadRefusesAZeroReportBound(t *testing.T) {
	for _, key := range []string{"max_report_events", "roster_leaders_per_unit", "roster_leader_spread"} {
		text := setKey(t, shippedText(t), "battle", key, "0")
		if _, err := Load(writeFile(t, text)); err == nil {
			t.Fatalf("battle.%s = 0 loaded", key)
		}
	}
	t.Log("zero event bound, zero men per commander, and zero leader spread all refused")
}

// TestLoadNamesAMissingBattleSizeKey: deleting a size key from the file must be
// an error naming the key, not a constant silently left at zero. A size that
// reads as zero is a battle that fields nobody, and the file that stopped
// saying so is the whole problem.
func TestLoadNamesAMissingBattleSizeKey(t *testing.T) {
	for _, key := range []string{
		"max_units_per_side", "grid_max_cells", "max_report_events",
		"reference_units_per_side", "roster_leaders_per_unit", "roster_leader_spread",
	} {
		text := deleteKey(t, shippedText(t), "battle", key)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("[battle] missing %s loaded anyway, so a size would be a silent zero", key)
		}
		if !strings.Contains(err.Error(), "battle."+key) {
			t.Fatalf("the error does not name %s: %v", key, err)
		}
	}
	t.Log("all six size keys named when missing")
}

// TestBattleSizeKnobsAreSettable proves the direction the brief cares about: the
// same file, loaded twice with one number changed, yields two different sizes
// and no error either way. This is the config half of the two-size run; the
// engine half is the headless battle in internal/battle.
func TestBattleSizeKnobsAreSettable(t *testing.T) {
	for _, size := range []string{"50", "100", "500", "2000"} {
		text := setKey(t, shippedText(t), "battle", "reference_units_per_side", size)
		c, err := Load(writeFile(t, text))
		if err != nil {
			t.Fatalf("reference_units_per_side = %s did not load: %v", size, err)
		}
		if got := int(c.Battle.ReferenceUnitsPerSide); got != atoiOrFail(t, size) {
			t.Fatalf("asked for %s units a side and the file says %d", size, got)
		}
		if c.Battle.ReferenceUnitsPerSide > c.Battle.MaxUnitsPerSide {
			t.Fatalf("a size of %s is above the shipped limit of %g, so this case proves nothing",
				size, c.Battle.MaxUnitsPerSide)
		}
	}
	t.Log("50, 100, 500, and 2000 units a side all load from the same file with one line changed")
}

// TestLayoutAndCombatKnobsLoad is the load half of the second sweep: every
// number that used to be a literal in the engine comes back from the file, at a
// non-zero value, and can be set to a value no shipped file would hold.
//
// A zero here is a number the engine would have to invent, which is the failure
// CONSTITUTION.md section 1.2 exists to prevent: the battle would still run, on
// constants nobody chose and nobody could find.
func TestLayoutAndCombatKnobsLoad(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	got := map[string]float64{
		"roster_front_aspect":               c.Battle.RosterFrontAspect,
		"roster_leader_depth_fraction":       c.Battle.RosterLeaderDepthFraction,
		"roster_leader_jitter_fraction":      c.Battle.RosterLeaderJitterFraction,
		"roster_leader_influence_floor":      c.Battle.RosterLeaderInfluenceFloor,
		"roster_leader_influence_spread":     c.Battle.RosterLeaderInfluenceSpread,
		"roster_morale_bias_scale":           c.Battle.RosterMoraleBiasScale,
		"melee_ranged_skill_scale":           c.Battle.MeleeRangedSkillScale,
		"ranged_hit_chance_base":             c.Battle.RangedHitChanceBase,
		"ranged_hit_chance_skill_weight":     c.Battle.RangedHitChanceSkillWeight,
		"ranged_hit_effectiveness_floor":     c.Battle.RangedHitEffectivenessFloor,
		"morale_recovery_suppression_band":   c.Battle.MoraleRecoverySuppressionBand,
	}
	for key, v := range got {
		if v == 0 {
			t.Errorf("battle.%s came back as zero, so the engine would be reading nothing", key)
		}
	}
	// Each one is settable, and a settable knob is a knob. The values are
	// deliberately not the shipped ones.
	for key, v := range map[string]string{
		"roster_front_aspect":             "8",
		"roster_leader_depth_fraction":     "0.75",
		"roster_leader_jitter_fraction":    "0",
		"roster_leader_influence_floor":    "1",
		"roster_leader_influence_spread":   "0",
		"roster_morale_bias_scale":         "1",
		"melee_ranged_skill_scale":         "1",
// 0.55 is the most this one can be while the shipped 0.45 skill weight still
		// leaves a perfect shooter short of a certain hit; the sum rule below has
		// its own test.
		"ranged_hit_chance_base":           "0.55",
		"ranged_hit_chance_skill_weight":   "0.05",
		"ranged_hit_effectiveness_floor":   "0",
		"morale_recovery_suppression_band": "0.99",
	} {
		text := setKey(t, shippedText(t), "battle", key, v)
		edited, err := Load(writeFile(t, text))
		if err != nil {
			t.Errorf("battle.%s = %s did not load: %v", key, v, err)
			continue
		}
		if !strings.Contains(fmt.Sprintf("%g", fieldOf(edited.Battle, key)), v) {
			t.Errorf("battle.%s was set to %s and the file came back as %g", key, v,
				fieldOf(edited.Battle, key))
		}
	}
	t.Logf("%d formerly literal engine numbers load from the file and are all settable", len(got))
}

// TestLoadRefusesAnImpossibleLayout: the layout shape of a force is a size
// number like any other, and the two ends of its range are both nonsense. Zero
// lays a force out as a column one unit deep, which is a shape the rest of the
// engine has no opinion about and no test would notice; the hard ceiling is
// memory-shaped, a hundred to one.
func TestLoadRefusesAnImpossibleLayout(t *testing.T) {
	for _, bad := range []string{"0", "0.05", "-3", "51", "1000"} {
		text := setKey(t, shippedText(t), "battle", "roster_front_aspect", bad)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Fatalf("battle.roster_front_aspect = %s loaded", bad)
		}
		if !strings.Contains(err.Error(), "battle.roster_front_aspect") {
			t.Fatalf("the error does not name the key: %v", err)
		}
	}
	t.Log("zero, a sliver, a negative, and two absurd layout aspects all refused by name")
}

// TestLoadRefusesAnImpossibleHitChance: each of the three numbers of the
// shooting skill term is a share of a chance, so each is bounded as one. A base
// of 1.4 is not a hard shooter, it is a field of men who cannot miss, and a
// floor of 1 means routing a shooter costs a formation nothing.
func TestLoadRefusesAnImpossibleHitChance(t *testing.T) {
	for _, key := range []string{
		"ranged_hit_chance_base", "ranged_hit_chance_skill_weight", "ranged_hit_effectiveness_floor",
	} {
		for _, bad := range []string{"1.5", "-0.2", "2"} {
			text := setKey(t, shippedText(t), "battle", key, bad)
			if _, err := Load(writeFile(t, text)); err == nil {
				t.Errorf("battle.%s = %s loaded", key, bad)
			}
		}
	}
	t.Log("three hit-chance shares each refused above 1 and below 0")
}

// TestLoadRefusesAPerfectShooter: the two halves of the shooting skill term are
// individually legal and jointly absurd, which is exactly the case a range check
// cannot catch. A base of 0.9 and a weight of 0.9 passes both bound checks and
// makes a perfect shooter hit every shot, so skill stops being a difficulty
// setting and becomes the only thing that matters.
func TestLoadRefusesAPerfectShooter(t *testing.T) {
	text := setKey(t, shippedText(t), "battle", "ranged_hit_chance_base", "0.9")
	text = setKey(t, text, "battle", "ranged_hit_chance_skill_weight", "0.9")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a base of 0.9 plus a skill weight of 0.9 loaded, so a perfect shooter cannot miss")
	}
	if !strings.Contains(err.Error(), "ranged_hit_chance_base") ||
		!strings.Contains(err.Error(), "ranged_hit_chance_skill_weight") {
		t.Fatalf("the error does not name both halves of the sum: %v", err)
	}
	t.Logf("both halves legal, sum over 1: %v", err)
}

// TestLoadRefusesAMoraleBandThatPinsNobody: the recovery band is a share of full
// suppression, and a band of 1 says a unit at maximum suppression has its head
// up, which makes the whole suppression term unable to hold anyone's morale
// down. The range bound accepts 1 because a share can be a whole one; this is
// the reason it must not be.
func TestLoadRefusesAMoraleBandThatPinsNobody(t *testing.T) {
	text := setKey(t, shippedText(t), "battle", "morale_recovery_suppression_band", "1.0")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a recovery band of 1 loaded, so a pinned unit counts as out of contact")
	}
	if !strings.Contains(err.Error(), "morale_recovery_suppression_band") {
		t.Fatalf("the error does not name the key: %v", err)
	}
	t.Logf("recovery band of 1: %v", err)
}

// TestLoadNamesAMissingLayoutKey: a knob nobody reads because the file stopped
// saying it is the same failure as a knob nobody wrote.
func TestLoadNamesAMissingLayoutKey(t *testing.T) {
	for _, key := range []string{
		"roster_front_aspect", "roster_leader_depth_fraction", "roster_leader_jitter_fraction",
		"roster_leader_influence_floor", "roster_leader_influence_spread",
		"roster_morale_bias_scale", "melee_ranged_skill_scale",
		"ranged_hit_chance_base", "ranged_hit_chance_skill_weight", "ranged_hit_effectiveness_floor",
		"morale_recovery_suppression_band",
	} {
		text := deleteKey(t, shippedText(t), "battle", key)
		_, err := Load(writeFile(t, text))
		if err == nil {
			t.Errorf("[battle] missing %s loaded anyway, so the engine would read a silent zero", key)
			continue
		}
		if !strings.Contains(err.Error(), "battle."+key) {
			t.Errorf("the error for the missing %s does not name it: %v", key, err)
		}
	}
	t.Log("all eleven new keys named when missing")
}

// fieldOf reads one [battle] value out of a loaded Config by its file name, so
// this file can assert about a knob without a field per knob.
func fieldOf(b Battle, key string) float64 {
	switch key {
	case "roster_front_aspect":
		return b.RosterFrontAspect
	case "roster_leader_depth_fraction":
		return b.RosterLeaderDepthFraction
	case "roster_leader_jitter_fraction":
		return b.RosterLeaderJitterFraction
	case "roster_leader_influence_floor":
		return b.RosterLeaderInfluenceFloor
	case "roster_leader_influence_spread":
		return b.RosterLeaderInfluenceSpread
	case "roster_morale_bias_scale":
		return b.RosterMoraleBiasScale
	case "melee_ranged_skill_scale":
		return b.MeleeRangedSkillScale
	case "ranged_hit_chance_base":
		return b.RangedHitChanceBase
	case "ranged_hit_chance_skill_weight":
		return b.RangedHitChanceSkillWeight
	case "ranged_hit_effectiveness_floor":
		return b.RangedHitEffectivenessFloor
	case "morale_recovery_suppression_band":
		return b.MoraleRecoverySuppressionBand
	default:
		return -1
	}
}

// atoiOrFail parses a decimal integer written in a test, failing the test rather
// than returning zero, so a typo in a test case cannot silently assert that a
// knob is broken.
func atoiOrFail(t *testing.T, s string) int {
	t.Helper()
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			t.Fatalf("not a decimal integer: %q", s)
		}
		n = n*10 + int(r-'0')
	}
	return n
}
