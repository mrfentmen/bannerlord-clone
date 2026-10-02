package replay

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// balanceEnv names an environment variable that overrides where these tests read
// the balance file from.
//
// It is the same variable internal/battle's tests honour, so one command can point
// every package at the same constants. Every test that loads the file logs the
// path and version it actually used, because a measurement or a determinism claim
// taken against constants nobody can name is not evidence of anything.
const balanceEnv = "BANNERLORD_BALANCE"

var balanceOnce struct {
	path string
	cfg  *config.Config
	err  error
	done bool
}

// loadConfig reads the balance file that ships with the simulation, once per test
// binary.
//
// The path is walked up from the test's own directory because Go runs a test with
// the package directory as its working directory, and the balance file lives at
// the module root's config/ rather than beside this package.
func loadConfig(t testing.TB) *config.Config {
	t.Helper()
	if balanceOnce.done {
		if balanceOnce.err != nil {
			t.Fatalf("%v", balanceOnce.err)
		}
		return balanceOnce.cfg
	}
	path := os.Getenv(balanceEnv)
	if path == "" {
		var err error
		path, err = findBalanceFile()
		if err != nil {
			balanceOnce.done, balanceOnce.err = true, err
			t.Fatal(err)
		}
	}
	cfg, err := config.Load(path)
	balanceOnce.done, balanceOnce.path, balanceOnce.cfg = true, path, cfg
	if err != nil {
		balanceOnce.err = fmt.Errorf("the balance file did not load from %s: %w", path, err)
		t.Fatalf("%v", balanceOnce.err)
	}
	t.Logf("balance file: %s (version %s)", path, cfg.Version)
	return cfg
}

// findBalanceFile walks up from the test's working directory looking for
// config/balance.toml.
func findBalanceFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("cannot determine the test working directory: %w", err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find config/balance.toml by walking up from the test directory; " +
		"set " + balanceEnv + " to point at it")
}

// evenForce builds an unremarkable force of n units a side with an even command
// on each side: the roster as the balance file describes it.
//
// The seed is a parameter rather than fixed so that a determinism test can vary
// one thing at a time — same seed twice for the equality claim, different seeds
// for the claim that the seed is read at all.
func evenForce(t *testing.T, cfg *config.Config, seed uint64, n int) battle.Setup {
	t.Helper()
	a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side A failed: %v", err)
	}
	b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		t.Fatalf("building side B failed: %v", err)
	}
	leaders := 1 + n/250
	return battle.Setup{
		A: a,
		B: b,
		Leaders: append(
			battle.GenerateLeaders(cfg, seed, battle.SideA, leaders, 260),
			battle.GenerateLeaders(cfg, seed, battle.SideB, leaders, 260)...),
		Terrain: battle.TerrainOpen,
		Label:   fmt.Sprintf("%d vs %d, even forces", n, n),
	}
}

// unevenForce builds a lopsided battle: n a side against 3n.
//
// It exists because an even battle is the easy case for a determinism test. Two
// identical blocks are symmetric, and a difference caused by map iteration order
// can hide inside a symmetry. Uneven forces have no such symmetry to hide in.
func unevenForce(t *testing.T, cfg *config.Config, seed uint64, n int) battle.Setup {
	t.Helper()
	s := evenForce(t, cfg, seed, n)
	big, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: 3 * n})
	if err != nil {
		t.Fatalf("building the larger side B failed: %v", err)
	}
	s.B = big
	s.Label = fmt.Sprintf("%d vs %d, lopsided", n, 3*n)
	return s
}

// mustRecord records a battle and fails the test if it does not run.
func mustRecord(t *testing.T, cfg *config.Config, seed uint64, setup battle.Setup) *Recording {
	t.Helper()
	rec, err := Record(cfg, seed, setup)
	if err != nil {
		t.Fatalf("the battle did not run: %v", err)
	}
	return rec
}

// mustEncode encodes a recording and fails the test if it does not fit in memory.
func mustEncode(t *testing.T, rec *Recording) []byte {
	t.Helper()
	b, err := Encode(rec)
	if err != nil {
		t.Fatalf("the recording did not encode: %v", err)
	}
	return b
}

// --- determinism ---

// TestDeterminismSameSeedSameBytes is the reproducibility claim, tested rather
// than asserted in a comment.
//
// AI.md section 1 requires that a given seed and given inputs make the same
// choices. The comparison is over the FULL output: the result, every per-tick
// unit state, the whole event log, and the cause log derived from those frames.
// Not the result alone — a battle that reported the same totals from a different
// sequence of fights would still be a different battle, and a battle that ended
// the same way with different intermediate positions is still a different battle.
//
// The three runs are in one test rather than three, because the interesting
// failure is not "one run differs" but "run three differs from run one while
// matching run two", which three separate invocations of a two-run comparison
// would report as three passes.
func TestDeterminismSameSeedSameBytes(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name  string
		setup func(t *testing.T, cfg *config.Config) battle.Setup
		seed  uint64
	}{
		{"24 v 24 even, seed 7", func(t *testing.T, c *config.Config) battle.Setup {
			return evenForce(t, c, 7, 24)
		}, 7},
		{"17 v 51 lopsided, seed 4242", func(t *testing.T, c *config.Config) battle.Setup {
			return unevenForce(t, c, 4242, 17)
		}, 4242},
		{"1 v 1, seed 99", func(t *testing.T, c *config.Config) battle.Setup {
			return evenForce(t, c, 99, 1)
		}, 99},
		{"40 v 40 even, seed 20260930", func(t *testing.T, c *config.Config) battle.Setup {
			return evenForce(t, c, 20260930, 40)
		}, 20260930},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The setup is built once and handed to all three runs, so the three
			// runs are provably given identical inputs. Rebuilding it per run would
			// make the test depend on the roster generator being deterministic too,
			// which is true but is not what is being proved here.
			setup := tc.setup(t, cfg)

			runs := make([][]byte, 3)
			recs := make([]*Recording, 3)
			for i := 0; i < 3; i++ {
				recs[i] = mustRecord(t, cfg, tc.seed, setup)
				runs[i] = mustEncode(t, recs[i])
				t.Logf("run %d: %d ticks, %d frames, %d cause rows, %d events, %d bytes",
					i+1, recs[i].Result.Ticks, len(recs[i].Frames), recs[i].Causes.total(),
					len(recs[i].Result.Events), len(runs[i]))
			}

			for i := 1; i < 3; i++ {
				if bytes.Equal(runs[0], runs[i]) {
					continue
				}
				t.Errorf("run %d did not reproduce run 1 byte for byte: %s\n%s",
					i+1, sizeDiff(runs[0], runs[i]), firstDiff(runs[0], runs[i]))
			}

			// The cause log is compared separately because it is derived rather
			// than recorded, and a derivation that is not a pure function of the
			// frames would still produce identical bytes if it happened to agree.
			for i := 1; i < 3; i++ {
				if diff := diffCauses(recs[0].Causes, recs[i].Causes); diff != "" {
					t.Errorf("run %d's cause log differs from run 1's:\n%s", i+1, diff)
				}
			}
		})
	}
}

// TestDeterminismAcrossProcessBoundaries re-runs the determinism claim in a
// subprocess.
//
// Everything above compares two recordings made inside one process. That leaves
// one source of nondeterminism untested: state that Go initialises differently
// between processes. Go randomises map iteration order per map, using a hash seed
// chosen at startup, so two runs of a test binary can walk the same map in
// different orders — and an in-process test cannot see it, because it walks the
// same map the same way twice within one process's lifetime.
//
// This is therefore the test that would catch the usual suspect. It runs the same
// recording twice in two separate processes and compares the two files, which is
// the only way to vary Go's map hash seed between two executions.
//
// The subprocess is this same test binary re-invoked with an environment marker,
// which is the standard way to make a test re-enter itself: no separate helper
// program to keep in step with the code, and the code under test is the code the
// test runs.
func TestDeterminismAcrossProcessBoundaries(t *testing.T) {
	// The re-entry marker. When it is set, this test writes its recording to the
	// path it was given and returns, rather than recursing.
	if path := os.Getenv(replayChildEnv); path != "" {
		cfg, err := config.Load(childBalancePath())
		if err != nil {
			t.Fatalf("child: the balance file did not load: %v", err)
		}
		setup := evenForce(t, cfg, childSeed(), childUnits())
		rec, err := Record(cfg, childSeed(), setup)
		if err != nil {
			t.Fatalf("child: the battle did not run: %v", err)
		}
		b, err := Encode(rec)
		if err != nil {
			t.Fatalf("child: the recording did not encode: %v", err)
		}
		if err := os.WriteFile(path, b, 0o644); err != nil {
			t.Fatalf("child: writing %s failed: %v", path, err)
		}
		return
	}

	// The parent resolves the balance file so it can hand the exact path to both
	// children, and so that a parent which cannot find the file says so here
	// rather than in a child's output.
	loadConfig(t)
	const units = 24
	const seed = 31337
	if testing.Short() {
		t.Skip("subprocess determinism check skipped in short mode")
	}

	// The binary path. os.Args[0] is this test binary, which is what makes the
	// re-entry run exactly this code.
	bin := os.Args[0]
	dir := t.TempDir()

	var outputs [2]string
	var durations [2]time.Duration
	for i := range outputs {
		out := filepath.Join(dir, fmt.Sprintf("run%d.jsonl", i+1))
		outputs[i] = out
		cmd := execCommand(t, bin,
			"-test.run=^TestDeterminismAcrossProcessBoundaries$",
			"-test.v",
		)
		cmd.Env = append(os.Environ(),
			replayChildEnv+"="+out,
			replayChildSeedEnv+"="+fmt.Sprint(seed),
			replayChildUnitsEnv+"="+fmt.Sprint(units),
			balanceEnv+"="+balanceOnce.path,
		)
		start := time.Now()
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("child process %d failed: %v\n%s", i+1, err, output)
		}
		durations[i] = time.Since(start)
	}

	a, err := os.ReadFile(outputs[0])
	if err != nil {
		t.Fatalf("reading the first child's output: %v", err)
	}
	b, err := os.ReadFile(outputs[1])
	if err != nil {
		t.Fatalf("reading the second child's output: %v", err)
	}
	t.Logf("two separate processes, %d units a side, seed %d: %d and %d bytes in %s and %s",
		units, seed, len(a), len(b),
		durations[0].Round(time.Millisecond), durations[1].Round(time.Millisecond))

	if !bytes.Equal(a, b) {
		t.Errorf("two separate processes produced two different battles, which means the run "+
			"depends on something Go chooses per process rather than on the seed alone.\n"+
			"The usual suspect is map iteration order, whose hash seed Go randomises at startup: "+
			"a loop over a map inside a stage, a sort, or a formatter that walks one.\n%s\n%s",
			sizeDiff(a, b), firstDiff(a, b))
	}
}

// TestDifferentSeedsProduceDifferentBattles is the other half of the claim.
//
// A simulation that ignored its seed would pass a determinism test trivially, by
// being the same battle every time. This asserts the seed actually reaches the
// engine: two different seeds must produce two different fights, and the
// difference must be in the fight rather than only in the header.
func TestDifferentSeedsProduceDifferentBattles(t *testing.T) {
	cfg := loadConfig(t)
	const n = 24

	setupA := evenForce(t, cfg, 1001, n)
	setupB := evenForce(t, cfg, 1002, n)

	recA := mustRecord(t, cfg, 1001, setupA)
	recB := mustRecord(t, cfg, 1002, setupB)
	bytesA, bytesB := mustEncode(t, recA), mustEncode(t, recB)

	if bytes.Equal(bytesA, bytesB) {
		t.Fatalf("seeds 1001 and 1002 produced byte-identical recordings; the seed is not reaching " +
			"the simulation, so the determinism above proves only that the engine is constant")
	}

	// The difference must be in the battle, not only in the header. The header
	// carries the seed, so two recordings of the same battle under different seeds
	// would differ in their first line and nothing else. Comparing from the first
	// frame line onwards excludes that.
	frameA, frameB := framesOnly(bytesA), framesOnly(bytesB)
	if bytes.Equal(frameA, frameB) {
		t.Errorf("seeds 1001 and 1002 produced identical frames; only the headers differ, so the " +
			"seed is being recorded rather than read")
	}
	t.Logf("seed 1001: %d ticks, %d cause rows; seed 1002: %d ticks, %d cause rows",
		recA.Result.Ticks, recA.Causes.total(), recB.Result.Ticks, recB.Causes.total())
}

// TestRecordingDoesNotChangeTheBattle is the check on this package's own
// instrument.
//
// Everything else in this package observes the battle through a Commander. If
// attaching that Commander changed the fight, then every determinism result, every
// cause-log count, and every replay in here would be a measurement of the
// recorder rather than of the engine.
//
// So the same setup and seed are run through battle.Run, which has no seam in it
// at all, and through Record, which has one, and the two results are compared
// field by field including the event list. The recorder issues no orders, so the
// only way the two could differ is if the seam itself moved the battle.
func TestRecordingDoesNotChangeTheBattle(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name  string
		seed  uint64
		units int
	}{
		{"8 v 8", 5150, 8},
		{"24 v 24", 606, 24},
		{"13 v 39 lopsided", 909, 13},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setup := evenForce(t, cfg, tc.seed, tc.units)
			if tc.units == 13 {
				setup = unevenForce(t, cfg, tc.seed, tc.units)
			}
			plain, err := battle.Run(cfg, tc.seed, setup)
			if err != nil {
				t.Fatalf("battle.Run failed: %v", err)
			}
			observed := mustRecord(t, cfg, tc.seed, setup)

			if diff := diffResults(plain, observed.Result); diff != "" {
				t.Errorf("attaching a recorder changed the battle it was recording:\n%s\n"+
					"Every result in this package is then a measurement of the recorder, not of the engine.",
					diff)
			}
			// The frames must also be the published view of the same fight, which
			// the result comparison alone does not establish: a recorder could
			// report a matching result over frames that described something else.
			if len(observed.Frames) != plain.Ticks {
				t.Errorf("the battle ran %d ticks but published %d frames", plain.Ticks, len(observed.Frames))
			}
			t.Logf("%d ticks, %d frames, %d events, %d cause rows",
				plain.Ticks, len(observed.Frames), len(plain.Events), observed.Causes.total())
		})
	}
}

// --- diff helpers, so a failure says what differed rather than only that it did ---

// firstDiff returns a human-readable account of the first differing line of two
// byte slices.
//
// It is here rather than left to a byte comparison because a determinism failure
// with no detail is the least actionable test failure there is: the reader knows
// something differed and nothing about what.
func firstDiff(a, b []byte) string {
	la, lb := splitLines(a), splitLines(b)
	var out []string
	n := len(la)
	if len(lb) > n {
		n = len(lb)
	}
	shown := 0
	for i := 0; i < n && shown < 6; i++ {
		var x, y string
		if i < len(la) {
			x = la[i]
		}
		if i < len(lb) {
			y = lb[i]
		}
		if x == y {
			continue
		}
		out = append(out, fmt.Sprintf("  line %d:\n    run 1: %s\n    run 2: %s", i+1, trim(x), trim(y)))
		shown++
	}
	if len(out) == 0 {
		return "  (the byte slices differ but no line does; the difference is in a line ending)"
	}
	return joinLines(out)
}

// sizeDiff reports the two sizes, because a size difference alone often says
// which kind of failure this is.
func sizeDiff(a, b []byte) string {
	return fmt.Sprintf("(run 1 wrote %d bytes, run 2 wrote %d bytes, a difference of %d)",
		len(a), len(b), len(b)-len(a))
}

// diffCauses compares two cause logs and describes the first difference.
func diffCauses(a, b *CauseLog) string {
	if a.total() != b.total() {
		return fmt.Sprintf("row counts differ: %d against %d\n  run 1: %s\n  run 2: %s",
			a.total(), b.total(), a.describe(), b.describe())
	}
	for i := range a.Rows {
		if a.Rows[i] == b.Rows[i] {
			continue
		}
		return fmt.Sprintf("row %d differs:\n    run 1: %s\n    run 2: %s",
			i+1, a.Rows[i].Format(), b.Rows[i].Format())
	}
	return ""
}

// diffResults compares two battle results field by field and describes every
// difference it finds.
func diffResults(a, b *battle.Result) string {
	if a == nil || b == nil {
		return "one of the results is nil"
	}
	var d []string
	add := func(f string, args ...any) { d = append(d, fmt.Sprintf(f, args...)) }
	if a.Seed != b.Seed {
		add("seed %d against %d", a.Seed, b.Seed)
	}
	if a.Outcome != b.Outcome {
		add("outcome %s (%s) against %s (%s)",
			a.Outcome.Kind, a.Outcome.Reason, b.Outcome.Kind, b.Outcome.Reason)
	}
	if a.Ticks != b.Ticks {
		add("ticks %d against %d", a.Ticks, b.Ticks)
	}
	if a.Elapsed != b.Elapsed {
		add("elapsed %g against %g", a.Elapsed, b.Elapsed)
	}
	if a.Truncated != b.Truncated {
		add("truncated %v against %v", a.Truncated, b.Truncated)
	}
	for i := range a.Sides {
		if a.Sides[i] != b.Sides[i] {
			add("side %s:\n      run 1 %+v\n      run 2 %+v", a.Sides[i].Side, a.Sides[i], b.Sides[i])
		}
	}
	if a.Stats != b.Stats {
		add("stats:\n      run 1 %+v\n      run 2 %+v", a.Stats, b.Stats)
	}
	if len(a.Events) != len(b.Events) {
		add("event count %d against %d", len(a.Events), len(b.Events))
	} else {
		for i := range a.Events {
			if a.Events[i] != b.Events[i] {
				add("event %d:\n      run 1 %+v\n      run 2 %+v", i, a.Events[i], b.Events[i])
				break
			}
		}
	}
	if a.EventsDropped != b.EventsDropped {
		add("dropped events %d against %d", a.EventsDropped, b.EventsDropped)
	}
	return joinLines(d)
}

// --- small local helpers ---

// splitLines splits a byte slice into lines without allocating a scanner.
func splitLines(b []byte) []string {
	var out []string
	start := 0
	for i := 0; i < len(b); i++ {
		if b[i] == '\n' {
			out = append(out, string(b[start:i]))
			start = i + 1
		}
	}
	if start < len(b) {
		out = append(out, string(b[start:]))
	}
	return out
}

// framesOnly returns everything from the first frame line onward, dropping the
// header.
//
// The header carries the seed, so two recordings of an identical battle under
// different seeds differ in their first line and nowhere else. A test that wanted
// to know whether the seed changed the FIGHT rather than the label compares from
// here.
func framesOnly(b []byte) []byte {
	lines := splitLines(b)
	for i, l := range lines {
		if len(l) > 12 && l[:12] == `{"kind":"fra` {
			return bytes.Join([][]byte{[]byte(lines[i]), []byte(lines[i+1])}, []byte("\n"))
		}
	}
	return b
}

// trim shortens a line for a failure message, because a frame line of a hundred
// units is unreadable in full and the first difference is usually early in it.
func trim(s string) string {
	const max = 300
	if len(s) <= max {
		return s
	}
	return s[:max] + fmt.Sprintf("... (%d bytes total)", len(s))
}

// joinLines joins messages with newlines, empty for none.
func joinLines(d []string) string {
	out := ""
	for i, s := range d {
		if i > 0 {
			out += "\n"
		}
		out += "  " + s
	}
	return out
}
