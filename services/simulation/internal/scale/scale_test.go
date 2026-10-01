package scale

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"mbclone/simulation/internal/config"
)

// The harness is verified two ways, and the split matters.
//
// TestScaleHarness runs unconditionally on a small field and is fast: it exists
// so that `go test ./internal/scale/` proves the harness works, on every run,
// rather than only when somebody remembers to set an environment variable.
//
// TestScaleSweep is the measurement the brief asks for: 500, 1000 and 2000 a
// side against a fixed tick budget, with the table and the scaling curve
// printed. It is gated behind SCALE_SWEEP because it is a minutes-long run and a
// test suite that takes twenty minutes to pass is a test suite people stop
// running.
//
// SCALE_SIZES and SCALE_TICKS narrow either run, which is also how the profile
// of a single size is taken: SCALE_SWEEP=1 SCALE_SIZES=2000 SCALE_TICKS=2000
// go test ./internal/scale/ -run TestScaleSweep -cpuprofile cpu.prof
//
// SCALE_DEADLINE is a wall-clock cap per size, in seconds. A size that cannot
// finish its tick budget inside the cap is reported as a timeout with no
// invented number attached, because "the harness did not get an answer" is a
// finding and a guess would not be.

func TestScaleHarness(t *testing.T) {
	cfg, path := mustLoad(t)
	t.Logf("balance file: %s (version %s)", path, cfg.Version)

	m, err := Measure(cfg, 20260930, Plan{PerSide: 100, Ticks: 25})
	if err != nil {
		t.Fatalf("the harness could not run a 100 v 100 battle: %v", err)
	}
	t.Logf("100 v 100: %d ticks in %s wall (%s cpu), %.1f ticks/s, %.0f us/tick, %.1f ns/unit/tick",
		m.TicksRun, m.Wall.Round(time.Millisecond), m.CPU.Round(time.Millisecond),
		m.TicksPerSecond, m.MicrosPerTick, m.PerUnitNanosPerTick)
	t.Logf("peak heap %.1f MiB, heap sys %.1f MiB, allocated %.1f MiB in %d GCs, %d of %d units still on the field",
		mib(m.PeakHeapBytes), mib(m.HeapSysBytes), mib(m.TotalAllocBytes), m.NumGC, m.OnField, m.Units)

	// The harness is only worth anything if the numbers mean what they say.
	switch {
	case m.TicksRun != 25:
		t.Errorf("a 100 v 100 battle with a 25 tick budget ran %d ticks; the budget is not being honoured",
			m.TicksRun)
	case !m.Truncated:
		t.Errorf("the run reported a conclusion rather than the tick budget ending it; "+
			"Truncated is how a throughput run says so")
	case m.Wall <= 0 || m.CPU <= 0:
		t.Errorf("no usable timing: wall %s, cpu %s", m.Wall, m.CPU)
	case m.TicksPerSecond <= 0 || m.CPUTicksPerSecond <= 0:
		t.Errorf("no usable throughput: %.3f ticks/s wall, %.3f ticks/s cpu",
			m.TicksPerSecond, m.CPUTicksPerSecond)
	case m.PeakHeapBytes == 0:
		t.Error("the peak-heap sampler recorded nothing")
	case m.CPUMicrosPerTick <= 0 || m.PerUnitNanosPerTick <= 0:
		t.Errorf("no usable per-tick cost: %.3f us/tick, %.1f ns/unit/tick",
			m.CPUMicrosPerTick, m.PerUnitNanosPerTick)
	case m.Units != 200:
		t.Errorf("a 100 per side field is %d units, not 200", m.Units)
	}
}

func TestScaleSweep(t *testing.T) {
	if os.Getenv("SCALE_SWEEP") == "" {
		t.Skip("set SCALE_SWEEP=1 to run the scale sweep; it is minutes of battle simulation")
	}
	cfg, path := mustLoad(t)

	sizes := ints(env("SCALE_SIZES", "500,1000,2000"))
	ticks := integer(env("SCALE_TICKS", "2000"))
	deadline := time.Duration(integer(env("SCALE_DEADLINE", "0"))) * time.Second
	seed := uint64(integer(env("SCALE_SEED", "20260930")))

	// The ceiling is checked before anything is run, not after: a size over
	// battle.max_units_per_side must be a reported refusal, not a truncated force.
	for _, n := range sizes {
		if float64(n) > cfg.Battle.MaxUnitsPerSide {
			t.Fatalf("%d per side exceeds battle.max_units_per_side = %g; the sweep is not "+
				"allowed to measure an illegal force", n, cfg.Battle.MaxUnitsPerSide)
		}
	}

	t.Logf("balance file: %s (version %s)", path, cfg.Version)
	t.Logf("balance: tick_seconds=%g max_ticks=%g max_units_per_side=%g grid_cell=%g ranged_cell=%g",
		cfg.Battle.TickSeconds, cfg.Battle.MaxTicks, cfg.Battle.MaxUnitsPerSide,
		cfg.Battle.GridCellSize, cfg.Battle.RangedGridCellSize)
	t.Logf("seed=%d tick budget=%d per size; wall deadline=%s; GOMAXPROCS=%d",
		seed, ticks, deadline, gomaxprocs())

	results := make([]Measurement, 0, len(sizes))
	timedOut := make([]int, 0)
	for _, n := range sizes {
		plan := Plan{PerSide: n, Ticks: ticks}
		type outcome struct {
			m   Measurement
			err error
		}
		ch := make(chan outcome, 1)
		start := time.Now()
		go func() {
			m, err := Measure(cfg, seed, plan)
			ch <- outcome{m, err}
		}()

		var o outcome
		if deadline <= 0 {
			o = <-ch
		} else {
			select {
			case o = <-ch:
			case <-time.After(deadline):
				timedOut = append(timedOut, n)
				t.Logf("TIMEOUT: %d v %d did not finish %d ticks within %s of wall; "+
					"no throughput figure is reported for it", n, n, ticks, deadline)
				continue
			}
		}
		if o.err != nil {
			t.Errorf("%d v %d did not run: %v", n, n, o.err)
			continue
		}
		o.m.Wall = time.Since(start)
		results = append(results, o.m)
		t.Logf("%d v %d done in %s", n, n, time.Since(start).Round(time.Millisecond))
	}

	report(t, cfg, seed, results, timedOut, ticks)
}

// report prints the table the brief asks for and the scaling curve derived from
// it. Everything printed is a measured figure from results; the only arithmetic
// is the ratio between two measured ones.
func report(t *testing.T, cfg *config.Config, seed uint64, results []Measurement, timedOut []int, budget int) {
	t.Helper()
	if len(results) == 0 {
		t.Fatal("the sweep produced no measurements")
	}

	fmt.Printf("\n================ SCALE SWEEP: battle tick throughput ================\n")
	fmt.Printf("seed %d, tick budget %d per size, tick_seconds %g\n",
		seed, budget, cfg.Battle.TickSeconds)
	fmt.Printf("host: %d GOMAXPROCS; the CPU column is getrusage of this process and is the\n"+
		"figure to compare across sizes on a loaded box; the wall column is what a\n"+
		"caller waits for on an idle one.\n\n", gomaxprocs())

	fmt.Printf("%-11s %8s %7s %9s %9s %10s %11s %10s %11s %9s\n",
		"size", "ticks", "ran to", "wall", "cpu", "ticks/s", "cpu ticks/s",
		"us/tick", "ns/unit/tick", "peak MiB")
	fmt.Printf("%s\n", dashes(118))
	for _, m := range results {
		ranTo := "concluded"
		if m.Truncated {
			ranTo = "budget"
		}
		fmt.Printf("%-11s %8d %7s %9s %9s %10.2f %11.2f %10.1f %11.2f %9.1f\n",
			fmt.Sprintf("%dv%d", m.Plan.PerSide, m.Plan.PerSide),
			m.TicksRun, ranTo,
			m.Wall.Round(time.Millisecond), m.CPU.Round(time.Millisecond),
			m.TicksPerSecond, m.CPUTicksPerSecond,
			m.MicrosPerTick, m.PerUnitNanosPerTick,
			mib(m.PeakHeapBytes))
	}
	fmt.Printf("%s\n", dashes(118))

	// Wall time for a battle that concludes in N ticks, per measured rate. The
	// conversion is arithmetic on a measured figure; N itself is NOT guessed
	// here, and a caller who has a real conclusion tick count from
	// internal/battle multiplies it in.
	fmt.Printf("\nwall time for a battle of a given length, from the measured rate:\n")
	for _, m := range results {
		fmt.Printf("  %4d v %-4d  %5.0f s per 1000 ticks   %6.1f min per 10,000 ticks\n",
			m.Plan.PerSide, m.Plan.PerSide,
			m.Wall.Seconds()*1000/float64(maxInt(m.TicksRun, 1)),
			m.Wall.Minutes()*10000/float64(maxInt(m.TicksRun, 1)))
	}

	fmt.Printf("\nscaling curve (CPU time per unit per tick, and its ratio to the size below):\n")
	for i, m := range results {
		label := "baseline"
		if i > 0 {
			prev := results[i-1]
			ratio := m.PerUnitNanosPerTick / prev.PerUnitNanosPerTick
			label = fmt.Sprintf("%.2fx the per-unit cost of %d v %d (x%.1f the units)",
				ratio, prev.Plan.PerSide, prev.Plan.PerSide,
				float64(m.Units)/float64(prev.Units))
		}
		fmt.Printf("  %4d v %-4d units=%5d  %7.2f ns/unit/tick  %s\n",
			m.Plan.PerSide, m.Plan.PerSide, m.Units, m.PerUnitNanosPerTick, label)
	}
	if len(results) > 1 {
		first, last := results[0], results[len(results)-1]
		unitRatio := float64(last.Units) / float64(first.Units)
		costRatio := last.CPUMicrosPerTick / first.CPUMicrosPerTick
		fmt.Printf("\n  %.0fx the units cost %.2fx the per-tick time: %s\n",
			unitRatio, costRatio,
			verdict(costRatio/unitRatio))
	}

	fmt.Printf("\nfield occupancy at the end of each run (a battle that thins out is not a\n"+
		"constant-size workload, so these rows say how much of the field each rate above\n"+
		"was actually charged for; broken is a subset of on-field):\n")
	for _, m := range results {
		fmt.Printf("  %4d v %-4d on field %5d (%d broken)  routed %4d  off field %5d"+
			"  dead %.0f  wounded %.0f  (%s / %s)\n",
			m.Plan.PerSide, m.Plan.PerSide, m.OnField, m.Broken, m.Routed, m.OffField,
			m.Dead, m.Wounded, m.Outcome, m.Reason)
	}
	if len(timedOut) > 0 {
		fmt.Printf("\nTIMED OUT, no measurement: %v\n", timedOut)
	}
	fmt.Printf("========================================================================\n\n")

	// Assertions are about the harness, not about the engine's performance: this
	// file does not own the tick loop and must never fail a build because the
	// loop got slower. What it does check is that every row is a real run.
	for _, m := range results {
		if m.TicksRun <= 0 || m.TicksRun > budget {
			t.Errorf("%d v %d: %d ticks reported against a budget of %d",
				m.Plan.PerSide, m.Plan.PerSide, m.TicksRun, budget)
		}
		if m.CPU <= 0 || m.Wall <= 0 || m.PeakHeapBytes == 0 {
			t.Errorf("%d v %d: an unusable figure in the row: wall %s cpu %s peak heap %d",
				m.Plan.PerSide, m.Plan.PerSide, m.Wall, m.CPU, m.PeakHeapBytes)
		}
		if m.OnField+m.Routed+m.OffField != m.Units {
			t.Errorf("%d v %d: %d on field + %d routed + %d off field is not the %d that started",
				m.Plan.PerSide, m.Plan.PerSide, m.OnField, m.Routed, m.OffField, m.Units)
		}
		if m.OffField < 0 || m.Broken > m.OnField {
			t.Errorf("%d v %d: impossible occupancy, %d on field (%d broken), %d routed, %d off field",
				m.Plan.PerSide, m.Plan.PerSide, m.OnField, m.Broken, m.Routed, m.OffField)
		}
	}
}

// verdict names the scaling curve from the ratio of measured cost growth to
// measured size growth. It is a description of the numbers just printed, not a
// claim about the algorithm's complexity: a constant here is linear in practice
// over the measured range, and a value above one means the per-unit tick got
// more expensive as the field grew.
func verdict(x float64) string {
	switch {
	case x < 1.05:
		return "linear or better in the unit count over this range"
	case x < 1.35:
		return fmt.Sprintf("superlinear: per-unit cost rose %.0f%% over the range", (x-1)*100)
	case x < 3:
		return fmt.Sprintf("clearly superlinear: per-unit cost rose %.0fx over the range", x-1)
	default:
		return fmt.Sprintf("severely superlinear: per-unit cost rose %.1fx over the range", x-1)
	}
}

func mustLoad(t *testing.T) (*config.Config, string) {
	t.Helper()
	cfg, path, err := LoadBalance(mustwd(t))
	if err != nil {
		t.Fatalf("loading the balance file: %v", err)
	}
	return cfg, path
}

func mustwd(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("cannot determine the test working directory: %v", err)
	}
	return wd
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func integer(s string) int {
	var n int
	if _, err := fmt.Sscanf(strings.TrimSpace(s), "%d", &n); err != nil {
		return 0
	}
	return n
}

func ints(s string) []int {
	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		if n := integer(p); n > 0 {
			out = append(out, n)
		}
	}
	return out
}

func mib(b uint64) float64 { return float64(b) / (1024 * 1024) }

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func dashes(n int) string { return strings.Repeat("-", n) }

func gomaxprocs() int { return runtime.GOMAXPROCS(0) }