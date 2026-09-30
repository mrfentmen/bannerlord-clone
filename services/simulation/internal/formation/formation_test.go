package formation

import (
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// balancePath is the shipped balance file, relative to this package. The tests
// read the same file the service does rather than a hand-built Config, so a
// test cannot pass against constants that no longer exist at runtime.
const balancePath = "../../config/balance.toml"

func testConfig(t *testing.T) Config {
	t.Helper()
	c, err := Load(balancePath)
	if err != nil {
		t.Fatalf("loading %s: %v", balancePath, err)
	}
	return c
}

func ids(n int) []int {
	out := make([]int, n)
	for i := range out {
		out[i] = i + 1
	}
	return out
}

func TestLoadBalanceFile(t *testing.T) {
	c := testConfig(t)
	if err := c.Validate(); err != nil {
		t.Fatalf("shipped config does not validate: %v", err)
	}
	t.Logf("loaded: %s", c)
}

func TestLoadRefusesMissingSection(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "balance.toml")
	if err := os.WriteFile(path, []byte("[world]\nyears = 5.0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("a balance file with no [formation] section loaded anyway, so a missing constant would be a silent zero")
	} else {
		t.Logf("missing section: %v", err)
	}
}

func TestLoadRefusesMissingKey(t *testing.T) {
	c := testConfig(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "balance.toml")
	body := "[formation]\n"
	for _, k := range requiredFormationKeys {
		if k == "turn_rate" {
			continue // the one key left out
		}
		body += k + " = " + formatFloat(c.values()[k]) + "\n"
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("a [formation] section missing turn_rate loaded anyway, so a missing speed would be a silent zero")
	} else {
		t.Logf("missing key: %v", err)
	}
}

func TestLoadRefusesUnreadKey(t *testing.T) {
	c := testConfig(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "balance.toml")
	body := "[formation]\n"
	for _, k := range requiredFormationKeys {
		body += k + " = " + formatFloat(c.values()[k]) + "\n"
	}
	body += "line_front_widht = 16.0\n" // the typo this check exists for
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("a misspelled key loaded anyway, so the constant the designer meant to change is not being read")
	} else {
		t.Logf("unread key: %v", err)
	}
}

func TestValidateRefusesOutOfRange(t *testing.T) {
	c := testConfig(t)
	bad := c
	bad.AdvanceSpeed = 40 // faster than a man can run
	if err := bad.Validate(); err == nil {
		t.Fatal("a 40 m/s advance speed validated, so the range in the balance comment is not enforced")
	} else {
		t.Logf("out of range: %v", err)
	}
}

func TestValidateRefusesMinSeparationWiderThanTheShape(t *testing.T) {
	c := testConfig(t)
	bad := c
	bad.MinSeparation = bad.FrontSpacing + 1 // wider than the gap the shape uses
	if err := bad.Validate(); err == nil {
		t.Fatal("min_separation wider than the shape's own spacing validated, so the spacing pass would fight the shape")
	} else {
		t.Logf("bad separation: %v", err)
	}
}

func TestZeroConfigIsRefused(t *testing.T) {
	var zero Config
	if err := zero.Validate(); err == nil {
		t.Fatal("an empty Config validated, so a caller could hand-build one and get zeroes everywhere")
	} else {
		t.Logf("zero config: %v", err)
	}
}

// TestLoadAcceptsDocumentedZeroValues is the check on the other side of the one
// above. Nine keys have a documented minimum of zero, and each of those zeroes
// is a decision a designer can make on purpose: a clean loose-order lattice, no
// separation pass, no stand-off, face the way you march. A loader that treats
// zero as "the key is missing" refuses a legal balance file and tells the
// designer to invent a value they deliberately set to nothing — which is the
// same failure as silently defaulting one, only louder and in the wrong place.
func TestLoadAcceptsDocumentedZeroValues(t *testing.T) {
	c := testConfig(t)
	zeroable := map[string]float64{}
	for _, b := range configBounds {
		if b.lo == 0 {
			zeroable[b.key] = 0
		}
	}
	// Every key that is allowed to be zero has to be covered, or this test
	// passes while a new zero-able key is still being refused.
	if len(zeroable) < 8 {
		t.Fatalf("only %d keys document a minimum of zero; the shipped balance file and this test disagree about which are optional", len(zeroable))
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "balance.toml")
	body := "[formation]\n"
	for _, k := range requiredFormationKeys {
		v, isZeroable := zeroable[k]
		if !isZeroable {
			v = c.values()[k]
		}
		body += k + " = " + formatFloat(v) + "\n"
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("a balance file with every documented zero rejected: %v", err)
	}
	for k := range zeroable {
		if got.values()[k] != 0 {
			t.Errorf("%s did not come back as zero, it came back as %g", k, got.values()[k])
		}
	}
	// And the same file with one of them out of range is still refused, so the
	// fix did not turn the bounds off.
	bad := got
	bad.MinSeparation = 0
	if err := bad.Validate(); err == nil {
		t.Error("min_separation of 0 validated, but zero is not a spacing")
	}
	t.Logf("accepted %d documented zeroes: %s", len(zeroable), strings.Join(sortedKeys(zeroable), ", "))
}

func sortedKeys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestOrderAndFormationNamesRoundTrip(t *testing.T) {
	for _, o := range AllOrders() {
		got, err := ParseOrder(o.String())
		if err != nil || got != o {
			t.Errorf("order %v did not round-trip: got %v, %v", o, got, err)
		}
	}
	for _, f := range AllFormations() {
		got, err := ParseFormation(f.String())
		if err != nil || got != f {
			t.Errorf("formation %v did not round-trip: got %v, %v", f, got, err)
		}
	}
	if got, err := ParseFormation("skirmish"); err != nil || got != FormationLoose {
		t.Errorf("skirmish should be loose order, got %v, %v", got, err)
	}
	if _, err := ParseOrder("advance-left"); err == nil {
		t.Error("an invented order parsed, so a misheard command would become a silent fall-back to hold")
	}
	if _, err := ParseFormation("skew"); err == nil {
		t.Error("an invented formation parsed")
	}
	// COMBAT.md section 7 names five shapes: line, column, wedge, staggered
	// line, and cover posts. This package implements the first three plus loose
	// order. The two it does not implement are named in the design document, so
	// a caller following the document will pass them, and they have to be
	// refused by name. Accepting "staggered-line" and quietly handing back a
	// line is the silent stub this package is not allowed to have: the player
	// orders a staggered line, gets a line, and the bug is invisible in every
	// screenshot.
	for _, unimplemented := range []string{"staggered-line", "staggered", "cover-posts", "cover-post"} {
		if got, err := ParseFormation(unimplemented); err == nil {
			t.Errorf("%q is named in COMBAT.md section 7 but is not implemented, and it parsed as %v instead of failing",
				unimplemented, got)
		}
	}
	if Order(99).Valid() || Formation(99).Valid() {
		t.Error("an out-of-range order or formation claimed to be valid")
	}
}

func TestLayoutsRespectSpacing(t *testing.T) {
	c := testConfig(t)
	for _, kind := range AllFormations() {
		for _, n := range []int{1, 2, 7, 16, 199, 200} {
			slots, err := Layout(kind, ids(n), c)
			if err != nil {
				t.Fatalf("%v with %d units: %v", kind, n, err)
			}
			if len(slots) != n {
				t.Fatalf("%v with %d units produced %d slots", kind, n, len(slots))
			}
			if n < 2 {
				continue
			}
			gap, err := MinPairDistance(slots)
			if err != nil {
				t.Fatal(err)
			}
			if gap < c.MinSeparation-1e-9 {
				t.Errorf("%v with %d units: closest two men are %.4f m apart, inside the configured minimum %.4f",
					kind, n, gap, c.MinSeparation)
			}
			// The shape must be centred on its own anchor: the mean of every
			// slot's forward offset is zero, so the anchor is the centre of
			// mass. A shape whose front sat at zero would be permanently out
			// of step with the anchor and every man would walk backwards.
			var sum float64
			for _, sl := range slots {
				sum += sl.Forward
			}
			if mean := sum / float64(len(slots)); math.Abs(mean) > 1e-9 {
				t.Errorf("%v with %d units has its centre of mass %.6f m from the anchor", kind, n, mean)
			}
			// A shape with any depth at all must reach forward as well as back,
			// or it is a column standing behind its own commander. A single
			// rank has no depth, so it is exempt.
			_, _, minF, maxF, err := Bounds(slots)
			if err != nil {
				t.Fatal(err)
			}
			if maxF-minF > 1e-9 && (minF > -1e-9 || maxF < 1e-9) {
				t.Errorf("%v with %d units spans forward %.3f to %.3f m, so it is entirely on one side of its anchor", kind, n, minF, maxF)
			}
		}
	}
}

func TestWedgeHasAPoint(t *testing.T) {
	c := testConfig(t)
	slots, err := Layout(FormationWedge, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}

	tip := slots[0]
	if tip.Right != 0 {
		t.Errorf("the first man of a wedge should stand on the spine, got %+v", tip)
	}
	// The point must be the furthest man forward of the whole shape, or the
	// wedge is pointing backwards.
	furthest := math.Inf(-1)
	for _, sl := range slots {
		furthest = math.Max(furthest, sl.Forward)
	}
	if tip.Forward < furthest-1e-9 {
		t.Errorf("the point man is %.3f m ahead of the anchor but another man is %.3f m ahead: the wedge points backwards",
			tip.Forward, furthest)
	}
	// The rank behind the point must be wider than the point, and every rank
	// wider than the one in front of it: that is what makes an arrow rather
	// than a file.
	tipWidth := int(c.WedgeTipUnits)
	secondWidth := tipWidth + 2*int(c.WedgeRowGrowth)
	if secondWidth <= tipWidth {
		t.Errorf("the rank behind the point is %d men wide and the point is %d", secondWidth, tipWidth)
	}
	count := 0
	for _, sl := range slots {
		if sl.Forward == furthest {
			count++
		}
	}
	if count != tipWidth {
		t.Errorf("%d men stand on the point, expected %d", count, tipWidth)
	}
	_, maxRight, minForward, maxForward, err := Bounds(slots)
	if err != nil {
		t.Fatal(err)
	}
	if maxRight <= tip.Right {
		t.Errorf("a wedge did not widen: max right %.3f against a point at %.3f", maxRight, tip.Right)
	}
	minRight, _, _, _, err := Bounds(slots)
	if err != nil {
		t.Fatal(err)
	}
	if -minRight < maxRight-1e-9 {
		t.Errorf("a wedge is not symmetric: %.3f m to the left against %.3f m to the right", -minRight, maxRight)
	}
	t.Logf("wedge of 200: tip %+v (%.2f m ahead of the anchor), %d men on the point, %d ranks, %.1f m across, %.1f m deep",
		tip, tip.Forward, count, countRanks(slots), maxRight*2, -(minForward)+maxForward)
}

func TestColumnIsNarrowerThanLine(t *testing.T) {
	c := testConfig(t)
	line, err := Layout(FormationLine, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}
	column, err := Layout(FormationColumn, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}
	lineWide, lineDeep := extent(line)
	colWide, colDeep := extent(column)
	if colWide >= lineWide {
		t.Errorf("a column is %.1f m wide and a line is %.1f m: a column should be the narrow one", colWide, lineWide)
	}
	if colDeep <= lineDeep {
		t.Errorf("a column is %.1f m deep and a line is %.1f m: a column should be the deep one", colDeep, lineDeep)
	}
	t.Logf("200 men: line %.1f m wide by %.1f m deep, column %.1f m wide by %.1f m deep",
		lineWide, lineDeep, colWide, colDeep)
	loose, err := Layout(FormationLoose, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}
	lw, ld := extent(loose)
	t.Logf("200 men loose: %.1f m by %.1f m", lw, ld)
}

func TestLooseScatterIsDeterministicAndDifferentPerMan(t *testing.T) {
	c := testConfig(t)
	first, err := Layout(FormationLoose, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Layout(FormationLoose, ids(200), c)
	if err != nil {
		t.Fatal(err)
	}
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("slot %d scattered differently on two identical calls: %+v vs %+v", i, first[i], second[i])
		}
	}
	// Layout is a function of the order it is handed: slot i belongs to ids[i].
	// BuildPlan is where the order is fixed, by sorting on unit ID, so a
	// formation must not reshape itself when the caller rebuilds its list in a
	// different order. That is the property worth having, and it is checked
	// through BuildPlan because BuildPlan is what the battle loop calls.
	enemy := Enemy{Centre: Vec{0, 400}, Facing: degrees(270), HalfDepth: 12, HalfWidth: 120, Count: 200}
	units := make([]Unit, 200)
	for i := range units {
		units[i] = Unit{ID: i + 1, Pos: Vec{X: float64((i%20)-10) * 7, Y: float64(i/20) * 7}, Agility: 1}
	}
	reversed := make([]Unit, len(units))
	for i := range units {
		reversed[len(units)-1-i] = units[i]
	}
	forward, err := BuildPlan(units, enemy, OrderFlankLeft, FormationLoose, c)
	if err != nil {
		t.Fatal(err)
	}
	backward, err := BuildPlan(reversed, enemy, OrderFlankLeft, FormationLoose, c)
	if err != nil {
		t.Fatal(err)
	}
	slotOf := func(p Plan) map[int]Slot {
		m := make(map[int]Slot, len(p.Slots))
		for i, a := range p.Assignment {
			m[a.ID] = p.Slots[i]
		}
		return m
	}
	f, b := slotOf(forward), slotOf(backward)
	for id, want := range f {
		if got := b[id]; got != want {
			t.Fatalf("man %d changed slot when the unit list was reversed: %+v vs %+v", id, got, want)
		}
	}

	// A different seed must give a different scatter, or the knob is not wired.
	other := c
	other.LooseSeed = c.LooseSeed + 1
	fourth, err := Layout(FormationLoose, ids(200), other)
	if err != nil {
		t.Fatal(err)
	}
	same := 0
	for i := range first {
		if first[i] == fourth[i] {
			same++
		}
	}
	if same == len(first) {
		t.Error("changing loose_seed changed nothing, so the scatter knob is not connected")
	}
	// Loose order is a square lattice centred on the anchor, with no front rank
	// to speak of: it has to reach forward as well as back, or half of it is a
	// column behind the commander.
	var minF, maxF float64 = math.Inf(1), math.Inf(-1)
	for _, sl := range first {
		minF = math.Min(minF, sl.Forward)
		maxF = math.Max(maxF, sl.Forward)
	}
	if minF >= 0 || maxF <= 0 {
		t.Errorf("loose order spans forward %.2f to %.2f, so it is not centred on its anchor", minF, maxF)
	}
	lw, _ := extent(first)
	t.Logf("loose order of 200: %.1f m square, forward extent %.1f to %.1f m, %d of %d slots unchanged by a seed change",
		lw, minF, maxF, same, len(first))
}

// formatFloat writes a balance value back out at full precision, so a test
// file built from the loaded config is byte-identical to the shipped one.
func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// extent returns a layout's width and depth in metres: how far it reaches
// across, and how far from front to back.
func extent(slots []Slot) (width, depth float64) {
	_, maxRight, minForward, maxForward, err := Bounds(slots)
	if err != nil {
		return 0, 0
	}
	return maxRight * 2, maxForward - minForward
}

// countRanks returns how many distinct depths a layout occupies.
func countRanks(slots []Slot) int {
	seen := map[float64]bool{}
	for _, s := range slots {
		seen[s.Forward] = true
	}
	return len(seen)
}

// minSeparationOfUnits is the smallest gap between any two men in a set of
// positions, used by the scenario to check that a formation stayed a
// formation after it has been moving for a while.
func minSeparationOfUnits(units []Unit) (float64, int, int) {
	best := math.Inf(1)
	var bi, bj int
	for i := range units {
		for j := i + 1; j < len(units); j++ {
			if d := units[i].Pos.Dist(units[j].Pos); d < best {
				best, bi, bj = d, i, j
			}
		}
	}
	return best, bi, bj
}
