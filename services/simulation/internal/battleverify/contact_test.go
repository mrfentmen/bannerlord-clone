package battleverify

import (
	"math"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// The contact rule is the only one in this package that can fail on a battle the
// engine considers perfectly legal, so its own tests are the ones that have to be
// most careful about what they are measuring. A test that fed the probe a view it
// would never see in a real battle, or that asserted on a distance instead of on
// the measurement, would be the same kind of instrument this package exists to
// distrust: it would report a pass or a failure that means nothing.

// viewOf builds a published tick for the probe: one unit per id, both sides
// together, all of them fighting, all of them at a position the caller chose.
//
// The ids are dense and ascending because the probe requires that by contract and
// a test that quietly violated it would measure a probe complaining about the
// roster rather than about contact.
func viewOf(tick int, sideA, sideB []battle.Status, xA, xB float64) *battle.View {
	v := &battle.View{Tick: tick, TickSeconds: 0.25}
	for i, st := range sideA {
		v.Units = append(v.Units, battle.UnitView{
			ID: i, Side: battle.SideA, Status: st, X: xA, Y: 0,
			HPFrac: 1, Morale: 1, Troops: 100, Speed: 4.2,
		})
	}
	for i, st := range sideB {
		v.Units = append(v.Units, battle.UnitView{
			ID: len(sideA) + i, Side: battle.SideB, Status: st, X: xB, Y: 0,
			HPFrac: 1, Morale: 1, Troops: 100, Speed: 4.2,
		})
	}
	return v
}

// probeFor builds a probe over the real balance file with the step limit lifted,
// so a test may place units wherever it likes without the no-teleport rule
// recording violations that have nothing to do with contact.
func probeFor(t *testing.T, unitsA, unitsB int) (*config.Config, *Probe) {
	t.Helper()
	base := loadConfig(t)
	cfg := *base
	cfg.Battle.MaxStepPerTick = 1e6
	return &cfg, NewProbe(&cfg, unitsA, unitsB)
}

// TestScanContactMeasuresTheClosestPairThatCouldStrike checks the measurement
// itself rather than the verdict, because the verdict is a summary of this number
// and a summary cannot be tested against itself.
func TestScanContactMeasuresTheClosestPairThatCouldStrike(t *testing.T) {
	_, p := probeFor(t, 2, 2)

	// Two men per side. Tick 0 the nearest cross-side pair is 40 m apart, tick 1
	// the front rank has closed to 8 m, and tick 2 the two front men are 2 m
	// apart, which is inside a blow's reach.
	if err := p.Command(viewOf(0,
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		-20, 20)); err != nil {
		t.Fatalf("tick 0: %v", err)
	}
	if err := p.Command(viewOf(1,
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		-4, 4)); err != nil {
		t.Fatalf("tick 1: %v", err)
	}
	if err := p.Command(viewOf(2,
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		[]battle.Status{battle.StatusFighting, battle.StatusFighting},
		-1, 1)); err != nil {
		t.Fatalf("tick 2: %v", err)
	}

	if !p.minFoeSet {
		t.Fatal("no distance was measured at all, so the contact rule has nothing to judge")
	}
	if want := 2.0; math.Abs(p.minFoe-want) > 1e-9 {
		t.Errorf("closest approach was %.3f m, want %.3f m: the probe is measuring the wrong pair", p.minFoe, want)
	}
	if p.minFoeAt != 2 {
		t.Errorf("the closest approach was recorded at tick %d, want tick 2", p.minFoeAt)
	}
	if p.minFoeA != 0 || p.minFoeB != 2 {
		t.Errorf("the closest pair was units %d and %d, want 0 and 2: the two front men are ids 0 and 2",
			p.minFoeA, p.minFoeB)
	}
	if p.contactTicks != 1 {
		t.Errorf("%d ticks had a pair inside a blow's reach, want 1: only tick 2 was within reach", p.contactTicks)
	}
	if p.ticks != 3 {
		t.Errorf("the probe counted %d published ticks, want 3", p.ticks)
	}
}

// TestScanContactCountsOnlyMenWhoCouldSwing is the measurement's own edge case,
// and it matters because the alternative is a rule that passes on a graveyard.
//
// Two destroyed men lying at the same point as the enemy are not a fight, and
// neither is a surrendered pair. Only the statuses the engine's own Actable
// accepts may count as contact, so the test uses the engine's own predicate
// rather than a list written here.
func TestScanContactCountsOnlyMenWhoCouldSwing(t *testing.T) {
	cases := []struct {
		name    string
		status  battle.Status
		actable bool
	}{
		{"fighting", battle.StatusFighting, true},
		{"broken", battle.StatusBroken, true},
		{"routed", battle.StatusRouted, false},
		{"surrendered", battle.StatusSurrendered, false},
		{"destroyed", battle.StatusDestroyed, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.status.Actable(); got != c.actable {
				t.Fatalf("the test's own expectation is wrong: Status.Actable() for %s is %v, the test "+
					"expects %v, so the test is measuring something the engine does not do", c.name, got, c.actable)
			}
			_, p := probeFor(t, 1, 1)
			if err := p.Command(viewOf(0,
				[]battle.Status{c.status}, []battle.Status{c.status},
				-0.5, 0.5)); err != nil {
				t.Fatalf("the probe refused a view: %v", err)
			}
			want := 0
			if c.actable {
				want = 1
			}
			if p.contactTicks != want {
				t.Errorf("a %s unit 1 m from the enemy counted as contact on %d ticks, want %d",
					c.name, p.contactTicks, want)
			}
			if c.actable && math.Abs(p.minFoe-1) > 1e-9 {
				t.Errorf("closest approach was %.3f m, want 1.000 m", p.minFoe)
			}
			if !c.actable && p.minFoeSet {
				t.Errorf("a %s unit was measured as an approach at all, at %.3f m: a man who cannot swing "+
					"is not a measurement of contact", c.name, p.minFoe)
			}
		})
	}
}

// TestCheckContactPassesWhenTheEngineThrewASwing: a battle that fought is a pass,
// however few blows it took. The rule asks whether anybody swung, not whether the
// fighting was impressive.
func TestCheckContactPassesWhenTheEngineThrewASwing(t *testing.T) {
	cfg, p := probeFor(t, 1, 1)
	if err := p.Command(viewOf(0,
		[]battle.Status{battle.StatusFighting}, []battle.Status{battle.StatusFighting},
		-0.5, 0.5)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}

	f := &Findings{}
	checkContact(f, Input{
		Config: cfg, Probe: p,
		Result: &battle.Result{Ticks: 9, Sides: [2]battle.SideResult{
			{Swings: 412, MeleeHits: 37},
			{Swings: 388, MeleeHits: 29},
		}},
	})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported, so a run could print a clean row without it")
	}
	if c.Status != Pass {
		t.Errorf("a battle that threw 800 swings was judged %s: %s", c.Status, c.Note)
	}
	if !strings.Contains(c.Note, "800 swings") {
		t.Errorf("the note does not quote the engine's own swing count, so a reader cannot check the verdict: %s", c.Note)
	}
}

// TestCheckContactFailsWhenTheArmiesNeverMet is the failure this whole rule
// exists for, and the test asserts the fault is named as a movement fault rather
// than only that the rule failed.
//
// The distinction is not cosmetic: "the lines never met" is fixed in the balance
// file, and "they met and nothing hit" is fixed in the engine. A harness that
// reported both as one failure would send whoever reads it to the wrong file.
func TestCheckContactFailsWhenTheArmiesNeverMet(t *testing.T) {
	cfg, p := probeFor(t, 1, 1)
	if err := p.Command(viewOf(7,
		[]battle.Status{battle.StatusFighting}, []battle.Status{battle.StatusFighting},
		-30, 30)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}

	f := &Findings{}
	checkContact(f, Input{
		Config: cfg, Probe: p,
		Result: &battle.Result{Ticks: 8, Sides: [2]battle.SideResult{}},
	})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Fatalf("two armies 60 m apart with no swings were judged %s, want FAIL", c.Status)
	}
	if len(c.Violations) != 1 {
		t.Fatalf("the rule recorded %d violations, want exactly 1: one fault, one finding", len(c.Violations))
	}
	d := c.Violations[0].Detail
	for _, want := range []string{"60.0 m", "ticks of approach", "melee stage"} {
		if !strings.Contains(d, want) {
			t.Errorf("the finding does not mention %q, so a reader is told what failed without being told "+
				"why it could not have happened: %s", want, d)
		}
	}
	if c.Violations[0].Tick != 7 {
		t.Errorf("the finding is at tick %d, want tick 7 where the closest approach was seen",
			c.Violations[0].Tick)
	}
}

// TestCheckContactFailsDifferentlyWhenTheyMetAndNothingHit: the same symptom and a
// different fault. The armies closed inside a blow's reach, the melee stage ran,
// and it chose not to swing at anybody. That is a targeting or status bug, and the
// message must not send a reader to the balance file.
func TestCheckContactFailsDifferentlyWhenTheyMetAndNothingHit(t *testing.T) {
	cfg, p := probeFor(t, 1, 1)
	if err := p.Command(viewOf(3,
		[]battle.Status{battle.StatusFighting}, []battle.Status{battle.StatusFighting},
		-0.4, 0.4)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}

	f := &Findings{}
	checkContact(f, Input{
		Config: cfg, Probe: p,
		Result: &battle.Result{Ticks: 4, Sides: [2]battle.SideResult{}},
	})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Fatalf("a battle in which the armies met and nothing hit was judged %s, want FAIL", c.Status)
	}
	if len(c.Violations) != 1 {
		t.Fatalf("the rule recorded %d violations, want exactly 1", len(c.Violations))
	}
	d := c.Violations[0].Detail
	if !strings.Contains(d, "targeting") {
		t.Errorf("the finding does not name targeting as the suspect, so it reads as a movement fault: %s", d)
	}
	if strings.Contains(d, "ticks of approach") {
		t.Errorf("the finding quotes the approach arithmetic for a battle that already made contact, "+
			"which would send a reader to the wrong file: %s", d)
	}
	if p.contactTicks == 0 {
		t.Error("the probe did not count a tick inside a blow's reach, so this test is not the case it " +
			"claims to be")
	}
}

// TestCheckContactSkipsWithoutAProbe: a run with no probe has no measurement, and
// no measurement must never print as a pass.
func TestCheckContactSkipsWithoutAProbe(t *testing.T) {
	cfg := loadConfig(t)
	f := &Findings{}
	checkContact(f, Input{Config: cfg, Result: &battle.Result{Ticks: 5}})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Skip {
		t.Errorf("with no probe the rule was judged %s, want not checkable", c.Status)
	}
	if c.Note == "" {
		t.Error("the skip gives no reason, so the hole in the evidence prints as a bare word")
	}
}

// TestCheckContactFailsWhenNothingWasPublished: a battle that published no state
// cannot have been watched fighting. It must not be a pass, and it must not be a
// skip either, because a skip says the evidence is missing while this says the
// evidence says the battle never happened.
func TestCheckContactFailsWhenNothingWasPublished(t *testing.T) {
	cfg := loadConfig(t)
	f := &Findings{}
	checkContact(f, Input{Config: cfg, Probe: &Probe{units: 4}, Result: &battle.Result{Ticks: 1}})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Errorf("a battle that published no state at all was judged %s, want FAIL", c.Status)
	}
}

// TestCheckContactFailsWhenNobodyCouldEverFight is the case that separates "the
// probe was not watching" from "there was nothing to watch". The battle publishes
// plenty of state; every man in it is destroyed, surrendered, or routed from the
// first tick to the last, so no pair that could strike each other ever exists and
// no distance is ever measured. The rule must still fail, and it must not report a
// distance of +Inf metres, because a confident number about nothing is worse than
// no number.
func TestCheckContactFailsWhenNobodyCouldEverFight(t *testing.T) {
	cfg, p := probeFor(t, 1, 1)
	// Two ticks of published state, both sides already out of the fight.
	if err := p.Command(viewOf(0,
		[]battle.Status{battle.StatusDestroyed}, []battle.Status{battle.StatusSurrendered},
		-0.5, 0.5)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}
	if err := p.Command(viewOf(1,
		[]battle.Status{battle.StatusDestroyed}, []battle.Status{battle.StatusSurrendered},
		-0.5, 0.5)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}
	if p.minFoeSet {
		t.Fatalf("the probe measured a %.3f m approach between a destroyed man and a surrendered one, so "+
			"this test is not the case it claims to be", p.minFoe)
	}

	f := &Findings{}
	checkContact(f, Input{Config: cfg, Probe: p, Result: &battle.Result{Ticks: 2}})

	c := f.find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Errorf("a battle with nobody who could fight was judged %s, want FAIL", c.Status)
	}
	if strings.Contains(c.Note, "Inf") || strings.Contains(c.Note, "infinity") {
		t.Errorf("the note quotes an infinite distance, which is a number about nothing: %s", c.Note)
	}
	if !strings.Contains(c.Note, "2 published ticks") {
		t.Errorf("the note does not say how much of the battle was watched, so a reader cannot judge the "+
			"weight of the finding: %s", c.Note)
	}
}

// TestReportPrintsWordsWhenNothingWasMeasured: the same guard on the printed
// report, because a rule that is judged correctly and printed as "+Inf m" has
// still put a confident wrong-looking number in front of a reader.
func TestReportPrintsWordsWhenNothingWasMeasured(t *testing.T) {
	var sb strings.Builder
	r := &Report{
		Scenario: "synthetic", Seed: 1,
		Result: &battle.Result{Ticks: 3},
		Probe:  &Probe{units: 2, ticks: 3, contactTicks: 0},
		Findings: &Findings{Checks: []Check{{
			Rule: RuleContact, Status: Fail, Note: "no pair could ever fight",
		}}},
	}
	r.writeProbe(&sb)
	got := sb.String()
	if strings.Contains(got, "Inf") || strings.Contains(got, "+Inf") {
		t.Errorf("the report printed an infinite distance: %s", got)
	}
	if !strings.Contains(got, "never measured") {
		t.Errorf("the report did not say the measurement was never taken: %s", got)
	}
}

// TestContactRuleIsInTheSuiteAndIsReachable guards the two ways a rule this
// important can go missing without anything failing: a name added to allRules
// that no code path records, and a check that records a name nothing reports.
func TestContactRuleIsInTheSuiteAndIsReachable(t *testing.T) {
	found := false
	for _, r := range RuleNames() {
		if r == RuleContact {
			found = true
		}
	}
	if !found {
		t.Fatalf("the contact rule is not in the report order, so a run cannot print it: %v", RuleNames())
	}
}

// TestProbeContactScanDoesNotChangeTheBattle is the instrument's own check. The
// contact scan is the one place in the probe that does arithmetic nobody asked
// for, and a scan that mutated a view would turn every number in the report into
// a measurement of the scan. It is checked here by feeding the same view twice
// and requiring the second reading to be the first reading.
func TestProbeContactScanDoesNotChangeTheBattle(t *testing.T) {
	_, p := probeFor(t, 2, 2)
	sideA := []battle.Status{battle.StatusFighting, battle.StatusFighting}
	sideB := []battle.Status{battle.StatusFighting, battle.StatusFighting}

	first := viewOf(0, sideA, sideB, -20, 20)
	before := append([]battle.UnitView{}, first.Units...)
	if err := p.Command(first); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}
	if len(first.Units) != len(before) {
		t.Fatalf("the probe changed the number of units in the view, from %d to %d", len(before), len(first.Units))
	}
	for i := range before {
		if first.Units[i] != before[i] {
			t.Fatalf("the probe rewrote unit %d: was %+v, is %+v", i, before[i], first.Units[i])
		}
	}
	if len(first.Commands) != 0 {
		t.Errorf("the probe wrote %d orders, want none: a battle watched by a probe must be the battle "+
			"battle.Run produces", len(first.Commands))
	}
	if p.contactTicks != 0 || p.minFoeSet != true {
		t.Errorf("two lines 40 m apart reported as contact on %d ticks (measured: %v)", p.contactTicks, p.minFoe)
	}
	if want := 40.0; math.Abs(p.minFoe-want) > 1e-9 {
		t.Errorf("closest approach was %.3f m, want %.3f m", p.minFoe, want)
	}
}

// contactRun builds the evidence for one contact verdict: two lines that never
// touched, and a result whose attack counters the caller sets.
func contactRun(t *testing.T, mayEndAtRange string, res battle.Result) *Findings {
	t.Helper()
	cfg, p := probeFor(t, 1, 1)
	if err := p.Command(viewOf(11,
		[]battle.Status{battle.StatusFighting}, []battle.Status{battle.StatusFighting},
		-60, 60)); err != nil {
		t.Fatalf("the probe refused a view: %v", err)
	}
	res.Ticks = 12
	f := &Findings{}
	checkContact(f, Input{Config: cfg, Probe: p, Result: &res, MayEndAtRange: mayEndAtRange})
	return f
}

// TestContactExemptionNeedsSomethingToHaveLanded is the load-bearing test for the
// exemption, and it is a table because the bar has three rungs: a shot that hit, a
// body put down without a hit being scored, and neither.
//
// The third rung is the one that matters. An exemption that let a battle pass
// because it was DECLARED a firefight would be a hole with a label on it: the
// skirmishers scenario could then be green while nothing at all happened in it.
func TestContactExemptionNeedsSomethingToHaveLanded(t *testing.T) {
	const why = "this scenario is all shooters against all melee"
	cases := []struct {
		name  string
		shots float64
		hits  float64
		kills float64
		want  Status
	}{
		{"a shot hit", 900, 110, 0, Pass},
		{"a body was put down without a hit being scored", 900, 0, 48, Pass},
		{"nothing landed at all", 900, 0, 0, Fail},
		{"nothing was fired at all", 0, 0, 0, Fail},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := battle.Result{Sides: [2]battle.SideResult{
				{Shots: c.shots, RangedHits: c.hits, CasualtiesInflicted: c.kills},
			}}
			got := contactRun(t, why, res).find(RuleContact)
			if got == nil {
				t.Fatal("the contact rule was never reported")
			}
			if got.Status != c.want {
				t.Errorf("verdict was %s, want %s: %s", got.Status, c.want, got.Note)
			}
			if c.want == Fail && len(got.Violations) != 1 {
				t.Fatalf("a failure recorded %d violations, want 1", len(got.Violations))
			}
			if c.want == Pass && len(got.Violations) != 0 {
				t.Errorf("a pass carried %d violations", len(got.Violations))
			}
		})
	}
}

// TestContactExemptionQuotesItsReason checks that a pass through the exemption is
// a claim a reader can check rather than a bare tick in a table. The note has to
// name why the scenario is allowed to end at range and how the shooting carried
// it, or "pass" is asking to be believed.
func TestContactExemptionQuotesItsReason(t *testing.T) {
	const why = "every unit on side A is a shooter and every unit on side B is melee"
	res := battle.Result{Sides: [2]battle.SideResult{
		{Shots: 974, RangedHits: 110, CasualtiesInflicted: 48},
	}}
	c := contactRun(t, why, res).find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Pass {
		t.Fatalf("verdict was %s, want Pass: %s", c.Status, c.Note)
	}
	for _, want := range []string{why, "974 shots", "110 of them hit", "48 bodies", "No swing was thrown"} {
		if !strings.Contains(c.Note, want) {
			t.Errorf("the note does not mention %q, so the pass cannot be checked: %s", want, c.Note)
		}
	}
}

// TestContactExemptionIsNotGlobal is the guard on the guard: the same battle, with
// the same shooting, judged by a scenario that did not ask for the exemption. If
// the shooting could satisfy the rule on its own then the exemption would be
// decoration and every scenario would pass whenever anybody took a shot.
func TestContactExemptionIsNotGlobal(t *testing.T) {
	res := battle.Result{Sides: [2]battle.SideResult{
		{Shots: 974, RangedHits: 110, CasualtiesInflicted: 48},
	}}
	c := contactRun(t, "", res).find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Fatalf("a battle with no swings passed for a scenario that requires contact: %s", c.Note)
	}
}

// TestContactExemptionFailureNamesTheExemption: when a scenario that may end at
// range does nothing at all, the finding has to say the exemption was available
// and not used. Otherwise the same finding reads identically to one from a
// scenario with no exemption, and the reader cannot tell whether the rule was
// misapplied or simply not met.
func TestContactExemptionFailureNamesTheExemption(t *testing.T) {
	const why = "every unit on side A is a shooter"
	c := contactRun(t, why, battle.Result{Sides: [2]battle.SideResult{{Shots: 900}}}).
		find(RuleContact)
	if c == nil {
		t.Fatal("the contact rule was never reported")
	}
	if c.Status != Fail {
		t.Fatalf("verdict was %s, want Fail", c.Status)
	}
	d := c.Violations[0].Detail
	if !strings.Contains(d, "exemption was not used") {
		t.Errorf("the finding does not say the exemption was available and unused: %s", d)
	}
	if !strings.Contains(d, why) {
		t.Errorf("the finding does not quote the reason the exemption exists: %s", d)
	}
	for _, want := range []string{"900 shots were fired", "0 hit"} {
		if !strings.Contains(d, want) {
			t.Errorf("the finding does not quote %q, so the reader is not shown that nothing landed: %s",
				want, d)
		}
	}
}

// TestOnlyTheFirefightScenarioClaimsTheExemption pins the exemption to the one
// scenario built out of shooters, because an exemption is a statement about a
// matchup and it rots quietly: a scenario that claims it and is later rebuilt as
// two mixed forces would keep passing on shooting alone, with nobody left
// checking that the exemption still describes it.
func TestOnlyTheFirefightScenarioClaimsTheExemption(t *testing.T) {
	for _, sc := range Suite {
		claimed := sc.MayEndAtRange != ""
		allRanged, allMelee := false, false
		if setup, err := sc.Build(loadConfig(t), 20260930, 1); err == nil {
			allRanged = len(setup.A) > 0 && countRanged(setup.A) == len(setup.A)
			allMelee = len(setup.B) > 0 && countRanged(setup.B) == 0
		}
		if claimed && !(allRanged && allMelee) {
			t.Errorf("scenario %q claims it may end at range, but its setup is not a side of shooters "+
				"against a side of melee: A is all shooters=%v, B is all melee=%v. Either the "+
				"exemption or the scenario is wrong, and both are silent if this is not checked",
				sc.Name, allRanged, allMelee)
		}
	}
}
