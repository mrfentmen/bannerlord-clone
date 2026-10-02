package battle

import (
	"fmt"
	"testing"
)

// Benchmarks exist because the tick loop is the one part of this package whose
// cost is not visible in a correctness test. COMBAT.md section 13 and SPEC.md
// section 10 quote unit counts as performance targets, and the only honest way
// to know whether this engine can carry a given number of units is to time it.
//
// The sizes are not chosen to match any target in the docs. They are chosen to
// be one order of magnitude apart, so a run that measures the scaling rather
// than a single number: if the per-unit cost is flat the engine is linear, and
// if it is not, the ratio between these two says so before anyone has to
// profile anything.
func BenchmarkBattle(b *testing.B) {
	sizes := []int{100, 500, 2000}
	for _, n := range sizes {
		b.Run(fmt.Sprintf("%dv%d", n, n), func(b *testing.B) {
			cfg := loadConfig(b)
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				b.StopTimer()
				setup, err := standardForce(b, cfg, 20260930, n)
				if err != nil {
					b.Fatalf("force: %v", err)
				}
				b.StartTimer()
				res, err := Run(cfg, 20260930, setup)
				if err != nil {
					b.Fatalf("the %d v %d battle did not run: %v", n, n, err)
				}
				if res.Ticks == 0 {
					b.Fatal("the battle ended on the opening tick")
				}
			}
			b.StopTimer()
			b.ReportMetric(float64(n*2), "units")
		})
	}
}

// BenchmarkTick reports the cost of a single tick at scale, which is the number
// that decides whether a battle is playable rather than merely correct.
//
// It runs the real battle and reports ticks per second from the result's own
// tick count, so the figure is derived from the simulation rather than from a
// separate timing loop that could drift from it.
func BenchmarkTick(b *testing.B) {
	const n = 500
	cfg := loadConfig(b)
	setup, err := standardForce(b, cfg, 20260930, n)
	if err != nil {
		b.Fatalf("force: %v", err)
	}
	res, err := Run(cfg, 20260930, setup)
	if err != nil {
		b.Fatalf("battle: %v", err)
	}
	per := b.Elapsed().Seconds() / float64(b.N)
	if per <= 0 || res.Ticks == 0 {
		b.Fatalf("no usable timing: %g s over %d ticks", per, res.Ticks)
	}
	b.ReportMetric(float64(res.Ticks)/per, "ticks/s")
	b.ReportMetric(per/float64(res.Ticks)*1e6, "us/tick")
	b.Logf("%d v %d resolved in %d ticks", n, n, res.Ticks)
}
