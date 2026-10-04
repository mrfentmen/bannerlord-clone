// Package syndicate handles crime families.
//
// Builds on gang (soldiers), protection (income), smuggling (goods),
// blackmarket (fencing). The ultimate criminal organization.
package syndicate

import (
	"mbclone/simulation/internal/systems/blackmarket"
	"mbclone/simulation/internal/systems/gang"
	"mbclone/simulation/internal/systems/protection"
	"mbclone/simulation/internal/systems/smuggling"
)

// Family is a crime syndicate.
type Family struct {
	Name       string
	Boss       string
	Gangs      []*gang.Gang
	Territory  int // Total blocks
	MonthlyCut float64
}

// TotalIncome sums all revenue streams.
func (f *Family) TotalIncome() float64 {
	total := 0.0
	// Gang turf income.
	for _, g := range f.Gangs {
		total += g.DailyIncome() * 30
	}
	// Protection rackets.
	// Smuggling profits.
	// Black market fencing.
	return total
}

// PowerRating returns the family's strength (0-100).
func (f *Family) PowerRating() float64 {
	soldiers := 0.0
	for _, g := range f.Gangs {
		soldiers += g.Members
	}
	power := soldiers/10 + float64(f.Territory)/5
	if power > 100 {
		power = 100
	}
	return power
}

// WarCost returns the cost of a gang war.
// Based on rival family power.
func WarCost(rival *Family) float64 {
	return rival.PowerRating() * 1000
}

// TakeoverChance returns probability of absorbing a smaller gang.
func TakeoverChance(f, target *Family) float64 {
	ratio := f.PowerRating() / (target.PowerRating() + 1)
	chance := ratio / (1 + ratio) // Logistic
	if chance > 0.95 {
		chance = 0.95
	}
	return chance
}

// MonthlyExpenses returns operating costs.
func (f *Family) MonthlyExpenses() float64 {
	soldiers := 0.0
	for _, g := range f.Gangs {
		soldiers += g.Members
	}
	// Pay soldiers, bribe cops, maintain fronts.
	return soldiers*300 + float64(f.Territory)*50
}

// NetProfit returns monthly take-home.
func (f *Family) NetProfit() float64 {
	return f.TotalIncome() - f.MonthlyExpenses()
}

// HeatLevel returns total police attention.
// Aggregates from all operations.
func (f *Family) HeatLevel() float64 {
	heat := 0.0
	for _, g := range f.Gangs {
		heat += g.Heat
	}
	// Smuggling and black market add more.
	heat += 20 // Base from illegal ops
	return heat
}

// CanLaunder checks if the family can clean money.
// Needs legitimate businesses as fronts.
func (f *Family) CanLaunder(businessCount int) bool {
	return businessCount >= 3
}

// LaunderRate returns the money laundering efficiency.
func LaunderRate(businessCount int) float64 {
	// More fronts = better laundering.
	rate := 0.5 + float64(businessCount)*0.1
	if rate > 0.95 {
		rate = 0.95
	}
	return rate
}

var _ = protection.WeeklyTake
var _ = smuggling.ProfitMultiplier
var _ = blackmarket.Markup
