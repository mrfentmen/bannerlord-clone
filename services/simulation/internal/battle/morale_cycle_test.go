package battle

// The morale cycle, end to end: a unit breaks, it runs, and it comes back.
//
// SPEC.md section 5.2 asks for three things of this model and none of them is a
// number: one unit running takes its neighbours with him, a shaken line can be
// rallied rather than lost outright, and a rout is a state a man is IN rather than
// a switch he has thrown. Each of those has been argued for in this file's
// comments and each of them has been measured in one battle at a time. What had
// never been measured is the cycle itself in a battle that runs to a conclusion:
// whether a man who breaks also runs, whether a man who runs ever comes back, and
// whether a man who breaks can sit broken for the rest of the afternoon.
//
// The three tests below answer those from a Commander watching the whole field
// tick by tick. A Commander is used rather than the event log because the log says
// what happened and not for how long, and "how long" is the whole question here: a
// battle in which a man broke on tick 4 and was still broken on tick 1900 has a
// live livelock in it even though every event in it is correct.
//
// The three setups are the ones the verification suite already argues about, at
// the suite's own sizes, so nothing here is measured on a battle nobody else runs:
// an even fight, the morale shock, and the skirmishers matchup that was decided
// at range until morale_casualty_hit was swept.

import (
	"math"
	"testing"
)

// cycleWatch follows every unit's status for the whole of a battle and keeps the
// two things these tests need: the sequence of statuses each unit held, and the
// longest run of consecutive broken ticks any unit anywhere on the field spent.
//
// It writes no orders. Every UnitCommand it is handed is left untouched, so the
// battle it watches is the battle battle.Run produces, which is the same claim the
// verification harness's probe-neutral rule makes about its own probe.
type cycleWatch struct {
	last        []Status
	held        [][]Status
	brokenRun   []int
	maxBroken   int
	routedAt    []int
	routedEarly []float64
	routedLate  []float64
}

// cycleWindow is how a routed unit's distance from the enemy is sampled: the mean
// over the first earlyWindow ticks after it started running, and the mean over
// every tick from lateAfter onwards.
//
// The gap between the two windows matters. A routed unit that was still standing
// next to an enemy when it routed, and was next to him again two hundred ticks
// later, has not left the field; it has been left. Sampling both windows is what
// separates a man walking away from a man being walked back.
const (
	cycleEarlyTicks = 20
	cycleLateAfter  = 60
)

func (w *cycleWatch) Command(v *View) error {
	for i := range v.Units {
		u := &v.Units[i]
		if u.Status == StatusBroken {
			w.brokenRun[i]++
			if w.brokenRun[i] > w.maxBroken {
				w.maxBroken = w.brokenRun[i]
			}
		} else {
			w.brokenRun[i] = 0
		}
		if u.Status == StatusRouted {
			if w.last[i] != StatusRouted {
				w.routedAt[i] = v.Tick
			}
			if d, ok := nearestActableEnemy(v, i); ok {
				switch age := v.Tick - w.routedAt[i]; {
				case age < cycleEarlyTicks:
					w.routedEarly = append(w.routedEarly, d)
				case age >= cycleLateAfter:
					w.routedLate = append(w.routedLate, d)
				}
			}
		}
		if u.Status != w.last[i] {
			w.held[u.ID] = append(w.held[u.ID], u.Status)
			w.last[i] = u.Status
		}
	}
	return nil
}

// nearestActableEnemy is how far this unit is from the closest enemy the engine
// would let it fight, which is the distance that has to grow.
//
// Actable is the engine's own predicate, not a definition invented here: a
// destroyed, surrendered, or routed man is not a threat and a chased retreat is
// not a retreat from anything. Measuring against every unit on the other side
// would let a man appear to be leaving the field because the man following him had
// died.
func nearestActableEnemy(v *View, i int) (float64, bool) {
	best := math.Inf(1)
	found := false
	for j := range v.Units {
		o := &v.Units[j]
		if o.Side == v.Units[i].Side || !o.Status.Actable() {
			continue
		}
		found = true
		if d := math.Hypot(o.X-v.Units[i].X, o.Y-v.Units[i].Y); d < best {
			best = d
		}
	}
	return best, found
}

func mean(v []float64) float64 {
	if len(v) == 0 {
		return math.NaN()
	}
	total := 0.0
	for _, x := range v {
		total += x
	}
	return total / float64(len(v))
}

// cycleCases are the three setups, at the verification suite's sizes.
var cycleCases = []struct {
	name string
	a, b Roster
}{
	{"even fight 40v40", Roster{Units: 40}, Roster{Units: 40}},
	{"morale shock 30v30", Roster{Units: 30}, Roster{Units: 30, MoraleBias: -0.6}},
	{"skirmishers against heavies 40v40",
		Roster{Units: 40, AllRanged: true, SkillBias: 0.4, MoraleBias: 0.2, TroopsPerUnit: 2},
		Roster{Units: 40, NoRanged: true, SkillBias: -0.4, MoraleBias: -0.1, TroopsPerUnit: 6}},
}

// fightWithWatch runs one of the cycle cases with a watcher attached and returns
// the result and what the watcher saw.
func fightWithWatch(t *testing.T, c struct {
	name string
	a, b Roster
}) (*Result, *cycleWatch) {
	t.Helper()
	cfg := loadConfig(t)
	const seed = 20260930
	a, err := GenerateForce(cfg, seed, SideA, c.a)
	if err != nil {
		t.Fatalf("%s: side A: %v", c.name, err)
	}
	b, err := GenerateForce(cfg, seed, SideB, c.b)
	if err != nil {
		t.Fatalf("%s: side B: %v", c.name, err)
	}
	n := len(a) + len(b)
	leaders := LeaderCount(cfg, len(a))
	if other := LeaderCount(cfg, len(b)); other > leaders {
		leaders = other
	}
	setup := Setup{
		A: a, B: b,
		Leaders: append(
			GenerateLeaders(cfg, seed, SideA, leaders, cfg.Battle.MoraleLeaderInfluenceReference),
			GenerateLeaders(cfg, seed, SideB, leaders, cfg.Battle.MoraleLeaderInfluenceReference)...),
		Terrain: TerrainOpen,
		Label:   c.name,
	}
	w := &cycleWatch{
		last: make([]Status, n),
		held: make([][]Status, n),
	}
	for i := range w.last {
		w.last[i] = StatusFighting
	}
	w.brokenRun = make([]int, n)
	w.routedAt = make([]int, n)
	res, err := RunCommanded(cfg, seed, setup, w)
	if err != nil {
		t.Fatalf("%s: %v", c.name, err)
	}
	return res, w
}

// cycleCensus counts, per unit, how far it got through the cycle: it broke and
// stopped, it broke and ran, or it broke, ran, and came back.
func cycleCensus(w *cycleWatch) (broke, ran, fullCycle int) {
	for _, hist := range w.held {
		sawBreak, sawRun, sawBack := false, false, false
		for _, st := range hist {
			switch st {
			case StatusBroken:
				sawBreak = true
			case StatusRouted:
				sawRun = true
			case StatusFighting:
				// Fighting after a break or a run is a rally. The opening status is
				// never a transition, so the first entry cannot be one of these.
				if sawBreak || sawRun {
					sawBack = true
				}
			}
		}
		if !sawBreak {
			continue
		}
		broke++
		if sawRun {
			ran++
		}
		if sawRun && sawBack {
			fullCycle++
		}
	}
	return broke, ran, fullCycle
}

// TestBreakRoutRallyCycleHappens: the cycle is not three separate features that
// can each be on while the loop is broken. In every one of the three battles some
// man breaks, runs, and then fights again, and the order is that order rather than
// any other, because the watcher's transition list is read in the order it
// happened.
//
// The threshold is one unit, not a proportion. A model where nobody ever rallies
// still passes a rule that asks for a rally rate, and a model where nobody ever
// breaks still passes one that asks for breaks; asking for at least one complete
// cycle in each of three different battles is the smallest claim that cannot be
// satisfied by two of the three halves being dead.
//
// It failed on the shipped balance file until morale_casualty_hit was swept. Not
// because rallies stopped happening: they did not, 58 of them in the 50 a side
// reference battle. Because the battles were decided before most men got to
// break, so the population of men who could complete a cycle was tiny and the
// men who broke mostly ran and were never picked up.
func TestBreakRoutRallyCycleHappens(t *testing.T) {
	for _, c := range cycleCases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			res, w := fightWithWatch(t, c)
			broke, ran, full := cycleCensus(w)
			if broke == 0 {
				t.Fatalf("no unit broke in %d ticks; the morale model is inert", res.Ticks)
			}
			if ran == 0 {
				t.Errorf("%d units broke and none of them ran; a break that cannot become a rout is a "+
					"unit that stops advancing and nothing else", broke)
			}
			if full == 0 {
				t.Errorf("%d units broke, %d of them ran, and not one of them ever fought again; "+
					"battle.rally_chance and battle.rally_routed_chance are not reaching a routed man, so "+
					"one break in a battle is one man lost for the rest of it", broke, ran)
			}
			t.Logf("%d ticks, %d units broke, %d ran, %d broke and ran and came back",
				res.Ticks, broke, ran, full)
		})
	}
}

// TestRoutedUnitsLeaveTheField: a man who runs goes away. The distance from the
// closest enemy he could still have to fight with is sampled over the first twenty
// ticks after he starts running and again from sixty ticks on, and the second
// number has to be the larger one.
//
// This is the assertion that a rout is a spatial event and not only a morale one.
// The intent stage gives a routed unit rout_speed_scale and points it away from
// the nearest enemy, so a working rout means the field empties; a broken one means
// routed men keep standing where they broke, the melee stage keeps hitting them,
// and a battle can run out of ticks with men who are routed and still in the fight.
// Nothing else in the engine would say so: a routed unit's counters are all still
// true of it.
//
// The bound is a doubling, against measured gaps of four times or more, because
// the number is a mean over a population that includes men routed late in a battle
// they were already standing at the back of.
func TestRoutedUnitsLeaveTheField(t *testing.T) {
	for _, c := range cycleCases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			res, w := fightWithWatch(t, c)
			early, late := mean(w.routedEarly), mean(w.routedLate)
			if math.IsNaN(early) || math.IsNaN(late) {
				t.Fatalf("no routed unit was sampled (%d early samples, %d late); nothing to measure",
					len(w.routedEarly), len(w.routedLate))
			}
			if late <= early {
				t.Errorf("a routed unit's mean distance from the nearest enemy he could fight went from "+
					"%.1f m in the first %d ticks after he ran to %.1f m from tick %d on (%d early and %d late "+
					"samples); routed men are not leaving the field", early, cycleEarlyTicks, late,
					cycleLateAfter, len(w.routedEarly), len(w.routedLate))
			}
			if late < 2*early {
				t.Errorf("a routed unit's mean distance from the enemy went %.1f m -> %.1f m; he moved away, "+
					"but a man who has run should not still be within a hundred metres of the line he ran "+
					"from", early, late)
			}
			t.Logf("%d ticks: %d routed unit-ticks sampled in the first %d ticks and %d from tick %d on; "+
				"mean distance from the nearest enemy %.0f m then %.0f m", res.Ticks, len(w.routedEarly),
				cycleEarlyTicks, len(w.routedLate), cycleLateAfter, early, late)
		})
	}
}

// TestNoUnitStaysBroken: a break is a state a man is in for a few ticks, not one
// he is stuck in. The longest unbroken run of consecutive broken ticks anywhere
// on the field, for any unit, in any of the three battles, has to be short
// compared with the battle.
//
// This is the livelock check, and it is written as a bound rather than as "the
// battle ended" because the battle ending does not cover it. A battle that reaches
// its conclusion has a tick count, and a tick count says nothing about whether the
// men in it were moving. The bug this is for is described in this package's intent
// stage: a unit could be marked Broken with no way back to Fighting, could not be
// marked Routed either, and stayed actable at reduced morale until the tick bound
// returned a stalemate twenty thousand ticks later. A state with no exit does not
// show up in any result; it shows up as a run of ticks where nothing changes.
//
// The ceiling is forty ticks, which is ten seconds of simulated time and about
// seven times the worst run observed (six, four and four ticks in the three
// battles). It is loose on purpose: the claim being made is that broken is not a
// resting place, and forty ticks of a two thousand tick battle is not a resting
// place either.
func TestNoUnitStaysBroken(t *testing.T) {
	const brokenCeiling = 40
	for _, c := range cycleCases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			res, w := fightWithWatch(t, c)
			if res.Outcome.Kind == ResultDraw && res.Outcome.Reason == ReasonStalemate {
				t.Fatalf("the battle ran to the tick bound with nothing decided")
			}
			if w.maxBroken > brokenCeiling {
				t.Errorf("a unit was broken for %d consecutive ticks in a %d tick battle; broken is a "+
					"state a man is in until he runs or is picked up, and that is long enough to be a "+
					"place a man is stuck", w.maxBroken, res.Ticks)
			}
			broke, ran, full := cycleCensus(w)
			t.Logf("%d ticks (%s by %s): longest broken run %d ticks, ceiling %d; %d broke, %d ran, %d rallied",
				res.Ticks, res.Outcome.Kind, res.Outcome.Reason, w.maxBroken, brokenCeiling, broke, ran, full)
		})
	}
}
