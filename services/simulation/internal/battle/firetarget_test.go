package battle

// This file covers chooseFireTarget, which had no test of its own.
//
// The aimed-fire stage picks each shooter's target by walking the spatial index
// out to battle.ranged_range and scoring what it finds. It was written with no
// test, and then optimised — the walk now stops at battle.ranged_max_targets
// instead of sweeping the whole arc — which is exactly the kind of change that
// needs one.
//
// Three things are checked, and the third is the one that matters most:
//
//  1. Stopping early picks the same target a sweep picks, on fields where the
//     limit binds. Otherwise the optimisation has changed the game.
//  2. A shooter with fewer targets in range than the limit still looks at the
//     whole arc, so the walk does not stop early on a field that cannot fill it.
//  3. A shooter finds a target at the far end of its arc, which is the observable
//     half of "ranged queries use the ranged grid, never the melee grid": see
//     grid_query_shape_test.go for the other half, which counts cells.
//
// The scorer is read rather than reimplemented. targetScore is the rule for which
// man a shooter prefers, and a test that restated it would be testing its own
// restatement.

import (
	"fmt"
	"math"
	"testing"

	"mbclone/simulation/internal/config"
)

// shooterSetup builds a field with one shooter on side A and the given enemies on
// side B, all within a hundred metres of the origin so that every one of them is
// inside battle.ranged_grid_cell_size and therefore inside a single index cell.
// That matters for the first test: with the enemies in one cell the walk visits
// them in ascending unit id order, so the expected answer can be computed by a
// brute force scan that has nothing to do with the index at all.
func shooterSetup(t testing.TB, cfg *config.Config, shooter Unit, enemies []Unit) Setup {
	t.Helper()
	for i := range enemies {
		enemies[i].ID = i + 1
		enemies[i].Side = SideB
		if enemies[i].Role == 0 {
			enemies[i].Role = RoleRanged
		}
		if enemies[i].Status == 0 {
			enemies[i].Status = StatusFighting
		}
		if enemies[i].Troops == 0 {
			enemies[i].Troops = 1
		}
		if enemies[i].MaxHP == 0 {
			enemies[i].MaxHP = 100
			enemies[i].HP = 100
		}
		if enemies[i].Morale == 0 {
			enemies[i].Morale = 0.8
		}
	}
	shooter.ID = 0
	shooter.Side = SideA
	if shooter.Status == 0 {
		shooter.Status = StatusFighting
	}
	if shooter.Troops == 0 {
		shooter.Troops = 1
	}
	if shooter.MaxHP == 0 {
		shooter.MaxHP, shooter.HP = 100, 100
	}
	if shooter.Morale == 0 {
		shooter.Morale = 0.8
	}
	if shooter.Role == 0 {
		shooter.Role = RoleRanged
	}
	return Setup{A: []Unit{shooter}, B: enemies, Terrain: TerrainOpen, Label: "one shooter"}
}

// place moves the built battle's units onto the coordinates the setup asked for
// and runs the prologue, so the indexes and the snapshot describe the field under
// test.
//
// It has to move them AFTER newBattle rather than asking for the positions in the
// Setup, because a Setup is a roster and the engine deploys it: newBattle lays
// each side out on its own front, which is what a battle fought from a roster
// means. The X and Y a caller puts in a Setup are overwritten, which is the right
// behaviour and is not what a test arranging two men at a chosen distance wants.
func place(t testing.TB, b *Battle, shooterX, shooterY float64, enemies []Unit) *snapshot {
	t.Helper()
	if len(b.units) != len(enemies)+1 {
		t.Fatalf("built %d units for a shooter and %d enemies", len(b.units), len(enemies))
	}
	b.units[0].X, b.units[0].Y = shooterX, shooterY
	for i := range enemies {
		b.units[i+1].X, b.units[i+1].Y = enemies[i].X, enemies[i].Y
	}
	if err := b.beginTick(); err != nil {
		t.Fatalf("prologue failed: %v", err)
	}
	return &b.snap[0]
}

// referenceFireTarget is chooseFireTarget without the index: the shooter scores
// every enemy in id order, in range, and keeps the best of the first
// battle.ranged_max_targets of them.
//
// It stops at the limit because that is what the real one does. It is NOT the
// best target on the field, and pinning that down is one of the things the first
// test is for: a shooter takes the best of what the walk reached, and the walk
// stops when it has enough.
func referenceFireTarget(b *Battle, s *snapshot, shooter *Unit, enemies []Unit) int {
	c := b.c
	minR2 := c.RangedMinRange * c.RangedMinRange
	maxR2 := c.RangedRange * c.RangedRange
	limit := int(c.RangedMaxTargets)
	bestID, bestScore := -1, math.Inf(1)
	shots := 0
	for i := range enemies {
		if shots >= limit {
			break
		}
		e := &enemies[i]
		if e.Side == shooter.Side || !e.alive() {
			continue
		}
		d2 := dist2(e.X-s.X, e.Y-s.Y)
		if d2 > maxR2 || d2 < minR2 {
			continue
		}
		shots++
		if score := b.targetScore(d2, e, c.RangedRange); score < bestScore {
			bestScore, bestID = score, e.ID
		}
	}
	return bestID
}

// TestFireTargetStopsTheWalkAtTheTargetLimitWithoutChangingTheAnswer is the core
// check on the early exit.
//
// A sweep and a stopped walk must choose the same man. The field has more enemies
// in range than battle.ranged_max_targets, so the limit binds, and the enemies
// differ in the things targetScore reads, so the choice is not trivially the
// first one in the list.
func TestFireTargetStopsTheWalkAtTheTargetLimitWithoutChangingTheAnswer(t *testing.T) {
	cfg := copiedConfig(t)
	if int(cfg.Battle.RangedMaxTargets) < 2 {
		t.Fatalf("battle.ranged_max_targets is %g; this test needs at least two to be "+
			"about a limit that binds", cfg.Battle.RangedMaxTargets)
	}
	for _, tc := range []struct {
		name    string
		enemies []Unit
	}{
		{"identical men", []Unit{
			{X: 20, Y: 0}, {X: 21, Y: 0}, {X: 22, Y: 0}, {X: 23, Y: 0}, {X: 24, Y: 0},
		}},
		{"a spread of ranges", []Unit{
			{X: 20, Y: 0}, {X: 40, Y: 0}, {X: 60, Y: 0}, {X: 80, Y: 0}, {X: 100, Y: 0},
		}},
		{"heavy and light mixed in", []Unit{
			{X: 20, Y: 0, Troops: 6}, {X: 30, Y: 0}, {X: 45, Y: 0, Troops: 9},
			{X: 55, Y: 0, Troops: 2}, {X: 70, Y: 0},
		}},
		{"some out of range on both sides", []Unit{
			{X: 20, Y: 0},
			{X: 1, Y: 0},   // inside battle.ranged_min_range
			{X: 400, Y: 0}, // outside battle.ranged_range
			{X: 35, Y: 0},
			{X: 5, Y: 0},
			{X: 500, Y: 0},
			{X: 50, Y: 0},
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			shooter := Unit{X: 0, Y: 0}
			setup := shooterSetup(t, cfg, shooter, append([]Unit(nil), tc.enemies...))
			b, err := newBattle(cfg, 20260930, setup)
			if err != nil {
				t.Fatalf("building the battle failed: %v", err)
			}
			s := place(t, b, 0, 0, setup.B)
			u := b.units[0]

			// The limit has to BIND, or this subtest would be comparing two
			// sweeps of a field with one target in it and the early exit would
			// never have been reached. Counting first is also what stops the whole
			// test being vacuous: a shooter that found nobody at all would agree
			// with a reference that also found nobody at all.
			inRange := 0
			for i := range setup.B {
				e := &setup.B[i]
				d2 := dist2(e.X-s.X, e.Y-s.Y)
				if d2 <= cfg.Battle.RangedRange*cfg.Battle.RangedRange &&
					d2 >= cfg.Battle.RangedMinRange*cfg.Battle.RangedMinRange {
					inRange++
				}
			}
			if inRange <= int(cfg.Battle.RangedMaxTargets) {
				t.Fatalf("the field has %d enemies in the firing band and the limit is %g, "+
					"so the walk never reaches the point this test is about",
					inRange, cfg.Battle.RangedMaxTargets)
			}

			b.chooseFireTarget(0, s, u)
			got := b.deltas[0].rangedTarget
			want := referenceFireTarget(b, s, u, setup.B)

			if got < 0 {
				t.Fatalf("the shooter found nobody at all on a field with %d men in the "+
					"firing band, so this case proves nothing", inRange)
			}

			if got != want {
				t.Errorf("the stopped walk chose unit %d and a sweep over the same field "+
					"chose unit %d, with battle.ranged_max_targets = %g over %d enemies",
					got, want, cfg.Battle.RangedMaxTargets, len(setup.B))
			}
			if got >= 0 {
				e := setup.B[got-1]
				d2 := dist2(e.X-s.X, e.Y-s.Y)
				if d2 > cfg.Battle.RangedRange*cfg.Battle.RangedRange ||
					d2 < cfg.Battle.RangedMinRange*cfg.Battle.RangedMinRange {
					t.Errorf("the shooter chose unit %d at %.1f m, which is outside the "+
						"%.0f m to %.0f m band a shot can reach", got, math.Sqrt(d2),
						cfg.Battle.RangedMinRange, cfg.Battle.RangedRange)
				}
			}
		})
	}
}

// TestFireTargetLooksAtTheWholeArcWhenItCannotFillTheLimit is the other direction,
// and it is the one that stops the early exit being a bug rather than a
// shortcut. A shooter with one enemy in range must still find it, whichever side
// of the field the walk happens to reach first.
func TestFireTargetLooksAtTheWholeArcWhenItCannotFillTheLimit(t *testing.T) {
	cfg := copiedConfig(t)
	// Two targets wanted, and only one in range: the walk cannot stop early.
	enemies := []Unit{
		{X: 230, Y: 0}, // the far end of the arc
		{X: -240, Y: 0},
		{X: 0, Y: 0},   // inside battle.ranged_min_range, so not shootable
		{X: 0, Y: 1},   //
		{X: 300, Y: 0}, // beyond the arc
	}
	setup := shooterSetup(t, cfg, Unit{X: 0, Y: 0}, enemies)
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	s := place(t, b, 0, 0, setup.B)
	b.chooseFireTarget(0, s, b.units[0])
	got := b.deltas[0].rangedTarget
	if got != 1 {
		t.Errorf("a shooter with one target in range chose unit %d, not the only man it "+
			"could shoot at (unit 1 at 230 m); the walk stopped before it reached him", got)
	}
}

// TestFireTargetReachesTheFarEndOfItsArc is the observable half of task 31: a
// shooter finds a target at the far end of battle.ranged_range, which it can only
// do by walking out to that radius on the coarse index.
//
// The count of cells it takes to get there is the other half, and it is
// TestACoarseRadiusCostsFewerCellsThanAFineOne in grid_query_shape_test.go. This
// one is here because a target the shooter cannot see is a bug a player sees,
// and a cell count is not.
func TestFireTargetReachesTheFarEndOfItsArc(t *testing.T) {
	cfg := copiedConfig(t)
	for _, at := range []float64{100, 180, 239} {
		t.Run(fmt.Sprintf("%.0fm", at), func(t *testing.T) {
			setup := shooterSetup(t, cfg, Unit{X: 0, Y: 0}, []Unit{{X: at, Y: 0}})
			b, err := newBattle(cfg, 20260930, setup)
			if err != nil {
				t.Fatalf("building the battle failed: %v", err)
			}
			s := place(t, b, 0, 0, setup.B)
			b.chooseFireTarget(0, s, b.units[0])
			if got := b.deltas[0].rangedTarget; got != 1 {
				t.Errorf("a shooter did not find the only enemy on the field at %.0f m, "+
					"which is inside a %.0f m arc", at, cfg.Battle.RangedRange)
			}
		})
	}
}
