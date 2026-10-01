// Package rumours generates trade rumours from world state (Tier 6).
//
// Bannerlord feeds the player trade rumours: "grain is cheap in X, sell
// it in Y for profit." Trade XP comes from trading against those rumours.
// This package generates such rumours by scanning for price discrepancies
// between towns.
//
// It is a pure query package: given the world state, it returns a list of
// actionable trade tips. No state mutation, no staged writes. The campaign
// client calls it to populate the rumour UI; the sim never invokes it.
package rumours

import (
	"fmt"
	"sort"

	"mbclone/simulation/internal/model"
)

// Rumour is a single trade tip.
type Rumour struct {
	Good       string // "grain", "metal", "medicine", etc.
	BuyTown    string // where it's cheap
	BuyTownID  int
	BuyPrice   float64
	SellTown   string // where it's dear
	SellTownID int
	SellPrice  float64
	Margin     float64 // sell - buy, per unit
	Text       string  // human-readable tip
}

// goodPrices extracts the price of each trade good per town.
func goodPrices(t *model.Town) map[string]float64 {
	return map[string]float64{
		"food":     t.PriceFood,
		"medicine": t.PriceMedicine,
		"metal":    t.PriceMetal,
	}
}

// Generate scans all towns for profitable buy-low/sell-high pairs.
// minMargin filters out trivial opportunities; maxRumours caps output.
func Generate(s *model.State, minMargin float64, maxRumours int) []Rumour {
	var rumours []Rumour
	towns := make([]*model.Town, 0, len(s.Towns))
	for _, t := range s.Towns {
		if t != nil {
			towns = append(towns, t)
		}
	}

	for _, good := range []string{"food", "medicine", "metal"} {
		// Find cheapest and dearest for this good.
		sort.Slice(towns, func(i, j int) bool {
			return goodPrices(towns[i])[good] < goodPrices(towns[j])[good]
		})
		if len(towns) < 2 {
			continue
		}
		cheap := towns[0]
		dear := towns[len(towns)-1]
		buyPrice := goodPrices(cheap)[good]
		sellPrice := goodPrices(dear)[good]
		margin := sellPrice - buyPrice
		if margin < minMargin {
			continue
		}
		// Skip if either town is blockaded or besieged (can't trade there).
		if cheap.Blockade > 0.5 || cheap.IsBesieged || dear.Blockade > 0.5 || dear.IsBesieged {
			continue
		}
		rumours = append(rumours, Rumour{
			Good:       good,
			BuyTown:    cheap.Name,
			BuyTownID:  cheap.ID,
			BuyPrice:   buyPrice,
			SellTown:   dear.Name,
			SellTownID: dear.ID,
			SellPrice:  sellPrice,
			Margin:     margin,
			Text:       fmt.Sprintf("Buy %s cheap in %s (%.0f), sell dear in %s (%.0f). Margin %.0f per unit.", good, cheap.Name, buyPrice, dear.Name, sellPrice, margin),
		})
	}

	// Best margins first; break ties by good name for determinism.
	sort.Slice(rumours, func(i, j int) bool {
		if rumours[i].Margin != rumours[j].Margin {
			return rumours[i].Margin > rumours[j].Margin
		}
		return rumours[i].Good < rumours[j].Good
	})
	if len(rumours) > maxRumours {
		rumours = rumours[:maxRumours]
	}
	return rumours
}
