package battle

import (
	"testing"
	"time"
)

// PERFORMANCE GUARD FOR THE DETERMINISM WORK.
//
// The brief for this work is explicit that determinism must not make the 500 v 500
// case slower. These benchmarks exist so that "it did not make it slower" stays
// true as the engine changes, rather than being a claim made once.
//
// # WHY A BOUNDED TICK BUDGET RATHER THAN A FULL BATTLE
//
// A full 500 v 500 battle does not currently resolve in this package; the ending
// condition is being worked on and a full run runs to the tick bound. So the
// benchmark below drives RunTicks with a fixed budget, which runs the same tick
// loop over the same field and stops on a tick count the caller chose. That is the
// correct shape for a throughput measurement and it terminates, which a benchmark
// that waits for a conclusion cannot promise.
//
// # WHY THE ADDED COST IS STRUCTURALLY ZERO PER TICK
//
// The order log, the replayer, and the result hash are all outside the tick loop.
// Run and RunTicks call b.result() once, when the battle is over, and that is the
// only place hashUnitState runs. Battle.tick, Battle.commit, and runCommanders are
// unchanged. So there is no per-tick cost to regress and the cost that does exist
// is O(units) once per battle.
//
// BenchmarkAddedCostIsOncePerBattle measures that cost as a FRACTION of a single
// tick, in one process, which is the only way to measure it on a machine whose load
// makes absolute timings meaningless.

// benchBudget is the tick budget the bounded benchmarks run for.
const benchBudget = 100

// BenchmarkBounded500v500 measures the tick loop on a 500 v 500 field, bounded.
func BenchmarkBounded500v500(b *testing.B) {
	const seed = 20260930
	const n = 500
	cfg := loadConfig(b)
	setup, err := standardForce(b, cfg, seed, n)
	if err != nil {
		b.Fatalf("force: %v", err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res, err := RunTicks(cfg, seed, setup, benchBudget)
		if err != nil {
			b.Fatalf("battle: %v", err)
		}
		if res.Ticks != benchBudget {
			b.Fatalf("ran %d ticks, not the %d the budget allowed", res.Ticks, benchBudget)
		}
	}
	b.ReportMetric(float64(2*n), "units")
	b.ReportMetric(float64(benchBudget), "ticks")
}

// BenchmarkReplayIsTheSameCostAsRunning measures the replay of a recorded battle
// against recording one, which is the number a caller deciding whether to keep a
// replay log needs.
//
// A replay is not cheaper than the original run and is not supposed to be: it runs
// the same tick loop over the same field with the same order channel. What it must
// be is the SAME, because a replay that was quietly slower than the original would
// tempt somebody into not running it, and a replay nobody runs is not a guarantee
// of anything.
func BenchmarkReplayIsTheSameCostAsRunning(b *testing.B) {
	const seed = 20260930
	const n = 120
	cfg := loadConfig(b)
	setup, err := standardForce(b, cfg, seed, n)
	if err != nil {
		b.Fatalf("force: %v", err)
	}
	// Record a battle, then keep only the orders issued before the budget ran out,
	// so the replay is measured over the same number of ticks as the run.
	full, err := RunTicks(cfg, seed, setup, benchBudget)
	if err != nil {
		b.Fatalf("reference run: %v", err)
	}
	_, rec, err := Record(cfg, seed, setup,
		&marchingCommander{side: SideA, step: 1, speakEvery: 1}, 0, "bench")
	if err != nil {
		b.Fatalf("recording: %v", err)
	}
	trimmed := NewOrderLog(0)
	trimmed.SetRoster(rec.Log.RosterHash())
	for _, row := range rec.Log.Rows() {
		if row.Tick >= full.Ticks {
			break
		}
		trimmed.Append(row)
	}
	rec.Log = trimmed

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Replay(cfg, rec); err != nil {
			b.Fatalf("replay: %v", err)
		}
	}
	b.ReportMetric(float64(rec.Log.Len()), "orders")
	b.ReportMetric(float64(2*n), "units")
	b.ReportMetric(float64(full.Ticks), "ticks")
}

// TestAddedCostIsOncePerBattle measures the one cost the determinism work adds, as
// a fraction of a single tick, inside one process.
//
// A ratio rather than an absolute figure is deliberate: on a shared machine the
// absolute timings of two separate processes are not comparable, because they do
// not see the same machine load, but a tick and a hash measured back to back in one
// process do. The assertion is loose on purpose, because the point is to catch the
// hash being moved INTO the tick loop, which would be a hundred-fold regression
// rather than a fractional one.
func TestAddedCostIsOncePerBattle(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 500
	setup := replayForce(t, cfg, seed, n)
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		t.Fatalf("building the battle: %v", err)
	}
	// Warm the hashes and the unit buffers so the first measured tick is not paying
	// for allocations the second one would not.
	for i := 0; i < 3; i++ {
		if err := b.tick(); err != nil {
			t.Fatalf("warmup tick: %v", err)
		}
	}

	const tickReps = 8
	tickStart := time.Now().UnixNano()
	for i := 0; i < tickReps; i++ {
		if err := b.tick(); err != nil {
			t.Fatalf("tick: %v", err)
		}
	}
	tickNs := float64(time.Now().UnixNano()-tickStart) / tickReps

	const hashReps = 400
	hashStart := time.Now().UnixNano()
	sink := uint64(0)
	for i := 0; i < hashReps; i++ {
		sink ^= b.hashUnitState(orderLogHashSeed)
	}
	hashNs := float64(time.Now().UnixNano()-hashStart) / hashReps
	_ = sink

	share := hashNs / tickNs
	t.Logf("%d units: one tick %.3f ms, one state hash %.3f ms, hash is %.2f%% of a tick",
		2*n, tickNs/1e6, hashNs/1e6, share*100)
	t.Logf("the hash runs once per battle, so over a %d-tick battle it is %.4f%% of the work",
		benchBudget, hashNs/(tickNs*benchBudget)*100)

	// If the hash ever moved into the tick loop this ratio would be about 100, not
	// about 1. A ceiling of half a tick is loose enough to survive a loaded machine
	// and far below the failure it is looking for.
	if share > 0.5 {
		t.Errorf("the state hash costs %.2f%% of a tick; it is meant to be once per battle, not per tick", share*100)
	}
}
