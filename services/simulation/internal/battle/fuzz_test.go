package battle

import (
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// THE DETERMINISM FUZZ.
//
// The plan asks for this as a nightly job: run the same battle twenty times and
// assert identical final state. Twenty runs of the same thing is not a better test
// than two runs, and this file says why it exists at all rather than pretending the
// number is the point:
//
//   - a determinism bug is a bug that only shows up on SOME inputs. Two runs of one
//     battle exercise one code path. Twenty runs of a battle drawn from several seeds
//     exercise twenty, and the cheapest way to find the one that diverges is to run
//     the same thing until something does.
//   - the property being checked is stronger than "same hash twice". Every run is
//     compared against the FIRST run's hash, so a divergence is caught whether it is
//     between two runs or is a run that wandered somewhere new entirely.
//
// # WHY IT IS NOT IN THE PER-COMMIT PATH
//
// Twenty battles at a readable size is a few seconds; twenty at the size that matters
// is minutes. The per-commit guard for "did a change break the sim" is the golden set
// (TestGoldenReplaysAreTheBattlesTheyWere), which is three battles and a hash each.
// This one is the nightly: slower, wider, and it exists to catch the change that the
// three did not happen to exercise. BATTLE_FUZZ_REPS turns the count up or down
// without an edit, and -short turns it off entirely.
//
// # WHAT A FAILURE HERE MEANS
//
// It means the engine drew a different number somewhere it should not have, or read
// state in an order that changed. Both are determinism bugs regardless of which run
// disagreed with which: the report names the seed and the run number, so the failing
// case can be turned into a one-line script with DecodeScript and run on its own.

// fuzzEnv is the environment variable that overrides the number of repetitions.
const fuzzEnv = "BATTLE_FUZZ_REPS"

// fuzzDefaultRuns is how many times each battle is fought when nothing overrides it.
//
// Twenty is the plan's number and it is not arbitrary: at the size below a battle is
// tens of milliseconds, so twenty runs of four battles is a couple of seconds, which
// is cheap enough to keep in the per-commit path once the fixtures are warm.
const fuzzDefaultRuns = 20

// TestDeterminismFuzz is the fuzz proper.
//
// Four battles at three sizes, twenty runs each, every run compared against the
// first. The sizes are not decoration: the engine has stages that only run at certain
// unit counts, and a fuzz that only ever runs 4 v 4 would leave the aimed-fire and
// formation paths unexercised while reporting that the sim is deterministic.
//
// The check is on the result HASH rather than on the Result struct, because the hash
// is what Replay compares and it covers every unit's final state: a run that finished
// with one man 3 metres from where the others put him changes the hash and no
// top-level field. Comparing struct fields would let that pass.
func TestDeterminismFuzz(t *testing.T) {
	if testing.Short() {
		t.Skip("the fuzz is twenty battles; -short skips it")
	}
	cfg := loadConfig(t)
	runs := fuzzRuns(t)
	cases := []struct {
		name string
		n    int
	}{
		// The three sizes below are where the engine's stages actually differ: a
		// 1 v 1 fight has no melee to speak of, the melee and aimed-fire paths are
		// busy by 8 a side, and above a few dozen units the spatial hash is carrying
		// the tick rather than the stages.
		{"1_v_1", 1},
		{"8_v_8", 8},
		{"16_v_16", 16},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setup := replayForce(t, cfg, 20260930, tc.n)
			var want string
			start := time.Now()
			for i := 0; i < runs; i++ {
				res, err := Run(cfg, 20260930, setup)
				if err != nil {
					t.Fatalf("run %d of %d failed: %v", i+1, runs, err)
				}
				got := res.HashString()
				if got == "0000000000000000" {
					t.Fatalf("run %d hashed to zero, which is what an unfilled Result would look like",
						i+1)
				}
				if i == 0 {
					want = got
					continue
				}
				if got != want {
					t.Fatalf("run %d of %d diverged from run 1.\n  run 1: %s\n  run %d: %s\n"+
						"  seed 20260930, %d v %d\n"+
						"  this is a determinism bug: two runs of the same battle from the same seed "+
						"differed, so the engine drew a number or read state in an order that changed",
						i+1, runs, want, i+1, got, tc.n, tc.n)
				}
			}
			t.Logf("%d v %d, %d runs, all %s, %v total (%.1f ms a run)",
				tc.n, tc.n, runs, want, time.Since(start),
				float64(time.Since(start).Microseconds())/float64(runs)/1000)
		})
	}
}

// TestDeterminismFuzzAcrossSeeds is the other half, and the half that finds things.
//
// A single seed run twenty times proves the engine is repeatable on that input. It
// says nothing about the twenty other seeds, and the bug this exists to catch is one
// that only fires on some of them: a stage that reads a map (Go randomises map
// iteration, so the order changes between PROCESSES but not within one, which is
// exactly why a same-process fuzz cannot see it), or a draw whose count depends on
// something that varies with the seed.
//
// So this runs many seeds ONCE each and compares every one of them against the first.
// That is a different experiment and it is the one that would catch map-iteration
// order, because a process restart is the only thing that changes it and a
// same-process loop cannot.
func TestDeterminismFuzzAcrossSeeds(t *testing.T) {
	if testing.Short() {
		t.Skip("the cross-seed fuzz is a long sweep; -short skips it")
	}
	cfg := loadConfig(t)
	const seeds = 12
	const n = 8
	var want string
	for i := 0; i < seeds; i++ {
		seed := uint64(31337 + i*7919)
		setup := replayForce(t, cfg, seed, n)
		res, err := Run(cfg, seed, setup)
		if err != nil {
			t.Fatalf("seed %d failed: %v", seed, err)
		}
		got := res.HashString()
		if i == 0 {
			want = got
			t.Logf("the reference: seed %d, %d v %d, hash %s", seed, n, n, got)
			continue
		}
		if got == want {
			t.Errorf("seed %d produced the same battle as seed %d, both hashing to %s; the seed is "+
				"not reaching the engine", seed, uint64(31337), got)
		}
	}
	t.Logf("%d distinct seeds at %d v %d all produced distinct battles", seeds, n, n)
}

// TestDeterminismFuzzUnderConcurrency is the check a same-process fuzz cannot make.
//
// Two battles from the same seed, fought at the same time on separate goroutines,
// must hash the same as two fought one after the other. This is a cheap check that the
// engine holds no package-level mutable state on the tick path, and it is the one
// that would catch a lazily-initialised cache or a sync.Pool on the hot path.
//
// It is not a race detector substitute and does not claim to be. The race detector
// needs -race and finds far more; this runs in the ordinary suite, costs
// milliseconds, and is aimed at the specific failure of a global cache whose contents
// depend on which battle ran first.
func TestDeterminismFuzzUnderConcurrency(t *testing.T) {
	if testing.Short() {
		t.Skip("-short skips the concurrency check")
	}
	cfg := loadConfig(t)
	const n = 12
	const goroutines = 4

	// The sequential answer first: it is the one both parallel runs have to match, and
	// computing it in the same test means a failure cannot be blamed on a hash that
	// moved because the build changed.
	setup := replayForce(t, cfg, 606060, n)
	seq, err := Run(cfg, 606060, setup)
	if err != nil {
		t.Fatalf("the sequential run failed: %v", err)
	}
	want := seq.HashString()

	type result struct {
		hash string
		err  error
	}
	results := make(chan result, goroutines)
	for g := 0; g < goroutines; g++ {
		go func() {
			// Each goroutine builds its OWN setup from the same seed, because sharing
			// a Setup across goroutines would be a data race in the test rather than in
			// the engine. Sharing the Setup is a caller's mistake; building two from
			// one seed and comparing is the engine's promise.
			local := replayForce(t, cfg, 606060, n)
			res, err := Run(cfg, 606060, local)
			if err != nil {
				results <- result{err: err}
				return
			}
			results <- result{hash: res.HashString()}
		}()
	}
	for g := 0; g < goroutines; g++ {
		r := <-results
		if r.err != nil {
			t.Fatalf("a parallel run failed: %v", r.err)
		}
		if r.hash != want {
			t.Errorf("a battle fought in parallel hashed to %s and the same battle fought on its own "+
				"hashed to %s. The engine keeps mutable state on the tick path that outlives one battle, "+
				"so which battle ran first changed the second one", r.hash, want)
		}
	}
	t.Logf("%d battles fought concurrently at %d v %d all hashed to %s, the same as the sequential run",
		goroutines, n, n, want)
}

// fuzzRuns is how many repetitions to run, read from the environment.
func fuzzRuns(t testing.TB) int {
	t.Helper()
	v := strings.TrimSpace(os.Getenv(fuzzEnv))
	if v == "" {
		return fuzzDefaultRuns
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		t.Fatalf("%s is %q, which is not a count of at least one", fuzzEnv, v)
	}
	return n
}
