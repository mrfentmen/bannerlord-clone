// Package corrupt handles crooked cops.
//
// Builds on police (cops), bounty (bribes), blackmarket (payoffs).
// Bribe cops to look the other way, or blackmail them.
package corrupt

import (
	"mbclone/simulation/internal/systems/blackmarket"
	"mbclone/simulation/internal/systems/bounty"
	"mbclone/simulation/internal/systems/police"
)

// Cop is a police officer who can be bought.
type Cop struct {
	ID        int
	Rank      string // patrol, detective, captain
	Corrupt   float64 // 0-100, higher is easier to bribe
	HeatKnown float64 // How much they know about you
}

// BribeCost returns the price to buy this cop.
func BribeCost(c *Cop) float64 {
	base := 1000.0
	switch c.Rank {
	case "detective":
		base = 5000
	case "captain":
		base = 20000
	}
	// More corrupt = cheaper.
	return base * (1 - c.Corrupt/200)
}

// HeatReduction returns how much heat a bribed cop clears.
func HeatReduction(c *Cop) float64 {
	// Higher rank clears more.
	switch c.Rank {
	case "detective":
		return 30
	case "captain":
		return 60
	default:
		return 15
	}
}

// BlackmailValue returns leverage value if you have dirt.
// Uses bounty rewards as a proxy for how valuable the dirt is.
func BlackmailValue(c *Cop, dirtHeat float64) float64 {
	return bounty.RewardFor(dirtHeat, false) * 0.5
}

// ProtectionCost returns ongoing payoff for black market ops.
func ProtectionCost(monthlyRevenue float64) float64 {
	// Cops take 10% off the top.
	return monthlyRevenue * 0.1
}

// CanBribe checks if the cop is bribable.
// Uses police response level - military can't be bribed.
func CanBribe(heat float64) bool {
	response := police.PoliceResponse(heat)
	return response != "military"
}

// FenceThroughCop returns black market access via crooked cops.
// Cops can move seized goods back to the street.
func FenceThroughCop(c *Cop, goodsValue float64) float64 {
	if c.Corrupt < 50 {
		return 0
	}
	return blackmarket.FenceValue(goodsValue) * 1.2 // Cops get better prices
}
