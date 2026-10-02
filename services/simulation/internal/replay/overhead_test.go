package replay

import (
	"runtime"
	"testing"
	"time"

	"mbclone/simulation/internal/battle"
)

// What it costs to make a battle replayable.
//
// THE NUMBER THIS FILE EXISTS TO PRODUCE
//
// A replay is only worth having if making one is cheap. The claim on the task
// list is a target of under five per cent on light load, and the first honest
// thing to say about that target is that it cannot be measured on a box with
// eight agents on it, and this file is written so that nobody has to guess.
//
// WHAT A SINGLE TIMING RUN SHOWED, AND WHY IT IS NOT THE NUMBER
//
// The first version of this measured each variant once, in sequence:
//
//	 64 v  64: unobserved 1.30s | seam only 1.59s (+22.5%) | +order log 1.44s (+11.5%)
//	150 v 150: unobserved 3.36s | seam only 4.17s (+24.0%) | +order log 4.19s (+24.7%)
//	500 v 500: unobserved 38.52s | seam only 39.01s (+1.3%) | +order log 45.26s (+17.5%)
//
// The seam's overhead at 500 v 500 came out LOWER than at 150 v 150, which is
// impossible for a cost paid per unit per tick, so those figures are the machine
// and not the code. A mean is the wrong statistic on a shared box for the same
// reason: one run of the baseline landing on a quiet core while the observed run
// lands on a busy one is a 20% error in the answer and nothing in the number says
// so.
//
// THE METHODOLOGY THAT SURVIVES A SHARED BOX
//
// Min-of-N, with the variants INTERLEAVED rather than run in blocks. The minimum
// of N runs of the same work is the run that got the machine most nearly to
// itself, and a scheduler that is busy part of the time cannot drag the minimum
// down — it can only add to it. Interleaving matters for a second reason: a
// block of baselines followed by a block of observed runs is exactly the shape
// that produced the impossible numbers above, because the machine's load drifts
// over seconds and minutes. Alternating baseline, observed, baseline, observed
// puts the two variants on both sides of every drift.
//
// The cost of the method is that the minimum understates the typical case, so the
// percentages here are a FLOOR on the overhead, not an estimate of it. A floor is
// the right thing to assert against and the wrong thing to quote as "the cost of
// recording", and the log line says which one it is printing.

// silentCommander reads the field and writes nothing, which is the seam with no
// observer attached. It is the control for the order-log measurement: the
// difference between it and the recording is the cost of keeping the orders, and
// the difference between an unobserved battle and it is the cost of the seam.
type silentCommander struct{ calls int }

func (s *silentCommander) Command(v *battle.View) error {
	s.calls++
	return nil
}

// timed runs work and returns how long it took, panicking on an error, because a
// variant that failed is not a variant that was fast.
func timed(t testing.TB, what string, work func() error) time.Duration {
	t.Helper()
	start := time.Now()
	if err := work(); err != nil {
		t.Fatalf("%s: %v", what, err)
	}
	return time.Since(start)
}

// minDur is the smallest of the durations, which is the statistic this file is
// built on. Written out rather than using a helper so the choice is visible where
// it is used.
func minDur(ds []time.Duration) time.Duration {
	best := ds[0]
	for _, d := range ds[1:] {
		if d < best {
			best = d
		}
	}
	return best
}

// TestTheCostOfRecordingABattle measures the overhead of each recording mode
// against the same battle run unobserved, and — this is the part that matters —
// measures the noise floor it is being read against.
//
// # WHAT THE FIRST TWO VERSIONS OF THIS MEASURED
//
// Once, in sequence, on this box:
//
//	 64 v  64: unobserved 1.30s | seam only 1.59s (+22.5%) | +order log 1.44s (+11.5%)
//	150 v 150: unobserved 3.36s | seam only 4.17s (+24.0%) | +order log 4.19s (+24.7%)
//	500 v 500: unobserved 38.52s | seam only 39.01s (+1.3%) | +order log 45.26s (+17.5%)
//
// The seam's overhead at 500 v 500 came out LOWER than at 150 v 150, which is
// impossible for a cost paid per unit per tick. Those figures are the machine and
// not the code.
//
// So the second version used the right statistics: min-of-N, with the variants
// INTERLEAVED rather than run in blocks, because a block of baselines followed by
// a block of observed runs is the exact shape that produces impossible numbers
// when the machine's load drifts over minutes. It measured this:
//
//	150 v 150, min of 3: unobserved 5.54s, silent commander 5.24s (-5.3%), orders recorded 4.39s (-20.7%)
//	500 v 500, min of 1: unobserved 46.02s, silent commander 45.49s (-1.1%), orders recorded 49.50s (+7.6%)
//
// NEGATIVE overhead. Recording a battle came out faster than not recording it, by
// twenty per cent at one size and by one per cent at another, and both signs
// flipped between the two versions of the measurement.
//
// # WHAT THAT MEANS, STATED PLAINLY
//
// The five-per-cent target on the task list is NOT VERIFIED on this machine, and
// this test is not going to pretend otherwise by asserting a threshold it cannot
// support. The effect being measured — the cost of an observer copying a
// thousand units' published fields once a tick — is smaller than the run-to-run
// spread of a single battle on a box with eight agents on it. Any percentage this
// file prints at the few-percent scale is noise wearing a decimal point.
//
// The test therefore measures the NOISE FLOOR as a first-class result, because
// "the effect is below what this machine can resolve" is a finding and "here is a
// number" is not. The floor is measured the only honest way: the identical work is
// timed N times under N different labels, and the spread between the fastest and
// the median of those runs is what this box can resolve. A target smaller than
// that spread is not a target this box can test, and saying so is the useful
// output.
//
// The one thing that IS above the noise floor is the cause log, which
// TestTheCauseLogIsWhatCostsIsNotCheap measures on its own and finds to be a
// factor of several, not a fraction of a per cent.
func TestTheCostOfRecordingABattle(t *testing.T) {
	if testing.Short() {
		t.Skip("a timing measurement is not a short-mode test, and a timing measurement on a busy " +
			"machine is not a measurement at all")
	}
	cfg := loadConfig(t)
	const seed = 20260930
	// 150 v 150 rather than 500 v 500, because the point of this test is the
	// resolution of the machine and paying forty seconds a run to learn that the
	// machine cannot resolve five per cent is a poor trade. The big case is
	// reported by the scale test, which is about correctness and not about time.
	const n = 150
	const repeats = 5
	setup := evenForce(t, cfg, seed, n)

	var bare, seam, logged, control []time.Duration
	var ticks int
	// Four variants interleaved, one repeat at a time, so every variant is
	// measured on both sides of every drift in the machine's load.
	//
	// The fourth variant is the control and it is the same work as the first, under
	// a different name. Two identical jobs differing by more than the target is the
	// definition of a noise floor, and measuring it costs one more battle a repeat
	// and turns an unanswerable question into a stated limit.
	for r := 0; r < repeats; r++ {
		bare = append(bare, timed(t, "unobserved battle", func() error {
			res, err := battle.Run(cfg, seed, setup)
			if err == nil {
				ticks = res.Ticks
			}
			return err
		}))
		control = append(control, timed(t, "unobserved battle, control", func() error {
			_, err := battle.Run(cfg, seed, setup)
			return err
		}))
		seam = append(seam, timed(t, "battle with a silent commander", func() error {
			_, err := battle.RunCommanded(cfg, seed, setup, &silentCommander{})
			return err
		}))
		logged = append(logged, timed(t, "battle with its orders recorded", func() error {
			_, _, err := battle.Record(cfg, seed, setup, nil, 1<<20, "overhead")
			return err
		}))
	}
	b, c, s, l := minDur(bare), minDur(control), minDur(seam), minDur(logged)
	median := medianDur(bare)
	floor := 100 * (median - b).Seconds() / b.Seconds()
	controlGap := 100 * (c - b).Seconds() / b.Seconds()
	pct := func(d time.Duration) float64 { return 100 * (d - b).Seconds() / b.Seconds() }

	t.Logf("%d v %d, %d ticks, min of %d interleaved runs of four variants:", n, n, ticks, repeats)
	t.Logf("  unobserved          min %.2fs  median %.2fs", b.Seconds(), median.Seconds())
	t.Logf("  control (same work) min %.2fs  %+.1f%% against the baseline's own minimum", c.Seconds(), controlGap)
	t.Logf("  silent commander    min %.2fs  %+.1f%%", s.Seconds(), pct(s))
	t.Logf("  orders recorded     min %.2fs  %+.1f%%", l.Seconds(), pct(l))
	t.Logf("  NOISE FLOOR: %.1f%%, being the gap between this box's fastest and median run of the "+
		"IDENTICAL job. The control above is the same figure measured as if the two variants "+
		"differed, which is what a five-per-cent claim would have to beat.", floor)

	// The assertion is about the MEASUREMENT and not about the code: if the two
	// identical jobs differ by about as much as the recorded variants do, then
	// those variants have not been distinguished from each other, and the run must
	// say so rather than print three percentages as if they meant something.
	//
	// It fails when the control gap exceeds the recorded gap, because that is the
	// case where the control is the larger effect and the table is noise. It does
	// not fail when the recorded gap is larger, because that is the case where the
	// measurement is worth something, however small.
	seamGap := absPct(pct(s))
	loggedGap := absPct(pct(l))
	controlAbs := absPct(controlGap)
	if seamGap < controlAbs {
		t.Logf("NOT DISTINGUISHED: the silent commander's overhead (%.1f%%) is smaller than the gap "+
			"between two runs of the same job (%.1f%%), so this run cannot say whether the seam costs "+
			"anything. The target is under five per cent; this box resolves about %.0f%%",
			seamGap, controlAbs, floor)
	}
	if loggedGap < controlAbs {
		t.Logf("NOT DISTINGUISHED: recording the order log (%.1f%%) is smaller than the gap between "+
			"two runs of the same job (%.1f%%)", loggedGap, controlAbs)
	}
}

// TestTheCostOfRecordingInCpuTime is the same question asked on a clock that can
// answer it, and it exists because three wall-clock attempts did not settle it.
//
// The wall-clock measurement above is not wrong, it is unresolved: the effect being
// measured is smaller than the run-to-run spread of the identical job on a box with
// several agents on it, so its control gap exceeds its answer and the test says so.
// Min-of-N interleaving and a control variant were the right statistics and did not
// help, because the problem is the clock and not the statistics. A pure-CPU spin on
// this box varies by 99% in wall time and 5% in CPU time, for identical work.
//
// So the variants are measured twice, on both clocks, in the same interleaved runs,
// and the two noise floors are reported side by side. The CPU-time one is expected
// to be far tighter, and whether it is tight ENOUGH is decided by the control
// rather than asserted here: the same discipline as the wall-clock test, applied to
// the better clock. A five-per-cent claim is only asserted when the control's own
// gap is comfortably inside five per cent, because otherwise the machine still
// cannot resolve the claim and saying so is the honest result.
//
// # WHY A FORCED GC BEFORE EACH VARIANT
//
// Each variant starts from a collected heap. Go's GC is triggered by allocation
// volume, so without this the variant that allocates most inherits the previous
// variant's garbage debt and pays for collecting it, which would charge one variant
// for another's cost. The order log allocates; the unobserved battle barely does.
// Measuring that transfer would be measuring the harness.
//
// The forced collection is outside the timed region, so it is not itself in the
// number, and it is wall-clock rather than CPU time so it cannot contaminate the
// figure it is preparing.
func TestTheCostOfRecordingInCpuTime(t *testing.T) {
	if testing.Short() {
		t.Skip("a timing measurement is not a short-mode test")
	}
	measureRecordingCostInCPUTime(t, 150, 9)
}

// TestTheCostOfRecordingInCpuTimeAtFiveHundred is the same measurement where the
// effect is largest, which is the only place a five-per-cent claim can be settled
// on a shared box.
//
// The cost being measured is paid per unit per tick, so it scales with the field
// while the battle's fixed per-tick costs do not. At 150 v 150 the CPU clock's
// control gap came to 4.9% and then 3.1% over two runs while the two variants read
// +7.0%/+3.1% and +2.6%/+4.8% — the effect and the noise are the same size, and
// two runs disagree about which is which. That is the resolution limit, not a
// result.
//
// At 500 v 500 the same absolute noise sits against roughly eight times the work, so
// the percentages compress toward the truth. This is also the size COMBAT.md
// section 13 cares about, which makes it the case worth settling rather than the one
// that is merely cheapest to measure.
//
// Five repeats rather than nine: a 500 v 500 battle is around forty seconds of wall
// time and four variants times five is already twenty battles. The number of repeats
// is what sets the control gap, so this reports its own gap and lets the gate decide
// rather than paying for a tighter one.
func TestTheCostOfRecordingInCpuTimeAtFiveHundred(t *testing.T) {
	if testing.Short() {
		t.Skip("a timing measurement is not a short-mode test")
	}
	measureRecordingCostInCPUTime(t, 500, 5)
}

// measureRecordingCostInCPUTime is the body both sizes run, so the cheap case is the
// same code and not a simplified copy of it.
func measureRecordingCostInCPUTime(t *testing.T, n, repeats int) {
	t.Helper()
	if cpuNow() == 0 {
		t.Skipf("no CPU clock on this platform: %s. The wall-clock measurement in "+
			"TestTheCostOfRecordingABattle still runs, and reports itself as unresolved.",
			cpuClockNames)
	}
	cfg := loadConfig(t)
	const seed = 20260930
	const target = 5.0
	setup := evenForce(t, cfg, seed, n)

	type sample struct{ wall, cpu time.Duration }
	var bare, control, seam, logged []sample
	var ticks int

	// timedBoth runs the work once and charges it to both clocks. The two readings
	// bracket the same execution, so comparing them is comparing the clocks and not
	// comparing two different battles.
	timedBoth := func(what string, work func() error) sample {
		t.Helper()
		runtime.GC()
		w0, c0 := time.Now(), cpuNow()
		if err := work(); err != nil {
			t.Fatalf("%s: %v", what, err)
		}
		return sample{wall: time.Since(w0), cpu: cpuNow() - c0}
	}

	for r := 0; r < repeats; r++ {
		bare = append(bare, timedBoth("unobserved battle", func() error {
			res, err := battle.Run(cfg, seed, setup)
			if err == nil {
				ticks = res.Ticks
			}
			return err
		}))
		control = append(control, timedBoth("unobserved battle, control", func() error {
			_, err := battle.Run(cfg, seed, setup)
			return err
		}))
		seam = append(seam, timedBoth("battle with a silent commander", func() error {
			_, err := battle.RunCommanded(cfg, seed, setup, &silentCommander{})
			return err
		}))
		logged = append(logged, timedBoth("battle with its orders recorded", func() error {
			_, _, err := battle.Record(cfg, seed, setup, nil, 1<<20, "overhead-cpu")
			return err
		}))
	}

	pick := func(ss []sample, cpu bool) []time.Duration {
		out := make([]time.Duration, len(ss))
		for i, s := range ss {
			if cpu {
				out[i] = s.cpu
			} else {
				out[i] = s.wall
			}
		}
		return out
	}

	report := func(cpu bool) (min, median, ctl, seamMin, logMin time.Duration) {
		b, c, s, l := pick(bare, cpu), pick(control, cpu), pick(seam, cpu), pick(logged, cpu)
		return minDur(b), medianDur(b), minDur(c), minDur(s), minDur(l)
	}
	pctOf := func(d, b time.Duration) float64 { return 100 * (d - b).Seconds() / b.Seconds() }

	cpuB, cpuMed, cpuCtl, cpuSeam, cpuLog := report(true)
	wallB, wallMed, wallCtl, _, _ := report(false)

	cpuFloor := 100 * (cpuMed - cpuB).Seconds() / cpuB.Seconds()
	cpuCtlGap := pctOf(cpuCtl, cpuB)
	cpuSeamPct := pctOf(cpuSeam, cpuB)
	cpuLogPct := pctOf(cpuLog, cpuB)
	wallFloor := 100 * (wallMed - wallB).Seconds() / wallB.Seconds()
	wallCtlGap := pctOf(wallCtl, wallB)

	t.Logf("%d v %d, %d ticks, %d repeats, four variants interleaved, each timed on both clocks.",
		n, n, ticks, repeats)
	t.Logf("  NOISE FLOOR, wall clock: %.1f%%   control gap %.1f%%", wallFloor, wallCtlGap)
	t.Logf("  NOISE FLOOR, %s: %.1f%%   control gap %+.1f%%", cpuClockNames, cpuFloor, cpuCtlGap)
	t.Logf("  baseline: wall min %.2fs median %.2fs | cpu min %.2fs median %.2fs",
		wallB.Seconds(), wallMed.Seconds(), cpuB.Seconds(), cpuMed.Seconds())
	t.Logf("  silent commander:    cpu min %.2fs  %+.1f%%", cpuSeam.Seconds(), cpuSeamPct)
	t.Logf("  orders recorded:     cpu min %.2fs  %+.1f%%", cpuLog.Seconds(), cpuLogPct)

	// The gate, and it is deliberately stricter than "the control is inside the
	// target". A first run of this test had a control gap of 4.9% against a 5.0%
	// target, passed the gate, and duly reported the seam at +7.0% as a failure. A
	// gate that a measurement clears by a tenth of a per cent is not a gate: it lets
	// a two-point separation between a 7% effect and a 4.9% control carry an
	// assertion, and two points on a shared box is nothing. So the control has to sit
	// at HALF the target, which puts four or more points between the control and
	// anything the target can catch, and a run that cannot manage that says it could
	// not rather than guessing.
	halfTarget := target / 2
	resolvable := absPct(cpuCtlGap) < halfTarget
	if !resolvable {
		t.Logf("NOT DISTINGUISHED: the control's own gap is %.1f%%, which is not inside half the "+
			"%.1f%% target, so this run cannot tell a %.1f%% effect from the machine. Reported "+
			"anyway, as measurements and not as conclusions: seam %+.1f%%, order log %+.1f%%, "+
			"control %+.1f%%. The finding that survives is the clock: %.1f%% noise floor against "+
			"the wall clock's %.1f%% on this same box.",
			absPct(cpuCtlGap), target, target, cpuSeamPct, cpuLogPct, cpuCtlGap, cpuFloor, wallFloor)
		return
	}

	t.Logf("RESOLVABLE: the control's own gap is %.1f%%, inside half the %.1f%% target, so an effect "+
		"at the target stands at least %.1f points clear of the machine on this run.",
		absPct(cpuCtlGap), target, halfTarget-absPct(cpuCtlGap))

	// Each variant is judged against the target AND against the control's gap, and
	// only fails when it is over the target by more than the control can explain.
	// An effect between the two is reported, not failed: that is the band where the
	// machine is still partly talking.
	for _, v := range []struct {
		what string
		got  float64
	}{
		{"the command seam", cpuSeamPct},
		{"recording the order log", cpuLogPct},
	} {
		margin := v.got - absPct(cpuCtlGap)
		switch {
		case v.got > target && margin > absPct(cpuCtlGap):
			t.Errorf("%s cost %+.1f%% of CPU time over an unobserved battle at %d v %d, against a "+
				"target of %.1f%%, and it clears the control's own %.1f%% gap by %.1f points. The "+
				"effect is above the noise and not the machine speaking.",
				v.what, v.got, n, n, target, absPct(cpuCtlGap), margin)
		case v.got > target:
			t.Logf("IN THE BAND: %s cost %+.1f%%, over the %.1f%% target but by less than the "+
				"control's own %.1f%% gap, so this run does not settle it.",
				v.what, v.got, target, absPct(cpuCtlGap))
		default:
			t.Logf("%s cost %+.1f%%, inside the %.1f%% target and inside the control's %.1f%% gap.",
				v.what, v.got, target, absPct(cpuCtlGap))
		}
	}
}

// absPct is a percentage as a magnitude, for comparisons where the sign is noise.
func absPct(p float64) float64 {
	if p < 0 {
		return -p
	}
	return p
}

// medianDur is the middle duration, which with an even count is the mean of the
// two middle ones. It is written out because the comparison it exists for — the
// fastest run against the typical one — is the whole point of the noise floor.
func medianDur(ds []time.Duration) time.Duration {
	if len(ds) == 0 {
		return 0
	}
	sorted := append([]time.Duration(nil), ds...)
	for i := 1; i < len(sorted); i++ {
		for j := i; j > 0 && sorted[j] < sorted[j-1]; j-- {
			sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
		}
	}
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[mid]
	}
	return (sorted[mid-1] + sorted[mid]) / 2
}

// TestTheCauseLogIsWhatCostsIsNotCheap is the finding from the overhead
// measurement, kept as its own test because it is the number most likely to be
// quoted and the one most likely to be quoted wrong.
//
// Recording ORDERS is cheap. Recording every published field of every unit on
// every tick, and then deriving a row for every one of those fields that changed,
// is not: the first measurement of this file's siblings put a 500 v 500 battle at
// 38.5s unobserved and 61.0s with a full frame recording and a derived cause log,
// which is +58%, against +17.5% for the order log alone. A 64 v 64 battle was
// worse still at +294%, because at that size the per-tick fixed costs of the
// battle are small and the per-unit-per-field cost of the cause log is not.
//
// The distinction matters for what gets built next. The order log is on the replay
// path and it is affordable. The frame recording with its cause log is a
// DEBUGGING tool, and the honest reading of the measurement is that it should stay
// one: a 500 v 500 battle producing a gigabyte of heap is a tool for one battle at
// a time on a machine with room for it, not something to attach to every session.
//
// This test does not assert a threshold, because a timing assertion about a cost
// that is this far from the target is a statement about the machine and not about
// the code. It measures, it reports, and it fails only if the frame recording
// stops being distinguishable from the order log — which is the regression that
// would mean someone had quietly made the expensive path the default one.
func TestTheCauseLogIsWhatCostsIsNotCheap(t *testing.T) {
	if testing.Short() {
		t.Skip("a timing measurement is not a short-mode test")
	}
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 64
	setup := evenForce(t, cfg, seed, n)

	bare := minDur([]time.Duration{
		timed(t, "unobserved battle", func() error { _, err := battle.Run(cfg, seed, setup); return err }),
		timed(t, "unobserved battle, again", func() error { _, err := battle.Run(cfg, seed, setup); return err }),
	})
	frames := minDur([]time.Duration{
		timed(t, "frame recording with a cause log", func() error { _, err := Record(cfg, seed, setup); return err }),
		timed(t, "frame recording with a cause log, again", func() error { _, err := Record(cfg, seed, setup); return err }),
	})
	ratio := frames.Seconds() / bare.Seconds()
	t.Logf("%d v %d, min of 2: unobserved %.2fs, full frame recording with a derived cause log "+
		"%.2fs, which is %.1fx", n, n, bare.Seconds(), frames.Seconds(), ratio)
	if ratio < 1.5 {
		t.Errorf("the full frame recording with its cause log measured %.2fx an unobserved battle "+
			"at %d v %d; the first measurement of this was 4.9x, and a ratio this low means the "+
			"cause log has stopped being derived and the finding above is stale", ratio, n, n)
	}
}
