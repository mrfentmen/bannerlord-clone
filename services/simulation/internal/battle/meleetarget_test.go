package battle

// This file is task 30: the melee targeting walk, measured, and the reason it
// cannot stop early.
//
// # WHY THERE IS NO EARLY EXIT HERE, AND WHY THAT IS NOT AN OMISSION
//
// chooseFireTarget walks out to battle.ranged_range and stops once it has
// battle.ranged_max_targets candidates. That early exit is sound because
// nothing past the limit is allowed to change the answer: a shooter takes the
// best of the first N, so the N+1th cannot matter.
//
// Melee targeting has no such limit and cannot grow one. It takes the single
// BEST candidate of all of them, and the best is not known until the walk has
// seen all of them. The only sound early exit is one against a lower bound on
// the score of everything unscored, and targetScore's floor - a target at zero
// range that is already destroyed - is reachable in practice by no melee fight
// on this balance file. So the walk visits the whole box, and that is the
// correct behaviour rather than a missing optimisation.
//
// # AND IT DOES NOT NEED ONE, MEASURED
//
// battle.melee_range is 2.6 m and battle.grid_cell_size is 12, so the walk's
// span is one ring and its box is nine cells before the disc rejection. On a
// live 400-unit field forty ticks in:
//
//	living units          400
//	cells a unit             2.01
//	candidates a unit        15.89
//	enemies in reach         0.00
//
// Two cells and sixteen candidates, against the morale query's 745 candidates
// at the same moment. The melee walk is about two percent of the cost of the
// cheapest thing in the tick, and it is two cells because the reach is small
// and the cells are fine - which is the whole reason the melee index exists.
//
// The 0.00 is worth a second look and is NOT waste worth fixing: at tick forty
// the two armies are still four hundred metres apart, so a unit really does
// have no enemy in reach. The sixteen candidates it is handed are its own side,
// in its own cell and the one beside it. There is no index on this field that
// answers "is anybody in reach" for less, because the question is asked per
// unit and the answer differs per unit.
//
// # WHAT THIS FILE THEREFORE HOLDS THE CODE TO
//
// Three things, none of them a speed claim:
//
//  1. The box is what the geometry says it is, so a balance file that widened
//     battle.melee_range would make the melee walk dearer and this test would
//     say so by name.
//  2. A unit in contact takes the BEST reachable target and not the first one.
//     This is the property an early exit would break, so it is the property
//     that has to be nailed down before anybody is tempted to add one.
//  3. battle.max_attackers_per_target is honoured by SKIPPING a saturated target
//     and taking the next best, and a unit whose every candidate is saturated
//     gets no target at all rather than a crowded one.

import (
	"math"
	"testing"
)

// meleeSetup builds a field with one melee unit on side A and the given enemies
// on side B, all within reach of the origin, so that the melee index keeps them
// and the expected answer can be worked out by hand.
func meleeSetup(t testing.TB, shooter Unit, enemies []Unit) Setup {
	t.Helper()
	return shooterSetup(t, loadConfig(t), shooter, enemies)
}

// TestAMeleeUnitTakesTheBestTargetAndNotTheFirst is the load-bearing one.
//
// battle.target_casualty_weight is 0.5 on the shipped balance file, so a target
// that is half dead is worth half a reach of distance: at 2.6 m of reach, a
// wounded man at 1.8 m beats a healthy one at 1.0 m. An early exit that stopped
// at the first reachable candidate would hand this unit the healthy man, and
// that is the whole of what a line failing to press an advantage looks like.
//
// The field is arranged so the BETTER target is the one the walk reaches LAST,
// because a ring walk visits the centre cell first and a first-found early exit
// is the one most likely to be written by accident.
func TestAMeleeUnitTakesTheBestTargetAndNotTheFirst(t *testing.T) {
	cfg := loadConfig(t)
	reach := cfg.Battle.MeleeRange
	if cfg.Battle.TargetCasualtyWeight <= 0 {
		t.Fatalf("battle.target_casualty_weight is %g; this test is about a wounded "+
			"target out-scoring a nearer healthy one, which needs the weight above zero",
			cfg.Battle.TargetCasualtyWeight)
	}
	// How badly the wounded man has to be hurt, worked out rather than guessed,
	// because a guess here is a test that passes for the wrong reason.
	//
	// targetScore is d2/reach^2 - (1 - hpFrac) * weight, so for the wounded man
	// to beat the healthy one the casualty credit has to carry the difference in
	// their squared distances:
	//
	//	(far^2 - near^2) / reach^2  <  wounded * weight
	//
	// With reach 2.6, near 0.35 of it and far 0.70 of it, that is
	// (3.31 - 0.83)/6.76 = 0.367 against wounded * 0.55, so anything above two
	// thirds dead will do. Three quarters is used because it is comfortably past
	// the line rather than on it: a test balanced on a knife edge is a test that
	// fails when somebody tunes a constant, and the failure would say nothing
	// about the thing it is for.
	const (
		near    = 0.35
		far     = 0.70
		wounded = 0.75
	)
	reachM := reach * near
	farM := reach * far
	healthy := Unit{X: reachM, Y: 0, Role: RoleMelee, MaxHP: 100, HP: 100}
	maimed := Unit{X: 0, Y: farM, Role: RoleMelee, MaxHP: 100, HP: 100 * (1 - wounded)}
	enemies := []Unit{healthy, maimed}

	setup := meleeSetup(t, Unit{Role: RoleMelee}, enemies)
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	s := place(t, b, 0, 0, setup.B)

	// The scorer is read, not restated: the expectation is which unit targetScore
	// prefers, computed by the engine's own rule.
	nearD2 := dist2(healthy.X, healthy.Y)
	farD2 := dist2(maimed.X, maimed.Y)
	best := b.targetScore(farD2, b.units[2], reach)
	worst := b.targetScore(nearD2, b.units[1], reach)

	// And the trap has to be a trap. Both men are inside battle.melee_range of
	// the shooter, and battle.melee_range is 2.6 m over 12 m cells, so they are
	// all in the shooter's own cell - which means the order they are visited in
	// is the order of their ids, not the order of the ring walk. So the FIRST
	// candidate this walk can reach is the healthy man, and an early exit that
	// stopped at the first reachable candidate would hand him over every time.
	// Asserting the visit order is what stops this test from quietly becoming a
	// test of something else if the layout is ever changed.
	var visited []int
	b.meleeHash.walkCells(0, 0, reach, func(_ int, run []int) bool {
		for _, id := range run {
			if b.byID[id].Side == SideB && b.byID[id].alive() {
				visited = append(visited, id)
			}
		}
		return false
	})
	t.Logf("the walk reaches the candidates in the order %v; the scorer prefers unit 2 "+
		"(%.2f m, %.0f%% dead, %.4f) over unit 1 (%.2f m, whole, %.4f)",
		visited, math.Sqrt(farD2), wounded*100, best, math.Sqrt(nearD2), worst)
	if len(visited) < 2 || visited[0] != 1 {
		t.Fatalf("the candidates are reached in the order %v, so the healthy man is not first "+
			"and this test is not the test it says it is. The trap has to be that the "+
			"better target is the SECOND one the walk meets", visited)
	}
	if best >= worst {
		t.Fatalf("this field does not test what it says it tests: the wounded man at %.2f m "+
			"scores %.4f and the healthy man at %.2f m scores %.4f, so the best target is "+
			"the one the walk reaches first and the test would pass for the wrong reason. "+
			"Move the wounded man further out or make him more badly hurt",
			math.Sqrt(farD2), best, math.Sqrt(nearD2), worst)
	}

	b.chooseMeleeTarget(0, s, b.units[0])
	got := b.deltas[0].meleeTarget
	if got != 2 {
		t.Errorf("the unit took unit %d; the best of the two is unit 2, at %.2f m and %.0f%% "+
			"dead, against unit 1 at %.2f m and whole. battle.target_casualty_weight of %g "+
			"is what makes the wounded man the better target, and an early exit on the "+
			"first reachable candidate would hand over the healthy one every time",
			got, math.Sqrt(farD2), wounded*100, math.Sqrt(nearD2), cfg.Battle.TargetCasualtyWeight)
	}
}

// TestAMeleeTargetIsSkippedWhenItHasTooManyAttackers is the concentration rule.
//
// battle.max_attackers_per_target is 3. A target that already has its three
// attackers is not chosen, and the unit takes the next best instead. The part
// worth a test is the end: a unit whose EVERY candidate is saturated gets no
// target, rather than piling on. That is what stops a crowd resolving every
// blow onto the same pair while the men at the back do nothing.
func TestAMeleeTargetIsSkippedWhenItHasTooManyAttackers(t *testing.T) {
	cfg := loadConfig(t)
	cap := int(cfg.Battle.MaxAttackersPerTarget)
	if cap < 1 {
		t.Fatalf("battle.max_attackers_per_target is %g; this test needs a cap of one or more",
			cfg.Battle.MaxAttackersPerTarget)
	}
	reach := cfg.Battle.MeleeRange
	enemies := []Unit{
		{X: reach * 0.2, Y: 0, Role: RoleMelee, MaxHP: 100, HP: 100},        // 1: the best
		{X: -reach * 0.3, Y: 0, Role: RoleMelee, MaxHP: 100, HP: 100 * 0.5}, // 2: next
		{X: 0, Y: -reach * 0.4, Role: RoleMelee, MaxHP: 100, HP: 100},       // 3: next
	}
	setup := meleeSetup(t, Unit{Role: RoleMelee}, enemies)
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	s := place(t, b, 0, 0, setup.B)

	// Saturate unit 1 and unit 2, leaving unit 3 free.
	b.attackerCount[1] = cap
	b.attackerCount[2] = cap
	b.chooseMeleeTarget(0, s, b.units[0])
	if got := b.deltas[0].meleeTarget; got != 3 {
		t.Errorf("with units 1 and 2 already at battle.max_attackers_per_target of %d, the "+
			"unit took unit %d; the only unsaturated candidate in reach is unit 3, and "+
			"taking a crowded one instead is a front that stops being a front", cap, got)
	}

	// Now saturate that one too. Nothing in reach is available, and the honest
	// answer is no target: a unit that swings at a man who already has its full
	// complement is the concentration rule not being applied.
	b.attackerCount[3] = cap
	b.chooseMeleeTarget(0, s, b.units[0])
	if got := b.deltas[0].meleeTarget; got != -1 {
		t.Errorf("with all three candidates at battle.max_attackers_per_target of %d the unit "+
			"was given unit %d; every candidate in reach is saturated, so the answer is no "+
			"target at all", cap, got)
	}
}

// TestTheMeleeWalkIsTheBoxTheGeometrySaysItIs is the cost half, written as a
// bound on the configuration rather than as a timing, because a timing on this
// box is not a measurement.
//
// The number is the one the profile argues from: two cells and about sixteen
// candidates a unit, against the morale query's several hundred. If a balance
// file widened battle.melee_range, or coarsened battle.grid_cell_size, the box
// would grow and this would fail with the size named.
func TestTheMeleeWalkIsTheBoxTheGeometrySaysItIs(t *testing.T) {
	if testing.Short() {
		t.Skip("this reads a 200 v 200 field")
	}
	cfg := loadConfig(t)
	reach := cfg.Battle.MeleeRange
	cell := cfg.Battle.GridCellSize
	span := int(floorCell(reach, cell)) + 1
	box := (2*span + 1) * (2*span + 1)
	t.Logf("battle.melee_range %g on a %g m cell is a span of %d, so a %d cell box before "+
		"the disc rejection", reach, cell, span, box)
	if box > 25 {
		t.Errorf("a melee query enumerates a %d cell box (%g m of reach on %g m cells). The "+
			"melee walk is cheap because the reach is small and the cells are fine, and a "+
			"box of %d means one of those two stopped being true", box, reach, cell, box)
	}

	setup, err := standardForce(t, cfg, 20260930, 200)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	bl, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	for i := 0; i < 40; i++ {
		if err := bl.tick(); err != nil {
			t.Fatalf("tick %d failed: %v", i, err)
		}
	}
	units, cells, cand := 0, 0, 0
	for i := range bl.units {
		u := bl.units[i]
		if !u.alive() {
			continue
		}
		units++
		bl.meleeHash.walkCells(u.X, u.Y, reach, func(_ int, run []int) bool {
			cells++
			cand += len(run)
			return false
		})
	}
	if units == 0 {
		t.Fatal("every unit is dead after forty ticks, so this says nothing")
	}
	perUnit := float64(cells) / float64(units)
	perCand := float64(cand) / float64(units)
	t.Logf("%d living units: %.2f cells and %.2f candidates a unit. The morale query at "+
		"battle.morale_neighbourhood of %g m is several hundred candidates at the same "+
		"moment, so the melee walk is a small fraction of the cheapest thing in the tick",
		units, perUnit, perCand, cfg.Battle.MoraleNeighbourhood)
	if perUnit > float64(box) {
		t.Errorf("a unit's melee walk kept %.2f cells, more than the %d the geometry allows; "+
			"the walk is visiting cells the query box does not contain", perUnit, box)
	}
	// A ceiling rather than a measurement, because this is a bound and not a
	// benchmark: four times the box is a number that only a change to the
	// geometry or to the index can reach, and either is worth being told about.
	if perCand > 8*float64(box) {
		t.Errorf("a unit's melee walk was handed %.0f candidates, more than eight times the "+
			"%d cells in its box. Either the field is far denser per cell than the "+
			"reference, or something is walking more than the melee reach", perCand, box)
	}
}
