// Package scale measures where the battle engine's tick loop stops scaling.
//
// It exists because "the engine can carry four thousand units a side" is a claim
// that has to be timed rather than argued. balance.toml sets
// battle.max_units_per_side = 4000, which is a VALIDATION limit and not a
// performance one: nothing in internal/battle changes shape with the unit count,
// so a limit that is never approached in wall time is a limit nobody has tested.
//
// # WHAT THIS PACKAGE MEASURES, AND WHAT IT DELIBERATELY DOES NOT
//
// Throughput, not outcomes. Every run is given a fixed tick budget and stops
// when the budget is spent, whether or not the battle was decided, because the
// number that matters at scale is how long one tick takes. A battle that ends on
// tick forty is a balance question and belongs to internal/battle's own tests;
// a battle that is still running on tick two thousand is a performance question
// and belongs here.
//
// Three figures are reported per size, and the distinction between them is not
// pedantry. Wall is what a caller waits for. CPU is what the process was actually
// given by the kernel, which is the only throughput figure that survives a
// loaded machine, because a shared box steals wall time from a single-threaded
// loop without changing the work the loop does. Peak heap is the footprint a
// field of that size really needs, sampled rather than guessed.
//
// The scaling curve is reported as the ratio of per-unit tick cost between
// successive sizes, not as a claim about complexity. Per-unit cost that is flat
// is linear; per-unit cost that rises is worse than linear, and the report says
// how much worse and by how much.
package scale

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// sampleInterval is how often the peak-heap sampler polls. Short enough to catch
// a spike that lasts one GC cycle, long enough that ReadMemStats, which stops
// the world, does not itself become part of what is being measured.
const sampleInterval = 25 * time.Millisecond

// balanceEnv names an environment variable that overrides where the harness
// reads the balance file from. It is the same variable internal/battle's tests
// honour, so one command can point every package at the same constants.
const balanceEnv = "BANNERLORD_BALANCE"

// LoadBalance reads the balance file that ships with the simulation, walking up
// from dir to find config/balance.toml.
//
// The path actually used is returned alongside the config so a report can print
// it: a measurement taken against constants nobody can name is not evidence.
func LoadBalance(dir string) (*config.Config, string, error) {
	path := os.Getenv(balanceEnv)
	if path == "" {
		found := ""
		for i := 0; i < 8; i++ {
			cand := filepath.Join(dir, "config", "balance.toml")
			if _, err := os.Stat(cand); err == nil {
				found = cand
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
		if found == "" {
			return nil, "", fmt.Errorf("could not find config/balance.toml by walking up from "+
				"the harness directory; set %s to point at it", balanceEnv)
		}
		path = found
	}
	cfg, err := config.Load(path)
	if err != nil {
		return nil, path, fmt.Errorf("the balance file did not load from %s: %w", path, err)
	}
	return cfg, path, nil
}

// Plan is one point on the sweep: how big a field, for how many ticks.
type Plan struct {
	// PerSide is how many units each side fields. It must stay at or under
	// battle.max_units_per_side, which newBattle enforces as an error rather
	// than a truncation. Zero or less means "whatever the balance file says the
	// reference engagement is", battle.reference_units_per_side, so a sweep with
	// no opinion about size still runs the size the game considers the standard
	// one instead of guessing or refusing.
	PerSide int
	// Ticks is the tick budget. The run stops here at the latest, whatever the
	// battle's own conclusion rules would say.
	Ticks int
}

// Measurement is what one Plan produced. Every field is measured, never
// extrapolated: a run that hit a limit or ran out of budget reports what it
// actually did.
type Measurement struct {
	Plan Plan

	// Units is the total number of units on the field, both sides.
	Units int

	// Wall is elapsed wall-clock time for the battle loop.
	Wall time.Duration
	// CPU is user plus system time the PROCESS consumed, from getrusage. On a
	// loaded machine this is the honest denominator and Wall is not; on an idle
	// one they agree to within a few percent.
	CPU time.Duration
	// TicksRun is how many ticks actually completed. It is below Plan.Ticks when
	// the battle was decided first.
	TicksRun int

	// TicksPerSecond is TicksRun over Wall, the wall-clock throughput.
	TicksPerSecond float64
	// CPUTicksPerSecond is TicksRun over CPU, the throughput with the host's
	// scheduling noise divided out.
	CPUTicksPerSecond float64
	// MicrosPerTick is Wall over TicksRun in microseconds, the figure that says
	// how much realtime one frame of simulation costs at a given tick rate.
	MicrosPerTick float64
	// CPUMicrosPerTick is CPU over TicksRun, its contention-free twin.
	CPUMicrosPerTick float64
	// PerUnitNanosPerTick is CPUMicrosPerTick over Units, in nanoseconds. This is
	// the number that has to be flat if the engine is linear in the unit count,
	// and it is what the scaling curve is built from. It is normalised by the
	// units that STARTED, not by the units still standing, so every size in the
	// sweep is divided by the same kind of number and the ratio between sizes is
	// a like-for-like comparison.
	PerUnitNanosPerTick float64

	// PeakHeapBytes is the highest live heap seen during the run, sampled. HeapSys
	// is the high-water mark the runtime asked the OS for, which does not shrink
	// promptly and so is the better of the two as a footprint.
	PeakHeapBytes uint64
	HeapSysBytes  uint64
	// TotalAllocBytes and NumGC are what the run allocated and how often the
	// collector ran. A loop that allocates nothing once it is under way shows a
	// TotalAlloc that is flat in ticks rather than linear in them.
	TotalAllocBytes uint64
	NumGC           uint32

	// Truncated says the tick budget, not a conclusion, stopped the run.
	Truncated bool
	// Outcome and Reason are the battle's own verdict, which for a truncated run
	// is a stalemate and means nothing.
	Outcome string
	Reason  string

	// OnField, Broken, Routed and OffField are the field's occupancy at the end of
	// the run. Result.SideResult counts Standing as fighting PLUS broken, so
	// Broken here is a subset of OnField and not an addition to it; OffField is
	// everything destroyed or surrendered. A battle that thins out as it runs is
	// not a constant-size workload, and a throughput figure quoted without these
	// is an average over a field nobody had for most of it.
	OnField, Broken, Routed, OffField int
	// UnitsAtStart is always Units, and is the denominator of PerUnitNanosPerTick.
	UnitsAtStart int

	// Dead and Wounded are bodies, both sides, so the reader can see how much of
	// the field was resolved.
	Dead, Wounded float64
}

// Measure builds the force, runs the plan's tick budget, and returns what it
// cost.
//
// The force is generated by internal/battle's own roster from the balance file,
// with the command structure battle.roster_leaders_per_unit gives it, so these
// numbers describe the same battle the headless reference run describes and not
// a convenient strawman. Force construction is timed separately from the loop
// and excluded from Wall and CPU, because the question is the cost of a tick and
// generating four thousand soldiers is not a tick.
func Measure(cfg *config.Config, seed uint64, p Plan) (Measurement, error) {
	if cfg == nil {
		return Measurement{}, fmt.Errorf("the throughput harness needs a balance config; " +
			"battle.reference_units_per_side is where the default field size comes from")
	}
	if p.PerSide < 1 {
		p.PerSide = int(cfg.Battle.ReferenceUnitsPerSide)
		if p.PerSide < 1 {
			return Measurement{}, fmt.Errorf("no field size: Plan.PerSide is %d and "+
				"battle.reference_units_per_side (%g) is not a usable size either",
				p.PerSide, cfg.Battle.ReferenceUnitsPerSide)
		}
	}
	m := Measurement{Plan: p, Units: p.PerSide * 2}

	setup, err := buildSetup(cfg, seed, p.PerSide)
	if err != nil {
		return m, err
	}

	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	ruBefore := rusage()
	sampler := StartHeapSampler(sampleInterval)
	wallStart := time.Now()

	res, err := battle.RunTicks(cfg, seed, setup, p.Ticks)

	wall := time.Since(wallStart)
	peak := sampler.Stop()
	ruAfter := rusage()
	runtime.ReadMemStats(&after)

	if err != nil {
		return m, fmt.Errorf("the %d v %d battle did not run: %w", p.PerSide, p.PerSide, err)
	}

	m.Wall = wall
	m.CPU = time.Duration(ruAfter.Utime.Nano()-ruBefore.Utime.Nano()) +
		time.Duration(ruAfter.Stime.Nano()-ruBefore.Stime.Nano())
	m.TicksRun = res.Ticks
	m.TotalAllocBytes = after.TotalAlloc - before.TotalAlloc
	m.NumGC = after.NumGC - before.NumGC
	m.HeapSysBytes = after.HeapSys
	m.PeakHeapBytes = peak

	if m.TicksRun <= 0 {
		return m, fmt.Errorf("the %d v %d battle completed no ticks", p.PerSide, p.PerSide)
	}
	secs := wall.Seconds()
	cpuSecs := m.CPU.Seconds()
	m.TicksPerSecond = float64(m.TicksRun) / secs
	if cpuSecs > 0 {
		m.CPUTicksPerSecond = float64(m.TicksRun) / cpuSecs
	}
	m.MicrosPerTick = float64(wall.Microseconds()) / float64(m.TicksRun)
	m.CPUMicrosPerTick = float64(m.CPU.Microseconds()) / float64(m.TicksRun)
	if m.Units > 0 {
		m.PerUnitNanosPerTick = m.CPUMicrosPerTick * 1000 / float64(m.Units)
	}

	m.Truncated = res.Truncated
	m.Outcome = res.Outcome.Kind.String()
	m.Reason = res.Outcome.Reason.String()
	m.UnitsAtStart = m.Units
	for _, s := range res.Sides {
		m.OnField += s.Standing
		m.Broken += s.Broken
		m.Routed += s.Routed
		m.Dead += s.Dead
		m.Wounded += s.Wounded
	}
	m.OffField = m.Units - m.OnField - m.Routed
	return m, nil
}

// buildSetup is an even force of n units a side with a proportional command,
// which is the shape internal/battle's own 500 v 500 headless run uses.
func buildSetup(cfg *config.Config, seed uint64, n int) (battle.Setup, error) {
	a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
	if err != nil {
		return battle.Setup{}, fmt.Errorf("side A: %w", err)
	}
	b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: n})
	if err != nil {
		return battle.Setup{}, fmt.Errorf("side B: %w", err)
	}
	command := battle.LeaderCount(cfg, n)
	return battle.Setup{
		A: a,
		B: b,
		Leaders: append(
			battle.GenerateLeaders(cfg, seed, battle.SideA, command, 260),
			battle.GenerateLeaders(cfg, seed, battle.SideB, command, 260)...),
		Terrain: battle.TerrainOpen,
		Label:   fmt.Sprintf("%d vs %d, scale harness", n, n),
	}, nil
}

// memSampler records the peak live heap while a measurement runs.
//
// Peak live heap cannot be read rather than sampled: runtime.MemStats reports
// the current value, and a spike that rises and falls between two reads is
// exactly the spike a footprint question is about. So a goroutine polls it for
// the duration of the run and keeps the maximum.
type memSampler struct {
	done chan struct{}
	res  chan uint64
	once sync.Once
}

// StartHeapSampler begins sampling and returns the sampler. Stop must be called
// to release its goroutine and to read the peak.
func StartHeapSampler(interval time.Duration) *memSampler {
	s := &memSampler{done: make(chan struct{}), res: make(chan uint64, 1)}
	go func() {
		var ms runtime.MemStats
		var peak uint64
		for {
			select {
			case <-s.done:
				runtime.ReadMemStats(&ms)
				if ms.HeapAlloc > peak {
					peak = ms.HeapAlloc
				}
				s.res <- peak
				return
			case <-time.After(interval):
				runtime.ReadMemStats(&ms)
				if ms.HeapAlloc > peak {
					peak = ms.HeapAlloc
				}
			}
		}
	}()
	return s
}

// Stop ends sampling and returns the peak live heap in bytes. Calling it twice
// is safe and returns the same figure.
func (s *memSampler) Stop() uint64 {
	s.once.Do(func() { close(s.done) })
	return <-s.res
}

// rusage returns this process's user and system time. It is read with getrusage
// rather than time.Since so that the figure is CPU the loop actually consumed
// rather than wall time it was competing for, which on a shared build machine is
// not the same number by a factor of twenty.
func rusage() syscall.Rusage {
	var ru syscall.Rusage
	// The error is deliberately ignored: getrusage(RUSAGE_SELF) cannot fail on a
	// live process on Linux, and a harness that refused to measure because of it
	// would be less useful than one that measured the wall clock instead.
	_ = syscall.Getrusage(syscall.RUSAGE_SELF, &ru)
	return ru
}
