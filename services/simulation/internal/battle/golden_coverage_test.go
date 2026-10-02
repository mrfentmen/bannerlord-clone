package battle

// This file records what the golden replay fixtures can and cannot see, because
// the answer is narrower than the comment on the test that runs them claims, and
// because a gate nobody knows the width of is a gate people trust for the wrong
// reasons.
//
// script_test.go says it plainly:
//
//	TestGoldenReplaysAreTheBattlesTheyWere is claim 4: the checked-in fixtures.
//	... a SIM CHANGE that moves a golden outcome fails here, loudly, in CI,
//	where somebody can decide whether the change was intended.
//
// That is true, and the whole of the formation feature is on the other side of
// it. Three measurements, all taken on 20261002 against branch tip 6a5a8a3 and
// the three fixtures as checked in:
//
//  1. No FormationCommander is ever constructed while a fixture fights. A panic
//     on the first line of NewFormationCommander leaves all three fixtures
//     green. RunScript builds a scriptCommander, which writes orders straight
//     into the command channel; NewFormationCommander is called only from
//     playerorders.go, which is the session layer, and the fixtures do not go
//     through it.
//
//  2. The layer's effect on the field is nil on that path. Making the slot loop
//     skip every man in every group - so the formation layer commands nobody at
//     all - leaves all three hashes and all three tick counts identical.
//
//  3. The shape modifiers never fire. Across 174 blows in the three battles,
//     meleeDealtScale and meleeTakenScale returned exactly 1 for every one. The
//     scripts name column, line and square; column and line have no melee
//     modifier by design, and square needs an attacker at or above
//     battle.formation.square_fast_mover_speed, which nobody in an eight-a-side
//     fight ever reached.
//
// So the fixtures are a real gate on the engine, the generator, the order
// plumbing and the replay path, and no gate at all on formations. That is not
// a defect in them - they were authored as three canonical battles and three
// canonical battles are what they are. It is a fact about them, and the test
// below exists so the fact is written where somebody changing a formation will
// read it rather than where they will not.
//
// WHAT THIS FILE IS NOT. It does not regenerate a fixture, and it does not
// weaken TestGoldenReplaysAreTheBattlesTheyWere. CONSTITUTION.md 7.3: nothing
// is logged as done unless it was verified, and 7.4: a patch over a broken gate
// is a failed gate. A test that fails for a known reason is a bug report; a
// test that fails for an unknown reason is a trap, so this one asserts the
// MEASUREMENT and logs the consequence.

import (
	"strconv"
	"strings"
	"testing"
)

// TestTheGoldenFixturesCommandNoFormation records measurement 1 and 2 in a form
// that runs in CI without a panic and without a sabotage: it fights each
// fixture twice, once as authored and once with the shape taken off every order,
// and requires the two to be the same battle.
//
// Taking the shape off is the smallest edit that removes formations and nothing
// else. The same steps, on the same ticks, for the same units, with the same
// intents and the same metres. If a shape reached the field and its combat
// modifiers mattered, the two runs would differ. They do not.
//
// The expectation is written as an assertion because it is the property: these
// three fixtures are shape-blind. The day somebody wires the formation layer
// into the script path - which is the right thing to do if the goldens are ever
// meant to gate it - this test fails, and the failure says what to do next,
// which is to re-record the fixtures and rewrite the comment on the golden test
// to say the goldens now cover formations. That is the useful direction for
// this test to fail in.
func TestTheGoldenFixturesCommandNoFormation(t *testing.T) {
	cfg := loadConfig(t)
	fixtures := loadGoldens(t, false)
	if len(fixtures) == 0 {
		t.Skipf("no golden fixtures in %s; generate them with %s set", goldenDir(), goldenFixtureEnv)
	}
	named := 0
	for _, f := range fixtures {
		asAuthored, _, err := RunScript(cfg, f.Script, 0)
		if err != nil {
			t.Fatalf("%s: fighting the fixture as authored failed: %v", f.Name, err)
		}
		stripped := *f.Script
		stripped.Steps = append([]Order(nil), f.Script.Steps...)
		shapes := 0
		for i := range stripped.Steps {
			if stripped.Steps[i].Formation != FormationNone {
				shapes++
			}
			stripped.Steps[i].Formation = FormationNone
		}
		named += shapes
		bare, _, err := RunScript(cfg, &stripped, 0)
		if err != nil {
			t.Fatalf("%s: fighting the fixture with the shapes taken off failed: %v", f.Name, err)
		}
		t.Logf("%-26s %d steps, %d of them naming a shape: as authored %s over %d ticks; "+
			"shapes stripped %s over %d ticks",
			f.Name, len(f.Script.Steps), shapes, asAuthored.HashString(), asAuthored.Ticks,
			bare.HashString(), bare.Ticks)
		if asAuthored.HashString() != bare.HashString() {
			t.Errorf("%s fought differently with the shapes taken off its orders: %s as "+
				"authored, %s stripped. The golden fixtures now reach the formation "+
				"layer, which is what this test exists to notice - so they need "+
				"re-recording, and the comment on TestGoldenReplaysAreTheBattlesTheyWere "+
				"needs to say so. Do not just edit this test to match",
				f.Name, asAuthored.HashString(), bare.HashString())
		}
	}
	t.Logf("%d fixtures, %d orders naming a shape in total, and not one of them "+
		"reaches a blow. The golden gate covers the engine, the generator, the order "+
		"plumbing and the replay path. It does not cover formations, and a change to "+
		"formation.go will not be caught by it", len(fixtures), named)
	if named == 0 {
		t.Logf("no fixture names a shape at all, so this run says nothing about the gate; " +
			"the fixtures that do are what the check above is for")
	}
}

// TestTheBattleReportNamesWhatAFightDecided is task 33, and it is here rather
// than appended to battle_test.go because it is about the REPORT and not about
// the engine: a report that leaves out the tick count, the winner or one side's
// casualties is a report a harness has to go and recompute, and a harness that
// recomputes is a second implementation of the thing the report is for.
//
// Every number asserted here is read out of the Result rather than recomputed
// from it. A test that restated the arithmetic would be testing its own
// restatement, which is the failure mode this file has just spent three
// measurements correcting.
func TestTheBattleReportNamesWhatAFightDecided(t *testing.T) {
	cfg := loadConfig(t)
	setup, err := standardForce(t, cfg, 20260930, 60)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	res, err := Run(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("the battle failed: %v", err)
	}
	summary := res.Summary()

	// The tick count, which is the first thing anybody asks about a battle that
	// took a long time, and the one a truncated run most needs to state.
	if want := "ticks: " + itoa(res.Ticks); !strings.Contains(summary, want) {
		t.Errorf("the report does not say %q; it is the line that tells a reader how long "+
			"the fight was, and a truncated run has no other way to say it\n%s", want, summary)
	}

	// The winner, and why. A battle report that says "B won" without saying
	// whether B won by destroying A or by breaking A is asking the reader to
	// guess, and the two are different facts about the same fight. The winner's
	// own String is the string the report prints, so this cannot drift from the
	// report: a new ResultKind that spelled itself differently would fail here
	// rather than quietly print something nobody reads.
	if want := "winner: " + res.Outcome.Kind.String(); !strings.Contains(summary, want) {
		t.Errorf("the report does not say %q; it must lead with the answer\n%s", want, summary)
	}
	if want := "(" + res.Outcome.Reason.String() + ")"; !strings.Contains(summary, want) {
		t.Errorf("the report names a winner without saying why: %q is missing\n%s",
			want, summary)
	}

	// BOTH sides' casualties, each against the opening strength it is a share
	// of. One side is not enough: a report that gives A's losses and not B's
	// cannot answer "who won", and answering that is the first thing it is for.
	for _, sr := range res.Sides {
		casualties := sr.Dead + sr.Wounded
		want := "casualties " + bodies(casualties) + " of " + bodies(sr.StartBodies) + " bodies"
		if !strings.Contains(summary, want) {
			t.Errorf("side %s lost %.0f casualties of %.0f bodies and the report does not "+
				"say %q; a report that gives one side's losses cannot answer who won\n%s",
				sr.Side, casualties, sr.StartBodies, want, summary)
		}
		// And the two numbers it is made of, because "casualties" that a reader
		// cannot split is a single number wearing two words.
		if want := "dead      " + bodies(sr.Dead); !strings.Contains(summary, want) {
			t.Errorf("side %s does not have its dead reported as %q\n%s", sr.Side, want, summary)
		}
		if want := "wounded   " + bodies(sr.Wounded); !strings.Contains(summary, want) {
			t.Errorf("side %s does not have its wounded reported as %q\n%s", sr.Side, want, summary)
		}
	}

	t.Logf("a 60 v 60 battle over %d ticks, %s (%s): the report names the tick count, the "+
		"winner, the reason and both casualty counts",
		res.Ticks, res.Outcome.Kind, res.Outcome.Reason)
}

// bodies renders a body count the way the report does, which is %.0f: a body is
// a whole man and a fraction of one is not a thing the report should offer.
//
// It is here rather than inlined so the test's expected strings are produced by
// the same rule the report uses, and a change to that rule moves both at once
// instead of leaving the test asserting a format the report no longer prints.
func bodies(v float64) string { return strconv.FormatFloat(v, 'f', 0, 64) }
