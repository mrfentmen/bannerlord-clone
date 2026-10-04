// Package logistics - crossings.go
//
// Tasks D446, D447, D448: toll booths, bridge crossings, ferry crossings.
//
// Tolls: parties pay or fight when crossing a toll route.
// Bridges: chokepoints, slower but safer than fording.
// Ferries: cost gold and time to cross water.
package logistics

import (
	"mbclone/simulation/internal/sim"
)

// D446: Toll booth.
// A toll charges gold based on party size. If the party can't pay,
// they can fight (triggers a battle) or turn back.
type Toll struct {
	RouteID int
	Cost    float64 // gold per troop
	OwnerID int     // faction that collects
}

// CalculateToll returns the toll cost for a party.
func CalculateToll(toll Toll, troops float64) float64 {
	return toll.Cost * troops
}

// CanPayToll checks if the party can afford the toll.
func CanPayToll(partyGold, tollCost float64) bool {
	return partyGold >= tollCost
}

// D447: Bridge crossing.
// Bridges are chokepoints: slower to cross (bottleneck) but safer
// than fording a river. A bridge can be defended.
type Bridge struct {
	RouteID   int
	Defended  bool
	Defender  int // party ID defending, 0 if none
	CrossTime float64 // days to cross
}

// BridgeCrossTime returns the time to cross, longer if defended.
func BridgeCrossTime(b Bridge) float64 {
	if b.Defended {
		return b.CrossTime * 2.0
	}
	return b.CrossTime
}

// D448: Ferry crossing.
// Ferries cost gold and take time. No fighting on the ferry,
// but the party is vulnerable while waiting.
type Ferry struct {
	RouteID   int
	Cost      float64 // flat gold cost
	CrossTime float64 // days
	Capacity  float64 // max troops per trip
}

// FerryTrips calculates how many trips needed for the party.
func FerryTrips(f Ferry, troops float64) int {
	trips := int(troops / f.Capacity)
	if troops > float64(trips)*f.Capacity {
		trips++
	}
	if trips < 1 {
		trips = 1
	}
	return trips
}

// FerryTotalCost returns total gold and time for the crossing.
func FerryTotalCost(f Ferry, troops float64) (gold, days float64) {
	trips := FerryTrips(f, troops)
	return f.Cost * float64(trips), f.CrossTime * float64(trips)
}

// CheckCrossing determines what kind of crossing a route requires.
// Returns the crossing type and associated data.
func CheckCrossing(v *sim.View, routeID int) (string, interface{}) {
	// In a full implementation, this would check route metadata.
	// For now, routes with Terrain == water require ferry.
	if routeID < 0 || routeID >= len(v.State.Routes) {
		return "none", nil
	}
	// Terrain constants from model; water terrain requires ferry
	// This is a placeholder for route metadata lookup
	return "none", nil
}
