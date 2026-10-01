package model_test

import (
	"testing"

	"mbclone/simulation/internal/model"
)

// TestAtWarDeterministicWithDuplicateWars guards the tick-116 nondeterminism
// bug (2026-10-01): AtWar iterated the Wars map directly and returned the
// first match, so with both an ended and an active war between the same two
// sides, the answer depended on Go map iteration order. It must now be true
// whenever ANY war between the sides is active, on every call.
func TestAtWarDeterministicWithDuplicateWars(t *testing.T) {
	s := model.NewState()
	// Ended war between sides 1 and 2.
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 0, EndTick: 50}
	// Active war between the same sides.
	s.Wars[2] = &model.War{ID: 2, SideA: 1, SideB: 2, StartTick: 60, EndTick: -1}
	for i := 0; i < 100; i++ {
		if !s.AtWar(1, 2) {
			t.Fatalf("AtWar(1,2) = false on iteration %d with an active war present", i)
		}
		if !s.AtWar(2, 1) {
			t.Fatalf("AtWar(2,1) = false on iteration %d (symmetric)", i)
		}
	}
	// Only ended wars: must be false.
	s2 := model.NewState()
	s2.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 0, EndTick: 50}
	for i := 0; i < 100; i++ {
		if s2.AtWar(1, 2) {
			t.Fatalf("AtWar(1,2) = true on iteration %d with only ended wars", i)
		}
	}
}
