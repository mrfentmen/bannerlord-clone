// Package protection handles extortion rackets.
//
// Builds on gang (turf), business (targets), and police (heat).
// Extort businesses for protection money. Too much heat brings cops.
package protection

import (
	"mbclone/simulation/internal/systems/business"
	"mbclone/simulation/internal/systems/gang"
	"mbclone/simulation/internal/systems/police"
)

// Racket is an active extortion operation.
type Racket struct {
	BusinessID int
	GangID     int
	WeeklyTake float64
	PaidUp     bool
}

// WeeklyTake calculates extortion amount.
// Based on business income and gang intimidation.
func WeeklyTake(b *business.Business, gangMembers float64) float64 {
	base := b.Income * 0.2 // 20% of income
	// Bigger gangs extort more.
	multiplier := 1 + gangMembers/200
	return base * multiplier
}

// RefusalChance returns probability the business refuses to pay.
// Based on their income (can afford guards) vs gang strength.
func RefusalChance(b *business.Business, gangMembers float64) float64 {
	// Rich businesses hire security.
	security := b.Income / 1000
	threat := gangMembers / 50
	chance := security - threat
	if chance < 0.05 {
		return 0.05
	}
	if chance > 0.8 {
		return 0.8
	}
	return chance
}

// HeatGain returns police attention from extortion.
func HeatGain() float64 {
	return police.CrimeHeat("robbery")
}

// TurfBonus returns income multiplier for controlling the block.
// Uses gang turf to boost extortion efficiency.
func TurfBonus(g *gang.Gang) float64 {
	return 1 + float64(g.TurfBlocks)/100
}
