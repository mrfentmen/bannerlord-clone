// Package business handles player-owned enterprises.
//
// Businesses generate passive income. Types:
//   - Bar: steady income, gang hangout
//   - Garage: vehicle repairs, chop shop front
//   - Gun Store: weapons sales, needs license
//   - Warehouse: storage, smuggling front
package business

// BusinessType is the kind of enterprise.
type BusinessType string

const (
	BusinessBar       BusinessType = "bar"
	BusinessGarage    BusinessType = "garage"
	BusinessGunStore  BusinessType = "gun_store"
	BusinessWarehouse BusinessType = "warehouse"
	BusinessCasino    BusinessType = "casino"
)

// Business is a player-owned enterprise.
type Business struct {
	ID       int
	Name     string
	Type     BusinessType
	TownID   int
	OwnerID  int
	Level    int     // 1-3, higher is better
	Income   float64 // Daily income
	Upkeep   float64 // Daily costs
	Heat     float64 // Police attention from shady dealings
}

// DailyProfit returns net income.
func (b *Business) DailyProfit() float64 {
	return b.Income - b.Upkeep
}

// BaseIncome returns starting income by type.
func BaseIncome(t BusinessType) float64 {
	switch t {
	case BusinessBar:
		return 200
	case BusinessGarage:
		return 300
	case BusinessGunStore:
		return 500
	case BusinessWarehouse:
		return 150
	case BusinessCasino:
		return 800
	default:
		return 100
	}
}

// UpgradeCost returns cost to go up one level.
func UpgradeCost(level int) float64 {
	return float64(level*level) * 5000
}
