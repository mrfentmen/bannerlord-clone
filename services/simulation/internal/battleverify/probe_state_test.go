package battleverify

// The two per-tick checks that ask about DIRECTION rather than about bounds.
//
// Every other per-tick rule in this package asks whether a number is inside a
// range. Two of the invariants the brief names cannot be phrased that way, and
// both were unmeasured until now:
//
//   - No resurrected units. A destroyed or surrendered unit that came back would
//     keep its id, its side, and its place in the roster count, so the roster rule
//     would pass it, and its hit point fraction would be somewhere inside 0 to 1,
//     so the hit point rule would pass it too. Both rules were reporting a pass
//     about a walking corpse.
//   - No negative casualties, which is a range check that exists, and whose
//     companion is that hit points only ever fall. Nothing in this engine raises a
//     unit's hit points: there is no medicine in the battle layer, no morale
//     mechanic that heals, and no mechanic of any kind that writes HP upward. An
//     increase is therefore either a resurrection or a bookkeeping fault, and both
//     hide inside the bounds.
//
// The tests below are two halves each: the check has to fire on the fault, and it
// has to stay silent on every transition this engine really does make. The second
// half is the one that decides whether a rule is worth having, because a
// resurrection check that also fires on a routed man coming back is a check that
// will be switched off after its first false alarm.

import (
	"strings"
	"testing"

	"mbclone/simulation/internal/battle"
)

// hpView builds a published tick for one unit per side, both at a fixed position,
// with the hit point fractions and statuses the caller names.
//
// The positions do not move because none of these rules is about movement, and a
// moving field would put the no-teleport rule into the log and make every
// assertion about one rule have to exclude the others.
func hpView(tick int, hpA, hpB float64, stA, stB battle.Status) *battle.View {
	v := &battle.View{Tick: tick, TickSeconds: 0.25, Strength: [2]float64{100, 100},
		Opening: [2]float64{100, 100}}
	v.Units = append(v.Units,
		battle.UnitView{ID: 0, Side: battle.SideA, Status: stA, X: -20, Y: 0,
			HPFrac: hpA, Morale: 0.5, Troops: 10, Speed: 1.4, Ammo: 0},
		battle.UnitView{ID: 1, Side: battle.SideB, Status: stB, X: 20, Y: 0,
			HPFrac: hpB, Morale: 0.5, Troops: 10, Speed: 1.4, Ammo: 0})
	return v
}

// TestProbeCatchesHitPointsThatRise is the first half: a hit point fraction that
// goes up between two published ticks is recorded under the hit points rule.
func TestProbeCatchesHitPointsThatRise(t *testing.T) {
	_, p := probeFor(t, 1, 1)
	for _, v := range []*battle.View{
		hpView(0, 0.80, 0.80, battle.StatusFighting, battle.StatusFighting),
		hpView(1, 0.80, 0.80, battle.StatusFighting, battle.StatusFighting),
		hpView(2, 0.84, 0.80, battle.StatusFighting, battle.StatusFighting),
	} {
		if err := p.Command(v); err != nil {
			t.Fatalf("the probe refused a view: %v", err)
		}
	}
	if n := p.log.count(RuleHitPoints); n != 1 {
		t.Fatalf("hit points went 0.80 -> 0.84 in one tick and the probe recorded %d violations; want 1",
			n)
	}
	d := p.log.taken(RuleHitPoints)[0].Detail
	for _, want := range []string{"0.8", "0.84", "nothing in this engine raises"} {
		if !strings.Contains(d, want) {
			t.Errorf("the violation does not quote %q, so a reader is told a rule fired without being told "+
				"what it saw: %s", want, d)
		}
	}
	if tick := p.log.taken(RuleHitPoints)[0].Tick; tick != 2 {
		t.Errorf("the violation is at tick %d, want tick 2, which is where the rise was published", tick)
	}
}

// TestProbeCatchesAUnitThatComesBack is the resurrection check itself, in both
// forms the engine could produce one: a destroyed man back on his feet, and a man
// who surrendered walking away from the surrender.
func TestProbeCatchesAUnitThatComesBack(t *testing.T) {
	cases := []struct {
		name   string
		before battle.Status
		after  battle.Status
	}{
		{"a destroyed unit is fighting again", battle.StatusDestroyed, battle.StatusFighting},
		{"a surrendered unit is fighting again", battle.StatusSurrendered, battle.StatusFighting},
		{"a destroyed unit is merely broken", battle.StatusDestroyed, battle.StatusBroken},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			_, p := probeFor(t, 1, 1)
			for _, v := range []*battle.View{
				hpView(0, 0, 0.80, c.before, battle.StatusFighting),
				hpView(1, 0.80, 0.80, c.after, battle.StatusFighting),
			} {
				if err := p.Command(v); err != nil {
					t.Fatalf("the probe refused a view: %v", err)
				}
			}
			if n := p.log.count(RuleRosterStable); n != 1 {
				t.Fatalf("%s, and the probe recorded %d roster violations; want 1", c.name, n)
			}
			d := p.log.taken(RuleRosterStable)[0].Detail
			if !strings.Contains(d, "leaves the field for good") {
				t.Errorf("the violation does not say why it cannot happen: %s", d)
			}
		})
	}
}

// TestProbeStaysSilentOnTheTransitionsThatAreReal is the half that decides whether
// the two checks above are worth having.
//
// Every row is a transition this engine makes on purpose, most of them thousands
// of times in a battle, and every one of them has to leave the log empty. The
// first row in particular is the whole argument for the resurrection check being
// written the way it is: a routed unit comes back to fighting often, and a check
// that reads "came back" without reading "came back from the dead" would fire on
// every rally in the suite.
func TestProbeStaysSilentOnTheTransitionsThatAreReal(t *testing.T) {
	type step struct {
		hp   float64
		st   battle.Status
		side bool // true for side B's unit
	}
	cases := []struct {
		name  string
		steps []step
	}{
		{"hit points fall", []step{{0.9, battle.StatusFighting, false}, {0.7, battle.StatusFighting, false},
			{0.4, battle.StatusFighting, false}}},
		{"a man breaks, runs, and is picked up", []step{
			{0.8, battle.StatusFighting, false}, {0.8, battle.StatusBroken, false},
			{0.8, battle.StatusRouted, false}, {0.8, battle.StatusFighting, false}}},
		{"a man surrenders and stays surrendered", []step{
			{0.8, battle.StatusFighting, false}, {0.8, battle.StatusRouted, false},
			{0.8, battle.StatusSurrendered, false}, {0.8, battle.StatusSurrendered, false}}},
		{"a man is destroyed and stays dead", []step{
			{0.1, battle.StatusFighting, false}, {0, battle.StatusDestroyed, false},
			{0, battle.StatusDestroyed, false}}},
		{"the other side does it too", []step{
			{0.9, battle.StatusFighting, true}, {0.9, battle.StatusRouted, true},
			{0.9, battle.StatusFighting, true}}},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			_, p := probeFor(t, 1, 1)
			for i, s := range c.steps {
				hpA, hpB, stA, stB := 0.9, 0.9, battle.StatusFighting, battle.StatusFighting
				if s.side {
					hpB, stB = s.hp, s.st
				} else {
					hpA, stA = s.hp, s.st
				}
				if err := p.Command(hpView(i, hpA, hpB, stA, stB)); err != nil {
					t.Fatalf("tick %d: the probe refused a view: %v", i, err)
				}
			}
			for _, rule := range []string{RuleHitPoints, RuleRosterStable} {
				if n := p.log.count(rule); n != 0 {
					t.Errorf("%s recorded %d violations on a run of transitions this engine makes on "+
						"purpose: %s", rule, n, p.log.taken(rule)[0].Detail)
				}
			}
		})
	}
}
