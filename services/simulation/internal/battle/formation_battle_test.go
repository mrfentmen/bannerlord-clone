package battle

import (
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"mbclone/simulation/internal/config"
)

// THE HEADLESS BATTLE WITH FORMATION ORDERS.
//
// The brief's smoke test, and the only test in this file that fights a whole
// battle rather than a shape. Everything else in formation_test.go is geometry
// and arithmetic; this is the part that says the geometry reaches the field.
//
// What it checks, in order of how much it would hurt to be wrong:
//
//  1. A battle with formation orders on both sides runs to a conclusion and
//     returns a result. A formation layer that stops a battle from finishing is
//     not a feature.
//  2. The men actually move into the shapes they were ordered into. Units that
//     are ordered and never arrive are a formation layer that is only pretending,
//     and the check is geometric: after the battle, the members of each group are
//     measured against the slots the layout gives them.
//  3. A recorded battle replays to the same state hash, which is what the shape
//     channel in the order log is for. A shape that is not in the log is a replay
//     of a battle nobody fought.
//  4. A formation order does not drag a broken or routed man back into his slot,
//     because the morale stage owns those two states.
//  5. Each order moves the formation the way it says it does, measured against
//     the same battle fought with the other orders. A shape that is drawn
//     correctly and obeyed not at all is a shape on a piece of paper.

// formationRun is one commanded run, kept so a test can ask questions of it after
// the battle rather than only printing it.
type formationRun struct {
	res    *Result
	groups []*formationGroup
	cmd    *FormationCommander
	b      *Battle
}

// runFormedBattle fights setup with the given groups in charge of the given sides
// and returns the result, the commanders, and the finished Battle so a test can
// look at where the men ended up.
func runFormedBattle(t *testing.T, cfg *config.Config, seed uint64, setup Setup, formed *FormationCommander) *formationRun {
	t.Helper()
	// The other side is left to the engine's own rules. A battle where one side
	// has a formation layer and the other does not is the harder case: it is the
	// one where a bug in the layer shows up as a battle that ends differently
	// rather than as two symmetric formations that agree by accident.
	rec, log := NewRecorder(formed, 0, "formation-smoke")
	res, err := RunCommanded(cfg, seed, setup, rec)
	if err != nil {
		t.Fatalf("the battle with formation orders did not run: %v", err)
	}
	if res == nil {
		t.Fatal("the battle with formation orders returned no result")
	}
	if log.Truncated() {
		t.Fatalf("the order log refused %d rows, so it is not a record of the battle", log.Refused())
	}
	t.Logf("%s: %d ticks, winner %s (%s), %d orders logged, state hash %016x",
		setup.Label, res.Ticks, res.Outcome.Kind, res.Outcome.Reason, log.Len(), res.StateHash)
	return &formationRun{res: res, groups: formed.groups, cmd: formed, b: nil}
}

// TestFormationOrdersCompleteABattle is the smoke test the brief asks for.
func TestFormationOrdersCompleteABattle(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 40
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	setup.Label = fmt.Sprintf("%d v %d, side A in formations", n, n)

	// Two groups for side A: a line that advances and a wedge held back in
	// column. The split is by id, which is roster order, so the front of side A's
	// force is the line and the back is the wedge.
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i
	}
	groups := SplitIntoGroups(ids, 2)
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationAdvance}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationWedge, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}

	wall := time.Now()
	run := runFormedBattle(t, cfg, seed, setup, cmd)
	elapsed := time.Since(wall)

	res := run.res
	if res.Ticks < 1 {
		t.Fatalf("the battle ended after %d ticks, which is before anything could have happened", res.Ticks)
	}
	if res.Ticks >= int(cfg.Battle.MaxTicks) {
		t.Errorf("the battle ran to the tick bound (%d ticks, %s); a battle that cannot finish is not a "+
			"battle, and the formation layer is a prime suspect for a side that will not stop closing",
			res.Ticks, res.Outcome.Reason)
	}
	if res.Outcome.Kind == ResultDraw {
		t.Logf("the battle was drawn (%s): both sides held, which is a possible outcome and not a failure",
			res.Outcome.Reason)
	}

	// Did anybody get hit, and is that the formation layer's doing?
	//
	// The same battle is fought a second time with the same seed, the same
	// forces, and no formation layer at all, and the two are compared. A formed
	// battle that produced casualties where an uncommanded one produced none
	// would be a formation layer that had removed the fighting from the battle,
	// which is the one thing this layer must never do. An uncommanded battle that
	// produced none either is telling the truth about the engine rather than
	// about the formations, and the numbers are printed side by side so a reader
	// can see which of the two cases this run was.
	//
	// At the time of writing both numbers are zero, and that is a fact about the
	// melee pipeline rather than about this file: at battle.melee_range 2.6 m,
	// battle.standoff_distance 8 m, and formation.advance_standoff 120 m from
	// the enemy's centre of mass, the two armies settle tens of metres apart and
	// decide the battle with morale before anybody lands a blow. A 40 v 40 battle
	// at this seed swings about ten blows in total either way. The assertion
	// below is written so that it is live the moment the engine does put men in
	// reach of each other: then the uncommanded battle has casualties and the
	// formed one is required to as well.
	totalCas := casualties(res)
	plain, err := Run(cfg, seed, setup)
	if err != nil {
		t.Fatalf("the same battle without formations did not run: %v", err)
	}
	plainCas := casualties(plain)
	t.Logf("the same battle with no formation layer: %d ticks, winner %s (%s), %.0f casualties, "+
		"%.0f melee swings", plain.Ticks, plain.Outcome.Kind, plain.Outcome.Reason, plainCas,
		plain.Sides[0].Swings+plain.Sides[1].Swings)
	if plainCas > 0 && totalCas <= 0 {
		t.Errorf("the same battle produced %.0f casualties with no formations and %.0f with them across "+
			"%d ticks; the formation layer has taken the fighting out of the battle",
			plainCas, totalCas, res.Ticks)
	}
	if totalCas <= 0 {
		t.Logf("note: neither battle landed a blow at this seed (%d ticks formed, %d uncommanded). The "+
			"formation layer is not what decides that: the melee pipeline is", res.Ticks, plain.Ticks)
	}
	for _, s := range res.Sides {
		if s.Dead+s.Wounded > s.StartBodies {
			t.Errorf("side %s lost %g of %g bodies, which is more than it started with", s.Side, s.Dead+s.Wounded, s.StartBodies)
		}
	}
	fmt.Printf("\n============ FORMATION SMOKE: %d vs %d, side A in formations ============\n", n, n)
	fmt.Printf("side A: line advancing (%.0f men), wedge holding (%.0f men)\n",
		float64(len(groups[0])), float64(len(groups[1])))
	fmt.Printf("seed:      %d\n", seed)
	fmt.Printf("ticks:     %d at %g s (%s of simulated time), wall %s\n",
		res.Ticks, cfg.Battle.TickSeconds, time.Duration(res.Elapsed*float64(time.Second)), elapsed.Round(time.Millisecond))
	fmt.Printf("winner:    %s (%s)\n", res.Outcome.Kind, res.Outcome.Reason)
	for _, s := range res.Sides {
		fmt.Printf("side %s:    dead %.0f  wounded %.0f  of %.0f bodies; %d standing (%d broken, %d routed), "+
			"%d surrendered\n", s.Side, s.Dead, s.Wounded, s.StartBodies, s.Standing, s.Broken, s.Routed, s.Surrendered)
	}
	fmt.Printf("same battle, no formations: %d ticks, winner %s (%s), %.0f casualties, %.0f melee swings\n",
		plain.Ticks, plain.Outcome.Kind, plain.Outcome.Reason, plainCas,
		plain.Sides[0].Swings+plain.Sides[1].Swings)
	fmt.Printf("state hash: %016x\n", res.StateHash)
}

// casualties is both sides' dead and wounded, which is the one number that says
// whether anything happened in a battle.
func casualties(res *Result) float64 {
	if res == nil {
		return 0
	}
	var n float64
	for _, s := range res.Sides {
		n += s.Dead + s.Wounded
	}
	return n
}

// TestFormedMenEndUpOnTheirSlots is the check that the orders were carried out
// rather than merely issued: the members of a group are measured against the slots
// the layout gives them, and the distance from each man to his slot is printed.
//
// It reads the finished Battle rather than the result, because the result does not
// carry positions, and it rebuilds the group from the commander's own state so the
// expected slots are the ones the commander was working from.
func TestFormedMenEndUpOnTheirSlots(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 24
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i
	}
	groups := SplitIntoGroups(ids, 2)
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationColumn, Order: OrderFormationAdvance}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}

	// Run the battle by hand rather than through RunCommanded, so the finished
	// state is still here to measure.
	b, err := newBattle(cfg, seed, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	rec, _ := NewRecorder(cmd, 0, "formation-slots")
	v := &View{
		Units:    make([]UnitView, len(b.units)),
		Commands: make([]UnitCommand, len(b.units)),
	}
	b.hooks = &commandHooks{cmd: rec, view: v}
	const budget = 400
	for i := 0; i < budget; i++ {
		if outcome, decided := b.checkEnding(); decided {
			t.Logf("the battle ended at tick %d: %s (%s)", b.tickNo, outcome.Kind, outcome.Reason)
			break
		}
		if err := b.tick(); err != nil {
			t.Fatalf("tick %d failed: %v", b.tickNo, err)
		}
	}

	p := FormationParamsFrom(cfg.Formation)
	measured := 0
	for _, g := range cmd.groups {
		// The members still standing, in the order the commander assigns slots.
		var members []int
		for _, id := range g.units {
			if id < len(b.units) && b.units[id].alive() {
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
		ax, ay, ok := weightedCentre(b.units, members)
		if !ok {
			t.Fatalf("%s: no weight left in the group", g.order.Kind)
		}
		facing := g.facing
		var sum, worst float64
		for i, id := range members {
			x, y := slots[i].place(ax, ay, facing)
			d := math.Hypot(x-b.units[id].X, y-b.units[id].Y)
			sum += d
			if d > worst {
				worst = d
			}
			measured++
		}
		mean := sum / float64(len(members))
		t.Logf("%s ordered %s: %d men alive, mean %.2f m from their slot, worst %.2f m",
			g.order.Kind, g.order.Order, len(members), mean, worst)
		// A formation that has run to the end of a battle with its men on their
		// slots is a formation; a mean of tens of metres is a formation layer
		// that is issuing orders nobody is keeping.
		if mean > math.Max(p.FrontSpacing, p.LooseSpacing)*2 {
			t.Errorf("%s: the men finished the battle a mean of %.2f m from their slots (worst %.2f m), "+
				"which is more than twice the shape's own spacing; the orders are not being kept",
				g.order.Kind, mean, worst)
		}
	}
	if measured == 0 {
		t.Skip("every group lost too many men to measure a shape")
	}
	t.Logf("measured %d men against their slots after %d ticks", measured, b.tickNo)
}

// weightedCentre is the bodies-weighted mean position of a set of unit ids, used
// by the tests to rebuild a group's anchor the same way the commander does.
func weightedCentre(units []*Unit, ids []int) (float64, float64, bool) {
	var sx, sy, w float64
	for _, id := range ids {
		if id < 0 || id >= len(units) {
			continue
		}
		weight := units[id].Troops
		sx += units[id].X * weight
		sy += units[id].Y * weight
		w += weight
	}
	if w <= 0 {
		return 0, 0, false
	}
	return sx / w, sy / w, true
}

// TestFormedBattleReplaysToTheSameState is the determinism claim for the whole
// path: a battle fought under formation orders, recorded, and replayed is the same
// battle.
//
// It is the test that would catch a shape being published to the combat stages but
// not carried in the order log. Such a log replays a battle in which nobody is in
// any formation, and the two battles diverge in every casualty figure while both
// of them look like a fight.
func TestFormedBattleReplaysToTheSameState(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 16
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i
	}
	groups := SplitIntoGroups(ids, 2)

	// Side A is commanded into a wedge and a square, so both shapes that carry a
	// combat effect are in the log and a lost shape would show up as a
	// divergence rather than as a neutral one nobody notices.
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationWedge, Order: OrderFormationAdvance}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationSquare, Order: OrderFormationHold}, Units: groups[1]},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}
	rec, log := NewRecorder(cmd, 0, "formation-replay")
	first, err := RunCommanded(cfg, seed, setup, rec)
	if err != nil {
		t.Fatalf("the first battle did not run: %v", err)
	}

	// The log has to carry the shapes, or the check below is checking a battle
	// nobody fought.
	shaped := 0
	for _, o := range log.Rows() {
		if o.Formation.Valid() {
			shaped++
		}
	}
	if shaped == 0 {
		t.Fatalf("the order log carries %d rows and not one of them names a formation; a shape that is "+
			"not logged is a shape the replay does not reproduce", log.Len())
	}

	data, err := log.Encode(seed, cfg.Version)
	if err != nil {
		t.Fatalf("encoding the order log failed: %v", err)
	}
	decoded, logSeed, configVersion, err := DecodeOrderLog(data)
	if err != nil {
		t.Fatalf("decoding the order log failed: %v", err)
	}
	if logSeed != seed || configVersion != cfg.Version {
		t.Errorf("the log says seed %d and config %q; the battle ran under seed %d and config %q",
			logSeed, configVersion, seed, cfg.Version)
	}
	shapedAfterDecode := 0
	for _, o := range decoded.Rows() {
		if o.Formation.Valid() {
			shapedAfterDecode++
		}
	}
	if shapedAfterDecode != shaped {
		t.Errorf("the log held %d shaped rows and %d survived the round trip through a file; a shape lost "+
			"in the encoding is a shape the replay does not have", shaped, shapedAfterDecode)
	}

	replayer, err := NewReplayer(decoded)
	if err != nil {
		t.Fatalf("building the replayer failed: %v", err)
	}
	second, err := RunCommanded(cfg, seed, setup, replayer)
	if err != nil {
		t.Fatalf("the replay did not run: %v", err)
	}
	if first.Ticks != second.Ticks {
		t.Errorf("the replay ran %d ticks against the original's %d", second.Ticks, first.Ticks)
	}
	if first.StateHash != second.StateHash {
		t.Errorf("the replay did not reproduce the battle: state hash %d against the original's %d",
			second.StateHash, first.StateHash)
	}
	if diff := compareResults(first, second); diff != "" {
		t.Errorf("the replay differs from the original: %s", diff)
	}
	t.Logf("recorded %d orders (%d of them in a formation), replayed %d, both at state hash %d",
		log.Len(), shaped, replayer.Replayed(), first.StateHash)
}

// TestAFormationOrderDoesNotCommandBrokenOrRoutedMen is the rule that keeps the
// formation layer from fighting the morale stage: a shaken man is withdrawing and a
// running one is out of the fight, and a shape is not a reason to put either of
// them back in a slot.
func TestAFormationOrderDoesNotCommandBrokenOrRoutedMen(t *testing.T) {
	cfg := loadConfig(t)
	// A view built by hand, because what is being tested is the commander's rule
	// about who it may speak to, not a battle.
	v := &View{
		Elapsed:     1,
		TickSeconds: cfg.Battle.TickSeconds,
		Units:       make([]UnitView, 5),
		Commands:    make([]UnitCommand, 5),
	}
	units := []UnitView{
		{ID: 0, Side: SideA, Status: StatusFighting, X: -400, Y: 0, Troops: 1, Speed: 4},
		{ID: 1, Side: SideA, Status: StatusBroken, X: -400, Y: 2, Troops: 1, Speed: 4},
		{ID: 2, Side: SideA, Status: StatusRouted, X: -400, Y: -2, Troops: 1, Speed: 4},
		{ID: 3, Side: SideA, Status: StatusSurrendered, X: -400, Y: 4, Troops: 1, Speed: 4},
		{ID: 4, Side: SideA, Status: StatusFighting, X: 400, Y: 0, Troops: 1, Speed: 4},
	}
	copy(v.Units, units)

	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0, 1, 2, 3, 4}},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}
	if err := cmd.Command(v); err != nil {
		t.Fatalf("the commander refused a view it should have been able to order: %v", err)
	}
	for i, u := range units {
		c := v.Commands[i]
		if u.Status == StatusFighting {
			if !c.FormationSet {
				t.Errorf("unit %d is fighting and was not put in the formation", i)
			}
			if c.Formation != FormationLine {
				t.Errorf("unit %d is in %s, want a line", i, c.Formation)
			}
			continue
		}
		if c.Set || c.FormationSet {
			t.Errorf("unit %d is %s and was spoken to anyway: the formation layer does not get to decide "+
				"that a broken or routed man rejoins his slot", i, u.Status)
		}
	}
	t.Logf("of 5 units, %d were ordered and %d were left to the engine's own rules",
		countSpoken(v.Commands), 5-countSpoken(v.Commands))
}

// TestCommanderRefusesAViewItCannotRead is CONSTITUTION.md section 1.3 applied to
// the seam: a view whose ids are not its own indices would have a formation order
// the wrong unit, and it is refused rather than obeyed.
func TestCommanderRefusesAViewItCannotRead(t *testing.T) {
	cfg := loadConfig(t)
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0}},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}
	if err := cmd.Command(nil); err == nil {
		t.Error("the commander ordered a nil field")
	}

	// Parallel slices of different lengths.
	short := &View{Units: make([]UnitView, 2), Commands: make([]UnitCommand, 1)}
	if err := cmd.Command(short); err == nil {
		t.Error("the commander ordered a view whose units and order slots are different lengths")
	}

	// Ids that are not the index they are stored at.
	misnumbered := &View{Units: make([]UnitView, 2), Commands: make([]UnitCommand, 2)}
	misnumbered.Units[0].ID = 7
	if err := cmd.Command(misnumbered); err == nil {
		t.Error("the commander ordered a view whose unit at index 0 calls itself unit 7")
	}
}

// TestGroupOrderIsIndependentOfTheOrderUnitsAreListedIn: slots are assigned by
// ascending id, so a caller that lists its units in another order gets the same
// shape, which is what makes a formation a property of the men and not of how a
// slice happened to be built.
func TestGroupOrderIsIndependentOfTheOrderUnitsAreListedIn(t *testing.T) {
	cfg := loadConfig(t)
	ids := []int{5, 3, 8, 1, 9, 2, 7, 0, 6, 4}
	reversed := make([]int, len(ids))
	for i, id := range ids {
		reversed[len(ids)-1-i] = id
	}

	orders := make([][]UnitCommand, 2)
	for gi, group := range [][]int{ids, reversed} {
		cmd, err := NewFormationCommander(cfg, SideA, []Group{
			{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: group},
		})
		if err != nil {
			t.Fatalf("building the formation commander failed: %v", err)
		}
		v := &View{
			Elapsed:     0,
			TickSeconds: cfg.Battle.TickSeconds,
			Units:       make([]UnitView, 12),
			Commands:    make([]UnitCommand, 12),
		}
		for i := range v.Units {
			v.Units[i] = UnitView{
				ID: i, Side: SideA, Status: StatusFighting, Troops: 1, Speed: 4,
				X: -300 + float64(i)*3.7, Y: float64(i%5) - 2,
			}
		}
		v.Units[11] = UnitView{ID: 11, Side: SideB, Status: StatusFighting, Troops: 1, Speed: 4, X: 300}
		if err := cmd.Command(v); err != nil {
			t.Fatalf("ordering the group failed: %v", err)
		}
		orders[gi] = v.Commands
	}
	for i := range orders[0] {
		a, b := orders[0][i], orders[1][i]
		if a.Formation != b.Formation || a.Facing != b.Facing || a.DX != b.DX || a.DY != b.DY {
			t.Errorf("unit %d was ordered differently depending on the order the group's units were "+
				"listed in: (dx %g, dy %g, %s at %g) against (dx %g, dy %g, %s at %g)",
				i, a.DX, a.DY, a.Formation, a.Facing, b.DX, b.DY, b.Formation, b.Facing)
		}
	}
}

// TestUncommandedBattlesHaveNoFormations is the claim that makes this layer
// safe to add to a battle that was working before it: with no commander there is
// no shape, and with no shape every per-shape multiplier is exactly one, so the
// fight is the one there was.
func TestUncommandedBattlesHaveNoFormations(t *testing.T) {
	cfg := loadConfig(t)
	setup, err := standardForce(t, cfg, 20260930, 8)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	b, err := newBattle(cfg, 20260930, setup)
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	for i := 0; i < 20; i++ {
		if err := b.tick(); err != nil {
			t.Fatalf("tick %d failed: %v", b.tickNo, err)
		}
		for id := range b.units {
			f := b.formations[id]
			if f.Kind != FormationNone {
				t.Fatalf("tick %d: unit %d is in %s and nobody ordered it into anything", b.tickNo, id, f.Kind)
			}
			if f.Kind == FormationNone {
				if got := b.meleeDealtScale(id, 100); got != 1 {
					t.Errorf("a unit in no formation deals %g melee damage, want exactly 1", got)
				}
				if got := b.meleeTakenScale(id, 0, 0, -1, 0, 100); got != 1 {
					t.Errorf("a unit in no formation takes %g melee damage, want exactly 1", got)
				}
				if got := b.suppressionTakenScale(id); got != 1 {
					t.Errorf("a unit in no formation takes %g suppression, want exactly 1", got)
				}
			}
		}
	}
}

// orderSpy is a Commander that runs another commander's orders and then records
// where side A's centre of mass ended up, tick by tick.
//
// It is a Commander in its own right so that it can be handed to RunCommanded
// alongside the formation commander, which is the only way to measure a formation
// order against a real battle: the engine's own movement, the spacing pass, and
// the morale stage all run exactly as they do in a battle nobody is testing.
type orderSpy struct {
	// under is the commander whose orders are recorded.
	under Commander
	// ax is side A's unweighted mean x, per tick.
	ax []float64
	// gap is the distance from side A's mean position to side B's, per tick.
	gap []float64
}

func (s *orderSpy) Command(v *View) error {
	if s.under != nil {
		if err := s.under.Command(v); err != nil {
			return err
		}
	}
	var ax, ay, an, bx, by, bn float64
	for i := range v.Units {
		u := &v.Units[i]
		if !u.Status.Actable() {
			continue
		}
		if u.Side == SideA {
			ax, ay, an = ax+u.X, ay+u.Y, an+1
		} else {
			bx, by, bn = bx+u.X, by+u.Y, bn+1
		}
	}
	if an > 0 && bn > 0 {
		s.ax = append(s.ax, ax/an)
		s.gap = append(s.gap, math.Hypot(bx/bn-ax/an, by/bn-ay/an))
	}
	return nil
}

// TestADisplacedManWalksBackToHisSlot is the cohesion rule, which is the other
// half of what a formation is: the shape does not only have to be drawn, the men
// in it have to be pulled back into it after the fighting has shoved them about.
//
// The view is built by hand with one man pushed out of his place and the rest
// standing exactly on theirs, and the order is a hold, so nothing about the
// anchor is moving and every movement measured here is cohesion and nothing
// else.
//
// The expected slot is measured against the anchor the commander uses, which is
// the group's centre of mass and not the origin the men started from. That
// distinction is the whole reason the anchor is a centre of mass: a man shoved
// twelve metres north drags the anchor north with him, so his slot moves too, and
// a test that measured against the origin would be measuring a shape the
// commander never drew.
//
// Two things have to hold at once. The man who is out of his place is told to
// walk toward his slot, with the order pointing at the slot rather than merely
// being non-zero. And a man standing inside the radius is left where he is: not
// walked, and not left to the engine either.
//
// # WHY "LEFT ALONE" MEANS A PIN AND NOT SILENCE
//
// Silence and a pin are the same movement and not the same order. A commander that
// says nothing leaves the unit to the engine's own rules, and the engine's own
// rules for a man who is not in contact are to close on the enemy. So a hold that
// answered with silence was a hold that advanced: measured on the thirty-a-side
// session, thirty-five metres towards the enemy over two hundred ticks, steady,
// never stopping. The layer believed it had told the line to stand still and the
// only party still speaking to those men was telling them to advance.
//
// UnitCommand's contract has always said which of the two a stand-still order is:
// "a zero-length order on a commander that means 'stand still' must therefore set
// Set, and a commander that says nothing leaves it clear." So the pin is what a
// hold writes, and what this test now checks is the difference that matters: a man
// in his place is written to with a step of zero metres, and never with a step that
// walks him inside his own slot.
//
// The radius is settleRadius rather than the whole spacing, and that is the second
// half of the same fix. A whole spacing of in-place tolerance lets two neighbours
// meet in the middle: they are one spacing apart and each may be a whole spacing
// out from his own slot, so a settled line can put two men 0.20 m apart against a
// balance file that names 1.2 m as the smallest gap the spacing pass will allow.
// The pass does not rescue a commanded man either, because the seam writes the
// commander's movement over the intent stage's wholesale, so a formation's own
// slots are the only thing keeping its men out of each other.
func TestADisplacedManWalksBackToHisSlot(t *testing.T) {
	cfg := loadConfig(t)
	const n = 6
	p := FormationParamsFrom(cfg.Formation)
	slots, err := FormationLayout(FormationLine, n, p)
	if err != nil {
		t.Fatalf("laying out a line of %d failed: %v", n, err)
	}
	// One tick of a man walking at hold pace, which is the ceiling on the step a
	// cohesion order asks for.
	paceStep := cfg.Formation.HoldSpeed * cfg.Battle.TickSeconds
	tolerance := cohesionTolerance(FormationLine, p)
	// How far a man may be from his slot and still be pinned rather than walked:
	// half of what the shape's neighbour gap can give up before two of its men
	// could stand closer than the spacing pass's minimum.
	inPlace := settleRadius(FormationLine, p)
	if inPlace <= 0 || inPlace >= tolerance {
		t.Fatalf("the in-place radius of a line is %.3f m against a %.3f m spacing; a radius that is "+
			"not inside the shape's own spacing is not a radius", inPlace, tolerance)
	}

	// Two men are displaced, one north and one south by the same distance, so
	// the group's centre of mass does not move and the anchor is where the men
	// started. That keeps the measurement about cohesion: with one man shoved the
	// anchor follows him, every slot in the formation moves with it, and every
	// man in it is then out of his place for a reason that has nothing to do with
	// cohesion.
	const north, south = 2, 4
	for _, c := range []struct {
		name string
		// off is how far north of his slot the northern man is standing, and how
		// far south of his his the southern one is.
		off float64
	}{
		{"two men a long way out of their places", 12},
		{"two men just out of their places", inPlace * 2},
		{"two men inside the in-place radius", inPlace * 0.5},
	} {
		v := &View{
			Elapsed:     0,
			TickSeconds: cfg.Battle.TickSeconds,
			Units:       make([]UnitView, n+1),
			Commands:    make([]UnitCommand, n+1),
		}
		for i := range slots {
			x, y := slots[i].place(0, 0, 0)
			switch i {
			case north:
				y += c.off
			case south:
				y -= c.off
			}
			v.Units[i] = UnitView{
				ID: i, Side: SideA, Status: StatusFighting, Troops: 1,
				Speed: cfg.Battle.RosterSpeedBase, X: x, Y: y,
			}
		}
		v.Units[n] = UnitView{
			ID: n, Side: SideB, Status: StatusFighting, Troops: 1,
			Speed: cfg.Battle.RosterSpeedBase, X: 400, Y: 0,
		}
		// The anchor the commander will work from, rebuilt here the same way it
		// builds it: the bodies-weighted centre of the group's living members.
		ax, ay, ok := centreOfMass(v, []int{0, 1, 2, 3, 4, 5})
		if !ok {
			t.Fatalf("%s: the group has no weight in it", c.name)
		}
		// Both displaced men, measured the same way.
		type want struct {
			id           int
			dx, dy, dist float64
		}
		wants := make([]want, 0, 2)
		for _, id := range []int{north, south} {
			sx, sy := slots[id].place(ax, ay, 0)
			dx, dy := sx-v.Units[id].X, sy-v.Units[id].Y
			wants = append(wants, want{id: id, dx: dx, dy: dy, dist: math.Hypot(dx, dy)})
		}

		ids := make([]int, n)
		for i := range ids {
			ids[i] = i
		}
		// The bearing is pinned rather than left to square up to the enemy, so
		// the slot this test measures against is the slot the layout gives and
		// not a shape the test has to reproduce the commander's angle for.
		cmd, err := NewFormationCommander(cfg, SideA, []Group{
			{Order: GroupOrder{
				Kind:   FormationLine,
				Order:  OrderFormationHold,
				Facing: Facing{Fixed: true, Bearing: 0},
			}, Units: ids},
		})
		if err != nil {
			t.Fatalf("%s: building the commander failed: %v", c.name, err)
		}
		if err := cmd.Command(v); err != nil {
			t.Fatalf("%s: ordering the field failed: %v", c.name, err)
		}
		inside := wants[0].dist <= inPlace
		for _, w := range wants {
			got := v.Commands[w.id]
			gotDist := math.Hypot(got.DX, got.DY)
			if inside {
				// Inside the radius: he is standing in his place, and the order
				// that says so is the pin. Silence would hand him back to the
				// engine, and the engine closes on the enemy.
				if !got.Set {
					t.Errorf("%s: unit %d is %.3f m from his slot, inside the %.3f m in-place radius, "+
						"and was given no order at all; a hold that says nothing hands him to the "+
						"engine's own rules, which are to advance", c.name, w.id, w.dist, inPlace)
					continue
				}
				if gotDist != 0 {
					t.Errorf("%s: unit %d is %.3f m from his slot, inside the %.3f m in-place radius, "+
						"and was told to walk %g, %g; a formation that orders a man in his slot to "+
						"walk in his slot is arguing with itself every tick", c.name, w.id, w.dist,
						inPlace, got.DX, got.DY)
				}
				continue
			}
			if !got.Set {
				t.Errorf("%s: unit %d was displaced %.3f m and was given no order at all, so nothing "+
					"pulls him back into the shape; a formation is the shape plus the cohesion that "+
					"keeps men in it", c.name, w.id, w.dist)
				continue
			}
			if gotDist <= 0 {
				t.Errorf("%s: unit %d was told to stand still", c.name, w.id)
				continue
			}
			// The order has to point at the slot, not merely be some movement:
			// the dot product of the two unit vectors is one only when they are
			// parallel.
			if dot := (got.DX*w.dx + got.DY*w.dy) / (gotDist * w.dist); dot < 1-1e-9 {
				t.Errorf("%s: unit %d was ordered %g, %g, which does not point at his slot %g m away",
					c.name, w.id, got.DX, got.DY, w.dist)
				continue
			}
			// One tick of pace, and never past the slot.
			if math.Abs(gotDist-paceStep) > 1e-9 {
				t.Errorf("%s: unit %d is %.3f m from his slot and was told to walk %.4f m; one tick at "+
					"hold_speed (%.2f m/s) is %.4f m", c.name, w.id, w.dist, gotDist,
					cfg.Formation.HoldSpeed, paceStep)
			}
			if gotDist > w.dist+1e-9 {
				t.Errorf("%s: unit %d is %.3f m from his slot and was told to walk %.3f m, which is past "+
					"it; he would arrive, reverse on the next tick, and shiver in place", c.name, w.id,
					w.dist, gotDist)
			}
			t.Logf("%-38s: unit %d displaced %.3f m, told to walk %.4f m toward his slot at hold pace",
				c.name, w.id, w.dist, gotDist)
		}
		if inside {
			t.Logf("%-38s: both men inside the %.3f m in-place radius, so both were pinned where "+
				"they stood", c.name, inPlace)
		}
		// Everyone else is standing exactly on his slot. Under a hold that is the
		// pin and nothing else: he is written to, with a step of zero metres, so
		// the engine does not take him for a man nobody ordered.
		pinned := 0
		for i := range slots {
			if i == north || i == south {
				continue
			}
			pin := v.Commands[i]
			if !pin.Set {
				continue
			}
			if pin.DX != 0 || pin.DY != 0 {
				t.Errorf("%s: unit %d is standing on his slot and was told to walk %g, %g; a man in "+
					"his place who is told to keep walking is a formation arguing with itself", c.name, i,
					pin.DX, pin.DY)
				continue
			}
			pinned++
		}
		t.Logf("%-38s: %d men on their slots were pinned with a zero step", c.name, pinned)
	}

	// The cap at the slot distance is what stops a man reversing every tick, and
	// with the shipped numbers it can never be reached: a cohesion tolerance of
	// one front spacing is larger than a whole tick of every order's pace, so the
	// cap is a safety property rather than a live branch. That is worth stating as
	// a fact about the config rather than assuming, because a longer tick or a
	// faster charge would turn it into a live branch and a formation that shivers
	// in place.
	for _, c := range []struct {
		order FormationOrder
		pace  float64
	}{
		{OrderFormationHold, cfg.Formation.HoldSpeed},
		{OrderFormationAdvance, cfg.Formation.AdvanceSpeed},
		{OrderFormationCharge, cfg.Formation.ChargeSpeed},
		{OrderFormationRetreat, cfg.Formation.RetreatSpeed},
	} {
		step := c.pace * cfg.Battle.TickSeconds
		if step > tolerance {
			t.Logf("note: %s covers %.3f m in a tick against a %.3f m tolerance, so a man just out of "+
				"place can be told to walk past his slot and will reverse on the next tick", c.order, step, tolerance)
			continue
		}
		t.Logf("%-8s: %.3f m a tick against a %.3f m tolerance, so no cohesion order can overshoot a slot",
			c.order, step, tolerance)
	}
}

// spyRun fights one battle with the given order on side A and returns the spy.
func spyRun(t *testing.T, cfg *config.Config, seed uint64, setup Setup, order FormationOrder) *orderSpy {
	t.Helper()
	// Run assigns battle ids densely in roster order, side A first, so side A's
	// line is 0..len(setup.A)-1 and the leaders come after both sides.
	ids := make([]int, len(setup.A))
	for i := range ids {
		ids[i] = i
	}
	formed, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: order}, Units: ids},
	})
	if err != nil {
		t.Fatalf("building the formation commander for %s failed: %v", order, err)
	}
	spy := &orderSpy{under: formed}
	if _, err := RunCommanded(cfg, seed, setup, spy); err != nil {
		t.Fatalf("the battle ordered %s did not run: %v", order, err)
	}
	if len(spy.ax) == 0 {
		t.Fatalf("the battle ordered %s recorded no ticks with both sides on the field", order)
	}
	return spy
}

// TestAnAdvanceOrAChargeCarriesTheShapeForward is the rule that the anchor moves.
//
// A formation's anchor is its group's centre of mass and its slots are laid out
// around that anchor, so a shape whose anchor is left alone has its slots exactly
// where its men already are: every man is "in his slot", nobody is given an
// order, and an advance advances nothing. It reads as a working advance only
// because the enemy walking toward the formation keeps shoving men out of their
// slots and every man who was shoved returns at the faster pace, which is an
// advance that happens only when it is attacked.
//
// The view here is built by hand with every man already standing exactly on the
// slot the layout gives him and the enemy four hundred metres away, which is the
// cleanest possible version of the question: nothing displaces these men, so any
// movement the order produces is the order's own doing. A hold must then leave
// every one of them alone, and an advance, a charge, and a fall-back must each
// walk every one of them in the direction that order means, at that order's pace.
//
// It uses the engine's own layout to place the men, so it says nothing about the
// geometry; formation_test.go measures that to the metre. What it measures is
// whether an order moves the shape it was given.
func TestAnAdvanceOrAChargeCarriesTheShapeForward(t *testing.T) {
	cfg := loadConfig(t)
	const n = 6
	p := FormationParamsFrom(cfg.Formation)
	slots, err := FormationLayout(FormationLine, n, p)
	if err != nil {
		t.Fatalf("laying out a line of %d failed: %v", n, err)
	}

	// The enemy's bearing is the one the commander will resolve: due east, so
	// the formation faces 0 radians and a forward slot is a larger x.
	build := func() *View {
		v := &View{
			Elapsed:     0,
			TickSeconds: cfg.Battle.TickSeconds,
			Units:       make([]UnitView, n+1),
			Commands:    make([]UnitCommand, n+1),
		}
		for i, s := range slots {
			x, y := s.place(0, 0, 0)
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

	// The distance one tick of an order's own pace covers, which is what each
	// man below is measured against: the shape's pace, the tick length, and the
	// unit's speed over the file's reference speed.
	wantStep := func(pace float64) float64 {
		return cfg.Battle.RosterSpeedBase * pace / cfg.Battle.RosterSpeedBase * cfg.Battle.TickSeconds
	}

	for _, c := range []struct {
		order FormationOrder
		// want is the sign of the movement a man in this formation must be given.
		want float64
	}{
		{OrderFormationHold, 0},
		{OrderFormationAdvance, 1},
		{OrderFormationCharge, 1},
		{OrderFormationRetreat, -1},
	} {
		cmd, err := NewFormationCommander(cfg, SideA, []Group{
			{Order: GroupOrder{Kind: FormationLine, Order: c.order}, Units: ids},
		})
		if err != nil {
			t.Fatalf("building the commander for %s failed: %v", c.order, err)
		}
		v := build()
		if err := cmd.Command(v); err != nil {
			t.Fatalf("%s: ordering the field failed: %v", c.order, err)
		}
		pace := cfg.Formation.HoldSpeed
		switch c.order {
		case OrderFormationAdvance:
			pace = cfg.Formation.AdvanceSpeed
		case OrderFormationCharge:
			pace = cfg.Formation.ChargeSpeed
		case OrderFormationRetreat:
			pace = cfg.Formation.RetreatSpeed
		}
		ordered, formed, pinned := 0, 0, 0
		for i := 0; i < n; i++ {
			got := v.Commands[i]
			if got.FormationSet && got.Formation == FormationLine {
				formed++
			}
			if !got.Set {
				continue
			}
			ordered++
			// A zero step is a pin and not a movement: the man is written to and
			// told to stay where he is, which is how a hold keeps the engine from
			// advancing a man it has already placed. The two are counted apart
			// because they are different orders, and a test that counted only "was
			// he spoken to" would call a settled formation a moving one.
			if got.DX == 0 && got.DY == 0 {
				pinned++
			}
			if got.Intent == IntentHold && c.order != OrderFormationHold {
				t.Errorf("%s: unit %d was ordered to move and told it was holding", c.order, i)
			}
			if c.want == 0 {
				if got.DX != 0 || got.DY != 0 {
					t.Errorf("%s: unit %d was told to move %g, %g m, and a hold is a hold; every man in "+
						"this view is already on his slot, so a hold has nothing to do but pin him where "+
						"he stands", c.order, i, got.DX, got.DY)
				}
				continue
			}
			if got.DX*c.want <= 0 {
				t.Errorf("%s: unit %d was ordered %g m east of his slot; an order that walks the shape "+
					"%s has to move every man in it, including the ones already in place",
					c.order, i, got.DX, map[FormationOrder]string{
						OrderFormationAdvance: "toward the enemy",
						OrderFormationCharge:  "toward the enemy",
						OrderFormationRetreat: "away from the enemy",
					}[c.order])
			}
			if step := math.Hypot(got.DX, got.DY); math.Abs(step-wantStep(pace)) > 1e-9 {
				t.Errorf("%s: unit %d was ordered %.4f m in a tick, and one tick at %s (%.2f m/s) is %.4f m",
					c.order, i, step, c.order, pace, wantStep(pace))
			}
		}
		t.Logf("%-8s %d of %d men in a line already on their slots were spoken to: %d walked and %d "+
			"were pinned, at %.3f m a tick",
			c.order, ordered, n, ordered-pinned, pinned, wantStep(pace))
		if c.want == 0 && ordered-pinned != 0 {
			t.Errorf("%s: %d men were ordered to move out of a shape they are already standing in",
				c.order, ordered-pinned)
		}
		if c.want == 0 && ordered != n {
			t.Errorf("%s: %d of %d men were left to the engine's own rules, and the engine's own rules "+
				"for a man out of contact are to close on the enemy; a hold pins all of them",
				c.order, n-ordered, n)
		}
		if c.want == 0 && formed != n {
			t.Errorf("%s: %d of %d men were put in the formation, want all of them", c.order, formed, n)
		}
		if c.want != 0 && ordered != n {
			t.Errorf("%s: %d of %d men were ordered to move and the rest were left where they stood; an "+
				"order that walks the shape has to walk all of it, and a man already on his slot is the "+
				"one the anchor has just moved away from", c.order, ordered, n)
		}
		if c.want != 0 && formed != n {
			t.Errorf("%s: %d of %d men were put in the formation, want all of them", c.order, formed, n)
		}
	}
}

// TestEachOrderMovesTheFormationTheWayItSays is the test that the orders are
// obeyed and not merely drawn.
//
// Every order is measured against the same battle fought four ways, with the
// same seed and the same forces, so the only thing that differs between the runs
// is the word in the order. The observable is how far side A walked, read in a
// window that starts once the shape has formed: the first forty ticks are every
// formation converging from the roster's own spread into its slots, which is the
// same work whatever the order was, and measuring an order by it measures the
// shape instead. The end of a battle is no better an observable: it is decided
// by who won and by what a routed side does with its legs.
//
// A hold is the reference and does not move: it pins its men where they are, and
// the engine's own intent stage never gets to advance a man the formation layer
// has already placed. What is not allowed is for the four orders to come out in
// the same order as each other, which is exactly what happened twice: when the
// in-slot exemption applied to a retreating formation the anchor moved back by
// less than the cohesion tolerance, so every man was "already in his slot", nobody
// was ordered, and a withdrawal withdrew nothing; and when the anchor was left
// still for an advancing formation the same exemption meant an advance only ever
// moved by however fast the enemy's approach displaced its men.
func TestEachOrderMovesTheFormationTheWayItSays(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	const n = 40
	setup, err := standardForce(t, cfg, seed, n)
	if err != nil {
		t.Fatalf("building the force failed: %v", err)
	}
	setup.Label = fmt.Sprintf("%d v %d, side A's order varies", n, n)

	runs := map[FormationOrder]*orderSpy{}
	for _, o := range []FormationOrder{
		OrderFormationHold, OrderFormationAdvance, OrderFormationCharge, OrderFormationRetreat,
	} {
		runs[o] = spyRun(t, cfg, seed, setup, o)
	}
	// The window is the second half-minute of the battle rather than its first:
	// the first forty ticks are every formation converging from the roster's own
	// spread into its slots, which is the same work whatever the order was, and
	// the orders are only distinguishable once the shape is standing and the
	// question is what it does next. Two hundred ticks is fifty seconds of
	// simulated time, which is several formation paces, and short enough that
	// the two sides have not yet been decided by the fight itself.
	settle, probe := 40, 200
	for _, s := range runs {
		if len(s.ax) < probe {
			probe = len(s.ax)
		}
	}
	if probe <= settle+1 {
		t.Fatalf("no battle lasted long enough to measure (%d ticks)", probe)
	}
	walked := make(map[FormationOrder]float64, len(runs))
	for o, s := range runs {
		walked[o] = s.ax[probe-1] - s.ax[settle]
		t.Logf("%-8s: side A walked %+8.2f m over ticks %d..%d, gap %.1f -> %.1f",
			o, walked[o], settle, probe, s.gap[settle], s.gap[probe-1])
	}

	// Side A starts west of side B, so a positive walk is toward the enemy.
	//
	// The four orders are required to come out in order, and the yardstick for
	// "in order" is the shape's own front spacing rather than a metre written
	// here: a man who is out of his place by a whole frontage is visibly out of
	// it, so two orders that differ by less than that are not telling each other
	// apart on the field. It comes from the balance file because that is where
	// CONSTITUTION.md section 1.2 says a number like it lives.
	gapNeeded := cfg.Formation.FrontSpacing
	for _, pair := range [][2]FormationOrder{
		{OrderFormationAdvance, OrderFormationHold},
		{OrderFormationCharge, OrderFormationAdvance},
		{OrderFormationHold, OrderFormationRetreat},
	} {
		faster, slower := pair[0], pair[1]
		if walked[faster]-walked[slower] < gapNeeded {
			t.Errorf("a %s walked %+.2f m against a %s's %+.2f m, a difference of %.2f m; "+
				"the two orders have to tell each other apart on the field by more than one frontage "+
				"(%.2f m) or they are the same order",
				faster, walked[faster], slower, walked[slower], walked[faster]-walked[slower], gapNeeded)
		}
	}
	// A hold pins its men, so the bound is much tighter than it was, and the
	// reason is worth writing down rather than leaving the number looking
	// arbitrary.
	//
	// Silence used to be a hold's answer, and silence in this engine means the
	// engine's own rules, which for a man out of contact are to close on the
	// enemy. A hold that said nothing was therefore a hold that advanced, and it
	// was measured doing it: 35 m towards the enemy over 200 ticks on the
	// thirty-a-side session, steady and never stopping. A hold now writes the
	// zero step, which is what UnitCommand's own contract says a stand-still order
	// is, and the same fight walks 0.4 m over 160.
	//
	// The bound is one frontage, and it is the same yardstick the comparison above
	// uses: a formation that has drifted less than a man is out of his place has
	// not visibly moved, and one that has drifted more has. It comes from the
	// balance file because that is where a number like it lives.
	drift := math.Abs(walked[OrderFormationHold])
	if drift > cfg.Formation.FrontSpacing {
		t.Errorf("a hold walked %+.2f m in %d ticks, which is more than the %.2f m frontage of the "+
			"shape it is holding; a pinned formation does not walk", walked[OrderFormationHold],
			probe-settle, cfg.Formation.FrontSpacing)
	}
}

// TestAGroupOfMenWhoAreNotThereIsRefused is the rule that a formation of nobody
// is an error and not a quiet no-op.
//
// A group's membership is a list of battle ids, and the commander is built before
// the battle exists, so the only place the list can be checked against the field
// is the first tick it is ordered from. That is where it is checked. A unit that
// is not on the field, or that fights for the other army, is a caller mistake
// that is visible on the tick it is made and invisible for the rest of the
// battle: the group is skipped, every one of its members is ignored, and the
// battle goes on exactly as if the order had never been given. The caller is
// told the order was carried out. That is the silent stub this codebase treats
// as a bug, and it is the easiest one to write, because half a side's roster is
// an entirely plausible thing to hand to a commander by mistake.
//
// The status filter beside these two is deliberately NOT here: a broken or
// routed man is a real unit on the right side that the morale stage owns, and
// leaving him alone is the rule, not a mistake.
func TestAGroupOfMenWhoAreNotThereIsRefused(t *testing.T) {
	cfg := loadConfig(t)
	// Six side A units and six side B, so a group that names a B id has a
	// perfectly good id to name and is still wrong.
	const aUnits, bUnits = 6, 6
	view := func() *View {
		v := &View{
			Elapsed:     1,
			TickSeconds: cfg.Battle.TickSeconds,
			Units:       make([]UnitView, aUnits+bUnits),
			Commands:    make([]UnitCommand, aUnits+bUnits),
		}
		for i := range v.Units {
			side := SideA
			if i >= aUnits {
				side = SideB
			}
			v.Units[i] = UnitView{
				ID: i, Side: side, Status: StatusFighting, Troops: 10, Speed: 4,
				X: -300 + float64(i%aUnits)*4, Y: float64(i/aUnits) * 2,
			}
		}
		return v
	}
	cases := []struct {
		name   string
		units  []int
		field  string
		expect string
	}{
		{name: "a unit that is not on this field", units: []int{0, aUnits + bUnits}, field: "Group.Units", expect: "12"},
		{name: "a unit that fights for the other army", units: []int{0, aUnits}, field: "Group.Units", expect: "side B"},
		{name: "a group of nobody who exists", units: []int{aUnits + bUnits - 1}, field: "Group.Units", expect: "11"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cmd, err := NewFormationCommander(cfg, SideA, []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: tc.units},
			})
			if err != nil {
				t.Fatalf("building the formation commander failed: %v", err)
			}
			// The build cannot know: the battle does not exist yet. The order
			// comes from a session that has not deployed.
			v := view()
			err = cmd.Command(v)
			if err == nil {
				t.Fatalf("the commander ordered a group of %v and reported success; %d of %d order slots "+
					"were spoken to and the rest of the order was thrown away",
					tc.units, countSpoken(v.Commands), len(v.Commands))
			}
			if !strings.Contains(err.Error(), tc.field) || !strings.Contains(err.Error(), tc.expect) {
				t.Errorf("the error does not name %s and %q: %v", tc.field, tc.expect, err)
			}
		})
	}
	// And the control: the same commander naming units that ARE there is ordered
	// without complaint, so the refusals above are about the membership and not
	// about the shape.
	ok, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: []int{0, 1, 2}},
	})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}
	if err := ok.Command(view()); err != nil {
		t.Fatalf("a group of three real side A units was refused: %v", err)
	}
}

// TestAMoveWalksToThePointAndStopsThere is the move order, which is the one of the
// fourteen that a player reaches for most and which has to arrive rather than
// merely move.
//
// It is checked against a hand-built view rather than a battle because the question
// is arithmetic: does the anchor walk towards the point, does it stop when it gets
// there, and does it go there rather than somewhere on the way to the enemy. The
// destination is deliberately off the line to the enemy, so an implementation that
// walked towards the enemy would be caught.
func TestAMoveWalksToThePointAndStopsThere(t *testing.T) {
	cfg := loadConfig(t)
	fc := cfg.Formation
	const (
		n      = 8
		settle = 30
		startX = -300.0
		enemyX = 400.0
		destX  = 0.0
		destY  = 250.0
	)
	// The view: n side A men in a small blob, side B far away to the east, so the
	// enemy is in +X and the destination is mostly in +Y.
	v := &View{
		Elapsed:     0,
		TickSeconds: cfg.Battle.TickSeconds,
		Units:       make([]UnitView, n+2),
		Commands:    make([]UnitCommand, n+2),
	}
	for i := range v.Units {
		u := UnitView{ID: i, Side: SideA, Status: StatusFighting, Troops: 10, Speed: 4, X: startX, Y: 0}
		switch {
		case i == n:
			u = UnitView{ID: i, Side: SideB, Status: StatusFighting, Troops: 200, Speed: 4, X: enemyX, Y: 0}
		case i == n+1:
			u = UnitView{ID: i, Side: SideB, Status: StatusFighting, Troops: 200, Speed: 4, X: enemyX, Y: 60}
		default:
			u.X = startX + float64(i)*2
			u.Y = float64(i) - 3
		}
		v.Units[i] = u
	}
	units := make([]int, n)
	for i := range units {
		units[i] = i
	}
	cmd, err := NewFormationCommander(cfg, SideA, []Group{{
		Order: GroupOrder{
			Kind:  FormationLine,
			Order: OrderFormationMove,
			At:    &Destination{X: destX, Y: destY},
		},
		Units: units,
	}})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}

	// Walk the commander by hand, applying the movement it orders, and watch the
	// group's own centre of mass. The blob is 16 m across and the shape is a line,
	// so the first ticks are the men converging into the shape and the rest are
	// the shape walking.
	step := func() {
		for i := range v.Commands {
			v.Commands[i] = UnitCommand{}
		}
		if err := cmd.Command(v); err != nil {
			t.Fatalf("ordering the move failed at elapsed %.1f: %v", v.Elapsed, err)
		}
		for i := range v.Commands {
			c := v.Commands[i]
			if !c.Set {
				continue
			}
			v.Units[i].X += c.DX
			v.Units[i].Y += c.DY
		}
		v.Tick++
		v.Elapsed += cfg.Battle.TickSeconds
	}
	// The anchor is read with the same function the commander reads it with. A
	// test that weighs positions itself is a test of its own arithmetic: an
	// earlier version of this one summed the coordinates and divided by the bodies
	// standing on them, which is eight times too small a number, and reported a
	// formation that had gone nowhere while the log above it walked 0.33 m a tick.
	anchorAt := func() (float64, float64) {
		x, y, ok := centreOfMass(v, units)
		if !ok {
			t.Fatalf("the group has no bodies left to have an anchor")
		}
		return x, y
	}
	// How long the walk is allowed to take, worked out from the pace rather than
	// guessed: the distance to the point, at the pace a move walks, in ticks. The
	// +120 is slack for the shape forming first and for the anchor closing the last
	// spacing, and it is slack rather than the answer because the point of the test
	// is that the formation arrives on its own, not that it arrives by tick N.
	pushPerTick := fc.AdvanceSpeed * cfg.Battle.TickSeconds
	if pushPerTick <= 0 {
		t.Fatalf("advance_speed %g m/s over a %g s tick is not a walk at all", fc.AdvanceSpeed, cfg.Battle.TickSeconds)
	}
	walk := int(math.Ceil(math.Hypot(destX-startX, destY) / pushPerTick))
	ticks := settle + walk + 120
	t.Logf("a walk of %.1f m at %.2f m/s is %.4f m a tick, so %d ticks to arrive, and %d ticks allowed "+
		"after the shape has formed", math.Hypot(destX-startX, destY), fc.AdvanceSpeed, pushPerTick, walk, ticks)

	for i := 0; i < settle; i++ {
		step()
	}
	fromX, fromY := anchorAt()
	fromBearing := Bearing(fromX, fromY, destX, destY)
	enemyBearing := Bearing(fromX, fromY, enemyX, 30)
	for i := 0; i < ticks-settle; i++ {
		step()
		if (i+1)%200 == 0 {
			x, y := anchorAt()
			t.Logf("tick %d of %d: anchor (%+.3f, %+.3f), %.1f m from the point", i+1, ticks-settle, x, y,
				math.Hypot(x-destX, y-destY))
		}
	}
	toX, toY := anchorAt()

	// One: it arrived. The tolerance is the shape's own spacing, which is the rule
	// the layer already uses for a man being in his place.
	tol := cohesionTolerance(FormationLine, FormationParamsFrom(fc))
	left := math.Hypot(toX-destX, toY-destY)
	if left > tol {
		t.Errorf("after %d ticks the formation's anchor is at (%+.1f, %+.1f), %.2f m from the point "+
			"(%+.1f, %+.1f) it was ordered to; it is more than its own %.2f m tolerance away",
			ticks, toX, toY, left, destX, destY, tol)
	}

	// Two: it went to the point rather than towards the enemy. The enemy is due
	// east and the point is north-east, about 60 degrees off the line to the
	// enemy, so a formation that marched towards the enemy instead would have
	// travelled a bearing tens of degrees away from the one it was given.
	//
	// The check is on the bearing travelled, not on the sign of a coordinate. The
	// point happens to be east as well as north, so a test that complained about
	// eastward movement would be complaining about the point I chose; the bearing
	// is the thing the order is actually about.
	travelled := Bearing(fromX, fromY, toX, toY)
	if off := math.Abs(wrapAngle(travelled - fromBearing)); off > 0.05 {
		t.Errorf("the formation travelled on a bearing of %.1f degrees and was ordered to a point on one "+
			"of %.1f degrees, %.1f degrees off; it walked somewhere other than where it was told",
			travelled*180/math.Pi, fromBearing*180/math.Pi, off*180/math.Pi)
	}
	if off := math.Abs(wrapAngle(travelled - enemyBearing)); off < 0.2 {
		t.Errorf("the formation travelled on a bearing of %.1f degrees, which is within %.1f degrees of the "+
			"bearing to the enemy at (%+.0f, +30) of %.1f degrees; it marched at the enemy instead of to its "+
			"point", travelled*180/math.Pi, off*180/math.Pi, enemyX, enemyBearing*180/math.Pi)
	}

	// Three: it stopped. A formation that reaches its point and keeps walking is
	// an order that never expires, and the last fifty ticks are where that shows.
	beforeX, beforeY := anchorAt()
	for i := 0; i < 50; i++ {
		step()
		if i%10 == 0 {
			x, y := anchorAt()
			t.Logf("  after arrival, tick %d: anchor (%+.3f, %+.3f)", i+1, x, y)
		}
	}
	afterX, afterY := anchorAt()
	if drift := math.Hypot(afterX-beforeX, afterY-beforeY); drift > tol {
		t.Errorf("the formation had arrived at (%+.2f, %+.2f) and was then at (%+.2f, %+.2f) fifty ticks "+
			"later, a drift of %.2f m; a move that never stops is not a move", beforeX, beforeY, afterX, afterY, drift)
	}
	t.Logf("a move ordered from (%+.1f, %+.1f) to (%+.0f, %+.0f) arrived at (%+.2f, %+.2f), %.3f m "+
		"short after %d ticks, and then held for 50 more: walked %+.1f m east and %+.1f m north on a "+
		"bearing of %.1f degrees where the point was on %.1f and the enemy on %.1f",
		fromX, fromY, destX, destY, toX, toY, left, ticks, toX-fromX, toY-fromY,
		travelled*180/math.Pi, fromBearing*180/math.Pi, enemyBearing*180/math.Pi)
}

// TestAnArrivedMoveCementsItselfAtTheHoldPace is the half of a move that is easy
// to leave out, and it is a claim about numbers rather than about direction.
//
// A shape that has walked to its point has stopped walking. What it does after
// that is cohesion, and cohesion is the hold's pace, because a formation tidying
// itself up is a formation standing still. Left at the marching pace, an arrived
// move keeps jogging men back into their slots at a third more than a hold walks,
// forever, which is a formation that never quite arrives and a player who is told
// the wrong thing about what stopping means.
//
// It is measured by shoving one man out of his slot and reading the step the
// commander ordered him, so it is the pace that is checked and not the direction
// the man went, which the other test covers.
func TestAnArrivedMoveCementsItselfAtTheHoldPace(t *testing.T) {
	cfg := loadConfig(t)
	fc := cfg.Formation
	const n = 6
	v := &View{
		Elapsed:     0,
		TickSeconds: cfg.Battle.TickSeconds,
		Units:       make([]UnitView, n+1),
		Commands:    make([]UnitCommand, n+1),
	}
	for i := range v.Units {
		u := UnitView{ID: i, Side: SideA, Status: StatusFighting, Troops: 10, Speed: 4, X: -400, Y: 0}
		if i == n {
			u = UnitView{ID: i, Side: SideB, Status: StatusFighting, Troops: 200, Speed: 4, X: 400, Y: 0}
		}
		v.Units[i] = u
	}
	units := make([]int, n)
	for i := range units {
		units[i] = i
	}
	// The men are stood on their slots before the order is given, so the only thing
	// wrong with the shape is the one man this test shoves. A group dropped in as a
	// blob and ordered to a point it happens to be standing in is a group that is
	// walking, not one that has arrived, and every man in it would be out of his
	// place for reasons that have nothing to do with the order.
	slots, err := FormationLayout(FormationLine, n, FormationParamsFrom(fc))
	if err != nil {
		t.Fatalf("laying out the line: %v", err)
	}
	for i, id := range units {
		x, y := slots[i].place(0, 0, 0)
		v.Units[id].X, v.Units[id].Y = x, y
	}
	// The point is where the shape already stands, so this move has arrived before
	// it has begun.
	hx, hy, ok := centreOfMass(v, units)
	if !ok {
		t.Fatal("the group has no weight on the field")
	}
	cmd, err := NewFormationCommander(cfg, SideA, []Group{{
		Order: GroupOrder{Kind: FormationLine, Order: OrderFormationMove, At: &Destination{X: hx, Y: hy}},
		Units: units,
	}})
	if err != nil {
		t.Fatalf("building the formation commander failed: %v", err)
	}
	if err := cmd.Command(v); err != nil {
		t.Fatalf("commanding an arrived move: %v", err)
	}
	// One man is out of his place. Shove him two metres, which is more than the
	// shape's spacing and so cannot be mistaken for a man who is standing in it.
	v.Units[0].Y += 2
	if err := cmd.Command(v); err != nil {
		t.Fatalf("commanding the tick after the shove: %v", err)
	}
	got := v.Commands[0]
	if !got.Set {
		t.Fatal("a man two metres from his slot was given no order at all; the shape is not being held")
	}
	step := math.Hypot(got.DX, got.DY)
	// The pace a man walks at is his own speed over the roster's average speed,
	// times the formation's pace, times the tick. See paceScale.
	walked := func(mps float64) float64 {
		return v.Units[0].Speed * mps * cfg.Battle.TickSeconds / cfg.Battle.RosterSpeedBase
	}
	hold, march := walked(fc.HoldSpeed), walked(fc.AdvanceSpeed)
	if math.Abs(step-hold) > 1e-9 {
		t.Errorf("a man 2 m from his slot in an arrived move was told to walk %.4f m in a tick; the hold's "+
			"pace is %.4f m and the marching pace is %.4f m", step, hold, march)
	}
	// And the shape is not marching. Every other man is within his own spacing of
	// his slot, and inside that spacing there are two answers and only two: a man
	// within the pinning radius is pinned with a step of zero, and a man between
	// the pinning radius and a whole frontage is walked back onto his slot at the
	// hold's own pace. Neither is the marching pace, which is the whole of what
	// "an arrived shape cements itself" means, and neither is silence, because
	// silence hands a man to an engine whose own rules for one out of contact are
	// to close on the enemy.
	pinned, tidied := 0, 0
	for i := 1; i < n; i++ {
		got := v.Commands[i]
		if !got.Set {
			t.Errorf("man %d, within his own spacing of his slot in an arrived move, was given no "+
				"order at all; an arrived shape pins or tidies its men, because silence hands them "+
				"to an engine that advances them", i)
			continue
		}
		step := math.Hypot(got.DX, got.DY)
		switch {
		case step == 0:
			pinned++
		case math.Abs(step-hold) <= 1e-9:
			tidied++
		default:
			t.Errorf("man %d, within his own spacing of his slot in an arrived move, was told to "+
				"walk %.4f m, which is neither the hold's %.4f m nor nothing at all; an arrived "+
				"shape is a hold", i, step, hold)
		}
	}
	t.Logf("a move to the point (%+.2f, %+.2f) the shape was already standing on: a man shoved 2 m from "+
		"his slot was told %.4f m this tick, which is the hold's %.4f m and not the march's %.4f m, and "+
		"of the other %d, %d were pinned and %d tidied at the hold's pace",
		hx, hy, step, hold, march, n-1, pinned, tidied)
}

// countSpoken is how many order slots were spoken to at all, movement or shape.
func countSpoken(cmds []UnitCommand) int {
	n := 0
	for _, c := range cmds {
		if c.Set || c.FormationSet {
			n++
		}
	}
	return n
}

// TestAFollowerStandsBehindTheGroupItFollows is the follow order as arithmetic,
// with the numbers written out rather than measured off a battle.
//
// Three things have to be true at once and none of them implies the others. The
// follower stands BEHIND, which is the leader's back and not the world's -Y: a
// commander whose groups face north has its followers to the south, and a test
// that only ever faces one way cannot tell a follower from a group that happens
// to be south of the other one. It stands one rank of room behind the leader's
// last rank, which is the room the balance file says a rank needs and not a
// distance written here. And it stands there exactly, so the men land on their
// slots around that point on the first tick rather than converging on it over the
// next minute.
func TestAFollowerStandsBehindTheGroupItFollows(t *testing.T) {
	cfg := loadConfig(t)
	p := FormationParamsFrom(cfg.Formation)
	// Facing EAST, so the leader's back is -X and the world has no opinion about
	// it. An implementation that put the follower to the south whatever the facing
	// would pass a test whose leader faces north and fail this one, and the
	// follower is dropped due south of the leader so that walking to the right
	// place is unambiguously northward and westward at the same time.
	const (
		leaderFacing = 0.0
		leaderX      = 30.0
		leaderY      = 12.0
		perGroup     = 4
	)
	v := &View{
		Elapsed:     0,
		TickSeconds: cfg.Battle.TickSeconds,
		Units:       make([]UnitView, 2*perGroup+1),
		Commands:    make([]UnitCommand, 2*perGroup+1),
	}
	leader := make([]int, perGroup)
	follower := make([]int, perGroup)
	for i := 0; i < perGroup; i++ {
		leader[i] = i
		follower[i] = perGroup + i
	}
	// The leader is stood on its slots so its anchor is exactly where it is put,
	// and the follower is dropped well away from where it belongs so that any
	// movement it is ordered is a move towards the right place rather than a
	// settling.
	lslots, err := FormationLayout(FormationLine, perGroup, p)
	if err != nil {
		t.Fatalf("laying out the leader: %v", err)
	}
	for i, id := range leader {
		x, y := lslots[i].place(leaderX, leaderY, leaderFacing)
		v.Units[id] = UnitView{ID: id, Side: SideA, Status: StatusFighting, Troops: 10, Speed: 4, X: x, Y: y}
	}
	for _, id := range follower {
		v.Units[id] = UnitView{ID: id, Side: SideA, Status: StatusFighting, Troops: 10, Speed: 4,
			X: leaderX, Y: leaderY + 200}
	}
	v.Units[2*perGroup] = UnitView{ID: 2 * perGroup, Side: SideB, Status: StatusFighting, Troops: 200,
		Speed: 4, X: 400, Y: 0}
	zero := 0
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold,
			Facing: Facing{Bearing: leaderFacing, Fixed: true}}, Units: leader},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: &zero}, Units: follower},
	})
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := cmd.Command(v); err != nil {
		t.Fatalf("Command: %v", err)
	}

	// What the geometry says, worked out here rather than read back out of the
	// layer: the leader's rear rank is at its own minForward, the follower's front
	// rank goes one rank of room behind that, and a single-rank line has every rank
	// on its anchor, so both minForward and the follower's maxForward are zero.
	leadMin, _, _, _, err := FormationExtent(lslots)
	if err != nil {
		t.Fatalf("leader extent: %v", err)
	}
	fslots, err := FormationLayout(FormationLine, perGroup, p)
	if err != nil {
		t.Fatalf("laying out the follower: %v", err)
	}
	_, _, _, followerMax, err := FormationExtent(fslots)
	if err != nil {
		t.Fatalf("follower extent: %v", err)
	}
	fwd := leadMin - p.RankSpacing - followerMax
	wantX := leaderX + math.Cos(leaderFacing)*fwd
	wantY := leaderY + math.Sin(leaderFacing)*fwd

	// The follower's men are ordered towards their slots around that point, so the
	// direction each is walking is the direction from him to the place he should be.
	summed := 0.0
	for _, id := range follower {
		c := v.Commands[id]
		if !c.Set {
			t.Fatalf("follower unit %d was given no order; it is 200 m from where it should be", id)
		}
		summed += math.Hypot(c.DX, c.DY)
	}
	// One tick's walk towards the slots is all a follower gets, however far away it
	// is, and that is the cap that keeps it from teleporting into place.
	want := cfg.Formation.AdvanceSpeed * cfg.Battle.TickSeconds
	for _, id := range follower {
		c := v.Commands[id]
		step := math.Hypot(c.DX, c.DY)
		if step > want+1e-9 {
			t.Errorf("follower unit %d was told to walk %.3f m in a tick, more than the %.3f m a "+
				"formation walks in one tick; a follower that could cover any distance could also "+
				"cover a distance nobody walked", id, step, want)
		}
	}
	// The commanded anchor itself, read back off the group the layer built. This is
	// the exact statement of the geometry: not that the men are heading the right
	// way, which a large enough step would satisfy from anywhere, but that the
	// shape was centred on this point and not a neighbouring one.
	g := cmd.groups[1]
	if !g.anchored {
		t.Fatal("the follower was ordered and published no anchor, so nothing can follow it either")
	}
	if d := math.Hypot(g.anchorX-wantX, g.anchorY-wantY); d > 1e-9 {
		t.Errorf("the follower's anchor is at (%+.6f, %+.6f) and the geometry says (%+.6f, %+.6f), "+
			"%.6f m apart", g.anchorX, g.anchorY, wantX, wantY, d)
	}

	// And it is walking south and west: south because this follower was dropped due
	// south of its leader and has to come back up to it, west because behind a
	// leader facing east is west. Every follower is ordered, so this is the
	// direction of every step the group was given.
	southWest, other := 0, 0
	for _, id := range follower {
		c := v.Commands[id]
		if c.DY < 0 && c.DX < 0 {
			southWest++
			continue
		}
		other++
		t.Errorf("follower unit %d was told to walk (%+.4f, %+.4f); it is due south of its leader and "+
			"behind a leader facing east is west, so it should be walking south-west", id, c.DX, c.DY)
	}
	if southWest != perGroup {
		t.Errorf("%d of %d men in a group following a leader that faces east walked south-west, and "+
			"%d walked somewhere else", southWest, perGroup, other)
	}
	t.Logf("a leader of %d men facing east at (%+.1f, %+.1f), rear rank at forward %+.2f, and a "+
		"follower of %d whose front rank goes one rank of room (%.2f m) behind it: the follower's "+
		"anchor is at (%+.6f, %+.6f) exactly, its men walk %d steps totalling %.3f m this tick "+
		"under the %.3f m one-tick cap, and all %d of them walk south-west",
		perGroup, leaderX, leaderY, leadMin, perGroup, p.RankSpacing, g.anchorX, g.anchorY, perGroup,
		summed, want, southWest)
}

// TestAFollowIsRefusedWhenItNamesNothingThere is the refusal half of follow: a
// follow that cannot be carried out is an error and not a group that quietly
// stands still.
func TestAFollowIsRefusedWhenItNamesNothingThere(t *testing.T) {
	cfg := loadConfig(t)
	ids := []int{0, 1, 2, 3}
	line := GroupOrder{Kind: FormationLine, Order: OrderFormationHold}
	idx := func(i int) *int { return &i }
	cases := []struct {
		name   string
		groups []Group
		want   string
	}{
		{
			name: "itself",
			groups: []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(0)}, Units: ids},
			},
			want: "follow itself",
		},
		{
			name: "a group this commander does not have",
			groups: []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(4)}, Units: ids},
			},
			want: "built with 1 groups",
		},
		{
			name: "two groups following each other",
			groups: []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(1)}, Units: ids[:2]},
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(0)}, Units: ids[2:]},
			},
			want: "a circle",
		},
		{
			name: "three groups in a circle",
			groups: []Group{
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(1)}, Units: ids[:1]},
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(2)}, Units: ids[1:2]},
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold, Follow: idx(0)}, Units: ids[2:]},
			},
			want: "a circle",
		},
		{
			name: "a place to go and a group to follow",
			groups: []Group{
				{Order: line, Units: ids[:2]},
				{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationMove,
					At: &Destination{X: 10, Y: 10}, Follow: idx(0)}, Units: ids[2:]},
			},
			want: "two destinations",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewFormationCommander(cfg, SideA, tc.groups)
			if err == nil {
				t.Fatalf("a commander was built for a follow that %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("refused with %q, which does not say %q", err, tc.want)
			}
			t.Logf("%s -> %v", tc.name, err)
		})
	}
}

// driveFormationTick hands one tick of a hand-built field to a commander, applies
// what it wrote, and returns the orders it wrote.
//
// It is here because a field built by hand has no engine to advance it, and
// applying the orders is the whole of what a battle does with them: an order is a
// movement in metres and the man is somewhere else afterwards. It writes the moved
// positions back into the slice it was given, because the view it builds is reused
// and a caller holding the positions has to be holding the current ones.
func driveFormationTick(t *testing.T, c Commander, tickSeconds float64, units []UnitView) []UnitCommand {
	t.Helper()
	v := &View{
		Tick:        1,
		Elapsed:     tickSeconds,
		TickSeconds: tickSeconds,
		Units:       make([]UnitView, len(units)),
		Commands:    make([]UnitCommand, len(units)),
	}
	copy(v.Units, units)
	if err := c.Command(v); err != nil {
		t.Fatalf("the commander refused a field of %d units: %v", len(units), err)
	}
	out := make([]UnitCommand, len(v.Commands))
	copy(out, v.Commands)
	for i := range v.Units {
		if !out[i].Set {
			continue
		}
		v.Units[i].X += out[i].DX
		v.Units[i].Y += out[i].DY
	}
	copy(units, v.Units)
	return out
}

// centreOfMassOf is the anchor orderGroup lays slots around: the group's centre of
// mass, bodies-weighted, over the ids given. It is centreOfMass for a plain list
// of view rows, which is what a hand-built field is made of.
func centreOfMassOf(units []UnitView, ids []int) (float64, float64, bool) {
	var x, y, w float64
	for _, id := range ids {
		if id < 0 || id >= len(units) {
			continue
		}
		troops := units[id].Troops
		if troops <= 0 {
			troops = 1
		}
		x += units[id].X * troops
		y += units[id].Y * troops
		w += troops
	}
	if w == 0 {
		return 0, 0, false
	}
	return x / w, y / w, true
}

// spreadFromSlots measures how far a subset of a group is from the slots the
// group's own layout gives them, and returns the mean and the worst.
//
// measure is a subset of members, and it is looked up in members rather than
// walked in step with it, because the subset is not a prefix: a company of fifteen
// that loses its middle five has a hole in the middle, and the eight men on either
// side of the hole hold slots 0-4 and 10-14 of the fifteen, not 0-9 of a shorter
// line. Measuring a subset against the first k slots of a shorter layout is a test
// that passes on a shape nobody is standing in.
//
// The measurement is against the group's own centre of mass, so it is a statement
// about the shape and not about where the shape happens to be on the field: a
// formation that walks is still a formation, and this says so.
func spreadFromSlots(t *testing.T, units []UnitView, members, measure []int, slots []Slot,
	ax, ay, facing float64) (mean, worst float64) {
	t.Helper()
	if len(slots) != len(members) {
		t.Fatalf("measuring %d men against a layout of %d for a group of %d",
			len(measure), len(slots), len(members))
	}
	at := make(map[int]int, len(members))
	for i, id := range members {
		at[id] = i
	}
	var sum float64
	for _, id := range measure {
		i, ok := at[id]
		if !ok {
			t.Fatalf("unit %d is being measured and is not in the group of %d", id, len(members))
		}
		x, y := slots[i].place(ax, ay, facing)
		d := math.Hypot(x-units[id].X, y-units[id].Y)
		sum += d
		if d > worst {
			worst = d
		}
	}
	return sum / float64(len(measure)), worst
}

// A formation that has been routed is a shape with a hole in it, and the hole is
// the ordinary case in a battle rather than the exception: a third of a company
// running is a Tuesday. What the shape owes the men still in it is that it closes
// up around them and stays a shape. What it owes the men who come back is that it
// takes them in again rather than leaving them standing where they stopped.
//
// Neither is free. A group whose members are re-slotted for a smaller number gets
// a different layout every time the count moves, so a rout hands every man who
// stayed a new slot and a rally hands them all another, and a shape rebuilt
// carelessly is a shape that comes apart twice in one battle. And a man who rallied
// is, in the real case, tens of metres from the group he was in, so the order that
// takes him back has to be an order he can obey: a pace that walks him home, not
// one that teleports him and not silence.
//
// # WHY THE FIELD IS BUILT BY HAND
//
// The rally itself belongs to the morale stage, which owns the chance and the
// officer's reach, and that stage's own tests own that. What is under test here is
// the formation layer's half of the bargain: a man whose status has come back to
// fighting is put back in the shape, and a man whose status has not is left alone.
// Both are statements about a View, so the View is written out and the commander's
// answers are read off it. The men who run are moved by hand for the same reason: a
// rout is this test's input, not the thing being measured.
func TestAFormationSurvivesARoutAndReformsOnRally(t *testing.T) {
	cfg := loadConfig(t)
	p := FormationParamsFrom(cfg.Formation)
	// How far a man may be from his slot and still count as standing in it: the
	// shape's own spacing, once. Every bound below is this number, because it is
	// the file's own statement of what "in his place" means and a test that
	// invents a tighter one is testing a stricter game than the balance file plays.
	spacing := cohesionTolerance(FormationLine, p)
	// A company of fifteen, one rank at the file's own frontage, and one man of the
	// other army far enough east to be worth facing. Facing matters: the slots are
	// laid out in the commander's frame, and a line with no enemy in it would be a
	// line facing a bearing nothing chose.
	const (
		men    = 15
		broken = 5
	)
	ids := make([]int, men)
	for i := range ids {
		ids[i] = i
	}
	full, err := FormationLayout(FormationLine, men, p)
	if err != nil {
		t.Fatalf("a line of %d: %v", men, err)
	}
	units := make([]UnitView, men+1)
	for i := 0; i < men; i++ {
		x, y := full[i].place(-400, 0, 0)
		units[i] = UnitView{ID: i, Side: SideA, Status: StatusFighting, X: x, Y: y,
			Troops: 1, Speed: 4, HPFrac: 1, Morale: 1}
	}
	units[men] = UnitView{ID: men, Side: SideB, Status: StatusFighting, X: 400, Y: 0,
		Troops: 1, Speed: 4, HPFrac: 1, Morale: 1}

	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: ids},
	})
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	// The facing the commander settled on, read back rather than assumed: the
	// measurement is only meaningful in the frame the slots were laid out in.
	driveFormationTick(t, cmd, cfg.Battle.TickSeconds, units)
	facing := cmd.groups[0].facing
	if math.Abs(wrapAngle(facing)) > 1e-9 {
		t.Fatalf("the line faces %.4f rad with the enemy due east; the test's own geometry is "+
			"wrong, so a failure below would be the test's and not the commander's", facing)
	}

	// The five who break are the middle of the rank, which is the case that
	// hurts: the hole is in the middle of the shape, so the men on either side of
	// it are the ones whose slots move.
	runners := make([]int, 0, broken)
	for i := (men - broken) / 2; i < (men-broken)/2+broken; i++ {
		runners = append(runners, i)
	}
	brokenSet := make(map[int]bool, len(runners))
	for _, id := range runners {
		brokenSet[id] = true
	}
	held := make([]int, 0, men-broken)
	for _, id := range ids {
		if !brokenSet[id] {
			held = append(held, id)
		}
	}

	// --- the rout ----------------------------------------------------------
	// The status is what the morale stage would have written, and the run is what
	// the intent stage does with it: a man who is running goes away from the fight
	// at a run, which at these numbers is about a metre a tick. Forty ticks is ten
	// seconds of it, enough to put him well outside the shape's own spacing and
	// short enough that he has not left the field.
	const (
		routTicks   = 40
		runPerTick  = 1.0
		routedMetre = routTicks * runPerTick
	)
	for _, id := range runners {
		units[id].Status = StatusRouted
		units[id].Morale = 0
	}
	for k := 0; k < routTicks; k++ {
		driveFormationTick(t, cmd, cfg.Battle.TickSeconds, units)
		for _, id := range runners {
			units[id].X -= runPerTick
		}
	}
	// The men who stayed are a line of ten now, and it is a line around them.
	ten, err := FormationLayout(FormationLine, len(held), p)
	if err != nil {
		t.Fatalf("a line of %d: %v", len(held), err)
	}
	ax, ay, ok := centreOfMassOf(units, held)
	if !ok {
		t.Fatal("no weight left in the group after the rout")
	}
	mean, worst := spreadFromSlots(t, units, held, held, ten, ax, ay, facing)
	// Kept because the rally moves the anchor and the test wants to say by how
	// much: a shape that re-centres on the men who came back is doing arithmetic
	// the reader should be able to check.
	holdAnchorX, holdAnchorY := ax, ay
	if mean > spacing {
		t.Errorf("after %d ticks with %d of %d men running, the %d who stayed finished a mean of "+
			"%.2f m from the slots of a line of %d (worst %.2f m), against a shape whose own "+
			"tolerance is %.2f m; a hole in a formation is not a reason for the rest of it to come apart",
			routTicks, broken, men, len(held), mean, len(held), worst, spacing)
	}
	// And the five who are running are not in it. The formation layer does not get
	// to decide that a routed man rejoins his slot: a broken man is withdrawing and
	// a routed one is out of the fight, and a shape is not a reason to put either
	// of them back.
	cmds := driveFormationTick(t, cmd, cfg.Battle.TickSeconds, units)
	for id, c := range cmds {
		if !brokenSet[id] {
			continue
		}
		if c.Set || c.FormationSet {
			t.Errorf("unit %d is routed and was spoken to anyway (Set=%v FormationSet=%v %+.3f, "+
				"%+.3f): a man who is running is left to the engine's own rules, which are the ones "+
				"that get him off the field", id, c.Set, c.FormationSet, c.DX, c.DY)
		}
	}

	// --- the rally ---------------------------------------------------------
	// A rally is a status and nothing else at this layer: the man is fighting
	// again. He is where the rout left him, which is the whole difficulty.
	for _, id := range runners {
		units[id].Status = StatusFighting
		units[id].Morale = 1
	}
	cmds = driveFormationTick(t, cmd, cfg.Battle.TickSeconds, units)
	ax, ay, ok = centreOfMassOf(units, ids)
	if !ok {
		t.Fatal("no weight left in the group after the rally")
	}
	// A formation's step is its own pace times the tick, whatever the man's speed,
	// because the speed only scales it: the base is the speed a nominal man walks
	// at and a faster man walks the same walk faster. That is the ceiling, and an
	// order past it is not a man returning to his unit, it is a man being moved.
	ceiling := cfg.Formation.HoldSpeed * cfg.Battle.TickSeconds
	inGroup := make(map[int]bool, len(ids))
	for _, id := range ids {
		inGroup[id] = true
	}
	for id, c := range cmds {
		// The other army is on this field too. Nothing was ordered to it, and a
		// channel it was not spoken to says nothing about whether the order
		// reached the men it was for.
		if !inGroup[id] {
			continue
		}
		if !c.FormationSet || c.Formation != FormationLine {
			t.Errorf("unit %d rallied and was not put back in the line (FormationSet=%v, %v)", id,
				c.FormationSet, c.Formation)
			continue
		}
		sx, sy := full[id].place(ax, ay, facing)
		if !c.Set {
			t.Errorf("unit %d rallied %.1f m from his slot and was given no order at all; the "+
				"order that walks a man back is the whole of what the rally is worth to him",
				id, math.Hypot(sx-units[id].X, sy-units[id].Y))
			continue
		}
		// The step has to point at the slot, not away from it, and it has to be a
		// pace he can walk. Both are checked against the slot rather than against
		// the group's middle, because a line's slots are all in one rank and a man
		// who has run off the end of it has further to go sideways than forwards.
		home := math.Hypot(sx-units[id].X, sy-units[id].Y)
		if home < 1e-9 {
			continue
		}
		if toward := (c.DX*(sx-units[id].X) + c.DY*(sy-units[id].Y)) / home; toward <= 0 {
			t.Errorf("unit %d rallied %.1f m from his slot and was told to step %+.3f, %+.3f, which "+
				"points away from it", id, home, c.DX, c.DY)
		}
		if got := math.Hypot(c.DX, c.DY); got > ceiling*(1+1e-9) {
			t.Errorf("unit %d was told to step %.3f m in one tick to get back to his slot, which is "+
				"more than the %.3f m a formation walks in a tick at the hold's pace", id, got, ceiling)
		}
	}
	// The men who held the shape are walked, not dragged, and the shape says why
	// it moved them at all.
	//
	// A rally re-centres the shape, and that is worth being explicit about rather
	// than asserting a tidier story. The anchor is the centre of mass of the men
	// the commander has, so five men who come back from forty metres behind it
	// pull it back by their share of the difference, and the rank the other ten
	// were standing in is laid out around the new middle. Here that is about
	// thirteen metres: the line steps back to take the five in and they walk
	// forward to their slots, and both halves of that are the same order at the
	// same pace. The alternative, pinning the rank where it was and sending the
	// five forward to it, was not chosen here: the shape is the shape of the men
	// the commander has, and a line that claims ground its own men are not standing
	// on is a line whose slots are a place rather than a formation.
	//
	// So the claim under test is the narrow one that is actually true: nobody is
	// moved further in a tick than a formation walks in a tick, and a man who is
	// given no order at all is a man already in his place.
	movedHeld, silentHeld := 0, 0
	for _, id := range held {
		sx, sy := full[id].place(ax, ay, facing)
		off := math.Hypot(sx-units[id].X, sy-units[id].Y)
		c := cmds[id]
		if !c.Set {
			silentHeld++
			if off > spacing {
				t.Errorf("unit %d held the shape and is %.2f m from his slot, and was given no "+
					"order; silence means a man already in his place", id, off)
			}
			continue
		}
		movedHeld++
		if got := math.Hypot(c.DX, c.DY); got > ceiling*(1+1e-9) {
			t.Errorf("unit %d held the shape and was told to step %.3f m in one tick when the shape "+
				"re-centred on the rally, which is more than the %.3f m a formation walks in a tick; "+
				"the men who held were dragged", id, got, ceiling)
		}
	}
	recentred := math.Hypot(ax-holdAnchorX, ay-holdAnchorY)

	// --- and the shape closes again ----------------------------------------
	// Long enough for the slowest man to walk home at the hold's own pace, which is
	// the pace a man rejoining a formation is given: he is not charging, he is
	// catching up. Routed metres plus a margin, over the pace, rounded up, so the
	// number comes from the balance file rather than from a hope.
	const margin = 1.5
	back := (routedMetre*margin)/ceiling + 1
	for k := 0; k < int(back); k++ {
		driveFormationTick(t, cmd, cfg.Battle.TickSeconds, units)
	}
	ax, ay, _ = centreOfMassOf(units, ids)
	mean, worst = spreadFromSlots(t, units, ids, ids, full, ax, ay, facing)
	if mean > spacing {
		t.Errorf("%d ticks after the rally the %d men finished a mean of %.2f m from their slots "+
			"(worst %.2f m), against a shape whose own tolerance is %.2f m; the men came back and "+
			"the shape did not", int(back), men, mean, worst, spacing)
	}
	t.Logf("%d men: %d ran %.0f m over %d ticks, rallied, and the line was whole again %d ticks "+
		"later at a mean of %.3f m from the slots (worst %.3f m, tolerance %.2f m); the shape "+
		"re-centred %.1f m to take the %d back, walking the %d who held rather than dragging "+
		"them (%d of them asked to step, %d already in place)",
		men, broken, routedMetre, routTicks, int(back), mean, worst, spacing,
		recentred, broken, len(held), movedHeld, silentHeld)
}

// pairSpy watches a commanded formation for the two things a whole battle can do
// to it: put two of its men inside each other, and fail to finish forming up.
//
// Both are read off the commander itself rather than recomputed. The commander
// publishes the anchor it worked from and keeps the layout it laid out, so the spy
// measures the men against the slots they were actually given, which is the only
// measurement that cannot quietly disagree with the code it is testing.
type pairSpy struct {
	under Commander
	ids   []int
	// standing is the distance within which every man of the shape counts as being
	// on his own slot, and it is the shape's own drawn gap between its two closest
	// slots rather than battle.front_spacing, because the shapes do not share a
	// spacing: a line draws its men 1.50 m apart and skirmish 3.49 m. This is the
	// state in which the question of order across the rank is asked at all.
	standing float64
	// scatter is how far this shape's own layout pushes a man off his lattice
	// point, which is zero for every shape but skirmish. Two slots closer across
	// than this are the same column and their left-to-right order is the hash's.
	scatter float64
	// comparable counts the pairs skipped for that reason over the whole battle,
	// so the number of pairs the question was actually asked of is visible in the
	// log rather than implied.
	comparable int
	// tight is the closest pair of members on each tick, and off is the furthest
	// any member is from his own slot on that tick.
	tight []float64
	off   []float64
	tick  []int
	// gap is the distance from the nearest man of the group to the nearest enemy,
	// per tick, which is what says whether the formation is marching or fighting.
	gap []float64
	// crossed counts the pairs of men whose order across the shape has inverted on
	// each tick, and the first one that ever did is kept with its tick.
	crossed   []int
	worstPair int
	firstTick int
	firstA    int
	firstB    int
	firstD    float64
	// firstAxis is which axis the first inversion was on, because a column's
	// inversions are in depth and a rank's are across, and "the wrong way round"
	// is not the same defect in the two.
	firstAxis string
	// tightest is the closest pair over the whole battle, for the log
	tightest float64
	at       int
	byA      int
	byB      int
}

func (s *pairSpy) Command(v *View) error {
	if err := s.under.Command(v); err != nil {
		return err
	}
	fc, ok := s.under.(*FormationCommander)
	if !ok || len(fc.groups) != 1 {
		return nil
	}
	g := fc.groups[0]
	placed := make([]int, 0, len(s.ids))
	for _, id := range s.ids {
		if id < len(v.Units) && v.Units[id].Status == StatusFighting && v.Commands[id].FormationSet {
			placed = append(placed, id)
		}
	}
	if len(placed) < 2 {
		return nil
	}
	// tight is over the men the formation is placing this tick, which is the only
	// set it is responsible for: a man who has broken or run is not in the shape
	// and walks off under the engine's own rules.
	tight := math.Inf(1)
	var a, b int
	for i := 0; i < len(placed); i++ {
		ua := &v.Units[placed[i]]
		for j := i + 1; j < len(placed); j++ {
			ub := &v.Units[placed[j]]
			if d := math.Hypot(ua.X-ub.X, ua.Y-ub.Y); d < tight {
				tight, a, b = d, placed[i], placed[j]
			}
		}
	}
	// off is the furthest any of them is from the slot the commander gave him.
	off := 0.0
	for i, id := range placed {
		if i >= len(g.slots) {
			break
		}
		sx, sy := g.slots[i].place(g.anchorX, g.anchorY, g.facing)
		u := &v.Units[id]
		if d := math.Hypot(sx-u.X, sy-u.Y); d > off {
			off = d
		}
	}
	s.tight = append(s.tight, tight)
	s.off = append(s.off, off)
	s.tick = append(s.tick, v.Tick)
	s.gap = append(s.gap, nearestEnemy(v, placed))
	// Crossed: for every pair of men in the shape, the order the shape gave them
	// them, compared with the order they are actually standing in.
	//
	// Each pair is asked on the axis along which the SHAPE separated its two slots
	// furthest, which is not the same axis for every pair and is the reason this is
	// not a lateral-only measure. Two men abreast in a rank are separated across,
	// so their order across is the shape's and is asked. Two men in one file of a
	// column are separated in depth - a column is single file, and the only order
	// it has is front to back - so their depth is asked instead. A lateral-only
	// measure skips those pairs, which is how a column came to report zero pairs
	// examined and look like it had been tested.
	//
	// Both axes are the shape's own, rotated by the commander's facing: for a
	// formation facing east that is north-south across and east-west in depth, and
	// a test that hard-coded an axis would only be right while the enemy was due
	// east.
	//
	// Two men are the wrong way round when the order of their positions along that
	// axis is not the order of their slots along it, which is the whole of "a rank
	// walks through another rank": a man who has crossed his neighbour is standing
	// somewhere the shape never put him, and no amount of tidying afterwards undoes
	// it, because each of them is walking back to a slot the other one now holds.
	//
	// It is only asked of a shape that is standing. A roster that deploys as a block
	// and is walking into a line has most of its pairs the wrong way round at tick
	// zero, and counting those would be counting the formation's own work.
	//
	// And a pair is only asked on an axis the shape actually ordered it on. In a
	// scattered shape each man is pushed off his lattice point by a hash of
	// (seed, index), so two slots closer together than one scatter amplitude were
	// not ordered by the shape on that axis at all - which of the two is on the
	// left is the hash's decision - and asking about it asks a question about the
	// hash.
	//
	// With the shipped lattice this guard never fires, and the log says so: every
	// combination above reports zero pairs skipped, skirmish included, because two
	// men in one lattice column are always a whole rank spacing apart in depth
	// however their scatter falls sideways. It is here for the lattice it would
	// catch rather than as the thing that fixed skirmish, and the thing that fixed
	// skirmish was asking each pair on the axis the shape separated it on. Keeping
	// it costs one comparison and documents that a closer lattice is not a licence
	// to reorder men.
	acrossX, acrossY := math.Sin(g.facing), -math.Cos(g.facing)
	depthX, depthY := math.Cos(g.facing), math.Sin(g.facing)
	inverted := 0
	if off <= s.standing {
		for i := 0; i < len(placed); i++ {
			for j := i + 1; j < len(placed); j++ {
				si, sj := g.slots[i], g.slots[j]
				dRight, dDepth := math.Abs(si.Right-sj.Right), math.Abs(si.Forward-sj.Forward)
				axX, axY, want := acrossX, acrossY, si.Right < sj.Right
				if dDepth > dRight {
					// Depth is the axis this pair was separated on.
					axX, axY, want = depthX, depthY, si.Forward < sj.Forward
				}
				sep := math.Max(dRight, dDepth)
				if sep <= s.scatter {
					// The same lattice point within the scatter: not an order the
					// shape set on either axis.
					s.comparable++
					continue
				}
				ui, uj := &v.Units[placed[i]], &v.Units[placed[j]]
				li := (ui.X-g.anchorX)*axX + (ui.Y-g.anchorY)*axY
				lj := (uj.X-g.anchorX)*axX + (uj.Y-g.anchorY)*axY
				if want == (li < lj) {
					continue
				}
				inverted++
				if s.worstPair == 0 {
					s.firstTick, s.firstA, s.firstB = v.Tick, placed[i], placed[j]
					s.firstD = math.Hypot(ui.X-uj.X, ui.Y-uj.Y)
					s.firstAxis = "depth"
					if axX == acrossX {
						s.firstAxis = "across"
					}
				}
			}
		}
	}
	s.crossed = append(s.crossed, inverted)
	if inverted > s.worstPair {
		s.worstPair = inverted
	}
	if tight < s.tightest {
		s.tightest, s.at, s.byA, s.byB = tight, v.Tick, a, b
	}
	return nil
}

// nearestEnemy is how close the fight has come to a formation: the smallest gap
// between any man in it and any enemy on the field. It is the measure that
// separates marching from fighting, and it is measured to the nearest man rather
// than to the enemy's centre because a line that has reached contact has its front
// rank in the enemy and its rear rank a hundred metres back, and a centre-of-mass
// gap would describe neither end of it.
func nearestEnemy(v *View, mine []int) float64 {
	best := math.Inf(1)
	for _, id := range mine {
		u := &v.Units[id]
		for j := range v.Units {
			e := &v.Units[j]
			if e.Side == u.Side || !e.Status.OnField() {
				continue
			}
			if d := math.Hypot(u.X-e.X, u.Y-e.Y); d < best {
				best = d
			}
		}
	}
	return best
}

// firstAt is the first tick at which the measured series first went under limit.
//
// Both windows this test measures are read off the measurement rather than written
// down as numbers, because a window fixed as a number is a number that is wrong
// for some other shape. A column converges in a second and a square takes a
// minute; a test that fixed the marching window at the column's answer would be
// measuring a square's second minute and calling it marching.
func (s *pairSpy) firstAt(series []float64, under float64) (int, bool) {
	for i, v := range series {
		if v <= under {
			return s.tick[i], true
		}
	}
	return 0, false
}

// A formation is a set of places, and the men in it are told to stand on them. The
// question this asks is the one that decides whether that is more than drawing: do
// the men end up in the order the shape put them in, or do they end up shuffled,
// each standing where his neighbour was?
//
// It is asked over whole battles rather than over ticks, because the answer is a
// statement about a fight: every shape, walking at an advance and at a charge, with
// the order across the rank of every pair of men in the group compared against the
// order of the slots they were given, on every tick the group is on the field.
//
// # WHY ORDER AND NOT DISTANCE
//
// The first version of this measured the closest pair and held it to min_separation,
// and it failed in every shape with pairs at 0.00 m. That was measuring the wrong
// thing, and the measurement is worth keeping in the log to show why. Men walking to
// their slots from the roster's own spread cross each other's paths: two men in the
// same column of two ranks are given slots two metres apart and both start out west
// of them, so for a few ticks they are closer together than the shape will ever
// hold them, and by the time they have arrived they are the right way round. A pair
// closing while a squad converges is not a rank walking through another rank.
//
// Order is the thing that cannot be undone. A man who has crossed his neighbour is
// standing where the shape never put him, and no amount of tidying afterwards fixes
// it, because each of the two is walking back to a slot the other now holds: the
// shape and the men disagree about where the line is, and they go on disagreeing
// until one of them is destroyed. A pair that is briefly close while it converges is
// a man walking past his neighbour on the way to his own place.
//
// The window is measured rather than chosen. From the tick the shape first stood
// (every man within a frontage of his own slot) to the tick the fight reached it
// (the nearest enemy within a swing) is the stretch in which this layer is the only
// thing placing these men. After contact it is not: the engine's own separation
// rule adds to the staged delta rather than replacing it, so it moves commanded men
// too, and a pair that changes places in a melee is that rule and not these slots.
// Those ticks are counted and printed rather than asserted on, because asserting on
// them would be asserting that this layer owns a fight it does not.
func TestAMarchingFormationNeverWalksARankThroughAnother(t *testing.T) {
	cfg := loadConfig(t)
	p := FormationParamsFrom(cfg.Formation)
	const (
		seed = 20260930
		n    = 40
	)
	orders := []FormationOrder{OrderFormationAdvance, OrderFormationCharge}
	for _, f := range AllFormations() {
		setup, err := standardForce(t, cfg, seed, n)
		if err != nil {
			t.Fatalf("%s: building the force failed: %v", f, err)
		}
		setup.Label = fmt.Sprintf("%d v %d, side A in %s", n, n, f)
		// The shape's own tightest gap, which is the floor a live formation of
		// this shape can reach and which the balance file's validator holds at or
		// above min_separation.
		ids := make([]int, n)
		for i := range ids {
			ids[i] = i
		}
		// The shape's own tightest gap, which is the floor a live formation of
		// this shape can reach and which the balance file's validator holds at or
		// above min_separation. It is drawn once per shape rather than once per
		// order because it is a property of the shape and the count, not of the
		// order, and it doubles as the tolerance for whether the shape has arrived.
		slots, err := FormationLayout(f, n, p)
		if err != nil {
			t.Fatalf("%s of %d: %v", f, n, err)
		}
		drawn, err := MinSlotDistance(slots)
		if err != nil {
			t.Fatalf("%s of %d: %v", f, n, err)
		}
		if drawn < p.MinSeparation {
			t.Errorf("%s of %d puts its closest two slots %.2f m apart, below the min_separation "+
				"of %.2f m the balance file promises; the shape is crowded before it is marched",
				f, n, drawn, p.MinSeparation)
		}
		for _, o := range orders {
			formed, err := NewFormationCommander(cfg, SideA, []Group{
				{Order: GroupOrder{Kind: f, Order: o}, Units: ids},
			})
			if err != nil {
				t.Fatalf("%s %s: building the commander failed: %v", f, o, err)
			}
			// Only the scattered shape scatters. Setting the amplitude for every shape was a
			// bug in this test that the log caught: a line reported a hundred thousand
			// pairs "skipped as scatter-ordered" and a line has no scatter, so those
			// were pairs of a line being thrown away on a tolerance belonging to
			// another shape. The guard is derived from the shape under test.
			spy := &pairSpy{under: formed, ids: ids, standing: drawn, tightest: math.Inf(1)}
			if f == FormationSkirmish {
				spy.scatter = p.LooseJitterFraction * p.LooseSpacing
			}
			if _, err := RunCommanded(cfg, seed, setup, spy); err != nil {
				t.Fatalf("%s %s: the battle did not run: %v", f, o, err)
			}
			if len(spy.tick) == 0 {
				t.Fatalf("%s %s: no tick with two of the group's men in the shape", f, o)
			}
			// The marching window is measured, not chosen: from the tick the shape
			// was first standing to the tick the fight reached it. In that window
			// the formation layer is the only thing placing these men, and it is the
			// only window in which its slots can be held to the order it drew them
			// in. After contact the engine's own separation rule is moving men too
			// (it adds to the delta rather than replacing it), so a pair that
			// changes places in a melee is the intent stage's rule and not this
			// layer's slots; it is counted and reported, not asserted.
			marchCrossed, fightCrossed := 0, 0
			contactAt, inContact := spy.firstAt(spy.gap, cfg.Battle.MeleeRange)
			for i, t := range spy.tick {
				if spy.crossed[i] == 0 {
					continue
				}
				if inContact && t >= contactAt {
					fightCrossed++
					continue
				}
				marchCrossed++
			}
			marchGap, marchAt, standingTicks := marching(spy, drawn)
			t.Logf("%-8s %-8s: %d men, %d ticks, contact at tick %d; closest pair %.2f m (tick %d, "+
				"units %d and %d); shape standing on %d of %d ticks, tightest pair while standing "+
				"%.2f m at tick %d, the shape as drawn %.2f m, min_separation %.2f m; %d pairs "+
				"skipped as scatter-ordered, %d inverted on %d marching ticks and %d fighting ticks, "+
				"worst tick %d pairs",
				f, o, n, len(spy.tick), contactAt, spy.tightest, spy.at, spy.byA, spy.byB,
				standingTicks, len(spy.tick), marchGap, marchAt, drawn, p.MinSeparation,
				spy.comparable, marchCrossed, len(spy.tick)-marchCrossed-fightCrossed,
				fightCrossed, spy.worstPair)
			if marchCrossed > 0 {
				t.Errorf("%s %s: %d of %d ticks had two men the wrong way round from the slots they "+
					"were given, before the fight reached them at tick %d: at tick %d units %d and %d "+
					"stood %.2f m apart the wrong way round %s the shape, and %d pairs were inverted at "+
					"once at the worst tick. A man who has walked through his neighbour is standing "+
					"where the shape never put him, and no amount of tidying afterwards undoes it, "+
					"because each of them is walking back to a slot the other one now holds",
					f, o, marchCrossed, len(spy.tick), contactAt, spy.firstTick,
					spy.firstA, spy.firstB, spy.firstD, spy.firstAxis, spy.worstPair)
			}
		}
	}
}

// marching is the tightest pair seen on any tick on which every man of the shape
// was within a frontage of his own slot, which is the state the question is asked
// about: a shape that is still tidying itself out of the roster's spread is not
// yet a shape, and a pair closing while it converges says nothing about whether
// the shape holds once it has arrived.
//
// The tolerance is the shape's OWN drawn gap between its two closest slots, not
// battle.front_spacing, because the shapes do not share a spacing. A line, a
// column, a wedge and a square draw their men 1.50 m apart and skirmish draws its
// own men 3.49 m apart, so asking whether a skirmish is standing to within 1.50 m
// of its slots asks a question no skirmish can ever answer: it printed +Inf for
// every tick of a charge and was about to be read as a passing measurement. The
// shape's own gap is the distance at which two of its men are still two men and
// not one man in two places, which is what "the shape has arrived" means for that
// shape.
//
// It also returns the tick and how many ticks were like that, because an infinite
// answer is otherwise unreadable: it means the shape never once had every man of
// it inside one drawn gap of his own slot for the whole battle. That is either a
// question this test cannot answer - the fight reached the shape before it formed
// up - or a defect, and the tick count says which.
func marching(s *pairSpy, drawn float64) (gap float64, at, ticks int) {
	gap = math.Inf(1)
	at = -1
	for i := range s.tick {
		if s.off[i] > drawn {
			continue
		}
		ticks++
		if s.tight[i] >= gap {
			continue
		}
		gap, at = s.tight[i], s.tick[i]
	}
	return gap, at, ticks
}
