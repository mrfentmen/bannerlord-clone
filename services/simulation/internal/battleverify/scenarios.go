package battleverify

import (
	"fmt"
	"math"
	"strings"
	"time"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// Scenario is one scripted battle the suite knows how to run and what to expect
// of it.
//
// The brief asks for four: an even fight, an outnumbered defence, a matchup that
// separates fast from slow, and a rout. A scenario is data rather than a function
// with the expectations buried inside it, because the report has to be able to
// print what a scenario is for and the summary table has to be able to show that
// the run was held to it.
type Scenario struct {
	// Name identifies the scenario in the report and the table.
	Name string
	// Line is one sentence on what the scenario is for, printed under the name.
	Line string
	// Build returns the battle setup for a seed and a size scale.
	Build func(cfg *config.Config, seed uint64, scale float64) (battle.Setup, error)
	// CheckSetup asserts that the setup is what the scenario claims to build: the
	// outnumbered side really is outnumbered, the skirmishers really are faster.
	// It is a check on the scenario, not on the engine, and a scenario that
	// quietly stops being itself is worse than one that is deleted, because it
	// would go on reporting a pass.
	CheckSetup func(setup battle.Setup) []Violation
	// Expect asserts that the battle did what the scenario is for.
	Expect func(r *Report) []Violation
}

// Suite is every scenario, in the order they are run.
//
// The order is the order of what each one is testing: first that an ordinary fight
// works at all, then that an uneven one resolves, then that the movement and role
// models do something, then that morale can end a battle before attrition does.
// A reader who reads only the first two rows has checked that the engine fights
// and that numbers decide who wins.
var Suite = []Scenario{
	scenarioSymmetric,
	scenarioOutnumbered,
	scenarioSkirmishers,
	scenarioMoraleShock,
}

// ScenarioByName finds a scenario in the suite by name.
//
// It matches the whole name first and then any unambiguous prefix of it, because
// the suite's names carry their sizes ("symmetric 50v50") and nobody types that
// when they mean "symmetric". A prefix that matches more than one scenario is an
// error rather than a silent choice of the first, because picking one of two
// candidates for the reader is the kind of helpfulness that produces a report
// about a scenario they did not ask for.
func ScenarioByName(name string) (Scenario, bool) {
	for _, sc := range Suite {
		if strings.EqualFold(sc.Name, name) {
			return sc, true
		}
	}
	var match *Scenario
	for i := range Suite {
		if !strings.HasPrefix(strings.ToLower(Suite[i].Name), strings.ToLower(name)) {
			continue
		}
		if match != nil {
			return Scenario{}, false
		}
		match = &Suite[i]
	}
	if match == nil {
		return Scenario{}, false
	}
	return *match, true
}

// Run is one scenario run: the setup it was given, the report it produced, and
// what every rule found.
type Run struct {
	Scenario Scenario
	Seed     uint64
	Scale    float64
	Setup    battle.Setup
	Report   *Report
	Findings *Findings
	// Err is a failure to run at all: a setup that would not build, or a battle
	// that returned an error. It is kept here rather than returned so that one bad
	// scenario does not stop the suite: a suite that stops at the first problem
	// reports one problem, and the point of a suite is to say how much is wrong.
	Err error
}

// OK reports whether a run completed and every rule held.
func (r *Run) OK() bool { return r.Err == nil && r.Findings != nil && !r.Findings.Failed() }

// RunScenario runs one scenario once and checks it.
//
// The run is made twice, on purpose, and this is the core of what the harness is
// for:
//
//  1. Through a Probe, which is timed. This is the reported run, and it is where
//     the per-tick invariants come from.
//  2. Through battle.Run, with no seam in it at all, which is also timed.
//
// Two results come back. If their hashes differ then the probe changed the battle
// and nothing this harness says about the engine means anything, so that
// difference is itself a reported violation rather than something to be smoothed
// over. The second run also gives the wall time of the battle without the cost of
// checking it, so a reader can see what the verification costs.
func RunScenario(cfg *config.Config, balancePath string, sc Scenario, seed uint64, scale float64) *Run {
	out := &Run{Scenario: sc, Seed: seed, Scale: scale}

	if scale <= 0 {
		out.Err = fmt.Errorf("battleverify: scenario %q asked for a size scale of %g; a battle of "+
			"no units is not a battle", sc.Name, scale)
		return out
	}

	setup, err := sc.Build(cfg, seed, scale)
	if err != nil {
		out.Err = fmt.Errorf("battleverify: scenario %q could not build its setup: %w", sc.Name, err)
		return out
	}
	out.Setup = setup

	probe := NewProbe(cfg, len(setup.A), len(setup.B))
	start := time.Now()
	res, err := battle.RunCommanded(cfg, seed, setup, probe)
	wall := time.Since(start)
	if err != nil {
		out.Err = fmt.Errorf("battleverify: scenario %q did not run: %w", sc.Name, err)
		return out
	}

	startPlain := time.Now()
	plain, err := battle.Run(cfg, seed, setup)
	wallPlain := time.Since(startPlain)
	if err != nil {
		out.Err = fmt.Errorf("battleverify: scenario %q did not run uncommanded: %w", sc.Name, err)
		return out
	}

	report := buildReport(sc, cfg, balancePath, seed, scale, setup, res, plain, probe, wall, wallPlain)
	findings := Verify(Input{
		Config:        cfg,
		Setup:         setup,
		Result:        res,
		PlainResult:   plain,
		Hash:          report.Hash,
		PlainHash:     report.PlainHash,
		Probe:         probe,
		ScenarioSetup: sc.CheckSetup,
		ScenarioRun:   sc.Expect,
	})
	report.Findings = findings
	out.Report = report
	out.Findings = findings
	return out
}

// buildReport assembles the report for a finished run from the engine's result
// and the harness's measurements.
//
// The uncommanded run is an argument rather than something re-derived inside,
// because the report has to print its hash. It used not to, and the result was a
// report that said "repeat: not run" on every single line of every run while the
// probe-neutral check two dozen lines further down said the two runs agreed. Both
// statements cannot be true, and the one the reader would believe first is the one
// the report itself contradicts.
func buildReport(sc Scenario, cfg *config.Config, balancePath string, seed uint64, scale float64,
	setup battle.Setup, res, plain *battle.Result, p *Probe, wall, wallPlain time.Duration) *Report {
	r := &Report{
		Scenario:        sc.Name,
		Line:            sc.Line,
		Seed:            seed,
		Scale:           scale,
		BalancePath:     balancePath,
		ConfigVersion:   res.ConfigVersion,
		Setup:           setup,
		TickSeconds:     cfg.Battle.TickSeconds,
		MaxTicks:        cfg.Battle.MaxTicks,
		MaxUnitsPerSide: cfg.Battle.MaxUnitsPerSide,
		MaxStep:         cfg.Battle.MaxStepPerTick,
		MeleeRange:      cfg.Battle.MeleeRange,
		Result:          res,
		Wall:            wall,
		WallPlain:       wallPlain,
		Hash:            ResultHash(res),
		PlainHash:       ResultHash(plain),
		Probe:           p,
	}
	r.Winner = res.Outcome.Kind.String()
	r.HowDecided = howDecided(res.Outcome.Reason)
	r.Decided = res.Outcome.Kind != battle.ResultDraw ||
		res.Outcome.Reason == battle.ReasonMutualCollapse ||
		res.Outcome.Reason == battle.ReasonMutualBreak

	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		i := sideIndex(side)
		sr := sideResult(res, side)
		destroyed := 0
		for _, e := range res.Events {
			if e.Kind == battle.EventDestroyed && e.Side == side {
				destroyed++
			}
		}
		units := 0
		bodies := 0.0
		perUnit := 0.0
		in := setup.A
		if side == battle.SideB {
			in = setup.B
		}
		for j := range in {
			units++
			bodies += in[j].Troops
			perUnit = in[j].Troops
		}
		offField := sr.SurrenderedBodies
		r.Sides[i] = SideReport{
			StartUnits:       sr.StartUnits,
			StartBodies:      sr.StartBodies,
			Dead:             sr.Dead,
			Wounded:          sr.Wounded,
			OffFieldBodies:   offField,
			AliveUnits:       sr.Standing,
			AliveBodies:      math.Max(0, sr.StartBodies-sr.Dead-sr.Wounded-offField),
			Broken:           sr.Broken,
			Routed:           sr.Routed,
			SurrenderedUnits: sr.Surrendered,
			DestroyedUnits:   destroyed,
			StrengthStart:    sr.StrengthStart,
			StrengthEnd:      sr.StrengthEnd,
			SetupMorale:      meanMorale(in),
			MoraleStart:      sr.MoraleStart,
			MoraleEnd:        sr.MoraleEnd,
			Shots:            sr.Shots,
			RangedHits:       sr.RangedHits,
			Swings:           sr.Swings,
			MeleeHits:        sr.MeleeHits,
			AmmoSpent:        sr.AmmoSpent,
			SuppressionDealt: sr.SuppressionDealt,
			SuppressionTaken: sr.SuppressionTaken,
			Inflicted:        sr.CasualtiesInflicted,
			Leaders:          sr.Leaders,
		}
		r.Units[i] = units
		r.Bodies[i] = bodies
		r.TroopsPerUnit[i] = perUnit
	}
	return r
}

// --- the scenarios ---

// scenarioSymmetric is the baseline: fifty units a side, on open ground, with
// nothing special about either of them.
//
// It is the scenario that would catch an engine that cannot fight at all, and it
// is deliberately the first row of the table because everything after it is a
// variation on this fight.
var scenarioSymmetric = Scenario{
	Name: "symmetric 50v50",
	Line: "two even mixed forces on open ground: the baseline every other scenario varies",
	Build: func(cfg *config.Config, seed uint64, scale float64) (battle.Setup, error) {
		n := scaleUnits(scale, 50)
		return evenSetup(cfg, seed, n, n, "symmetric %dv%d", n, n)
	},
	CheckSetup: func(setup battle.Setup) []Violation {
		var vs []Violation
		if len(setup.A) != len(setup.B) {
			vs = append(vs, Violation{Rule: RuleSetup, Tick: -1,
				Detail: fmt.Sprintf("the symmetric scenario built %d units for side A and %d for side B",
					len(setup.A), len(setup.B))})
		}
		if got := countRanged(setup.A); got == 0 || got == len(setup.A) {
			vs = append(vs, Violation{Rule: RuleSetup, Side: "A", Tick: -1,
				Detail: fmt.Sprintf("side A is supposed to be a mixed force and has %d shooters of %d units",
					got, len(setup.A))})
		}
		return vs
	},
	Expect: expectDecided("an even fight is decided rather than running out of ticks"),
}

// scenarioOutnumbered is a two to one defence: the smaller side holds the ground
// and the larger one comes at it.
//
// It exists because an even fight can hide a bug that only appears when the two
// sides are not mirror images: the melee concentration limit, the targeting
// scan, and the ending rules all behave differently when one side has twice the
// targets the other does.
var scenarioOutnumbered = Scenario{
	Name: "outnumbered defence 100v50",
	Line: "side B defends outnumbered two to one; the numbers on both sides have to survive a battle",
	Build: func(cfg *config.Config, seed uint64, scale float64) (battle.Setup, error) {
		big, small := scaleUnits(scale, 100), scaleUnits(scale, 50)
		return evenSetup(cfg, seed, big, small, "outnumbered defence %dv%d", big, small)
	},
	CheckSetup: func(setup battle.Setup) []Violation {
		var vs []Violation
		if len(setup.A) != 2*len(setup.B) {
			vs = append(vs, Violation{Rule: RuleSetup, Tick: -1,
				Detail: fmt.Sprintf("the outnumbered scenario built %d against %d, which is not two to one",
					len(setup.A), len(setup.B))})
		}
		return vs
	},
	// No assertion about who wins, on purpose. Whether two to one is a rout or a
	// close fight is a balance question, and it belongs to whoever owns the
	// balance file. This harness's job is that the fight resolves, that both sides'
	// numbers add up, and that the answer is reported every seed so a balance
	// trend is visible rather than hidden behind a test that only says the battle
	// ended.
	Expect: expectDecided("an outnumbered defence is decided rather than running out of ticks"),
}

// scenarioSkirmishers is fast light troops against slow heavy ones.
//
// The engine has no per-unit armour field, so "heavy" here means what the model
// can actually say: slow, low-skill melee that carries more bodies per unit. That
// is stated in the scenario's line rather than left for a reader to infer from a
// number, because a scenario that quietly claimed to model armour it does not
// model would be worse than one that does not claim it at all.
//
// It also sets each side's bodies per unit differently, which is the only scenario
// that does. That is deliberate: casualty accounting is in bodies, so this is where
// a unit count and a body count that have drifted apart would be caught.
var scenarioSkirmishers = Scenario{
	Name: "skirmishers against heavies 40v40",
	Line: "fast light shooters against slow low-skill melee carrying six bodies a unit; " +
		"the engine has no armour field, so heavy means slow and thick",
	Build: func(cfg *config.Config, seed uint64, scale float64) (battle.Setup, error) {
		n := scaleUnits(scale, 40)
		a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{
			Units: n, AllRanged: true, SkillBias: 0.4, MoraleBias: 0.2, TroopsPerUnit: 2,
		})
		if err != nil {
			return battle.Setup{}, err
		}
		b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{
			Units: n, NoRanged: true, SkillBias: -0.4, MoraleBias: -0.1, TroopsPerUnit: 6,
		})
		if err != nil {
			return battle.Setup{}, err
		}
		return setupFrom(cfg, seed, a, b, fmt.Sprintf("skirmishers against heavies %dv%d", n, n)), nil
	},
	CheckSetup: func(setup battle.Setup) []Violation {
		var vs []Violation
		if len(setup.A) != len(setup.B) {
			vs = append(vs, Violation{Rule: RuleSetup, Tick: -1,
				Detail: fmt.Sprintf("the scenario built %d units against %d", len(setup.A), len(setup.B))})
		}
		if countRanged(setup.A) != len(setup.A) {
			vs = append(vs, Violation{Rule: RuleSetup, Side: "A", Tick: -1,
				Detail: fmt.Sprintf("side A is supposed to be all shooters and has %d of %d",
					countRanged(setup.A), len(setup.A))})
		}
		if countRanged(setup.B) != 0 {
			vs = append(vs, Violation{Rule: RuleSetup, Side: "B", Tick: -1,
				Detail: fmt.Sprintf("side B is supposed to be all melee and has %d shooters",
					countRanged(setup.B))})
		}
		fast, slow := meanSpeed(setup.A), meanSpeed(setup.B)
		if fast <= slow {
			vs = append(vs, Violation{Rule: RuleSetup, Tick: -1,
				Detail: fmt.Sprintf("the skirmishers average %.3f m/s and the heavies %.3f m/s, so the "+
					"scenario is not faster against slower", fast, slow)})
		}
		if bodies(setup.A) >= bodies(setup.B) {
			vs = append(vs, Violation{Rule: RuleSetup, Tick: -1,
				Detail: fmt.Sprintf("side A carries %.0f bodies and side B %.0f, so the heavies are not thicker",
					bodies(setup.A), bodies(setup.B))})
		}
		return vs
	},
	Expect: expectDecided("the matchup is decided rather than running out of ticks"),
}

// scenarioMoraleShock is the rout scenario: one side arrives shaken and comes
// apart early.
//
// It is the only scenario whose expectation is about something other than
// completion, because a rout is a specific claim about the morale model and a
// battle that merely ends would look identical in a summary table.
//
// What it asserts is that the morale model is live: at least one unit routed. If
// morale were inert, this battle would still resolve, and it would resolve the
// way every other scenario resolves, which is why the rout count is checked here
// and a plain stalemate would not be enough.
//
// What it deliberately does not assert, and this is a decision worth stating
// rather than leaving to be discovered later: that the shaken side is the one
// that breaks, and that it breaks early. Both are balance properties of
// morale_casualty_hit, morale_suppression_hit, rally_chance, and
// roster_morale_start, and they belong to whoever owns balance.toml. Asserting
// them here would mean the harness fails when a tuning constant moves, which is
// a balance change being reported as an engine fault, and a harness that cries
// wolf over tuning gets switched off.
//
// So the observation is made instead of the verdict: the report prints the first
// break, the first rout, how far through the battle they fell, and which side
// each happened to, on every seed the suite runs. Whoever is tuning morale reads
// that column and decides for themselves.
var scenarioMoraleShock = Scenario{
	Name: "morale shock, early rout 30v30",
	Line: "side B starts with shaken men; the fight should break on nerve rather than on numbers",
	Build: func(cfg *config.Config, seed uint64, scale float64) (battle.Setup, error) {
		n := scaleUnits(scale, 30)
		a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: n})
		if err != nil {
			return battle.Setup{}, err
		}
		b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: n, MoraleBias: -0.6})
		if err != nil {
			return battle.Setup{}, err
		}
		return setupFrom(cfg, seed, a, b, fmt.Sprintf("morale shock, early rout %dv%d", n, n)), nil
	},
	CheckSetup: func(setup battle.Setup) []Violation {
		var vs []Violation
		if meanMorale(setup.B) >= meanMorale(setup.A) {
			vs = append(vs, Violation{Rule: RuleSetup, Side: "B", Tick: -1,
				Detail: fmt.Sprintf("side B starts at morale %.3f and side A at %.3f, so side B is not the "+
					"shaken one", meanMorale(setup.B), meanMorale(setup.A))})
		}
		return vs
	},
	Expect: func(r *Report) []Violation {
		vs := expectDecided("a shaken side's battle still resolves")(r)
		if r.Result.Stats.Routs == 0 {
			vs = append(vs, Violation{Rule: RuleScenario, Tick: -1,
				Detail: "no unit ever routed; the morale model produced no rout in the scenario built to " +
					"produce one, so this battle resolved without the model being exercised at all"})
		}
		return vs
	},
}

// expectDecided is the shared completion assertion: a scenario battle has to
// reach a conclusion, and it has to be a conclusion the engine's own rules name
// rather than a draw because the run ran out of ticks.
//
// Every scenario in the suite uses it, because "the suite completed" has to mean
// something stronger than "the suite returned": four battles that all hit
// battle.max_ticks and reported four stalemates would be four reports and no
// evidence that the engine can end a fight.
func expectDecided(what string) func(*Report) []Violation {
	return func(r *Report) []Violation {
		var vs []Violation
		res := r.Result
		if res.Ticks < 1 {
			vs = append(vs, Violation{Rule: RuleScenario, Tick: -1,
				Detail: "the battle ran no ticks"})
			return vs
		}
		if res.Truncated {
			vs = append(vs, Violation{Rule: RuleScenario, Tick: -1,
				Detail: "the run was truncated by a tick budget rather than ended by the engine"})
		}
		if res.Outcome.Kind == battle.ResultDraw && res.Outcome.Reason == battle.ReasonStalemate {
			vs = append(vs, Violation{Rule: RuleScenario, Tick: -1,
				Detail: fmt.Sprintf("the battle reached battle.max_ticks (%g) with nothing decided; %s",
					r.MaxTicks, what)})
		}
		return vs
	}
}

// --- setup helpers ---

// evenSetup builds a battle with an even command on both sides.
//
// The leader count follows battle.LeaderCount, which reads
// battle.roster_leaders_per_unit, so a scaled scenario keeps the same command
// density and a size sweep measures size rather than command structure. It used
// to say "one per two hundred and fifty units" here as well as in setupFrom,
// which is the same number written in a third place.
func evenSetup(cfg *config.Config, seed uint64, unitsA, unitsB int, label string, args ...any) (battle.Setup, error) {
	a, err := battle.GenerateForce(cfg, seed, battle.SideA, battle.Roster{Units: unitsA})
	if err != nil {
		return battle.Setup{}, err
	}
	b, err := battle.GenerateForce(cfg, seed, battle.SideB, battle.Roster{Units: unitsB})
	if err != nil {
		return battle.Setup{}, err
	}
	return setupFrom(cfg, seed, a, b, fmt.Sprintf(label, args...)), nil
}

// setupFrom attaches a command and the ground to two generated forces.
//
// The leader count is battle.LeaderCount and the standing those commanders are
// given is battle.morale_leader_influence_reference, both read from the balance
// file. This function used to carry its own copy of both: a literal 250 men a
// commander and a literal 260 of standing, which are the shipped defaults of
// those two keys. A third copy of a constant the balance file already owns is
// how a size sweep ends up measuring the harness's idea of command structure
// rather than the engine's, and it made the comment in balance.toml — that the
// copies no longer exist — untrue. Every caller that wants a different command
// structure changes the balance file now.
func setupFrom(cfg *config.Config, seed uint64, a, b []battle.Unit, label string) battle.Setup {
	leaders := battle.LeaderCount(cfg, len(a))
	if n := battle.LeaderCount(cfg, len(b)); n > leaders {
		leaders = n
	}
	influence := cfg.Battle.MoraleLeaderInfluenceReference
	return battle.Setup{
		A: a,
		B: b,
		Leaders: append(
			battle.GenerateLeaders(cfg, seed, battle.SideA, leaders, influence),
			battle.GenerateLeaders(cfg, seed, battle.SideB, leaders, influence)...),
		Terrain: battle.TerrainOpen,
		Label:   label,
	}
}

// scaleUnits applies a size scale to a scenario's unit count, with a floor of one.
//
// The floor is there because a scale of 0.01 against a 30 unit scenario is 0.3
// units, and a roster of no units is not a smaller battle, it is an error the
// roster generator is right to reject. A size sweep is for asking about bigger, so
// this floors rather than refusing.
func scaleUnits(scale float64, n int) int {
	if scale <= 0 {
		return 1
	}
	out := int(float64(n) * scale)
	if out < 1 {
		return 1
	}
	return out
}

// countRanged is how many units in a force carry a ranged weapon.
func countRanged(force []battle.Unit) int {
	n := 0
	for _, u := range force {
		if u.Role == battle.RoleRanged {
			n++
		}
	}
	return n
}

// bodies is how many bodies a force stands for.
func bodies(force []battle.Unit) float64 {
	total := 0.0
	for _, u := range force {
		total += u.Troops
	}
	return total
}

// meanSpeed is a force's average pace in metres per second.
func meanSpeed(force []battle.Unit) float64 {
	if len(force) == 0 {
		return 0
	}
	total := 0.0
	for _, u := range force {
		total += u.Speed
	}
	return total / float64(len(force))
}

// meanMorale is a force's average starting morale.
func meanMorale(force []battle.Unit) float64 {
	if len(force) == 0 {
		return 0
	}
	total := 0.0
	for _, u := range force {
		total += u.Morale
	}
	return total / float64(len(force))
}
