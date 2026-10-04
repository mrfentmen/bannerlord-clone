// Package warprofit handles selling to both sides.
//
// Builds on diplomacy (wars), smuggling (routes), crafting (goods).
// Wars create demand. Sell weapons to both sides, profit from chaos.
package warprofit

import (
	"mbclone/simulation/internal/systems/crafting"
	"mbclone/simulation/internal/systems/diplomacy"
	"mbclone/simulation/internal/systems/smuggling"
)

// WarMarket is an active conflict to profit from.
type WarMarket struct {
	SideA      int
	SideB      int
	Intensity  float64 // 0-100, higher = more demand
	DaysActive int
}

// DemandMultiplier returns price inflation due to war.
// Higher intensity = higher prices for weapons.
func DemandMultiplier(w *WarMarket) float64 {
	return 1 + w.Intensity/50
}

// WeaponProfit calculates profit selling crafted weapons to a war.
// Uses crafting recipes and smuggling markups.
func WeaponProfit(w *WarMarket, recipe crafting.Recipe, quantity float64) float64 {
	baseCost := recipe.InputMetal * 10 // Metal cost
	sellPrice := baseCost * smuggling.ProfitMultiplier(smuggling.ContrabandWeapons)
	sellPrice *= DemandMultiplier(w)
	return (sellPrice - baseCost) * quantity
}

// DoubleDip returns profit from selling to BOTH sides.
// Risky but lucrative.
func DoubleDip(w *WarMarket, profitPerSide float64) float64 {
	total := profitPerSide * 2
	// 30% chance of getting caught double-dealing.
	// If caught, lose reputation with both.
	return total * 0.7 // Expected value
}

// IsWarActive checks if two sides are actually fighting.
// Uses diplomacy system.
func IsWarActive(sideA, sideB int) bool {
	// TODO: check actual war state when diplomacy tracks it.
	_ = diplomacy.System
	return false
}
