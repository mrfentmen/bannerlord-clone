package battle

// This file is the regression suite for the two defects that made every battle
// on this branch end at a fraction of a percent of casualties, decided by
// arithmetic rather than by fighting:
//
//  1. The local balance term had no deadband, so a formation one man off parity
//     lost morale at a rate that integrated over a battle.
//  2. The casualty term counted BODIES rather than a share of the local weight,
//     and a dead unit stays in the spatial hash for the rest of the battle, so
//     one man dying cost 0.85 morale a tick to every unit within
//     morale_neighbourhood, for the rest of the fight.
//  3. The panic term subtracted without limit, so a contagion had a gain but no
//     fixed point and emptied a field in sixteen ticks.
//
// The three shape functions are tested as pure functions, because that is where
// the defect was and a table is the honest way to pin a shape. The last test is
// the end-to-end one: an even battle at a fixed small size that has to be
// decided by casualties. It failed on every one of the three defects and passes
// on none of the workarounds, which is the point of a regression test.

import (
	"math"
	"testing"
	"time"
)

// TestCasualtySeenIsAShareNotACount: the same single dead body costs less
// morale when the unit that sees it has more men alive around it, and costs the
// same whatever a body is worth.
//
// The second half is the scale coupling a count cannot escape. The engine's unit
// of morale accounting is a squad, battle.roster_troops_per_unit bodies wide, so
// a count term makes the same death worth ten times as much in a squad-based
// force as in a per-man one, and nothing in the file says which is which.
func TestCasualtySeenIsAShareNotACount(t *testing.T) {
	cfg := copiedConfig(t)
	c := cfg.Battle
	dt := c.TickSeconds
	// One body down, seen at full reach. It is a LOSS, so it is negative, and
	// it is smaller in a crowd than alone.
	one := casualtySeen(1, 20, 0, 0, &c, dt)
	// The same body, in a crowd of five instead of twenty.
	few := casualtySeen(1, 5, 0, 0, &c, dt)
	// The same body again, surrounded by nobody at all.
	alone := casualtySeen(1, 1, 0, 0, &c, dt)

	if !(one < 0 && few < one && alone < few) {
		t.Fatalf("one body down should cost less in a crowd than alone, got %g in twenty, %g in five, "+
			"%g alone", one, few, alone)
	}
	// The ratios are the whole claim: 1/20, 1/5, 1/1 of the local weight.
	for _, tc := range []struct {
		name  string
		got   float64
		share float64
	}{
		{"in twenty", one, 0.05},
		{"in five", few, 0.2},
		{"alone", alone, 1},
	} {
		want := -c.MoraleCasualtyHit * tc.share * dt
		if math.Abs(tc.got-want) > 1e-12 {
			t.Errorf("%s: got %g, want %g (morale_casualty_hit %g x share %g x tick %g)",
				tc.name, tc.got, want, c.MoraleCasualtyHit, tc.share, dt)
		}
	}
	// Bounded: no arrangement of dead men can cost more than the constant times
	// the tick, which is a neighbourhood wiped out. This is the property the
	// count form could not have at any value of the constant.
	max := c.MoraleCasualtyHit * dt
	for _, tc := range []struct {
		name                 string
		friendDead, ownTotal float64
		enemyDead, enemyTot  float64
	}{
		{"one in a crowd of two", 1, 2, 0, 0},
		{"one hundred bodies alone", 100, 100, 0, 0},
		{"a whole squad of ten", 10, 10, 0, 0},
		{"a thousand dead, one living", 1000, 1001, 0, 0},
		{"both sides wiped out", 10, 10, 10, 10},
	} {
		got := math.Abs(casualtySeen(tc.friendDead, tc.ownTotal, tc.enemyDead, tc.enemyTot, &c, dt))
		if got > max+1e-12 {
			t.Errorf("%s cost %g, over the %g ceiling; the term is not bounded", tc.name, got, max)
		}
	}
	// Squad size invariance, stated as a comparison rather than a claim: the
	// same fraction of the local weight dead costs the same whether a body is
	// one man or ten.
	perMan := casualtySeen(10, 200, 0, 0, &c, dt) // 10 bodies, 200 total
	perSquad := casualtySeen(1, 20, 0, 0, &c, dt) // one squad of ten, 2 squads
	if math.Abs(perMan-perSquad) > 1e-12 {
		t.Errorf("ten single men down out of two hundred cost %g but one squad of ten out of twenty "+
			"cost %g; the term still scales with how many men a body is worth", perMan, perSquad)
	}
	// And it pays both ways: an enemy falling near you heartens you by the same
	// constant, at the same share.
	foe := casualtySeen(0, 0, 1, 20, &c, dt)
	if math.Abs(foe+one) > 1e-12 {
		t.Errorf("an enemy body down was worth %g and a friendly one %g; a man watching his side win and "+
			"a man watching it lose must feel the same size of thing", foe, one)
	}
	t.Logf("one body down costs %.4f in a crowd of twenty, %.4f in five, %.4f alone; ceiling %.4f",
		one, few, alone, max)
}

// TestPanicPullStopsAtItsFloor: the contagion has a fixed point. A man who can
// see his whole side running is pulled toward battle.morale_panic_floor and
// never past it by this term, and the pull weakens as he gets closer, so the
// last man to hold is holding against nothing at all.
func TestPanicPullStopsAtItsFloor(t *testing.T) {
	cfg := copiedConfig(t)
	c := cfg.Battle
	dt := c.TickSeconds

	// Nothing running, nothing charged. A share of zero is not a small panic,
	// it is no panic.
	if got := panicPull(1, 0, &c, dt); got != 0 {
		t.Errorf("panicPull charged %g with nothing running nearby", got)
	}
	// A man already at or below the floor is charged nothing at all: the floor
	// is the floor, and what takes a man below it is a bullet, not a neighbour.
	for _, m := range []float64{c.MoralePanicFloor, c.MoralePanicFloor - 0.05, 0} {
		if got := panicPull(m, 1, &c, dt); got != 0 {
			t.Errorf("panicPull charged %g to a man at morale %g, which is at or below the floor %g",
				got, m, c.MoralePanicFloor)
		}
	}
	// Monotone in the share of his own side that is running, and never positive.
	prev := 0.0
	for _, share := range []float64{0.1, 0.25, 0.5, 0.75, 1} {
		got := panicPull(1, share, &c, dt)
		if got > 0 {
			t.Errorf("panicPull at share %g returned %g, which is a gain", share, got)
		}
		if got > prev+1e-12 {
			t.Errorf("panicPull at share %g (%g) is a smaller cost than at the share before it (%g)",
				share, got, prev)
		}
		prev = got
	}
	// The gain of the feedback loop. A man sees share s running and loses
	// spread*s*gap*dt; the new share is (s + one man)/(own + one man). The loop
	// must not be able to run away, which is the property the count form lost,
	// and the way to say that without simulating a battle is to integrate the
	// pull from a full-morale man with EVERYTHING running and show where it
	// stops. The number worth having is how long he holds before he runs, and
	// it is measured to the rout threshold rather than to the floor: the floor
	// is approached asymptotically and takes as long as it takes.
	m := 1.0
	steps := 0
	for m > c.MoraleRoutThreshold && steps < 100000 {
		m += panicPull(m, 1, &c, dt)
		steps++
	}
	if m > c.MoraleRoutThreshold {
		t.Errorf("a man with his whole neighbourhood running was still at morale %g after %d ticks, "+
			"above the rout threshold %g; the contagion can never tip anybody over the edge",
			m, steps, c.MoraleRoutThreshold)
	}
	// Below the floor, never. This is the property the flat subtraction lost: it
	// drove morale to zero, because nothing stopped it, so a routed man was a
	// man with no morale left rather than a frightened one.
	below := m
	for i := 0; i < 1000; i++ {
		below += panicPull(below, 1, &c, dt)
	}
	if below < c.MoralePanicFloor-1e-9 {
		t.Errorf("a man with his whole neighbourhood running fell to morale %g, below the floor %g, "+
			"after crossing the rout threshold; the pull is not a pull", below, c.MoralePanicFloor)
	}
	// And he has to be able to be tipped: the floor is below the rout threshold,
	// so crossing it is a real transition. Configuration validation enforces
	// the same relation, and this is the engine's half of the claim.
	if c.MoralePanicFloor >= c.MoraleRoutThreshold {
		t.Errorf("the floor %g is not below the rout threshold %g, so panic alone can never route "+
			"anybody", c.MoralePanicFloor, c.MoraleRoutThreshold)
	}
	t.Logf("full-share panic takes a man from 1.000 to the rout threshold in %d ticks (%.1f s) and "+
		"then settles at %.4f, above the floor %.2f; rout is at %.2f",
		steps, float64(steps)*dt, below, c.MoralePanicFloor, c.MoraleRoutThreshold)
}

// TestRatioImbalanceHasADeadband: the local balance term costs nothing for a
// formation that is not being outnumbered, and everything for one that is.
func TestRatioImbalanceHasADeadband(t *testing.T) {
	cfg := copiedConfig(t)
	c := cfg.Battle
	band := c.MoraleRatioDeadband
	neutral := c.MoraleRatioNeutral

	// Parity, and everything inside the band, is free.
	for _, share := range []float64{neutral, neutral + band*0.5, neutral - band*0.5} {
		if got := ratioImbalance(share, &c); got != 0 {
			t.Errorf("a local share of %g is inside the deadband of %g and cost %g", share, band, got)
		}
	}
	// Just outside the band it costs almost nothing, and it costs in the right
	// direction: an advantage lifts, a disadvantage drops.
	justOut := ratioImbalance(neutral+band+1e-6, &c)
	if !(justOut > 0 && justOut < 1e-5) {
		t.Errorf("just outside the band the term returned %g, want a small positive number", justOut)
	}
	if got := ratioImbalance(neutral-band-1e-6, &c); got >= 0 {
		t.Errorf("a formation just outnumbered returned %g, want a small negative number", got)
	}
	// Surrounded is the full distance: the extreme share is 0 of my own side's
	// weight against all of theirs, and the term is the whole way there.
	surrounded := ratioImbalance(0, &c)
	want := -(neutral - band)
	if math.Abs(surrounded-want) > 1e-9 {
		t.Errorf("a formation with nothing of its own side in reach scored %g, want %g", surrounded, want)
	}
	// The weight is what makes it bite: at the shipped pair, being surrounded
	// costs ratio_weight*(neutral-band)*dt a tick.
	perTick := c.MoraleRatioWeight * math.Abs(surrounded) * c.TickSeconds
	if perTick < 0.05 || perTick > 0.5 {
		t.Errorf("being surrounded costs %g morale a tick, which is outside the band a fight should "+
			"produce; a man at 3:1 local odds should have seconds, not fractions of a second", perTick)
	}
	t.Logf("deadband %g around neutral %g; surrounded costs %g a tick and takes %.1f s to break a "+
		"steady man", band, neutral, perTick, (1-c.MoraleBreakThreshold)/perTick*c.TickSeconds)
}

// TestEvenForcesFightToCasualties is the end-to-end regression. Two equal forces
// of forty a side, run to a conclusion, have to lose men: not a twentieth of one
// side in three hundred ticks while the other side runs away, but a real share
// of both sides over a real fight.
//
// Every one of the three defects this file covers fails it, and so does the
// "fix" of scaling the morale constants down until the battle lasts, because
// that produces a battle where nobody is ever frightened either. What it does
// not accept is a battle that is decided without a fight.
func TestEvenForcesFightToCasualties(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 40
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("force: %v", err)
	}
	wall := time.Now()
	res, err := Run(cfg, seed, setup)
	if err != nil {
		t.Fatalf("a %d v %d battle failed: %v", n, n, err)
	}
	took := time.Since(wall)
	t.Logf("%d v %d: %d ticks, %s, %s (%s), wall %s, swings %.0f, shots %.0f",
		n, n, res.Ticks, time.Duration(res.Elapsed*float64(time.Second)).Round(time.Millisecond),
		res.Outcome.Kind, res.Outcome.Reason, took.Round(time.Millisecond),
		res.Sides[0].Swings+res.Sides[1].Swings, res.Sides[0].Shots+res.Sides[1].Shots)
	for _, s := range res.Sides {
		t.Logf("  side %s: dead %.0f wounded %.0f of %.0f bodies (%.1f%%), %d standing %d broken %d routed, "+
			"morale %.3f -> %.3f", s.Side, s.Dead, s.Wounded, s.StartBodies,
			100*(s.Dead+s.Wounded)/s.StartBodies, s.Standing, s.Broken, s.Routed,
			s.MoraleStart, s.MoraleEnd)
	}

	if res.Outcome.Kind == ResultDraw && res.Outcome.Reason == ReasonStalemate {
		t.Fatalf("a %d v %d battle ran to the tick bound with nothing decided", n, n)
	}
	// Both sides have to have been hit. The old code put one side at 0.0% and
	// the other at 2.0%, which is a parade, not a battle.
	for _, s := range res.Sides {
		lost := s.Dead + s.Wounded
		share := lost / s.StartBodies
		if share < 0.15 {
			t.Errorf("side %s lost %.1f%% of its bodies; a %d a side field battle decided at %.1f%% of "+
				"casualties is not a battle", s.Side, 100*share, n, 100*share)
		}
	}
	// And it has to have outlasted the approach. The time for two closing
	// columns to reach a swing is start_distance/2 at the approach speed, and it
	// is computed from the file rather than written down, because it is the
	// file's number and moves when the file moves. A battle decided sooner than
	// that ended before the armies touched, which is its own class of bug: the
	// casualty term used to do exactly this, deciding a 500 v 500 fight 260
	// ticks in, ninety ticks before contact.
	approach := cfg.Battle.RosterStartDistance / 2 / cfg.Battle.RosterSpeedBase / cfg.Battle.TickSeconds
	if float64(res.Ticks) <= approach {
		t.Errorf("a %d v %d battle was decided in %d ticks, but the columns need %.0f ticks to reach a "+
			"swing at the shipped start distance and approach speed; this ended before the armies met",
			n, n, res.Ticks, approach)
	}
	// A battle that never frightens anybody is not a battle either: the morale
	// model has to be live, or the fix was to switch it off.
	if res.Stats.Breaks == 0 {
		t.Errorf("no unit ever broke in %d ticks; morale is inert, so nothing was decided by fear "+
			"either", res.Ticks)
	}
	if res.Stats.PeakSuppression <= 0 {
		t.Errorf("no unit was ever suppressed; the fire did nothing")
	}
}

// TestCasualtyTermStaysBoundedAtTheStage: the casualty term's own side is a SHARE
// of the local weight, and the bound that goes with it has to hold where the term
// is actually called, not only in the shape function.
//
// WHY THIS IS NOT TestCasualtySeenIsAShareNotACount AGAIN: that test pins
// casualtySeen, and casualtySeen was never wrong. It divides by whatever total it
// is handed. The caller was wrong: it passed friendly+routed, the LIVING weight of
// its own side, as the denominator for its own side's dead, and passed
// enemy+enemyDead, the TOTAL weight, for the enemy's. So the two halves of the
// difference were not the same kind of quantity, and the own half was a RATIO of
// dead to living rather than a share of the dead among the dead and the living.
// That ratio has no upper bound at all. Ninety bodies down against one man
// watching is a ratio of 90 where the share is 90/91, and the price of a
// neighbour dying rose without limit as the men who could still see him ran out.
//
// The pure-function test could not see it, because it computed its expectations
// from the same convention the caller used. This one reads the stage's own
// arithmetic: the same battle twice, once with a neighbourhood of dead beside the
// unit and once without, so the difference between the two ticks is the casualty
// term and every other term cancels.
//
// Measured on the skirmishers scenario, where the share that reaches the term is
// about a ninth, the caller charged -0.104 morale a tick at a constant of 3.4,
// which is 0.42 a second, from a battle in which no two men had yet reached a
// blow's reach. It is the same unbounded-subtraction defect as the two already
// fixed in this file, reached by the remaining road: the term whose job is to be
// bounded is bounded only if every caller passes it a total.
func TestCasualtyTermStaysBoundedAtTheStage(t *testing.T) {
	cfg := copiedConfig(t)
	c := cfg.Battle
	dt := c.TickSeconds
	ceiling := c.MoraleCasualtyHit * dt

	// One tick of morale on a watching unit, for a neighbourhood with deadUnits
	// destroyed units of ten bodies beside it. Everything else about the two runs
	// is identical: one living enemy inside morale_neighbourhood, so the ratio
	// term fires at the same rate in both and cancels in the difference, no
	// leaders, no suppression, nothing routed.
	watched := func(t *testing.T, deadUnits int) float64 {
		t.Helper()
		const ten = 10
		a := []Unit{{Side: SideA, Role: RoleMelee, HP: 100, MaxHP: 100, Morale: 0.5,
			Speed: 0, Troops: 1, Status: StatusFighting}}
		for i := 0; i < deadUnits; i++ {
			a = append(a, Unit{Side: SideA, Role: RoleMelee, HP: 100, MaxHP: 100, Morale: 0,
				Speed: 0, Troops: ten, Status: StatusFighting})
		}
		b := []Unit{{Side: SideB, Role: RoleMelee, HP: 100, MaxHP: 100, Morale: 0.5,
			Speed: 0, Troops: 10, Status: StatusFighting}}
		bt, err := newBattle(cfg, 20260930, Setup{A: a, B: b, Terrain: TerrainOpen, Label: "casualty bound"})
		if err != nil {
			t.Fatalf("building the battle failed: %v", err)
		}
		// newBattle lays a roster out, so the positions a test needs are set
		// after it: the watcher at the origin, the dead beside it well inside
		// battle.morale_neighbourhood, and the enemy inside the neighbourhood as
		// well so that the recovery term stays off.
		bt.units[0].X, bt.units[0].Y = 0, 0
		last := len(bt.units) - 1
		// The enemy stands two neighbourhoods off, so the local balance term has
		// no enemy to read and is off in both runs. That term answers how much of
		// the enemy is here, and the enemy is not here: this test is about the
		// dead, and the one term that reads the living has to be identical in both
		// runs for the difference between them to be the casualty term alone.
		bt.units[last].X, bt.units[last].Y = c.MoraleNeighbourhood*2, 0
		for i := 1; i < last; i++ {
			// The dead are packed into a square metre beside the watcher, which is
			// what a volley into the same place leaves. It also keeps every one of
			// them at effectively full reach, so the share is the share the
			// arithmetic is about rather than a reach-weighted average of it.
			bt.units[i].X = float64(i%3) * 0.01
			bt.units[i].Y = float64(i/3) * 0.01
		}
		// The neighbours are killed rather than declared dead at construction,
		// because a roster that opens with a corpse is refused, which is the right
		// refusal: a battle begins with everyone alive.
		for i := 1; i < last; i++ {
			bt.destroy(bt.units[i])
		}
		if err := bt.beginTick(); err != nil {
			t.Fatalf("beginTick: %v", err)
		}
		bt.stageMorale()
		return bt.deltas[0].Morale
	}

	const dead = 9 // nine units of ten bodies: ninety bodies down against one man watching
	clean := watched(t, 0)
	grieving := watched(t, dead)
	cost := clean - grieving

	// Every man in the neighbourhood but one is down, so the share of the local
	// weight of its own side that is dead is 90/91 of it, and the term is worth
	// that share of the constant. It is a cost: the neighbours died.
	share := 90.0 / 91.0
	want := c.MoraleCasualtyHit * share * dt
	if math.Abs(cost-want) > 1e-3 {
		t.Errorf("a neighbourhood with %.0f bodies down against %.0f alive cost %.6f morale a tick; a share "+
			"of %.6f at morale_casualty_hit %g and tick %g is %.6f. The stage is dividing its own side's dead by "+
			"something that is not the whole of its own side", dead*10.0, 1.0, cost, share, c.MoraleCasualtyHit, dt, want)
	}
	// And the bound, stated as a property rather than recomputed: nothing a
	// formation can lose can cost more than the constant times the tick, which is
	// a neighbourhood wiped out. This is the assertion the old caller failed, and
	// it failed it by a factor of a hundred and twenty: the same state charged
	// 29.995 a tick against a ceiling of 0.25.
	if math.Abs(cost) > ceiling+1e-9 {
		t.Errorf("the casualty term cost %.6f a tick against a ceiling of %.6f (morale_casualty_hit %g x tick "+
			"%g); the term is unbounded again", math.Abs(cost), ceiling, c.MoraleCasualtyHit, dt)
	}
	// The witness has to be a real fight: dead men beside a living man have to
	// cost him something, or the bound is being satisfied by a term that does
	// nothing at all.
	if !(cost > 0) {
		t.Errorf("watching %.0f bodies fall beside it cost %.6f morale; nothing is reading the dead",
			dead*10.0, cost)
	}
	t.Logf("a neighbourhood with %d bodies down against 1 alive cost %.6f a tick; ceiling %.6f; clean tick %.6f",
		dead*10, cost, ceiling, clean)
}
