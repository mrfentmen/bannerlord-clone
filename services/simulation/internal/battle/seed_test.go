package battle

import (
	"fmt"
	"testing"
)

// Deriving 1000 seeds across counters and party pairs must yield 1000 unique
// values: no two battles share a seed.
func TestDeriveBattleSeedUnique(t *testing.T) {
	seen := make(map[uint64]string, 1000)
	for i := uint64(0); i < 1000; i++ {
		attacker := fmt.Sprintf("party-%d", i%37)
		defender := fmt.Sprintf("party-%d", (i*7)%41)
		seed := DeriveBattleSeed(0xDEADBEEF, i, attacker, defender)
		key := fmt.Sprintf("%d/%s/%s", i, attacker, defender)
		if prev, dup := seen[seed]; dup {
			t.Fatalf("seed collision: %q and %q both derive %x", prev, key, seed)
		}
		seen[seed] = key
	}
}

// Same inputs, same seed: derivation is deterministic.
func TestDeriveBattleSeedDeterministic(t *testing.T) {
	a := DeriveBattleSeed(42, 7, "alpha", "bravo")
	b := DeriveBattleSeed(42, 7, "alpha", "bravo")
	if a != b {
		t.Fatalf("same inputs derived different seeds: %x vs %x", a, b)
	}
	if a == 0 {
		t.Fatal("derived seed is zero; a zero seed is a degenerate RNG stream")
	}
}

// The seed commits to the matchup: changing the counter, either party, the
// campaign seed, or the attacker/defender order changes the seed.
func TestDeriveBattleSeedCommitsToMatchup(t *testing.T) {
	base := DeriveBattleSeed(42, 7, "alpha", "bravo")
	cases := map[string]uint64{
		"counter":       DeriveBattleSeed(42, 8, "alpha", "bravo"),
		"attacker":      DeriveBattleSeed(42, 7, "alpha2", "bravo"),
		"defender":      DeriveBattleSeed(42, 7, "alpha", "bravo2"),
		"campaign seed": DeriveBattleSeed(43, 7, "alpha", "bravo"),
		"swapped sides": DeriveBattleSeed(42, 7, "bravo", "alpha"),
	}
	for name, seed := range cases {
		if seed == base {
			t.Fatalf("%s did not change the derived seed", name)
		}
	}
}

// Length-prefixing must separate ("ab", "c") from ("a", "bc"): without it the
// two pairs hash identical bytes.
func TestDeriveBattleSeedSeparatesIDs(t *testing.T) {
	a := DeriveBattleSeed(42, 7, "ab", "c")
	b := DeriveBattleSeed(42, 7, "a", "bc")
	if a == b {
		t.Fatal(`("ab","c") and ("a","bc") derived the same seed: id boundary is ambiguous`)
	}
}
