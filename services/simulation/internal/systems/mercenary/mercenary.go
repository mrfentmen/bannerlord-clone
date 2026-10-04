// Package mercenary handles contract work for factions.
//
// Mercenaries sign contracts with factions to fight their wars.
// Contracts pay a retainer plus per-battle bonuses. Breaking a
// contract early damages reputation.
package mercenary

// Contract is a mercenary agreement.
type Contract struct {
	ID         int
	FactionID  int
	PartyID    int
	Retainer   float64 // Daily pay
	PerBattle  float64 // Bonus per battle fought
	DaysLeft   int
	BattlesWon int
}

// DailyPay returns today's wages.
func (c *Contract) DailyPay() float64 {
	return c.Retainer
}

// BattleBonus returns bonus for winning a battle.
func (c *Contract) BattleBonus(won bool) float64 {
	if won {
		return c.PerBattle
	}
	return c.PerBattle * 0.2 // Participation fee
}

// BreakPenalty returns reputation damage for early termination.
func BreakPenalty(daysLeft int) float64 {
	return float64(daysLeft) * 0.5
}

// ContractValue estimates total worth.
func (c *Contract) ContractValue() float64 {
	return c.Retainer*float64(c.DaysLeft) + c.PerBattle*5
}
