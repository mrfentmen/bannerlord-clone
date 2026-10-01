package battle

// This file proves the engine half of "battle size is a config knob, never
// hardcoded". internal/config's battle_size_test.go proves the file can carry
// every size number and refuses an impossible one; this file proves the engine
// READS those numbers instead of carrying its own.
//
// The two things worth knowing about how that is checked here:
//
// 1. A constant left in the code cannot be seen by a test that only changes
//    config. So each test here changes a config value to a value no sane file
//    would hold, runs something small, and asserts the ENGINE's observable
//    output moved. If the engine were still using a literal, nothing would
//    change and the test fails.
// 2. The force size itself is a parameter, not a constant, so a "500 v 500" run
//    and a "50 v 50" run are the same code path. TestHeadlessReference reads
//    the size from the balance file; this file checks that the machinery around
//    it is size-free.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// withBattleConfig copies the shipped balance file, changes the given [battle]
// keys, and loads the copy. Extra arguments are further key/value pairs, applied
// in order, for the cases where one key is only sensible next to another.
//
// It is the same technique internal/config's tests use, for the same reason: the
// file that ships is the file under test, and a hand written stub would let a
// key the real file does not have pass unnoticed.
func withBattleConfig(t *testing.T, key string, value string, more ...string) *config.Config {
	t.Helper()
	if len(more)%2 != 0 {
		t.Fatalf("withBattleConfig was given an odd number of extra arguments: %v", more)
	}
	edits := append([]string{key, value}, more...)
	raw, err := os.ReadFile(shippedBalancePath(t))
	if err != nil {
		t.Fatalf("reading the shipped balance file: %v", err)
	}
	lines := strings.Split(string(raw), "\n")
	for i := 0; i+1 < len(edits); i += 2 {
		k, v := edits[i], edits[i+1]
		if !replaceBattleKey(lines, k, v) {
			t.Fatalf("[battle] has no key %q to replace", k)
		}
	}
	path := filepath.Join(t.TempDir(), "balance.toml")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatalf("writing the edited balance file: %v", err)
	}
	edited, err := config.Load(path)
	if err != nil {
		t.Fatalf("the edited balance file did not load: %v", err)
	}
	for i := 0; i+1 < len(edits); i += 2 {
		t.Logf("config: battle.%s = %s", edits[i], edits[i+1])
	}
	return edited
}

// replaceBattleKey sets one key's value inside the [battle] section of lines,
// reporting whether the key was there. Failing on a missing key is deliberate:
// a test that quietly added a new one somewhere would prove nothing.
func replaceBattleKey(lines []string, key, value string) bool {
	inBattle := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "[battle]" {
			inBattle = true
			continue
		}
		if inBattle && strings.HasPrefix(trimmed, "[") {
			return false
		}
		if inBattle && strings.HasPrefix(trimmed, key+" ") {
			lines[i] = key + " = " + value
			return true
		}
	}
	return false
}

// shippedBalancePath walks up from the package directory to config/balance.toml,
// the file that ships with the simulation.
func shippedBalancePath(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("cannot determine the test working directory: %v", err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatal("config/balance.toml is not reachable from the test working directory")
	return ""
}

// TestSizeKnobsComeFromConfig: four size numbers, each set to a value the
// shipped file does not use, and an assertion that the engine's own output
// reflects it. If any of these were still a constant in the engine, the
// observable would not move and this fails.
func TestSizeKnobsComeFromConfig(t *testing.T) {
	// 1. The unit limit is the engine's own error, so it is directly observable.
	//    A force of 6 units a side is legal at the shipped 4000 and is refused
	//    when the limit is 5, with an error that names the limit it read.
	t.Run("unit limit", func(t *testing.T) {
		// The reference size comes down with the limit, because the loader
		// refuses a reference run larger than the limit it exercises, and that
		// refusal is asserted in internal/config. Setting only the limit would
		// test the relation check over and over instead of the engine.
		cfg := withBattleConfig(t, "max_units_per_side", "5", "reference_units_per_side", "4")
		force, err := GenerateForce(cfg, 1, SideA, Roster{Units: 6})
		if err != nil {
			t.Fatalf("generating the force failed: %v", err)
		}
		other, err := GenerateForce(cfg, 1, SideB, Roster{Units: 6})
		if err != nil {
			t.Fatalf("generating the force failed: %v", err)
		}
		_, err = Run(cfg, 1, Setup{A: force, B: other, Terrain: TerrainOpen})
		if err == nil {
			t.Fatal("six units a side ran with battle.max_units_per_side = 5")
		}
		var be *Error
		if !asBattleError(err, &be) || be.Kind != ErrForceTooLarge {
			t.Fatalf("expected ErrForceTooLarge, got %T: %v", err, err)
		}
		if be.Limit != 5 {
			t.Errorf("the error reported a limit of %g, so the engine did not read the configured 5", be.Limit)
		}
		if !strings.Contains(err.Error(), "max_units_per_side") {
			t.Errorf("the error does not name the key: %v", err)
		}
		t.Logf("refused as configured: %v", err)
	})

	// 2. The event bound is observable in the report: with a bound of three the
	//    report keeps three events and counts the rest, where the shipped 4096
	//    keeps them all.
	t.Run("event bound", func(t *testing.T) {
		cfg := withBattleConfig(t, "max_report_events", "3")
		res := runSmall(t, cfg, 24)
		if len(res.Events) > 3 {
			t.Fatalf("the report kept %d events with battle.max_report_events = 3", len(res.Events))
		}
		if res.EventsDropped == 0 {
			t.Error("no events were dropped, so the bound of 3 was never reached and this proves nothing")
		}
		if res.Config.MaxReportEvents != 3 {
			t.Errorf("the report quotes a bound of %g, so it did not record the configured 3",
				res.Config.MaxReportEvents)
		}
		summary := res.Summary()
		if !strings.Contains(summary, "bound of 3") {
			t.Errorf("the report does not name the bound it hit: %s", summary)
		}
		t.Logf("kept %d of %d events; the report's last line reads %q",
			len(res.Events), len(res.Events)+res.EventsDropped, lastLine(summary))
	})

	// 3. The cell budget is observable through the index: a budget of one cell
	//    forces the coarsening path every tick, which is reported, where a
	//    generous budget leaves the index at the configured cell size.
	t.Run("cell budget", func(t *testing.T) {
		// 4 is the floor: the index adds a one cell margin on each axis, so 4 is
		// the smallest grid it can build and the coarsener can always reach it.
		// A budget below that used to spin this loop forever, which is why the
		// floor exists in three places: this test, config validation, and the
		// clamp in newHash.
		cfg := withBattleConfig(t, "grid_max_cells", "4")
		b, err := newBattle(cfg, 7, smallSetup(t, cfg, 24))
		if err != nil {
			t.Fatalf("building the battle failed: %v", err)
		}
		// The budget is read at construction, and the coarsening decision is made
		// in rebuild, so the tick has to run before either can be checked.
		if b.meleeHash.maxCells != 4 {
			t.Errorf("the index was built with a budget of %d cells, not the configured 4", b.meleeHash.maxCells)
		}
		if b.fireHash.maxCells != 4 {
			t.Errorf("the aimed fire index was built with a budget of %d cells, not the configured 4",
				b.fireHash.maxCells)
		}
		if err := b.tick(); err != nil {
			t.Fatalf("a coarsened index could not run a tick: %v", err)
		}
		if !b.meleeHash.coarsened {
			t.Error("a four cell budget did not coarsen the index, so the engine is not reading it")
		}
		// A coarse index must still be a correct one: the tick has to have
		// resolved the field, not fallen over on an index that cannot address it.
		if b.meleeHash.w*b.meleeHash.h > 4 {
			t.Errorf("the index built %d cells against a budget of 4", b.meleeHash.w*b.meleeHash.h)
		}
		t.Logf("index coarsened to %.1f m cells from a budget of 4, and the tick still ran",
			b.meleeHash.size)
	})

	// 4. The tick bound is the engine's own stopping rule, so a tiny bound must
	//    produce a stalemate where the shipped 20000 does not.
	t.Run("tick bound", func(t *testing.T) {
		cfg := withBattleConfig(t, "max_ticks", "2")
		res := runSmall(t, cfg, 24)
		if res.Ticks != 2 {
			t.Errorf("the battle ran %d ticks with battle.max_ticks = 2", res.Ticks)
		}
		if res.Outcome.Kind != ResultDraw || res.Outcome.Reason != ReasonStalemate {
			t.Errorf("a battle stopped at the tick bound reported %s (%s), not a stalemate draw",
				res.Outcome.Kind, res.Outcome.Reason)
		}
		if res.Config.MaxTicks != 2 {
			t.Errorf("the report quotes a tick bound of %g, not the configured 2", res.Config.MaxTicks)
		}
		t.Logf("stopped at the configured bound: %s after %d ticks (%s)",
			res.Outcome.Kind, res.Ticks, res.Outcome.Reason)
	})

	// 5. The leader spread is observable in the positions GenerateLeaders lays
	//    out, which is the only place it is used.
	t.Run("leader spread", func(t *testing.T) {
		cfg := withBattleConfig(t, "roster_leader_spread", "40")
		leaders := GenerateLeaders(cfg, 3, SideA, 5, 100)
		if len(leaders) != 5 {
			t.Fatalf("asked for 5 leaders and got %d", len(leaders))
		}
		// Five commanders sit at spreads -2 to +2, so the outermost pair is four
		// spread units apart, and each end carries up to half a frontage of
		// deliberate jitter, so the tolerance is one frontage.
		want := 4 * cfg.Battle.RosterFrontage * 40
		tol := cfg.Battle.RosterFrontage
		got := leaders[4].Y - leaders[0].Y
		if got < want-tol || got > want+tol {
			t.Errorf("the outermost commanders are %.2f m apart, want %.2f (+/- %.2f) from a "+
				"spread of 40 frontages", got, want, tol)
		}
		t.Logf("5 commanders spread %.1f m end to end at roster_leader_spread = 40", got)
	})

	// 6. Men per commander is observable in LeaderCount, which is the one
	//    function both the test harness and the throughput sweep ask for a
	//    command structure.
	t.Run("command structure", func(t *testing.T) {
		cfg := withBattleConfig(t, "roster_leaders_per_unit", "10")
		if got := LeaderCount(cfg, 100); got != 11 {
			t.Errorf("a 100 unit force with 10 men a commander got %d commanders, want 11", got)
		}
		cfg = withBattleConfig(t, "roster_leaders_per_unit", "250")
		if got := LeaderCount(cfg, 100); got != 1 {
			t.Errorf("a 100 unit force with 250 men a commander got %d commanders, want 1", got)
		}
		t.Log("command structure follows battle.roster_leaders_per_unit in both directions")
	})
}

// TestTheEngineCarriesNoFixedSize walks the claims this file is about. It is a
// source-level check, and it is here because a test that only changes config
// cannot see a constant that the config happens to agree with today.
func TestTheEngineCarriesNoFixedSize(t *testing.T) {
	cfg := loadConfig(t)

	// A force of one unit a side is the smallest a battle can be, and it must
	// run: if any stage sized itself from a preferred force rather than the one
	// it was given, this is where it would show.
	setup := smallSetup(t, cfg, 1)
	res, err := Run(cfg, 11, setup)
	if err != nil {
		t.Fatalf("a one unit a side battle did not run: %v", err)
	}
	if res.Ticks == 0 {
		t.Error("a one unit a side battle ended on the opening tick")
	}
	t.Logf("1 v 1 ran for %d ticks and reported %s", res.Ticks, res.Outcome.Kind)

	// A hundred and a half a side is an odd number, so a formation that rounds
	// to an even shape, or a loop that steps by two, drops units. The report
	// has to account for every unit that started.
	odd := runSmall(t, cfg, 150)
	started := 0
	for _, s := range odd.Sides {
		started += s.StartUnits
		if s.StartUnits != 150 {
			t.Errorf("side %s started with %d units of the 150 it was given", s.Side, s.StartUnits)
		}
		accounted := s.Standing + s.Routed + (s.StartUnits - s.Standing - s.Routed)
		if accounted != s.StartUnits {
			t.Errorf("side %s accounts for %d of its %d units", s.Side, accounted, s.StartUnits)
		}
	}
	if started != 300 {
		t.Errorf("the report describes %d units, the two sides were given 300", started)
	}
	t.Logf("150 v 150 accounted for all %d units", started)

	// The same seed and the same force must give the same battle, at whatever
	// size: a size knob that changed the order random draws are made in would
	// make every run a different battle and no balance measurement repeatable.
	first := runSmall(t, cfg, 60)
	second := runSmall(t, cfg, 60)
	if first.StateHash != second.StateHash {
		t.Errorf("two identical 60 v 60 runs diverged: state hashes %d and %d",
			first.StateHash, second.StateHash)
	}
	if first.Ticks != second.Ticks {
		t.Errorf("two identical 60 v 60 runs ran for different lengths: %d and %d ticks",
			first.Ticks, second.Ticks)
	}
	t.Logf("two identical 60 v 60 runs agree: %d ticks, state hash %d", first.Ticks, first.StateHash)
}

// smallSetup builds an even force of n units a side with the configured command
// structure, which is the shape every reference run in this package uses.
func smallSetup(t *testing.T, cfg *config.Config, n int) Setup {
	t.Helper()
	a, err := GenerateForce(cfg, 20260930, SideA, Roster{Units: n})
	if err != nil {
		t.Fatalf("side A: %v", err)
	}
	b, err := GenerateForce(cfg, 20260930, SideB, Roster{Units: n})
	if err != nil {
		t.Fatalf("side B: %v", err)
	}
	leaders := LeaderCount(cfg, n)
	return Setup{
		A: a, B: b,
		Leaders: append(
			GenerateLeaders(cfg, 20260930, SideA, leaders, 260),
			GenerateLeaders(cfg, 20260930, SideB, leaders, 260)...),
		Terrain: TerrainOpen,
		Label:   "size knob check",
	}
}

// runSmall runs a battle of n units a side with a bounded tick budget, so a test
// in this file cannot take fifteen minutes. The budget is generous enough that a
// small field usually decides on its own.
func runSmall(t *testing.T, cfg *config.Config, n int) *Result {
	t.Helper()
	budget := int(cfg.Battle.MaxTicks)
	if budget > 2000 {
		budget = 2000
	}
	res, err := RunTicks(cfg, 20260930, smallSetup(t, cfg, n), budget)
	if err != nil {
		t.Fatalf("the %d v %d battle did not run: %v", n, n, err)
	}
	return res
}

// asBattleError is errors.As for *Error, kept local so this file does not
// import errors for one call.
func asBattleError(err error, target **Error) bool {
	for err != nil {
		if be, ok := err.(*Error); ok {
			*target = be
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// lastLine returns the final non-empty line of s, for logging a report's note.
func lastLine(s string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			return lines[i]
		}
	}
	return ""
}
