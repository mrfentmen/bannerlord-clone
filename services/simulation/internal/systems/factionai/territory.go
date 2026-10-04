// Package factionai - territory.go
//
// Tasks D451, D452, D454, D455: territory assignment, border calculation,
// capital designation, faction strength calculation.
package factionai

import (
	"math"

	"mbclone/simulation/internal/sim"
)

// D451: Assign settlements to factions.
// Each settlement is assigned to the nearest faction capital,
// or the faction that already controls the most nearby settlements.
func AssignSettlementToFaction(v *sim.View, settlementID int) int {
	s, ok := v.State.Towns[settlementID]
	if !ok {
		return 0
	}
	bestFaction := 0
	bestScore := math.Inf(-1)
	for sid, side := range v.State.Sides {
		// Score based on existing control and distance
		score := 0.0
		// Count settlements already owned nearby
		for tid, town := range v.State.Towns {
			if town.SideID == sid {
				dx := town.X - s.X
				dy := town.Y - s.Y
				dist := math.Sqrt(dx*dx + dy*dy)
				if dist < 100 { // within 100 units
					score += 1.0 / (1.0 + dist/10.0)
				}
			}
			_ = tid
		}
		// Prefer factions with fewer settlements (balance)
		score -= float64(side.Towns) * 0.1
		if score > bestScore {
			bestScore = score
			bestFaction = sid
		}
	}
	return bestFaction
}

// D452: Border calculation.
// A settlement is on the border if it has a neighboring settlement
// owned by a different faction within borderRange.
func IsBorderSettlement(v *sim.View, settlementID int, borderRange float64) bool {
	s, ok := v.State.Towns[settlementID]
	if !ok {
		return false
	}
	for tid, town := range v.State.Towns {
		if tid == settlementID {
			continue
		}
		if town.SideID != s.SideID {
			dx := town.X - s.X
			dy := town.Y - s.Y
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist < borderRange {
				return true
			}
		}
	}
	return false
}

// D454: Capital designation.
// The capital is the most populous settlement owned by the faction.
// If no settlement, returns 0.
func DesignateCapital(v *sim.View, sideID int) int {
	bestTown := 0
	bestPop := 0.0
	for tid, town := range v.State.Towns {
		if town.SideID == sideID && town.Population > bestPop {
			bestPop = town.Population
			bestTown = tid
		}
	}
	return bestTown
}

// D455: Faction strength calculation.
// Strength = troops + (prosperity * population factor) + treasury factor.
// Used by AI to decide when to expand, defend, or seek peace.
func CalculateStrength(v *sim.View, sideID int) float64 {
	side, ok := v.State.Sides[sideID]
	if !ok {
		return 0
	}
	// Military strength: total troops across all parties
	troops := 0.0
	for _, p := range v.State.Parties {
		if p.SideID == sideID {
			troops += p.Troops
		}
	}
	// Economic strength: treasury + (towns * avg prosperity)
	economic := side.Treasury + side.Towns*1000
	// Population factor
	popFactor := side.Population / 10000.0
	if popFactor > 10 {
		popFactor = 10
	}
	return troops + economic/100.0 + popFactor*500
}
