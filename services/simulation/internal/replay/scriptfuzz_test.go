package replay

import (
	"fmt"
	"math/rand"
	"os"
	"sort"
	"testing"

	"mbclone/simulation/internal/battle"
)

// The order-script fuzz: fifty random scripts, every one replayed and compared.
//
// WHY FIFTY AND NOT ONE BIG ONE. The claim being tested is that a recorded battle
// replays exactly. Testing it with a single hand-written script proves it about
// that script, and the bugs it would miss are precisely the interesting ones: an
// order kind that is logged but not honoured on replay, a tick stamp that is off
// by one for one kind of order, a row whose fields are written in a different
// order by the encoder and the decoder, a formation order that round-trips its
// facing but not its shape. Every one of those needs an order of a kind the hand-
// written script happens not to contain.
//
// So the scripts are random, and random over the space that matters: the three
// order kinds, both sides, a spread of unit counts, and step counts from none to
// enough that orders land on the same tick. A script with no steps is in the set
// on purpose, because the empty log is the proof that the engine's own decisions
// are re-derived rather than logged, and it is the one case that has no orders to
// lose.
//
// THE RANDOMNESS IS FIXED AND PRINTED. The generator is seeded from an
// environment variable, defaulting to one constant, and the seed is in every
// failure message. A fuzz that reports "script 37 failed" without the seed that
// produced script 37 cannot be re-run, and a nondeterminism bug that only appears
// on one run is exactly the bug this is looking for.
//
// The steps are sorted before running, because a script's steps are a set of
// instructions about ticks rather than a sequence, and the engine refuses a
// commander that hands them back out of order. The sort is stable so that two
// orders on the same tick keep the order they were authored in, which is the
// order the engine applies them in.

// fuzzSeedEnv overrides the generator seed. Its value is printed in every log line
// this file writes, so a failure is always re-runnable.
const fuzzSeedEnv = "MB_REPLAY_FUZZ_SEED"

// fuzzScriptsEnv overrides how many scripts to run, for a slow lane to raise the
// count without an edit. The count is in the log line either way.
const fuzzScriptsEnv = "MB_REPLAY_FUZZ_SCRIPTS"

// getenv reads an environment override, so the values a CI lane would change are
// named in one place and every test that reads one does it the same way.
func getenv(name string) string { return os.Getenv(name) }

// fuzzSeed is the generator seed, from the environment or the default.
func fuzzSeed(t testing.TB) int64 {
	t.Helper()
	v := getenv(fuzzSeedEnv)
	if v == "" {
		return 20261002
	}
	var n int64
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		t.Fatalf("MB_REPLAY_FUZZ_SEED is not a number: %q", v)
	}
	return n
}

// fuzzCount is how many scripts to run, from the environment or the default.
func fuzzCount(t testing.TB) int {
	t.Helper()
	v := getenv(fuzzScriptsEnv)
	if v == "" {
		return 50
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		t.Fatalf("MB_REPLAY_FUZZ_SCRIPTS is not a number: %q", v)
	}
	if n < 1 {
		t.Fatalf("MB_REPLAY_FUZZ_SCRIPTS is %d; a fuzz of no scripts proves nothing", n)
	}
	return n
}

// The shapes a random step can take, and the fields each one writes.
//
// This is a table rather than a switch on a random number so that adding an order
// kind is a line here rather than a hunt through a switch, and so the log line can
// name the kinds that were generated.
var fuzzKinds = []battle.OrderKind{
	battle.OrderMove,
	battle.OrderHold,
	battle.OrderFormation,
}

// The shapes, for a formation order. FormationNone is left out: it is not a shape
// and the engine refuses a formation order that names no shape.
var fuzzFormations = []battle.Formation{
	battle.FormationLine,
	battle.FormationColumn,
	battle.FormationWedge,
	battle.FormationSquare,
	battle.FormationSkirmish,
}

// The intents a move can be made under. IntentHold is reachable through OrderHold
// rather than through a move, and is left out here so the two paths are not the
// same test twice.
var fuzzIntents = []battle.Intent{
	battle.IntentAdvance,
	battle.IntentEngage,
	battle.IntentWithdraw,
	battle.IntentRout,
}

// randomScript builds one script from a generator.
//
// The generator is the package's own math/rand, which is allowed here and only
// here: this is test code choosing what to test, not the simulation choosing what
// to do. A seeded generator is what makes a failure re-runnable, and a global
// generator with no seed would make it a coin flip every run.
func randomScript(r *rand.Rand, index int) *battle.Script {
	// A unit count that varies, small enough that fifty scripts finish. Four
	// through twelve covers the sizes where the engine's stages start and stop
	// mattering: a four-a-side fight has almost no melee, and a twelve-a-side one
	// is busy in every stage.
	units := 4 + r.Intn(9)
	seed := uint64(r.Int63())
	s := battle.NewScript(fmt.Sprintf("fuzz-%02d", index), seed,
		battle.Roster{Units: units},
		battle.Roster{Units: units})

	// The step count spans zero to about four per unit, so some scripts order
	// nothing, some order a little, and some pile two orders onto the same tick.
	// The pile-on is deliberate: two orders for one unit on one tick are refused
	// by the script decoder, but two orders for DIFFERENT units on one tick are
	// fine, and that is the case where the tick ordering in the log is doing real
	// work.
	steps := r.Intn(units*4 + 1)
	taken := map[[2]int]bool{}
	for i := 0; i < steps; i++ {
		unit := r.Intn(units * 2)
		tick := r.Intn(units * 6)
		if taken[[2]int{unit, tick}] {
			// The engine refuses two orders for one unit on one tick, and a fuzz
			// script that did that would be testing the refusal rather than the
			// replay. Draw again rather than skipping: skipping biases the step
			// count downward and would quietly reduce how much is covered.
			continue
		}
		taken[[2]int{unit, tick}] = true

		kind := fuzzKinds[r.Intn(len(fuzzKinds))]
		o := battle.Order{
			Tick: tick,
			Unit: unit,
			Side: battle.SideA,
			Kind: kind,
		}
		if unit >= units {
			o.Side = battle.SideB
		}
		switch kind {
		case battle.OrderFormation:
			// A formation order carries a shape and a bearing and no movement.
			// The facing is drawn from a full turn in small steps so the value
			// round-trips through the log's float encoding as an exact float64
			// rather than as something a reader has to trust.
			o.Formation = fuzzFormations[r.Intn(len(fuzzFormations))]
			o.Facing = float64(r.Intn(8)) * 0.39269908169872414
		case battle.OrderMove:
			// The step is bounded well under the engine's per-tick step limit, so
			// the order is not silently clamped and the replay is being asked to
			// reproduce the number that was written rather than a clamped copy of
			// it. A clamped order is a real case, covered by the engine's own
			// tests; here it would mean most orders were the same order.
			o.DX = float64(r.Intn(61)-30) / 10
			o.DY = float64(r.Intn(61)-30) / 10
			o.Intent = fuzzIntents[r.Intn(len(fuzzIntents))]
		}
		s.Steps = append(s.Steps, o)
	}
	// Sorted by tick, stably, which is what EncodeScript does on write and what a
	// script read from a file would already be in.
	sort.SliceStable(s.Steps, func(i, j int) bool { return s.Steps[i].Tick < s.Steps[j].Tick })
	return s
}

// TestOrderScriptFuzzReplaysIdentically is the fuzz.
//
// Fifty random scripts, each fought, recorded, and replayed from its own recording,
// and each required to produce the original's result hash. The comparison is the
// result hash because that is what the rest of the system compares: it covers every
// unit's final state and every published total, so a replay that got one man one bit
// out of place fails here.
func TestOrderScriptFuzzReplaysIdentically(t *testing.T) {
	if testing.Short() {
		t.Skip("fifty scripted battles is not a short-mode test")
	}
	cfg := loadConfig(t)
	seed := fuzzSeed(t)
	count := fuzzCount(t)

	var withOrders, emptyScripts, totalOrders, kindsSeen int
	seen := map[battle.OrderKind]int{}
	for i := 0; i < count; i++ {
		s := randomScript(rand.New(rand.NewSource(seed+int64(i))), i)

		// The script goes through its own file format before it is fought. That is
		// deliberate and it is the point: a fuzz that builds a Script in Go and
		// runs it proves the engine is deterministic, and this file is about the
		// ENCODER and the decoder agreeing with the engine as well. So the bytes
		// go out and come back, and the battle that is fought is the one a file
		// would have described.
		encoded, err := battle.EncodeScript(s)
		if err != nil {
			t.Fatalf("script %d would not encode: %v", i, err)
		}
		decoded, err := battle.DecodeScript(encoded)
		if err != nil {
			t.Fatalf("script %d did not survive its own round trip: %v\n%s", i, err, encoded)
		}

		res, rec, err := battle.RunScript(cfg, decoded, 0)
		if err != nil {
			t.Fatalf("script %d would not run: %v\n%s", i, err, encoded)
		}
		if len(decoded.Steps) == 0 {
			emptyScripts++
		} else {
			withOrders++
		}
		totalOrders += len(decoded.Steps)
		for _, o := range decoded.Steps {
			seen[o.Kind]++
			kindsSeen++
		}

		check, err := battle.Verify(cfg, rec, res)
		if err != nil {
			t.Fatalf("script %d recorded but would not verify: %v\n%s", i, err, encoded)
		}
		if !check.Match {
			t.Errorf("script %d (%s, seed %d) replayed to a different battle: %s\n%s",
				i, decoded.Name, decoded.Seed, check, encoded)
		}
	}

	// The coverage report, so a run that quietly stopped exercising something is
	// visible. All three order kinds and at least one empty script are required,
	// because a fuzz whose generator happens to produce none of them would pass
	// while testing less than it claims to.
	for _, k := range fuzzKinds {
		if seen[k] == 0 {
			t.Errorf("the generator produced no %s orders across %d scripts, so that kind is "+
				"untested by this run", k, count)
		}
	}
	if emptyScripts == 0 {
		t.Errorf("the generator produced no script with no orders, so the empty-log case (the " +
			"engine's own decisions being re-derived rather than logged) was not exercised")
	}
	t.Logf("%d random scripts, generator seed %d: %d with orders, %d with an empty log, "+
		"%d orders total, %v", count, seed, withOrders, emptyScripts, totalOrders, seen)
}

// TestOrderScriptFuzzReplaysIdenticallyAfterAFileRoundTrip is the same fuzz with
// the log's own bytes in the middle, rather than the script's.
//
// The first test proves a script survives being written, read, fought, and
// replayed in memory. It does not prove the ORDER LOG survives its own encoder:
// RunScript hands the engine a Recording built in Go, and the file format that
// actually gets written to disk is EncodeOrderLog, which is a second encoder with
// its own field order and its own digest. A disagreement between the two would
// leave every in-memory test green and every saved battle unreplayable, which is
// the single most expensive possible failure for this system: it is a bug that
// only appears once a battle has been saved, closed, and reopened.
//
// So this takes the recording, encodes the log, decodes it, and replays THAT.
func TestOrderScriptFuzzReplaysIdenticallyAfterAFileRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("fifty scripted battles is not a short-mode test")
	}
	cfg := loadConfig(t)
	seed := fuzzSeed(t)
	count := fuzzCount(t)

	// Fewer scripts than the in-memory fuzz, because each of these pays for a
	// battle, an encode, a decode and a replay. The count is a third of the
	// other and the seed is offset so the two fuzzes do not test the same
	// scripts, which would make the second one a subset of the first.
	const perRun = 1
	rounds := count / 3
	var totalOrders int
	for i := 0; i < rounds; i++ {
		s := randomScript(rand.New(rand.NewSource(seed+1000+int64(i)*perRun)), i)
		res, rec, err := battle.RunScript(cfg, s, 0)
		if err != nil {
			t.Fatalf("script %d would not run: %v", i, err)
		}
		totalOrders += len(s.Steps)

		var encoded []byte
		if rec.Log != nil {
			encoded, err = rec.Log.Encode(rec.Seed, cfg.Version)
			if err != nil {
				t.Fatalf("script %d recorded a log that would not encode: %v", i, err)
			}
			// The log's own digest has to be stable across the round trip, or the
			// file on disk is not the log that was recorded.
			before := rec.Log.Hash()
			back, _, _, err := battle.DecodeOrderLog(encoded)
			if err != nil {
				t.Fatalf("script %d wrote a log it could not read back: %v", i, err)
			}
			if after := back.Hash(); after != before {
				t.Errorf("script %d: the log's digest changed across a round trip, %016x became %016x",
					i, before, after)
			}
			if got, want := back.Len(), rec.Log.Len(); got != want {
				t.Errorf("script %d: the log has %d rows after a round trip and %d before it",
					i, got, want)
			}
		}

		setup, err := s.Setup(cfg)
		if err != nil {
			t.Fatalf("script %d would not build a setup: %v", i, err)
		}
		var check *battle.ReplayCheck
		if encoded != nil {
			check, err = battle.VerifyEncoded(cfg, encoded, setup, res)
		} else {
			check, err = battle.Verify(cfg, rec, res)
		}
		if err != nil {
			t.Fatalf("script %d wrote a log that would not verify: %v", i, err)
		}
		if !check.Match {
			t.Errorf("script %d replayed from its own bytes to a different battle: %s", i, check)
		}
	}
	t.Logf("%d scripts through a log file round trip, generator seed %d, %d orders total",
		rounds, seed, totalOrders)
}
