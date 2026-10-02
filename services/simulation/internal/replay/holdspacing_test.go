package replay

import (
	"fmt"
	"math"
	"testing"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/config"
)

// A held formation's spacing guarantee, at the only group count it holds at.
//
// THE ANSWER, WHICH TAKES THREE MEASUREMENTS TO GET RIGHT
//
// internal/battle/formation.go derives a man's in-place radius from the balance
// file's own two numbers: half of what his shape's neighbour gap must give up
// before two of his own group's men could stand closer than `min_separation`. For
// a line that is (front_spacing - min_separation) / 2, and the tightest pair the
// derivation predicts inside one group is front_spacing minus twice that, which
// with the shipped 1.50 and 1.20 is exactly 1.20 m.
//
// Measured at 500 a side, that is what one group of five hundred does:
//
//    500 a side in 1 group   1.371 m   +0.171 m against the 1.200 m prediction
//
// So the derivation is right, the walk finishes, and the layer keeps its own
// promise INSIDE one group. What it does not do is any of that across groups, and
// the two columns below are the measurement that says so rather than the group-count
// trend on its own:
//
//                        within one group   across two groups
//     1 group of 500            1.371 m            none exists
//     2 groups of 250           1.313 m            0.444 m
//     4 groups of 125           1.325 m            0.285 m
//
// The intra-group column is healthy at every count: it clears the 1.20 m minimum
// and the 1.20 m the settle-radius derivation predicts, at 1 group and at four. The
// across-group column is the whole of the damage, it is a third of the minimum at
// two groups and a quarter of it at four, and it worsens monotonically as the army
// is split further with its size held constant. That is what two or more groups'
// layouts occupying the same ground looks like. The radius is derived PER GROUP, and
// nothing anywhere derives a separation between one group's anchor and another's, so
// a man of one group ends up standing beside a slot of another. The per-group
// derivation is silent about that, because it is a per-group derivation.
//
// This retires the "unexplained 0.07 m shortfall" that holdscale_test.go carried.
// That number was 1.13 m at 2 groups measured over ticks 20 to 80, and this file
// explains it twice over: the window was not settled (see below) and 2 groups is
// the configuration where the guarantee does not hold. The real answer is not
// 1.13 m and it is not 1.20 m, it is 0.444 m, and it is an inter-group pair.
//
// AND A RETRACTION THAT WAS ALSO WRONG, IN THE OTHER DIRECTION
//
// Between writing the table above and measuring the columns, I read the same three
// numbers as a collapse INSIDE one group, and wrote that into this file's
// assertion and its failure message. It was wrong, and it was wrong mechanically
// rather than by misreading: the tap that partitions pairs by group was never given
// a partition. A read of an absent key in a Go map returns the zero value, which is
// group 0's index, so every pair compared as intra-group and the across column came
// back +Inf at every group count. And +Inf across every group count is exactly the
// shape of result that would "prove" the layouts do not overlap, so the bug
// confirmed the claim it was written to test. It is fixed, and the fix is the
// harness rather than the conclusion:
//
//   - holdBoth returns the partition from the SAME SplitIntoGroups call that built
//     the commander's groups, so the tap classifies by the groups the layer was
//     actually given rather than by a second opinion about them.
//   - The tap refuses to measure with no partition, and records an id it cannot
//     place instead of filing it under group 0.
//   - check() fails if the partition's group count does not match the one the
//     battle was built with, and fails if the across column is +Inf at two or more
//     groups, since no cross-group pair would then ever have been compared.
//   - TestThePartitionTapCanTellTwoGroupsApart runs the identical harness at 48 a
//     side in short mode, so the expensive case is only reached by a tap already
//     known to distinguish two groups.
//
// The lesson is the one I keep learning and keep getting wrong in a new shape: a
// classifier that was never fed its input reports the answer its own failure mode
// predicts. Assert that the classifier ran before believing what it says.
//
//
// WHERE THE MEASUREMENT IS TAKEN, AND WHY IT TOOK THREE ATTEMPTS
//
// A formation lays its slots out around its anchor and then walks every man to his
// slot one tick's worth of hold-speed at a time. For thirty men a side that is done
// in a few dozen ticks. For five hundred it is not: a 500-man line at 16 abreast
// is thirty-two ranks, and a man who deploys sixty metres from his slot needs three
// hundred ticks of standing still before he arrives.
//
// So a measurement taken over ticks 20 to 80 of a 500 v 500 battle is not
// measuring a settled hold. It is measuring men still crossing each other on their
// way to places, and the tightest pair in that state is meaningless — it can be a
// centimetre simply because two men are walking past one another. That was my
// first two attempts, reported as 1.13 m and then 0.010 m for configurations that
// differ only in how many groups they have. Neither was a settled hold.
//
// Measuring after the shape has formed needs the shape time to form, which needs
// the ENEMY to stop arriving. Both sides hold here: the enemy is uncommanded and
// advances at over a metre a tick, so it reaches a held line inside six hundred
// ticks and the window closes before the shape is finished. Holding both sides is
// not realism, it is isolation — the question is what the formation LAYER does, and
// the layer does not know which side it is on.
//
// The window is therefore the last hundred ticks of a nine-hundred-tick hold.
//
// THE TICK BUDGET, WHICH IS WHY THIS USES A SESSION
//
// Holding both sides means the battle never resolves, and `battle.max_ticks` is
// 20000. The first version of this ran `battle.RunCommanded`, which has no tick
// budget, so each of its cases ran 20000 ticks of a 1000-unit field and one case
// had not finished after forty minutes. A Session can be stepped one tick at a
// time: 900 ticks is all the window needs and the run stops there whatever the
// battle would have done. A session also lets both sides hold, because it takes one
// Commander and a Commander is free to be two sides' commanders run in sequence —
// the seam is a channel, not a role.
//
// WHO OWNS THE FIX: internal/battle/formation.go is agent3's. The shape of the fix
// is named by the measurements rather than left open: the inter-group anchor
// separation has to be derived the way the intra-group radius is, from the shapes'
// own widths and the same front_spacing, so that laying groups out side by side
// leaves that gap. This test is the regression for it.

// holdTicks is how long the formation is given to settle before the window opens.
const holdTicks = 900

// TestASettledHeldFormationKeepsItsMenApartAtEveryGroupCount is the guarantee, at
// the three group counts that separate it from itself.
//
// It asserts `min_separation` rather than the derived 1.20 m, and that is the
// whole point. The derived number is what the layer promises INSIDE one group; the
// balance file's `min_separation` is what the engine's own spacing pass enforces
// everywhere, and a held formation that does not clear it has men standing inside
// each other whatever the derivation says.
//
// This test measures the tightest pair WITHOUT saying which kind of pair it was,
// which is the guarantee and not the diagnosis: it cannot tell a healthy layout
// with two groups' ground overlapping from a layout that is wrong inside each
// group, and it must not be read as though it could. TestWhereTheGroupsCollapse
// below makes the same three measurements with the pairs classified by group, and
// that is where the inter-group reading in this file's failure message below comes
// from. The two agree; only the second one is entitled to the explanation.
func TestASettledHeldFormationKeepsItsMenApartAtEveryGroupCount(t *testing.T) {
	if testing.Short() {
		t.Skip("a 500 v 500 hold is not a short-mode test")
	}
	cfg := loadConfig(t)
	const seed = 20260930
	counts := []int{1, 2, 4}

	// Every group count is measured before anything is asserted, because the
	// assertion needs the series to say anything useful: one group coming out
	// right and two coming out wrong is the difference between a broken
	// derivation and a missing one between groups, and an error message that only
	// had its own number would say neither.
	byGroups := map[int]holdSpacing{}
	for _, groups := range counts {
		byGroups[groups] = measureHoldSpacing(t, cfg, seed, 500, groups)
	}

	for _, groups := range counts {
		got := byGroups[groups]
		if got.tightest >= cfg.Formation.MinSeparation {
			continue
		}
		t.Errorf("500 a side in %d group(s), both sides holding and settled for %d ticks: the "+
			"tightest pair of side A's fighting men came to %.3f m, below the %.2f m the balance "+
			"file names as the smallest gap the spacing pass allows.\n"+
			"  One group of the same 500 reaches %.3f m against a predicted %.3f m, so the in-place "+
			"radius derivation is right and the walk finishes. The radius is derived PER GROUP and "+
			"nothing derives a separation between one group's anchor and another's, so two or more "+
			"groups' layouts overlap and a man of one group stands beside a slot of another:\n"+
			"    1 group %.3f m    2 groups %.3f m    4 groups %.3f m\n"+
			"  This is agent3's layer (internal/battle/formation.go). The fix has to derive an "+
			"inter-group anchor separation the way the intra-group radius is derived, from the "+
			"shapes' own widths and the same front_spacing.",
			groups, got.ticks, got.tightest, cfg.Formation.MinSeparation,
			byGroups[1].tightest, predictedTightPair(cfg),
			byGroups[1].tightest, byGroups[2].tightest, byGroups[4].tightest)
	}
}

// TestDiagHarnessMeasuresASettledHold is the same measurement at a size that runs
// in short mode, and it exists so that the 500 v 500 case cannot pass because the
// harness measured nothing.
//
// A tap that never fires reports +Inf, which compares as greater than the minimum,
// so a harness that silently never ran would report a PASS on the real case. This
// asserts the tap fired and got a finite number, cheaply, so the expensive case is
// only reached by a harness already known to work.
func TestDiagHarnessMeasuresASettledHold(t *testing.T) {
	measureHoldSpacing(t, loadConfig(t), 20260930, 48, 2)
}

// TestWhereTheGroupsCollapse is the finding located rather than reported.
//
// The symptom is one number: 0.444 m at two groups, 0.285 m at four. That does not
// say where the men standing 0.444 m apart are, and the two candidate places call
// for different fixes:
//
//   - WITHIN a group. Then the in-place radius or the loose-shape scatter is
//     letting one shape's own men stand too close, and the fix is inside the
//     per-group derivation.
//   - ACROSS groups. Then each group's own men are fine and two groups' layouts are
//     occupying the same ground, and the fix is the inter-group anchor separation
//     this file says is missing.
//
// These are different files and different constants, so the distinction is worth
// one more battle. The answer, with the partition actually applied to the tap, is
// ACROSS: the intra-group column reads 1.371 / 1.313 / 1.325 m at one, two and four
// groups and the across column reads 0.444 m and 0.285 m. The failure message
// carries both columns and names the guilty one, so the next reader does not have
// to take the table above on trust.
//
// `SplitIntoGroups` sorts the ids and hands out contiguous blocks — for 500 ids
// into 2 groups that is 0-249 and 250-499 — so the partition is exact and comes
// from the same call the commander was built from, not from a guess.
func TestWhereTheGroupsCollapse(t *testing.T) {
	if testing.Short() {
		t.Skip("a 500 v 500 hold is not a short-mode test")
	}
	cfg := loadConfig(t)
	const seed = 20260930

	// All three, because the interesting number is not any one of them: it is
	// within-group as the group gets smaller while the army stays at 500.
	counts := []int{1, 2, 4}
	type row struct {
		groups, perGroup int
		within, across   float64
	}
	rows := make([]row, 0, len(counts))
	for _, groups := range counts {
		tap := newPartitionedTap(holdTicks-100, holdTicks)
		if _, err := holdBothSidesPartitioned(cfg, seed, evenForce(t, cfg, seed, 500), groups, tap); err != nil {
			t.Fatalf("500 a side in %d groups: %v", groups, err)
		}
		if tap.measured == 0 {
			t.Fatalf("%d groups: the tap saw no ticks in ticks %d-%d", groups, tap.from, tap.to)
		}
		tap.check(t)
		rows = append(rows, row{groups, 500 / groups, tap.within, tap.across})
		t.Logf("500 a side in %d group(s) of %d: within one group %.3f m, across two groups %.3f m",
			groups, 500/groups, tap.within, tap.across)
	}

	t.Logf("summary, minimum allowed %.2f m, predicted tightest INTRA-group pair %.3f m:",
		cfg.Formation.MinSeparation, predictedTightPair(cfg))
	for _, r := range rows {
		t.Logf("  %d group(s) of %-3d within %.3f m   across %.3f m", r.groups, r.perGroup, r.within, r.across)
	}

	// The assertion is on the WORST pair of the two columns, and it names which
	// column it came from, because that is the whole measurement. An assertion on
	// the intra-group column alone passes on these numbers while two groups' men
	// stand 0.444 m apart, which is the bug.
	for _, r := range rows {
		worst, column := minf(r.within, r.across), doesName(r.within, r.across)
		if worst >= cfg.Formation.MinSeparation {
			continue
		}
		t.Errorf("500 a side split into %d group(s) of %d: the tightest pair of side A's fighting "+
			"men came to %.3f m, and it is an %s-group pair. The balance file names %.2f m as the "+
			"smallest gap the spacing pass allows, and a formation told to hold has men standing "+
			"inside each other at a third of it.\n"+
			"  within-group %.3f m, across-group %.3f m. The intra-group column is healthy at every "+
			"group count and clears both the %.2f m minimum and the %.3f m the settle-radius "+
			"derivation predicts, so the per-group layout is right. The across-group column is the "+
			"whole of the damage and it worsens monotonically with group count:\n"+
			"    1 group of 500    within %.3f m    across %s (no cross-group pair exists at one group)\n"+
			"    2 groups of 250   within %.3f m    across %.3f m\n"+
			"    4 groups of 125   within %.3f m    across %.3f m\n"+
			"  Monotonic in group count with the army held at 500, which is what two or more "+
			"groups' layouts occupying the same ground looks like. The in-place radius is derived "+
			"PER GROUP and nothing derives a separation between one group's anchor and another's, "+
			"so a man of one group ends up standing beside a slot of another.\n"+
			"  This is agent3's layer (internal/battle/formation.go). The fix has to derive an "+
			"inter-group anchor separation the way the intra-group radius is derived, from the "+
			"shapes' own widths and the same front_spacing, so that laying groups out side by side "+
			"leaves that gap. This test is the regression for it.",
			r.groups, r.perGroup, worst, column, cfg.Formation.MinSeparation,
			r.within, r.across, cfg.Formation.MinSeparation, predictedTightPair(cfg),
			rows[0].within, infOr(rows[0].across), rows[1].within, rows[1].across,
			rows[2].within, rows[2].across)
	}
}

// TestThePartitionTapCanTellTwoGroupsApart is the tap proved live at a size that
// runs in short mode, for the same reason TestDiagHarnessMeasuresASettledHold is.
//
// Without it the 500 v 500 case above could report a clean result from a partition
// that was never applied, and the clean result would be +Inf across every group
// count. This asserts the partition reached the tap, that it is the one the
// commander was built from, and that both columns were actually compared.
func TestThePartitionTapCanTellTwoGroupsApart(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 20260930
	for _, groups := range []int{2, 3} {
		tap := newPartitionedTap(holdTicks-100, holdTicks)
		if _, err := holdBothSidesPartitioned(cfg, seed, evenForce(t, cfg, seed, 48), groups, tap); err != nil {
			t.Fatalf("48 a side in %d groups: %v", groups, err)
		}
		if tap.measured == 0 {
			t.Fatalf("%d groups: the tap saw no ticks in ticks %d-%d", groups, tap.from, tap.to)
		}
		tap.check(t)
		total := 0
		for _, n := range tap.seen {
			total += n
		}
		t.Logf("48 a side in %d group(s): partition %v, %d men placed, within %.3f m, across %.3f m",
			groups, tap.seen, total, tap.within, tap.across)
	}
}

func newPartitionedTap(from, to int) *partitionedTap {
	return &partitionedTap{from: from, to: to, seen: map[int]int{}}
}

// minf is math.Min over the two columns, treating +Inf as "no pair".
func minf(a, b float64) float64 {
	if math.IsInf(a, 1) {
		return b
	}
	if math.IsInf(b, 1) {
		return a
	}
	return math.Min(a, b)
}

// doesName names which column the tightest pair came from, for a message.
func doesName(within, across float64) string {
	switch {
	case math.IsInf(across, 1):
		return "intra"
	case math.IsInf(within, 1) || within < across:
		return "intra"
	default:
		return "inter"
	}
}

// infOr says what to print for a column that may legitimately be empty.
func infOr(v float64) string {
	if math.IsInf(v, 1) {
		return "none"
	}
	return fmt.Sprintf("%.3f m", v)
}

// partitionedTap measures the tightest pair of side A's fighting men twice over:
// once counting only pairs from the same formation group, once only pairs from
// different ones.
//
// The distinction is only worth anything if the partition is real, and a map read
// of an absent key returns zero, which is also the index of the first group. So an
// id the tap cannot place would be filed into group 0 and every pair would count
// as intra-group: the across-group column would come back +Inf at every group
// count, which is precisely the shape of the result that would "prove" the
// layouts do not overlap. A silent, self-confirming wrong answer. Hence
// unknownID, which is checked, and seen, which has to reach the group count asked
// for.
type partitionedTap struct {
	from, to   int
	measured   int
	within     float64
	across     float64
	groupOf    map[int]int
	seen       map[int]int
	wantGroups int
	unknownID  int
	brokenSeen int
}

func (p *partitionedTap) measure(v *battle.View) error {
	if v.Tick < p.from || v.Tick > p.to {
		return nil
	}
	if p.groupOf == nil {
		return fmt.Errorf("tick %d: the tap was never given a partition, so every pair would "+
			"count as intra-group and the across column would read +Inf for the wrong reason", v.Tick)
	}
	p.measured++
	_, broken := brokenIn(v.Units)
	if broken > p.brokenSeen {
		p.brokenSeen = broken
	}
	if p.within == 0 {
		p.within, p.across = math.Inf(1), math.Inf(1)
	}
	for i := range v.Units {
		if v.Units[i].Side != battle.SideA || !acting(v.Units[i]) {
			continue
		}
		gi, ok := p.groupOf[v.Units[i].ID]
		if !ok {
			p.unknownID = v.Units[i].ID
			continue
		}
		p.seen[gi]++
		for j := i + 1; j < len(v.Units); j++ {
			if v.Units[j].Side != battle.SideA || !acting(v.Units[j]) {
				continue
			}
			gj, ok := p.groupOf[v.Units[j].ID]
			if !ok {
				p.unknownID = v.Units[j].ID
				continue
			}
			d := math.Hypot(v.Units[i].X-v.Units[j].X, v.Units[i].Y-v.Units[j].Y)
			if gi == gj {
				if d < p.within {
					p.within = d
				}
			} else if d < p.across {
				p.across = d
			}
		}
	}
	return nil
}

// check is everything the tap cannot report through a number.
func (p *partitionedTap) check(t *testing.T) {
	t.Helper()
	if p.unknownID != 0 || len(p.seen) == 0 {
		// id 0 is a legal id, so this is only a fallback; seen is the real check.
		t.Fatalf("the tap could not place unit %d in any group, and only %d group(s) were "+
			"ever seen. Pairs from the men it could not place would be silently counted "+
			"against group 0.", p.unknownID, len(p.seen))
	}
	if len(p.seen) != p.wantGroups {
		t.Fatalf("the battle was built in %d group(s) and the tap only ever saw %d of them "+
			"(%v). A partition that does not match the one the commander was built from "+
			"classifies pairs by the wrong group.", p.wantGroups, len(p.seen), p.seen)
	}
	if !math.IsInf(p.across, 1) {
		return
	}
	if p.wantGroups < 2 {
		return // no cross-group pair exists at one group; +Inf is the truth here
	}
	t.Fatalf("%d groups and the across-group column is still +Inf: no pair of men from two "+
		"different groups was ever compared, so the column says nothing", p.wantGroups)
}

// holdSpacing is one measurement.
type holdSpacing struct {
	tightest float64
	ticks    int
}

// measureHoldSpacing is the body every size runs, so the cheap case is the same
// code and not a simplified copy of it.
func measureHoldSpacing(t *testing.T, cfg *config.Config, seed uint64, n, groups int) holdSpacing {
	t.Helper()
	predicted := predictedTightPair(cfg)
	tap := &separationTap{from: holdTicks - 100, to: holdTicks, tightest: math.Inf(1)}
	ticks, err := holdBothSidesFor(cfg, seed, evenForce(t, cfg, seed, n), groups, tap)
	if err != nil {
		t.Fatalf("%d a side in %d group(s): %v", n, groups, err)
	}
	if tap.measured == 0 {
		t.Fatalf("%d a side in %d group(s): the tap saw no ticks in ticks %d-%d; the number would "+
			"be an infinity and would pass without having looked at anything",
			n, groups, tap.from, tap.to)
	}
	verdict := "matches the prediction"
	if tap.tightest < predicted {
		verdict = "SHORT of the prediction"
	}
	t.Logf("%d a side in %d group(s), both sides holding, stepped %d ticks, measured over ticks "+
		"%d-%d (%d ticks measured, %d broken men excluded): tightest pair %.3f m, %+.3f m against "+
		"the predicted %.3f m (front_spacing %.2f, min_separation %.2f, in-place radius %.3f) — %s",
		n, groups, ticks, tap.from, tap.to, tap.measured, tap.brokenSeen,
		tap.tightest, tap.tightest-predicted, predicted, cfg.Formation.FrontSpacing,
		cfg.Formation.MinSeparation, settleRadiusFor(cfg), verdict)
	return holdSpacing{tightest: tap.tightest, ticks: ticks}
}

// predictedTightPair is the tightest intra-group gap the layer's own derivation
// predicts, restated from two balance-file numbers and one subtraction.
func predictedTightPair(cfg *config.Config) float64 {
	return cfg.Formation.FrontSpacing - 2*settleRadiusFor(cfg)
}

// bothSidesHold is two real FormationCommanders, one a side, both on hold, with a
// measurement tap on top.
type bothSidesHold struct {
	a, b battle.Commander
	tap  *separationTap
}

func (h *bothSidesHold) Command(v *battle.View) error {
	if err := h.a.Command(v); err != nil {
		return err
	}
	if err := h.b.Command(v); err != nil {
		return err
	}
	return h.tap.measure(v)
}

// holdBothSidesPartitioned is holdBothSidesFor with the group partition handed to
// the tap, taken from the same SplitIntoGroups call the commander is built from.
//
// Side A needs no id offset: Deploy puts side A on the field first and ids are
// dense and ascending, so side A's field ids are its pre-deploy ids. That is the
// same fact holdBoth relies on when it offsets side B by len(A).
func holdBothSidesPartitioned(cfg *config.Config, seed uint64, setup battle.Setup, groups int, tap *partitionedTap) (int, error) {
	s, err := battle.NewSession(cfg, "diag-partition", battle.PartyRef{ID: "a", Name: "A"},
		battle.PartyRef{ID: "b", Name: "B"}, 0, seed)
	if err != nil {
		return 0, err
	}
	a, b, groupOf, err := holdBoth(cfg, setup, groups)
	if err != nil {
		return 0, err
	}
	// Handed over from the SAME SplitIntoGroups call that built the commander's
	// groups. Reading the partition off a second, independently computed split
	// would be a guess about a layout the tap has no other way to see, and a
	// guess that disagrees would classify pairs by the wrong group and report a
	// clean inter-group gap for a collapse that is inside one group.
	if tap.groupOf != nil {
		return 0, fmt.Errorf("the tap already has a partition of %d groups; refusing to replace it "+
			"with the %d this battle was built from", len(tap.groupOf), groups)
	}
	tap.groupOf = groupOf
	tap.wantGroups = groups
	if err := s.Deploy(setup.A, setup.B, setup.Leaders); err != nil {
		return 0, err
	}
	if err := s.BeginFighting(); err != nil {
		return 0, err
	}
	if err := s.Command(&groupedHold{a: a, b: b, tap: tap}); err != nil {
		return 0, err
	}
	return stepFor(tap.from+100, s)
}

// groupedHold is the two sides' commanders with the partitioned tap under them.
type groupedHold struct {
	a, b battle.Commander
	tap  *partitionedTap
}

func (h *groupedHold) Command(v *battle.View) error {
	if err := h.a.Command(v); err != nil {
		return err
	}
	if err := h.b.Command(v); err != nil {
		return err
	}
	return h.tap.measure(v)
}

// holdBothSidesFor fights one battle with both sides told to hold position, steps
// it exactly holdTicks times, and reports how many ticks it got.
//
// Stepped rather than run to a conclusion because holding both sides means there
// is no conclusion to run to; see the note above about max_ticks.
func holdBothSidesFor(cfg *config.Config, seed uint64, setup battle.Setup, groups int, tap *separationTap) (int, error) {
	s, err := battle.NewSession(cfg, "diag-hold", battle.PartyRef{ID: "a", Name: "A"},
		battle.PartyRef{ID: "b", Name: "B"}, 0, seed)
	if err != nil {
		return 0, err
	}
	a, b, _, err := holdBoth(cfg, setup, groups)
	if err != nil {
		return 0, err
	}
	if err := s.Deploy(setup.A, setup.B, setup.Leaders); err != nil {
		return 0, err
	}
	if err := s.BeginFighting(); err != nil {
		return 0, err
	}
	if err := s.Command(&bothSidesHold{a: a, b: b, tap: tap}); err != nil {
		return 0, err
	}
	return stepFor(holdTicks, s)
}

// stepFor advances a session one tick at a time for n ticks, stopping early if the
// battle decides itself.
func stepFor(n int, s *battle.Session) (int, error) {
	for i := 0; i < n; i++ {
		if err := s.Step(); err != nil {
			return i, err
		}
		if s.Phase() != battle.PhaseFighting && s.Phase() != battle.PhaseRout {
			return i, nil
		}
	}
	return n, nil
}

// holdBoth builds a real FormationCommander per side, each holding, split into the
// requested number of groups.
//
// The third return is side A's partition: field unit id to group index, taken from
// the same SplitIntoGroups call that built the commander's groups. It is returned
// rather than recomputed so that a caller measuring by group classifies pairs by
// the groups the layer was actually given, not by a second opinion about them.
func holdBoth(cfg *config.Config, setup battle.Setup, groups int) (battle.Commander, battle.Commander, map[int]int, error) {
	// A session battle numbers the two sides into ONE dense id space, so side B's
	// units are renumbered on deployment: a pre-deploy roster gives B the ids
	// 0..n-1 and the field has it at n..2n-1. A commander built from the
	// pre-deploy ids therefore tries to order side A's men, which the formation
	// layer refuses by name — correctly, and with a message that names the real
	// mistake. The offset is len(A) because A is deployed first and the field is
	// dense and ascending by id.
	groupOf := map[int]int{}
	one := func(units []battle.Unit, side battle.Side, offset int) (battle.Commander, error) {
		ids := make([]int, 0, len(units))
		for _, u := range units {
			ids = append(ids, u.ID+offset)
		}
		split := battle.SplitIntoGroups(ids, groups)
		g := make([]battle.Group, len(split))
		for i, s := range split {
			g[i] = battle.Group{
				Order: battle.GroupOrder{Kind: battle.FormationLine, Order: battle.OrderFormationHold},
				Units: s,
			}
			if side == battle.SideA {
				for _, id := range s {
					groupOf[id] = i
				}
			}
		}
		orders, err := battle.NewOrders(cfg, side, g)
		if err != nil {
			return nil, err
		}
		return orders.Commander()
	}
	ca, err := one(setup.A, battle.SideA, 0)
	if err != nil {
		return nil, nil, nil, err
	}
	cb, err := one(setup.B, battle.SideB, len(setup.A))
	if err != nil {
		return nil, nil, nil, err
	}
	return ca, cb, groupOf, nil
}
