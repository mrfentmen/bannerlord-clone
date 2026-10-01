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
