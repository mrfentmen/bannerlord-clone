package battleverify

import (
	"fmt"

	"mbclone/simulation/internal/battle"
)

// The invariant rules, by name.
//
// They are named constants rather than strings written at the call sites because
// the summary table, the per-run report, and the exit code all quote them, and a
// rule whose name is spelled three ways is a rule nobody can grep for. A rule
// name is also what a reader takes away from a failure, so they are written to
// read as the claim being made: "hp-in-range" says what was checked, not where.
const (
	// RuleFinite is that every published number was finite. NaN is the failure
	// mode this catches: a NaN position does not read as out of bounds, it
	// compares false against everything and slips through a bounds check.
	RuleFinite = "finite-state"
	// RuleHitPoints is that no unit's hit points went negative or above its
	// maximum.
	RuleHitPoints = "hp-in-range"
	// RuleFieldBounds is that no unit was outside the battlefield envelope.
	RuleFieldBounds = "field-bounds"
	// RuleNoTeleport is that no unit moved further in one tick than the engine's
	// own per-tick step limit allows.
	RuleNoTeleport = "no-teleport"
	// RuleRosterStable is that the field held the same units throughout: dense
	// ascending ids, one side per id, and no unit appearing or vanishing.
	RuleRosterStable = "roster-stable"
	// RuleContact is that the battle was fought: the armies closed to a blow's
	// reach, and the melee stage actually struck.
	//
	// It is the rule that catches the failure every other rule here waves through.
	// A battle the armies never touch is internally consistent in every way a
	// result can be, so it passes the casualty rules, the winner rule, and the
	// tick bound, and prints a clean row. If the suite does not also ask whether
	// anybody swung, then "the sim works" reduces to "the sim does not crash", and
	// a battle that resolves entirely through suppression at long range would be
	// reported as a working battle with half the combat model unreachable.
	RuleContact = "sides-made-contact"
	// RuleCasualties is that the body counts add up.
	RuleCasualties = "casualties-add-up"
	// RuleUnitsAccounted is that every unit a side started with is accounted for
	// at the end: alive, routed, surrendered, or destroyed.
	RuleUnitsAccounted = "units-accounted-for"
	// RuleWinner is that the outcome names one of the two sides or an explicit
	// draw, that its reason agrees with its winner, and that the losing side's
	// numbers are consistent with the reason.
	RuleWinner = "winner-valid"
	// RuleTickBound is that the battle ran at least one tick, no more than
	// battle.max_ticks, and that its reported elapsed time is its tick count
	// times battle.tick_seconds.
	RuleTickBound = "ticks-within-bound"
	// RuleProbeNeutral is that the commanded run and the uncommanded run of the
	// same setup and seed produced the same result hash. It is the check on this
	// package's own instrument: a probe that changed the battle would make every
	// other number here a measurement of the probe.
	RuleProbeNeutral = "probe-neutral"
	// RuleSetup is that a scenario's setup is the scenario it claims to be: the
	// outnumbered side really is outnumbered, the skirmishers really are faster.
	RuleSetup = "scenario-setup"
	// RuleScenario is that a scenario's battle did the thing the scenario is for.
	RuleScenario = "scenario-expectation"
)

// allRules is every rule, in the order the report prints them.
//
// The order is the order the rules are proved in: what the engine published, then
// what the run totals say, then what the run was for. It is a fixed slice rather
// than a map so that two reports are diffable and so a missing rule is visible as
// a missing row rather than as an absence.
var allRules = []string{
	RuleFinite,
	RuleHitPoints,
	RuleFieldBounds,
	RuleNoTeleport,
	RuleRosterStable,
	RuleContact,
	RuleCasualties,
	RuleUnitsAccounted,
	RuleWinner,
	RuleTickBound,
	RuleProbeNeutral,
	RuleSetup,
	RuleScenario,
}

// RuleNames returns every rule the harness checks, in report order.
//
// It is exported so the command can print how many rules a run is held to. A
// harness that says "all checks passed" without saying how many checks that is
// is asking to be believed, and this is the number that makes the claim mean
// something.
func RuleNames() []string { return append([]string{}, allRules...) }

// Status is the outcome of one rule.
type Status int

const (
	// Pass means the rule was checked and held.
	Pass Status = iota
	// Fail means the rule was checked and did not hold. Every Fail carries at
	// least one Violation.
	Fail
	// Skip means the rule could not be checked, and says why. It is not a pass
	// and it never prints as one: a rule that cannot be checked is a gap in the
	// evidence, and a report that cannot tell the difference between a rule that
	// held and a rule that never ran is the thing this package exists to stop.
	Skip
)

// String names a status.
func (s Status) String() string {
	switch s {
	case Pass:
		return "pass"
	case Fail:
		return "FAIL"
	case Skip:
		return "not checkable"
	default:
		return "unknown"
	}
}

// sideIndex is a side's slot in a two-element array, A then B.
//
// The engine has this as an unexported method on its own Side type, which is the
// right call there and inconvenient here: the harness indexes its own reports by
// side, and reaching into the engine's method would mean asking for it to be
// exported for a caller that is not the engine.
func sideIndex(s battle.Side) int {
	if s == battle.SideB {
		return 1
	}
	return 0
}

// Violation is one way a rule did not hold.
//
// Side is empty for a rule that is not about one side. Tick is -1 for a rule
// checked after the battle rather than during it, so a reader is never left
// guessing whether a finding was located or merely observed.
type Violation struct {
	Rule   string
	Side   string
	Tick   int
	Detail string
}

// String renders a violation as one line.
func (v Violation) String() string {
	side := v.Side
	if side == "" {
		side = "both"
	}
	if v.Tick < 0 {
		return fmt.Sprintf("[%s] %s: %s", v.Rule, side, v.Detail)
	}
	return fmt.Sprintf("[%s] %s at tick %d: %s", v.Rule, side, v.Tick, v.Detail)
}

// Check is one rule's result.
type Check struct {
	Rule   string
	Status Status
	// Note is what was checked, in enough detail that a reader can disagree with
	// the check itself rather than only with its verdict.
	Note       string
	Violations []Violation
}

// Findings is every rule's result for one run.
type Findings struct {
	Checks []Check
}

// record adds a check, or fails loudly if a rule is reported twice, which would
// mean the suite and the invariants had drifted apart.
func (f *Findings) record(c Check) {
	for _, existing := range f.Checks {
		if existing.Rule == c.Rule {
			panic("battleverify: rule " + c.Rule + " was checked twice in one run")
		}
	}
	f.Checks = append(f.Checks, c)
}

// pass records a rule that was checked and held.
func (f *Findings) pass(rule, note string) {
	f.record(Check{Rule: rule, Status: Pass, Note: note})
}

// fail records a rule that was checked and did not hold.
func (f *Findings) fail(rule, note string, vs []Violation) {
	f.record(Check{Rule: rule, Status: Fail, Note: note, Violations: vs})
}

// skip records a rule that could not be checked, and why.
func (f *Findings) skip(rule, why string) {
	f.record(Check{Rule: rule, Status: Skip, Note: why})
}

// Counts returns how many rules passed, failed, and could not be checked.
func (f *Findings) Counts() (pass, fail, skip int) {
	for _, c := range f.Checks {
		switch c.Status {
		case Pass:
			pass++
		case Fail:
			fail++
		case Skip:
			skip++
		}
	}
	return pass, fail, skip
}

// Failed reports whether any rule did not hold.
func (f *Findings) Failed() bool {
	_, fail, _ := f.Counts()
	return fail > 0
}

// find returns a rule's check, and whether the rule was reported at all.
func (f *Findings) find(rule string) *Check {
	for i := range f.Checks {
		if f.Checks[i].Rule == rule {
			return &f.Checks[i]
		}
	}
	return nil
}

// Violations returns every violation from every failed rule, in rule order.
func (f *Findings) Violations() []Violation {
	var out []Violation
	for _, c := range f.Checks {
		out = append(out, c.Violations...)
	}
	return out
}

// Unchecked returns the rules that were not reported at all.
//
// It exists so the suite can tell a complete check list from a partial one. A
// rule added to allRules and never recorded would otherwise be an invisible hole,
// and an invisible hole in a verification harness is the failure mode the harness
// is meant to catch.
func (f *Findings) Unchecked() []string {
	seen := make(map[string]bool, len(f.Checks))
	for _, c := range f.Checks {
		seen[c.Rule] = true
	}
	var missing []string
	for _, r := range allRules {
		if !seen[r] {
			missing = append(missing, r)
		}
	}
	return missing
}

// maxViolationsPerRule caps how many instances of one rule a run reports.
//
// A run against a broken engine can violate a per-tick rule on every unit on
// every tick, which is hundreds of thousands of lines and tells a reader nothing
// the first five did not. The cap keeps the report readable and the count keeps
// the loss visible: a truncated rule still reports the full total, and the rule
// still fails.
const maxViolationsPerRule = 5

// violationLog collects violations with a per-rule cap and full counts.
type violationLog struct {
	kept   map[string][]Violation
	counts map[string]int
	total  int
}

// add records one violation.
func (l *violationLog) add(rule, side string, tick int, format string, args ...any) {
	if l.kept == nil {
		l.kept = map[string][]Violation{}
		l.counts = map[string]int{}
	}
	l.total++
	l.counts[rule]++
	if len(l.kept[rule]) >= maxViolationsPerRule {
		return
	}
	l.kept[rule] = append(l.kept[rule], Violation{
		Rule:   rule,
		Side:   side,
		Tick:   tick,
		Detail: fmt.Sprintf(format, args...),
	})
}

// taken returns the violations recorded for a rule, up to the cap.
//
// A caller decides pass or fail on count, not on whether anything was recorded, so
// a rule with more violations than the cap still fails.
func (l *violationLog) taken(rule string) []Violation { return l.kept[rule] }

// count returns how many violations of a rule there were, including any the cap
// did not keep.
func (l *violationLog) count(rule string) int { return l.counts[rule] }
