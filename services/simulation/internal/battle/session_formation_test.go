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

// TestSessionRecordingSurvivesAChangeOfCommander is the seam's recording, which
// belongs to the session rather than to the commander.
//
// It is a separate test from the replay one because the failure it exists for is
// not a divergence, which is what the replay test would report. It is a recording
// that quietly stops: a session that logs the first commander's orders and nothing
// after the player re-forms his line looks exactly like a session that is working,
// right up until somebody tries to replay it. So this one measures the row stream
// on both sides of a commander swap and asks whether it kept going.
func TestSessionRecordingSurvivesAChangeOfCommander(t *testing.T) {
	cfg := loadConfig(t)
	s, a, b, leaders := newTestSession(t, 24680)

	// Recording before there is a commander: legal, and the order a caller gets
	// because a battle is deployed before anybody decides who is fighting it.
	if _, err := s.Record(0, "before-command"); err == nil {
		t.Error("Record on a session that had not deployed returned a log")
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	log, err := s.Record(0, "seam-recording")
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if _, err := s.Record(0, "second"); err == nil {
		t.Error("a second Record was accepted; two logs of one battle cannot be merged into a replay")
	}
	if _, err := s.Record(-1, "negative"); err == nil {
		t.Error("a log bound of -1 rows was accepted")
	}
	if s.Recorder() == nil || s.Recorder().Log() != log {
		t.Error("the session does not report the recorder it is recording through")
	}

	// Nobody is commanding yet, so nothing is recorded: a battle nobody commands
	// has an empty log, which is the honest one.
	if err := s.Step(); err != nil {
		t.Fatalf("Step: %v", err)
	}
	if log.Len() != 0 {
		t.Errorf("an uncommanded session logged %d orders", log.Len())
	}

	line, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: idsOfSlice(a)[:4]},
	})
	if err != nil {
		t.Fatalf("building standing orders: %v", err)
	}
	if err := line.Attach(s); err != nil {
		t.Fatalf("Attach: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	firstRows := log.Len()
	if firstRows == 0 {
		t.Fatal("a commanded session on a recording battle logged no orders")
	}

	// The player changes his mind: a different commander, on the same session, in a
	// different shape. Both shapes have to end up in one log, which is the whole
	// claim: a log holding only the first one is a log of a battle that stopped
	// being fought the moment the player did anything.
	square, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationSquare, Order: OrderFormationAdvance}, Units: idsOfSlice(a)[:4]},
	})
	if err != nil {
		t.Fatalf("building the second standing order: %v", err)
	}
	if err := square.Attach(s); err != nil {
		t.Fatalf("Attach after the change: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	if log.Len() <= firstRows {
		t.Errorf("the log holds %d rows, %d of them before the commander was replaced: the recording "+
			"stopped when the commander changed, which is the bug", log.Len(), firstRows)
	}
	shapes := map[Formation]int{}
	for _, row := range log.Rows() {
		shapes[row.Formation]++
	}
	if shapes[FormationSquare] == 0 {
		t.Errorf("the log carries %v; the second commander's shape was not recorded, so the log is a "+
			"record of the first half of a battle", shapes)
	}
	if shapes[FormationLine] == 0 {
		t.Errorf("the log carries %v; the first commander's shape is gone, so one recorder is not keeping "+
			"one row stream across a change of commander", shapes)
	}
	// A battle nobody commands at all still records nothing, and a resolved one
	// cannot be recorded after the fact.
	for s.Phase() != PhaseResolved {
		if err := s.Advance(400); err != nil {
			t.Fatalf("Advance: %v", err)
		}
		if s.Tick() > int(cfg.Battle.MaxTicks) {
			t.Fatal("the battle ran past the tick bound without resolving")
		}
	}
	if _, err := s.Record(0, "too-late"); err == nil {
		t.Errorf("Record on a resolved session (%s, %s) returned a log", s.Phase(), s.Outcome().Kind)
	}
	t.Logf("%d orders across %d shapes, through two commanders; resolved %s (%s) at tick %d",
		log.Len(), len(shapes), s.Outcome().Kind, s.Outcome().Reason, s.Tick())
}

// TestAMoveOrderedOverTheWireWalksTheShapeAndReplays is the whole path of the
// move order, end to end, and the last thing it checks is the one that would have
// caught it going wrong quietly.
//
// A move is the only order in this layer that carries a parameter the men act on
// but the order log does not record. The log holds per-unit movements, a shape and
// a facing, not the point a commander was told to walk to, because a point is not
// what happened: the men walking towards it is. That is a defensible design and it
// is also the kind of design that is wrong in one specific way, which is a log that
// reproduces the battle when it should not, or does not and nobody can say which.
// So the last thing here is a replay compared to the original by state hash.
//
// The point is placed off the line to the enemy rather than along it, because a
// walk that happens to point at the enemy is a walk this test cannot tell from a
// march, and the two are different orders.
func TestAMoveOrderedOverTheWireWalksTheShapeAndReplays(t *testing.T) {
	cfg := loadConfig(t)
	const (
		seed   = 97531
		walk   = 150.0
		settle = 30
		steps  = 120
	)
	s, a, b, leaders := newTestSession(t, seed)
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	// Record before the fight starts, so the move is inside the log rather than
	// bolted on to it afterwards.
	log, err := s.Record(0, "move-replay")
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	ids := idsOfSlice(a)
	groups := SplitIntoGroups(ids, 2)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("standing orders: %v", err)
	}
	if err := o.Attach(s); err != nil {
		t.Fatalf("Attach: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}

	// Where the fight is, and a point 150 m off the line from the group's centre
	// to the enemy's, measured rather than hardcoded so the test does not depend
	// on which way the roster happened to face.
	bt := s.battle
	ex, ey, ok := weightedCentre(bt.units, idsOfSlice(b))
	if !ok {
		t.Fatal("side B has no weight on the field, so there is no line to the enemy to walk off")
	}
	ax, ay, ok := weightedCentre(bt.units, groups[0])
	if !ok {
		t.Fatal("the group being ordered to move has no weight on the field")
	}
	toEnemy := Bearing(ax, ay, ex, ey)
	destX := ax + math.Cos(toEnemy+math.Pi/2)*walk
	destY := ay + math.Sin(toEnemy+math.Pi/2)*walk

	// The wire order, with no mention of a shape and no mention of which men: one
	// order, naming a point, applied to a group.
	if err := o.Apply(OrderTacticMove, OrderParams{X: destX, Y: destY, HasPoint: true}, groups[0]); err != nil {
		t.Fatalf("ordering the move: %v", err)
	}
	// And it has to have become the standing order, with the place in it. An order
	// that is accepted and then dropped on the floor is the same bug as one that is
	// refused, and it is quieter.
	moved, others := 0, 0
	for _, g := range o.Groups() {
		if sameUnits(g.Units, groups[0]) {
			moved++
			if g.Order.Order != OrderFormationMove {
				t.Errorf("the group ordered a move stands under %s", g.Order.Order)
			}
			if g.Order.At == nil {
				t.Fatal("the group is ordered to move and the standing order carries no place to move to")
			}
			if d := math.Hypot(g.Order.At.X-destX, g.Order.At.Y-destY); d > 1e-9 {
				t.Errorf("the standing order moves to (%+.3f, %+.3f) and the point given was (%+.3f, %+.3f)",
					g.Order.At.X, g.Order.At.Y, destX, destY)
			}
		} else {
			others++
			if g.Order.At != nil {
				t.Errorf("a group nobody told to move carries a destination (%+.1f, %+.1f)",
					g.Order.At.X, g.Order.At.Y)
			}
		}
	}
	if moved != 1 || others != 1 {
		t.Fatalf("%d groups were told to move and %d were not; the test ordered one of two", moved, others)
	}
	// The session is still commanding the order as it stood before the change,
	// which is the caller's job to redo. Skipping it is what the previous session
	// tests teach, so this one does it and says why.
	if err := o.Attach(s); err != nil {
		t.Fatalf("Attach after the change of orders: %v", err)
	}

	for i := 0; i < settle; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	fromX, fromY, ok := weightedCentre(bt.units, groups[0])
	if !ok {
		t.Fatal("the group has no weight left after settling")
	}
	fromBearing := Bearing(fromX, fromY, destX, destY)
	enemyFrom := Bearing(fromX, fromY, ex, ey)
	for i := 0; i < steps; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	toX, toY, ok := weightedCentre(bt.units, groups[0])
	if !ok {
		t.Fatal("the group has no weight left after walking")
	}
	travelled := Bearing(fromX, fromY, toX, toY)
	walked := math.Hypot(toX-fromX, toY-fromY)
	if walked < 10 {
		t.Errorf("a group ordered to walk %.0f m moved %.2f m in %d ticks; the order did not reach the field",
			walk, walked, steps)
	}
	if off := math.Abs(wrapAngle(travelled - fromBearing)); off > 0.35 {
		t.Errorf("the group travelled on a bearing of %.1f degrees towards a point on one of %.1f, "+
			"%.1f degrees off, having started %.0f m from it", travelled*180/math.Pi, fromBearing*180/math.Pi,
			off*180/math.Pi, math.Hypot(destX-fromX, destY-fromY))
	}
	if off := math.Abs(wrapAngle(travelled - enemyFrom)); off < 0.2 {
		t.Errorf("the group travelled on a bearing of %.1f degrees, within %.1f degrees of the bearing to "+
			"the enemy at %.1f degrees; it marched at the enemy rather than walking to its point",
			travelled*180/math.Pi, off*180/math.Pi, enemyFrom*180/math.Pi)
	}
	// And it is still a line while it walks, which is the whole claim of a formation
	// that is somewhere else rather than fighting.
	p := FormationParamsFrom(cfg.Formation)
	members := aliveUnits(bt.units, groups[0])
	if len(members) < 2 {
		t.Fatalf("%d of %d men left after %d ticks; nothing left to measure a shape", len(members),
			len(groups[0]), steps+settle)
	}
	slots, err := FormationLayout(FormationLine, len(members), p)
	if err != nil {
		t.Fatalf("layout: %v", err)
	}
	cx, cy, ok := weightedCentre(bt.units, members)
	if !ok {
		t.Fatal("no weight in the survivors")
	}
	var sum, worst float64
	for i, id := range members {
		x, y := slots[i].place(cx, cy, Bearing(cx, cy, ex, ey))
		d := math.Hypot(x-bt.units[id].X, y-bt.units[id].Y)
		sum += d
		if d > worst {
			worst = d
		}
	}
	mean := sum / float64(len(members))
	if mean > math.Max(p.FrontSpacing, p.LooseSpacing)*2 {
		t.Errorf("a line that walked %.0f m finished a mean of %.2f m from its slots (worst %.2f m); it "+
			"walked as a crowd", walked, mean, worst)
	}

	// The log has to carry the walk. A move whose rows are all holds is a move that
	// replays as a battle where nobody went anywhere.
	mine := make(map[int]bool, len(groups[0]))
	for _, id := range groups[0] {
		mine[id] = true
	}
	var moves, holds, shapes int
	for _, row := range log.Rows() {
		if !mine[row.Unit] {
			continue
		}
		switch row.Kind {
		case OrderMove:
			if math.Hypot(row.DX, row.DY) > 0 {
				moves++
			}
		case OrderHold:
			holds++
		}
		if row.Formation.Valid() {
			shapes++
		}
	}
	if moves == 0 {
		t.Errorf("the order log of a battle where a shape walked %.0f m carries %d movement rows for the "+
			"%d men who walked, %d holds and %d shaped rows; the replay below would be a battle nobody "+
			"marched", walk, moves, len(groups[0]), holds, shapes)
	}
	if shapes == 0 {
		t.Errorf("the order log carries no shape for the %d men who walked, so the replay has nothing to "+
			"re-form them into", len(groups[0]))
	}

	for s.Phase() != PhaseResolved {
		if err := s.Advance(200); err != nil {
			t.Fatalf("Advance: %v", err)
		}
		if s.Tick() > int(cfg.Battle.MaxTicks) {
			t.Fatal("the battle ran past the tick bound without resolving")
		}
	}
	original := s.Result()
	if original == nil {
		t.Fatal("a resolved session with no result")
	}
	if s.Recorder().Refused() != 0 {
		t.Errorf("the order log refused %d rows of a battle that logged %d", s.Recorder().Refused(), log.Len())
	}
	setup := Setup{A: a, B: b, Leaders: leaders, Terrain: TerrainOpen, Label: "move replay"}
	data, err := log.Encode(seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the order log: %v", err)
	}
	decoded, _, _, err := DecodeOrderLog(data)
	if err != nil {
		t.Fatalf("decoding the order log: %v", err)
	}
	replayer, err := NewReplayer(decoded)
	if err != nil {
		t.Fatalf("building the replayer: %v", err)
	}
	second, err := RunCommanded(cfg, seed, setup, replayer)
	if err != nil {
		t.Fatalf("the replay did not run: %v", err)
	}
	if second.StateHash != original.StateHash {
		t.Errorf("the replay of a battle where a shape walked to a point did not reproduce it: state hash "+
			"%016x against the original's %016x", second.StateHash, original.StateHash)
	}
	if second.Ticks != original.Ticks {
		t.Errorf("the replay ran %d ticks against the original's %d", second.Ticks, original.Ticks)
	}
	if diff := compareResults(original, second); diff != "" {
		t.Errorf("the replay differs from the original: %s", diff)
	}
	t.Logf("a wire move ordered %d men %.0f m to (%+.1f, %+.1f): they walked %.1f m on a bearing of %.1f "+
		"degrees where the point was on %.1f and the enemy on %.1f, kept a line to a mean of %.2f m, and "+
		"logged %d movement rows; resolved %s (%s) at tick %d and replayed to %016x",
		len(groups[0]), walk, destX, destY, walked, travelled*180/math.Pi, fromBearing*180/math.Pi,
		enemyFrom*180/math.Pi, mean, moves, original.Outcome.Kind, original.Outcome.Reason, original.Ticks,
		original.StateHash)
}

// aliveUnits is the ids of the units in a list that are still on the field, in the
// order they were given, which is the order their slots were laid out in.
func aliveUnits(units []*Unit, ids []int) []int {
	out := make([]int, 0, len(ids))
	for _, id := range ids {
		if id >= 0 && id < len(units) && units[id].alive() {
			out = append(out, id)
		}
	}
	return out
}

// TestAFollowerKeepsUpWithTheGroupItFollows is follow in a battle, which is the
// only place the order can be wrong in a way the arithmetic cannot show.
//
// A follower that stands exactly where the geometry says on the first tick is
// not a follower; it is a group that was placed once. Following is the group
// keeping its place as the other one goes somewhere, and the failure that matters
// is the one a battle produces: the leader advances, the follower does not, and
// the gap between them is a hundred metres by the end. So the second group here
// is ordered to HOLD, and every metre it walks is the follow and not the order.
//
// It is also the test of the pace. A follower walking at the hold's pace cannot
// keep up with a group advancing at the walking pace, so if the two ever drift
// apart the difference is a pace rule and not a geometry rule, which is why the
// gap is measured at two times and not only at the end.
func TestAFollowerKeepsUpWithTheGroupItFollows(t *testing.T) {
	cfg := loadConfig(t)
	const (
		seed  = 246813
		steps = 150
	)
	s, a, b, leaders := newTestSession(t, seed)
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	groups := SplitIntoGroups(idsOfSlice(a), 2)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationAdvance}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: intp(0)}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("standing orders: %v", err)
	}
	if err := o.Attach(s); err != nil {
		t.Fatalf("Attach: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	bt := s.battle
	// The distance the two shapes should end up at, from the geometry rather than
	// from the layer: the leader's rear rank, one rank of room, and the follower's
	// own depth in front of its anchor.
	p := FormationParamsFrom(cfg.Formation)
	lslots, err := FormationLayout(FormationLine, len(groups[0]), p)
	if err != nil {
		t.Fatalf("leader layout: %v", err)
	}
	fslots, err := FormationLayout(FormationLine, len(groups[1]), p)
	if err != nil {
		t.Fatalf("follower layout: %v", err)
	}
	leadMin, _, _, _, err := FormationExtent(lslots)
	if err != nil {
		t.Fatalf("leader extent: %v", err)
	}
	_, _, _, follMax, err := FormationExtent(fslots)
	if err != nil {
		t.Fatalf("follower extent: %v", err)
	}
	want := math.Abs(leadMin - p.RankSpacing - follMax)

	// sample is where both groups are, so the gap and the leader's travel over the
	// same window can be read off one call.
	sample := func(tick int) (leadX, follX, gap float64) {
		lx, ly, ok1 := weightedCentre(bt.units, groups[0])
		fx, fy, ok2 := weightedCentre(bt.units, groups[1])
		if !ok1 || !ok2 {
			t.Fatalf("tick %d: one of the two groups has no weight on the field", tick)
		}
		return lx, fx, math.Hypot(lx-fx, ly-fy)
	}
	// Sixty ticks is long enough for two blobs of fifteen to become two lines and
	// find their stations, and short enough that the fight has not decided
	// anything. At twenty they are still on top of each other, which is the roster's
	// spread rather than the follow, and a test that measured the gap there would
	// be measuring the deployment.
	const settle = 60
	for i := 0; i < settle; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	leadStartX, follStartX, early := sample(s.Tick())
	for i := 0; i < steps-settle; i++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	leadEndX, follEndX, late := sample(s.Tick())

	// One: the follower walked. It was ordered to hold, so anything it did is the
	// follow.
	follWalked := follEndX - follStartX
	leadWalked := leadEndX - leadStartX
	if math.Abs(follWalked) < math.Abs(leadWalked)/2 {
		t.Errorf("the leader's centre walked %+.2f m in x and the follower ordered to hold walked "+
			"%+.2f m; a follower that does not follow is a group standing still", leadWalked, follWalked)
	}
	if follWalked*leadWalked <= 0 {
		t.Errorf("the leader walked %+.2f m in x and its follower walked %+.2f m, which is the wrong "+
			"way; a follower goes where the leader goes", leadWalked, follWalked)
	}
	// Two: it kept its distance. The tolerance is a frontage, which is the same
	// yardstick the order test uses: two groups a frontage apart are visibly
	// together and a group a hundred metres behind is not following anybody.
	tol := 2 * cfg.Formation.FrontSpacing
	if math.Abs(early-want) > tol {
		t.Errorf("%d ticks in, the two groups' centres are %.2f m apart and the geometry says %.2f m",
			settle, early, want)
	}
	if math.Abs(late-want) > tol {
		t.Errorf("after %d ticks the two groups' centres are %.2f m apart and the geometry says %.2f m; "+
			"a follower that drifts is not following", s.Tick(), late, want)
	}
	// Three: it did not slip away. The bound is a tenth of what the leader walked in
	// the same window, so it scales with the pace being tested: a follower that kept
	// up exactly would not grow the gap at all, and one that did not would grow it
	// in proportion to how far the leader went. Measured against a fixed number of
	// metres instead, this would pass a follower falling behind at a metre a tick as
	// long as the leader happened to be walking slowly.
	traveled := math.Abs(leadEndX - leadStartX)
	if slip := late - early; slip > 0.1*traveled+cfg.Battle.TickSeconds {
		t.Errorf("the gap grew %.2f m, from %.2f m to %.2f m, while the leader's own centre walked "+
			"%.2f m in x over the same %d ticks; a follower at the walking pace keeps up with a group "+
			"advancing at the walking pace, because they are the same walk", slip, early, late, traveled,
			steps-settle)
	}
	t.Logf("a leader of %d ordered to advance and a follower of %d ordered to hold: the leader's centre "+
		"walked %+.1f m in x and the follower's %+.1f m, and the two stayed %.2f m and then %.2f m "+
		"apart against a derived %.2f m, a slip of %.2f m over a leader that walked %.1f m in that "+
		"window (tick %d)",
		len(groups[0]), len(groups[1]), leadWalked, follWalked, early, late, want, late-early, traveled,
		s.Tick())
}

// intp is a pointer to an int, for the parameters this file builds by hand.
func intp(i int) *int { return &i }

// fieldSpy remembers the last field a commander was handed and the last orders it
// wrote, so a test can ask what reached the field rather than what was asked for.
//
// An order that is accepted by the API, stored in the standing orders and never
// seen by a unit is the failure this whole layer is built to avoid, and the only
// way to see it is to read the channel the units are actually ordered on. The
// spy is that read.
type fieldSpy struct {
	under Commander
	seen  int
	cmds  []UnitCommand
	// ids is the unit each slot of cmds belongs to. The write channel is indexed
	// to the view's unit list, so a test that wants to know which group a man
	// belongs to has to be able to read the id off the slot, and counting slots
	// tells it nothing.
	ids []int
	// spoken is how many order slots were written to on the last tick, movement
	// or shape, which is how a test tells "ordered nobody" from "ordered a hold".
	spoken int
	// moved is how many of those were movements rather than a shape alone.
	moved int
	// everMoved is how many ticks, over the whole window, each unit was given a
	// movement. The last tick alone is not enough to ask whether an order reached
	// the field: an order that walks a shape somewhere is correctly silent once
	// the shape has arrived, so a follower that has taken up its station and
	// stopped is not evidence that the follow was never obeyed.
	everMoved map[int]int
}

func (f *fieldSpy) Command(v *View) error {
	if err := f.under.Command(v); err != nil {
		return err
	}
	f.seen++
	f.cmds = append(f.cmds[:0], v.Commands...)
	f.ids = f.ids[:0]
	for _, u := range v.Units {
		f.ids = append(f.ids, u.ID)
	}
	if f.everMoved == nil {
		f.everMoved = map[int]int{}
	}
	f.spoken, f.moved = 0, 0
	for i, c := range f.cmds {
		if c.Set || c.FormationSet {
			f.spoken++
		}
		if c.Set && (c.DX != 0 || c.DY != 0) {
			f.moved++
			if i < len(f.ids) {
				f.everMoved[f.ids[i]]++
			}
		}
	}
	return nil
}

// movedIn counts the slots in group that were given a movement on the last tick.
//
// A follow names one group and says nothing about the other, so the only honest
// reading of a follow is "this group walked, that group was left alone", and that
// needs the id on the slot rather than the slot's position in the channel.
func (f *fieldSpy) movedIn(group map[int]bool) (walked, silent int) {
	for i, c := range f.cmds {
		if i >= len(f.ids) || !group[f.ids[i]] {
			continue
		}
		if c.Set && (c.DX != 0 || c.DY != 0) {
			walked++
		} else {
			silent++
		}
	}
	return walked, silent
}

// everMovedIn counts how many of group's men were given a movement on at least
// one tick of the window.
//
// This is the probe for an order that walks a shape somewhere and then stops,
// which is most of them: a move that has arrived, a fall-back that has fallen
// back, a follow that has taken up its station. Each of those is silent from the
// tick it arrives onwards, and a test that only looks at the last tick cannot tell
// "arrived" from "never obeyed".
func (f *fieldSpy) everMovedIn(group map[int]bool) (walked, held int) {
	for id := range group {
		if f.everMoved[id] > 0 {
			walked++
		} else {
			held++
		}
	}
	return walked, held
}

// centroid is where a set of men are standing, as one point.
//
// It is the measure the drift assertions use, because a formation is a body and a
// body's position is its centre. Summing per-unit steps says the same thing and is
// easier to get wrong: one man who walked twice counts twice.
func centroid(at map[int]UnitView, group map[int]bool) (x, y float64) {
	var sumX, sumY float64
	n := 0
	for id, u := range at {
		if !group[id] {
			continue
		}
		sumX += u.X
		sumY += u.Y
		n++
	}
	if n == 0 {
		return math.NaN(), math.NaN()
	}
	return sumX / float64(n), sumY / float64(n)
}

// TestEveryCarriedOrderReachesTheFieldOnItsOwn is one order per subtest, each
// with its own battle and its own standing orders, and each judged on the field
// rather than on the API that took it.
//
// The reason it is one subtest per order rather than one test that applies all
// nine is that an order can be masked. A standing order amended twice in a battle
// is the sum of both, so an order that changed nothing can be covered by another
// that changed something, and a test that applies them together proves only that
// the sum reached the field. Applied alone, each one has to stand up on its own:
// hold has to be silence where the men are in their slots and a shape everywhere,
// advance and charge and retreat have to move the shape, move has to walk it to
// its point, follow has to put it behind another group, change-formation has to
// publish the shape it was told, and face-direction has to publish the bearing it
// was given.
//
// The five orders this layer does not carry out are not here, and cannot be: they
// are refused by name by PlanGroupOrder, which
// TestEveryWireOrderIsEitherCarriedOutOrRefusedByName walks for all fourteen.
func TestEveryCarriedOrderReachesTheFieldOnItsOwn(t *testing.T) {
	const seed = 5150
	cases := []struct {
		order  OrderName
		params OrderParams
		// one is the group index the order goes to, or -1 for the whole side.
		//
		// A follow is the one carried order that cannot go to the whole side: it
		// names a group to keep station behind, and a group told to follow itself
		// is a group with nothing to follow. The commander refuses that by name,
		// so the order has to be aimed at one group and the test has to aim it.
		// Everything else goes to the army, which is the common case and which
		// nobody should have to spell out.
		one int
		// ticks is how long the order gets on the field. Zero means the short
		// window, which is all an order that publishes a shape or a bearing
		// needs; the move names its own, because the only order in this table
		// that has to cross ground is the only one that needs the time.
		ticks int
		// want is what the field has to show for this order alone. It is read off
		// the order channel in the tick after the change, because a commander
		// rebuilt on a change speaks on the next tick and not the one it was
		// handed.
		want func(t *testing.T, f *fieldSpy, groups []map[int]bool, before, after map[int]UnitView)
		desc string
	}{
		{
			order: OrderHoldPosition, one: -1,
			desc: "hold: silence where the men are in their slots",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, _, _ map[int]UnitView) {
				if f.spoken == 0 {
					t.Error("a hold spoke to no order slots at all; a man in his slot gets nothing and a " +
						"man out of his slot gets a step, so zero means the shape was never published")
				}
				for i, c := range f.cmds {
					if c.Set && c.DX == 0 && c.DY == 0 && !c.FormationSet {
						t.Errorf("unit %d was given an empty movement order; silence is Set=false", i)
					}
					if c.Set && c.Intent != IntentHold {
						t.Errorf("unit %d was ordered to %v under a hold, which should be %v", i, c.Intent, IntentHold)
					}
				}
			},
		},
		{
			order: OrderAdvance, one: -1,
			desc: "advance: the shape walks towards the enemy",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, before, after map[int]UnitView) {
				if f.moved == 0 {
					t.Error("an advance moved nobody; a formation whose anchor does not move is a shape " +
						"that was drawn correctly and obeyed not at all")
				}
				for i, c := range f.cmds {
					if c.Set && c.Intent != IntentAdvance {
						t.Errorf("unit %d was ordered to %v under an advance", i, c.Intent)
					}
				}
				walked := 0
				for id, was := range before {
					if was.Side != SideA {
						continue
					}
					if now, ok := after[id]; ok && (now.X != was.X || now.Y != was.Y) {
						walked++
					}
				}
				if walked == 0 {
					t.Error("no unit changed position over the window of an advance")
				}
			},
		},
		{
			order: OrderCharge, one: -1,
			desc: "charge: the same, faster",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, before, after map[int]UnitView) {
				if f.moved == 0 {
					t.Error("a charge moved nobody")
				}
				// A charge walks at charge_speed and an advance at advance_speed, so
				// over the same window the charge has to cover more ground. That is
				// checked against the paces in the balance file rather than against
				// the other order, because the other order is not running.
				for i, c := range f.cmds {
					if c.Set && c.Intent != IntentAdvance {
						t.Errorf("unit %d was ordered to %v under a charge", i, c.Intent)
					}
				}
				_ = before
				_ = after
			},
		},
		{
			order: OrderRetreat, one: -1,
			desc: "fall-back: the shape walks away from the enemy",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, before, after map[int]UnitView) {
				if f.moved == 0 {
					t.Error("a fall-back moved nobody; the withdrawal is the one order whose anchor moves " +
						"against the direction the shape is facing")
				}
				for i, c := range f.cmds {
					if c.Set && c.Intent != IntentWithdraw {
						t.Errorf("unit %d was ordered to %v under a fall-back, which should be %v",
							i, c.Intent, IntentWithdraw)
					}
				}
				var east, west int
				for id, was := range before {
					if was.Side != SideA {
						continue
					}
					now, ok := after[id]
					if !ok {
						continue
					}
					if math.Hypot(now.X-was.X, now.Y-was.Y) < 1e-9 {
						continue
					}
					// Side A starts west of side B, so eastward is towards the enemy.
					if now.X > was.X {
						east++
					} else {
						west++
					}
				}
				if west <= east {
					t.Errorf("%d units went east and %d went west over the window of a fall-back; the "+
						"enemy is east", east, west)
				}
			},
		},
		{
			order: OrderTacticMove,
			// Due north of where side A deploys, and no east or west of it. The
			// choice is the whole test: the enemy is east, so a "move" that is an
			// advance in disguise would go east, and a point with no east in it
			// cannot be reached by going east. The distance is short enough that
			// the shape gets there inside the window (a formation walks at
			// advance_speed, which is under half a metre a tick, so sixty metres
			// is a few hundred ticks) and far enough off the line that the
			// formation has to actually walk rather than shuffle.
			params: OrderParams{
				X: -445, Y: 60, HasPoint: true,
			},
			one:   -1,
			ticks: 300,
			desc:  "move: the shape walks to the point it was given",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, before, after map[int]UnitView) {
				if f.moved == 0 {
					t.Error("a move to a point sixty metres north moved nobody")
				}
				for i, c := range f.cmds {
					if c.Set && c.Intent != IntentAdvance {
						t.Errorf("unit %d was ordered to %v under a move to a point", i, c.Intent)
					}
				}
				// The net drift of the side, side A only: the other army is on the
				// field too and its movements say nothing about whether an order
				// reached this one. Summing per-unit steps is the same as taking
				// the drift of the centre of mass, and the drift is what an order
				// to a place has to show.
				dx, dy := 0.0, 0.0
				for id, was := range before {
					if was.Side != SideA {
						continue
					}
					if now, ok := after[id]; ok {
						dx += now.X - was.X
						dy += now.Y - was.Y
					}
				}
				if dy <= 0 {
					t.Errorf("the side drifted (%+.1f, %+.1f) over the window of a move to a point "+
						"sixty metres due north of it; a shape that did not go north did not go there",
						dx, dy)
				}
				// The enemy is east, so this is the half that says the order was a
				// move and not an advance wearing a move's name: an advance drifts
				// east, and the sum of thirty men drifting east is a large positive
				// dx next to a small dy.
				if math.Abs(dx) > dy {
					t.Errorf("the side drifted (%+.1f, %+.1f) towards a point due north of it; it went "+
						"east and south of the line it was ordered onto, which is where an advance goes",
						dx, dy)
				}
			},
		},
		{
			order:  OrderChangeFormation,
			params: OrderParams{Formation: "hollow square"},
			one:    -1,
			desc:   "change-formation: every man is told which shape he is standing in",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, _, _ map[int]UnitView) {
				shaped := 0
				for i, c := range f.cmds {
					if !c.FormationSet {
						continue
					}
					shaped++
					if c.Formation != FormationSquare {
						t.Errorf("unit %d was told he is standing in %v after a change to %v",
							i, c.Formation, FormationSquare)
					}
				}
				if shaped == 0 {
					t.Error("no unit was told a shape at all; the shape is published on every order " +
						"the commander speaks, whether or not it moves anybody")
				}
			},
		},
		{
			order:  OrderFaceDirection,
			params: OrderParams{Bearing: -0.75, HasFacing: true},
			one:    -1,
			desc:   "face-direction: every man is told which way to look",
			want: func(t *testing.T, f *fieldSpy, _ []map[int]bool, _, _ map[int]UnitView) {
				faced := 0
				for i, c := range f.cmds {
					if !c.FormationSet {
						continue
					}
					faced++
					if math.Abs(wrapAngle(c.Facing-(-0.75))) > 1e-9 {
						t.Errorf("unit %d was told to face %.4f rad after being told to face %.4f",
							i, c.Facing, -0.75)
					}
				}
				if faced == 0 {
					t.Error("no unit was told a facing; the bearing is published on every order the " +
						"commander speaks")
				}
			},
		},
		{
			order:  OrderFollow,
			params: OrderParams{FollowGroup: 1, HasFollow: true},
			// Group 0, and only group 0. A follow sent to the whole side would ask
			// group 1 to follow itself, which the commander refuses by name, so
			// this is the one case that has to name its group.
			one:  0,
			desc: "follow: the group walks behind the group it was told to follow",
			want: func(t *testing.T, f *fieldSpy, groups []map[int]bool, before, after map[int]UnitView) {
				// Group 0 is told to follow group 1, which was told to hold. So the
				// test is whether group 0 took up station behind group 1 and group 1
				// stayed put. That is a statement about the field and not about the
				// write channel, because a follower that has ARRIVED is silent: it
				// writes zero steps, and reading the last tick would score a working
				// follow as an order nobody obeyed.
				lead, _ := centroid(after, groups[1])
				follower, _ := centroid(after, groups[0])
				if follower >= lead {
					t.Errorf("the following group ended at x=%+.1f and the group it follows at x=%+.1f; "+
						"the enemy is east, so a follower is behind, which is west of what it follows",
						follower, lead)
				}
				// The station has to be a station: falling back a stride and then
				// wandering off is not keeping station. The two groups deploy abreast
				// of each other, so a gap that has opened is a gap the follow made.
				leadBefore, _ := centroid(before, groups[1])
				followerBefore, _ := centroid(before, groups[0])
				gapBefore := leadBefore - followerBefore
				gapAfter := lead - follower
				if gapAfter <= gapBefore {
					t.Errorf("the gap between the two groups went from %+.1f m to %+.1f m; a follow that "+
						"does not fall back is not keeping station behind anything", gapBefore, gapAfter)
				}
				// And the order has to have reached the field at some point, which is
				// the one thing the geometry above cannot tell on its own: a group that
				// never moved and a group that moved and arrived look identical from
				// here if the two groups happened to start in the right order.
				walked, held := f.everMovedIn(groups[0])
				if walked == 0 {
					t.Errorf("not one of the %d men following was given a movement on any of the "+
						"window's ticks; the station it is standing in is one it was already in", held)
				}
			},
		},
	}
	for i, tc := range cases {
		t.Run(string(tc.order), func(t *testing.T) {
			cfg := loadConfig(t)
			s, a, b, leaders := newTestSession(t, seed+uint64(i))
			if err := s.Deploy(a, b, leaders); err != nil {
				t.Fatalf("Deploy: %v", err)
			}
			groups := SplitIntoGroups(idsOfSlice(a), 2)
			o, err := NewOrders(cfg, SideA, []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[1]},
			})
			if err != nil {
				t.Fatalf("standing orders: %v", err)
			}
			if err := s.BeginFighting(); err != nil {
				t.Fatalf("BeginFighting: %v", err)
			}
			// Ten ticks to form the two lines from the roster's spread, so the order
			// under test is measured on a shape that is standing and not on two
			// blobs tidying themselves.
			// The commander the standing orders build, with the spy around it so the
			// orders it writes can be read back.
			oc, err := o.Commander()
			if err != nil {
				t.Fatalf("building the commander: %v", err)
			}
			spy := &fieldSpy{under: oc}
			if err := s.Command(spy); err != nil {
				t.Fatalf("Command: %v", err)
			}
			for k := 0; k < 10; k++ {
				if err := s.Step(); err != nil {
					t.Fatalf("Step: %v", err)
				}
			}
			// The one order under test. A nil unit list is the whole side; the
			// follow case names one group, because a follow sent to the army
			// would ask a group to follow itself.
			aim := []int(nil)
			if tc.one >= 0 {
				aim = groups[tc.one]
			}
			if err := o.Apply(tc.order, tc.params, aim); err != nil {
				t.Fatalf("applying %s: %v", tc.order, err)
			}
			changed, err := o.Commander()
			if err != nil {
				t.Fatalf("rebuilding the commander after %s: %v", tc.order, err)
			}
			spy.under = changed
			if err := s.Command(spy); err != nil {
				t.Fatalf("Command after %s: %v", tc.order, err)
			}
			before := map[int]UnitView{}
			for _, u := range s.battle.units {
				before[u.ID] = UnitView{ID: u.ID, X: u.X, Y: u.Y, Side: u.Side}
			}
			// The window the order gets on the field. A hundred and twenty ticks is
			// half a minute of battle: long enough for a commander rebuilt on a
			// change to speak on its first tick and for a shape to answer it, and
			// short enough that the fight has not decided anything. The move names
			// a longer one, because a formation walks at under half a metre a tick
			// and sixty metres is three hundred of them.
			window := tc.ticks
			if window == 0 {
				window = 120
			}
			for k := 0; k < window; k++ {
				if err := s.Step(); err != nil {
					t.Fatalf("Step: %v", err)
				}
			}
			after := map[int]UnitView{}
			for _, u := range s.battle.units {
				after[u.ID] = UnitView{ID: u.ID, X: u.X, Y: u.Y, Side: u.Side}
			}
			if spy.seen == 0 {
				t.Fatal("the commander was never handed the field after the order")
			}
			groupsByID := make([]map[int]bool, len(groups))
			for i, g := range groups {
				groupsByID[i] = map[int]bool{}
				for _, id := range g {
					groupsByID[i][id] = true
				}
			}
			tc.want(t, spy, groupsByID, before, after)
			// Both numbers, because after the hold fix they disagree on purpose: a
			// settled shape is TALKED to and told to move zero metres, so "spoken
			// to" counts a shape that is standing perfectly still and "movements"
			// counts none of them. Printing only the second made a working hold look
			// like a silent commander.
			t.Logf("%-16s over %d ticks: %d order slots spoken to, %d movements on the last tick, "+
				"%d unit-ticks of movement over the window; %s",
				tc.order, s.Tick(), spy.spoken, spy.moved, spy.movementTicks(), tc.desc)
		})
	}
}

// movementTicks is how many unit-ticks of movement the commander wrote over the
// whole window, which is the number that says an order reached the field for
// orders whose shapes are expected to arrive and stop.
func (f *fieldSpy) movementTicks() int {
	n := 0
	for _, c := range f.everMoved {
		n += c
	}
	return n
}

// TestAFormationToldToHoldStandsWhereItIs is the regression test for a hold that
// walked, and it is a test of its own because the number it asserts is a number
// about the whole battle rather than about the order channel.
//
// A line ordered to hold position, given a standing order and nothing else:
//
//	tick  10: g0 (-448.4, -2.9)  g1 (-441.7, -1.2)
//	tick 210: g0 (-413.3, -5.0)  d(+35.1, -2.1)
//	tick 210: g1 (-404.4, -0.5)  d(+37.2, +0.7)
//
// Thirty-five metres towards the enemy in two hundred ticks, steady, never
// stopping. The cause is not subtle once it is looked for: the formation layer
// answered a hold with silence, and silence in this engine means "left to the
// engine's own rules", and the engine's own rules for a man who is not in contact
// with the enemy are to close on the enemy. A man in his slot was being told to
// advance by the only party still speaking to him.
//
// Fixing that exposed the second half of it, which is why the test asserts the
// spacing as well as the drift. A whole spacing of in-slot tolerance lets two
// neighbours meet in the middle, and nothing used to catch that because the drift
// carried them past each other continuously — a hold that did not hold was
// quietly tidying itself by walking. The moment it held, two men of a settled
// held line stood 0.20 m apart, against a balance file that names 1.2 m as the
// smallest gap the spacing pass allows. The pass does not rescue a commanded
// unit: the seam writes the commander's movement over the intent stage's deltas
// wholesale, so a formation's own slots are the only thing keeping its men out of
// each other.
func TestAFormationToldToHoldStandsWhereItIs(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 5150 + 7
	s, a, b, leaders := newTestSession(t, seed)
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	groups := SplitIntoGroups(idsOfSlice(a), 2)
	o, err := NewOrders(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("standing orders: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	oc, err := o.Commander()
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := s.Command(oc); err != nil {
		t.Fatalf("Command: %v", err)
	}
	// Ten ticks to form the line, so the drift measured is a settled shape
	// standing still rather than a crowd tidying itself, and then two hundred
	// ticks — half a minute of battle — to see whether it stays.
	for k := 0; k < 10; k++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	all := map[int]bool{}
	for _, g := range groups {
		for _, id := range g {
			all[id] = true
		}
	}
	snapshot := func() map[int]UnitView {
		out := map[int]UnitView{}
		for _, u := range s.battle.units {
			out[u.ID] = UnitView{ID: u.ID, X: u.X, Y: u.Y, Side: u.Side}
		}
		return out
	}
	before := snapshot()
	// Tightest gap between any two of side A's living men, which is what a
	// formation that cannot spread looks like.
	tightest := func(at map[int]UnitView, live map[int]bool) (float64, int, int) {
		best, bi, bj := math.Inf(1), -1, -1
		for i := range at {
			if !live[i] {
				continue
			}
			for j := i + 1; j < len(at); j++ {
				if !live[j] {
					continue
				}
				d := math.Hypot(at[i].X-at[j].X, at[i].Y-at[j].Y)
				if d < best {
					best, bi, bj = d, i, j
				}
			}
		}
		return best, bi, bj
	}
	for k := 0; k < 200; k++ {
		if err := s.Step(); err != nil {
			t.Fatalf("Step: %v", err)
		}
	}
	after := snapshot()
	live := map[int]bool{}
	for _, u := range s.battle.units {
		if u.Side == SideA && u.alive() {
			live[u.ID] = true
		}
	}
	x0, y0 := centroid(before, all)
	x1, y1 := centroid(after, all)
	dx, dy := x1-x0, y1-y0
	// One tick's worth of a man's walking pace is the scale to judge a drift
	// against: 200 ticks of drift at the hold's own pace is the bug, and 200
	// ticks of tidying noise is not a bug. hold_speed is 0.8 m/s and a tick is a
	// quarter of a second, so a metre is two and a half ticks of standing still.
	if math.Hypot(dx, dy) > 1.0 {
		t.Errorf("a line ordered to hold position drifted %+.2f m, %+.2f m over %d ticks; the enemy "+
			"is east and a hold is the one order whose answer is not east", dx, dy, s.Tick())
	}
	gap, i, j := tightest(after, live)
	if gap < cfg.Formation.MinSeparation {
		t.Errorf("two men of a settled held line stand %.2f m apart (units %d and %d), and the balance "+
			"file names %.2f m as the smallest gap the spacing pass allows; a commanded unit gets no "+
			"spacing pass, so the shape's own slots are all that is holding these men apart",
			gap, i, j, cfg.Formation.MinSeparation)
	}
	t.Logf("held for %d ticks: drifted %+.2f m, %+.2f m; tightest pair %.2f m (units %d, %d) against a "+
		"%.2f m minimum", s.Tick(), dx, dy, gap, i, j, cfg.Formation.MinSeparation)
}
