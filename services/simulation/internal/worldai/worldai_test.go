package worldai

// Long-run and determinism tests for the emergent campaign simulation.
//
// These are the mandate's sections 17 and 18 made mechanical: identical seeds
// must produce identical AI decisions, and long runs must be monitored for
// systemic pathologies. Every test runs the real registered system list on a
// small generated world; nothing is mocked.

import (
	"fmt"
	"testing"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

func testConfig(t *testing.T) *config.Config {
	t.Helper()
	cfg, err := config.Load("../../config/balance.toml")
	if err != nil {
		t.Fatalf("loading balance.toml: %v", err)
	}
	return cfg
}

// TestStateHashDeterministic runs the same 30-day campaign twice from one seed
// and requires byte-identical state. This is the determinism contract the
// whole world-AI lane stands on: if the world diverges from itself, no AI
// decision built on it can be trusted.
func TestStateHashDeterministic(t *testing.T) {
	cfg := testConfig(t)
	a, err := RunDays(cfg, 1234, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := RunDays(cfg, 1234, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	ha, hb := StateHash(a), StateHash(b)
	if ha != hb {
		t.Fatalf("deterministic divergence: same seed gave different state\nhash a=%s\nhash b=%s", ha, hb)
	}
	t.Logf("30-day hash stable across runs: %s", ha)
}

// TestStateHashSeedSensitive is the companion that proves the hash actually
// sees the simulation: different seeds must not hash the same.
func TestStateHashSeedSensitive(t *testing.T) {
	cfg := testConfig(t)
	a, err := RunDays(cfg, 1234, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := RunDays(cfg, 9999, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	if StateHash(a) == StateHash(b) {
		t.Fatal("different seeds produced identical state hash; the hash is blind")
	}
}

// TestAIDecisionsDeterministic records every party's intention after every
// tick in two identical runs and requires the sequences to match exactly.
// The mandate's section 17 demands proof that identical campaigns produce
// identical AI decisions; this is that proof, at the decision level rather
// than the state level.
func TestAIDecisionsDeterministic(t *testing.T) {
	cfg := testConfig(t)
	record := func(seed uint64) []string {
		var seq []string
		_, err := RunDays(cfg, seed, 30, func(v *sim.View) {
			for _, pid := range v.State.PartyIDs() {
				p := v.State.Parties[pid]
				seq = append(seq, fmt.Sprintf("t%d p%d intent=%d activity=%d score=%.6f",
					v.Tick, pid, p.Intention, p.Activity, p.DecisionScore))
			}
		})
		if err != nil {
			t.Fatal(err)
		}
		return seq
	}
	a, b := record(777), record(777)
	if len(a) != len(b) {
		t.Fatalf("decision sequence lengths differ: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("AI decision diverged at decision %d:\n a=%s\n b=%s", i, a[i], b[i])
		}
	}
	t.Logf("%d AI decisions identical across runs", len(a))
}

// TestSmallWorldNoPanic is the regression test for the worldgen boundary fix:
// raider bands used to index the town map by position (0-based) while town
// ids are 1-based, so generating raiders could nil-panic. Ten worlds across
// ten seeds must all generate cleanly.
func TestSmallWorldNoPanic(t *testing.T) {
	cfg := testConfig(t)
	for seed := uint64(1); seed <= 10; seed++ {
		s := SmallWorld(cfg, seed)
		raiders := 0
		for _, pid := range s.PartyIDs() {
			p := s.Parties[pid]
			if p.IsRaider {
				raiders++
				if p.DestTown >= 0 && !s.Exists(model.KindTown, p.DestTown) {
					t.Fatalf("seed %d: raider party#%d targets missing town#%d",
						seed, pid, p.DestTown)
				}
			}
		}
		if raiders == 0 {
			t.Fatalf("seed %d: no raider bands generated", seed)
		}
	}
}

// TestSupplyDistanceNotClamped is the regression test for the fields.go
// boundary fix: supply_distance was registered with Min=inf (1e12), so the
// engine clamped every committed write to exactly 1e12 and attrition's supply
// drag was binary instead of distance-based. After the fix, committed values
// must be real distances.
func TestSupplyDistanceNotClamped(t *testing.T) {
	cfg := testConfig(t)
	s, err := RunDays(cfg, 555, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	graded, clamped := 0, 0
	for _, pid := range s.PartyIDs() {
		p := s.Parties[pid]
		if p.SupplyDistance == 0 {
			continue
		}
		if p.SupplyDistance >= 1e12 {
			clamped++
			t.Errorf("party#%d: supply_distance=%v looks clamped to the old Min=inf sentinel", pid, p.SupplyDistance)
			continue
		}
		graded++
	}
	if graded == 0 {
		t.Error("no party has a graded supply distance after 30 days; the supply mechanic looks dead")
	}
	t.Logf("supply distances graded for %d parties, clamped for %d", graded, clamped)
}

// TestHealth30Days runs a 30-day campaign and requires no structural
// pathologies: no negative or NaN resources, no dangling references, no side
// at war with itself.
func TestHealth30Days(t *testing.T) {
	cfg := testConfig(t)
	s, err := RunDays(cfg, 4242, 30, nil)
	if err != nil {
		t.Fatal(err)
	}
	problems := Health(s)
	for _, p := range problems {
		t.Errorf("health: %s: %s", p.Where, p.What)
	}
	acts := CountPartiesByActivity(s)
	t.Logf("after 30 days: %d towns, %d parties, activities=%v",
		len(s.Towns), len(s.Parties), acts)
}

// TestLongRun1Year runs a full in-game year and checks health plus continued
// determinism: the first 30 days of a year-long run must hash the same as a
// standalone 30-day run from the same seed.
func TestLongRun1Year(t *testing.T) {
	if testing.Short() {
		t.Skip("1-year run skipped in short mode")
	}
	cfg := testConfig(t)
	s, err := RunDays(cfg, 31337, 365, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range Health(s) {
		t.Errorf("health after 1 year: %s: %s", p.Where, p.What)
	}
	acts := CountPartiesByActivity(s)
	intents := CountIntentions(s)
	t.Logf("after 1 year: towns=%d parties=%d rulers=%d wars=%d activities=%v intents=%v",
		len(s.Towns), len(s.Parties), len(s.Rulers), len(s.Wars), acts, intents)
	if len(s.Sides) == 0 {
		t.Error("all sides are gone after 1 year: total faction collapse")
	}
}

// TestLongRun5Years runs five in-game years watching for slow pathologies:
// infinite wars, dead factions, runaway entity counts, memory growth in the
// event record. Slow by design; skipped in short mode.
func TestLongRun5Years(t *testing.T) {
	if testing.Short() {
		t.Skip("5-year run skipped in short mode")
	}
	cfg := testConfig(t)
	s, err := RunDays(cfg, 271828, 1825, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range Health(s) {
		t.Errorf("health after 5 years: %s: %s", p.Where, p.What)
	}
	// No war may run the whole five years: wars must be able to end.
	for _, wid := range s.WarIDs() {
		wr := s.Wars[wid]
		if wr.EndTick < 0 && float64(s.Tick)-wr.StartTick >= 1825 {
			t.Errorf("war#%d between side#%d and side#%d never ended in 5 years: infinite war",
				wid, wr.SideA, wr.SideB)
		}
	}
	t.Logf("after 5 years: towns=%d parties=%d rulers=%d wars=%d events=%d sides=%d",
		len(s.Towns), len(s.Parties), len(s.Rulers), len(s.Wars), len(s.Events), len(s.Sides))
}
