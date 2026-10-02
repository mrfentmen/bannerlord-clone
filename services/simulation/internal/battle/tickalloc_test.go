package battle

// This file is task 32: prove, by measurement rather than by comment, what the
// per-tick hot loop allocates.
//
// There is a claim in the code that the tick loop is allocation-free, and the
// claim is close to true in a way that is worth pinning down precisely, because
// "close to true" is where a performance budget quietly goes to die. Measured on
// the shipped balance file at 20261002:
//
//	units on the field   allocs per tick   allocs per unit
//	              80                 3.0            0.0375
//	             400                 3.0            0.0075
//
// Three, and the same three at both sizes. Nothing in the loop is per unit, per
// cell or per candidate: the cost of a tick's garbage is a constant, so the
// per-unit figure falls as the field grows, and a battle of any size is bounded
// by three allocations no matter how long it runs.
//
// The three are the RNG substream labels. stageMorale, stageMelee and
// stageAimedFire each call b.rngFor, which builds the string
// "tick-" + itoa(tickNo) + "-" + stage and hands it to (*rng.Rng).Derive, and a
// string built at run time is a heap object. One per stage, three per tick.
//
// That is the honest boundary of what this package can fix. rng.Derive takes a
// string and a string built from a tick number cannot be made without one, and
// internal/rng is not this package's to change. It is also not worth changing:
// three allocations against a thousand units is three thousandths of an
// allocation per unit, against a budget of 250 microseconds per unit per tick.
// The alternative - caching a stream per stage and re-deriving it - would change
// which numbers the generator produces, which is the one thing a seeded engine
// must never do (CONSTITUTION.md 1.1: the same seed is the same battle).
//
// So the test below asserts what is true and would fail if it stopped being
// true: the tick's allocations are a small CONSTANT, and that constant does not
// grow when the field does. A per-unit allocation anywhere in the loop - a map
// insert, a formatted string, a slice grown per unit - moves the second number
// and fails the test. That is the failure this file exists to catch, and it is
// not a failure of style: an allocating tick loop is a tick loop whose cost
// depends on the garbage collector's mood, and a 500 v 500 battle at 250 us a
// unit is a budget with no room for that.

import (
	"testing"

	"mbclone/simulation/internal/config"
)

// allocProbeRuns is how many times the closure runs inside testing.AllocsPerRun.
// Twenty is enough for the figure to be an average rather than a single
// reading, and small enough that the whole test is a second.
const allocProbeRuns = 20

// allocProbeWarm is how many ticks run before the measurement.
//
// Not to settle the indexes - one tick does that - but to grow every scratch
// the loop keeps: the cell scratch the morale walk appends into, the event
// slice, and the grid's own id buffer. AllocsPerRun measures the steady state,
// and the first tick of a battle is not the steady state of anything.
const allocProbeWarm = 12

// allocProbeCeiling is the bound the measurement is held to.
//
// It is 8 against a measured 3, and the slack is deliberate: this is a test about
// the SHAPE of the allocation curve, not about hitting a number exactly. A
// battle that emitted a couple of events inside the measured window appends to
// the event slice, and growth there is one allocation that has nothing to do
// with the loop this file is about. What the test will not accept is a count
// that scales with the field, because that is the whole failure mode.
const allocProbeCeiling = 8

// allocProbe builds a battle of n a side, runs it far enough in that every
// scratch is the size it is going to stay, and returns it.
func allocProbe(t testing.TB, cfg *config.Config, n int) *Battle {
	t.Helper()
	setup, err := standardForce(t, cfg, 20260930, n)
	if err != nil {
		t.Fatalf("building a %d a side force failed: %v", n, err)
	}
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	for i := 0; i < allocProbeWarm; i++ {
		if err := b.tick(); err != nil {
			t.Fatalf("warm-up tick %d failed: %v", i, err)
		}
	}
	return b
}

// TestTheTickLoopAllocatesNothingPerUnit is the measurement, and it is written
// as a comparison rather than as a threshold because that is the property being
// claimed: the loop's garbage is a constant, not a function of the field.
//
// Two sizes an order of magnitude apart. If anything in the tick allocates per
// unit, per cell or per candidate, the larger battle reports a larger count and
// the test says so by name. If nothing does, both report the same number and the
// per-unit figures are that number divided by two different fields.
func TestTheTickLoopAllocatesNothingPerUnit(t *testing.T) {
	if testing.Short() {
		t.Skip("this reads the allocation curve of a 200 v 200 battle")
	}
	cfg := loadConfig(t)
	small := allocProbe(t, cfg, 40)
	big := allocProbe(t, cfg, 200)

	smallAllocs := testing.AllocsPerRun(allocProbeRuns, func() {
		if err := small.tick(); err != nil {
			t.Fatalf("the 40 v 40 tick failed: %v", err)
		}
	})
	bigAllocs := testing.AllocsPerRun(allocProbeRuns, func() {
		if err := big.tick(); err != nil {
			t.Fatalf("the 200 v 200 tick failed: %v", err)
		}
	})

	// The stages, separately, so the three are attributed rather than guessed at.
	// Each of the three that draws needs a substream, so each is expected to be
	// the one.
	byStage := map[string]float64{}
	for name, stage := range map[string]func(){
		"stageMorale":    big.stageMorale,
		"stageMelee":     big.stageMelee,
		"stageTargeting": big.stageTargeting,
	} {
		byStage[name] = testing.AllocsPerRun(allocProbeRuns, stage)
	}
	rngAllocs := testing.AllocsPerRun(allocProbeRuns, func() { _ = big.rngFor("morale") })

	// And the per-unit hot loop on its own, which is the loop the 250 us budget
	// is written about: one unit's whole neighbourhood query, allocations and
	// all. This is the number that has to be exactly zero, and it is measured
	// with the real scratch the battle grew rather than a scratch of its own,
	// because a scratch of its own would be measuring the harness.
	scratch := big.cellScratch
	perUnit := testing.AllocsPerRun(allocProbeRuns, func() {
		u := big.units[0]
		scratch = big.moraleNeighbourhood(u.X, u.Y, uint8(u.Side), cfg.Battle.MoraleNeighbourhood, scratch).scratch
	})
	big.cellScratch = scratch

	for _, row := range []struct {
		label string
		units int
		allocs float64
	}{
		{"40 v 40, one whole tick", 80, smallAllocs},
		{"200 v 200, one whole tick", 400, bigAllocs},
	} {
		t.Logf("%-26s %.1f allocations, %.4f per unit", row.label, row.allocs,
			row.allocs/float64(row.units))
	}
	for _, name := range []string{"stageMorale", "stageMelee", "stageTargeting"} {
		t.Logf("%-26s %.1f allocations", name, byStage[name])
	}
	t.Logf("%-26s %.1f allocations: one string, \"tick-<n>-<stage>\", and the "+
		"stream it derives", "b.rngFor by itself", rngAllocs)
	t.Logf("%-26s %.1f allocations: the whole per-unit hot loop", "one unit's morale query", perUnit)

	if perUnit != 0 {
		t.Errorf("one unit's morale neighbourhood query allocated %.1f times. The per-unit "+
			"hot loop is the loop the 250 us per-unit budget covers, and a unit that "+
			"allocates is a unit whose cost depends on the garbage collector", perUnit)
	}
	if byStage["stageTargeting"] != 0 {
		t.Errorf("stageTargeting allocated %.1f times. It is a pure read of the snapshot "+
			"writing to the delta buffer and has no business allocating at all",
			byStage["stageTargeting"])
	}
	if bigAllocs > allocProbeCeiling {
		t.Errorf("a whole tick of a 200 v 200 battle allocated %.1f times, against a ceiling of "+
			"%d. Three is what the three RNG substreams cost; a count that has grown past "+
			"that is a per-unit or per-candidate allocation somewhere in the loop",
			bigAllocs, allocProbeCeiling)
	}
	// The claim itself. Small is a constant, so a field five times the size
	// allocates no more garbage per tick, and the per-unit cost of allocation
	// falls by the same factor.
	if bigAllocs > smallAllocs {
		t.Errorf("a tick of a 200 v 200 battle allocated %.1f times and a tick of a 40 v 40 "+
			"battle allocated %.1f. The loop's garbage is supposed to be a constant that "+
			"does not grow with the field, and something in it is allocating per unit, per "+
			"cell or per candidate", 			bigAllocs, smallAllocs)
	}
}

// BenchmarkTickAllocations is the -benchmem form of the same claim, because a
// number in a log line is a reading and allocs/op in a benchmark is a contract
// anybody can re-measure.
//
// It is written as ticks, not as battles: the whole point is that one tick of a
// 500 v 500 battle should cost a handful of allocations regardless of the
// thousand units it moved, and the only way to see that is to let a tick be the
// unit of work.
func BenchmarkTickAllocations(b *testing.B) {
	if testing.Short() {
		b.Skip("this runs a 500 v 500 battle")
	}
	cfg := loadConfig(b)
	n := int(cfg.Battle.ReferenceUnitsPerSide)
	bl := allocProbe(b, cfg, n)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := bl.tick(); err != nil {
			b.Fatalf("tick: %v", err)
		}
	}
	b.StopTimer()
	b.ReportMetric(float64(2*n), "units")
	b.ReportMetric(b.Elapsed().Seconds()/float64(b.N)/float64(2*n)*1e6, "us/unit")
}
