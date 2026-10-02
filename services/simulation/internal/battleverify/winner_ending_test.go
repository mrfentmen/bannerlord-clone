package battleverify

// winner-valid has five cases and the suite has only ever handed it one of them.
//
// checkWinner switches on the outcome's reason and then asks a question about the
// loser: an annihilation requires that it has nobody standing, a rout requires
// that it is below a yield, and a draw has to be a draw. Every battle this harness
// runs ends by rout, because that is what the morale model does, so the other
// three branches of that switch have only ever been exercised by
// TestInvariantsActuallyFail, which breaks a result on purpose and requires the
// rule to complain. A rule whose positive cases have never run is a rule that could
// be wrong in the direction that matters: rejecting a battle that really happened.
//
// So this is the missing half of that test. For each of the five endings it builds
// the SMALLEST Result that could honestly carry that ending, passes it through the
// rule, and requires a pass. A pass here means the numbers on a real battle with
// that ending would be accepted; a failure means either the ending produces results
// the harness would reject, which is a bug in the harness, or the test's own
// arithmetic is wrong, which the failure message has to be able to distinguish.
//
// The last case is the important one and it is a mutation: the same annihilation
// with ONE unit still standing, which is exactly the incoherence the rule exists to
// catch. It is here so the positive case above it cannot be a rule that passes
// everything.

import (
	"fmt"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// coherentEnding builds a Result that carries one ending honestly.
func coherentEnding(cfg *config.Config, kind battle.ResultKind, reason battle.Reason) *battle.Result {
	c := cfg.Battle
	open := 100.0
	res := &battle.Result{
		Outcome: battle.Outcome{Kind: kind, Reason: reason},
		Ticks:   400,
		Elapsed: 100,
		Config: battle.BattleConfigView{
			TickSeconds: c.TickSeconds, MaxTicks: c.MaxTicks,
			MaxUnitsPerSide: c.MaxUnitsPerSide, MaxReportEvents: c.MaxReportEvents,
			GridCellSize: c.GridCellSize, GridMaxCells: c.GridMaxCells,
		},
	}
	for i := 0; i < 2; i++ {
		res.Sides[i] = battle.SideResult{
			Side:          battle.SideA,
			StartUnits:    100,
			StartBodies:   open,
			Dead:          20,
			Wounded:       30,
			Standing:      50,
			Routed:        10,
			Surrendered:   2,
			StrengthStart: open,
			StrengthEnd:   70,
		}
	}
	res.Sides[0].Side = battle.SideA
	res.Sides[1].Side = battle.SideB

	loser := 1
	if kind == battle.ResultSideB {
		loser = 0
	}
	switch reason {
	case battle.ReasonEnemyDestroyed:
		// Nothing of the loser can fight: every unit destroyed or surrendered, and
		// every body it started with accounted for on the ground.
		s := &res.Sides[loser]
		s.Standing, s.Routed, s.Broken = 0, 0, 0
		s.Dead, s.Wounded = 70, 30
		s.StrengthEnd = 0
		s.Surrendered = 0
	case battle.ReasonEnemyBroke:
		// Below the yield: strength under battle.surrender_strength_fraction.
		res.Sides[loser].StrengthEnd = open * c.SurrenderStrengthFraction / 2
		res.Sides[loser].Standing = 20
	case battle.ReasonMutualBreak:
		for i := range res.Sides {
			res.Sides[i].StrengthEnd = open * c.SurrenderStrengthFraction / 2
			res.Sides[i].Standing = 20
		}
	case battle.ReasonMutualCollapse:
		for i := range res.Sides {
			res.Sides[i].Standing = 0
			res.Sides[i].Routed = 0
			res.Sides[i].StrengthEnd = 0
		}
	}
	return res
}

func TestWinnerValidAcceptsEveryEnding(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name   string
		kind   battle.ResultKind
		reason battle.Reason
	}{
		{"a rout", battle.ResultSideA, battle.ReasonEnemyBroke},
		{"an annihilation", battle.ResultSideA, battle.ReasonEnemyDestroyed},
		{"an annihilation the other way", battle.ResultSideB, battle.ReasonEnemyDestroyed},
		{"a mutual collapse", battle.ResultDraw, battle.ReasonMutualCollapse},
		{"a mutual break", battle.ResultDraw, battle.ReasonMutualBreak},
		{"a stalemate", battle.ResultDraw, battle.ReasonStalemate},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			res := coherentEnding(cfg, tc.kind, tc.reason)
			f := &Findings{}
			checkWinner(f, Input{Config: cfg, Result: res})
			got := f.find(RuleWinner)
			if got == nil {
				t.Fatalf("no verdict was recorded for %s (%s), so a run with that ending could print nothing",
					tc.kind, tc.reason)
			}
			if got.Status != Pass {
				t.Errorf("the harness rejected %s (%s), which is a coherent ending: %s", tc.kind, tc.reason, got.Note)
				for _, v := range got.Violations {
					t.Errorf("  %s", v.Detail)
				}
			}
		})
	}
}

// TestWinnerValidStillCatchesAnAnnihilationThatLeftAManStanding is the guard on the
// guard. The case above proves the rule accepts an annihilation; this proves it is
// not a rule that accepts anything, by handing it an annihilation in which the
// loser has one unit left on its feet.
func TestWinnerValidStillCatchesAnAnnihilationThatLeftAManStanding(t *testing.T) {
	cfg := loadConfig(t)
	res := coherentEnding(cfg, battle.ResultSideA, battle.ReasonEnemyDestroyed)
	res.Sides[1].Standing = 1

	f := &Findings{}
	checkWinner(f, Input{Config: cfg, Result: res})
	got := f.find(RuleWinner)
	if got == nil {
		t.Fatal("no verdict was recorded")
	}
	if got.Status != Fail {
		t.Fatalf("an annihilation in which side B still has one unit standing was judged %s", got.Status)
	}
	if len(got.Violations) != 1 {
		t.Fatalf("the rule recorded %d violations, want exactly 1", len(got.Violations))
	}
	d := got.Violations[0].Detail
	if !strings.Contains(d, "annihilation") || !strings.Contains(d, "still has 1") {
		t.Errorf("the finding does not quote what it saw: %s", d)
	}
}

// TestWinnerValidCatchesARoutThatIsNotBelowTheYield is the same guard on the rout
// branch, and it is the one that matters most in practice: a rout is the ending
// every battle on this branch produces, so it is the branch most likely to be
// quietly broken by a change to the two yield constants.
func TestWinnerValidCatchesARoutThatIsNotBelowTheYield(t *testing.T) {
	cfg := loadConfig(t)
	res := coherentEnding(cfg, battle.ResultSideA, battle.ReasonEnemyBroke)

	f := &Findings{}
	checkWinner(f, Input{Config: cfg, Result: res})
	if got := f.find(RuleWinner); got == nil || got.Status != Pass {
		t.Fatalf("the coherent rout case failed, so the negative case below would prove nothing: %v", got)
	}

	// Now a battle that stopped by rout with the loser at full strength.
	res.Sides[1].StrengthEnd = res.Sides[1].StrengthStart
	res.Sides[1].Surrendered = 0
	res.Sides[1].Wounded = 0
	f = &Findings{}
	checkWinner(f, Input{Config: cfg, Result: res})
	got := f.find(RuleWinner)
	if got == nil {
		t.Fatal("no verdict was recorded")
	}
	if got.Status != Fail {
		t.Fatalf("a rout at 100%% of the loser's opening strength was judged %s", got.Status)
	}
	// The message quotes both thresholds by value rather than by key, because the
	// reader is looking at a report and not at the file, so the numbers are the
	// useful part. This asserts that it quotes the loser's own strength and both
	// thresholds, since a reader cannot act on one of the three missing.
	d := got.Violations[0].Detail
	for _, want := range []string{"100.0% of its opening strength",
		fmt.Sprintf("yield is at %.1f%%", cfg.Battle.SurrenderStrengthFraction*100),
		fmt.Sprintf("rout is at %.1f%%", cfg.Battle.RoutStrengthFraction*100)} {
		if !strings.Contains(d, want) {
			t.Errorf("the finding does not quote %q, so a reader is told a rule fired without being told what "+
				"it saw: %s", want, d)
		}
	}
}
