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
// being non-zero. And a man standing inside the cohesion tolerance is left
// alone, because a formation that orders a man in his slot to walk in his slot
// is a formation layer arguing with itself every tick.
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
		// far south of his the southern one is.
		off float64
	}{
		{"two men a long way out of their places", 12},
		{"two men just out of their places", tolerance * 1.5},
		{"two men inside the tolerance", tolerance * 0.5},
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
		inside := wants[0].dist <= tolerance
		for _, w := range wants {
			got := v.Commands[w.id]
			gotDist := math.Hypot(got.DX, got.DY)
			if inside {
				// Inside the tolerance: he is standing in his slot and must be
				// left to the engine's own rules.
				if got.Set {
					t.Errorf("%s: unit %d is %.3f m from his slot, inside the %.3f m tolerance, and was "+
						"told to walk %g, %g; a formation that orders a man in his slot to walk in his "+
						"slot is arguing with itself every tick", c.name, w.id, w.dist, tolerance,
						got.DX, got.DY)
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
			t.Logf("%-38s: both men inside the %.3f m tolerance, so neither was given a movement order",
				c.name, tolerance)
		}
		// Everyone else is standing exactly on his slot and must be left alone.
		for i := range slots {
			if i == north || i == south || !v.Commands[i].Set {
				continue
			}
			t.Errorf("%s: unit %d is standing on his slot and was told to walk %g, %g; a man in his "+
				"place who is told to keep walking is a formation arguing with itself", c.name, i,
				v.Commands[i].DX, v.Commands[i].DY)
		}
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
		ordered, formed := 0, 0
		for i := 0; i < n; i++ {
			got := v.Commands[i]
			if got.FormationSet && got.Formation == FormationLine {
				formed++
			}
			if !got.Set {
				continue
			}
			ordered++
			if got.Intent == IntentHold && c.order != OrderFormationHold {
				t.Errorf("%s: unit %d was ordered to move and told it was holding", c.order, i)
			}
			if c.want == 0 {
				t.Errorf("%s: unit %d was told to move %g, %g m, and a hold is a hold; every man in this "+
					"view is already on his slot, so a hold has nothing to do but leave him there",
					c.order, i, got.DX, got.DY)
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
		t.Logf("%-8s %d of %d men in a line already on their slots were ordered to move, at %.3f m a tick",
			c.order, ordered, n, wantStep(pace))
		if c.want == 0 && ordered != 0 {
			t.Errorf("%s: %d men were ordered to move out of a shape they are already standing in", c.order, ordered)
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
// A hold is the reference and is allowed to drift, because the engine's own
// intent stage moves an uncommanded man and a formation that is only tidying
// itself is not holding a position to the metre. What is not allowed is for the
// four orders to come out in the same order as each other, which is exactly what
// happened twice: when the in-slot exemption applied to a retreating formation
// the anchor moved back by less than the cohesion tolerance, so every man was
// "already in his slot", nobody was ordered, and a withdrawal withdrew nothing;
// and when the anchor was left still for an advancing formation the same
// exemption meant an advance only ever moved by however fast the enemy's approach
// displaced its men.
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
	// A hold is a tidying pass and is allowed to drift, because a man already in
	// his slot is given no order and follows the engine's own rules. It is not
	// allowed to become a march, though: the whole of the drift has to be less
	// than the distance a formation covers tidying itself at its own configured
	// pace, which is what makes it a shuffle rather than a march.
	drift := math.Abs(walked[OrderFormationHold])
	tidy := cfg.Formation.HoldSpeed * cfg.Battle.TickSeconds * float64(probe-settle)
	if drift > tidy {
		t.Errorf("a hold walked %+.2f m in %d ticks, which is more than the %.2f m a formation "+
			"tidies itself at hold_speed (%.2f m/s) in that time; a hold is a shuffle, not a march",
			walked[OrderFormationHold], probe-settle, tidy, cfg.Formation.HoldSpeed)
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
