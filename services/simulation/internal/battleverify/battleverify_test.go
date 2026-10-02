package battleverify

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// balanceEnv names the environment variable that overrides where these tests read
// the balance file from. It is the same variable internal/battle and
// internal/replay honour, so one command can point every package at the same
// constants. Every test that loads the file logs the path and version it used.
const balanceEnv = "BANNERLORD_BALANCE"

var balanceOnce struct {
	path string
	cfg  *config.Config
	err  error
	done bool
}

// loadConfig reads the balance file that ships with the simulation, once per test
// binary.
//
// This is the third copy of this helper in the module and it is here rather than
// in a shared testing package because each test binary is a separate process with
// its own working directory: a shared helper would have to rediscover the path
// anyway, and the three copies disagree only in which directory they start from.
func loadConfig(t testing.TB) *config.Config {
	t.Helper()
	if balanceOnce.done {
		if balanceOnce.err != nil {
			t.Fatalf("%v", balanceOnce.err)
		}
		return balanceOnce.cfg
	}
	path := os.Getenv(balanceEnv)
	if path == "" {
		found, err := findBalanceFile()
		if err != nil {
			balanceOnce.done, balanceOnce.err = true, err
			t.Fatal(err)
		}
		path = found
	}
	cfg, err := config.Load(path)
	balanceOnce.path, balanceOnce.cfg, balanceOnce.err, balanceOnce.done = path, cfg, err, true
	if err != nil {
		balanceOnce.err = fmt.Errorf("the balance file did not load from %s: %w", path, err)
		t.Fatalf("%v", balanceOnce.err)
	}
	t.Logf("balance file: %s (version %s)", path, cfg.Version)
	return cfg
}

// findBalanceFile walks up from the test's working directory looking for
// config/balance.toml.
func findBalanceFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("cannot determine the test working directory: %w", err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("could not find config/balance.toml by walking up from the test directory; " +
		"set " + balanceEnv + " to point at it")
}

// mustRun runs a scenario and fails the test if it did not run at all.
func mustRun(t *testing.T, cfg *config.Config, sc Scenario, seed uint64) *Run {
	t.Helper()
	run := RunScenario(cfg, balanceOnce.path, sc, seed, 1)
	if run.Err != nil {
		t.Fatalf("scenario %q did not run: %v", sc.Name, run.Err)
	}
	return run
}

// TestSuiteRunsAndPasses is the harness proving itself: every scenario in the
// suite completes, and every rule holds on every one of them.
//
// It prints the summary table so that a `go test -v` run of this package produces
// the same evidence the command does, which matters because the two are how
// different people will check this: a designer runs the command, an engineer runs
// the tests, and neither should be able to see a green result that the other does
// not.
func TestSuiteRunsAndPasses(t *testing.T) {
	cfg := loadConfig(t)
	var reports []*Report
	for _, sc := range Suite {
		run := mustRun(t, cfg, sc, 20260930)
		reports = append(reports, run.Report)
		for _, v := range run.Findings.Violations() {
			t.Errorf("%s (seed %d): %s", sc.Name, run.Seed, v)
		}
		if missing := run.Findings.Unchecked(); len(missing) > 0 {
			t.Errorf("%s: rules were never reported: %s", sc.Name, strings.Join(missing, ", "))
		}
		if _, _, skip := run.Findings.Counts(); skip > 0 {
			t.Errorf("%s: %d rules could not be checked, so this run is not evidence for them",
				sc.Name, skip)
		}
	}
	t.Log("\n" + summaryTable(reports))
}

// summaryTable renders the table into a string for a test log.
func summaryTable(reports []*Report) string {
	var sb strings.Builder
	WriteSummaryTable(&sb, reports)
	return sb.String()
}

// TestEveryRequiredScenarioExists checks the suite against the brief's list by
// name, because a suite that quietly loses a scenario still passes every other
// test in this file.
func TestEveryRequiredScenarioExists(t *testing.T) {
	for _, name := range []string{"symmetric", "outnumbered", "skirmishers", "morale shock"} {
		found := false
		for _, sc := range Suite {
			if strings.Contains(strings.ToLower(sc.Name), name) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("the suite has no scenario matching %q; it has %d scenarios: %s",
				name, len(Suite), strings.Join(scenarioNames(), ", "))
		}
	}
}

// scenarioNames lists the suite's scenario names.
func scenarioNames() []string {
	out := make([]string, 0, len(Suite))
	for _, sc := range Suite {
		out = append(out, sc.Name)
	}
	return out
}

// TestProbeSeesEveryTick is the check on the instrument's coverage.
//
// The probe sees the field at the top of every tick, so the number of ticks it
// checked has to be the number of ticks the engine ran. If it is fewer, then part
// of the battle went unchecked and the per-tick invariants do not mean what the
// report says they mean.
func TestProbeSeesEveryTick(t *testing.T) {
	cfg := loadConfig(t)
	run := mustRun(t, cfg, scenarioSymmetric, 4242)
	p := run.Report.Probe
	if p == nil {
		t.Fatal("the run had no probe, so nothing was checked per tick")
	}
	if p.ticks != run.Report.Result.Ticks {
		t.Errorf("the engine ran %d ticks and the probe checked %d; a tick went unobserved",
			run.Report.Result.Ticks, p.ticks)
	}
	if want := run.Report.Units[0] + run.Report.Units[1]; p.units != want {
		t.Errorf("the probe saw %d units, the setup declared %d", p.units, want)
	}
	if p.maxStepSeen > cfg.Battle.MaxStepPerTick {
		t.Errorf("the largest one-tick step seen was %.3f m, past battle.max_step_per_tick of %g",
			p.maxStepSeen, cfg.Battle.MaxStepPerTick)
	}
	t.Logf("%d ticks checked, %d units, furthest %.1f m on x and %.1f m on y, largest step %.2f m",
		p.ticks, p.units, p.maxAbsX, p.maxAbsY, p.maxStepSeen)
}

// TestSameSeedSameHash is the determinism claim, made here rather than assumed.
//
// The suite's own premise is that a run's report means something, and it would
// not if the same seed could produce two different battles. Running the same
// scenario on the same seed twice has to produce the same hash, or the hash in
// every report is noise.
func TestSameSeedSameHash(t *testing.T) {
	cfg := loadConfig(t)
	first := mustRun(t, cfg, scenarioOutnumbered, 99)
	second := mustRun(t, cfg, scenarioOutnumbered, 99)
	if first.Report.Hash != second.Report.Hash {
		field, _ := battle.ResultStateDiff(first.Report.Result, second.Report.Result)
		t.Errorf("the same seed twice produced two different battles: %s against %s, first difference %s",
			first.Report.Hash, second.Report.Hash, field)
	}
	other := mustRun(t, cfg, scenarioOutnumbered, 100)
	if first.Report.Hash == other.Report.Hash {
		t.Errorf("seeds 99 and 100 produced the same hash %s, so the seed is not reaching the engine "+
			"and the determinism above would pass on a simulation that ignores it", first.Report.Hash)
	}
	t.Logf("seed 99 twice: %s, seed 100: %s", first.Report.Hash, other.Report.Hash)
}

// TestInvariantsActuallyFail is the most important test in this file.
//
// A verification harness that cannot fail is worse than none, because it reports
// green forever. So each required invariant is proved to be load bearing: a real
// battle's result is copied, broken in one specific way, and the check is required
// to notice. If a mutation here stops being caught, the corresponding rule has
// stopped being a check and has become a comment.
func TestInvariantsActuallyFail(t *testing.T) {
	cfg := loadConfig(t)

	// One real battle to corrupt. Small, so the test is quick; the invariants do
	// not care about size, and TestSuiteRunsAndPasses covers the real ones.
	sc := scenarioSymmetric
	setup, err := sc.Build(cfg, 1234, 0.1)
	if err != nil {
		t.Fatalf("building the setup failed: %v", err)
	}
	res, err := battle.Run(cfg, 1234, setup)
	if err != nil {
		t.Fatalf("the battle did not run: %v", err)
	}
	probe := NewProbe(cfg, len(setup.A), len(setup.B))
	if _, err := battle.RunCommanded(cfg, 1234, setup, probe); err != nil {
		t.Fatalf("the commanded battle did not run: %v", err)
	}
	hash := ResultHash(res)

	cases := []struct {
		name   string
		rule   string
		mutate func(*battle.Result)
	}{
		{"a side loses more bodies than it started with", RuleCasualties, func(r *battle.Result) {
			r.Sides[0].Dead = r.Sides[0].StartBodies + 10
		}},
		{"the two sides' casualty halves disagree", RuleCasualties, func(r *battle.Result) {
			r.Sides[0].CasualtiesInflicted += 25
		}},
		{"the destroyed events do not match the casualties", RuleCasualties, func(r *battle.Result) {
			// Copied first: the slice is shared with the unmutated result, and a
			// mutation that leaked into the next case would make this test prove
			// something other than what it says.
			events := append([]battle.Event{}, r.Events...)
			for i := range events {
				if events[i].Kind == battle.EventDestroyed {
					events[i].Value += 1
					r.Events = events
					return
				}
			}
			// A small battle can finish without a single unit destroyed, in which case
			// there is nothing to corrupt and a mutator that quietly did nothing would
			// report a passing test that proved nothing. So one is added, claiming a
			// body the casualty totals do not account for.
			events = append(events, battle.Event{
				Seq: len(events), Tick: r.Ticks, Side: battle.SideA,
				Kind: battle.EventDestroyed, Value: 1,
			})
			r.Events = events
		}},
		{"more units stand than the side started with", RuleUnitsAccounted, func(r *battle.Result) {
			r.Sides[0].Standing = r.Sides[0].StartUnits + 3
		}},
		{"the winner is neither side nor a draw", RuleWinner, func(r *battle.Result) {
			r.Outcome.Kind = battle.ResultKind(9)
		}},
		{"a side wins for a reason only a draw can have", RuleWinner, func(r *battle.Result) {
			r.Outcome.Kind = battle.ResultSideA
			r.Outcome.Reason = battle.ReasonMutualCollapse
		}},
		{"the battle ran past its own tick bound", RuleTickBound, func(r *battle.Result) {
			r.Ticks = int(cfg.Battle.MaxTicks) + 10
		}},
		{"the elapsed time does not follow from the ticks", RuleTickBound, func(r *battle.Result) {
			r.Elapsed = 12.5
		}},
		{"the published stage order is not the documented one", RuleTickBound, func(r *battle.Result) {
			r.TickOrder = []string{"morale", "intent"}
		}},
		{"a run reported no ticks at all", RuleTickBound, func(r *battle.Result) {
			r.Ticks = 0
			r.Elapsed = 0
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			broken := *res
			tc.mutate(&broken)
			f := Verify(Input{
				Config:      cfg,
				Setup:       setup,
				Result:      &broken,
				PlainResult: res,
				Hash:        hash,
				PlainHash:   hash,
				Probe:       probe,
			})
			got := f.find(tc.rule)
			if got == nil {
				t.Fatalf("no check was recorded for rule %q, so nothing could catch this", tc.rule)
			}
			if got.Status != Fail {
				t.Errorf("corrupting the result as %q left rule %q at %s; it should have failed. "+
					"Notes: %s", tc.name, tc.rule, got.Status, got.Note)
			}
		})
	}
}

// TestProbeNeutralityIsChecked proves the check on the instrument is load bearing,
// in the same way TestInvariantsActuallyFail does for the others: a comparison run
// that disagrees has to be caught.
func TestProbeNeutralityIsChecked(t *testing.T) {
	cfg := loadConfig(t)
	sc := scenarioSymmetric
	setup, err := sc.Build(cfg, 555, 0.1)
	if err != nil {
		t.Fatalf("building the setup failed: %v", err)
	}
	res, err := battle.Run(cfg, 555, setup)
	if err != nil {
		t.Fatalf("the battle did not run: %v", err)
	}
	probe := NewProbe(cfg, len(setup.A), len(setup.B))
	if _, err := battle.RunCommanded(cfg, 555, setup, probe); err != nil {
		t.Fatalf("the commanded battle did not run: %v", err)
	}
	f := Verify(Input{
		Config:      cfg,
		Setup:       setup,
		Result:      res,
		PlainResult: res,
		Hash:        ResultHash(res),
		PlainHash:   "000000000000dead",
		Probe:       probe,
	})
	got := f.find(RuleProbeNeutral)
	if got == nil || got.Status != Fail {
		t.Errorf("a comparison run with a different hash left rule %q at %v; it should have failed",
			RuleProbeNeutral, got)
	}
}

// TestRunWithoutAProbeReportsNotCheckable is the no-silent-pass check.
//
// A run made without the probe cannot have its per-tick rules checked. Those rules
// must report "not checkable" with their reason. If they ever report a pass, a
// reader of that report would take the word of a rule that never ran, which is the
// one thing this package must not do.
func TestRunWithoutAProbeReportsNotCheckable(t *testing.T) {
	cfg := loadConfig(t)
	sc := scenarioSymmetric
	setup, err := sc.Build(cfg, 777, 0.1)
	if err != nil {
		t.Fatalf("building the setup failed: %v", err)
	}
	res, err := battle.Run(cfg, 777, setup)
	if err != nil {
		t.Fatalf("the battle did not run: %v", err)
	}
	f := Verify(Input{Config: cfg, Setup: setup, Result: res, Hash: ResultHash(res)})
	for _, rule := range []string{RuleFinite, RuleHitPoints, RuleFieldBounds, RuleNoTeleport, RuleRosterStable} {
		got := f.find(rule)
		if got == nil {
			t.Fatalf("rule %q was not reported at all", rule)
		}
		if got.Status != Skip {
			t.Errorf("rule %q reported %s on a run with no probe; it must report not-checkable",
				rule, got.Status)
		}
	}
	if got := f.find(RuleTickBound); got == nil || got.Status != Pass {
		t.Errorf("the result-level rules should still be checkable without a probe, but %q reported %v",
			RuleTickBound, got)
	}
}

// TestFindingsUncheckedFindsAMissingRule checks the meta-check: a rule that exists
// and is never recorded has to be visible, or adding a rule and forgetting to check
// it would be invisible.
func TestFindingsUncheckedFindsAMissingRule(t *testing.T) {
	var partial Findings
	partial.pass(RuleFinite, "checked")
	missing := partial.Unchecked()
	if len(missing) != len(RuleNames())-1 {
		t.Errorf("with one rule reported out of %d, Unchecked returned %d: %v",
			len(RuleNames()), len(missing), missing)
	}
	var full Findings
	for _, r := range RuleNames() {
		full.pass(r, "checked")
	}
	if missing := full.Unchecked(); len(missing) != 0 {
		t.Errorf("with every rule reported, Unchecked returned %v", missing)
	}
}

// TestReportCarriesTheNumbers is the check that a report is complete rather than
// decorative: every field the brief asks for has to be filled in from the engine's
// own numbers.
func TestReportCarriesTheNumbers(t *testing.T) {
	cfg := loadConfig(t)
	run := mustRun(t, cfg, scenarioSymmetric, 31337)
	r := run.Report
	res := r.Result

	if r.Hash == "" {
		t.Error("the report carries no result hash")
	}
	if r.Hash != ResultHash(res) {
		t.Errorf("the report's hash %s is not the engine's hash %s", r.Hash, ResultHash(res))
	}
	if r.Winner != res.Outcome.Kind.String() {
		t.Errorf("the report says %q won, the engine says %q", r.Winner, res.Outcome.Kind)
	}
	if r.HowDecided == "" || r.HowDecided == "unknown" {
		t.Errorf("the report does not say how the battle was decided: %q", r.HowDecided)
	}
	if r.Wall <= 0 || r.WallPlain <= 0 {
		t.Errorf("the report has no wall time for one of its runs: %s and %s", r.Wall, r.WallPlain)
	}
	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		sr := r.Sides[sideIndex(side)]
		if sr.SetupMorale <= 0 || sr.SetupMorale > 1 {
			t.Errorf("side %s: the report's measured starting morale is %g; it has to come from the units "+
				"that were handed to the engine, not be left at zero", side, sr.SetupMorale)
		}
		if sr.StartUnits != r.Units[sideIndex(side)] {
			t.Errorf("side %s: the report says %d units started, the setup had %d",
				side, sr.StartUnits, r.Units[sideIndex(side)])
		}
		// The identity the brief asks for: start = alive + dead, with the off-field
		// living counted separately because they are neither.
		total := sr.AliveBodies + sr.Dead + sr.Wounded + sr.OffFieldBodies
		if diff := total - sr.StartBodies; diff > 0.01 || diff < -0.01 {
			t.Errorf("side %s: alive %.2f + dead %.2f + wounded %.2f + off-field %.2f is %.2f, against "+
				"%.2f that started", side, sr.AliveBodies, sr.Dead, sr.Wounded, sr.OffFieldBodies,
				total, sr.StartBodies)
		}
	}
	var sb strings.Builder
	r.Write(&sb)
	out := sb.String()
	for _, want := range []string{"result hash", "winner", "wall time", "probe", "checks"} {
		if !strings.Contains(out, want) {
			t.Errorf("the printed report has no %q line:\n%s", want, out)
		}
	}
	t.Logf("\n%s", out)
}
