package battle

import (
	"testing"

	"mbclone/simulation/internal/config"
)

// The surrender counter.
//
// COMBAT.md section 6 says routing troops run, and may surrender. The engine
// writes an event for every surrender, the result is supposed to carry the number
// of units that gave themselves up, and the two are supposed to agree. They did
// not, and nothing in the package noticed for the length of time a broken guard
// can hide in.
//
// The switch in commit that tallies breaks, routs and surrenders tested
// u.alive(), which asks whether the unit is on the field AFTER the change has
// been applied. A unit that surrenders is no longer on the field, so the only
// status the switch could not count was the one its surrender arm existed to
// count. b.stats.Surrendered was written by exactly one line of the whole
// engine, and that line was unreachable, so the field was a constant zero that
// printed confidently in every battle report and fed the result hash.
//
// The symptom was found by the units-accounted-for rule in the battleverify
// suite, and only there: a side's destroyed count is computed as
// StartUnits - Standing - Routed - Surrendered, so a surrender that never reached
// the result inflated the destroyed count by the same number and failed against
// the event log on both columns at once. The battle itself was sound. The report
// about it was not.
//
// These tests are the unit-level half of that. The verify suite needs a battle
// that happens to produce a surrender, which is a seed-dependent accident; this
// file produces one on demand, in two ticks, with no dice in the way.

// surrenderSetup is a force that is arranged to surrender: ten units a side, no
// leaders, and one unit of side A at zero morale.
//
// Only the morale stage runs (see the callers), so nothing can damage anything
// and the unit that is about to give itself up cannot be killed first. The two
// sides never move, and the roster starts them battle.roster_start_distance
// apart, which is more than battle.surrender_range, so the enemy is out of reach
// and the surrender is eligible. There is no leader, so there is nothing to rally
// it and the surrender is not a race.
func surrenderSetup(t testing.TB, cfg *config.Config, seed uint64) Setup {
	t.Helper()
	a, err := GenerateForce(cfg, seed, SideA, Roster{Units: 10})
	if err != nil {
		t.Fatalf("force A: %v", err)
	}
	b, err := GenerateForce(cfg, seed, SideB, Roster{Units: 10})
	if err != nil {
		t.Fatalf("force B: %v", err)
	}
	// Zero morale, which is the floor the balance file sets, and the only value
	// below which no amount of morale_recovery can lift a unit back over
	// morale_rout_threshold inside the two ticks this test runs. Any value under
	// the rout threshold would do, and the floor is the one that cannot drift
	// into failing as the recovery rate is tuned.
	a[0].Morale = 0
	return Setup{A: a, B: b, Terrain: TerrainOpen, Label: "one unit at the floor, no leaders"}
}

// surrenderConfig is a config in which an eligible routed unit always gives
// itself up.
//
// battle.surrender_chance is a chance because a surrender is an officer deciding
// to stop, and that is right for a battle. It is wrong for a test that is
// measuring whether the counter is reachable: with the chance at its shipped
// 0.30 the test would pass or fail on a coin. The number under test is the
// counter, so the dice are taken out of it.
//
// MaxTicks is short because nothing here is a fight: the battle cannot be
// decided, and a stalemate is a perfectly good way for it to end. Ten ticks is
// four times what the surrender needs.
func surrenderConfig(t testing.TB) *config.Config {
	t.Helper()
	cfg := copiedConfig(t)
	cfg.Battle.SurrenderChance = 1.0
	cfg.Battle.MaxTicks = 10
	return cfg
}

// TestSurrenderReachesTheResult is the bug, named: a surrender happens, the
// engine writes it down, and the result has to carry it.
func TestSurrenderReachesTheResult(t *testing.T) {
	cfg := surrenderConfig(t)
	const seed = 5150
	setup := surrenderSetup(t, cfg, seed)

	res, err := runWithStageOrder(cfg, seed, setup, []string{"morale"})
	if err != nil {
		t.Fatalf("battle: %v", err)
	}
	if res.EventsDropped > 0 {
		t.Fatalf("the event log dropped %d events, so the cross-check below cannot be trusted", res.EventsDropped)
	}

	logged := 0
	for _, e := range res.Events {
		if e.Kind == EventSurrendered {
			logged++
		}
	}
	if logged == 0 {
		t.Fatalf("no unit surrendered in %d ticks, so this test is not exercising the counter it exists "+
			"for; the setup or battle.surrender_chance has moved", res.Ticks)
	}
	a := res.Sides[SideA.index()]
	if a.Surrendered != logged {
		t.Fatalf("the event log holds %d surrenders and the result reports %d for side A. Every surrender "+
			"in the log is a unit that gave itself up, and the result is the number of those units",
			logged, a.Surrendered)
	}
	t.Logf("side A surrendered %d unit(s) in %d ticks, %g bodies; side B surrendered %d",
		a.Surrendered, res.Ticks, a.SurrenderedBodies, res.Sides[SideB.index()].Surrendered)
}

// TestSurrenderIsCountedOnceNotEveryTick guards the other direction.
//
// The counter tallies a status CHANGE, compared against the status the unit held
// at the top of the tick, so a unit is counted when it changes and not again
// while it holds. Getting that wrong is not a small error: commit skips
// surrendered units, so a unit that surrendered can never be counted a second
// time by a transition out of surrender, but a guard that tested anything other
// than the old status would count the surrender again on every later tick of the
// battle, and a long battle would report a surrender count in the thousands.
//
// Forty ticks is four times the bound this test's own config sets, so it does not
// depend on where the battle stops.
func TestSurrenderIsCountedOnceNotEveryTick(t *testing.T) {
	cfg := surrenderConfig(t)
	cfg.Battle.MaxTicks = 40
	const seed = 5150
	setup := surrenderSetup(t, cfg, seed)

	res, err := runWithStageOrder(cfg, seed, setup, []string{"morale"})
	if err != nil {
		t.Fatalf("battle: %v", err)
	}
	if res.EventsDropped > 0 {
		t.Fatalf("the event log dropped %d events, so the cross-check below cannot be trusted", res.EventsDropped)
	}

	logged := countKind(res.Events, EventSurrendered)
	for _, side := range sides {
		sr := res.Sides[side.index()]
		want := 0
		for _, e := range res.Events {
			if e.Kind == EventSurrendered && e.Side == side {
				want++
			}
		}
		if sr.Surrendered != want {
			t.Fatalf("side %s surrendered %d units over %d ticks and the result counts %d; a surrender is a "+
				"transition, not a state, so the two have to be the same number every time",
				side, want, res.Ticks, sr.Surrendered)
		}
	}
	if logged == 0 {
		t.Fatalf("no unit surrendered in %d ticks, so there is no tally to check", res.Ticks)
	}
	t.Logf("%d tick battle: %d surrender event(s), counted once each", res.Ticks, logged)
}

// TestDestroyedUnitIsNotACountedStatus is the case the old guard happened to
// cover by accident, and the reason the fix could not simply drop the guard.
//
// A unit destroyed in a tick is not on the field by the time the tally runs, and
// StatusDestroyed has no arm in the switch: destruction is counted by destroy(),
// which splits the bodies between dead and wounded and writes its own event. The
// tally counts decisions an officer made. If a destroyed unit were counted as a
// status change it would land in one of three counters it does not belong to, and
// the numbers would stop being decisions and start being corpses.
//
// The unit here enters the battle below battle.fatal_hp_fraction, which the setup
// allows (a unit may enter with any hit points above zero) and which commit
// destroys on the first tick, before it can break, rout, or do anything else.
func TestDestroyedUnitIsNotACountedStatus(t *testing.T) {
	cfg := surrenderConfig(t)
	const seed = 5151
	setup := surrenderSetup(t, cfg, seed)
	// A second, fresh unit of A, at full morale and a sliver of hit points.
	victim := Unit{
		ID:          0,
		Side:        SideA,
		Role:        RoleRanged,
		X:           setup.A[1].X,
		Y:           setup.A[1].Y,
		Troops:      setup.A[1].Troops,
		MaxHP:       setup.A[1].MaxHP,
		HP:          setup.A[1].MaxHP * cfg.Battle.FatalHPFraction * 0.5,
		Morale:      1,
		Speed:       setup.A[1].Speed,
		Ammo:        setup.A[1].Ammo,
		MeleeSkill:  setup.A[1].MeleeSkill,
		RangedSkill: setup.A[1].RangedSkill,
		Weapon:      setup.A[1].Weapon,
	}
	setup.A = append(setup.A, victim)

	res, err := runWithStageOrder(cfg, seed, setup, []string{"morale"})
	if err != nil {
		t.Fatalf("battle: %v", err)
	}
	if res.EventsDropped > 0 {
		t.Fatalf("the event log dropped %d events, so the cross-check below cannot be trusted", res.EventsDropped)
	}
	destroyed := countKind(res.Events, EventDestroyed)
	if destroyed != 1 {
		t.Fatalf("expected the sliver-of-hit-points unit to be destroyed on the first tick and nothing else to "+
			"die, but the log holds %d destructions", destroyed)
	}
	a := res.Sides[SideA.index()]
	// 11 units started. One surrendered, one was destroyed, the rest are on the
	// field. The three status counters have to say so, and the destroyed column
	// is what is left over.
	if got := a.StartUnits - a.Standing - a.Routed - a.Surrendered; got != destroyed {
		t.Fatalf("side A started with %d units, reports %d standing, %d routed and %d surrendered, which "+
			"leaves %d destroyed; the log holds %d",
			a.StartUnits, a.Standing, a.Routed, a.Surrendered, got, destroyed)
	}
	t.Logf("side A: %d units, %d standing, %d routed, %d surrendered, %d destroyed in the log",
		a.StartUnits, a.Standing, a.Routed, a.Surrendered, destroyed)
}

// surrenderedBodiesFromLog adds up the bodies behind the surrender events on one
// side, by looking each named unit up in the setup that produced the battle.
//
// It cannot use the event's own Value: a surrender event's Value is
// battle.surrender_morale_report, which is the morale the unit would have held,
// not how many men it stood for, and the body count is only in the human-readable
// Note. Reading the note would be a measurement of a sentence. The event does
// carry the unit's id and side, and the roster's ids are dense and ascending per
// side, so the body count is recoverable from the setup without parsing anything.
func surrenderedBodiesFromLog(setup Setup, res *Result, side Side) (bodies float64, units int) {
	in := setup.A
	base := 0
	if side == SideB {
		in, base = setup.B, len(setup.A)
	}
	for _, e := range res.Events {
		if e.Kind != EventSurrendered || e.Side != side {
			continue
		}
		i := e.Unit - base
		if i < 0 || i >= len(in) {
			continue
		}
		bodies += in[i].Troops
		units++
	}
	return bodies, units
}

// TestSurrenderedBodiesArePrisoners is task 99's engine half, and it is about
// what a prisoner IS rather than about where the number is written down.
//
// The campaign layer has a prisoner count and nothing has ever put a field
// battle's surrenders into it: internal/autoresolve computes prisoners from a
// paper battle's routed survivors, internal/writeback reads that, and no code
// outside internal/battle consumes battle.Result at all. So a battle that was
// really fought has its surrenders sitting in SurrenderedBodies with no named
// route to a prisoner count, and the obvious place for somebody to reach for is
// the loser's casualties, which would be wrong in three separate ways: dead men
// are not prisoners, wounded men are not in the winner's hands either, and a
// routed man is alive and unaccounted for.
//
// So the claim is pinned here, on the number that is actually the right one:
//
//   - A surrendered unit's bodies are prisoners, and PrisonersTakenBy reports
//     them.
//   - A destroyed unit's bodies are not, and the loser's Dead and Wounded are
//     not folded in.
//   - A unit that surrendered is counted once, which is the guarantee
//     TestSurrenderIsCountedOnceNotEveryTick makes about the unit count and this
//     one needs for the body count.
//
// The last row is the one that would bite. SurrenderedBodies is assembled in the
// result from each surrendered unit's Troops, and a surrender does not remove the
// bodies, so a counter that tallied every surrendered unit on every tick of a
// thousand-tick battle would report thousands of prisoners and nothing would say
// so.
func TestSurrenderedBodiesArePrisoners(t *testing.T) {
	cfg := surrenderConfig(t)
	const seed = 5150
	setup := surrenderSetup(t, cfg, seed)

	res, err := runWithStageOrder(cfg, seed, setup, []string{"morale"})
	if err != nil {
		t.Fatalf("battle: %v", err)
	}
	bodies, logged := surrenderedBodiesFromLog(setup, res, SideA)
	if logged == 0 {
		t.Fatalf("no unit surrendered in %d ticks; this test measures the prisoner count of a surrender "+
			"and there was not one", res.Ticks)
	}
	// The same number arrived at from the log and from the result. That is the
	// claim: a prisoner is a body that gave itself up, and this is how many bodies
	// that was.
	if got := res.PrisonersTakenBy(SideA); got != bodies {
		t.Errorf("the event log holds %d surrendered units worth %.0f bodies and PrisonersTakenBy(A) is "+
			"%.0f; a surrendered body is a prisoner, so these are the same number",
			logged, bodies, got)
	}
	// The other side took none, because it did not itself surrender. Asking the
	// question both ways is the whole point of a per-side accessor.
	if got := res.PrisonersTakenBy(SideB); got != 0 {
		t.Errorf("side B is holding %.0f prisoners; nothing on side B surrendered", got)
	}
	if got := res.PrisonersTaken(); got != [2]float64{bodies, 0} {
		t.Errorf("PrisonersTaken is %v, want [%g 0]", got, bodies)
	}
	// And the casualties are NOT folded in, which is the failure this accessor
	// exists to prevent. In this setup nothing is damaged at all, so the honest
	// assertion is that a battle with casualties and no surrender yields no
	// prisoners: the number has to come from the right column.
	a := res.Sides[SideA.index()]
	if a.Dead > 0 || a.Wounded > 0 {
		t.Errorf("this setup runs only the morale stage, so nothing should be damaged, and side A reports "+
			"%.0f dead and %.0f wounded; the prisoner count cannot be checked against a battle that also "+
			"had casualties while side A surrendered", a.Dead, a.Wounded)
	}
	if a.SurrenderedBodies > a.StartBodies {
		t.Errorf("side A is holding %.0f prisoners out of the %.0f bodies it started with",
			a.SurrenderedBodies, a.StartBodies)
	}
	t.Logf("side A gave up %d unit(s) and %g bodies; prisoners taken %v; side A casualties %.0f dead / %.0f wounded",
		logged, bodies, res.PrisonersTaken(), a.Dead, a.Wounded)
}

// TestPrisonersAreCountedOnceOverALongBattle is the body-count half of the same
// guarantee the unit count already has.
//
// TestSurrenderIsCountedOnceNotEveryTick proves a surrendered UNIT is counted
// once. This proves the BODIES behind it are, which is a separate loop in
// result.go and would survive the first guard being right. The run is long on
// purpose: forty ticks is four times what the surrender needs, which is long
// enough for a counter that is wrong to be wrong once and not enough for it to
// look catastrophic.
func TestPrisonersAreCountedOnceOverALongBattle(t *testing.T) {
	cfg := surrenderConfig(t)
	cfg.Battle.MaxTicks = 200 // twenty times the bound the setup needs
	const seed = 5150
	setup := surrenderSetup(t, cfg, seed)

	res, err := runWithStageOrder(cfg, seed, setup, []string{"morale"})
	if err != nil {
		t.Fatalf("battle: %v", err)
	}
	bodies, units := surrenderedBodiesFromLog(setup, res, SideA)
	got := res.PrisonersTakenBy(SideA)
	if got != bodies {
		t.Errorf("over %d ticks side A surrendered %d units worth %.0f bodies, and the result says %.0f "+
			"prisoners; a surrender is a man giving himself up once, and the same man is not a fresh "+
			"prisoner on each of the %d ticks he spends off the field", res.Ticks, units, bodies, got, res.Ticks)
	}
	t.Logf("%d ticks: %d surrendered units, %.0f bodies, %.0f prisoners", res.Ticks, units, bodies, got)
}

// TestPrisonersAreTheSurrenderedColumnAndNotAnother pins the projection itself,
// because the first two tests can only check it on a battle with no casualties in
// it and this accessor is the one thing standing between a surrender count and a
// casualty count.
//
// A Result is built by hand here with every loser's column carrying a different
// number, so any of the three wrong answers is a different wrong number and the
// test says which one it got. It is a synthetic result rather than a battle
// because the property is about which field is read, and a battle that both
// surrenders and takes heavy casualties is a seed-dependent accident.
func TestPrisonersAreTheSurrenderedColumnAndNotAnother(t *testing.T) {
	res := &Result{Sides: [2]SideResult{
		{
			Side: SideA, StartBodies: 100,
			Dead: 31, Wounded: 27, SurrenderedBodies: 19,
			Surrendered: 3, Routed: 12, Standing: 5, StrengthEnd: 44,
		},
		{
			Side: SideB, StartBodies: 100,
			Dead: 20, Wounded: 22, SurrenderedBodies: 7,
			Surrendered: 1, Routed: 4, Standing: 9, StrengthEnd: 61,
		},
	}}
	if got, want := res.PrisonersTakenBy(SideA), 19.0; got != want {
		t.Errorf("PrisonersTakenBy(A) is %g, want %g: it must be the surrendered bodies and nothing else, "+
			"not the dead (31), not the wounded (27), not the dead plus the wounded (58), and not the "+
			"routed (12), which are alive and unaccounted for", got, want)
	}
	if got, want := res.PrisonersTakenBy(SideB), 7.0; got != want {
		t.Errorf("PrisonersTakenBy(B) is %g, want %g", got, want)
	}
	if got, want := res.PrisonersTaken(), [2]float64{19, 7}; got != want {
		t.Errorf("PrisonersTaken is %v, want %v", got, want)
	}
	// The prisoner's own count has to be inside the population it came out of, or
	// the number is a sum of something else.
	a := res.Sides[0]
	if a.SurrenderedBodies > a.StartBodies {
		t.Errorf("%g prisoners out of %g bodies is not a surrender count", a.SurrenderedBodies, a.StartBodies)
	}
}
