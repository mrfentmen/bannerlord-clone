// Package caravanguard handles hired protection.
//
// Builds on mercenary (contracts), traderoute (routes),
// and bandit (threats). Hire guards to protect trade routes.
package caravanguard

import (
	"mbclone/simulation/internal/systems/mercenary"
	"mbclone/simulation/internal/systems/traderoute"
)

// GuardContract is protection for a trade route.
type GuardContract struct {
	RouteID    int
	Guards     float64 // Number of guards
	DailyCost  float64
	Route      *traderoute.Route
	Mercenary  *mercenary.Contract
}

// DailyCostFor calculates guard wages.
func DailyCostFor(guards float64) float64 {
	return guards * 10 // 10 gold per guard per day
}

// ProtectionValue returns effective defense strength.
func ProtectionValue(guards float64, avgLevel int) float64 {
	// Higher level guards are more effective.
	return guards * (1 + float64(avgLevel)*0.1)
}

// IsProtected checks if guards can handle a bandit threat.
func IsProtected(guardStrength, banditStrength float64) bool {
	return guardStrength >= banditStrength*1.2 // 20% margin
}

// RouteRisk returns the danger level for an unguarded route.
// Based on bandit activity in the area.
func RouteRisk(banditCount int) string {
	switch {
	case banditCount == 0:
		return "safe"
	case banditCount < 3:
		return "low"
	case banditCount < 10:
		return "medium"
	default:
		return "high"
	}
}
