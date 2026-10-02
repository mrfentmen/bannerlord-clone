package battle

// This file is task 34: a draw has to be DETECTED, and detecting it is a
// different thing from reporting one.
//
// The engine has two ways to finish a battle in a draw. One is that both armies
// yield or both are annihilated, and checkEnding says so on the tick it happens.
// The other is that battle.max_ticks runs out with nothing decided, and the
// engine calls that a stalemate rather than hiding it behind an infinite loop.
//
// The second one is the expensive one. battle.max_ticks is 20,000 on the shipped
// balance file, and a 500 v 500 battle resolves in 1,918. So a stalemate costs
// ten times a real fight, and a draw that is only noticed at the bound costs
// the same whether the armies have been fighting for six hundred ticks or have
// been standing nose to nose doing nothing for nineteen thousand.
//
// # WHAT THIS HOLDS THE ENGINE TO
//
//  1. A draw that is a draw BY THE FIGHT is reported on the tick it happens, and
//     that tick is a long way short of the bound. The bar is not "less than
//     max_ticks" - that is nearly true of everything - it is a fraction of it,
//     because a detection that fires at 19,000 of 20,000 has not saved anybody
//     anything.
//
//  2. The bound is still a real ending and not an error. A battle with the tick
//     bound set to something absurd and two armies that cannot hurt each other
//     ends as a stalemate DRAW, with a tick count equal to the bound and a
//     reason that says so. This is the case the tick bound exists for and it
//     must not turn into a hang, a panic, or a result with no reason.
//
//  3. Neither of the above depends on the size of the fight. Both are checked at
//     two sizes, because a stalemate detector that works on 8 v 8 and not on
//     500 v 500 is a detector for small battles.

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// A real 60 v 60 fight decides. If it ever stops deciding, the reason it stops
// is a bug in the fight and not in the ending, and every other test here would
// be measuring a stalemate while claiming to measure a decision.
func TestARealFightIsNotMistakenForADraw(t *testing.T) {
	cfg := loadConfig(t)
	bound := int(cfg.Battle.MaxTicks)
	for _, n := range []int{8, 60} {
		start := time.Now()
		res, err := Run(cfg, 20260930, smallSetup(t, cfg, n))
		if err != nil {
			t.Fatalf("a %d v %d battle failed: %v", n, n, err)
		}
		elapsed := time.Since(start)
		t.Logf("%d v %d: %s (%s) after %d ticks of a bound of %d, in %s",
			n, n, res.Outcome.Kind, res.Outcome.Reason, res.Ticks, bound,
			elapsed.Round(time.Millisecond))
		if res.Outcome.Kind == ResultDraw {
			t.Fatalf("a %d v %d battle with even forces ended in a draw (%s) after %d ticks. "+
				"Two armies of the same strength fighting on open ground decide it, and a draw "+
				"here means the fight is broken rather than the ending", n, n, res.Outcome.Reason, res.Ticks)
		}
		if res.Ticks >= bound {
			t.Errorf("a %d v %d battle ran to the tick bound of %d and was called %s",
				n, n, bound, res.Outcome)
		}
		// The fraction, not the inequality. A decision at 95% of the bound has
		// saved nothing, and the number is here so that is visible.
		t.Logf("  decided at %.1f%% of the tick bound", 100*float64(res.Ticks)/float64(bound))
	}
}

// A stalemate is still an ending. battle.max_ticks of 40 with an even pair of
// forces: forty ticks is not long enough for the armies to reach each other, so
// nothing is decided and the bound is what finishes the battle.
//
// This is the case the bound exists for and it has three ways to go wrong: a
// hang, a panic, and a Result whose Reason is empty. All three are checked,
// because a Result that says a battle ended without saying why is the failure
// CONSTITUTION.md 1.3 is about.
func TestTheTickBoundEndsABattleThatNothingElseWould(t *testing.T) {
	for _, bound := range []int{1, 2, 40} {
		cfg := withBattleConfig(t, "max_ticks", fmt.Sprint(bound))
		if int(cfg.Battle.MaxTicks) != bound {
			t.Fatalf("battle.max_ticks did not take: asked for %d and the config reads %g",
				bound, cfg.Battle.MaxTicks)
		}
		res, err := Run(cfg, 20260930, smallSetup(t, cfg, 8))
		if err != nil {
			t.Fatalf("battle.max_ticks of %d: the battle failed instead of ending: %v", bound, err)
		}
		t.Logf("battle.max_ticks of %d: %s (%s) after %d ticks, %.0f v %.0f casualties",
			bound, res.Outcome.Kind, res.Outcome.Reason, res.Ticks,
			res.Sides[0].Dead+res.Sides[0].Wounded, res.Sides[1].Dead+res.Sides[1].Wounded)
		if res.Outcome.Kind != ResultDraw || res.Outcome.Reason != ReasonStalemate {
			t.Errorf("battle.max_ticks of %d ended %s (%s). An even 8 v 8 cannot have decided "+
				"anything in %d ticks - the roster alone starts the two sides "+
				"battle.roster_start_distance apart - so the bound is what ended it and it "+
				"should say so", bound, res.Outcome.Kind, res.Outcome.Reason, bound)
		}
		// The tick count is the bound, not something near it. A battle that ends
		// at 39 of a bound of 40 has a different reason than the bound and is
		// reporting the wrong one.
		if res.Ticks != bound {
			t.Errorf("battle.max_ticks of %d and the report says %d ticks. A stalemate is by "+
				"definition the bound being reached, so the two numbers are the same fact and "+
				"they disagree", bound, res.Ticks)
		}
		// And the reason reaches the text a human reads, not just the enum.
		if want := "stalemate"; !strings.Contains(strings.ToLower(res.Summary()), want) {
			t.Errorf("a stalemate's reason does not appear in the report, so a reader of the "+
				"report cannot tell a stalemate from a battle nobody finished:\n%s", res.Summary())
		}
	}
}

// A draw caused by the fight is found by the fight, not by the bound.
//
// Two sides that both yield is the honest case: it is a draw, it is a real
// ending, and it happens on the tick the last of them yields. Putting
// battle.surrender_strength_fraction at 1 makes every side yielded from the
// start, which is the cheapest way to reach the state without arranging a
// twenty-thousand-tick fight to get there - and it is checked at two sizes,
// because a detector that works on 8 v 8 and not on 500 v 500 is a detector for
// small battles.
func TestAMutualYieldIsFoundByTheFightNotByTheBound(t *testing.T) {
	for _, n := range []int{8, 60} {
		cfg := withBattleConfig(t, "surrender_strength_fraction", "1")
		bound := int(cfg.Battle.MaxTicks)
		res, err := Run(cfg, 20260930, smallSetup(t, cfg, n))
		if err != nil {
			t.Fatalf("a %d v %d battle with every side yielded failed: %v", n, n, err)
		}
		t.Logf("%d v %d with both sides yielded: %s (%s) after %d ticks of a bound of %d",
			n, n, res.Outcome.Kind, res.Outcome.Reason, res.Ticks, bound)
		if res.Outcome.Kind != ResultDraw || res.Outcome.Reason != ReasonMutualBreak {
			t.Errorf("every side is below battle.surrender_strength_fraction of 1, so the battle "+
				"is a mutual yield, and it reported %s (%s)", res.Outcome.Kind, res.Outcome.Reason)
		}
		if res.Ticks >= bound {
			t.Errorf("a mutual yield was noticed at tick %d of a bound of %d. It is found by the "+
				"fight, so it has to be found at the tick it happens and not at the end of time",
				res.Ticks, bound)
		}
		// The bar. A stalemate costs a whole bound of simulation, so a draw
		// detected at anything like the bound has not been detected early in
		// in any sense that matters to whoever is waiting for the answer.
		if frac := float64(res.Ticks) / float64(bound); frac > 0.5 {
			t.Errorf("a mutual yield was detected at %.1f%% of the tick bound. A stalemate costs "+
				"the whole bound, so a draw found halfway through has already spent most of what "+
				"it was trying to save", 100*frac)
		}
	}
}
