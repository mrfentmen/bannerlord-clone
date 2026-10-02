package replay

import (
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
// So the derivation is right, and the walk finishes, and the layer keeps its own
// promise. What it does not do is any of that across groups:
//
//    500 a side in 2 groups  0.444 m   -0.756 m
//    500 a side in 4 groups  0.285 m   -0.915 m
//
// Monotonic with group count, and 0.444 m is a third of the 1.20 m the spacing
// pass is supposed to enforce everywhere. The radius is derived PER GROUP, and
// nothing anywhere derives a separation between one group's anchor and another
// group's, so as groups multiply their layouts overlap and a man of one group ends
// up standing next to a slot of another. The per-group derivation is silent about
// that, because it is a per-group derivation.
//
// This retires the "unexplained 0.07 m shortfall" that holdscale_test.go carried.
// That number was 1.13 m at 2 groups measured over ticks 20 to 80, and this file
// explains it twice over: the window was not settled (see below) and 2 groups is
// the configuration where the guarantee does not hold. The real answer is not
// 1.13 m and it is not 1.20 m, it is 0.444 m.
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
	a, b, err := holdBoth(cfg, setup, groups)
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
	for i := 0; i < holdTicks; i++ {
		if err := s.Step(); err != nil {
			return i, err
		}
		if s.Phase() != battle.PhaseFighting && s.Phase() != battle.PhaseRout {
			return i, nil
		}
	}
	return holdTicks, nil
}

// holdBoth builds a real FormationCommander per side, each holding, split into the
// requested number of groups.
func holdBoth(cfg *config.Config, setup battle.Setup, groups int) (battle.Commander, battle.Commander, error) {
	// A session battle numbers the two sides into ONE dense id space, so side B's
	// units are renumbered on deployment: a pre-deploy roster gives B the ids
	// 0..n-1 and the field has it at n..2n-1. A commander built from the
	// pre-deploy ids therefore tries to order side A's men, which the formation
	// layer refuses by name — correctly, and with a message that names the real
	// mistake. The offset is len(A) because A is deployed first and the field is
	// dense and ascending by id.
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
		}
		orders, err := battle.NewOrders(cfg, side, g)
		if err != nil {
			return nil, err
		}
		return orders.Commander()
	}
	ca, err := one(setup.A, battle.SideA, 0)
	if err != nil {
		return nil, nil, err
	}
	cb, err := one(setup.B, battle.SideB, len(setup.A))
	if err != nil {
		return nil, nil, err
	}
	return ca, cb, nil
}
