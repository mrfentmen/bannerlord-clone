package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// This file covers the loader guarantees that apply to the [formation] section
// specifically, because that section used to be read by a second, private parser
// inside internal/formation and those guarantees moved here when it stopped.
//
// Every test edits a COPY of the shipped balance file rather than a hand-written
// stub, so the file that ships is the one under test and a change to it cannot
// make a test quietly stop testing anything.

const shippedBalance = "../../config/balance.toml"

func shippedText(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(shippedBalance)
	if err != nil {
		t.Fatalf("reading %s: %v", shippedBalance, err)
	}
	return string(raw)
}

// writeFile puts text in a temp file and returns its path.
func writeFile(t *testing.T, text string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "balance.toml")
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// setKey replaces the value of one key inside one section and returns the new
// text. It fails the test if the key is not there, so a typo in a test cannot
// turn into a passing test.
func setKey(t *testing.T, text, section, key, value string) string {
	t.Helper()
	lines := strings.Split(text, "\n")
	start, end, ok := sectionLines(lines, section)
	if !ok {
		t.Fatalf("no [%s] section in the balance file", section)
	}
	for i := start; i < end; i++ {
		if strings.HasPrefix(lines[i], key+" ") || strings.HasPrefix(lines[i], key+"=") {
			lines[i] = key + " = " + value
			return strings.Join(lines, "\n")
		}
	}
	t.Fatalf("[%s] has no key %q to replace", section, key)
	return ""
}

// deleteKey removes one key line from one section.
func deleteKey(t *testing.T, text, section, key string) string {
	t.Helper()
	lines := strings.Split(text, "\n")
	start, end, ok := sectionLines(lines, section)
	if !ok {
		t.Fatalf("no [%s] section in the balance file", section)
	}
	for i := start; i < end; i++ {
		if strings.HasPrefix(lines[i], key+" ") || strings.HasPrefix(lines[i], key+"=") {
			return strings.Join(append(lines[:i:i], lines[i+1:]...), "\n")
		}
	}
	t.Fatalf("[%s] has no key %q to delete", section, key)
	return ""
}

// sectionLines finds the line range of a [section] body, excluding the header
// and the next section.
func sectionLines(lines []string, section string) (start, end int, ok bool) {
	header := "[" + section + "]"
	start = -1
	for i, line := range lines {
		if strings.TrimSpace(line) != header {
			continue
		}
		start = i + 1
		break
	}
	if start < 0 {
		return 0, 0, false
	}
	for i := start; i < len(lines); i++ {
		if strings.HasPrefix(strings.TrimSpace(lines[i]), "[") {
			return start, i, true
		}
	}
	return start, len(lines), true
}

// TestShippedBalanceLoads is the floor: the file the service ships must load,
// and all twenty-seven formation constants must come back with the values the
// file states rather than as zeroes.
func TestShippedBalanceLoads(t *testing.T) {
	c, err := Load(shippedBalance)
	if err != nil {
		t.Fatalf("the shipped balance file does not load: %v", err)
	}
	got := map[string]float64{
		"front_spacing":            c.Formation.FrontSpacing,
		"rank_spacing":             c.Formation.RankSpacing,
		"line_front_width":         c.Formation.LineFrontWidth,
		"column_front_width":       c.Formation.ColumnFrontWidth,
		"wedge_tip_units":          c.Formation.WedgeTipUnits,
		"wedge_row_growth":         c.Formation.WedgeRowGrowth,
		"loose_spacing":            c.Formation.LooseSpacing,
		"loose_jitter_fraction":    c.Formation.LooseJitterFraction,
		"loose_seed":               c.Formation.LooseSeed,
		"min_separation":           c.Formation.MinSeparation,
		"separation_iterations":    c.Formation.SeparationIterations,
		"separation_push_fraction": c.Formation.SeparationPushFraction,
		"separation_push_max":      c.Formation.SeparationPushMax,
		"hold_speed":               c.Formation.HoldSpeed,
		"advance_speed":            c.Formation.AdvanceSpeed,
		"charge_speed":             c.Formation.ChargeSpeed,
		"flank_speed":              c.Formation.FlankSpeed,
		"retreat_speed":            c.Formation.RetreatSpeed,
		"turn_rate":                c.Formation.TurnRate,
		"face_turn_rate_scale":     c.Formation.FaceTurnRateScale,
		"face_enemy_weight":        c.Formation.FaceEnemyWeight,
		"advance_standoff":         c.Formation.AdvanceStandoff,
		"charge_standoff":          c.Formation.ChargeStandoff,
		"retreat_distance":         c.Formation.RetreatDistance,
		"flank_standoff":           c.Formation.FlankStandoff,
		"flank_sweep_deg":          c.Formation.FlankSweepDeg,
		"flank_sweep_rate_deg":     c.Formation.FlankSweepRateDeg,
	}
	if len(got) != 27 {
		t.Fatalf("this test reads %d formation keys, the section defines 27", len(got))
	}
	// Every key the balance file documents a minimum above zero for must be
	// non-zero here: a zero would mean the mapping was not wired up at all, and
	// a simulation with no spacing and no speed would still run.
	neverZero := map[string]float64{
		"front_spacing": c.Formation.FrontSpacing, "rank_spacing": c.Formation.RankSpacing,
		"line_front_width": c.Formation.LineFrontWidth, "column_front_width": c.Formation.ColumnFrontWidth,
		"wedge_tip_units": c.Formation.WedgeTipUnits, "wedge_row_growth": c.Formation.WedgeRowGrowth,
		"loose_spacing": c.Formation.LooseSpacing, "min_separation": c.Formation.MinSeparation,
		"separation_push_max": c.Formation.SeparationPushMax, "hold_speed": c.Formation.HoldSpeed,
		"advance_speed": c.Formation.AdvanceSpeed, "charge_speed": c.Formation.ChargeSpeed,
		"flank_speed": c.Formation.FlankSpeed, "retreat_speed": c.Formation.RetreatSpeed,
		"turn_rate": c.Formation.TurnRate, "face_turn_rate_scale": c.Formation.FaceTurnRateScale,
		"flank_sweep_deg": c.Formation.FlankSweepDeg, "flank_sweep_rate_deg": c.Formation.FlankSweepRateDeg,
	}
	for key, v := range neverZero {
		if got[key] != v || v == 0 {
			t.Errorf("formation.%s came back as %g", key, got[key])
		}
	}
	t.Logf("loaded 27 formation constants, %d of which document a minimum above zero", len(neverZero))
}

// TestLoadNamesAMissingFormationKey: a section read by a second private parser
// used to be invisible here, so a key that only that parser fetched could be
// deleted from the file and this loader would never say so. It must name the
// key instead of leaving the constant at zero.
func TestLoadNamesAMissingFormationKey(t *testing.T) {
	text := deleteKey(t, shippedText(t), "formation", "turn_rate")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a [formation] section missing turn_rate loaded anyway, so a missing speed would be a silent zero")
	}
	if !strings.Contains(err.Error(), "formation.turn_rate") {
		t.Fatalf("the error does not name the key: %v", err)
	}
	t.Logf("missing key: %v", err)
}

// TestLoadNamesAMissedFormationSection: with the whole section gone, every one
// of its keys must be named at once rather than one per run.
func TestLoadNamesAMissedFormationSection(t *testing.T) {
	lines := strings.Split(shippedText(t), "\n")
	start, end, ok := sectionLines(lines, "formation")
	if !ok {
		t.Fatal("the shipped file has no [formation] section to remove")
	}
	text := strings.Join(append(lines[:start-1:start-1], lines[end:]...), "\n")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a balance file with no [formation] section loaded anyway")
	}
	var missing *MissingError
	if !asMissing(err, &missing) {
		t.Fatalf("expected a MissingError, got %T: %v", err, err)
	}
	// Every key in the section, counted from the file rather than written here as
	// a literal. A hard-coded count is a second list of the keys that goes stale
	// the moment one is added, and the failure it produces is a test that stops
	// testing the thing it was written for.
	want := countKeys(shippedText(t), "formation")
	if len(missing.Keys) != want {
		t.Errorf("removing the section reported %d missing keys, it should report all %d: %v", len(missing.Keys), want, missing.Keys)
	}
	t.Logf("missing section reported %d keys", len(missing.Keys))
}

// countKeys is how many keys a section of a balance file holds, read from the
// file itself so the expected count of a missing-section test cannot drift away
// from the section it is checking.
func countKeys(text, section string) int {
	lines := strings.Split(text, "\n")
	start, end, ok := sectionLines(lines, section)
	if !ok {
		return 0
	}
	n := 0
	for _, line := range lines[start:end] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		n++
	}
	return n
}

// TestLoadRefusesAnUnreadFormationKey is the typo check. A misspelled key in the
// balance file means the constant the designer meant to change is not being read
// at all, and the code is using a different one.
func TestLoadRefusesAnUnreadFormationKey(t *testing.T) {
	text := shippedText(t) + "line_front_widht = 16.0\n"
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a misspelled [formation] key loaded anyway")
	}
	if !strings.Contains(err.Error(), "line_front_widht") {
		t.Fatalf("the error does not name the unread key: %v", err)
	}
	t.Logf("unread key: %v", err)
}

// TestLoadRefusesAnOutOfRangeFormationKey: the bound is the one the balance
// file's own comment documents, enforced in code because a comment does not stop
// anyone typing a value.
func TestLoadRefusesAnOutOfRangeFormationKey(t *testing.T) {
	text := setKey(t, shippedText(t), "formation", "advance_speed", "40") // faster than a man can run
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("a 40 m/s advance speed loaded, so the range in the balance comment is not enforced")
	}
	if !strings.Contains(err.Error(), "formation.advance_speed") {
		t.Fatalf("the error does not name the key: %v", err)
	}
	t.Logf("out of range: %v", err)
}

// TestLoadRefusesMinSeparationWiderThanTheShape: a spacing pass that defends a
// wider gap than the shape produces spends every tick shoving men off the slot
// they are trying to reach, so the formation never forms up.
func TestLoadRefusesMinSeparationWiderThanTheShape(t *testing.T) {
	text := setKey(t, shippedText(t), "formation", "min_separation", "99")
	_, err := Load(writeFile(t, text))
	if err == nil {
		t.Fatal("min_separation wider than any shape's gap loaded, so the spacing pass would fight the shape")
	}
	t.Logf("bad separation: %v", err)
}

// TestLoadAcceptsDocumentedZeroes is the check on the other side of the above.
// Nine formation keys document zero as a legal setting, and each of those zeroes
// is a decision a designer can make on purpose. A loader that treated zero as
// "the key is missing" would tell the designer to invent a value they
// deliberately set to nothing.
func TestLoadAcceptsDocumentedZeroes(t *testing.T) {
	text := shippedText(t)
	for key, value := range map[string]string{
		"loose_jitter_fraction":    "0",
		"separation_iterations":    "0",
		"separation_push_fraction": "0",
		"face_enemy_weight":        "0",
		"advance_standoff":         "0",
		"charge_standoff":          "0",
		"retreat_distance":         "0",
		"flank_standoff":           "0",
	} {
		text = setKey(t, text, "formation", key, value)
	}
	c, err := Load(writeFile(t, text))
	if err != nil {
		t.Fatalf("a balance file with every documented zero rejected: %v", err)
	}
	if c.Formation.SeparationIterations != 0 || c.Formation.FaceEnemyWeight != 0 ||
		c.Formation.AdvanceStandoff != 0 || c.Formation.ChargeStandoff != 0 {
		t.Errorf("a documented zero did not come back as zero: %+v", c.Formation)
	}
	t.Logf("accepted %d documented zeroes", 8)
}

// TestEmptyFormationConstantsAreRefused is the CONSTITUTION.md section 1.2
// guard on the central side: a Config that was never filled in has a spacing, a
// width, and a speed of zero, each outside its own documented range.
func TestEmptyFormationConstantsAreRefused(t *testing.T) {
	var c Config
	err := c.validate("in-memory")
	if err == nil {
		t.Fatal("a Config with no constants loaded, so a caller could hand-build one and get zeroes everywhere")
	}
	t.Logf("empty config: %v", err)
}

// asMissing is errors.As for *MissingError without importing errors, kept local
// so the test reads the same on every Go version this repo builds with.
func asMissing(err error, target **MissingError) bool {
	if m, ok := err.(*MissingError); ok {
		*target = m
		return true
	}
	return false
}
