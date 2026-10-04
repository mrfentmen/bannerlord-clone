// Package bounty handles bounty hunting.
//
// Builds on police (wanted levels) and reputation (standing).
// Hunt wanted criminals for gold and reputation gains.
package bounty

import (
	"mbclone/simulation/internal/systems/police"
	"mbclone/simulation/internal/systems/reputation"
)

// Bounty is a wanted poster.
type Bounty struct {
	ID         int
	TargetName string
	Heat       float64 // How wanted they are
	Reward     float64
	FactionID  int     // Who posted it
	Dead       bool    // Dead or alive
}

// RewardFor calculates payout based on heat and dead/alive.
func RewardFor(heat float64, dead bool) float64 {
	base := heat * 50
	if dead {
		base *= 0.5 // Half for dead
	}
	return base
}

// ReputationGain returns standing improvement for completing a bounty.
func ReputationGain(heat float64) float64 {
	return heat / 10
}

// CanHunt checks if the hunter's standing allows taking bounties.
func CanHunt(standing float64) bool {
	return reputation.CanRecruit(standing)
}

// PoliceCut returns the fee police take from bounty rewards.
func PoliceCut(reward float64) float64 {
	return reward * 0.1
}

// DangerLevel returns the threat assessment.
// Higher heat targets are more dangerous.
func DangerLevel(heat float64) string {
	return police.PoliceResponse(heat)
}
