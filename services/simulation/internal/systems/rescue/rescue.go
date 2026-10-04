// Package rescue handles prison breaks.
//
// Players can break companions or allies out of jail.
// Success depends on party size, night time, and guard strength.
package rescue

// BreakoutPlan is a prison break attempt.
type BreakoutPlan struct {
	PrisonerID  string
	TownID      int
	PartyTroops float64
	GuardCount  float64
	IsNight     bool
}

// SuccessChance returns probability of a clean breakout.
func SuccessChance(p *BreakoutPlan) float64 {
	// Base 50%, modified by troop advantage and night.
	ratio := p.PartyTroops / (p.GuardCount + 1)
	chance := 0.3 + ratio*0.2
	if p.IsNight {
		chance += 0.2
	}
	if chance > 0.95 {
		chance = 0.95
	}
	if chance < 0.05 {
		chance = 0.05
	}
	return chance
}

// AlarmChance returns probability guards raise alarm.
func AlarmChance(p *BreakoutPlan) float64 {
	return 1 - SuccessChance(p)
}

// BribeCost returns cost to bribe guards instead.
func BribeCost(guardCount float64) float64 {
	return guardCount * 200
}
