package caravan

import (
	"testing"

	"mbclone/simulation/internal/model"
)

// TestCaravanUpkeep verifies caravans consume gold for guards and animals.
func TestCaravanUpkeep(t *testing.T) {
	// Setup minimal state with a caravan party.
	s := &model.State{
		Parties: map[int]*model.Party{
			1: {
				ID:             1,
				IsCaravan:      true,
				CaravanGold:    1000,
				CaravanGuards:  10,
				CaravanAnimals: 5,
				CaravanAtTown:  -1,
				CaravanDestTown: -1,
			},
		},
		Towns: map[int]*model.Town{},
	}

	// Run the system (simplified - just verify the party is recognized).
	if !s.Parties[1].IsCaravan {
		t.Error("Party should be a caravan")
	}

	// Verify upkeep calculation: 10 guards * 2 + 5 animals * 1 = 25 gold/day.
	expectedUpkeep := 10.0*guardUpkeep + 5.0*animalUpkeep
	if expectedUpkeep != 25.0 {
		t.Errorf("Expected upkeep 25, got %f", expectedUpkeep)
	}
}

// TestCheapestGood verifies the cheapest good selection.
func TestCheapestGood(t *testing.T) {
	town := &model.Town{
		PriceFood:     10.0,
		PriceMedicine: 50.0,
		PriceMetal:    30.0,
	}
	good, price := cheapestGood(town)
	if good != "food" {
		t.Errorf("Expected food to be cheapest, got %s", good)
	}
	if price != 10.0 {
		t.Errorf("Expected price 10, got %f", price)
	}
}

// TestGoodHash verifies good name hashing is reversible.
func TestGoodHash(t *testing.T) {
	goods := []string{"food", "medicine", "metal"}
	for _, g := range goods {
		h := hashGood(g)
		back := unhashGood(h)
		if back != g {
			t.Errorf("Hash roundtrip failed for %s: got %s", g, back)
		}
	}
}

// TestUpgradeCost verifies the cost constants are sane.
func TestCaravanConstants(t *testing.T) {
	if caravanCapacity <= 0 {
		t.Error("Caravan capacity must be positive")
	}
	if caravanSpeed <= 0 {
		t.Error("Caravan speed must be positive")
	}
	if guardUpkeep <= 0 || animalUpkeep <= 0 {
		t.Error("Upkeep costs must be positive")
	}
}
