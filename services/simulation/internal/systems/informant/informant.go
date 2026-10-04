// Package informant handles spy networks.
//
// Builds on espionage (missions) and reputation (contacts).
// Informants provide ongoing intel about factions and towns.
package informant

import (
	"mbclone/simulation/internal/systems/espionage"
	"mbclone/simulation/internal/systems/reputation"
)

// Informant is a planted spy providing ongoing intel.
type Informant struct {
	ID        int
	TownID    int
	FactionID int
	Loyalty   float64 // 0-100, higher is more reliable
	Cover     float64 // 0-100, higher is less likely to be caught
}

// WeeklyCost returns upkeep for an informant.
func WeeklyCost() float64 {
	return 200
}

// IntelQuality returns the reliability of intel (0-1).
func IntelQuality(i *Informant) float64 {
	return (i.Loyalty + i.Cover) / 200
}

// DetectionRisk returns weekly chance of being caught.
func DetectionRisk(i *Informant, targetSecurity float64) float64 {
	return espionage.DetectionChance(espionage.MissionGatherIntel, targetSecurity) * (1 - i.Cover/200)
}

// CanRecruit checks if reputation allows planting informants.
func CanRecruit(standing float64) bool {
	// Need at least neutral to blend in.
	return standing > reputation.StandingHostile
}

// IntelTypes returns what an informant can report.
func IntelTypes() []string {
	return []string{
		"troop_movements",
		"town_defenses",
		"trade_prices",
		"faction_plans",
	}
}
