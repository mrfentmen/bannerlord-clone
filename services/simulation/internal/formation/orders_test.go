package formation

import (
	"math"
	"testing"
)

// TestOrdersDoWhatTheySay exercises all six orders against the same pair of
// formations and checks the thing each order is for. A formation AI is only
// worth having if the orders mean different things: if "advance" and "charge"
// produce the same positions, or "flank right" is "flank left" with a different
// word on it, then the order set is decoration.
//
// The geometry is deliberately simple: the attacker starts due south of the
// defender at 360 m, both looking at each other. Left and right are therefore
// exact mirror images, and the flank orders are checked against each other so a
// sign error cannot hide.
const (
	orderPerSide = 40
	orderGap     = 360.0
	// orderTicks is the budget every order gets, and it has to be long enough
	// for the slowest one to finish. The binding case is the advance: 360 m
	// less its 120 m standoff is 240 m of ground, and at 1.4 m/s that is 171 s.
	// The flank is the close second — it has to close that same ground and then
	// walk the arc — and the retreat never finishes at all, because falling back
	// is re-read every tick and has no end.
	orderTicks   = 2400
	orderSeconds = float64(orderTicks) * scenarioTick
	// flankCompletionToleranceDeg is how far short of the commanded arc the
	// anchor is allowed to finish.
	//
	// It is not a fudge factor, it is the bearing a real formation loses. The
	// anchor the order steers is not the formation: each tick the men walk
	// toward slots laid out in a frame that is itself rotating, so the centre of
	// mass that the next tick reads is behind the anchor that moved. A lag of
	// well under a metre at a stand-off radius of 50 m is a little over a
	// degree, and the lag is largest exactly while the sweep is running, which
	// is when the frame turns fastest. A degree and a half is that lag with
	// room to spare, and a corner cut across the enemy's front would miss by
	// tens of degrees.
	flankCompletionToleranceDeg = 1.5
)

func TestOrdersDoWhatTheySay(t *testing.T) {
	c := testConfig(t)
	tests := []struct {
		order Order
		name  string
		// check is the outcome the order exists to produce.
		check func(t *testing.T, got orderResult)
	}{
		{
			order: OrderHold,
			name:  "hold keeps its ground",
			check: func(t *testing.T, got orderResult) {
				if got.moved > 0.05 {
					t.Errorf("a holding formation travelled %.2f m", got.moved)
				}
				if !got.arrived {
					t.Error("a holding formation should report that it is where it was told to be")
				}
			},
		},
		{
			order: OrderAdvance,
			name:  "advance closes to the firing standoff and stops",
			check: func(t *testing.T, got orderResult) {
				// The standoff is measured from the anchor to the enemy, so a
				// formation that has closed exactly stops one standoff out. The
				// 360 m of ground between them at the start is what it had to
				// walk, not what it ends up holding.
				if math.Abs(got.gap-c.AdvanceStandoff) > 1 {
					t.Errorf("advance finished %.2f m out, expected the %.2f m firing standoff (it had %.0f m of ground to close)",
						got.gap, c.AdvanceStandoff, orderGap)
				}
				if !got.arrived {
					t.Error("an advance that has closed to its standoff should report itself arrived")
				}
				if got.elapsed > 400 {
					t.Errorf("an advance took %.0f s to walk %.0f m, which is not a formation pace", got.elapsed, orderGap-c.AdvanceStandoff)
				}
			},
		},
		{
			order: OrderCharge,
			name:  "charge closes to contact and gets there faster than an advance",
			check: func(t *testing.T, got orderResult) {
				if math.Abs(got.gap-c.ChargeStandoff) > 1 {
					t.Errorf("charge finished %.2f m out, expected the %.2f m contact standoff", got.gap, c.ChargeStandoff)
				}
				if !got.arrived {
					t.Fatal("a charge that reached contact standoff should report itself arrived")
				}
				// An advance is only measured against a charge if it finishes in
				// the same window, so the advance is run here rather than being
				// carried over from another subtest. Comparing against a number
				// measured elsewhere would compare a charge with a different
				// battle.
				advance := runOrder(t, c, OrderAdvance, orderTicks)
				if !advance.arrived {
					t.Fatalf("the reference advance never arrived, so there is nothing to be faster than")
				}
				t.Logf("   charge took %.0f s; the same advance over the same ground took %.0f s",
					got.elapsed, advance.elapsed)
				if got.elapsed >= advance.elapsed {
					t.Errorf("a charge took %.0f s and an advance %.0f s: a charge that is no faster is not a charge",
						got.elapsed, advance.elapsed)
				}
			},
		},
		{
			order: OrderFlankLeft,
			name:  "flank left swings around the defender's right side",
			check: func(t *testing.T, got orderResult) {
				// A left flank sweeps the negative way round, so the swing is
				// checked as a signed number: it has to go the commanded way AND
				// cover the commanded arc. Checking the magnitude alone would
				// pass a right flank, and checking the sign alone would pass a
				// formation that had barely moved.
				if got.sweptDeg >= 0 {
					t.Errorf("flank left swept %.2f deg: a left flank has to sweep the other way", got.sweptDeg)
				}
				if -got.sweptDeg < c.FlankSweepDeg-flankCompletionToleranceDeg {
					t.Errorf("flank left swung %.2f deg, ordered %.2f", -got.sweptDeg, c.FlankSweepDeg)
				}
				// We were south of them looking north, so our left is west, and
				// the anchor must end up west of where it started.
				if got.anchor.X >= 0 {
					t.Errorf("flank left finished at x=%.1f, which is not to the left of where it started", got.anchor.X)
				}
				if got.closest < got.flankRadius-2 {
					t.Errorf("flank left came within %.1f m, inside its %.1f m stand-off: it went through them", got.closest, got.flankRadius)
				}
			},
		},
		{
			order: OrderFlankRight,
			name:  "flank right is the mirror of flank left",
			check: func(t *testing.T, got orderResult) {
				// The mirror of the left flank, checked the same way round: the
				// two signs are what stop a sign error hiding inside a magnitude
				// check, and the two anchors on opposite sides of the line are
				// what stop it hiding inside a sign check.
				if got.sweptDeg <= 0 {
					t.Errorf("flank right swept %.2f deg: a right flank has to sweep the other way", got.sweptDeg)
				}
				if got.sweptDeg < c.FlankSweepDeg-flankCompletionToleranceDeg {
					t.Errorf("flank right swung %.2f deg, ordered %.2f: the two are not mirror images", got.sweptDeg, c.FlankSweepDeg)
				}
				if got.anchor.X <= 0 {
					t.Errorf("flank right finished at x=%.1f, which is not to the right of where it started", got.anchor.X)
				}
			},
		},
		{
			order: OrderRetreat,
			name:  "retreat breaks contact and re-reads the order every tick",
			check: func(t *testing.T, got orderResult) {
				if got.gap < orderGap+c.RetreatDistance-1 {
					t.Errorf("retreat finished %.1f m out, expected at least %.1f m", got.gap, orderGap+c.RetreatDistance)
				}
				// A withdrawal is re-read every tick, so it keeps going while
				// the order stands rather than stopping after the first
				// commanded distance. The honest measure of that is the speed:
				// the formation should still be pulling back at retreat_speed
				// when the run ends, having covered nearly the whole distance
				// it could have. An order applied once would have covered
				// retreat_distance and no more.
				wantGap := orderGap + c.RetreatSpeed*orderSeconds
				if got.gap < wantGap*0.9 {
					t.Errorf("retreat pulled back only %.0f m in %.0f s (%.2f m/s against a configured %.2f m/s): the order is being applied once instead of every tick",
						got.gap-orderGap, orderSeconds, (got.gap-orderGap)/orderSeconds, c.RetreatSpeed)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := runOrder(t, c, tc.order, orderTicks)
			// Every order, whatever it is, leaves the men facing the enemy and
			// standing on a formation's worth of spacing. A flank that arrives
			// with its backs turned has not arrived.
			if got.worstFacingErr > 5 {
				t.Errorf("%v: a man finished %.2f deg off the enemy", tc.order, got.worstFacingErr)
			}
			if got.closestPair < c.MinSeparation-1e-6 {
				t.Errorf("%v: two men finished %.4f m apart, inside the %.2f m minimum", tc.order, got.closestPair, c.MinSeparation)
			}
			t.Logf("%-12s anchor (%7.1f,%7.1f) gap %6.1f m, swept %7.2f deg, closest pair %.3f m, worst facing error %.2f deg, %d men intact",
				tc.order, got.anchor.X, got.anchor.Y, got.gap, got.sweptDeg, got.closestPair, got.worstFacingErr, got.count)
			tc.check(t, got)
		})
	}
}

// orderResult is what an order actually did, measured.
type orderResult struct {
	anchor         Vec
	gap            float64
	sweptDeg       float64
	closest        float64
	flankRadius    float64
	closestPair    float64
	worstFacingErr float64
	moved          float64
	// elapsed is how long the order took to arrive, in seconds, measured at the
	// first tick the formation reached its objective. It is 0 for an order that
	// never arrives, such as a withdrawal, and for one that is arrived from the
	// first tick, such as a hold.
	elapsed float64
	arrived bool
	count   int
}

// runOrder plays one order against a stationary defender and measures the
// result. The defender never moves: these are order tests, not battle tests,
// and a moving enemy would make the expected standoff ambiguous.
func runOrder(t *testing.T, c Config, order Order, ticks int) orderResult {
	t.Helper()
	redCentre := Vec{0, orderGap / 2}
	blueCentre := Vec{0, -orderGap / 2}
	redViewOfBlue := Enemy{Centre: blueCentre, Facing: degrees(90), HalfDepth: 6, HalfWidth: 40, Count: orderPerSide}
	blueViewOfRed := Enemy{Centre: redCentre, Facing: degrees(270), HalfDepth: 6, HalfWidth: 40, Count: orderPerSide}
	red := onSlots(t, c, OrderHold, FormationLine, redCentre, redViewOfBlue, orderPerSide)
	blue := onSlots(t, c, order, FormationWedge, blueCentre, blueViewOfRed, orderPerSide)
	redPlan, err := BuildPlan(red, redViewOfBlue, OrderHold, FormationLine, c)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildPlan(blue, blueViewOfRed, order, FormationWedge, c)
	if err != nil {
		t.Fatal(err)
	}
	res := orderResult{
		anchor:  plan.Anchor,
		closest: math.Inf(1),
	}
	// The swing is accumulated rather than read off the first and last
	// bearings, because an angle that crosses the +/-180 degree seam would
	// otherwise appear to jump a long way when it has not moved at all.
	var swept float64
	var prevBearing float64
	havePrev := false
	haveArrived := false

	for tick := 0; tick < ticks; tick++ {
		enemyForBlue, err := SummariseEnemy(red)
		if err != nil {
			t.Fatal(err)
		}
		if havePrev {
			swept += wrapAngle(wrapAngle(Bearing(enemyForBlue.Centre, plan.Anchor)) - prevBearing)
		}
		prevBearing = wrapAngle(Bearing(enemyForBlue.Centre, plan.Anchor))
		havePrev = true
		res.closest = math.Min(res.closest, Distance(plan.Anchor, enemyForBlue.Centre))

		blue, plan, err = Step(blue, plan, enemyForBlue, c, scenarioTick)
		if err != nil {
			t.Fatalf("%v at tick %d: %v", order, tick, err)
		}
		enemyForRed, err := SummariseEnemy(blue)
		if err != nil {
			t.Fatal(err)
		}
		red, redPlan, err = Step(red, redPlan, enemyForRed, c, scenarioTick)
		if err != nil {
			t.Fatal(err)
		}
		// How long the order took is measured at the FIRST tick it arrived,
		// not the last. Recording the last tick instead reports the length of
		// the whole run for any order that is still holding its objective at
		// the end, which is most of them, and a charge that took 84 s to make
		// contact would be reported as having taken the full budget.
		if plan.Arrived && !haveArrived {
			haveArrived = true
			res.elapsed = float64(tick) * scenarioTick
		}
	}
	enemy, err := SummariseEnemy(red)
	if err != nil {
		t.Fatal(err)
	}
	res.anchor = plan.Anchor
	res.gap = Distance(plan.Anchor, enemy.Centre)
	res.arrived = plan.Arrived
	res.sweptDeg = deg(swept)
	res.moved = Distance(plan.Anchor, blueCentre)
	res.count = len(blue)
	// The stand-off the flank has to clear is measured against the defender as
	// the simulation actually reads it at the end of the run, not against the
	// hand-written Enemy the run was seeded with. The seed is a guess about a
	// line nobody has measured yet; SummariseEnemy replaces it on the first
	// tick with the depth the 40 men actually occupy, and the flank is resolved
	// against that. Checking the stand-off against the guess would be checking
	// the seed, not the manoeuvre.
	res.flankRadius = enemy.HalfDepth + plan.RearExtent + c.FlankStandoff
	res.closestPair, _, _ = minSeparationOfUnits(blue)
	for _, u := range blue {
		if d := math.Abs(deg(wrapAngle(u.Facing - wrapAngle(Bearing(u.Pos, enemy.Centre))))); d > res.worstFacingErr {
			res.worstFacingErr = d
		}
	}
	return res
}
