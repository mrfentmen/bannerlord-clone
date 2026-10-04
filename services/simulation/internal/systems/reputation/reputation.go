// Package reputation tracks faction standing.
//
// Actions affect how factions view the player.
// High reputation unlocks better contracts and prices.
// Low reputation means hostility and closed doors.
package reputation

// Standing thresholds.
const (
	StandingHated    = -50
	StandingHostile  = -25
	StandingNeutral  = 0
	StandingFriendly = 25
	StandingAllied   = 50
)

// Standing returns the relationship label.
func Standing(value float64) string {
	switch {
	case value <= StandingHated:
		return "hated"
	case value <= StandingHostile:
		return "hostile"
	case value < StandingFriendly:
		return "neutral"
	case value < StandingAllied:
		return "friendly"
	default:
		return "allied"
	}
}

// PriceMultiplier returns trade price adjustment.
// Friendly factions give better prices.
func PriceMultiplier(standing float64) float64 {
	// -10% to +10% based on standing.
	return 1.0 - (standing / 500)
}

// CanRecruit checks if faction allows recruitment.
func CanRecruit(standing float64) bool {
	return standing > StandingHostile
}

// CanEnterTown checks if faction allows town entry.
func CanEnterTown(standing float64) bool {
	return standing > StandingHated
}
