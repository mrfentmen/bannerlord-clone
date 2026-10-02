package battle

// Every way a battle can end, each one produced.
//
// checkEnding has five exits and the verification suite has only ever seen one of
// them. Across four scenarios at three seeds, and across every reference battle on
// this branch, every single battle ended "by rout" or "by enemy broke": the other
// four conditions have never fired in a test, which means the code for them has
// never been executed by anything except a mutation test that deliberately broke
// a result to see the harness complain.
//
// CONSTITUTION.md section 1.3's silent fallback is about a mechanic that exists,
// is reachable in principle, and does nothing. A mechanic that has never been run
// is one step short of that: nobody can say it is broken, and nobody can say it
// works. These tests close the step by putting the field into the state each exit
// describes and requiring that exit.
//
// Four of the five are built by moving the FIELD rather than by moving the rules,
// because the state is what the exit claims to be reading:
//
//   - annihilation: every unit of the losing side destroyed, so nothing on it can
//     fight. destroy() is the engine's own function, so the bodies are credited
//     to the other side's casualties exactly as they are in a real battle.
//   - mutual collapse: both sides destroyed.
//   - mutual break: both sides below the yield. Reached through
//     battle.surrender_strength_fraction rather than by hand, because "below the
//     yield" is a comparison against that number and the honest way to be below it
//     is to set it where the field is.
//   - rout: the ordinary one, produced by a battle that is actually fought.
//
// The stalemate already has coverage (battle_size_test.go's tick bound case sets
// battle.max_ticks to 2), and it is repeated here so the five are in one table.
//
// Every ending is also required to assemble a coherent Result, not merely to be
// selected: an exit that returns a reason whose own numbers contradict it is a
// worse fault than an unreachable one, because it prints.

import (
	"testing"

	"mbclone/simulation/internal/config"
)

// endingCase is one way a battle ends and the state that produces it.
type endingCase struct {
	name   string
	reason Reason
	// arrange puts the field into the state, and returns the battle.
	arrange func(t *testing.T, cfg *config.Config) *Battle
}

func TestEveryEndingIsReachable(t *testing.T) {
	cases := []endingCase{
		{
			name:   "one side annihilated",
			reason: ReasonEnemyDestroyed,
			arrange: func(t *testing.T, cfg *config.Config) *Battle {
				b := freshBattle(t, cfg, 8)
				killSide(b, SideB)
				return b
			},
		},
		{
			name:   "the other side annihilated",
			reason: ReasonEnemyDestroyed,
			arrange: func(t *testing.T, cfg *config.Config) *Battle {
				b := freshBattle(t, cfg, 8)
				killSide(b, SideA)
				return b
			},
		},
		{
			name:   "both sides annihilated",
			reason: ReasonMutualCollapse,
			arrange: func(t *testing.T, cfg *config.Config) *Battle {
				b := freshBattle(t, cfg, 8)
				killSide(b, SideA)
				killSide(b, SideB)
				return b
			},
		},
	}

	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			cfg := loadConfig(t)
			b := c.arrange(t, cfg)
			out, decided := b.checkEnding()
			if !decided {
				t.Fatalf("the field is in the state %s describes and checkEnding did not decide the battle",
					c.name)
			}
			if out.Reason != c.reason {
				t.Fatalf("checkEnding returned %s (%s), want reason %s", out.Kind, out.Reason, c.reason)
			}
			assertEndingAgreesWithItsOwnNumbers(t, b, out)
		})
	}

	// The two that need a config rather than a state: a yield and a tick bound are
	// both comparisons, and the cheapest honest way to be below one is to move it.
	t.Run("both sides below the yield", func(t *testing.T) {
		cfg := withBattleConfig(t, "surrender_strength_fraction", "1")
		b := freshBattle(t, cfg, 8)
		out, decided := b.checkEnding()
		if !decided {
			t.Fatalf("with battle.surrender_strength_fraction at 1 every side has yielded and checkEnding " +
				"did not decide the battle")
		}
		if out.Reason != ReasonMutualBreak || out.Kind != ResultDraw {
			t.Fatalf("checkEnding returned %s (%s), want a mutual break draw", out.Kind, out.Reason)
		}
		if out.Kind != ResultDraw {
			t.Errorf("a mutual break is a draw by definition and it is reported as %s", out.Kind)
		}
		assertEndingAgreesWithItsOwnNumbers(t, b, out)
	})

	t.Run("the tick bound", func(t *testing.T) {
		cfg := withBattleConfig(t, "max_ticks", "2")
		b := freshBattle(t, cfg, 8)
		for i := 0; i < 2; i++ {
			if err := b.tick(); err != nil {
				t.Fatalf("tick: %v", err)
			}
		}
		out, decided := b.checkEnding()
		if !decided {
			t.Fatal("the battle is at battle.max_ticks and checkEnding did not decide it")
		}
		if out.Kind != ResultDraw || out.Reason != ReasonStalemate {
			t.Fatalf("checkEnding returned %s (%s), want a stalemate draw", out.Kind, out.Reason)
		}
		assertEndingAgreesWithItsOwnNumbers(t, b, out)
	})

	t.Run("one side below the yield", func(t *testing.T) {
		// The ordinary case, produced by a real fight rather than arranged, so the
		// table above is not the only evidence that it happens at all.
		cfg := loadConfig(t)
		res := runSmall(t, cfg, 30)
		if res.Outcome.Reason != ReasonEnemyBroke {
			t.Fatalf("a fought 30 v 30 battle ended %s (%s), want a rout", res.Outcome.Kind, res.Outcome.Reason)
		}
		t.Logf("%d v %d ended %s by %s after %d ticks", 30, 30, res.Outcome.Kind, res.Outcome.Reason, res.Ticks)
	})
}

// assertEndingAgreesWithItsOwnNumbers is the half of the test that matters most: an
// ending has to be consistent with the Result it produces, because that Result is
// what a battle report prints and what the verification suite's winner-valid rule
// is handed.
func assertEndingAgreesWithItsOwnNumbers(t *testing.T, b *Battle, out Outcome) {
	t.Helper()
	res := b.result(out)
	switch out.Reason {
	case ReasonEnemyDestroyed:
		loser := SideB
		if out.Kind == ResultSideB {
			loser = SideA
		}
		if res.Sides[loser.index()].Standing > 0 {
			t.Errorf("%s by annihilation, and the loser still has %d units standing",
				out.Kind, res.Sides[loser.index()].Standing)
		}
		// Every body it had is on the ground: annihilation is not a rout.
		sr := res.Sides[loser.index()]
		if got := sr.Dead + sr.Wounded + sr.SurrenderedBodies; got < sr.StartBodies-1e-9 {
			t.Errorf("%s by annihilation, and the loser accounted for %.0f of %.0f bodies",
				out.Kind, got, sr.StartBodies)
		}
	case ReasonMutualCollapse:
		for i, s := range res.Sides {
			if s.Standing > 0 {
				t.Errorf("a mutual collapse, and side %d has %d units standing", i, s.Standing)
			}
		}
	case ReasonMutualBreak, ReasonEnemyBroke:
		if out.Kind == ResultDraw {
			for i, s := range res.Sides {
				if s.StrengthStart <= 0 {
					continue
				}
				if ratio := s.StrengthEnd / s.StrengthStart; ratio > 1+1e-9 {
					t.Errorf("side %d yielded at %.0f%% of its opening strength, which is more than it had", i, ratio*100)
				}
			}
		}
	case ReasonStalemate:
		if res.Ticks != int(b.c.MaxTicks) {
			t.Errorf("a stalemate at tick %d with battle.max_ticks of %g", res.Ticks, b.c.MaxTicks)
		}
	}
}

// freshBattle builds a small battle that has not been ticked.
func freshBattle(t *testing.T, cfg *config.Config, n int) *Battle {
	t.Helper()
	b, err := newBattle(cfg, 20260930, smallSetup(t, cfg, n))
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	return b
}

// killSide destroys every unit on one side, through the engine's own function, so
// the casualty counters move exactly as they would in a fight.
func killSide(b *Battle, side Side) {
	for _, u := range b.units {
		if u.Side == side {
			b.destroy(u)
		}
	}
}
