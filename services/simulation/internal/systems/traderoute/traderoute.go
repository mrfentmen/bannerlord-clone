// Package traderoute handles automated caravan routes.
//
// Players can set up trade routes between towns.
// Caravans automatically buy low, travel, and sell high.
package traderoute

// Route is an automated trade circuit.
type Route struct {
	ID        int
	TownA     int
	TownB     int
	GoodID    string
	Quantity  float64
	ProfitPer float64 // Expected profit per trip
	TripsDone int
}

// TripProfit calculates profit for one run.
func (r *Route) TripProfit(buyPrice, sellPrice float64) float64 {
	return (sellPrice - buyPrice) * r.Quantity
}

// IsProfitable checks if the route makes money.
func (r *Route) IsProfitable(buyPrice, sellPrice, travelCost float64) bool {
	return r.TripProfit(buyPrice, sellPrice) > travelCost
}

// Efficiency returns profit per day.
func (r *Route) Efficiency(profitPerTrip, daysPerTrip float64) float64 {
	if daysPerTrip <= 0 {
		return 0
	}
	return profitPerTrip / daysPerTrip
}
