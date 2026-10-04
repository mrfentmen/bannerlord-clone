// Package smuggling handles illegal goods trade.
//
// Builds on police (evade cops), traderoute (routes),
// and business (warehouse fronts).
// High profit, high risk.
package smuggling

import (
	"mbclone/simulation/internal/systems/police"
	"mbclone/simulation/internal/systems/traderoute"
)

// Contraband types.
const (
	ContrabandDrugs   = "drugs"
	ContrabandWeapons = "weapons"
	ContrabandLiquor  = "liquor"
)

// ProfitMultiplier returns the markup for contraband vs legal goods.
func ProfitMultiplier(contraband string) float64 {
	switch contraband {
	case ContrabandDrugs:
		return 5.0
	case ContrabandWeapons:
		return 3.0
	case ContrabandLiquor:
		return 2.0
	default:
		return 1.5
	}
}

// DetectionChance returns probability of getting caught.
// Based on police response level and route heat.
func DetectionChance(heat float64, hasWarehouse bool) float64 {
	base := 0.3
	// Higher heat areas have more cops.
	response := police.PoliceResponse(heat)
	switch response {
	case "military", "swat":
		base = 0.6
	case "patrol":
		base = 0.4
	}
	if hasWarehouse {
		base *= 0.5 // Front business hides the operation
	}
	return base
}

// HeatGain returns police heat from a smuggling run.
func HeatGain(contraband string) float64 {
	return police.CrimeHeat("smuggling") * ProfitMultiplier(contraband)
}

// RouteProfit calculates expected profit accounting for risk.
func RouteProfit(route *traderoute.Route, contraband string, buyPrice, sellPrice float64) float64 {
	legal := route.TripProfit(buyPrice, sellPrice)
	return legal * ProfitMultiplier(contraband)
}
