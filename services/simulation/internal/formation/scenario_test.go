package formation

import (
	"math"
	"strings"
	"testing"
)

// The scenario from TASKS.md Phase 4, "Formation movement AI": two bodies of
// 200, one in a wedge ordered to swing around the enemy's left, the other in a
// line holding its ground. It prints where the men are at several ticks so the
// flank can be read off the output rather than taken on trust, and it asserts
// the things a flank is supposed to do: the bearing from the enemy to the
// attacker swings the commanded number of degrees around their side, the
// attacker keeps its distance while it swings, the men keep their spacing, they
// end up still facing the enemy, and the same run twice gives the same battle.
const (
	scenarioPerSide   = 200
	scenarioTick      = 0.1 // seconds per tick: the formation AI's own cadence
	scenarioBlueStart = -180.0
	scenarioRedStart  = 180.0
	scenarioTicks     = 1600
)

// scenarioUnit builds one man with the identity a formation needs and nothing
// else. Quality, morale, and ammunition belong to other systems; this one moves
// men and stands them up.
func scenarioUnit(id int, pos Vec, facing float64) Unit {
	return Unit{ID: id, Pos: pos, Facing: facing, Agility: 1}
}

// onSlots puts a formation on the slots its own plan gives it, which is how a
// body of troops starts a battle: already in the shape the commander wants,
// facing the enemy.
func onSlots(t *testing.T, c Config, order Order, kind Formation, centre Vec, enemy Enemy, n int) []Unit {
	t.Helper()
	plan, err := BuildPlan(mustUnits(t, c, order, kind, centre, enemy, n), enemy, order, kind, c)
	if err != nil {
		t.Fatalf("building the %v/%v plan: %v", kind, order, err)
	}
	units := make([]Unit, n)
	for i, a := range plan.Assignment {
		pos, _, err := plan.Target(a.Slot)
		if err != nil {
			t.Fatal(err)
		}
		units[i] = scenarioUnit(a.ID, pos, plan.Heading)
	}
	return units
}

// mustUnits makes a placeholder body of troops standing in a blob, used only to
// ask the planner for a shape. It is immediately replaced by units standing on
// that shape.
func mustUnits(t *testing.T, c Config, order Order, kind Formation, centre Vec, enemy Enemy, n int) []Unit {
	t.Helper()
	units := make([]Unit, n)
	for i := range units {
		units[i] = scenarioUnit(i+1, centre, 0)
	}
	return units
}

// TestScenarioWedgeFlanksLineAroundASide is the 200-against-200 run. It is the
// proof that the code moves troops, rather than a proof that it returns
// numbers.
func TestScenarioWedgeFlanksLineAroundASide(t *testing.T) {
	c := testConfig(t)

	// Two bodies of 200, 360 m apart on a north-south line of contact. The
	// attacker is south and looks north; the defender is north and looks south.
	redCentre := Vec{0, scenarioRedStart}
	blueCentre := Vec{0, scenarioBlueStart}

	// One enemy reading for planning the starting shapes: each side is told
	// where the other is before anyone has moved.
	redViewOfBlue := Enemy{Centre: blueCentre, Facing: degrees(90), HalfDepth: 12, HalfWidth: 130, Count: scenarioPerSide}
	blueViewOfRed := Enemy{Centre: redCentre, Facing: degrees(270), HalfDepth: 12, HalfWidth: 130, Count: scenarioPerSide}

	// The defender holds a line of 200. The attacker forms a wedge of 200 and
	// is ordered to swing to its own left, which is the defender's right:
	// COMBAT.md section 7's "flank left" is left from the commander who gives
	// the order, and two armies facing each other share no left. The attacker
	// starts due south looking north, so its left is west, and it ends up west
	// of the line it was sent against.
	red := onSlots(t, c, OrderHold, FormationLine, redCentre, redViewOfBlue, scenarioPerSide)
	blue := onSlots(t, c, OrderFlankLeft, FormationWedge, blueCentre, blueViewOfRed, scenarioPerSide)

	redPlan, err := BuildPlan(red, redViewOfBlue, OrderHold, FormationLine, c)
	if err != nil {
		t.Fatal(err)
	}
	bluePlan, err := BuildPlan(blue, blueViewOfRed, OrderFlankLeft, FormationWedge, c)
	if err != nil {
		t.Fatal(err)
	}

	startBearing := wrapAngle(Bearing(redCentre, bluePlan.Anchor))
	sweep := degrees(c.FlankSweepDeg)
	t.Logf("config: %s", c)
	t.Logf("starting 360 m apart. attacker: wedge, flank-left. defender: line, holding.")
	t.Logf("attacker anchor %v, bearing from the defender %.1f deg, sweeping %.1f deg to %.1f deg",
		bluePlan.Anchor, deg(startBearing), c.FlankSweepDeg, deg(startBearing-sweep))
	t.Logf("flank stand-off: enemy half-depth %.1f m + own rear extent %.1f m + %.1f m clearance = %.1f m radius",
		blueViewOfRed.HalfDepth, bluePlan.RearExtent, c.FlankStandoff,
		blueViewOfRed.HalfDepth+bluePlan.RearExtent+c.FlankStandoff)

	// The point of the wedge is the first man in assignment order; the wings are
	// the widest rank's two ends.
	tipSlot := 0
	leftSlot, rightSlot := wedgeWings(t, c, scenarioPerSide)

	samples := []int{0, 100, 300, 600, 900, 1200, scenarioTicks}
	// The bearing from the defender's centre to the attacker's anchor, tracked
	// every tick. It is accumulated rather than stored, because an angle that
	// crosses the +/-180 degree seam would otherwise appear to jump a long way
	// when it has not moved at all.
	var swept float64
	var prevBearing float64
	havePrev := false
	var reversed float64
	closest := math.Inf(1)
	t.Log("")
	t.Logf("tick   time   anchor x,y        bearing  gap    facing  tip(x,y)             left wing(x,y)      right wing(x,y)")
	for tick := 0; tick <= scenarioTicks; tick++ {
		if contains(samples, tick) {
			enemy, err := SummariseEnemy(red)
			if err != nil {
				t.Fatal(err)
			}
			tip := manInSlot(t, blue, bluePlan, tipSlot)
			leftWing := manInSlot(t, blue, bluePlan, leftSlot)
			rightWing := manInSlot(t, blue, bluePlan, rightSlot)
			bearing := wrapAngle(Bearing(enemy.Centre, bluePlan.Anchor))
			gap := Distance(bluePlan.Anchor, enemy.Centre)
			meanFacing := 0.0
			for _, u := range blue {
				meanFacing += wrapAngle(u.Facing - bluePlan.Heading)
			}
			meanFacing = deg(meanFacing / float64(len(blue)))
			t.Logf("%5d %6.1f  (%7.1f,%7.1f) %7.1f %6.1f %7.1f  (%7.1f,%7.1f)     (%7.1f,%7.1f)    (%7.1f,%7.1f)",
				tick, float64(tick)*scenarioTick, bluePlan.Anchor.X, bluePlan.Anchor.Y,
				deg(bearing), gap, meanFacing,
				tip.Pos.X, tip.Pos.Y, leftWing.Pos.X, leftWing.Pos.Y, rightWing.Pos.X, rightWing.Pos.Y)
			if tick > 0 {
				t.Log("     " + plotBattle(blue, red, bluePlan.Anchor))
			}
		}
		if tick == scenarioTicks {
			break
		}

		before, err := SummariseEnemy(red)
		if err != nil {
			t.Fatal(err)
		}
		bearing := wrapAngle(Bearing(before.Centre, bluePlan.Anchor))
		closest = math.Min(closest, Distance(bluePlan.Anchor, before.Centre))
		if havePrev {
			step := wrapAngle(bearing - prevBearing)
			swept += step
			if step > reversed {
				reversed = step
			}
		}
		prevBearing, havePrev = bearing, true

		// Both sides act: the defender holds its ground and reforms, the
		// attacker swings. Each reads the other's current positions.
		enemyForBlue, err := SummariseEnemy(red)
		if err != nil {
			t.Fatal(err)
		}
		blue, bluePlan, err = Step(blue, bluePlan, enemyForBlue, c, scenarioTick)
		if err != nil {
			t.Fatalf("attacker tick %d: %v", tick, err)
		}
		enemyForRed, err := SummariseEnemy(blue)
		if err != nil {
			t.Fatal(err)
		}
		red, redPlan, err = Step(red, redPlan, enemyForRed, c, scenarioTick)
		if err != nil {
			t.Fatalf("defender tick %d: %v", tick, err)
		}
	}

	enemy, err := SummariseEnemy(red)
	if err != nil {
		t.Fatal(err)
	}
	endBearing := wrapAngle(Bearing(enemy.Centre, bluePlan.Anchor))
	t.Log("")

	// --- the flank actually happened ---
	//
	// The tolerance is degrees. It used to be a bare 0.5 subtracted from a
	// radian figure, which is 0.5 radians: this assertion was quietly accepting
	// a 46-degree swing as a completed 75-degree flank, because
	// CONSTITUTION.md section 7.2 says an exit criterion is a test result and
	// not an opinion. Both comparisons below are written in degrees, which is
	// the unit flank_sweep_deg is set in.
	sweptEnd := deg(wrapAngle(startBearing - endBearing))
	if sweptEnd < c.FlankSweepDeg-flankCompletionToleranceDeg {
		t.Errorf("the attacker swung %.2f deg but was ordered %.2f deg: the flank did not complete",
			sweptEnd, c.FlankSweepDeg)
	}
	if endBearing > startBearing {
		t.Errorf("the bearing from the defender to the attacker rose from %.1f to %.1f deg: a left flank swings the other way",
			deg(startBearing), deg(endBearing))
	}
	t.Logf("swung %.2f deg around the defender's side, from %.1f deg to %.1f deg, ordered %.2f deg",
		sweptEnd, deg(startBearing), deg(endBearing), c.FlankSweepDeg)

	// --- and it went round, not across their front ---
	//
	// Two things say the attacker walked round the defender rather than cutting
	// across their line of contact to reach the flank point. The bearing only
	// ever turns the commanded way, and the gap never closes past the stand-off
	// radius: a shortcut would show up as a reverse step of tens of degrees
	// and a gap that fell through the middle of the stand-off circle.
	//
	// The reverse allowance is one tick's worth of sweep, which is generous for
	// what it has to cover. The residue is the centre of mass of 200 men
	// jiggling by a few centimetres while they chase slots that are rotating
	// under them, and at 64 m from the centre that reads as a fraction of a
	// degree. A corner-cut shows up tens of times larger than that.
	tickSweepDeg := c.FlankSweepRateDeg * scenarioTick
	tickSweep := degrees(tickSweepDeg)
	if reversed > tickSweep {
		t.Errorf("the attacker swung back the wrong way by %.3f deg in one tick, more than the %.3f deg of sweep it is making: it is cutting the corner",
			deg(reversed), tickSweepDeg)
	}
	if accumulated := deg(-swept); accumulated < c.FlankSweepDeg-flankCompletionToleranceDeg {
		t.Errorf("the accumulated swing was %.2f deg against an ordered %.2f deg", accumulated, c.FlankSweepDeg)
	}
	if closest < enemy.HalfDepth+bluePlan.RearExtent+c.FlankStandoff-2 {
		t.Errorf("the attacker came within %.1f m of the defender while swinging, inside its own stand-off: it went through them, not round",
			closest)
	}
	t.Logf("bearing tracked for %d ticks: %.2f deg the commanded way, worst reverse step %.3f deg (one tick of sweep is %.3f deg), closest approach %.1f m",
		scenarioTicks+1, deg(-swept), deg(reversed), tickSweepDeg, closest)

	// --- the attacker stood off while it swung ---
	wantRadius := enemy.HalfDepth + bluePlan.RearExtent + c.FlankStandoff
	gap := Distance(bluePlan.Anchor, enemy.Centre)
	if gap < wantRadius-1 {
		t.Errorf("the attacker finished %.1f m from the defender, inside its %.1f m stand-off: turning in from inside their depth is a collision, not a flank",
			gap, wantRadius)
	}
	t.Logf("finished %.1f m out against a %.1f m stand-off radius", gap, wantRadius)

	// --- they are still facing the enemy ---
	worst := 0.0
	for _, u := range blue {
		d := math.Abs(deg(wrapAngle(u.Facing - wrapAngle(Bearing(u.Pos, enemy.Centre)))))
		if d > worst {
			worst = d
		}
	}
	if worst > 5 {
		t.Errorf("a man finished %.1f deg off the enemy instead of facing them", worst)
	}
	t.Logf("worst facing error across 200 men: %.2f deg", worst)

	// --- spacing survived the manoeuvre ---
	closest, a, b := minSeparationOfUnits(blue)
	if closest < c.MinSeparation-1e-6 {
		t.Errorf("two men finished %.4f m apart, inside the %.2f m minimum (units %d and %d)",
			closest, c.MinSeparation, blue[a].ID, blue[b].ID)
	}
	t.Logf("closest two of 200 men after the manoeuvre: %.3f m, minimum %.2f m", closest, c.MinSeparation)

	// --- and the wedge still has its point ---
	heading := bluePlan.Heading
	forward := Vec{math.Cos(heading), math.Sin(heading)}
	tipAhead := manInSlot(t, blue, bluePlan, tipSlot).Pos.Sub(bluePlan.Anchor).Dot(forward)
	worstWing := math.Inf(-1)
	tipID := manInSlot(t, blue, bluePlan, tipSlot).ID
	for _, u := range blue {
		if u.ID == tipID {
			continue
		}
		if f := u.Pos.Sub(bluePlan.Anchor).Dot(forward); f > worstWing {
			worstWing = f
		}
	}
	if tipAhead <= worstWing {
		t.Errorf("after the manoeuvre the point man is %.2f m ahead of the anchor and the furthest wing man %.2f m: the wedge has lost its point",
			tipAhead, worstWing)
	}
	t.Logf("point man %.2f m ahead of the anchor, furthest wing man %.2f m ahead", tipAhead, worstWing)

	// --- the defender held its ground ---
	//
	// "Holding position" means the formation's ground does not change hands:
	// the anchor stays where it was. It does not mean every man is frozen,
	// because the line turns to keep facing an attacker who has swung around
	// it, and a 22 m line pivoting through seventy degrees walks its wings a
	// few metres. Freezing them instead would mean holding the wrong way.
	held, err := centroid(red)
	if err != nil {
		t.Fatal(err)
	}
	if drift := Distance(held, redCentre); drift > 0.05 {
		t.Errorf("a holding line drifted %.3f m from where it stood; holding means holding", drift)
	}
	worstOffSlot := 0.0
	for _, u := range red {
		worstOffSlot = math.Max(worstOffSlot, u.Pos.Dist(onSlotPos(t, redPlan, u.ID)))
	}
	t.Logf("defender anchor held to %.4f m of its start, line turned to face the attacker, worst man %.3f m off his slot",
		Distance(held, redCentre), worstOffSlot)
}

// TestScenarioIsByteForByteDeterministic runs the same 200-against-200 battle
// twice and compares every coordinate and every facing. A formation AI that
// cannot replay a battle cannot be tuned against a log, and AI.md section 1
// makes determinism a precondition for the whole point of the cause chain.
func TestScenarioIsByteForByteDeterministic(t *testing.T) {
	c := testConfig(t)
	first := runFlankScenario(t, c, 200)
	second := runFlankScenario(t, c, 200)
	if len(first) != len(second) {
		t.Fatalf("the two runs produced %d and %d men", len(first), len(second))
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("man %d ended at %+v on the first run and %+v on the second: the battle does not replay",
				first[i].ID, first[i], second[i])
		}
	}
	t.Logf("%d men, two identical runs, every coordinate and facing identical", len(first))
}

// runFlankScenario plays the scenario headlessly and returns the attacker.
func runFlankScenario(t *testing.T, c Config, perSide int) []Unit {
	t.Helper()
	redCentre := Vec{0, scenarioRedStart}
	blueCentre := Vec{0, scenarioBlueStart}
	redViewOfBlue := Enemy{Centre: blueCentre, Facing: degrees(90), HalfDepth: 12, HalfWidth: 130, Count: perSide}
	blueViewOfRed := Enemy{Centre: redCentre, Facing: degrees(270), HalfDepth: 12, HalfWidth: 130, Count: perSide}
	red := onSlots(t, c, OrderHold, FormationLine, redCentre, redViewOfBlue, perSide)
	blue := onSlots(t, c, OrderFlankLeft, FormationWedge, blueCentre, blueViewOfRed, perSide)
	redPlan, err := BuildPlan(red, redViewOfBlue, OrderHold, FormationLine, c)
	if err != nil {
		t.Fatal(err)
	}
	bluePlan, err := BuildPlan(blue, blueViewOfRed, OrderFlankLeft, FormationWedge, c)
	if err != nil {
		t.Fatal(err)
	}
	for tick := 0; tick < scenarioTicks; tick++ {
		enemyForBlue, err := SummariseEnemy(red)
		if err != nil {
			t.Fatal(err)
		}
		blue, bluePlan, err = Step(blue, bluePlan, enemyForBlue, c, scenarioTick)
		if err != nil {
			t.Fatal(err)
		}
		enemyForRed, err := SummariseEnemy(blue)
		if err != nil {
			t.Fatal(err)
		}
		red, redPlan, err = Step(red, redPlan, enemyForRed, c, scenarioTick)
		if err != nil {
			t.Fatal(err)
		}
	}
	return blue
}

// manInSlot returns the man standing in a slot number. Step writes every man
// back to his own place in the caller's list, so a slot number is not an index
// into it; going through the plan's assignment is the honest way to ask.
func manInSlot(t *testing.T, units []Unit, p Plan, slot int) Unit {
	t.Helper()
	for _, a := range p.Assignment {
		if a.Slot != slot {
			continue
		}
		for _, u := range units {
			if u.ID == a.ID {
				return u
			}
		}
	}
	t.Fatalf("slot %d is not held by any man in the formation", slot)
	return Unit{}
}

// wedgeWings returns the slot numbers of the two ends of a wedge's widest
// rank, found from the shape itself rather than hard-coded, so the scenario
// keeps pointing at the wings if the balance file changes the wedge's
// proportions.
func wedgeWings(t *testing.T, c Config, n int) (left, right int) {
	t.Helper()
	slots, err := Layout(FormationWedge, ids(n), c)
	if err != nil {
		t.Fatalf("laying out a wedge of %d to find its wings: %v", n, err)
	}
	widest := 0.0
	for _, s := range slots {
		if math.Abs(s.Right) > widest {
			widest = math.Abs(s.Right)
		}
	}
	left, right = -1, -1
	widestRight := math.Inf(-1)
	narrowestRight := math.Inf(1)
	for i, s := range slots {
		if math.Abs(s.Right) < widest-1e-9 {
			continue
		}
		if s.Right < narrowestRight {
			narrowestRight, left = s.Right, i
		}
		if s.Right > widestRight {
			widestRight, right = s.Right, i
		}
	}
	return left, right
}

// onSlotPos returns where a unit is supposed to be standing in a plan.
func onSlotPos(t *testing.T, p Plan, id int) Vec {
	t.Helper()
	slot, err := p.Slot(id)
	if err != nil {
		t.Fatal(err)
	}
	pos, _, err := p.Target(slot)
	if err != nil {
		t.Fatal(err)
	}
	return pos
}

// plotBattle draws both bodies of troops on one grid, attacker as A and
// defender as D, so the swing can be seen rather than inferred from a bearing.
func plotBattle(blue, red []Unit, anchor Vec) string {
	const cols, rows = 74, 16
	lo, hi := boundsOf(blue, red)
	grid := make([][]byte, rows)
	for i := range grid {
		grid[i] = []byte(strings.Repeat(" ", cols))
	}
	for _, u := range red {
		put(grid, u.Pos, lo, hi, 'D', cols, rows)
	}
	for _, u := range blue {
		put(grid, u.Pos, lo, hi, 'A', cols, rows)
	}
	// The anchor is the centre of mass of the attacker: the one thing on the map
	// that says where the formation is going rather than where it is.
	if c, r := cell(anchor, lo, hi, cols, rows); r >= 0 && r < rows && c >= 0 && c < cols {
		grid[r][c] = '@'
	}
	out := make([]string, rows)
	for i, row := range grid {
		out[i] = "     " + string(row)
	}
	return strings.Join(out, "\n")
}

func put(grid [][]byte, pos Vec, lo, hi Vec, ch byte, cols, rows int) {
	if c, r := cell(pos, lo, hi, cols, rows); r >= 0 && r < rows && c >= 0 && c < cols {
		if grid[r][c] == ' ' {
			grid[r][c] = ch
		}
	}
}

func cell(pos, lo, hi Vec, cols, rows int) (int, int) {
	w, h := hi.X-lo.X, hi.Y-lo.Y
	if w <= 0 || h <= 0 {
		return -1, -1
	}
	c := int((pos.X - lo.X) / w * float64(cols-1))
	r := int((1 - (pos.Y-lo.Y)/h) * float64(rows-1))
	return c, r
}

func boundsOf(blue, red []Unit) (lo, hi Vec) {
	first := true
	consider := func(p Vec) {
		if first {
			lo, hi, first = p, p, false
			return
		}
		lo.X = math.Min(lo.X, p.X)
		lo.Y = math.Min(lo.Y, p.Y)
		hi.X = math.Max(hi.X, p.X)
		hi.Y = math.Max(hi.Y, p.Y)
	}
	for _, u := range blue {
		consider(u.Pos)
	}
	for _, u := range red {
		consider(u.Pos)
	}
	const margin = 20.0
	return lo.Sub(Vec{margin, margin}), hi.Add(Vec{margin, margin})
}

func contains(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func deg(radians float64) float64 { return radians * 180 / math.Pi }
