package battle

import (
	"fmt"
	"math"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// UNIT TESTS FOR THE FORMATION LAYER.
//
// The layout is a pure function, so it is tested as one: a small number of units
// in each shape, with the offsets written out to the centimetre rather than
// recomputed by the code under test. A test that recomputes the expectation with
// the same arithmetic proves only that the arithmetic is stable, not that the
// shape is the shape anyone asked for.
//
// The parameters are written out here rather than read from the balance file on
// purpose. These tests are about geometry: line_front_width changing from 16 to 12
// is a balance decision and belongs in the balance file, and a geometry test that
// read it would change what it was testing every time a designer touched a knob.

// layoutTestParams are round numbers chosen so every expected offset in these
// tests is exactly representable: a spacing of 2 and a depth of 3 are both whole
// numbers, and the centres of mass of the small shapes below land on halves and
// quarters that a float64 holds without rounding.
func layoutTestParams() FormationParams {
	return FormationParams{
		FrontSpacing: 2,
		RankSpacing:  3,
		// Three abreast is a small line and two is a section, so both shapes can
		// be drawn exactly in a test.
		LineFrontWidth:   3,
		ColumnFrontWidth: 2,
		// One man at the point and one added per side: the narrowest arrow that
		// is still a wedge, which for a test means the ranks are 1, 3, 5 wide.
		WedgeTipUnits:  1,
		WedgeRowGrowth: 1,
		// Loose order with the scatter switched off is an exact lattice, which
		// is what makes it testable to the centimetre. The scatter is tested
		// separately, for its bounds and for its determinism.
		LooseSpacing:        10,
		LooseJitterFraction: 0,
		Seed:                4242,
	}
}

// wantSlot is one expected offset, and comparing to the metre is the whole
// assertion: a formation that is a centimetre out is a different formation.
type wantSlot struct {
	right, forward float64
}

func checkSlots(t *testing.T, what string, got []Slot, want []wantSlot) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got %d slots, want %d: %+v", what, len(got), len(want), got)
	}
	for i := range want {
		if got[i].Right != want[i].right || got[i].Forward != want[i].forward {
			t.Errorf("%s: slot %d is (right %g, forward %g), want (right %g, forward %g)",
				what, i, got[i].Right, got[i].Forward, want[i].right, want[i].forward)
		}
	}
}

// TestFormationLayoutIsExactForEachShape is the brief's first test: N units in
// each formation land on the expected offsets, to the centimetre, for a small N.
//
// The expectations are worked out by hand and written down above each case, and
// the layout is a pure function of (shape, count, parameters), so there is
// nothing left to argue about: either the shape is that shape or it is not.
func TestFormationLayoutIsExactForEachShape(t *testing.T) {
	p := layoutTestParams()

	t.Run("line of four, three abreast", func(t *testing.T) {
		// Ranks of three at 2 m abreast and 3 m deep. Before centring the slots
		// are (-2, 0), (0, 0), (2, 0) and (-2, -3): the rear rank holds one
		// man, on the left, because the fourth man is the fourth man. The mean
		// is (-0.5, -0.75), so centring shifts everything by (+0.5, +0.75) and
		// the shape is:
		got, err := FormationLayout(FormationLine, 4, p)
		if err != nil {
			t.Fatalf("a line of four: %v", err)
		}
		checkSlots(t, "line of four", got, []wantSlot{
			{right: -1.5, forward: 0.75},
			{right: 0.5, forward: 0.75},
			{right: 2.5, forward: 0.75},
			{right: -1.5, forward: -2.25},
		})
	})

	t.Run("column of four, two abreast", func(t *testing.T) {
		// Two abreast, two deep, and the mean forward is (-3 + -3) / 4 = -1.5, so
		// the column is symmetric about its anchor and needs no shift sideways:
		got, err := FormationLayout(FormationColumn, 4, p)
		if err != nil {
			t.Fatalf("a column of four: %v", err)
		}
		checkSlots(t, "column of four", got, []wantSlot{
			{right: -1, forward: 1.5},
			{right: 1, forward: 1.5},
			{right: -1, forward: -1.5},
			{right: 1, forward: -1.5},
		})
	})

	t.Run("wedge of five", func(t *testing.T) {
		// Ranks of 1, 3, and 1: the point, two added per side, and one man left
		// over, who forms a short last rank on the spine. Mean forward is
		// (0 - 3 - 3 - 3 - 6) / 5 = -3, so the shape is:
		got, err := FormationLayout(FormationWedge, 5, p)
		if err != nil {
			t.Fatalf("a wedge of five: %v", err)
		}
		checkSlots(t, "wedge of five", got, []wantSlot{
			{right: 0, forward: 3},
			{right: -2, forward: 0},
			{right: 0, forward: 0},
			{right: 2, forward: 0},
			{right: 0, forward: -3},
		})
	})

	t.Run("square of eight, hollow", func(t *testing.T) {
		// A square of side 3 holds 4*3-4 = 8 men on its perimeter exactly, so
		// eight men is a 3-to-a-side square with nothing in the middle. Filled
		// front rank first, then down the right side, then the rear rank from
		// right to left, then up the left side:
		got, err := FormationLayout(FormationSquare, 8, p)
		if err != nil {
			t.Fatalf("a square of eight: %v", err)
		}
		checkSlots(t, "square of eight", got, []wantSlot{
			{right: -2, forward: 3},
			{right: 0, forward: 3},
			{right: 2, forward: 3},
			{right: 2, forward: 0},
			{right: 2, forward: -3},
			{right: 0, forward: -3},
			{right: -2, forward: -3},
			{right: -2, forward: 0},
		})
		// And the middle is empty, which is the whole of what hollow means.
		for i, s := range got {
			if s.Right == 0 && s.Forward == 0 {
				t.Errorf("square of eight: slot %d stands in the middle, so the square is not hollow: %+v", i, s)
			}
		}
	})

	t.Run("square of sixteen, hollow with nine places empty", func(t *testing.T) {
		// Side 5, perimeter 4*5-4 = 16, so sixteen men fill a 5-to-a-side
		// square exactly and the 3x3 inside it is empty. With a 2 m front
		// spacing the perimeter is |right| = 4 or |forward| = 6, and the inside
		// is every other lattice point, of which there are nine.
		got, err := FormationLayout(FormationSquare, 16, p)
		if err != nil {
			t.Fatalf("a square of sixteen: %v", err)
		}
		if len(got) != 16 {
			t.Fatalf("a square of sixteen has %d slots", len(got))
		}
		inside := 0
		for i, s := range got {
			if s.Right == 4 || s.Right == -4 || s.Forward == 6 || s.Forward == -6 {
				continue
			}
			inside++
			t.Errorf("square of sixteen: slot %d at (right %g, forward %g) is not on the perimeter", i, s.Right, s.Forward)
		}
		if inside != 0 {
			t.Errorf("a square of sixteen put %d men inside the perimeter", inside)
		}
		t.Logf("square of sixteen: %d slots, all on the perimeter, %d lattice places inside left empty",
			len(got), 3*3)
	})

	t.Run("skirmish of four, scatter off", func(t *testing.T) {
		// A 2-by-2 lattice at 10 m spacing, which is already centred on its own
		// anchor:
		got, err := FormationLayout(FormationSkirmish, 4, p)
		if err != nil {
			t.Fatalf("a skirmish line of four: %v", err)
		}
		checkSlots(t, "skirmish of four", got, []wantSlot{
			{right: -5, forward: -5},
			{right: 5, forward: -5},
			{right: -5, forward: 5},
			{right: 5, forward: 5},
		})
	})
}

// TestSquareIsHollowOnlyOnceItHasAnInside is the honest edge of the shape: four
// men or fewer cannot leave a middle empty, and the code says so by drawing the
// ring rather than by pretending otherwise.
//
// The check is the square's own extent rather than its slot coordinates, because
// a part-filled square is not symmetric and centring it on its centre of mass
// moves every slot. A square of s to a side is (s-1) front spacings wide and (s-1)
// rank spacings deep whatever is missing from its perimeter, and that is what a
// caller drawing one needs to know.
func TestSquareIsHollowOnlyOnceItHasAnInside(t *testing.T) {
	p := layoutTestParams()
	for _, n := range []int{1, 2, 3, 4, 5, 8, 9, 12, 16, 20, 21} {
		slots, err := FormationLayout(FormationSquare, n, p)
		if err != nil {
			t.Fatalf("a square of %d: %v", n, err)
		}
		if len(slots) != n {
			t.Fatalf("a square of %d has %d slots", n, len(slots))
		}
		side := squareSide(n)
		minR, maxR, minF, maxF, err := FormationExtent(slots)
		if err != nil {
			t.Fatalf("a square of %d: %v", n, err)
		}
		wantAcross := float64(side-1) * p.FrontSpacing
		wantDeep := float64(side-1) * p.RankSpacing
		// A partly filled square is never bigger than the square it belongs to,
		// and is exactly its size once the perimeter is full, which is the
		// arithmetic of squareSide: the side is the smallest that holds n, so the
		// perimeter is full only when n is 4s-4.
		if (maxR-minR) > wantAcross+1e-9 || (maxF-minF) > wantDeep+1e-9 {
			t.Errorf("a square of %d is %g m across and %g m deep, bigger than the %g by %g m a "+
				"%d-to-a-side square is", n, maxR-minR, maxF-minF, wantAcross, wantDeep, side)
		}
		if n == 4*side-4 {
			if math.Abs((maxR-minR)-wantAcross) > 1e-9 || math.Abs((maxF-minF)-wantDeep) > 1e-9 {
				t.Errorf("a square of %d fills the perimeter of a %d-to-a-side square but measures "+
					"%g m by %g m, want %g m by %g m", n, side, maxR-minR, maxF-minF, wantAcross, wantDeep)
			}
		}
		// No two men in the same place, whatever the count: a perimeter that
		// overlapped itself would be a shape with a man standing inside another.
		for i := range slots {
			for j := i + 1; j < len(slots); j++ {
				if slots[i] == slots[j] {
					t.Errorf("a square of %d put slots %d and %d in the same place: %+v", n, i, j, slots[i])
				}
			}
		}
	}
	// Four men or fewer fit a 2-to-a-side ring, and four men or fewer is also
	// every man a 2-to-a-side square has room for, so there is no inside to leave
	// empty until the square grows to three.
	for n := 1; n <= 4; n++ {
		if side := squareSide(n); side != 2 {
			t.Errorf("a square of %d chose side %d; four men or fewer fit a 2-to-a-side ring", n, side)
		}
	}
	if side := squareSide(5); side != 3 {
		t.Errorf("a square of five chose side %d, want 3: three to a side is the first square with a "+
			"middle to leave empty", side)
	}
	t.Logf("square sides: 1->%d 2->%d 4->%d 5->%d 9->%d 16->%d 17->%d 20->%d",
		squareSide(1), squareSide(2), squareSide(4), squareSide(5), squareSide(9), squareSide(16),
		squareSide(17), squareSide(20))
}

// TestEveryLayoutIsCentredOnItsAnchor is the property that keeps a holding line
// on its own ground: a shape standing exactly on its slots has its centre of mass
// on the anchor, so the anchor does not walk off while the frame rotates.
func TestEveryLayoutIsCentredOnItsAnchor(t *testing.T) {
	p := layoutTestParams()
	for _, f := range AllFormations() {
		for _, n := range []int{1, 2, 3, 5, 8, 13, 21, 50, 100, 257} {
			slots, err := FormationLayout(f, n, p)
			if err != nil {
				t.Fatalf("%s of %d: %v", f, n, err)
			}
			if len(slots) != n {
				t.Fatalf("%s of %d produced %d slots", f, n, len(slots))
			}
			var sumR, sumF, extent float64
			for _, s := range slots {
				sumR += s.Right
				sumF += s.Forward
				extent = math.Max(extent, math.Abs(s.Right))
			}
			// Centring subtracts the mean, and a sum of n such values is not
			// exactly zero in floating point: the residue here is around 1e-13 m
			// for the larger shapes, which is a ten-thousandth of a millimetre and
			// moves no man. The bound is therefore relative to the shape itself,
			// because an exact zero would be a test of the arithmetic rather than
			// of the geometry.
			tol := math.Max(extent, 1) * 1e-12
			if math.Abs(sumR/float64(n)) > tol || math.Abs(sumF/float64(n)) > tol {
				t.Errorf("%s of %d is not centred: the mean slot is (right %g, forward %g), "+
					"and a shape whose mean is not its anchor walks off the anchor every tick",
					f, n, sumR/float64(n), sumF/float64(n))
			}
		}
	}
}

// TestShapesKeepMenApart is the check that a shape is a shape: men on a lattice
// are a spacing apart, and the cohesion pass pulling them to their slots would
// fight the shape forever if they were not.
func TestShapesKeepMenApart(t *testing.T) {
	p := layoutTestParams()
	p.LooseJitterFraction = 0.25 // the scatter is the one thing that can crowd a lattice
	for _, f := range AllFormations() {
		for _, n := range []int{2, 3, 4, 8, 17, 64, 200} {
			slots, err := FormationLayout(f, n, p)
			if err != nil {
				t.Fatalf("%s of %d: %v", f, n, err)
			}
			got, err := MinSlotDistance(slots)
			if err != nil {
				t.Fatalf("%s of %d: %v", f, n, err)
			}
			// The tightest gap any shape is allowed to produce is the configured
			// min_separation, and the balance file refuses a value wider than
			// this, so a shape that crowded below it would make the file
			// unloadable and the spacing pass pointless.
			if got < p.FrontSpacing/2 {
				t.Errorf("%s of %d puts two men %g m apart, which is closer than half a front spacing "+
					"(%g m); the cohesion pass would fight the shape", f, n, got, p.FrontSpacing/2)
			}
		}
	}
}

// TestLayoutIsAPureFunctionOfItsArguments is the brief's determinism rule for
// placement: the same inputs give the same slots, every call, and the only input
// that changes a layout is an input.
//
// The scatter is the one part that reads a seed, and it is checked separately:
// a different seed moves a skirmisher and moves nothing else, which is the
// property that makes a recorded battle replay with its men in the same places.
func TestLayoutIsAPureFunctionOfItsArguments(t *testing.T) {
	p := layoutTestParams()
	p.LooseJitterFraction = 0.3
	for _, f := range AllFormations() {
		first, err := FormationLayout(f, 37, p)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for i := 0; i < 4; i++ {
			again, err := FormationLayout(f, 37, p)
			if err != nil {
				t.Fatalf("%s: %v", f, err)
			}
			for j := range first {
				if again[j] != first[j] {
					t.Fatalf("%s: slot %d came out as %+v on call %d and %+v on call 1; a layout "+
						"that varies between identical calls cannot be replayed", f, j, again[j], i+2, first[j])
				}
			}
		}
	}

	// A different seed moves the skirmish line and leaves the other four
	// shapes exactly where they were.
	other := p
	other.Seed = p.Seed + 1
	skirmish, err := FormationLayout(FormationSkirmish, 16, p)
	if err != nil {
		t.Fatal(err)
	}
	skirmishOther, err := FormationLayout(FormationSkirmish, 16, other)
	if err != nil {
		t.Fatal(err)
	}
	moved := 0
	for i := range skirmish {
		if skirmish[i] != skirmishOther[i] {
			moved++
		}
	}
	if moved != len(skirmish) {
		t.Errorf("changing the scatter seed moved %d of %d skirmish slots; every man should be "+
			"pushed by an unrelated amount, so every one of them should move", moved, len(skirmish))
	}
	for _, f := range []Formation{FormationLine, FormationColumn, FormationWedge, FormationSquare} {
		a, err := FormationLayout(f, 16, p)
		if err != nil {
			t.Fatal(err)
		}
		b, err := FormationLayout(f, 16, other)
		if err != nil {
			t.Fatal(err)
		}
		for i := range a {
			if a[i] != b[i] {
				t.Errorf("%s: slot %d moved when only the scatter seed changed (%+v -> %+v); the seed "+
					"is only for the scatter", f, i, a[i], b[i])
			}
		}
	}
}

// TestScatterStaysInsideItsBound is the promise the balance file makes about
// loose_jitter_fraction: a man is pushed off his lattice point by no more than
// the configured fraction of the loose spacing, and by nothing at all in one axis
// at the extreme.
func TestScatterStaysInsideItsBound(t *testing.T) {
	p := layoutTestParams()
	p.LooseJitterFraction = 0.4
	amp := p.LooseJitterFraction * p.LooseSpacing
	const n = 64
	slots, err := FormationLayout(FormationSkirmish, n, p)
	if err != nil {
		t.Fatal(err)
	}
	// 64 men need a lattice of 8 to a side, so the furthest a man can be from
	// the spine is 3.5 spacings, and the scatter can add up to amp on top of it.
	// The shape is centred on its own centre of mass afterwards, which moves the
	// whole lattice by at most the mean of the scatter, so the bound holds either
	// way.
	half := float64(7) / 2
	for i, s := range slots {
		if math.Abs(s.Right) > half*p.LooseSpacing+amp+1e-9 {
			t.Errorf("skirmish slot %d is %g m to the right, outside the lattice plus the scatter of %g m",
				i, s.Right, amp)
		}
		if math.Abs(s.Forward) > half*p.LooseSpacing+amp+1e-9 {
			t.Errorf("skirmish slot %d is %g m forward, outside the lattice plus the scatter of %g m",
				i, s.Forward, amp)
		}
	}
	// The scatter is a hash, not a constant: at least one slot in 64 must have
	// been pushed, or the seed is not reaching the placement at all.
	moved := 0
	for _, s := range slots {
		if s.Right != math.Trunc(s.Right/p.LooseSpacing)*p.LooseSpacing {
			moved++
		}
	}
	if moved == 0 {
		t.Error("no skirmisher was pushed off his lattice point by a jitter fraction of 0.4; " +
			"the seed is not reaching the placement")
	}
	t.Logf("skirmish of 64 at jitter %g: %d of %d men pushed off their lattice point, bound %.2f m",
		p.LooseJitterFraction, moved, len(slots), amp)
}

// TestLayoutRefusesWhatItCannotDraw is the error half: a shape that is not a
// shape, a formation of nobody, and parameters that would divide by zero all come
// back as named errors rather than as a formation that quietly is not one.
func TestLayoutRefusesWhatItCannotDraw(t *testing.T) {
	p := layoutTestParams()
	cases := []struct {
		name  string
		kind  Formation
		n     int
		mut   func(*FormationParams)
		field string
	}{
		{name: "no shape", kind: FormationNone, n: 4, field: "formation"},
		{name: "a shape that does not exist", kind: Formation(200), n: 4, field: "formation"},
		{name: "nobody", kind: FormationLine, n: 0, field: "units"},
		{name: "no front spacing", kind: FormationLine, n: 4, mut: func(q *FormationParams) { q.FrontSpacing = 0 }, field: "FrontSpacing"},
		{name: "no rank spacing", kind: FormationLine, n: 4, mut: func(q *FormationParams) { q.RankSpacing = 0 }, field: "RankSpacing"},
		{name: "a line of no width", kind: FormationLine, n: 4, mut: func(q *FormationParams) { q.LineFrontWidth = 0 }, field: "LineFrontWidth"},
		{name: "a column of no width", kind: FormationColumn, n: 4, mut: func(q *FormationParams) { q.ColumnFrontWidth = 0 }, field: "ColumnFrontWidth"},
		{name: "a wedge with no point", kind: FormationWedge, n: 4, mut: func(q *FormationParams) { q.WedgeTipUnits = 0 }, field: "WedgeTipUnits"},
		{name: "a wedge that does not widen", kind: FormationWedge, n: 4, mut: func(q *FormationParams) { q.WedgeRowGrowth = 0 }, field: "WedgeRowGrowth"},
		{name: "no loose spacing", kind: FormationSkirmish, n: 4, mut: func(q *FormationParams) { q.LooseSpacing = 0 }, field: "LooseSpacing"},
		{name: "a jitter of one half", kind: FormationSkirmish, n: 4, mut: func(q *FormationParams) { q.LooseJitterFraction = 0.5 }, field: "LooseJitterFraction"},
		{name: "a jitter past one half", kind: FormationSkirmish, n: 4, mut: func(q *FormationParams) { q.LooseJitterFraction = 0.6 }, field: "LooseJitterFraction"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			q := p
			if tc.mut != nil {
				tc.mut(&q)
			}
			slots, err := FormationLayout(tc.kind, tc.n, q)
			if err == nil {
				t.Fatalf("a formation of nobody with %q drew %+v instead of refusing", tc.name, slots)
			}
			if slots != nil {
				t.Errorf("a refused layout returned %d slots as well as an error", len(slots))
			}
			if !strings.Contains(err.Error(), tc.field) {
				t.Errorf("the error does not name %q, so a caller cannot tell which input was wrong: %v", tc.field, err)
			}
		})
	}
}

// TestFormationNamesRoundTrip is the wire and log check: every shape has a name, a
// name reads back as the shape it named, and a name that is not a shape is
// refused with the list rather than becoming a line.
func TestFormationNamesRoundTrip(t *testing.T) {
	for _, f := range AllFormations() {
		got, err := ParseFormation(f.String())
		if err != nil {
			t.Errorf("%s does not parse back: %v", f, err)
			continue
		}
		if got != f {
			t.Errorf("%s parsed back as %s", f, got)
		}
	}
	for _, alias := range []struct {
		in   string
		want Formation
	}{
		{"loose", FormationSkirmish},
		{"SKIRMISH", FormationSkirmish},
		{" skirmish-line ", FormationSkirmish},
		{"loose_order", FormationSkirmish},
		{"hollow", FormationSquare},
		{"hollow_square", FormationSquare},
		{"wedge", FormationWedge},
	} {
		got, err := ParseFormation(alias.in)
		if err != nil {
			t.Errorf("%q did not parse: %v", alias.in, err)
			continue
		}
		if got != alias.want {
			t.Errorf("%q parsed as %s, want %s", alias.in, got, alias.want)
		}
	}
	for _, bad := range []string{"", "testudo", "line abreast", "3", "column-of-file"} {
		got, err := ParseFormation(bad)
		if err == nil {
			t.Errorf("%q parsed as %s; an unknown shape must be refused rather than drawn as something", bad, got)
			continue
		}
		if got != FormationNone {
			t.Errorf("%q was refused but returned %s; a refused shape must come back as no shape", bad, got)
		}
		if !strings.Contains(err.Error(), "line") {
			t.Errorf("the error for %q does not list the shapes it accepts: %v", bad, err)
		}
	}
	if FormationNone.Valid() {
		t.Error("FormationNone reports itself as a shape; it is the absence of an order and a unit in " +
			"no shape must get no shape's effects")
	}
	if got := FormationNone.String(); got != "none" {
		t.Errorf("FormationNone is named %q, want \"none\"", got)
	}
	if got := Formation(200).String(); got != "formation(200)" {
		t.Errorf("an undefined shape is named %q; it should be marked as a number nobody defined", got)
	}
}

// TestFormationOrderNamesRoundTrip is the same check for the orders, because an
// order that reads back as a different one is a battle fought under orders nobody
// gave.
func TestFormationOrderNamesRoundTrip(t *testing.T) {
	for _, o := range AllFormationOrders() {
		got, err := ParseFormationOrder(o.String())
		if err != nil {
			t.Errorf("%s does not parse back: %v", o, err)
			continue
		}
		if got != o {
			t.Errorf("%s parsed back as %s", o, got)
		}
	}
	for _, bad := range []string{"", "flank", "hold position", "advance!"} {
		if got, err := ParseFormationOrder(bad); err == nil {
			t.Errorf("%q parsed as %s; an unknown order must be refused", bad, got)
		}
	}
	if !OrderFormationHold.Valid() {
		t.Error("OrderFormationHold does not report itself as an order; it is the zero value and the " +
			"order a formation is given when nobody has an opinion")
	}
	if FormationOrder(99).Valid() {
		t.Error("an undefined order reports itself as an order")
	}
}

// TestSlotPlacementFollowsTheFacing is the brief's "given a facing direction": the
// same slot is a different place on the ground for a different bearing, and the
// frame's right really is the man's right.
func TestSlotPlacementFollowsTheFacing(t *testing.T) {
	slot := Slot{Right: 2, Forward: 3}
	cases := []struct {
		name    string
		facing  float64
		wantX   float64
		wantY   float64
		comment string
	}{
		{name: "facing east", facing: 0, wantX: 3, wantY: -2, comment: "east, so right is south and forward is east"},
		{name: "facing north", facing: math.Pi / 2, wantX: 2, wantY: 3, comment: "north, so right is east"},
		{name: "facing west", facing: math.Pi, wantX: -3, wantY: 2, comment: "west, so right is north"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			x, y := slot.place(0, 0, tc.facing)
			if math.Abs(x-tc.wantX) > 1e-9 || math.Abs(y-tc.wantY) > 1e-9 {
				t.Errorf("%s: a slot 2 m right and 3 m forward landed at (%g, %g), want (%g, %g). %s",
					tc.name, x, y, tc.wantX, tc.wantY, tc.comment)
			}
		})
	}
	// An anchor moves everything, and the shape is only ever placed relative to
	// one.
	x, y := slot.place(100, -50, 0)
	if math.Abs(x-103) > 1e-9 || math.Abs(y+52) > 1e-9 {
		t.Errorf("a slot placed against an anchor at (100, -50) landed at (%g, %g), want (103, -52)", x, y)
	}
}

// TestCohesionToleranceIsTheShapesOwnSpacing is why a man in loose order is
// allowed to be seven metres from his slot and a man on a line is not.
func TestCohesionToleranceIsTheShapesOwnSpacing(t *testing.T) {
	p := layoutTestParams()
	p.LooseSpacing = 7
	for _, f := range AllFormations() {
		got := cohesionTolerance(f, p)
		want := p.FrontSpacing
		if f == FormationSkirmish {
			want = p.LooseSpacing
		}
		if got != want {
			t.Errorf("%s tolerates %g m of displacement, want %g m", f, got, want)
		}
	}
}

// TestFormationExtentAndBoundsAreTheSameNumbers: what an overlay draws is what
// the tick uses, so the two readers are checked against each other.
func TestFormationExtentAndBoundsAreTheSameNumbers(t *testing.T) {
	p := layoutTestParams()
	for _, f := range AllFormations() {
		slots, err := FormationLayout(f, 20, p)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		minR, maxR, minF, maxF, err := FormationExtent(slots)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for i, s := range slots {
			if s.Right < minR-1e-12 || s.Right > maxR+1e-12 || s.Forward < minF-1e-12 || s.Forward > maxF+1e-12 {
				t.Errorf("%s: slot %d at %+v is outside the extent the reader reported (%g, %g) to (%g, %g)",
					f, i, s, minR, maxR, minF, maxF)
			}
		}
		if minR >= maxR || minF >= maxF {
			t.Errorf("%s of 20 has no extent: right %g to %g, forward %g to %g", f, minR, maxR, minF, maxF)
		}
	}
	if _, _, _, _, err := FormationExtent(nil); err == nil {
		t.Error("the extent of no formation was reported rather than refused")
	}
	if _, err := MinSlotDistance([]Slot{{}}); err == nil {
		t.Error("the gap between one slot was reported rather than refused")
	}
}

// TestFormationParamsComeFromTheBalanceFile is the CONSTITUTION.md section 1.2
// check for this file: no spacing, no pace, and no scatter seed is written in Go,
// they are all read from the loaded config.
func TestFormationParamsComeFromTheBalanceFile(t *testing.T) {
	cfg := loadConfig(t)
	fc := cfg.Formation
	p := FormationParamsFrom(fc)
	checks := []struct {
		name        string
		got, want   float64
		key         string
		wantIntOnly bool
	}{
		{name: "front spacing", got: p.FrontSpacing, want: fc.FrontSpacing, key: "formation.front_spacing"},
		{name: "rank spacing", got: p.RankSpacing, want: fc.RankSpacing, key: "formation.rank_spacing"},
		{name: "line front width", got: float64(p.LineFrontWidth), want: fc.LineFrontWidth, key: "formation.line_front_width"},
		{name: "column front width", got: float64(p.ColumnFrontWidth), want: fc.ColumnFrontWidth, key: "formation.column_front_width"},
		{name: "wedge tip", got: float64(p.WedgeTipUnits), want: fc.WedgeTipUnits, key: "formation.wedge_tip_units"},
		{name: "wedge growth", got: float64(p.WedgeRowGrowth), want: fc.WedgeRowGrowth, key: "formation.wedge_row_growth"},
		{name: "loose spacing", got: p.LooseSpacing, want: fc.LooseSpacing, key: "formation.loose_spacing"},
		{name: "loose jitter", got: p.LooseJitterFraction, want: fc.LooseJitterFraction, key: "formation.loose_jitter_fraction"},
		{name: "scatter seed", got: float64(p.Seed), want: fc.LooseSeed, key: "formation.loose_seed"},
	}
	for _, ck := range checks {
		if ck.got != ck.want {
			t.Errorf("%s came out as %g, and the balance file says %s = %g", ck.name, ck.got, ck.key, ck.want)
		}
	}
	if err := p.validate(); err != nil {
		t.Errorf("the shipped balance file's formation parameters are not usable: %v", err)
	}
	t.Logf("formation params from the shipped file: %+v", p)
}

// TestNewFormationCommanderRefusesWhatItCannotOrder: a commander that is built
// from an order it cannot carry out would be a formation that quietly does
// nothing, and every one of these is a caller mistake that is visible now and
// invisible later.
func TestNewFormationCommanderRefusesWhatItCannotOrder(t *testing.T) {
	cfg := loadConfig(t)
	cases := []struct {
		name   string
		side   Side
		groups []Group
		field  string
	}{
		{name: "no config", side: SideA, groups: []Group{{Order: GroupOrder{Kind: FormationLine}, Units: []int{0}}}, field: "cfg"},
		{name: "no groups", side: SideA, field: "groups"},
		{
			name:   "a shape that does not exist",
			side:   SideA,
			groups: []Group{{Order: GroupOrder{Kind: Formation(99)}, Units: []int{0}}},
			field:  "Group.Order.Kind",
		},
		{
			name:   "an order that does not exist",
			side:   SideA,
			groups: []Group{{Order: GroupOrder{Kind: FormationLine, Order: FormationOrder(99)}, Units: []int{0}}},
			field:  "Group.Order.Order",
		},
		{
			name:   "a group of nobody",
			side:   SideA,
			groups: []Group{{Order: GroupOrder{Kind: FormationLine}, Units: nil}},
			field:  "Group.Units",
		},
		{
			name:   "a unit id below zero",
			side:   SideA,
			groups: []Group{{Order: GroupOrder{Kind: FormationLine}, Units: []int{0, -1}}},
			field:  "Group.Units",
		},
		{
			name: "a unit in two groups",
			side: SideA,
			groups: []Group{
				{Order: GroupOrder{Kind: FormationLine}, Units: []int{0, 1}},
				{Order: GroupOrder{Kind: FormationWedge}, Units: []int{1, 2}},
			},
			field: "Group.Units",
		},
		{
			name: "a facing that is not a direction",
			side: SideA,
			groups: []Group{{
				Order: GroupOrder{Kind: FormationLine, Facing: Facing{Bearing: math.NaN(), Fixed: true}},
				Units: []int{0},
			}},
			field: "Group.Order.Facing.Bearing",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var c *FormationCommander
			var err error
			if tc.name == "no config" {
				c, err = NewFormationCommander(nil, tc.side, tc.groups)
			} else {
				c, err = NewFormationCommander(cfg, tc.side, tc.groups)
			}
			if err == nil {
				t.Fatalf("a commander was built from %q with %d groups", tc.name, len(c.groups))
			}
			if c != nil {
				t.Error("a refused commander was returned as well as an error")
			}
			if !strings.Contains(err.Error(), tc.field) {
				t.Errorf("the error does not name %q: %v", tc.field, err)
			}
		})
	}
	// A side that is neither A nor B is refused too, and it is not in the table
	// because it needs a config and the table's first case has none.
	if _, err := NewFormationCommander(cfg, Side(7), []Group{{Order: GroupOrder{Kind: FormationLine}, Units: []int{0}}}); err == nil {
		t.Error("a commander was built for side 7, which is neither A nor B")
	}
}

// TestSplitIntoGroupsCoversEveryUnitOnce is the convenience a caller uses to hand
// a whole side to the formation layer, and it is checked by the property that
// matters: every id lands in exactly one group, and the split is a function of the
// ids alone.
func TestSplitIntoGroupsCoversEveryUnitOnce(t *testing.T) {
	ids := []int{7, 3, 9, 1, 5, 0, 8, 2, 6, 4}
	groups := SplitIntoGroups(ids, 3)
	if len(groups) != 3 {
		t.Fatalf("asked for 3 groups, got %d", len(groups))
	}
	seen := make(map[int]int)
	sizes := make([]int, len(groups))
	for gi, g := range groups {
		sizes[gi] = len(g)
		for _, id := range g {
			seen[id]++
		}
		for i := 1; i < len(g); i++ {
			if g[i] <= g[i-1] {
				t.Errorf("group %d is not in ascending id order: %v", gi, g)
			}
		}
	}
	for _, id := range ids {
		if seen[id] != 1 {
			t.Errorf("unit %d is in %d groups, want exactly 1", id, seen[id])
		}
	}
	if sizes[0] != 4 || sizes[1] != 3 || sizes[2] != 3 {
		t.Errorf("ten units split into groups of %v; the remainder should go to the early groups", sizes)
	}
	// Same input, same split, every time: a battle that is replayed must find
	// the same men in the same formation.
	again := SplitIntoGroups(ids, 3)
	for i := range groups {
		if len(again[i]) != len(groups[i]) {
			t.Fatalf("the split changed between calls: %v then %v", groups, again)
		}
		for j := range groups[i] {
			if again[i][j] != groups[i][j] {
				t.Fatalf("the split changed between calls: %v then %v", groups, again)
			}
		}
	}
	if got := SplitIntoGroups(ids, 0); got != nil {
		t.Error("zero groups returned something rather than nothing")
	}
	if got := SplitIntoGroups(nil, 2); len(got) != 2 {
		t.Errorf("two groups asked for from nobody returned %d", len(got))
	}
}

// TestShapeEffectsComeFromTheBalanceFile is the section 1.2 check for the
// combat half: what a shape is worth is read out of the config, and the values
// the shipped file carries are the ones the engine uses.
//
// The scales are checked through the engine's own accessors on a Battle built
// from the shipped config, because those are the functions the melee and
// aimed-fire stages call. Anything that returned a number from anywhere else would
// be a number hiding in code.
func TestShapeEffectsComeFromTheBalanceFile(t *testing.T) {
	cfg := loadConfig(t)
	fc := cfg.Formation

	// A wedge at the run hits harder, and a wedge that walked into the same
	// brawl hits no harder than a line.
	wedge := setupEffectBattle(t, cfg, FormationWedge, 0)
	if got := wedge.meleeDealtScale(0, fc.ChargeSpeed); got != 1+fc.WedgeChargeDamageBonus {
		t.Errorf("a wedge at %g m/s deals %g, want %g", fc.ChargeSpeed, got, 1+fc.WedgeChargeDamageBonus)
	}
	if got := wedge.meleeDealtScale(0, fc.ChargeSpeed/2); got != 1 {
		t.Errorf("a wedge at half the charge speed deals %g, want 1: the bonus is for arriving at the run", got)
	}
	if got := wedge.meleeDealtScale(0, fc.ChargeSpeed*2); got != 1+fc.WedgeChargeDamageBonus {
		t.Errorf("a wedge well past the charge speed deals %g, want %g; there is no further bonus for "+
			"arriving faster still", got, 1+fc.WedgeChargeDamageBonus)
	}

	// A wedge is caught from the side. The formation faces +X, so a blow from
	// +X is frontal and one from -X is a flank.
	frontal := wedge.meleeTakenScale(0, 0, 0, 1, 0, 0)
	if frontal != 1 {
		t.Errorf("a wedge taking a blow from directly in front pays %g, want 1", frontal)
	}
	flank := wedge.meleeTakenScale(0, 0, 0, -1, 0, 0)
	if flank != fc.WedgeFlankTakenScale {
		t.Errorf("a wedge taking a blow from behind pays %g, want %g", flank, fc.WedgeFlankTakenScale)
	}
	// The arc is either side of the facing, so a blow 90 degrees off is outside
	// a 120-degree arc and a blow 30 degrees off is inside it.
	arcHalf := fc.WedgeFlankArcDeg * math.Pi / 180 / 2
	inside := wedge.meleeTakenScale(0, 0, 0, math.Cos(arcHalf/2), math.Sin(arcHalf/2), 0)
	if inside != 1 {
		t.Errorf("a blow %g degrees off the front of a wedge pays %g, want 1: it is inside the %g degree arc",
			fc.WedgeFlankArcDeg/4, inside, fc.WedgeFlankArcDeg)
	}
	outside := wedge.meleeTakenScale(0, 0, 0, math.Cos(arcHalf*1.5), math.Sin(arcHalf*1.5), 0)
	if outside != fc.WedgeFlankTakenScale {
		t.Errorf("a blow %g degrees off the front of a wedge pays %g, want %g: it is outside the %g degree arc",
			fc.WedgeFlankArcDeg*0.75, outside, fc.WedgeFlankTakenScale, fc.WedgeFlankArcDeg)
	}
	// A blow with no bearing at all is frontal, which is a stated rule and not
	// an accident of the arithmetic.
	if got := wedge.meleeTakenScale(0, 0, 0, 0, 0, 0); got != 1 {
		t.Errorf("a wedge taking a blow from its own position pays %g, want 1: a man inside the wedge "+
			"has not flanked it", got)
	}

	// A square turns a fast mover away and is ordinary against anything else.
	square := setupEffectBattle(t, cfg, FormationSquare, 0)
	if got := square.meleeTakenScale(0, 0, 0, 1, 0, 0); got != 1 {
		t.Errorf("a square pays %g against a man on foot, want 1", got)
	}
	if got := square.meleeTakenScale(0, 0, 0, 1, 0, fc.SquareFastMoverSpeed); got != fc.SquareFastMoverTakenScale {
		t.Errorf("a square pays %g against a mover at exactly the configured %g m/s, want %g",
			got, fc.SquareFastMoverSpeed, fc.SquareFastMoverTakenScale)
	}
	if got := square.meleeTakenScale(0, 0, 0, 1, 0, fc.SquareFastMoverSpeed-0.01); got != 1 {
		t.Errorf("a square pays %g against a mover just under the configured speed, want 1", got)
	}
	if got := (&FormationCommander{cfg: cfg}).paceScale(FormationSquare); got != fc.SquareMoveSpeedScale {
		t.Errorf("a square moves at %g of the pace it is given, want %g", got, fc.SquareMoveSpeedScale)
	}

	// Skirmish order is hard to pin down and easy to reach.
	skirmish := setupEffectBattle(t, cfg, FormationSkirmish, 0)
	if got := skirmish.suppressionTakenScale(0); got != fc.SkirmishSuppressionTakenScale {
		t.Errorf("a skirmisher takes %g of the suppression aimed at him, want %g", got, fc.SkirmishSuppressionTakenScale)
	}
	if got := skirmish.meleeTakenScale(0, 0, 0, 1, 0, 0); got != fc.SkirmishMeleeTakenScale {
		t.Errorf("a skirmisher pays %g in the hand-to-hand, want %g", got, fc.SkirmishMeleeTakenScale)
	}

	// Line and column are the reference shapes: neither adds nor takes anything,
	// which is stated in the balance file and checked here.
	//
	// The pace is read through the commander rather than through the Battle,
	// because the commander is where a formation's pace is decided: it is the
	// thing that writes the movement order. A pace rule that lived on the Battle
	// would have no caller, and a rule with no caller reads as a rule that works.
	commander := &FormationCommander{cfg: cfg}
	for _, f := range []Formation{FormationLine, FormationColumn} {
		b := setupEffectBattle(t, cfg, f, 0)
		if got := b.meleeDealtScale(0, fc.ChargeSpeed*2); got != 1 {
			t.Errorf("%s at the run deals %g, want 1: it is a reference shape", f, got)
		}
		if got := b.meleeTakenScale(0, 0, 0, -1, 0, 0); got != 1 {
			t.Errorf("%s pays %g from the flank, want 1: it is a reference shape", f, got)
		}
		if got := b.suppressionTakenScale(0); got != 1 {
			t.Errorf("%s takes %g of the suppression aimed at it, want 1: it is a reference shape", f, got)
		}
		if got := commander.paceScale(f); got != 1 {
			t.Errorf("%s moves at %g of the pace it is given, want 1: it is a reference shape", f, got)
		}
	}

	// And a unit in no shape gets nothing from any of it, which is what makes an
	// uncommanded battle bit-for-bit the battle there was before formations.
	none := setupEffectBattle(t, cfg, FormationNone, 0)
	if none.meleeDealtScale(0, 100) != 1 || none.meleeTakenScale(0, 0, 0, -1, 0, 100) != 1 ||
		none.suppressionTakenScale(0) != 1 || commander.paceScale(FormationWedge) != 1 {
		t.Error("a unit in no formation is getting a formation effect")
	}
}

// setupEffectBattle builds a battle and puts one unit into one shape, so the
// effect accessors can be read against a real Battle with a real config behind
// them rather than against a hand-built struct.
func setupEffectBattle(t *testing.T, cfg *config.Config, kind Formation, facing float64) *Battle {
	t.Helper()
	b, err := newBattle(cfg, 20260930, smallSetup(t, cfg, 4))
	if err != nil {
		t.Fatalf("building a battle to read formation effects: %v", err)
	}
	b.formations[0] = formationState{Kind: kind, Facing: facing}
	return b
}

// TestASpacingScaleRedrawsTheShapeAndNothingElse is the geometry a commander's
// change-spacing order has to produce, written out to the centimetre.
//
// The expectations are derived by hand rather than by calling scaledBy, because a
// test that calls the function it is checking proves only that the function does
// not panic. The parameters are layoutTestParams: a front spacing of 2 and a line
// three abreast, so a line of three is ONE rank of three men 2 m apart, and the
// mean of {-2, 0, +2} is 0, so centring the slots moves nothing. That makes the
// scale the only variable in the answer:
//
//	scale 1/2 -> 1 m apart -> (-1,0) (0,0) (1,0)
//	scale 1   -> 2 m apart -> (-2,0) (0,0) (2,0)
//	scale 3   -> 6 m apart -> (-6,0) (0,0) (6,0)
func TestASpacingScaleRedrawsTheShapeAndNothingElse(t *testing.T) {
	p := layoutTestParams()

	for _, tc := range []struct {
		scale float64
		want  []wantSlot
	}{
		{scale: 0.5, want: []wantSlot{{right: -1, forward: 0}, {right: 0, forward: 0}, {right: 1, forward: 0}}},
		{scale: 1, want: []wantSlot{{right: -2, forward: 0}, {right: 0, forward: 0}, {right: 2, forward: 0}}},
		{scale: 3, want: []wantSlot{{right: -6, forward: 0}, {right: 0, forward: 0}, {right: 6, forward: 0}}},
	} {
		got, err := FormationLayout(FormationLine, 3, p.scaledBy(tc.scale))
		if err != nil {
			t.Fatalf("a line of three at scale %g: %v", tc.scale, err)
		}
		checkSlots(t, "line of three at scale "+ftoa(tc.scale), got, tc.want)
	}

	// The depth scales with the front, and this is the half of the order a
	// front-only check would miss: a formation with the same width and twice the
	// depth is a different shape that happens to look like a line from in front.
	//
	// A line of six, three abreast, at scale 1 is two ranks: {-2,0} {0,0} {2,0}
	// then {-2,-3} {0,-3} {2,-3}, mean (-0, -1.5), so the centred ranks are at
	// forward +1.5 and -1.5. At scale 2 the front spacing is 4 and the rank
	// spacing is 6, and the mean of {-4,0} {0,0} {4,0} {-4,-6} {0,-6} {4,-6} is
	// (0, -3), so the ranks are at forward +3 and -3.
	deep := layoutTestParams()
	for _, tc := range []struct {
		scale float64
		want  []wantSlot
	}{
		{scale: 1, want: []wantSlot{
			{right: -2, forward: 1.5}, {right: 0, forward: 1.5}, {right: 2, forward: 1.5},
			{right: -2, forward: -1.5}, {right: 0, forward: -1.5}, {right: 2, forward: -1.5},
		}},
		{scale: 2, want: []wantSlot{
			{right: -4, forward: 3}, {right: 0, forward: 3}, {right: 4, forward: 3},
			{right: -4, forward: -3}, {right: 0, forward: -3}, {right: 4, forward: -3},
		}},
	} {
		got, err := FormationLayout(FormationLine, 6, deep.scaledBy(tc.scale))
		if err != nil {
			t.Fatalf("a line of six at scale %g: %v", tc.scale, err)
		}
		checkSlots(t, "line of six at scale "+ftoa(tc.scale), got, tc.want)
	}
}

// TestTheSpacingsAScaleOrderTightensAreTheTolerancesTheShapeIsHeldTo is the
// reason the order scales the SPACINGS and not the drawn slots.
//
// Every tolerance this layer applies to a man is derived from the shape's spacing:
// how far he may be from his slot and still count as standing in it
// (cohesionTolerance), and how far inside that he is pinned and never handed back
// to the engine (settleRadius). If a change-spacing order scaled the slots alone,
// a commander who closed up would get a tighter shape that still forgave being
// shoved exactly as far as the open one did, which is not closing up at all: the
// whole point of tightening ranks is that a man is then harder to knock out of
// place. So a scale of 1/2 must halve the tolerance, and the test says so.
func TestTheSpacingsAScaleOrderTightensAreTheTolerancesTheShapeIsHeldTo(t *testing.T) {
	p := layoutTestParams()
	for _, scale := range []float64{0.5, 1, 2} {
		sp := p.scaledBy(scale)
		if got, want := cohesionTolerance(FormationLine, sp), p.FrontSpacing*scale; got != want {
			t.Errorf("at scale %g a man counts as in his slot within %g m, want %g m", scale, got, want)
		}
		// Skirmish order's tolerance is its loose spacing, not its front spacing,
		// so it has to scale with that number instead and is checked here rather
		// than left to look correct by accident.
		if got, want := cohesionTolerance(FormationSkirmish, sp), p.LooseSpacing*scale; got != want {
			t.Errorf("at scale %g a skirmisher counts as in his slot within %g m, want %g m", scale, got, want)
		}
	}
	// And the tolerances really do move, which is the part a comment cannot hold
	// to: the open shape forgives three times what the closed one does.
	if cohesionTolerance(FormationLine, p.scaledBy(0.5)) >= cohesionTolerance(FormationLine, p) {
		t.Error("closing up did not tighten the cohesion tolerance, so the order changes the drawing and not the behaviour")
	}
	// The jitter fraction is deliberately not scaled, and this is the reason it is
	// exempt: it is already a fraction of the loose spacing, so scaling the loose
	// spacing scales the scatter with it and the shape stays as loose as it was
	// drawn to be. Scaling it as well would make the scatter grow faster than the
	// lattice it belongs to.
	if got := p.scaledBy(2).LooseJitterFraction; got != p.LooseJitterFraction {
		t.Errorf("scaling the loose spacing also scaled the jitter fraction to %g, from %g", got, p.LooseJitterFraction)
	}
}

// TestAScaleOfOneChangesNothingAtAll is the case every group's order takes by
// default, and it has to be a no-op rather than a rebuild of the same layout: a
// commander with no spacing order holds the balance file's spacing, and a scale of
// one is that spacing, so the two must produce identical slots to the centimetre.
func TestAScaleOfOneChangesNothingAtAll(t *testing.T) {
	p := layoutTestParams()
	for _, n := range []int{1, 2, 3, 7, 16, 33} {
		base, err := FormationLayout(FormationWedge, n, p)
		if err != nil {
			t.Fatalf("a wedge of %d: %v", n, err)
		}
		one, err := FormationLayout(FormationWedge, n, p.scaledBy(1))
		if err != nil {
			t.Fatalf("a wedge of %d at scale one: %v", n, err)
		}
		for i := range base {
			if base[i] != one[i] {
				t.Fatalf("a wedge of %d at scale one: slot %d is %+v, unscaled %+v", n, i, one[i], base[i])
			}
		}
	}
}

// ftoa is strconv.FormatFloat at the precision these tests want, without importing
// strconv into a file whose other tests spell their expectations out by hand.
func ftoa(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%g", v), "0"), ".")
}

// syntheticField builds a view of n units a side laid out on a grid one metre
// apart, so a test can ask the formation layer a question about anchors without
// fighting a battle to ask it.
//
// The men are put on a grid rather than in a block on purpose: the bug this file's
// caller was written for is about two groups whose centres of mass are close, and
// a grid is the cheapest way to place two blocks of men at a chosen distance from
// each other and nothing else.
func syntheticField(t *testing.T, perGroup []int, gapX float64) *View {
	t.Helper()
	n := 0
	for _, g := range perGroup {
		n += g
	}
	v := &View{
		TickSeconds: 0.1,
		Units:       make([]UnitView, n),
		Commands:    make([]UnitCommand, n),
	}
	// One column per group, the groups spaced gapX apart in x, the men of a group
	// stacked in y a metre apart so a group's own extent is its own height.
	id := 0
	for gi, g := range perGroup {
		for k := 0; k < g; k++ {
			v.Units[id] = UnitView{
				ID: id, Side: SideA, Status: StatusFighting,
				X: float64(gi) * gapX, Y: float64(k),
				Troops: 1, Speed: 4.2,
			}
			id++
		}
	}
	return v
}

// TestTwoGroupsOfOneSideAreNotDrawnOnTopOfEachOther is the invariant that was
// broken, stated as an invariant so it can be checked without a battle.
//
// Each group's anchor used to be its own centre of mass and nothing else. Two
// groups whose centres of mass are closer than the two shapes are wide are then
// two shapes drawn through the middle of each other, and since every man is
// walked onto his own slot, the men end up on top of each other while both are
// exactly where they were told to stand. Measured on a 500-a-side hold split four
// ways, every man was within 0.15 m of his own slot and two men of DIFFERENT
// groups stood 0.28 m apart, against a min_separation of 1.20 m.
//
// The check is the shape the bug took, not a threshold nobody reasoned about: the
// two groups' slots, as drawn, must not come closer than the front spacing, and
// every man must be at least min_separation from every other man on his side.
func TestTwoGroupsOfOneSideAreNotDrawnOnTopOfEachOther(t *testing.T) {
	cfg := loadConfig(t)
	p := FormationParamsFrom(cfg.Formation)
	ms := cfg.Formation.MinSeparation

	// Four groups a side, each 125 men, whose centres of mass start twelve metres
	// apart. A line of 125 men at this file's line_front_width is eighteen metres
	// wide, so twelve is comfortably inside the overlap and the bug reproduces.
	perGroup := []int{125, 125, 125, 125}
	const anchorGap = 12.0
	v := syntheticField(t, perGroup, anchorGap)

	ids := make([]int, 0, len(v.Units))
	for i := range v.Units {
		ids = append(ids, i)
	}
	groups := SplitIntoGroups(ids, len(perGroup))
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[0]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[1]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[2]},
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: groups[3]},
	})
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := cmd.Command(v); err != nil {
		t.Fatalf("ordering the field: %v", err)
	}

	// Where each group was told to draw its shape, and how close the two nearest
	// shapes came. This is the measurement, in the units the bug appeared in.
	type drawn struct {
		x, y float64
		w, h float64
	}
	var ds []drawn
	for gi, g := range cmd.groups {
		ax, ay, ok := centreOfMassView(v, g)
		if !ok {
			t.Fatalf("group %d has no centre of mass", gi)
		}
		// The anchor the commander will draw around, which is the group's
		// separated anchor rather than its own centre of mass.
		ax, ay = cmd.separateAnchors(g, ax, ay)
		slots, err := FormationLayout(g.order.Kind, len(g.units), p)
		if err != nil {
			t.Fatalf("group %d: %v", gi, err)
		}
		minR, maxR, minF, maxF, err := FormationExtent(slots)
		if err != nil {
			t.Fatalf("group %d extent: %v", gi, err)
		}
		// The extent along the axis the side's groups are actually spread on, not
		// the shape's own Right and Forward. They differ by the group's facing: a
		// line of 125 men is 22.5 m across its front and 14 m deep, and which of
		// those two numbers points along the line of groups depends on which way
		// the group faces. Reporting the shape-frame number here made the sweep's
		// spacing look impossible - fifteen and a half metres between the anchors
		// of two shapes twenty-two metres wide - when the twenty-two is measured
		// across a different axis entirely.
		d := drawn{}
		d.x, d.y = ax, ay
		d.w, d.h = maxR-minR, maxF-minF
		lo, hi := math.Inf(1), math.Inf(-1)
		for _, sl := range slots {
			x, _ := sl.place(ax, ay, g.facing)
			// The spread axis here is x, which is what the synthetic field places
			// the groups along.
			if x < lo {
				lo = x
			}
			if x > hi {
				hi = x
			}
		}
		spread := hi - lo
		// A non-finite anchor is checked here rather than left to the comparison
		// below. It is not a hypothetical: the first version of the separation pass
		// divided by a measured overlap of zero and handed back -Inf and NaN
		// anchors, and every distance measured from them is +Inf, which is not
		// less than min_separation, so the test below PASSED on a pass that had
		// broken the whole field. A test that cannot tell "no overlap" from "no
		// answer" is not measuring overlap.
		if !isFinite(ax) || !isFinite(ay) {
			t.Fatalf("group %d was given the anchor (%v, %v), which is not a place on the field",
				gi, ax, ay)
		}
		ds = append(ds, d)
		t.Logf("group %d: anchor (%.2f, %.2f), shape %.1f m across its front and %.1f m deep, "+
			"%.1f m along the line the groups are spread on, %d men",
			gi, ax, ay, d.w, d.h, spread, len(g.units))
	}
	// The nearest approach between any two groups' slots, measured on the slots
	// themselves rather than on the anchors, because two anchors far apart can
	// still carry two wide shapes into each other.
	worst := math.Inf(1)
	var worstPair string
	for i := 0; i < len(cmd.groups); i++ {
		for j := i + 1; j < len(cmd.groups); j++ {
			gi, gj := cmd.groups[i], cmd.groups[j]
			ai, aj := ds[i], ds[j]
			si, err := FormationLayout(gi.order.Kind, len(gi.units), p)
			if err != nil {
				t.Fatal(err)
			}
			sj, err := FormationLayout(gj.order.Kind, len(gj.units), p)
			if err != nil {
				t.Fatal(err)
			}
			for _, a := range si {
				ax, ay := a.place(ai.x, ai.y, gi.facing)
				for _, b := range sj {
					bx, by := b.place(aj.x, aj.y, gj.facing)
					d := math.Hypot(ax-bx, ay-by)
					if d < worst {
						worst = d
						worstPair = fmt.Sprintf("group %d and group %d", i, j)
					}
				}
			}
		}
	}
	t.Logf("the nearest two slots of different groups come within %.2f m (%s); min_separation is %.2f m and the front spacing is %.2f m",
		worst, worstPair, ms, p.FrontSpacing)
	if !isFinite(worst) {
		t.Fatalf("measured no distance between any two groups' slots, so there was nothing to "+
			"compare against min_separation %g; %d groups drew %v", ms, len(cmd.groups), ds)
	}
	if worst < ms {
		t.Errorf("two groups of one side were told to draw their shapes %.2f m apart, against a "+
			"min_separation of %.2f m. Their anchors are %v apart and each shape is %.1f m wide, so "+
			"the shapes are being drawn through each other and the men in them are being walked onto "+
			"the same ground.",
			worst, ms, ds, ds[0].w)
	}
}

// centreOfMassView is a centre of mass over a group's own members, taken from a
// view rather than from a Battle, for the tests that place men by hand.
func centreOfMassView(v *View, g *formationGroup) (float64, float64, bool) {
	var sx, sy, w float64
	for _, id := range g.units {
		if id < 0 || id >= len(v.Units) || v.Units[id].Status != StatusFighting {
			continue
		}
		t := v.Units[id].Troops
		sx += v.Units[id].X * t
		sy += v.Units[id].Y * t
		w += t
	}
	if w == 0 {
		return 0, 0, false
	}
	return sx / w, sy / w, true
}

// oneHeldLine builds a view of one group of n men ordered to hold in a line,
// together with the commander that orders it, so a test can ask what ground the
// group is standing on without fighting a battle to ask it.
//
// The group's anchor after a Command is read straight off the group, which is the
// thing the whole of the hold rule is about: the anchor is where the shape is
// drawn, and the shape is what the men are walked onto.
func oneHeldLine(t *testing.T, n int) (*View, *FormationCommander) {
	t.Helper()
	cfg := loadConfig(t)
	v := syntheticField(t, []int{n}, 0)
	ids := make([]int, 0, n)
	for i := range v.Units {
		ids = append(ids, i)
	}
	cmd, err := NewFormationCommander(cfg, SideA, []Group{
		{Order: GroupOrder{Kind: FormationLine, Order: OrderFormationHold}, Units: ids},
	})
	if err != nil {
		t.Fatalf("building the commander: %v", err)
	}
	if err := cmd.Command(v); err != nil {
		t.Fatalf("ordering the field: %v", err)
	}
	if len(cmd.groups) != 1 {
		t.Fatalf("built a commander with %d groups from one group of men", len(cmd.groups))
	}
	return v, cmd
}

// shove moves every man of the field by (dx, dy), which is what a melee push, a
// rally or a spawn looks like to the formation layer: the whole body of troops is
// somewhere else and the order has not changed.
func shove(v *View, dx, dy float64) {
	for i := range v.Units {
		v.Units[i].X += dx
		v.Units[i].Y += dy
	}
}

// TestAHoldKeepsItsGroundWhenItsMenAreShoved is the invariant that was broken,
// stated without a battle so it cannot be argued with.
//
// A hold drew its shape around its own centre of mass and walked every man onto
// his slot in it. That is a closed loop with nothing in it holding the ground:
// shove the men five metres and the shape is redrawn five metres on, so they are
// never out of place and the group never comes back. Measured over 210 ticks on
// the thirty-a-side session, one of two held lines walked 6.6 m east and 6.1 m
// north and stayed there, and the settled centre of mass was 3.85 m from where
// the line started against a metre the test allows.
//
// Five metres is well inside the shape's own width, so this is a group that was
// jostled, not one that was carried off: it keeps the ground it was ordered onto
// and its men are walked back to it.
func TestAHoldKeepsItsGroundWhenItsMenAreShoved(t *testing.T) {
	const n = 15
	v, cmd := oneHeldLine(t, n)
	g := cmd.groups[0]
	ax, ay := g.anchorX, g.anchorY

	shove(v, 5, 0)
	if err := cmd.Command(v); err != nil {
		t.Fatalf("ordering the field after the shove: %v", err)
	}
	if got := math.Hypot(g.anchorX-ax, g.anchorY-ay); got > 1e-9 {
		t.Errorf("a line ordered to hold on (%.2f, %.2f) was drawn on (%.2f, %.2f) after all %d of "+
			"its men were shoved five metres east; a hold keeps the ground it was given",
			ax, ay, g.anchorX, g.anchorY, n)
	}
	// The other half of the same statement: the ground is kept, and the men are
	// told to come back to it. A formation that kept its ground by ignoring its
	// men would pass the check above and be a different bug.
	ordered := 0
	for i := range v.Units {
		c := v.Commands[i]
		if !c.Set {
			continue
		}
		// Shoved east, so walking home is a negative x.
		if c.DX < 0 {
			ordered++
		}
	}
	if ordered != n {
		t.Errorf("%d of %d men were told to walk back west to the held ground; every man of a "+
			"shoved hold is out of his slot and every one of them is out of his slot because of the shove",
			ordered, n)
	}
}

// TestAHoldTakesNewGroundWhenItsMenAreCarriedOff is the other half of the rule, and
// it is here because the fix without it is a worse bug than the one it fixed.
//
// Remembering the ground forever means a group that has been broken and rallied,
// or dropped somewhere else by whatever moved it, walks the length of the field to
// a place it was ordered to stand in half a minute ago. Past the shape's own width
// the men are not jostled, they are somewhere else, and the group takes new ground
// where they are.
func TestAHoldTakesNewGroundWhenItsMenAreCarriedOff(t *testing.T) {
	const n = 15
	cfg := loadConfig(t)
	v, cmd := oneHeldLine(t, n)
	g := cmd.groups[0]
	ax, ay := g.anchorX, g.anchorY

	slots, err := FormationLayout(FormationLine, n, FormationParamsFrom(cfg.Formation))
	if err != nil {
		t.Fatalf("layout: %v", err)
	}
	minR, maxR, _, _, err := FormationExtent(slots)
	if err != nil {
		t.Fatalf("extent: %v", err)
	}
	leash := maxR - minR
	// Carried twice the shape's own width, which is further than anything that
	// could be a shove.
	carried := 2 * leash
	shove(v, carried, 0)
	if err := cmd.Command(v); err != nil {
		t.Fatalf("ordering the field after the carry: %v", err)
	}
	if d := math.Hypot(g.anchorX-(ax+carried), g.anchorY-ay); d > 1e-9 {
		t.Errorf("a line whose %d men were carried %.1f m, twice its own %.1f m width, is still drawn "+
			"on (%.2f, %.2f) instead of (%.2f, %.2f); a formation that has been picked up and put "+
			"down somewhere else re-forms where it is",
			n, carried, leash, g.anchorX, g.anchorY, ax+carried, ay)
	}
}
