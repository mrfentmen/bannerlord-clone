package battle

// agent3: a session battle has to be steerable. Without the command seam a
// session is the one way to fight a battle that nothing can give an order to:
// RunCommanded commands a battle but fights it to its end in one call, with no
// phases, no pause, and no step. These tests are the formation layer arriving
// through the session rather than through RunCommanded, which is the path a
// running game takes.

import (
	"math"
	"testing"
)

// countCommanded counts the order slots a commander spoke to on the last tick it
// saw, which is how a test asks whether the session's battle was actually being
// ordered rather than merely having a commander attached.
type countCommanded struct {
	under Commander
	last  int
	seen  int
}

func (c *countCommanded) Command(v *View) error {
	if err := c.under.Command(v); err != nil {
		return err
	}
	c.seen++
	c.last = 0
	for _, cmd := range v.Commands {
		if cmd.Set || cmd.FormationSet {
			c.last++
		}
	}
	return nil
}

func TestSessionCommandRefusesWhatItCannotCommand(t *testing.T) {
	s, a, b, leaders := newTestSession(t, 12345)
	cmd, err := NewFormationCommander(loadConfig(t), SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0, 1, 2}},
	})
	if err != nil {
		t.Fatalf("building a formation commander: %v", err)
	}

	if err := s.Command(nil); err == nil {
		t.Error("Command accepted nil, which is a battle fought by nobody wearing a commander's name")
	}
	if err := s.Command(cmd); err == nil {
		t.Error("Command accepted a commander before Deploy, when there is no field to publish")
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if s.Commanded() {
		t.Error("the session reports a commander on a battle that has not been given one")
	}
	if err := s.Command(cmd); err != nil {
		t.Fatalf("Command on a deployed session: %v", err)
	}
	if !s.Commanded() {
		t.Error("the session says it is not commanded after being given a commander")
	}
	// Once the battle is decided, orders are read by nobody, and saying so is
	// better than accepting them.
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	for s.Phase() != PhaseResolved {
		if err := s.Advance(200); err != nil {
			t.Fatalf("Advance: %v", err)
		}
		if s.Tick() > int(loadConfig(t).Battle.MaxTicks) {
			t.Fatal("the battle ran past the tick bound without resolving")
		}
	}
	if err := s.Command(cmd); err == nil {
		t.Errorf("Command accepted a commander on a resolved battle (%s, %s)", s.Phase(), s.Outcome().Kind)
	}
	t.Logf("a session refused nil, a pre-deploy commander, and a post-resolution commander; "+
		"it resolved %s (%s) at tick %d", s.Outcome().Kind, s.Outcome().Reason, s.Tick())
}

// TestSessionFormationOrdersReachTheField is the point of the seam: a formation
// layer handed to a Session must be called every tick and its orders must be
// applied, and the men must end up on their slots.
func TestSessionFormationOrdersReachTheField(t *testing.T) {
	cfg := loadConfig(t)
	s, a, b, leaders := newTestSession(t, 12345)
	// Both rosters are 30 units and Run numbers side A's ids 0..len(a)-1.
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	ids := make([]int, len(a))
	for i := range ids {
		ids[i] = i
	}
	groups := SplitIntoGroups(ids, 2)
	fc, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationAdvance}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationWedge, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("building the formation commander: %v", err)
	}
	spy := &countCommanded{under: fc}
	if err := s.Command(spy); err != nil {
		t.Fatalf("Command: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	// A hundred ticks is long enough for a formation to be measured and short
	// enough that the battle is still being fought rather than already decided.
	const ticks = 100
	if err := s.Advance(ticks); err != nil {
		t.Fatalf("Advance: %v", err)
	}
	if spy.seen == 0 {
		t.Fatal("the commander was never called: the session's battle is not publishing the field to it")
	}
	if spy.last == 0 {
		t.Fatal("the commander was called and ordered nobody at all")
	}
	t.Logf("the session's battle called its commander on %d ticks and the commander spoke to %d units "+
		"on the last of them", spy.seen, spy.last)

	// The men are on their slots, measured the same way the direct battle test
	// measures them: against the slots the layout gives, around the group's own
	// centre of mass.
	bt := s.battle
	p := FormationParamsFrom(cfg.Formation)
	measured := 0
	for _, g := range fc.groups {
		var members []int
		for _, id := range g.units {
			if id < len(bt.units) && bt.units[id].alive() {
				members = append(members, id)
			}
		}
		if len(members) < 2 {
			t.Logf("%s: %d of %d men left, not enough to measure a shape", g.order.Kind, len(members), len(g.units))
			continue
		}
		slots, err := FormationLayout(g.order.Kind, len(members), p)
		if err != nil {
			t.Fatalf("%s: %v", g.order.Kind, err)
		}
		ax, ay, ok := weightedCentre(bt.units, members)
		if !ok {
			t.Fatalf("%s: no weight left in the group", g.order.Kind)
		}
		var sum, worst float64
		for i, id := range members {
			x, y := slots[i].place(ax, ay, g.facing)
			d := math.Hypot(x-bt.units[id].X, y-bt.units[id].Y)
			sum += d
			if d > worst {
				worst = d
			}
			measured++
		}
		mean := sum / float64(len(members))
		t.Logf("%s ordered %s: %d men alive, mean %.2f m from their slots, worst %.2f m",
			g.order.Kind, g.order.Order, len(members), mean, worst)
		if mean > math.Max(p.FrontSpacing, p.LooseSpacing)*2 {
			t.Errorf("%s: after %d commanded ticks the men finished a mean of %.2f m from their slots "+
				"(worst %.2f m), which is more than twice the shape's own spacing; the orders are not "+
				"being kept", g.order.Kind, s.Tick(), mean, worst)
		}
	}
	if measured == 0 {
		t.Fatal("no group had enough men left to measure")
	}
	t.Logf("measured %d men against their slots after %d commanded ticks (%s)", measured, s.Tick(), s.Phase())
}

// TestASessionBattleIsTheSameBattleWithAndWithoutACommanderThatSaysNothing is the
// property that makes the seam safe to leave open: a session whose commander never
// speaks must be bit-for-bit the battle it would have been with no seam at all.
//
// A commander that writes nothing is the interesting case, because it is the one
// a caller gets by accident, and the guard against that is that silence must mean
// exactly what it means in a battle nobody commanded.
func TestASessionBattleIsTheSameBattleWithAndWithoutACommanderThatSaysNothing(t *testing.T) {
	run := func(quiet bool) *Result {
		s, a, b, leaders := newTestSession(t, 12345)
		if err := s.Deploy(a, b, leaders); err != nil {
			t.Fatalf("Deploy: %v", err)
		}
		if quiet {
			if err := s.Command(quietCommander{}); err != nil {
				t.Fatalf("Command: %v", err)
			}
		}
		if err := s.BeginFighting(); err != nil {
			t.Fatalf("BeginFighting: %v", err)
		}
		for s.Phase() != PhaseResolved {
			if err := s.Advance(500); err != nil {
				t.Fatalf("Advance: %v", err)
			}
		}
		return s.Result()
	}
	plain, silenced := run(false), run(true)
	if plain == nil || silenced == nil {
		t.Fatal("a session resolved without a result")
	}
	if plain.Ticks != silenced.Ticks {
		t.Errorf("a commander that said nothing changed the battle length: %d ticks against %d",
			silenced.Ticks, plain.Ticks)
	}
	if plain.StateHash != silenced.StateHash {
		t.Errorf("a commander that said nothing changed the battle: state hash %d against %d",
			silenced.StateHash, plain.StateHash)
	}
	if diff := compareResults(plain, silenced); diff != "" {
		t.Errorf("a commander that said nothing changed the result: %s", diff)
	}
	t.Logf("both sessions resolved %s (%s) at tick %d, state hash %d, with and without a silent commander",
		plain.Outcome.Kind, plain.Outcome.Reason, plain.Ticks, plain.StateHash)
}

// quietCommander reads the field and writes nothing at all.
type quietCommander struct{}

func (quietCommander) Command(*View) error { return nil }

// TestALayoutIsRebuiltWhenAGroupLosesMen is the guard on the layout cache.
//
// The commander keeps each group's slots between ticks so it is not rebuilding
// the same arithmetic four times a second, and the cache is keyed on how many
// men the group has this tick. A group that loses men is therefore asking for a
// different shape, and a cache that answered with the old one would hand back a
// layout with slots for men who are no longer in it: every survivor would be
// measured against the wrong slot, and if the group had shrunk far enough the
// read itself would be out of range.
//
// The view is built by hand and shrunk between two calls to Command, so the
// whole sequence is visible: six men, a cached layout of six, then four men
// fighting and two broken.
func TestALayoutIsRebuiltWhenAGroupLosesMen(t *testing.T) {
	cfg := loadConfig(t)
	const n = 6
	p := FormationParamsFrom(cfg.Formation)
	slots, err := FormationLayout(FormationLine, n, p)
	if err != nil {
		t.Fatalf("laying out a line of %d failed: %v", n, err)
	}
	build := func() *View {
		v := &View{
			Elapsed:     0,
			TickSeconds: cfg.Battle.TickSeconds,
			Units:       make([]UnitView, n+1),
			Commands:    make([]UnitCommand, n+1),
		}
		for i := range slots {
			x, y := slots[i].place(0, 0, 0)
			v.Units[i] = UnitView{
				ID: i, Side: SideA, Status: StatusFighting, Troops: 1,
				Speed: cfg.Battle.RosterSpeedBase, X: x, Y: y,
			}
		}
		v.Units[n] = UnitView{
			ID: n, Side: SideB, Status: StatusFighting, Troops: 1,
			Speed: cfg.Battle.RosterSpeedBase, X: 400, Y: 0,
		}
		return v
	}
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i
	}
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Facing: Facing{Fixed: true, Bearing: 0}}, Units: ids},
	})
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}

	// Six men, so the group caches a layout of six slots.
	full := build()
	if err := cmd.Command(full); err != nil {
		t.Fatalf("ordering six men: %v", err)
	}
	if got := len(cmd.groups[0].slots); got != n {
		t.Fatalf("the group cached a layout of %d slots for %d men", got, n)
	}

	// Four men: two have broken and are off the fight, so the group is a line of
	// four now and its slots must be a line of four.
	shrunken := build()
	shrunken.Units[1].Status = StatusBroken
	shrunken.Units[4].Status = StatusRouted
	// Two of the four survivors are then shoved three metres off the line, one
	// north and one south, so the group's centre of mass does not move with them
	// and every survivor is left out of the four-man shape. Without that they
	// would land on it: dropping the two outermost men of a line moves its centre
	// by exactly the half-spacing that puts the survivors back on their slots.
	shrunken.Units[0].Y += 3
	shrunken.Units[5].Y -= 3
	if err := cmd.Command(shrunken); err != nil {
		t.Fatalf("ordering the four men who are left: %v", err)
	}
	if got := len(cmd.groups[0].slots); got != 4 {
		t.Errorf("the group still holds a layout of %d slots with four men in it; a shape is the shape of "+
			"the men who are in it", got)
	}

	// And the slots it now holds must be the layout of four, not four of the
	// six it had: a line of four is one rank of four, and its centre of mass is
	// the middle of that rank.
	four, err := FormationLayout(FormationLine, 4, p)
	if err != nil {
		t.Fatalf("laying out a line of four: %v", err)
	}
	cached := cmd.groups[0].slots
	for i := range four {
		if cached[i] != four[i] {
			t.Errorf("cached slot %d is %+v, and a line of four puts it at %+v", i, cached[i], four[i])
		}
	}
	// The two shoved men are three metres off the smaller shape and are ordered
	// back toward it. The two in the middle of it are standing on their slots and
	// are left alone, which is the same rule the cohesion test checks and is
	// stated here because a rebuilt layout is what puts them there.
	if _, _, ok := centreOfMass(shrunken, []int{0, 2, 3, 5}); !ok {
		t.Fatal("the four men have no weight between them")
	}
	for _, id := range []int{0, 5} {
		if !shrunken.Commands[id].Set {
			t.Errorf("unit %d was shoved three metres off the line of four and was given no order", id)
		}
	}
	for _, id := range []int{2, 3} {
		if shrunken.Commands[id].Set {
			t.Errorf("unit %d is standing on his slot in the line of four and was told to walk %g, %g",
				id, shrunken.Commands[id].DX, shrunken.Commands[id].DY)
		}
	}
	ordered := 0
	for _, id := range []int{0, 2, 3, 5} {
		if shrunken.Commands[id].Set {
			ordered++
		}
	}
	for _, id := range []int{1, 4} {
		if shrunken.Commands[id].Set || shrunken.Commands[id].FormationSet {
			t.Errorf("unit %d is %s and was spoken to by the formation layer anyway",
				id, shrunken.Units[id].Status)
		}
	}
	t.Logf("a group of %d men cached %d slots, then %d men rebuilt them as %d slots; %d of the four "+
		"survivors were off their slots and ordered back into the smaller shape", n, n, 4, len(cached), ordered)
}
