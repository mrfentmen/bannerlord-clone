package autoresolve

import (
	"math"
	"testing"
)

func testForce(tier Tier, count float64) Force {
	return Force{
		Blocks:   []TroopBlock{{Tier: tier, Count: count, Equipment: 0.5}},
		Morale:   1.0,
		Medicine: 0.5,
	}
}

// The plan's acceptance: 100 tier-3 outscore 100 tier-1 by at least 2x.
func TestTierStrengthRatio(t *testing.T) {
	t3 := baseStrength(testForce(TierTrained, 100))
	t1 := baseStrength(testForce(TierMilitia, 100))
	if t3 < 2.0*t1 {
		t.Fatalf("tier-3 strength %.2f is not 2x tier-1 strength %.2f", t3, t1)
	}
}

// The plan's acceptance: attacker-favorable vs defender-favorable terrain
// differ by 15%+ win rate over 200 trials.
func TestTerrainSwing(t *testing.T) {
	winRate := func(terrain Terrain, trials int) float64 {
		wins := 0
		for i := 0; i < trials; i++ {
			att := testForce(TierTrained, 100)
			def := testForce(TierTrained, 100)
			res := Resolve(att, def, Context{Terrain: terrain, Seed: uint64(1000 + i), BattleID: "test"})
			if res.AttackerWon {
				wins++
			}
		}
		return float64(wins) / float64(trials)
	}
	open := winRate(TerrainOpen, 200)
	forest := winRate(TerrainForest, 200)
	if math.Abs(open-forest) < 0.15 {
		t.Fatalf("terrain swing too small: open win rate %.2f, forest win rate %.2f", open, forest)
	}
}

// The plan's acceptance: casualty share by tier matches weights within 5%
// over 500 trials.
func TestTierWeightedCasualties(t *testing.T) {
	// Per-body casualty weight is 1/tierWeight. Expected share for tier t:
	// (count_t / w_t) / sum(count_i / w_i).
	counts := map[Tier]float64{TierMilitia: 100, TierTrained: 100, TierElite: 100}
	var denom float64
	for tier, c := range counts {
		denom += c / tierWeight(tier)
	}
	expected := make(map[Tier]float64)
	for tier, c := range counts {
		expected[tier] = (c / tierWeight(tier)) / denom
	}
	actual := make(map[Tier]float64)
	var total float64
	for i := 0; i < 500; i++ {
		f := Force{
			Blocks: []TroopBlock{
				{Tier: TierMilitia, Count: 100, Equipment: 0.5},
				{Tier: TierTrained, Count: 100, Equipment: 0.5},
				{Tier: TierElite, Count: 100, Equipment: 0.5},
			},
			Morale: 1.0,
		}
		res := Resolve(f, testForce(TierTrained, 50), Context{Terrain: TerrainOpen, Seed: uint64(i), BattleID: "test"})
		for _, c := range res.Losses[0] {
			actual[c.Tier] += c.Killed + c.Wounded
			total += c.Killed + c.Wounded
		}
	}
	for tier, exp := range expected {
		got := actual[tier] / total
		if math.Abs(got-exp) > 0.05 {
			t.Fatalf("tier %d casualty share %.3f, expected %.3f (within 0.05)", tier, got, exp)
		}
	}
}

// Determinism: same seed always produces the same result.
func TestDeterminism(t *testing.T) {
	att := testForce(TierTrained, 100)
	def := testForce(TierRegular, 120)
	ctx := Context{Terrain: TerrainHill, Night: true, Seed: 42, BattleID: "det"}
	a := Resolve(att, def, ctx)
	b := Resolve(att, def, ctx)
	if a.AttackerWon != b.AttackerWon || a.Rounds != b.Rounds {
		t.Fatal("same seed gave different outcome")
	}
	if math.Abs(a.TotalKilled()-b.TotalKilled()) > 1e-9 {
		t.Fatal("same seed gave different casualties")
	}
	if len(a.Modifiers) != len(b.Modifiers) {
		t.Fatal("same seed gave different modifier ledger")
	}
}

// The plan requires wounded nonzero in most battles.
func TestWoundedNonzero(t *testing.T) {
	nonzero := 0
	for i := 0; i < 50; i++ {
		res := Resolve(testForce(TierTrained, 100), testForce(TierTrained, 100),
			Context{Terrain: TerrainOpen, Seed: uint64(i), BattleID: "test"})
		if res.TotalWounded() > 0 {
			nonzero++
		}
	}
	if nonzero < 40 {
		t.Fatalf("wounded nonzero in only %d/50 battles, want most", nonzero)
	}
}

// Modifiers are named and logged: every factor applied appears in the ledger.
func TestModifierLedger(t *testing.T) {
	res := Resolve(testForce(TierTrained, 100), testForce(TierTrained, 100),
		Context{Terrain: TerrainForest, DefenderAmbush: true, Night: true, SiegeEngines: 2, Seed: 7, BattleID: "test"})
	names := make(map[string]bool)
	for _, m := range res.Modifiers {
		if m.Name == "" {
			t.Fatal("modifier with empty name")
		}
		names[m.Name] = true
	}
	for _, want := range []string{"terrain:defender-forest", "tactics:defender-night-ambush"} {
		if !names[want] {
			t.Fatalf("missing expected modifier %q in ledger %v", want, names)
		}
	}
	// Siege engines only help the attacker; this test has them on the
	// attacker side implicitly (besieger). Check the factor is > 1.
	found := false
	for _, m := range res.Modifiers {
		if len(m.Name) >= 28 && m.Name[:28] == "tactics:attacker-siege-engin" {
			found = true
			if m.Factor <= 1.0 {
				t.Fatalf("siege engine factor %f should exceed 1.0", m.Factor)
			}
		}
	}
	if !found {
		t.Fatal("siege engine modifier missing from ledger")
	}
}

// Prisoners never exceed the loser's wounded (routed survivors bound).
func TestPrisonerBound(t *testing.T) {
	for i := 0; i < 50; i++ {
		res := Resolve(testForce(TierTrained, 100), testForce(TierTrained, 100),
			Context{Terrain: TerrainOpen, Seed: uint64(500 + i), BattleID: "test"})
		var wounded float64
		for _, c := range res.Losses[res.LoserIndex()] {
			wounded += c.Wounded
		}
		taken := res.PrisonersTaken[res.WinnerIndex()]
		if taken > wounded+1e-9 {
			t.Fatalf("prisoners %.2f exceed wounded %.2f", taken, wounded)
		}
	}
}
