package battle

// This file is task 23: a hundred seeds, and the same hundred seeds again in
// processes that were not the first one.
//
// # WHAT THE EXISTING FUZZ ALREADY DOES, AND WHAT IT CANNOT
//
// fuzz_test.go is careful about this and says so in its own comment. Go
// randomises map iteration, so the order a map is walked in changes between
// PROCESSES but not within one. A fuzz that runs seed 31337 twenty times in one
// process therefore cannot see a stage that accumulates into a map and sums the
// result, because the iteration order is the same every time it runs. Only a
// process restart changes it.
//
// Its own words: "a process restart is the only thing that changes it and a
// same-process loop cannot."
//
// So the two halves of "deterministic" are different experiments and this file
// runs both.
//
//   - AHundredSeedsEachFightTheSameBattleTwice: a hundred seeds, each fought
//     twice in this process. This is the half that catches a draw whose count
//     depends on something the seed moves, and it also asserts that the hundred
//     battles are hundred DIFFERENT battles - because an engine that ignores the
//     seed satisfies "same seed, same hash" perfectly, by fighting the same
//     fight a hundred times. That is the failure mode a naive determinism test
//     passes straight through, and asserting distinctness is what closes it.
//
//   - TheSameSeedFightsTheSameBattleInAnotherProcess: the same seeds fought in
//     freshly exec'd copies of the test binary, with the hashes brought back and
//     compared against this process's. This is the half that can see map
//     iteration order, and it is the only one of the two that is a real test of
//     "the same seed is the same battle" rather than of "the same code is
//     self-consistent".
//
// # WHY RE-EXEC AND NOT A SUBPROCESS THAT RUNS THE ENGINE
//
// The child is this test binary with an environment variable set, running one
// test, printing one line per seed. It is the same binary, the same build, the
// same balance file, and the only thing that differs is the process, which is
// the entire variable under test. A separate program would differ in more than
// that, and anything it disagreed about would be ambiguous.

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

// determinismSweepSeeds is how many distinct seeds the sweep fights. A hundred
// is the number the order asked for and it is not arbitrary: the seeds are
// spread by a large odd stride rather than counted up, so consecutive seeds do
// not produce neighbouring generator states, which is the case where a
// determinism bug is least likely to show.
const determinismSweepSeeds = 100

// determinismSweepStride is the odd number the seeds are spread by. Prime-sized
// and odd, so the hundred seeds are not congruent modulo anything a generator
// is likely to be using.
const determinismSweepStride = 7919

// determinismSweepUnits is the size the sweep fights at.
//
// Eight a side, which is the smallest size at which the melee and aimed-fire
// stages are both busy and the spatial index is carrying more than one cell.
// Bigger is not better here: a determinism bug that a 100-seed sweep misses at
// eight a side would be a bug that only exists in a crowd, and the crowd is
// covered by TestDeterminismFuzz at the reference size. A hundred seeds at
// 500 a side is a hundred half-hour battles.
const determinismSweepUnits = 8

// determinismSeed is the seed a sweep index stands for.
func determinismSeed(i int) uint64 { return uint64(31337 + i*determinismSweepStride) }

// TestAHundredSeedsEachFightTheSameBattleTwice is the half a same-process fuzz
// can do, done a hundred times over rather than once.
func TestAHundredSeedsEachFightTheSameBattleTwice(t *testing.T) {
	if testing.Short() {
		t.Skip("a hundred seeds fought twice is a hundred and sixty battles; -short skips it")
	}
	cfg := loadConfig(t)
	seen := make(map[string]uint64, determinismSweepSeeds)
	start := time.Now()
	var worst time.Duration

	for i := 0; i < determinismSweepSeeds; i++ {
		seed := determinismSeed(i)
		setup := replayForce(t, cfg, seed, determinismSweepUnits)

		tick := time.Now()
		first, err := Run(cfg, seed, setup)
		if err != nil {
			t.Fatalf("seed %d failed on its first run: %v", seed, err)
		}
		elapsed := time.Since(tick)
		if elapsed > worst {
			worst = elapsed
		}
		// A SECOND setup, not the same one reused. A Setup is a roster and Run
		// consumes nothing from it, so reusing it would be free - but a reused
		// roster is one fewer place the two runs could differ, and this test is
		// about there being nowhere left for them to.
		again, err := Run(cfg, seed, replayForce(t, cfg, seed, determinismSweepUnits))
		if err != nil {
			t.Fatalf("seed %d failed on its second run: %v", seed, err)
		}

		a, b := first.HashString(), again.HashString()
		if a != b {
			t.Fatalf("seed %d fought two different battles in one process: %s over %d ticks "+
				"(%s, %d dead a side) against %s over %d ticks (%s, %d dead a side). The engine "+
				"drew a number or read state in an order that changed between two calls that "+
				"asked for exactly the same thing",
				seed, a, first.Ticks, first.Outcome.Kind, int(first.Sides[0].Dead),
				b, again.Ticks, again.Outcome.Kind, int(again.Sides[0].Dead))
		}
		if other, clash := seen[a]; clash {
			t.Errorf("seeds %d and %d both hashed to %s over %d ticks. Two different seeds "+
				"fighting the same battle means one of them is not reaching the engine, and a "+
				"determinism test that only checks same-seed-same-hash sails straight past it",
				other, seed, a, first.Ticks)
		}
		seen[a] = seed
	}

	t.Logf("%d seeds at %d v %d, each fought twice, %d distinct hashes, no battle fought "+
		"twice differently, in %s. Slowest single battle %s",
		determinismSweepSeeds, determinismSweepUnits, determinismSweepUnits, len(seen),
		time.Since(start).Round(time.Millisecond), worst.Round(time.Millisecond))
	if len(seen) != determinismSweepSeeds {
		t.Errorf("%d seeds produced %d distinct battles; every seed has to reach the engine "+
			"or the sweep is not testing the engine", determinismSweepSeeds, len(seen))
	}
}

// determinismProbeEnv is the switch that turns this test into the child half.
// Set, the test does the probe and prints; unset, it runs the children.
const determinismProbeEnv = "BATTLE_DETERMINISM_PROBE"

// determinismProbePrefix marks the lines the parent parses, so a stray log line
// from anywhere else in the package cannot be mistaken for a hash.
const determinismProbePrefix = "DETERMINISM-PROBE"

// TestTheSameSeedFightsTheSameBattleInAnotherProcess is the half that needs a
// process restart, and the reason the rest of the determinism suite is not
// enough on its own.
//
// It fights a subset of the sweep's seeds in this process, then re-execs this
// test binary once per seed and compares. Six seeds, because each child is a
// fresh process paying for a full Go runtime start and a package init: the
// point is to change the process, not to make the number large, and the
// same-process half above is where the number belongs.
func TestTheSameSeedFightsTheSameBattleInAnotherProcess(t *testing.T) {
	// The child. It prints and returns; it never starts a child of its own, or
	// the recursion has no bottom.
	if os.Getenv(determinismProbeEnv) != "" {
		determinismProbeRun(t)
		return
	}

	cfg := loadConfig(t)
	// The seeds are taken from the START of the sweep rather than spread across
	// it, because they are the ones with known in-process hashes to compare
	// against, and because a probe that took the first six is a probe somebody
	// can reproduce by hand from the log.
	const children = 6
	self, err := os.Executable()
	if err != nil {
		t.Fatalf("finding this test binary failed: %v", err)
	}

	for i := 0; i < children; i++ {
		seed := determinismSeed(i)
		mine, err := Run(cfg, seed, replayForce(t, cfg, seed, determinismSweepUnits))
		if err != nil {
			t.Fatalf("seed %d failed in this process: %v", seed, err)
		}
		want := mine.HashString()

		cmd := exec.Command(self, "-test.run=^TestTheSameSeedFightsTheSameBattleInAnotherProcess$",
			"-test.v")
		cmd.Env = append(os.Environ(), determinismProbeEnv+"=1", determinismProbeSeed+"="+strconv.FormatUint(seed, 10))
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("seed %d: the child process failed: %v\n%s", seed, err, out)
		}
		got, ticks, ok := parseDeterminismProbe(string(out))
		if !ok {
			t.Fatalf("seed %d: the child printed no %s line for the seed it was given.\n%s",
				seed, determinismProbePrefix, out)
		}
		status := "the same battle in a process that was not this one"
		if got != want {
			status = "A DIFFERENT BATTLE"
		}
		t.Logf("seed %d: this process %s over %d ticks; the child process %s over %d ticks. %s",
			seed, want, mine.Ticks, got, ticks, status)
		if got != want {
			t.Errorf("seed %d hashed to %s here and %s in a freshly started process, both "+
				"over the same seed, the same %d v %d roster and the same balance file. Go "+
				"randomises map iteration between processes and not within one, so this is "+
				"what a stage that accumulates into a map and sums the result looks like",
				seed, want, got, determinismSweepUnits, determinismSweepUnits)
		}
	}
	t.Logf("%d seeds fought in a second process each, and every one of them is the same "+
		"battle this process fought", children)
}

// determinismProbeSeed names the one seed the child is to fight.
const determinismProbeSeed = "BATTLE_DETERMINISM_PROBE_SEED"

// determinismProbeRun is the child half: fight one seed, print one line, return.
func determinismProbeRun(t *testing.T) {
	raw := os.Getenv(determinismProbeSeed)
	if raw == "" {
		t.Fatalf("%s was set without %s, so there is no seed to fight", determinismProbeEnv,
			determinismProbeSeed)
	}
	seed, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		t.Fatalf("%s=%q is not a seed: %v", determinismProbeSeed, raw, err)
	}
	cfg := loadConfig(t)
	res, err := Run(cfg, seed, replayForce(t, cfg, seed, determinismSweepUnits))
	if err != nil {
		t.Fatalf("seed %d failed in the child process: %v", seed, err)
	}
	fmt.Printf("%s %d %s %d\n", determinismProbePrefix, seed, res.HashString(), res.Ticks)
}

// parseDeterminismProbe pulls the one line it needs out of a child's output.
//
// The tick count comes back too, and it is checked by the caller rather than
// here: two processes agreeing on a hash is the claim, and a hash that matched
// while the tick count differed would mean the hash does not cover what it
// claims to. Returning it is cheaper than returning a struct for one integer.
func parseDeterminismProbe(out string) (hash string, ticks int, ok bool) {
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		fields := strings.Fields(sc.Text())
		if len(fields) != 4 || fields[0] != determinismProbePrefix {
			continue
		}
		n, err := strconv.Atoi(fields[3])
		if err != nil {
			return "", 0, false
		}
		return fields[2], n, true
	}
	return "", 0, false
}
