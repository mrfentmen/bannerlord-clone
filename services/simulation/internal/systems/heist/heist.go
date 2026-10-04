// Package heist handles planned robberies.
//
// Builds on blackmarket (fencing), gang (crew), rescue (getaway).
// Plan heists, assemble crews, execute, fence the loot.
package heist

import (
	"mbclone/simulation/internal/systems/blackmarket"
	"mbclone/simulation/internal/systems/gang"
	"mbclone/simulation/internal/systems/rescue"
)

// Heist is a planned robbery.
type Heist struct {
	ID         int
	Target     string // Bank, casino, warehouse
	CrewSize   int
	CrewSkill  float64 // Average skill 1-10
	PlanDays   int
	LootValue  float64
}

// PlanQuality returns the heist plan rating (0-1).
func PlanQuality(h *Heist) float64 {
	// More planning = better odds, diminishing returns.
	return 1 - 1/(1+float64(h.PlanDays)/7)
}

// SuccessChance returns probability of a clean heist.
func SuccessChance(h *Heist, security float64) float64 {
	plan := PlanQuality(h)
	skill := h.CrewSkill / 10
	base := (plan + skill) / 2
	// Security reduces odds.
	base -= security / 200
	if base < 0.05 {
		base = 0.05
	}
	if base > 0.95 {
		base = 0.95
	}
	return base
}

// FenceLoot returns what the loot sells for on black market.
func FenceLoot(h *Heist) float64 {
	return blackmarket.FenceValue(h.LootValue)
}

// CrewCut returns each member's share.
func CrewCut(h *Heist) float64 {
	fenced := FenceLoot(h)
	return fenced / float64(h.CrewSize+1) // +1 for the planner
}

// GetawayChance returns probability of clean escape.
// Uses rescue system for breakout mechanics.
func GetawayChance(h *Heist, policeResponse float64) float64 {
	plan := &rescue.BreakoutPlan{
		PartyTroops: float64(h.CrewSize * 2),
		GuardCount:  policeResponse,
		IsNight:     true, // Heists happen at night
	}
	return rescue.SuccessChance(plan)
}

// GangBackup returns bonus from gang support.
func GangBackup(g *gang.Gang) float64 {
	return float64(g.Members) / 100
}
