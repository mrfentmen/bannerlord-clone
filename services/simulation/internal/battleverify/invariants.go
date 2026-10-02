package battleverify

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// documentedStageOrder is the stage order the engine is required to publish.
//
// It is checked against the engine's own tickOrder, because the order is part of
// the simulation's contract rather than an implementation detail: CONSTITUTION.md
// section 2.1 requires a fixed documented system order, and a report that quotes
// an order the engine did not use is a report nobody can trust.
var documentedStageOrder = []string{"intent", "targeting", "aimed fire", "melee", "morale"}

// Input is everything Check needs. It is a value so a run's evidence is the thing
// itself rather than a set of pointers into a battle that has moved on.
type Input struct {
	Config *config.Config
	// Setup is the battle as it was handed to the engine, for the checks that are
	// about what went in rather than what came out.
	Setup battle.Setup
	// Result is the engine's own outcome, from the run through the probe.
	Result *battle.Result
	// PlainResult is the same setup and seed run without the probe. Comparing the
	// two hashes is the check that the instrument did not change the battle.
	PlainResult *battle.Result
	// Hash and PlainHash are the two results' hashes.
	Hash, PlainHash string
	// Probe is the per-tick observer, nil when a run was made without one.
	Probe *Probe
	// ScenarioSetup and ScenarioRun are the scenario's own assertions about its
	// setup and about what the battle did, nil when the caller supplied none.
	ScenarioSetup func(battle.Setup) []Violation
	ScenarioRun   func(*Report) []Violation
}

// Verify runs every rule against one run's evidence and returns what each found.
//
// The order the rules are recorded in is allRules, so the report reads in the
// order the evidence was gathered: what the engine published, then what the totals
// say, then what the run was for. Rules that cannot be checked are skipped with a
// reason rather than passed, and any rule the caller did not reach is reported by
// Findings.Unchecked rather than silently absent.
func Verify(in Input) *Findings {
	f := &Findings{}
	if in.Result == nil {
		f.fail(RuleTickBound, "there is no result to check", []Violation{{
			Rule: RuleTickBound, Tick: -1,
			Detail: "a run with no result cannot satisfy any invariant",
		}})
		return f
	}

	log := &violationLog{}
	if in.Probe != nil {
		log = &in.Probe.log
	}

	checkPerTick(f, log, in.Probe)
	checkCasualties(f, in)
	checkUnitsAccounted(f, in)
	checkWinner(f, in)
	checkTickBound(f, in)
	checkProbeNeutral(f, in)
	checkScenario(f, in)
	return f
}

// checkPerTick reports the five rules measured from the published state.
func checkPerTick(f *Findings, log *violationLog, p *Probe) {
	if p == nil {
		for _, rule := range []string{RuleFinite, RuleHitPoints, RuleFieldBounds, RuleNoTeleport, RuleRosterStable} {
			f.skip(rule, "this run had no probe attached, so no per-tick state was published to check")
		}
		return
	}
	ticks := fmt.Sprintf("%d published ticks, %d units", p.ticks, p.units)

	for _, c := range []struct {
		rule string
		note string
	}{
		{RuleFinite, "every published x, y, hp, morale, suppression, troops, speed and ammo was finite over " + ticks},
		{RuleHitPoints, "no unit's hit points fell below zero or rose above its maximum over " + ticks},
		{RuleFieldBounds, "no unit was outside the movement-reach envelope over " + ticks},
		{RuleNoTeleport, "no unit moved further in one tick than battle.max_step_per_tick over " + ticks},
		{RuleRosterStable, "ids stayed dense and ascending, sides stayed put, and the field held the same units over " + ticks},
	} {
		if n := log.count(c.rule); n > 0 {
			f.fail(c.rule, c.note, log.taken(c.rule))
			continue
		}
		f.pass(c.rule, c.note)
	}
}

// checkCasualties is the required rule that casualty counts add up.
//
// It is checked three ways, and the three are independent of each other on
// purpose, because each one can be wrong on its own:
//
//  1. Per side, dead plus wounded cannot exceed the bodies that side started
//     with. A report that claims more casualties than troops is a report with a
//     sign error in it.
//  2. Across sides, what side A inflicted on side B is exactly side B's dead plus
//     wounded. These are two different counters, incremented at two different
//     lines of the engine (a destroyed unit credits its own side's dead and
//     wounded, and the other side's inflicted), so their agreement is evidence
//     rather than arithmetic.
//  3. Against the event log, the destroyed events' bodies sum to the same figure.
//     The events are appended in a third place again, so this cross-check would
//     catch a counter that is never incremented, which is the failure that prints
//     a confident zero.
//
// Where the event log was truncated by the engine's own event bound, the third
// check is reported as not checkable rather than passed. Its dropped count is in
// the report so a reader can see that it happened.
func checkCasualties(f *Findings, in Input) {
	res := in.Result
	var vs []Violation
	dropped := res.EventsDropped > 0

	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		sr := sideResult(res, side)
		name := side.String()

		if sr.Dead < 0 || sr.Wounded < 0 {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s reports %.2f dead and %.2f wounded; casualties are not negative",
					name, sr.Dead, sr.Wounded)})
		}
		lost := sr.Dead + sr.Wounded
		if lost > sr.StartBodies+bodyEpsilonOf(sr.StartBodies) {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s lost %.2f bodies but started with %.2f",
					name, lost, sr.StartBodies)})
		}
		if inf := sr.CasualtiesInflicted; inf < 0 {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s is credited with %.2f casualties inflicted", name, inf)})
		}

		// The cross-side identity.
		foe := sideResult(res, side.Opposing())
		if diff := math.Abs(foe.Dead + foe.Wounded - sr.CasualtiesInflicted); diff > bodyEpsilonOf(sr.StartBodies) {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s inflicted %.2f bodies but side %s lost %.2f dead and wounded, "+
					"a difference of %.2f", name, sr.CasualtiesInflicted, side.Opposing(),
					foe.Dead+foe.Wounded, diff)})
		}

		if dropped {
			continue
		}
		// The event cross-check.
		var destroyedBodies, destroyedUnits float64
		for _, e := range res.Events {
			if e.Kind != battle.EventDestroyed || e.Side != side {
				continue
			}
			destroyedBodies += e.Value
			destroyedUnits++
		}
		if diff := math.Abs(destroyedBodies - lost); diff > bodyEpsilonOf(sr.StartBodies) {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("the destroyed events for side %s carry %.2f bodies but side %s reports "+
					"%.2f dead and wounded, a difference of %.2f", name, destroyedBodies, name, lost, diff)})
		}
		if destroyedUnits > float64(sr.StartUnits) {
			vs = append(vs, Violation{Rule: RuleCasualties, Side: name, Tick: -1,
				Detail: fmt.Sprintf("the event log records %.0f units destroyed on side %s, which started with %d",
					destroyedUnits, name, sr.StartUnits)})
		}
	}

	note := fmt.Sprintf("per side dead+wounded <= starting bodies; inflicted[A] == dead[B]+wounded[B]; "+
		"destroyed events sum to the same bodies (%d events kept, %d dropped)",
		len(res.Events), res.EventsDropped)
	switch {
	case len(vs) > 0:
		f.fail(RuleCasualties, note, vs)
	case dropped:
		f.skip(RuleCasualties, note+"; the event cross-check could not run because the engine "+
			"dropped events past its own bound, and the two total-based checks above are all that stands behind this")
	default:
		f.pass(RuleCasualties, note)
	}
}

// checkUnitsAccounted is that every unit a side started with is accounted for.
//
// A side's units are standing (of which some are broken), routed, surrendered, or
// destroyed. The engine reports the first three directly; the destroyed count is
// what is left over, and the event log has to agree with it. That agreement is
// the check, since the leftover is arithmetic and the event count is a count.
func checkUnitsAccounted(f *Findings, in Input) {
	res := in.Result
	var vs []Violation
	dropped := res.EventsDropped > 0

	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		sr := sideResult(res, side)
		name := side.String()
		destroyed := sr.StartUnits - sr.Standing - sr.Routed - sr.Surrendered
		if destroyed < 0 {
			vs = append(vs, Violation{Rule: RuleUnitsAccounted, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s started with %d units and reports %d standing, %d routed and %d "+
					"surrendered, which is %d more than it had", name, sr.StartUnits, sr.Standing, sr.Routed,
					sr.Surrendered, -destroyed)})
		}
		// Broken is a subset of Standing, not a separate column: the engine counts a
		// broken unit as standing because it is still on the field and still bites.
		if sr.Broken < 0 || sr.Broken > sr.Standing {
			vs = append(vs, Violation{Rule: RuleUnitsAccounted, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s reports %d broken units out of %d standing; broken is a "+
					"subset of standing", name, sr.Broken, sr.Standing)})
		}
		if sr.Surrendered > sr.StartUnits {
			vs = append(vs, Violation{Rule: RuleUnitsAccounted, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s reports %d surrendered units out of %d it started with",
					name, sr.Surrendered, sr.StartUnits)})
		}
		if dropped {
			continue
		}
		var destroyedEvents, surrenderedEvents int
		for _, e := range res.Events {
			switch {
			case e.Kind == battle.EventDestroyed && e.Side == side:
				destroyedEvents++
			case e.Kind == battle.EventSurrendered && e.Side == side:
				surrenderedEvents++
			}
		}
		if destroyedEvents != destroyed {
			vs = append(vs, Violation{Rule: RuleUnitsAccounted, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s accounts for %d destroyed units but the event log holds %d",
					name, destroyed, destroyedEvents)})
		}
		if surrenderedEvents != sr.Surrendered {
			vs = append(vs, Violation{Rule: RuleUnitsAccounted, Side: name, Tick: -1,
				Detail: fmt.Sprintf("side %s reports %d surrendered units but the event log holds %d",
					name, sr.Surrendered, surrenderedEvents)})
		}
	}

	note := fmt.Sprintf("standing + broken, routed and surrendered + destroyed == starting units, and the "+
		"event log's destroyed and surrendered counts agree (%d events kept, %d dropped)",
		len(res.Events), res.EventsDropped)
	switch {
	case len(vs) > 0:
		f.fail(RuleUnitsAccounted, note, vs)
	case dropped:
		f.skip(RuleUnitsAccounted, note+"; the event cross-check could not run because the engine dropped events")
	default:
		f.pass(RuleUnitsAccounted, note)
	}
}

// checkWinner is the required rule that the winner is one of the two sides or an
// explicit draw.
//
// It also checks that the reason agrees with the winner, which is where the real
// bug would be: an outcome of "A won because B's strength fell below the
// surrender fraction" whose own numbers do not show that is a report that will
// convince somebody of the wrong thing, and it is exactly the kind of confident
// wrong that this package exists to catch.
func checkWinner(f *Findings, in Input) {
	res := in.Result
	o := res.Outcome
	var vs []Violation

	switch o.Kind {
	case battle.ResultSideA, battle.ResultSideB:
		switch o.Reason {
		case battle.ReasonEnemyDestroyed:
			// The loser has nothing left that can fight, which requires that it has
			// no unit standing: a unit that is fighting or broken can always act.
			loser := loserOf(o.Kind)
			sr := sideResult(res, loser)
			if sr.Standing > 0 {
				vs = append(vs, Violation{Rule: RuleWinner, Side: loser.String(), Tick: -1,
					Detail: fmt.Sprintf("the battle ended as %s by annihilation while side %s still has %d "+
						"units standing", o.Kind, loser, sr.Standing)})
			}
		case battle.ReasonEnemyBroke:
			loser := loserOf(o.Kind)
			sr := sideResult(res, loser)
			c := in.Config.Battle
			strength := sr.StrengthEnd / sr.StrengthStart
			routed := sr.SurrenderedBodies / sr.StrengthStart
			// The engine yields a side whose strength has fallen to
			// surrender_strength_fraction, or more than rout_strength_fraction of
			// which is routed. Routed bodies are counted inside
			// SurrenderedBodies, so the routed term below is a necessary condition
			// rather than an equivalent one.
			if strength > c.SurrenderStrengthFraction+ratioEpsilon &&
				routed < c.RoutStrengthFraction-ratioEpsilon {
				vs = append(vs, Violation{Rule: RuleWinner, Side: loser.String(), Tick: -1,
					Detail: fmt.Sprintf("the battle ended as %s by a break, but side %s holds %.1f%% of its "+
						"opening strength (yield is at %.1f%%) with %.1f%% of bodies off-field (rout is at %.1f%%)",
						o.Kind, loser, strength*100, c.SurrenderStrengthFraction*100, routed*100,
						c.RoutStrengthFraction*100)})
			}
		default:
			vs = append(vs, Violation{Rule: RuleWinner, Side: "", Tick: -1,
				Detail: fmt.Sprintf("side %s won for the reason %q, which is a reason only a draw can have",
					o.Kind, o.Reason)})
		}
	case battle.ResultDraw:
		switch o.Reason {
		case battle.ReasonMutualCollapse, battle.ReasonMutualBreak, battle.ReasonStalemate:
		default:
			vs = append(vs, Violation{Rule: RuleWinner, Side: "", Tick: -1,
				Detail: fmt.Sprintf("the battle was a draw for the reason %q, which is a reason only a winner "+
					"can have", o.Reason)})
		}
	default:
		vs = append(vs, Violation{Rule: RuleWinner, Side: "", Tick: -1,
			Detail: fmt.Sprintf("the outcome names winner %d, which is neither side nor a draw", int(o.Kind))})
	}

	if res.Truncated {
		vs = append(vs, Violation{Rule: RuleWinner, Side: "", Tick: -1,
			Detail: "the run was truncated by a caller-supplied tick budget, so its outcome describes a " +
				"measurement rather than a conclusion"})
	}

	note := fmt.Sprintf("outcome %q by %q is a coherent pairing, and the loser's own numbers agree with the reason",
		o.Kind, o.Reason)
	if len(vs) > 0 {
		f.fail(RuleWinner, note, vs)
		return
	}
	f.pass(RuleWinner, note)
}

// checkTickBound is the required rule that the tick count is within MaxTicks.
//
// It also checks the elapsed time against the tick count, which is the check that
// the tick bound means what it says: a run that reported more ticks than its clock
// allows, or a clock that does not follow from its ticks, would make every other
// timing number in the report decorative.
func checkTickBound(f *Findings, in Input) {
	res := in.Result
	c := in.Config.Battle
	var vs []Violation

	if res.Ticks < 1 {
		vs = append(vs, Violation{Rule: RuleTickBound, Side: "", Tick: -1,
			Detail: fmt.Sprintf("the battle ran %d ticks; a battle that fought nothing is not a result", res.Ticks)})
	}
	if float64(res.Ticks) > c.MaxTicks {
		vs = append(vs, Violation{Rule: RuleTickBound, Side: "", Tick: -1,
			Detail: fmt.Sprintf("the battle ran %d ticks, past battle.max_ticks of %g", res.Ticks, c.MaxTicks)})
	}
	want := float64(res.Ticks) * c.TickSeconds
	if diff := math.Abs(res.Elapsed - want); diff > timeEpsilon(c.TickSeconds, res.Ticks) {
		vs = append(vs, Violation{Rule: RuleTickBound, Side: "", Tick: -1,
			Detail: fmt.Sprintf("the battle reports %g s elapsed over %d ticks at %g s, which is %g s",
				res.Elapsed, res.Ticks, c.TickSeconds, want)})
	}
	if len(res.TickOrder) != len(documentedStageOrder) {
		vs = append(vs, Violation{Rule: RuleTickBound, Side: "", Tick: -1,
			Detail: fmt.Sprintf("the engine published %d stages (%v) where %d are documented (%v)",
				len(res.TickOrder), res.TickOrder, len(documentedStageOrder), documentedStageOrder)})
	} else {
		for i, stage := range documentedStageOrder {
			if res.TickOrder[i] != stage {
				vs = append(vs, Violation{Rule: RuleTickBound, Side: "", Tick: -1,
					Detail: fmt.Sprintf("stage %d ran as %q where the documented order says %q (whole order %v)",
						i+1, res.TickOrder[i], stage, res.TickOrder)})
				break
			}
		}
	}

	note := fmt.Sprintf("%d ticks ran, inside battle.max_ticks of %g, and %.6g s of simulated time is that many "+
		"ticks at %g s", res.Ticks, c.MaxTicks, res.Elapsed, c.TickSeconds)
	if len(vs) > 0 {
		f.fail(RuleTickBound, note, vs)
		return
	}
	f.pass(RuleTickBound, note)
}

// checkProbeNeutral is the check on this package's own instrument.
//
// The same setup and seed are run twice, once through the probe and once without,
// and the two results have to hash the same. If they do not, then every per-tick
// number the probe collected and every report built from either run is a
// measurement of the probe rather than of the engine, and none of it is evidence.
func checkProbeNeutral(f *Findings, in Input) {
	if in.PlainResult == nil {
		f.skip(RuleProbeNeutral, "no uncommanded comparison run was made, so the probe was never checked "+
			"against the engine it watches")
		return
	}
	if in.Hash == in.PlainHash {
		f.pass(RuleProbeNeutral, fmt.Sprintf(
			"the commanded and uncommanded runs of seed %d agree: %s", in.Result.Seed, in.Hash))
		return
	}
	// Name the field that parted. The engine's ResultStateDiff does that, and a
	// difference you can read is worth more than one you can only count.
	field, _ := battle.ResultStateDiff(in.Result, in.PlainResult)
	f.fail(RuleProbeNeutral, "the commanded and uncommanded runs disagree, so the probe changed the battle", []Violation{{
		Rule: RuleProbeNeutral, Tick: -1,
		Detail: fmt.Sprintf("commanded run hash %s against uncommanded run hash %s, first difference: %s. "+
			"A probe that issues no orders cannot change a battle, so one of these two runs is not what it "+
			"claims to be", in.Hash, in.PlainHash, field),
	}})
}

// checkScenario runs the scenario's own assertions about its setup and its battle.
func checkScenario(f *Findings, in Input) {
	if in.ScenarioSetup == nil && in.ScenarioRun == nil {
		f.skip(RuleSetup, "the caller supplied no scenario, so there is nothing to check the setup against")
		f.skip(RuleScenario, "the caller supplied no scenario, so there is nothing to check the battle against")
		return
	}
	if in.ScenarioSetup == nil {
		f.skip(RuleSetup, "this scenario makes no claim about its own setup")
	} else if vs := in.ScenarioSetup(in.Setup); len(vs) > 0 {
		f.fail(RuleSetup, "the setup is not the scenario it claims to be", vs)
	} else {
		f.pass(RuleSetup, "the setup matches what the scenario claims it builds")
	}
	if in.ScenarioRun == nil {
		f.skip(RuleScenario, "this scenario makes no claim about its battle")
		return
	}
	// The scenario gets a report built from the same run, carrying the constants it
	// needs to make sense of a threshold. Handing it a half-built report is how a
	// failure message ends up quoting battle.max_ticks as zero, which is both wrong
	// and the kind of wrong that makes a real failure look like a bug in the
	// message rather than in the battle.
	report := &Report{
		Result:        in.Result,
		Setup:         in.Setup,
		Hash:          in.Hash,
		MaxTicks:      in.Config.Battle.MaxTicks,
		TickSeconds:   in.Config.Battle.TickSeconds,
		MaxStep:       in.Config.Battle.MaxStepPerTick,
		MaxUnitsPerSide: in.Config.Battle.MaxUnitsPerSide,
		ConfigVersion: in.Result.ConfigVersion,
	}
	for _, side := range []battle.Side{battle.SideA, battle.SideB} {
		i := sideIndex(side)
		sr := sideResult(in.Result, side)
		report.Sides[i] = SideReport{
			StartUnits:  sr.StartUnits,
			StartBodies: sr.StartBodies,
			Dead:        sr.Dead,
			Wounded:     sr.Wounded,
			AliveUnits:  sr.Standing,
			Broken:      sr.Broken,
			Routed:      sr.Routed,
		}
	}
	if vs := in.ScenarioRun(report); len(vs) > 0 {
		f.fail(RuleScenario, "the battle did not do what the scenario is for", vs)
		return
	}
	f.pass(RuleScenario, "the battle did what the scenario is for")
}

// loserOf is the side a winner beat.
func loserOf(k battle.ResultKind) battle.Side {
	if k == battle.ResultSideA {
		return battle.SideB
	}
	return battle.SideA
}

// sideResult returns a side's slice of the result.
//
// It looks the side up by name rather than indexing blindly, so a result whose
// side order was swapped is read correctly instead of read as side B's numbers
// under side A's name. An empty side comes back zeroed, which the checks above
// then fail loudly rather than quietly accepting.
func sideResult(res *battle.Result, side battle.Side) battle.SideResult {
	for _, sr := range res.Sides {
		if sr.Side == side {
			return sr
		}
	}
	return battle.SideResult{Side: side}
}

// bodyEpsilonOf is the slack allowed on a body count, in bodies, scaled to the
// size of the force it is comparing.
//
// A body count is a float because a unit stands for a configurable number of men
// and a destroyed unit's bodies are split between dead and wounded by
// battle.dead_share. The tolerance covers the rounding of that split and
// nothing else: it is a thousandth of a man per unit the side fielded, which no
// accounting error of the kind being looked for can hide inside.
func bodyEpsilonOf(startBodies float64) float64 { return math.Max(1e-6, startBodies*1e-6) }

// ratioEpsilon is the slack allowed on a strength or routed fraction.
const ratioEpsilon = 1e-6

// timeEpsilon is the slack allowed on elapsed simulated time, scaled by the tick
// length and the tick count because the engine accumulates it a tick at a time.
func timeEpsilon(tickSeconds float64, ticks int) float64 {
	return math.Max(1e-9, tickSeconds*float64(ticks)*1e-9)
}
