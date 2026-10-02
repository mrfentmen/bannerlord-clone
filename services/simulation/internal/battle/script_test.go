package battle

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// THE TESTS FOR THE ORDER SCRIPT.
//
// Four claims, and a test for each:
//
//  1. A script survives a round trip through a file byte for byte, so two people
//     who wrote the same battle typed the same file.
//  2. A scripted battle replays from its recorded log exactly as a played battle
//     does, because it is recorded the same way.
//  3. A script that does not make sense is refused with an error naming what is
//     wrong, and never fights a repaired version of itself.
//  4. A golden fixture checked into the repo replays to the result hash it
//     recorded, so a sim change that moves an outcome fails loudly.
//
// # WHY THESE ARE IN internal/battle AND NOT IN THE SIMRUN CLI
//
// The CLI is one command that runs a script; the format is the thing that has to be
// right, and the format belongs next to the order log it is a second spelling of.
// A CLI test would exercise the same code with more indirection in the way.

// scriptTestRoster is the force the script tests use.
//
// Four units a side: small enough that a battle resolves in a few hundred ticks, and
// large enough that unit ids, sides, and formations are all distinguishable. The unit
// count is also what makes the positional-id check testable: side A is units 0 to 3
// and side B is units 4 to 7, so unit 3 and unit 5 are both real and on different
// sides.
const scriptTestRoster = 4

// goldenScript builds a small script with one step of each kind in it.
//
// The three order kinds are all here because they are three different rows in a log
// and three different writes into the command channel: a move sets the movement
// channel, a hold sets it to no movement with an intent, and a formation leaves the
// movement channel silent and publishes a shape. A script format that could only
// express a move would be a format that could not describe most of what the seam can
// say.
func goldenScript() *Script {
	s := &Script{
		Name: "scripted-4v4",
		Seed: 20260930,
		A:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Company", "open"),
		B:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Host", "open"),
	}
	// Deliberately out of tick order in the source, so the encoder's sort is doing
	// something the test can see rather than merely agreeing with the input.
	s.Steps = []Order{
		{Tick: 20, Unit: 3, Side: SideA, Kind: OrderMove, Intent: IntentAdvance, DX: 1.25, DY: -0.5},
		{Tick: 0, Unit: 0, Side: SideA, Kind: OrderHold, Intent: IntentHold, Source: "pinned to the ford"},
		{Tick: 10, Unit: 5, Side: SideB, Kind: OrderFormation, Intent: IntentEngage,
			Formation: FormationWedge, Facing: 0.25},
	}
	return s
}

// TestScriptSurvivesEncodeAndDecode is claim 1: the file format is stable.
//
// The assertion is byte equality of encode(decode(encode(s))) against encode(s), not
// field equality. Field equality would pass with a decoder that dropped a field the
// engine reads, as long as the drop was symmetric; byte equality fails the moment the
// file a person saves and the file this build writes disagree, which is the only
// version of "stable" that makes a checked-in fixture reviewable.
func TestScriptSurvivesEncodeAndDecode(t *testing.T) {
	first, err := EncodeScript(goldenScript())
	if err != nil {
		t.Fatalf("encoding the script failed: %v", err)
	}
	s, err := DecodeScript(first)
	if err != nil {
		t.Fatalf("decoding the script failed: %v\n%s", err, first)
	}
	second, err := EncodeScript(s)
	if err != nil {
		t.Fatalf("re-encoding the script failed: %v", err)
	}
	if string(first) != string(second) {
		t.Fatalf("the script did not survive a round trip:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
	// The header must not carry the steps, or every scripted battle is one line and a
	// diff hides the step that changed.
	if n := strings.Count(string(first), "\n"); n != 1+len(s.Steps) {
		t.Errorf("the encoded script is %d lines for %d steps; the header and one line per step were "+
			"expected, so the steps are not one object each", n, len(s.Steps))
	}
	// And the sorted tick order is the order the steps are written in, whatever order
	// they were authored in.
	wantTicks := []int{0, 10, 20}
	for i, st := range s.Steps {
		if st.Tick != wantTicks[i] {
			t.Errorf("step %d decoded for tick %d, want %d: the file is written in tick order, and a "+
				"decoder that read it any other way would fight a different battle", i, st.Tick, wantTicks[i])
		}
	}
	// The derived side is the roster's answer, not the authored one. goldenScript sets
	// the right sides by hand; a decoder that trusted them would still pass here, so
	// the check that matters is that they are derived at all, which the assertion
	// below pins by asking for a side the roster contradicts.
	t.Logf("encoded script:\n%s", first)
}

// TestScriptSideIsDerivedFromTheRosterNotAuthored is the other half of the same
// property.
//
// A script is allowed to carry a wrong side on a step, because the format has no side
// field to carry one: the decoder reads the step, works out the side from the unit id,
// and writes that. This test asks for it explicitly, because a decoder that copied a
// side through would be a second source of truth for something the roster decides, and
// the bug it causes is invisible until a roster is edited.
func TestScriptSideIsDerivedFromTheRosterNotAuthored(t *testing.T) {
	s := goldenScript()
	// Say the opposite of the truth on every step. A decoder that read a side field
	// would produce a log whose rows disagree with the roster.
	for i := range s.Steps {
		if s.Steps[i].Unit < scriptTestRoster {
			s.Steps[i].Side = SideB
		} else {
			s.Steps[i].Side = SideA
		}
	}
	enc, err := EncodeScript(s)
	if err != nil {
		t.Fatalf("encoding failed: %v", err)
	}
	back, err := DecodeScript(enc)
	if err != nil {
		t.Fatalf("decoding failed: %v", err)
	}
	for _, st := range back.Steps {
		want := SideA
		if st.Unit >= scriptTestRoster {
			want = SideB
		}
		if st.Side != want {
			t.Errorf("unit %d came back on side %s, want %s: the side is the roster's answer and the "+
				"author does not get a vote", st.Unit, st.Side, want)
		}
	}
}

// TestScriptedBattleReplaysFromItsOwnLog is claim 2: a script is a real replay.
//
// This is the test the whole file exists to make possible. A scripted battle is
// recorded, its log is encoded to bytes, those bytes are decoded, and the decoded log
// is replayed. The replay's result hash must equal the original's. If the script had
// its own movement path this would still pass while telling us nothing, so the proof
// that it does not is structural and is stated in script.go: the script is played
// through the same View.Commands channel and recorded by the same Recorder.
func TestScriptedBattleReplaysFromItsOwnLog(t *testing.T) {
	cfg := loadConfig(t)
	res, rec, err := RunScript(cfg, goldenScript(), 0)
	if err != nil {
		t.Fatalf("running the script failed: %v", err)
	}
	if rec.Log.Len() != len(rec.Log.Rows()) {
		t.Fatalf("the log says it holds %d rows and read back %d", rec.Log.Len(), len(rec.Log.Rows()))
	}
	if rec.Log.Len() != 3 {
		t.Errorf("a script of %d steps recorded %d orders; every step should reach the field",
			len(goldenScript().Steps), rec.Log.Len())
	}
	if rec.Log.Truncated() {
		t.Fatalf("the log refused rows, so it is not replayable and this test is measuring nothing")
	}
	encoded, err := rec.Log.Encode(rec.Seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the log failed: %v", err)
	}
	// The file, not the Recording. This is the shape a caller has after saving a
	// battle and coming back later: bytes, and the seed and balance version inside
	// them.
	check, err := VerifyEncoded(cfg, encoded, rec.Setup, res)
	if err != nil {
		t.Fatalf("verifying the scripted battle from its own bytes failed: %v", err)
	}
	if !check.Match {
		t.Fatalf("the scripted battle did not replay from its own log:\n%v", check)
	}
	t.Logf("scripted battle: %v", check)
}

// TestScriptRefusesWhatItCannotFight is claim 3: no quiet repairs.
//
// Every case here is a script a person could plausibly write by mistake. Each one has
// to produce an error naming the problem, because the alternative is a battle fought
// from a repaired script and a result reported as though the written one had run. The
// last case in the set is the one that matters most: two orders for one unit on one
// tick, which the command channel would silently resolve in favour of the second.
func TestScriptRefusesWhatItCannotFight(t *testing.T) {
	cases := []struct {
		name string
		// edit returns the script bytes to feed the decoder.
		edit func(hdr string, steps []string) []byte
		want string
	}{
		{
			name: "an order kind nobody has",
			edit: func(hdr string, _ []string) []byte {
				return joinScript(hdr, []string{`{"tick":0,"unit":0,"order":"charge"}`})
			},
			want: `"charge" is not an order kind`,
		},
		{
			name: "an intent nobody has",
			edit: func(hdr string, _ []string) []byte {
				return joinScript(hdr, []string{`{"tick":0,"unit":0,"order":"move","intent":"advnce"}`})
			},
			want: `intent "advnce"`,
		},
		{
			name: "a formation nobody has",
			edit: func(hdr string, _ []string) []byte {
				return joinScript(hdr, []string{`{"tick":0,"unit":0,"order":"formation","formation":"pincer"}`})
			},
			want: `formation "pincer"`,
		},
		{
			name: "a formation order naming no shape",
			edit: func(hdr string, _ []string) []byte {
				return joinScript(hdr, []string{`{"tick":0,"unit":0,"order":"formation"}`})
			},
			want: "a formation order with no shape",
		},
		{
			name: "a unit the roster does not have",
			edit: func(hdr string, _ []string) []byte {
				// 4 v 4 builds units 0 to 7, so 9 does not exist.
				return joinScript(hdr, []string{`{"tick":0,"unit":9,"order":"hold"}`})
			},
			want: "unit ids are positional",
		},
		{
			name: "two orders for one unit on one tick",
			edit: func(hdr string, steps []string) []byte {
				// Three steps, so this case fails on the duplicate and not on the
				// count: a test that tripped two refusals would pass if only one of
				// them was ever implemented.
				return joinScript(hdr, []string{
					`{"tick":3,"unit":1,"order":"hold"}`,
					`{"tick":3,"unit":1,"order":"move","dx":1}`,
					steps[2],
				})
			},
			want: "has one slot per unit",
		},
		{
			name: "steps going backwards in time",
			edit: func(hdr string, _ []string) []byte {
				return joinScript(hdr, []string{
					`{"tick":9,"unit":0,"order":"hold"}`,
					`{"tick":4,"unit":1,"order":"hold"}`,
				})
			},
			want: "non-decreasing tick order",
		},
		{
			name: "a truncated file",
			edit: func(hdr string, steps []string) []byte {
				// The header claims three steps and the file carries one.
				hdr = strings.Replace(hdr, `"steps":3`, `"steps":3`, 1)
				return joinScript(hdr, steps[:1])
			},
			want: "the file is incomplete",
		},
		{
			name: "a file from the future",
			edit: func(hdr string, steps []string) []byte {
				return joinScript(strings.Replace(hdr, `"version":1`, `"version":2`, 1), steps)
			},
			want: "format version 2",
		},
		{
			name: "an order log where a script belongs",
			edit: func(hdr string, steps []string) []byte {
				return joinScript(strings.Replace(hdr, `"battle_script"`, `"order_log"`, 1), steps)
			},
			want: `this is a "order_log" file`,
		},
	}
	cfg := loadConfig(t)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			enc, err := EncodeScript(goldenScript())
			if err != nil {
				t.Fatalf("encoding the reference script failed: %v", err)
			}
			lines := strings.Split(strings.TrimRight(string(enc), "\n"), "\n")
			hdr, steps := lines[0], lines[1:]
			if len(steps) != 3 {
				t.Fatalf("the reference script encoded to %d step lines, want 3", len(steps))
			}
			_, err = DecodeScript(tc.edit(hdr, steps))
			if err == nil {
				t.Fatalf("the decoder accepted it and would have fought a repaired version of a script " +
					"nobody wrote")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("the error does not name the problem. wanted %q in:\n%v", tc.want, err)
			}
			t.Logf("refused: %v", err)
		})
	}
	// The control matters as much as the cases: the same decoder must accept the
	// script the cases above are edits of, or "refused" proves nothing.
	enc, err := EncodeScript(goldenScript())
	if err != nil {
		t.Fatalf("encoding failed: %v", err)
	}
	if _, err := DecodeScript(enc); err != nil {
		t.Fatalf("the unedited script was refused: %v", err)
	}
	if cfg == nil {
		t.Fatal("loadConfig returned nil")
	}
}

// joinScript assembles a script file from a header line and step lines.
func joinScript(hdr string, steps []string) []byte {
	return []byte(hdr + "\n" + strings.Join(steps, "\n") + "\n")
}

// TestScriptTerrainAndRosterAreRefusedWhenTheyCannotFight covers the two script
// fields that describe the battle rather than an order.
//
// Both are refusals rather than defaults because both defaults would be a lie: a
// script asking for forest terrain that silently got open ground would fight a battle
// the author did not write and report it as theirs, and a side with no units that
// quietly became a one-unit side would be the same.
func TestScriptTerrainAndRosterAreRefusedWhenTheyCannotFight(t *testing.T) {
	t.Run("terrain the engine does not model", func(t *testing.T) {
		s := goldenScript()
		s.A.Terrain = "forest"
		_, _, err := RunScript(loadConfig(t), s, 0)
		if err == nil {
			t.Fatal("a script asked for forest and fought on open ground")
		}
		if !strings.Contains(err.Error(), `side A asks for "forest" ground`) {
			t.Errorf("the error does not name the terrain that is missing:\n%v", err)
		}
		t.Logf("refused: %v", err)
	})
	t.Run("two sides on different ground", func(t *testing.T) {
		// Both names are modelled and both mean open ground, so this case reaches the
		// disagreement rule rather than the "not modelled" one. It is worth having:
		// the engine treats TerrainOpen as one value, so the disagreement is a
		// statement about the script's intent rather than about the engine's
		// capability, and a script that says "open" on one side and "level" on the
		// other is a script with two answers to one question.
		s := goldenScript()
		s.B.Terrain = "level"
		_, _, err := RunScript(loadConfig(t), s, 0)
		if err == nil {
			t.Fatal("a script put the two sides on different ground and one of them won")
		}
		if !strings.Contains(err.Error(), "both sides have to be on the same ground") {
			t.Errorf("the error does not explain the rule:\n%v", err)
		}
		t.Logf("refused: %v", err)
	})
	t.Run("a side with no units", func(t *testing.T) {
		s := goldenScript()
		s.B.Units = 0
		_, _, err := RunScript(loadConfig(t), s, 0)
		if err == nil {
			t.Fatal("a script with an empty side fought a battle anyway")
		}
		// The refusal comes from Script.Setup's own roster check, not from the
		// decoder: a script assembled in Go never reaches DecodeScript, so the rule
		// has to hold on both paths and this is the test for the Go one.
		if !strings.Contains(err.Error(), "each needs at least one unit") {
			t.Errorf("the error does not explain the rule:\n%v", err)
		}
		t.Logf("refused: %v", err)
	})
	t.Run("a side that is all melee and all shooters", func(t *testing.T) {
		s := goldenScript()
		s.A.NoRanged = true
		s.A.AllRanged = true
		_, _, err := RunScript(loadConfig(t), s, 0)
		if err == nil {
			t.Fatal("a script asked for a side to be both and got one of them")
		}
		if !strings.Contains(err.Error(), "a side is one or the other") {
			t.Errorf("the error does not explain the rule:\n%v", err)
		}
		t.Logf("refused: %v", err)
	})
}

// TestAnEmptyScriptIsABattleNobodyOrdered checks the degenerate case is a real mode.
//
// A script with no steps is the script spelling of TestReplayFromEmptyLogIsTheWhole-
// ProofOfRederivedAI: the engine's own decisions are re-derived from the seed, so a
// battle with an empty log has to replay from an empty log. It is served rather than
// refused because refusing it would mean a generator that produced no orders had to
// special-case its own output.
func TestAnEmptyScriptIsABattleNobodyOrdered(t *testing.T) {
	cfg := loadConfig(t)
	s := &Script{
		Name: "uncommanded",
		Seed: 4242,
		A:    scriptWithRoster(Roster{Units: scriptTestRoster}, "", ""),
		B:    scriptWithRoster(Roster{Units: scriptTestRoster}, "", ""),
	}
	res, rec, err := RunScript(cfg, s, 0)
	if err != nil {
		t.Fatalf("running an empty script failed: %v", err)
	}
	if rec.Log.Len() != 0 {
		t.Fatalf("an empty script recorded %d orders; nobody ordered anything", rec.Log.Len())
	}
	check, err := Verify(cfg, rec, res)
	if err != nil {
		t.Fatalf("verifying an uncommanded battle failed: %v", err)
	}
	if !check.Match {
		t.Fatalf("a battle nobody ordered did not replay:\n%v", check)
	}
	t.Logf("%v", check)
}

// TestScriptedBattlesDifferBySeed is the sanity check for the whole format.
//
// A script that ignored its seed, or ignored its steps, would produce the same battle
// every time and every replay test in the package would pass while proving nothing.
// Both halves are checked: two seeds give two battles, and adding a step gives a
// different battle from the same seed.
func TestScriptedBattlesDifferBySeed(t *testing.T) {
	cfg := loadConfig(t)
	run := func(s *Script) string {
		t.Helper()
		res, _, err := RunScript(cfg, s, 0)
		if err != nil {
			t.Fatalf("running script %q failed: %v", s.Name, err)
		}
		h := res.HashString()
		if h == "0000000000000000" {
			t.Fatalf("script %q hashed to zero, which is the value a Result nobody filled in would "+
				"have", s.Name)
		}
		return h
	}
	a := goldenScript()
	b := goldenScript()
	b.Seed = 20260931
	c := goldenScript()
	c.Steps = append(c.Steps, Order{Tick: 30, Unit: 1, Side: SideA, Kind: OrderMove,
		Intent: IntentAdvance, DX: -0.75})
	c.Steps = sortedSteps(c.Steps)

	hashes := map[string]string{
		"the script as written": run(a),
		"a different seed":      run(b),
		"one more order on it":  run(c),
	}
	seen := map[string]string{}
	for what, h := range hashes {
		if prev, dup := seen[h]; dup {
			t.Errorf("%q and %q both hash to %s; a scripted battle that ignores its seed or its steps "+
				"would make every replay test in this package pass while proving nothing", what, prev, h)
		}
		seen[h] = what
	}
	for what, h := range hashes {
		t.Logf("%-24s %s", what, h)
	}
}

// goldenDir is where the golden fixtures live.
func goldenDir() string { return filepath.Join("testdata", "golden") }

// goldenFixtureEnv re-records the golden fixtures when it is set.
//
// The fixtures are hashes, and a hash is only reviewable if there is a way to produce
// a new one deliberately. Regenerating is therefore a separate, named act rather than
// something the test does when it fails: a test that rewrote its own expectation the
// moment it failed would be a test that could never fail.
const goldenFixtureEnv = "BATTLE_UPDATE_GOLDEN"

// goldenFixture is one checked-in canonical battle.
type goldenFixture struct {
	// Name is the file's base name and the name in test output.
	Name string
	// ResultHash is what the battle must hash to. It is the whole fixture: the
	// script beside it says what the battle is, and the hash says what it came out as.
	ResultHash string
	// Outcome, Ticks, and Orders are carried so a failure can be read without
	// decoding a hash. A diff that says "the winner changed" is actionable; a diff
	// that says "e3b0c442 changed" is not.
	Outcome string
	Ticks   int
	Orders  int
	// Script is the authored battle.
	Script *Script
}

// canonicalGoldens are the three battles the plan asks to be checked in.
//
// Three is the number the plan names, and it is chosen so the set covers the three
// things a battle can be rather than three sizes of one of them:
//
//   - uncommanded: the engine's own decisions, re-derived from the seed, which is the
//     path every other determinism test in this package exercises least;
//   - one side ordered: the command seam under a half-applied plan, which is the case
//     where a replay is most likely to diverge because the two sides are out of step;
//   - both sides ordered: the full loop, and the largest force of the three so the
//     fixture set has a size where the engine does real work.
//
// They are named for what they are rather than numbered, because a reader hitting a
// failure needs to know which shape of battle moved without opening the script.
func canonicalGoldens() []*Script {
	uncommanded := &Script{
		Name: "uncommanded-4v4",
		Seed: 106001,
		A:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Company", "open"),
		B:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Host", "open"),
	}
	oneSide := &Script{
		Name: "one-side-ordered-4v4",
		Seed: 106002,
		A:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Company", "open"),
		B:    scriptWithRoster(Roster{Units: scriptTestRoster}, "the Host", "open"),
		// Side A only. Side B is left entirely to the engine, so this fixture is the
		// one that would break first if the re-derived-AI branch and the recorded-order
		// branch were not in fact the same engine.
		Steps: []Order{
			{Tick: 0, Unit: 0, Kind: OrderHold, Intent: IntentHold},
			{Tick: 4, Unit: 1, Kind: OrderFormation, Intent: IntentAdvance, Formation: FormationWedge},
			{Tick: 60, Unit: 2, Kind: OrderMove, Intent: IntentAdvance, DX: 0.75},
			{Tick: 120, Unit: 3, Kind: OrderHold, Intent: IntentHold},
		},
	}
	bothSides := &Script{
		Name: "both-sides-ordered-8v8",
		Seed: 106003,
		A:    scriptWithRoster(Roster{Units: 8}, "the Company", "open"),
		B:    scriptWithRoster(Roster{Units: 8}, "the Host", "open"),
		// Both sides, and the two sides are given different plans, so a fixture whose
		// orders were being applied to the wrong units would move the outcome rather
		// than reproduce it. That is the whole class of bug the roster fingerprint in
		// Replay exists to catch, and a fixture that could not detect it would be
		// decorative.
		Steps: []Order{
			{Tick: 0, Unit: 0, Kind: OrderFormation, Intent: IntentAdvance, Formation: FormationColumn},
			{Tick: 0, Unit: 8, Kind: OrderFormation, Intent: IntentAdvance, Formation: FormationLine},
			{Tick: 10, Unit: 1, Kind: OrderMove, Intent: IntentAdvance, DX: 1.1, DY: -0.2},
			{Tick: 10, Unit: 9, Kind: OrderMove, Intent: IntentAdvance, DX: -1.1, DY: 0.2},
			{Tick: 40, Unit: 2, Kind: OrderHold, Intent: IntentHold},
			{Tick: 40, Unit: 10, Kind: OrderFormation, Intent: IntentEngage, Formation: FormationSquare},
			{Tick: 90, Unit: 3, Kind: OrderMove, Intent: IntentAdvance, DX: 0.5, DY: 0.5},
			{Tick: 90, Unit: 11, Kind: OrderMove, Intent: IntentAdvance, DX: -0.5, DY: -0.5},
		},
	}
	return []*Script{uncommanded, oneSide, bothSides}
}

// loadGoldens reads every fixture in testdata/golden, and writes the canonical set
// when update is set.
//
// It reads the DIRECTORY rather than the canonical list, so a fixture added by hand is
// checked without anybody editing this file, and a fixture deleted by a bad merge shows
// up as one fewer fixture rather than as silence. TestThereAreThreeCanonicalBattles
// pins the count.
//
// update writes from canonicalGoldens rather than from what it read, because the
// regenerate is a statement about the current engine: it says "these three battles
// hash to these values now". Regenerating from whatever happens to be on disk would
// re-record a corrupted fixture instead of replacing it.
func loadGoldens(t testing.TB, update bool) []goldenFixture {
	t.Helper()
	if update {
		return writeCanonicalGoldens(t)
	}
	entries, err := os.ReadDir(goldenDir())
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatalf("reading the golden fixture directory failed: %v", err)
	}
	var out []goldenFixture
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".script") {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".script")
		enc, err := os.ReadFile(filepath.Join(goldenDir(), e.Name()))
		if err != nil {
			t.Fatalf("reading golden fixture %s failed: %v", e.Name(), err)
		}
		s, err := DecodeScript(enc)
		if err != nil {
			t.Fatalf("golden fixture %s does not decode:\n%v\n%s", e.Name(), err, enc)
		}
		if s.Name != name {
			t.Fatalf("golden fixture %s names itself %q; the .hash file is keyed on the file name, so "+
				"the two have to agree", e.Name(), s.Name)
		}
		// The expectation comes from the FILE, and this is the second thing that
		// has to be true of this loader, the first being that the script file is
		// what it claims to be.
		//
		// It used to come from the fresh run, which is the run being judged, so
		// the fixture's Outcome, Ticks and Orders held what the engine does now.
		// The failure message then printed "ticks now 333, fixture says 333" for
		// a fixture whose file said 483: the diagnostic compared the engine
		// against itself and told a reader trying to work out whether a battle
		// had changed that the tick count had not. The three fields exist so a
		// diff can be read without decoding a hash, and they cannot do that
		// while they are copied from the thing being compared.
		recorded := readGoldenExpectation(t, e.Name(), name)
		got, err := goldenOutcome(loadConfig(t), s)
		if err != nil {
			t.Fatalf("fighting golden fixture %s failed: %v", e.Name(), err)
		}
		got.ResultHash = recorded.ResultHash
		got.Outcome = recorded.Outcome
		got.Ticks = recorded.Ticks
		got.Orders = recorded.Orders
		out = append(out, got)
	}
	return out
}

// writeCanonicalGoldens records the three canonical battles from scratch.
func writeCanonicalGoldens(t testing.TB) []goldenFixture {
	t.Helper()
	// The directory is emptied first. A regenerate that left a stale fixture behind
	// would leave two files for one battle, and the stale one would fail forever
	// against a battle the next regenerate had already replaced.
	if err := os.RemoveAll(goldenDir()); err != nil {
		t.Fatalf("clearing the golden fixture directory failed: %v", err)
	}
	cfg := loadConfig(t)
	out := make([]goldenFixture, 0, 3)
	for _, s := range canonicalGoldens() {
		f, err := goldenOutcome(cfg, s)
		if err != nil {
			t.Fatalf("recording golden fixture %s failed: %v", s.Name, err)
		}
		if err := writeGolden(t, f); err != nil {
			t.Fatalf("writing golden fixture %s failed: %v", s.Name, err)
		}
		out = append(out, f)
	}
	return out
}

// goldenOutcome fights a fixture script and records what it produced.
func goldenOutcome(cfg *config.Config, s *Script) (goldenFixture, error) {
	res, rec, err := RunScript(cfg, s, 0)
	if err != nil {
		return goldenFixture{}, err
	}
	return goldenFixture{
		Name:       s.Name,
		Script:     s,
		ResultHash: res.HashString(),
		Outcome:    res.Outcome.Kind.String() + " (" + res.Outcome.Reason.String() + ")",
		Ticks:      res.Ticks,
		Orders:     rec.Log.Len(),
	}, nil
}

// writeGolden writes a fixture's script and its expectation side by side.
//
// Two files rather than one, because they answer different questions and get reviewed
// for different reasons: the script is what the battle is, and the .hash is what it
// came out as. A single file mixing them would make a hash change look like a
// gameplay change in a diff.
func writeGolden(t testing.TB, f goldenFixture) error {
	t.Helper()
	if err := os.MkdirAll(goldenDir(), 0o755); err != nil {
		return err
	}
	enc, err := EncodeScript(f.Script)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(goldenDir(), f.Name+".script"), enc, 0o644); err != nil {
		return err
	}
	line := f.ResultHash + "  " + f.Outcome + "  ticks=" + strconv.Itoa(f.Ticks) + "  orders=" + strconv.Itoa(f.Orders) + "\n"
	return os.WriteFile(filepath.Join(goldenDir(), f.Name+".hash"), []byte(line), 0o644)
}

// TestGoldenReplaysAreTheBattlesTheyWere is claim 4: the checked-in fixtures.
//
// Three canonical battles, recorded once, replayed on every build. The point is not
// that they replay, which TestScriptedBattleReplaysFromItsOwnLog already proves; the
// point is that a SIM CHANGE that moves a golden outcome fails here, loudly, in CI,
// where somebody can decide whether the change was intended. A determinism test tells
// you the engine is self-consistent; a golden test tells you the engine still does
// what it did on Tuesday.
//
// The regenerate path is the BATTLE_UPDATE_GOLDEN environment variable and it is
// separate on purpose: see goldenFixtureEnv for why a test that repaired its own
// expectation could never fail.
func TestGoldenReplaysAreTheBattlesTheyWere(t *testing.T) {
	update := os.Getenv(goldenFixtureEnv) != ""
	fixtures := loadGoldens(t, update)
	if len(fixtures) == 0 {
		t.Skipf("no golden fixtures in %s; generate them with %s set", goldenDir(), goldenFixtureEnv)
	}
	cfg := loadConfig(t)
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			want := readGoldenHash(t, f.Name)
			res, rec, err := RunScript(cfg, f.Script, 0)
			if err != nil {
				t.Fatalf("fighting the fixture failed: %v", err)
			}
			if res.HashString() != want {
				// Both sides of every "now / fixture says" pair below come from a
				// different place: "now" is this run, "the fixture says" is the
				// .hash file. The outcome is quoted as the file records it, kind and
				// reason together, so a battle that changed only in WHY it was won
				// is legible in the diff rather than hidden behind a hash.
				t.Errorf("the battle moved. it hashed to %s and the fixture says %s\n"+
					"  outcome now %s (%s), fixture says %s\n"+
					"  ticks now %d, fixture says %d; orders now %d, fixture says %d\n"+
					"  if this change was intended, set %s and commit the new hash with the change",
					res.HashString(), want,
					res.Outcome.Kind, res.Outcome.Reason, f.Outcome,
					res.Ticks, f.Ticks, rec.Log.Len(), f.Orders, goldenFixtureEnv)
				return
			}
			// The replay, not just the re-run. A fixture that only re-runs would pass
			// even if the apply path had grown a second way, which is the one way a
			// golden test could give false comfort.
			encoded, err := rec.Log.Encode(rec.Seed, cfg.Version)
			if err != nil {
				t.Fatalf("encoding the log failed: %v", err)
			}
			check, err := VerifyEncoded(cfg, encoded, rec.Setup, res)
			if err != nil {
				t.Fatalf("replaying the fixture from its own log failed: %v", err)
			}
			if !check.Match {
				t.Fatalf("the fixture fought twice and the two runs disagreed:\n%v", check)
			}
			t.Logf("%s: %s %v", f.Name, res.HashString(), check)
		})
	}
}

// readGoldenHash reads a fixture's recorded result hash.
func readGoldenHash(t testing.TB, name string) string {
	t.Helper()
	return readGoldenExpectation(t, name, name).ResultHash
}

// readGoldenExpectation reads everything a fixture records: the hash, and the
// outcome, tick count and order count beside it.
//
// The whole line is parsed rather than just the hash, and the numbers are parsed
// rather than trusted, because this is what the failure message quotes as "the
// fixture says". A diagnostic that quotes a number it took from the run it is
// judging is worse than no diagnostic: it is a diagnostic that agrees with
// whatever it is checking.
//
// A .hash file that cannot be parsed is a hard error with the regenerate
// instruction in it, because a half-written expectation is not a test that
// should be quietly skipped.
func readGoldenExpectation(t testing.TB, file, name string) goldenFixture {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(goldenDir(), name+".hash"))
	if err != nil {
		t.Fatalf("reading the expected hash for golden %s failed: %v; regenerate the fixtures with "+
			"%s set", file, err, goldenFixtureEnv)
	}
	line := strings.TrimSpace(string(b))
	fields := strings.Fields(line)
	if len(fields) == 0 {
		t.Fatalf("the hash file for golden %s is empty", file)
	}
	out := goldenFixture{Name: name, ResultHash: fields[0]}
	// The line is written as "<hash>  <outcome>  ticks=<n>  orders=<n>".
	if len(fields) > 1 {
		// The outcome is every field between the hash and the first key=value pair.
		var words []string
		for _, f := range fields[1:] {
			if strings.Contains(f, "=") {
				break
			}
			words = append(words, f)
		}
		out.Outcome = strings.Join(words, " ")
	}
	for _, f := range fields {
		k, v, ok := strings.Cut(f, "=")
		if !ok {
			continue
		}
		n, err := strconv.Atoi(v)
		if err != nil {
			t.Fatalf("the hash file for golden %s has %q where a number belongs; the line is "+
				"\"<hash>  <outcome>  ticks=<n>  orders=<n>\", and regenerating with %s set rewrites it",
				file, f, goldenFixtureEnv)
		}
		switch k {
		case "ticks":
			out.Ticks = n
		case "orders":
			out.Orders = n
		default:
			t.Fatalf("the hash file for golden %s carries the unknown key %q; regenerate the fixtures "+
				"with %s set rather than editing one by hand", file, k, goldenFixtureEnv)
		}
	}
	return out
}

// TestThereAreThreeCanonicalBattles pins the count.
//
// The plan asks for three, and three is chosen rather than one so that the set covers
// the three things a battle can be: nobody ordered anything, one side was ordered, and
// both sides were. A set of three identical-shaped battles would cover one of those
// and would be three times the maintenance for a third of the evidence. The assertion
// is on the count because a fixture deleted in a merge is otherwise invisible.
func TestThereAreThreeCanonicalBattles(t *testing.T) {
	if os.Getenv(goldenFixtureEnv) != "" {
		t.Skip("this test is about what is checked in, not about what was just regenerated")
	}
	fixtures := loadGoldens(t, false)
	if len(fixtures) != 3 {
		names := make([]string, len(fixtures))
		for i, f := range fixtures {
			names[i] = f.Name
		}
		t.Fatalf("there are %d golden fixtures (%s) and there should be three: a battle nobody "+
			"ordered, a battle one side ordered, and a battle both sides ordered", len(fixtures),
			strings.Join(names, ", "))
	}
}
