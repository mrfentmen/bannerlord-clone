package battle

// agent3: the formation commander's per-tick cost.
//
// The commander runs once a tick for every group, so anything it allocates every
// tick is garbage the collector is asked to reclaim during the part of the frame
// where the player is waiting. These benchmarks exist to keep that number
// visible: BenchmarkFormationCommanderTick reports what one commanded tick costs
// in allocations and time at three sizes, and BenchmarkFormationLayout is the
// layout arithmetic on its own, which is what the layout cache exists to stop
// repeating.

import (
	"fmt"
	"testing"
)

// commandedTickTimes runs one commanded tick of a battle with every unit in a
// formation, and reports it at three sizes so a run measures the scaling rather
// than a single number.
func BenchmarkFormationCommanderTick(b *testing.B) {
	for _, n := range []int{100, 500, 2000} {
		b.Run(fmt.Sprintf("%dv%d", n, n), func(b *testing.B) {
			cfg := loadConfig(b)
			setup, err := standardForce(b, cfg, 20260930, n)
			if err != nil {
				b.Fatalf("force: %v", err)
			}
			bt, err := newBattle(cfg, 20260930, setup)
			if err != nil {
				b.Fatalf("battle: %v", err)
			}
			// Both sides in formations, which is the most a battle can be under:
			// every unit is in a group, so every unit is ordered every tick.
			var cmds []Commander
			for _, side := range []Side{SideA, SideB} {
				ids := make([]int, 0, n)
				for i := 0; i < n; i++ {
					id := i
					if side == SideB {
						id = n + i
					}
					ids = append(ids, id)
				}
				fc, err := NewFormationCommander(cfg, side, []Group{
					{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationAdvance}, Units: ids},
				})
				if err != nil {
					b.Fatalf("commander: %v", err)
				}
				cmds = append(cmds, fc)
			}
			joined := &multiCommander{cmds: cmds}
			v := &View{
				Units:    make([]UnitView, len(bt.units)),
				Commands: make([]UnitCommand, len(bt.units)),
			}
			bt.hooks = &commandHooks{cmd: joined, view: v}
			// One untimed tick first, so the layout cache is warm and the
			// benchmark measures a steady-state tick rather than the first one.
			if err := bt.tick(); err != nil {
				b.Fatalf("tick: %v", err)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := bt.tick(); err != nil {
					b.Fatalf("tick %d: %v", i, err)
				}
			}
			b.StopTimer()
			b.ReportMetric(float64(n*2), "units")
		})
	}
}

// BenchmarkFormationLayout is the arithmetic the cache above avoids repeating:
// the same shape, the same count, over and over, which is what the tick loop used
// to ask for once a group per tick.
func BenchmarkFormationLayout(b *testing.B) {
	cfg := loadConfig(b)
	p := FormationParamsFrom(cfg.Formation)
	for _, kind := range AllFormations() {
		b.Run(kind.String(), func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				if _, err := FormationLayout(kind, 2000, p); err != nil {
					b.Fatalf("layout: %v", err)
				}
			}
		})
	}
}
