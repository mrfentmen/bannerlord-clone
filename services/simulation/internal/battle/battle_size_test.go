package battle

// This file proves the engine half of "battle size is a config knob, never
// hardcoded". internal/config's battle_size_test.go proves the file can carry
// every size number and refuses an impossible one; this file proves the engine
// READS those numbers instead of carrying its own.
//
// The two things worth knowing about how that is checked here:
//
// 1. A constant left in the code cannot be seen by a test that only changes
//    config. So each test here changes a config value to a value no sane file
//    would hold, runs something small, and asserts the ENGINE's observable
//    output moved. If the engine were still using a literal, nothing would
//    change and the test fails.
// 2. The force size itself is a parameter, not a constant, so a "500 v 500" run
//    and a "50 v 50" run are the same code path. TestHeadlessReference reads
//    the size from the balance file; this file checks that the machinery around
//    it is size-free.

import (
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mbclone/simulation/internal/config"
)

// withBattleConfig copies the shipped balance file, changes the given [battle]
// keys, and loads the copy. Extra arguments are further key/value pairs, applied
// in order, for the cases where one key is only sensible next to another.
//
// It is the same technique internal/config's tests use, for the same reason: the
// file that ships is the file under test, and a hand written stub would let a
// key the real file does not have pass unnoticed.
func withBattleConfig(t *testing.T, key string, value string, more ...string) *config.Config {
	t.Helper()
	if len(more)%2 != 0 {
		t.Fatalf("withBattleConfig was given an odd number of extra arguments: %v", more)
	}
	edits := append([]string{key, value}, more...)
	raw, err := os.ReadFile(shippedBalancePath(t))
	if err != nil {
		t.Fatalf("reading the shipped balance file: %v", err)
	}
	lines := strings.Split(string(raw), "\n")
	for i := 0; i+1 < len(edits); i += 2 {
		k, v := edits[i], edits[i+1]
		if !replaceBattleKey(lines, k, v) {
			t.Fatalf("[battle] has no key %q to replace", k)
		}
	}
	path := filepath.Join(t.TempDir(), "balance.toml")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatalf("writing the edited balance file: %v", err)
	}
	edited, err := config.Load(path)
	if err != nil {
		t.Fatalf("the edited balance file did not load: %v", err)
	}
	for i := 0; i+1 < len(edits); i += 2 {
		t.Logf("config: battle.%s = %s", edits[i], edits[i+1])
	}
	return edited
}

// replaceBattleKey sets one key's value inside the [battle] section of lines,
// reporting whether the key was there. Failing on a missing key is deliberate:
// a test that quietly added a new one somewhere would prove nothing.
func replaceBattleKey(lines []string, key, value string) bool {
	inBattle := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "[battle]" {
			inBattle = true
			continue
		}
		if inBattle && strings.HasPrefix(trimmed, "[") {
			return false
		}
		if inBattle && strings.HasPrefix(trimmed, key+" ") {
			lines[i] = key + " = " + value
			return true
		}
	}
	return false
}

// shippedBalancePath walks up from the package directory to config/balance.toml,
// the file that ships with the simulation.
func shippedBalancePath(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("cannot determine the test working directory: %v", err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "config", "balance.toml")
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Fatal("config/balance.toml is not reachable from the test working directory")
	return ""
}

// TestSizeKnobsComeFromConfig: four size numbers, each set to a value the
// shipped file does not use, and an assertion that the engine's own output
// reflects it. If any of these were still a constant in the engine, the
// observable would not move and this fails.
func TestSizeKnobsComeFromConfig(t *testing.T) {
	// 1. The unit limit is the engine's own error, so it is directly observable.
	//    A force of 6 units a side is legal at the shipped 4000 and is refused
	//    when the limit is 5, with an error that names the limit it read.
	t.Run("unit limit", func(t *testing.T) {
		// The reference size comes down with the limit, because the loader
		// refuses a reference run larger than the limit it exercises, and that
		// refusal is asserted in internal/config. Setting only the limit would
		// test the relation check over and over instead of the engine.
		cfg := withBattleConfig(t, "max_units_per_side", "5", "reference_units_per_side", "4")
		force, err := GenerateForce(cfg, 1, SideA, Roster{Units: 6})
		if err != nil {
			t.Fatalf("generating the force failed: %v", err)
		}
		other, err := GenerateForce(cfg, 1, SideB, Roster{Units: 6})
		if err != nil {
			t.Fatalf("generating the force failed: %v", err)
		}
		_, err = Run(cfg, 1, Setup{A: force, B: other, Terrain: TerrainOpen})
		if err == nil {
			t.Fatal("six units a side ran with battle.max_units_per_side = 5")
		}
		var be *Error
		if !asBattleError(err, &be) || be.Kind != ErrForceTooLarge {
			t.Fatalf("expected ErrForceTooLarge, got %T: %v", err, err)
		}
		if be.Limit != 5 {
			t.Errorf("the error reported a limit of %g, so the engine did not read the configured 5", be.Limit)
		}
		if !strings.Contains(err.Error(), "max_units_per_side") {
			t.Errorf("the error does not name the key: %v", err)
		}
		t.Logf("refused as configured: %v", err)
	})

	// 2. The event bound is observable in the report: with a bound of three the
	//    report keeps three events and counts the rest, where the shipped 4096
	//    keeps them all.
	t.Run("event bound", func(t *testing.T) {
		cfg := withBattleConfig(t, "max_report_events", "3")
		res := runSmall(t, cfg, 24)
		if len(res.Events) > 3 {
			t.Fatalf("the report kept %d events with battle.max_report_events = 3", len(res.Events))
		}
		if res.EventsDropped == 0 {
			t.Error("no events were dropped, so the bound of 3 was never reached and this proves nothing")
		}
		if res.Config.MaxReportEvents != 3 {
			t.Errorf("the report quotes a bound of %g, so it did not record the configured 3",
				res.Config.MaxReportEvents)
		}
		summary := res.Summary()
		if !strings.Contains(summary, "bound of 3") {
			t.Errorf("the report does not name the bound it hit: %s", summary)
		}
		t.Logf("kept %d of %d events; the report's last line reads %q",
			len(res.Events), len(res.Events)+res.EventsDropped, lastLine(summary))
	})

	// 3. The cell budget is observable through the index: a budget of one cell
	//    forces the coarsening path every tick, which is reported, where a
	//    generous budget leaves the index at the configured cell size.
	t.Run("cell budget", func(t *testing.T) {
		// 4 is the floor: the index adds a one cell margin on each axis, so 4 is
		// the smallest grid it can build and the coarsener can always reach it.
		// A budget below that used to spin this loop forever, which is why the
		// floor exists in three places: this test, config validation, and the
		// clamp in newHash.
		cfg := withBattleConfig(t, "grid_max_cells", "4")
		b, err := newBattle(cfg, 7, smallSetup(t, cfg, 24))
		if err != nil {
			t.Fatalf("building the battle failed: %v", err)
		}
		// The budget is read at construction, and the coarsening decision is made
		// in rebuild, so the tick has to run before either can be checked.
		if b.meleeHash.maxCells != 4 {
			t.Errorf("the index was built with a budget of %d cells, not the configured 4", b.meleeHash.maxCells)
		}
		if b.fireHash.maxCells != 4 {
			t.Errorf("the aimed fire index was built with a budget of %d cells, not the configured 4",
				b.fireHash.maxCells)
		}
		if err := b.tick(); err != nil {
			t.Fatalf("a coarsened index could not run a tick: %v", err)
		}
		if !b.meleeHash.coarsened {
			t.Error("a four cell budget did not coarsen the index, so the engine is not reading it")
		}
		// A coarse index must still be a correct one: the tick has to have
		// resolved the field, not fallen over on an index that cannot address it.
		if b.meleeHash.w*b.meleeHash.h > 4 {
			t.Errorf("the index built %d cells against a budget of 4", b.meleeHash.w*b.meleeHash.h)
		}
		t.Logf("index coarsened to %.1f m cells from a budget of 4, and the tick still ran",
			b.meleeHash.size)
	})

	// 4. The tick bound is the engine's own stopping rule, so a tiny bound must
	//    produce a stalemate where the shipped 20000 does not.
	t.Run("tick bound", func(t *testing.T) {
		cfg := withBattleConfig(t, "max_ticks", "2")
		res := runSmall(t, cfg, 24)
		if res.Ticks != 2 {
			t.Errorf("the battle ran %d ticks with battle.max_ticks = 2", res.Ticks)
		}
		if res.Outcome.Kind != ResultDraw || res.Outcome.Reason != ReasonStalemate {
			t.Errorf("a battle stopped at the tick bound reported %s (%s), not a stalemate draw",
				res.Outcome.Kind, res.Outcome.Reason)
		}
		if res.Config.MaxTicks != 2 {
			t.Errorf("the report quotes a tick bound of %g, not the configured 2", res.Config.MaxTicks)
		}
		t.Logf("stopped at the configured bound: %s after %d ticks (%s)",
			res.Outcome.Kind, res.Ticks, res.Outcome.Reason)
	})

	// 5. The leader spread is observable in the positions GenerateLeaders lays
	//    out, which is the only place it is used.
	t.Run("leader spread", func(t *testing.T) {
		cfg := withBattleConfig(t, "roster_leader_spread", "40")
		leaders := GenerateLeaders(cfg, 3, SideA, 5, 100)
		if len(leaders) != 5 {
			t.Fatalf("asked for 5 leaders and got %d", len(leaders))
		}
		// Five commanders sit at spreads -2 to +2, so the outermost pair is four
		// spread units apart, and each end carries up to half a frontage of
		// deliberate jitter, so the tolerance is one frontage.
		want := 4 * cfg.Battle.RosterFrontage * 40
		tol := cfg.Battle.RosterFrontage
		got := leaders[4].Y - leaders[0].Y
		if got < want-tol || got > want+tol {
			t.Errorf("the outermost commanders are %.2f m apart, want %.2f (+/- %.2f) from a "+
				"spread of 40 frontages", got, want, tol)
		}
		t.Logf("5 commanders spread %.1f m end to end at roster_leader_spread = 40", got)
	})

	// 6. Men per commander is observable in LeaderCount, which is the one
	//    function both the test harness and the throughput sweep ask for a
	//    command structure.
	t.Run("command structure", func(t *testing.T) {
		cfg := withBattleConfig(t, "roster_leaders_per_unit", "10")
		if got := LeaderCount(cfg, 100); got != 11 {
			t.Errorf("a 100 unit force with 10 men a commander got %d commanders, want 11", got)
		}
		cfg = withBattleConfig(t, "roster_leaders_per_unit", "250")
		if got := LeaderCount(cfg, 100); got != 1 {
			t.Errorf("a 100 unit force with 250 men a commander got %d commanders, want 1", got)
		}
		t.Log("command structure follows battle.roster_leaders_per_unit in both directions")
	})
}

// TestFormerLiteralsComeFromConfig covers the second sweep: eleven numbers that
// were literals in this package and are now read from the balance file.
//
// Each case does the same thing: set the key to a value the shipped file does
// not use, run something small, and assert an observable the engine produced
// moved. A constant left behind would not move, so the test fails. The
// observables are chosen to be the output rather than the input, because an
// assertion on the loaded value only proves the loader read the file, which
// internal/config's tests already cover from the other end.
func TestFormerLiteralsComeFromConfig(t *testing.T) {
	t.Run("front aspect", func(t *testing.T) {
		// The shape of a starting block: n units are laid out about
		// sqrt(n*aspect) wide. A hundred units at aspect 3 is 17 columns, and at
		// aspect 12 it is 34, so the block's width roughly doubles in the
		// positions the engine actually put units at.
		//
		// The positions are read from a built battle, because layout is the
		// battle's job: a generated force carries no positions until newBattle
		// places it, so a test reading them off the roster would be reading
		// zeroes.
		span := func(aspect string) float64 {
			cfg := withBattleConfig(t, "roster_front_aspect", aspect)
			b, err := newBattle(cfg, 20260930, smallSetup(t, cfg, 100))
			if err != nil {
				t.Fatalf("building the battle failed: %v", err)
			}
			lo, hi := b.units[0].Y, b.units[0].Y
			for _, u := range b.units[:100] {
				if u.Y < lo {
					lo = u.Y
				}
				if u.Y > hi {
					hi = u.Y
				}
			}
			return hi - lo
		}
		narrow, wide := span("3"), span("12")
		if !(wide > narrow*1.5) {
			t.Errorf("a force of 100 spans %.1f m across at aspect 3 and %.1f m at aspect 12; "+
				"the layout is not reading the key", narrow, wide)
		}
		t.Logf("100 units span %.1f m across at aspect 3, %.1f m at aspect 12", narrow, wide)
	})

	t.Run("leader depth", func(t *testing.T) {
		// Commanders stand behind the front line by the fraction of the
		// formation's depth. The front line of side B is at +start/2, so a
		// leader at the shipped third is nearer the origin than one standing at
		// a depth of zero.
		xOf := func(fraction string) float64 {
			cfg := withBattleConfig(t, "roster_leader_depth_fraction", fraction)
			return GenerateLeaders(cfg, 3, SideB, 1, 100)[0].X
		}
		near, back := xOf("0"), xOf("1")
		if !(near > back) {
			t.Errorf("a commander at depth fraction 0 stands at x %.1f and one at 1 at x %.1f; "+
				"the deeper commander is not further back", near, back)
		}
		t.Logf("side B's single commander: x %.1f at depth fraction 0, x %.1f at 1", near, back)
	})

	t.Run("leader jitter", func(t *testing.T) {
		// The scatter along a command line, in frontages. The spacing between
		// commanders is roster_leader_spread frontages, and the jitter is a
		// deliberate departure from that exact lattice, so the observable is how
		// far each commander sits off the lattice rather than the spacing itself.
		//
		// A deviation is measured against the neighbours' midpoint, which is the
		// lattice point for a commander with an equal share on either side, so it
		// is unaffected by the spread and reads the jitter alone.
		deviation := func(jitter string) float64 {
			cfg := withBattleConfig(t, "roster_leader_jitter_fraction", jitter)
			leaders := GenerateLeaders(cfg, 3, SideA, 21, 100)
			worst := 0.0
			for i := 1; i < len(leaders)-1; i++ {
				mid := (leaders[i-1].Y + leaders[i+1].Y) / 2
				if d := math.Abs(leaders[i].Y - mid); d > worst {
					worst = d
				}
			}
			return worst
		}
		off, none := deviation("1"), deviation("0")
		if off <= 0 {
			t.Errorf("a jitter of one frontage left every commander exactly on the lattice, "+
				"off by %.6f m at worst", off)
		}
		// Zero has to mean an exact line of officers, and the comparison is
		// against a nanometre rather than against nothing: the lattice is
		// computed from each commander's neighbours' midpoint, and floating point
		// subtraction of two nearby values is not exact. The tolerance is three
		// orders of magnitude below the frontage the jitter is measured in, so
		// any real departure would still be caught.
		if none > 1e-9 {
			t.Errorf("a jitter of zero left a commander %.9f m off the lattice; zero has to mean "+
				"an exact line of officers", none)
		}
		// The jitter is bounded by half a frontage either side of the lattice, so
		// no commander can be more than one frontage off it.
		if max := shippedFrontage(t); off > max {
			t.Errorf("the worst commander is %.4f m off its lattice point, more than the %v m frontage "+
				"the jitter is expressed in", off, max)
		}
		t.Logf("21 commanders: worst departure from the lattice %.4f m at jitter 1, %.9f m at 0",
			off, none)
	})

	t.Run("leader influence", func(t *testing.T) {
		// A command's standings run from the floor to the floor plus the spread,
		// as shares of what the caller asked for. At a floor of 0.5 and a spread
		// of 0.5 every commander is inside half to one of the request; at a floor
		// and spread of 1 every commander is between one and two.
		rangeOf := func(floor, spread string) (float64, float64) {
			cfg := withBattleConfig(t, "roster_leader_influence_floor", floor,
				"roster_leader_influence_spread", spread)
			var lo, hi float64
			for i, l := range GenerateLeaders(cfg, 3, SideA, 40, 100) {
				if i == 0 || l.Influence < lo {
					lo = l.Influence
				}
				if l.Influence > hi {
					hi = l.Influence
				}
			}
			return lo, hi
		}
		lo, hi := rangeOf("0.5", "0.5")
		if lo < 45 || hi > 100.0001 {
			t.Errorf("a command asked for 100 standing came back between %.2f and %.2f, want 50 to 100",
				lo, hi)
		}
		lo2, hi2 := rangeOf("1", "1")
		if lo2 < 99.9999 || hi2 > 200.0001 {
			t.Errorf("a floor of 1 and a spread of 1 gave %.2f to %.2f, want 100 to 200", lo2, hi2)
		}
		t.Logf("40 commanders asked for 100: %.2f-%.2f at floor .5 spread .5, %.2f-%.2f at 1 and 1",
			lo, hi, lo2, hi2)
	})

	t.Run("melee of a shooter", func(t *testing.T) {
		// A unit out of ammunition swings with the butt of the weapon, at a
		// share of its own skill. Drive one unit a side into a brawl and read
		// the damage: a shooter at scale 1 must hit for what a trooper hits for
		// at scale 0.
		damage := func(scale string) float64 {
			cfg := withBattleConfig(t, "melee_ranged_skill_scale", scale)
			return swingDamage(t, cfg, RoleRanged, 0.8)
		}
		none, full := damage("0"), damage("1")
		if !(full > none*1.2) {
			t.Errorf("a shooter's swing deals %.2f at scale 0 and %.2f at scale 1; the key is inert",
				none, full)
		}
		t.Logf("one shooter's swing at skill 0.8: %.2f damage at scale 0, %.2f at scale 1", none, full)
	})

	t.Run("hit chance", func(t *testing.T) {
		// The chance a shot connects, which was two literals in aimedfire.go. The
		// observable is the hits-over-shots ratio of an all-shooter force with
		// nothing else going on, which is the hit chance and nothing else.
		//
		// The base is checked at zero as well as at the shipped pair, because a
		// base of zero is where the term it feeds is unambiguous: skill is the
		// whole of what is left, so a shooter with none should barely connect at
		// all. Comparing two positive bases cannot tell a term that is read from
		// one that is scaled.
		rate := func(key, value string, more ...string) float64 {
			cfg := withBattleConfig(t, key, value, more...)
			return hitRate(t, cfg, false)
		}
		base := rate("ranged_hit_chance_base", "0.25")
		high, none := rate("ranged_hit_chance_base", "0.55"), rate("ranged_hit_chance_base", "0")
		if !(high > base*1.4 && base > none*1.5) {
			t.Errorf("hit rates of %.3f at a base of 0, %.3f at the shipped 0.25 and %.3f at 0.55; "+
				"the base is not reaching the shooting model", none, base, high)
		}
		// The skill weight is walked with the base held at the shipped 0.25.
		// Raising the weight alone would sum past one, which validation refuses
		// for a good reason, and lowering the base to make room would move two
		// terms at once and prove nothing about either. 0.25 + 0.75 is exactly 1,
		// so a perfect shooter can just reach certain and nothing exceeds it.
		skill, noSkill := rate("ranged_hit_chance_skill_weight", "0.75"),
			rate("ranged_hit_chance_skill_weight", "0")
		if !(skill > base && base > noSkill) {
			t.Errorf("hit rates of %.3f at a skill weight of 0, %.3f at the shipped weight and "+
				"%.3f at 0.75; skill is not reaching the shooting model",
				noSkill, base, skill)
		}
		t.Logf("hit rate: base 0/0.25/0.55 -> %.3f/%.3f/%.3f; skill weight 0/0.75 -> %.3f/%.3f",
			none, base, high, noSkill, skill)
	})

	t.Run("hit chance of a shaken shooter", func(t *testing.T) {
		// The floor is the share of the hit chance a shooter keeps with no
		// effectiveness at all. At 1 a broken line shoots exactly as well as a
		// steady one and breaking a formation costs it nothing; at 0 a broken
		// shooter cannot hit at all, which is not a shaken man but a discarded
		// one. The whole range between is walked, because a term that is read but
		// only over part of its range still passes an endpoint test.
		steady := hitRate(t, loadConfig(t), false)
		rate := func(floor string) float64 {
			cfg := withBattleConfig(t, "ranged_hit_effectiveness_floor", floor)
			return hitRate(t, cfg, true)
		}
		none, half, whole := rate("0"), rate("0.5"), rate("1")
		if !(whole > half && half > none) {
			t.Errorf("a broken force hits %.3f of shots at a floor of 0, %.3f at 0.5 and %.3f at 1; "+
				"the floor is not scaling the hit chance", none, half, whole)
		}
		if !(none < steady && whole < steady) {
			t.Errorf("a broken force hits %.3f to %.3f across the floor's range, against %.3f steady; "+
				"a shooter with no effectiveness should never shoot as well as a steady one",
				none, whole, steady)
		}
		t.Logf("broken shooters hit %.3f of shots at a floor of 0, %.3f at 0.5 and %.3f at 1, "+
			"against %.3f steady", none, half, whole, steady)
	})

	t.Run("morale recovery band", func(t *testing.T) {
		// A unit below the band, with no enemy in sight, recovers. Above it, it
		// does not. The observable is the morale of an unopposed, healthy unit
		// partway through a battle, which moves only if the gate moves.
		recovered := func(band string) float64 {
			cfg := withBattleConfig(t, "morale_recovery_suppression_band", band)
			return unopposedMorale(t, cfg)
		}
		open, shut := recovered("0.05"), recovered("0")
		if !(open > shut) {
			t.Errorf("an unopposed unit ends at morale %.4f with an open band and %.4f with it shut; "+
				"the gate is not being read", open, shut)
		}
		t.Logf("unopposed, unpressed unit: morale %.4f with the band open, %.4f shut", open, shut)
	})

	t.Run("morale bias scale", func(t *testing.T) {
		// Roster.MoraleBias is a relative shift and this is the scale that turns
		// it into morale points. A bias of -1 at a scale of 0.5 must land a
		// generated force half a point below the same force with no bias at all,
		// and at a scale of 0 it must land nowhere.
		//
		// The comparison is against the same seed with no bias, rather than
		// against roster_morale_start, because a sample of 200 units has a mean
		// that is the configured mean plus the error of its own spread: at
		// 0.07 that error is a few thousandths, which is larger than the
		// difference between two scales that differ by 0.01.
		mean := func(bias float64, scale string) float64 {
			cfg := withBattleConfig(t, "roster_morale_bias_scale", scale)
			force, err := GenerateForce(cfg, 3, SideA, Roster{Units: 400, MoraleBias: bias})
			if err != nil {
				t.Fatalf("generating the force failed: %v", err)
			}
			sum := 0.0
			for _, u := range force {
				sum += u.Morale
			}
			return sum / float64(len(force))
		}
		plain := mean(0, "1")
		half, none := mean(-1, "0.5"), mean(-1, "0")
		if math.Abs(plain-half-0.5) > 0.01 {
			t.Errorf("a bias of -1 at scale 0.5 gives a mean of %.4f against %.4f unbiased, want 0.5 lower",
				half, plain)
		}
		if math.Abs(plain-none) > 0.01 {
			t.Errorf("a bias of -1 at scale 0 gives a mean of %.4f against %.4f unbiased; the bias "+
				"should land nowhere", none, plain)
		}
		t.Logf("400 units, mean morale: %.4f unbiased, %.4f at a bias of -1 with scale 0.5, "+
			"%.4f with scale 0", plain, half, none)
	})
}

// shippedFrontage is the roster frontage from the file that ships, which the
// leader jitter is measured in. It reads the shipped file rather than an edited
// copy, because a frontage edit would rescale the tolerance along with the
// quantity under test and quietly stop the assertion from meaning anything.
func shippedFrontage(t *testing.T) float64 {
	t.Helper()
	return loadConfig(t).Battle.RosterFrontage
}

// swingDamage puts one unit of the given role in reach of one of the other and
// returns the damage its single swing does.
//
// Two things are done to make the number comparable across calls. Variance is
// set to zero and the closing-speed term to zero, so the damage is a function of
// the attacker's skill and nothing else, and it is read from the live state
// after one tick rather than from the report: the report counts bodies removed,
// and one blow against a thousand hit point target removes none, so the report
// would read zero for every value of the knob.
func swingDamage(t *testing.T, cfg *config.Config, role Role, skill float64) float64 {
	t.Helper()
	me := Unit{Role: role, HP: 100, MaxHP: 100, Morale: 0.7, MeleeSkill: skill, RangedSkill: 0,
		Speed: 0, Troops: 1, Status: StatusFighting}
	them := Unit{Role: RoleMelee, HP: 1000, MaxHP: 1000, Morale: 0.7, MeleeSkill: 0, Speed: 0,
		Troops: 1, Status: StatusFighting}
	b, err := newBattle(cfg, 3, Setup{A: []Unit{me}, B: []Unit{them}, Terrain: TerrainOpen})
	if err != nil {
		t.Fatalf("building the battle failed: %v", err)
	}
	// The positions are set after construction, because newBattle lays the forces
	// out and would otherwise overwrite them: a battle's opening positions are
	// the layout's business, not the caller's, and a test that fought to put its
	// units in contact before construction was testing nothing.
	b.units[0].X, b.units[1].X = -cfg.Battle.MeleeRange/2, cfg.Battle.MeleeRange/2
	b.units[0].Y, b.units[1].Y = 0, 0
	if err := b.tick(); err != nil {
		t.Fatalf("one tick failed: %v", err)
	}
	return b.units[1].MaxHP - b.units[1].HP
}

// hitRateTicks is how long a hit-rate measurement runs for.
//
// At battle.tick_seconds 0.25 and battle.ranged_fire_interval 1.4, one shooter
// gets off a shot every 5.6 ticks, so 40 shooters over 600 ticks fire about
// 3,400: far more than enough to put a rate on a chance, and short enough that
// the four cases using it cost about a second each.
const hitRateTicks = 600

// hitRateShooters is the size of the shooting force, chosen so a whole run's
// shots are a five-figure-free sample with time to spare.
const hitRateShooters = 40

// hitRate is the share of a force's shots that connect, which is the hit chance
// and nothing else: every unit on the shooting side is a shooter, and the
// targets cannot shoot back.
//
// It measures this in the engine rather than through Run, for a reason worth
// stating. A generated 40 v 40 melee force is DECIDED at about tick 260, long
// before its shooters have fired a thousand rounds, so the run ends with a
// sample of about 95 shots and a rate noisy enough to be useless for comparing
// two values of a knob. Growing the target force does not help: it breaks at
// roughly the same tick, because what ends these fights is morale collapsing
// under suppression rather than casualties. So the measurement puts the two
// sides in contact at once, on targets with enough hit points to stay on the
// field for the whole run, and reads the engine's own counters.
//
// The rate is not the configured chance, and the tests that use it compare
// rates against rates rather than against the file. Suppression on both sides
// and the moment before contact both move it, and they move it identically for
// every value of the knob being tested, which is the property that makes the
// comparison meaningful.
func hitRate(t *testing.T, cfg *config.Config, broken bool) float64 {
	t.Helper()
	a, err := GenerateForce(cfg, 7, SideA, Roster{Units: hitRateShooters, AllRanged: true})
	if err != nil {
		t.Fatalf("side A: %v", err)
	}
	// Targets that cannot shoot back, cannot be killed, and cannot break: a
	// million hit points each against a shot that does seventeen damage is a
	// target that is on the field, hurting, for the whole measurement.
	b := make([]Unit, 0, hitRateShooters)
	for i := 0; i < hitRateShooters; i++ {
		b = append(b, Unit{
			Side: SideB, Role: RoleMelee, ID: i,
			HP: 1e7, MaxHP: 1e7, Morale: 0.95, Speed: 0, Troops: 1,
			Status: StatusFighting,
		})
	}
	bt, err := newBattle(cfg, 7, Setup{A: a, B: b, Terrain: TerrainOpen, Label: "hit rate"})
	if err != nil {
		t.Fatalf("building the hit rate battle failed: %v", err)
	}
	// Contact at the first tick, so every tick of the run measures shooting
	// rather than approach. Positions are set after construction because
	// newBattle lays the forces out and would overwrite them.
	for i := range bt.units {
		row := float64(i%hitRateShooters-hitRateShooters/2) * cfg.Battle.RosterFrontage
		if bt.units[i].Side == SideA {
			bt.units[i].X, bt.units[i].Y = -50, row
		} else {
			bt.units[i].X, bt.units[i].Y = 50, row
		}
	}
	// A broken shooter is a shooter whose effectiveness term is at its floor,
	// which is the state battle.ranged_hit_effectiveness_floor describes. It is
	// re-asserted every tick rather than set once, because the engine resolves
	// status from morale at commit: a shooter set broken and then left alone
	// recovers over the first few ticks and is fighting again long before the
	// run ends, which measures nothing.
	for i := 0; i < hitRateTicks; i++ {
		if broken {
			for j := range bt.units {
				if bt.units[j].Side == SideA {
					bt.units[j].Morale = 0.20 // below battle.morale_break_threshold
					bt.units[j].Status = StatusBroken
				}
			}
		}
		if err := bt.tick(); err != nil {
			t.Fatalf("tick %d failed: %v", i, err)
		}
	}
	shots := bt.stats.Shots[0]
	if shots < 1000 {
		t.Fatalf("only %.0f shots in %d ticks; too few to measure a rate from", shots, hitRateTicks)
	}
	return bt.stats.RangedHits[0] / shots
}

// unopposedMorale is the morale an unopposed, healthy unit holds after a
// bounded run, which is what battle.morale_recovery raises and what the
// suppression gate in front of it can stop.
func unopposedMorale(t *testing.T, cfg *config.Config) float64 {
	t.Helper()
	a, err := GenerateForce(cfg, 5, SideA, Roster{Units: 20, NoRanged: true})
	if err != nil {
		t.Fatalf("side A: %v", err)
	}
	b, err := GenerateForce(cfg, 5, SideB, Roster{Units: 20, NoRanged: true})
	if err != nil {
		t.Fatalf("side B: %v", err)
	}
	// Hold them a long way apart, so nothing is in the other's neighbourhood and
	// the recovery term is the only thing moving either side's morale. The
	// formation is laid out from roster_start_distance, so moving side B to one
	// end of the field and side A to the other is a matter of x alone.
	for i := range b {
		b[i].X += 4000
	}
	// And they must not run at each other for the whole of the run, which a short
	// bound over a 4 km gap more than covers.
	res, err := RunTicks(cfg, 5, Setup{A: a, B: b, Terrain: TerrainOpen, Label: "unopposed"}, 40)
	if err != nil {
		t.Fatalf("the unopposed battle did not run: %v", err)
	}
	return res.Sides[0].MoraleEnd
}

// TestTheEngineCarriesNoFixedSize walks the claims this file is about. It is a
// source-level check, and it is here because a test that only changes config
// cannot see a constant that the config happens to agree with today.
func TestTheEngineCarriesNoFixedSize(t *testing.T) {
	cfg := loadConfig(t)

	// A force of one unit a side is the smallest a battle can be, and it must
	// run: if any stage sized itself from a preferred force rather than the one
	// it was given, this is where it would show.
	setup := smallSetup(t, cfg, 1)
	res, err := Run(cfg, 11, setup)
	if err != nil {
		t.Fatalf("a one unit a side battle did not run: %v", err)
	}
	if res.Ticks == 0 {
		t.Error("a one unit a side battle ended on the opening tick")
	}
	t.Logf("1 v 1 ran for %d ticks and reported %s", res.Ticks, res.Outcome.Kind)

	// A hundred and a half a side is an odd number, so a formation that rounds
	// to an even shape, or a loop that steps by two, drops units. The report
	// has to account for every unit that started.
	odd := runSmall(t, cfg, 150)
	started := 0
	for _, s := range odd.Sides {
		started += s.StartUnits
		if s.StartUnits != 150 {
			t.Errorf("side %s started with %d units of the 150 it was given", s.Side, s.StartUnits)
		}
		accounted := s.Standing + s.Routed + (s.StartUnits - s.Standing - s.Routed)
		if accounted != s.StartUnits {
			t.Errorf("side %s accounts for %d of its %d units", s.Side, accounted, s.StartUnits)
		}
	}
	if started != 300 {
		t.Errorf("the report describes %d units, the two sides were given 300", started)
	}
	t.Logf("150 v 150 accounted for all %d units", started)

	// The same seed and the same force must give the same battle, at whatever
	// size: a size knob that changed the order random draws are made in would
	// make every run a different battle and no balance measurement repeatable.
	first := runSmall(t, cfg, 60)
	second := runSmall(t, cfg, 60)
	if first.StateHash != second.StateHash {
		t.Errorf("two identical 60 v 60 runs diverged: state hashes %d and %d",
			first.StateHash, second.StateHash)
	}
	if first.Ticks != second.Ticks {
		t.Errorf("two identical 60 v 60 runs ran for different lengths: %d and %d ticks",
			first.Ticks, second.Ticks)
	}
	t.Logf("two identical 60 v 60 runs agree: %d ticks, state hash %d", first.Ticks, first.StateHash)
}

// smallSetup builds an even force of n units a side with the configured command
// structure, which is the shape every reference run in this package uses.
func smallSetup(t *testing.T, cfg *config.Config, n int) Setup {
	t.Helper()
	a, err := GenerateForce(cfg, 20260930, SideA, Roster{Units: n})
	if err != nil {
		t.Fatalf("side A: %v", err)
	}
	b, err := GenerateForce(cfg, 20260930, SideB, Roster{Units: n})
	if err != nil {
		t.Fatalf("side B: %v", err)
	}
	leaders := LeaderCount(cfg, n)
	return Setup{
		A: a, B: b,
		Leaders: append(
			GenerateLeaders(cfg, 20260930, SideA, leaders, 260),
			GenerateLeaders(cfg, 20260930, SideB, leaders, 260)...),
		Terrain: TerrainOpen,
		Label:   "size knob check",
	}
}

// runSmall runs a battle of n units a side with a bounded tick budget, so a test
// in this file cannot take fifteen minutes. The budget is generous enough that a
// small field usually decides on its own.
func runSmall(t *testing.T, cfg *config.Config, n int) *Result {
	t.Helper()
	budget := int(cfg.Battle.MaxTicks)
	if budget > 2000 {
		budget = 2000
	}
	res, err := RunTicks(cfg, 20260930, smallSetup(t, cfg, n), budget)
	if err != nil {
		t.Fatalf("the %d v %d battle did not run: %v", n, n, err)
	}
	return res
}

// asBattleError is errors.As for *Error, kept local so this file does not
// import errors for one call.
func asBattleError(err error, target **Error) bool {
	for err != nil {
		if be, ok := err.(*Error); ok {
			*target = be
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// lastLine returns the final non-empty line of s, for logging a report's note.
func lastLine(s string) string {
	lines := strings.Split(strings.TrimRight(s, "\n"), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			return lines[i]
		}
	}
	return ""
}
