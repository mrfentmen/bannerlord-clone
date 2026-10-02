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
