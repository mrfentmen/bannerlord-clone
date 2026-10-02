// Package caravan implements player-owned trade caravans (Tier 6).
//
// Caravans are mobile trading operations. The player buys a caravan,
// assigns it a home town, and it automatically travels between towns
// buying goods cheap and selling them dear. This is the Bannerlord
// caravan loop: passive income that requires upfront capital and
// carries risk.
//
// Mechanics:
// - Purchase cost: 15,000 gold (configurable)
// - Capacity: 300 units of goods
// - Speed: travels along the road network
// - AI: picks the most profitable buy/sell pair within range
// - Risk: bandits can attack; guards reduce risk
// - Upkeep: guards and animals cost gold per day
//
// The caravan system integrates with the market (affects local prices
// through buy/sell volume) and the rumour system (profitable routes
// the caravan uses could be surfaced as rumours).
package caravan

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the caravan system.
func System() sim.System {
	return sim.System{
		Name: "caravan",
		Doc:  "player-owned trade caravans: automated buy-low/sell-high income",
		Runs: run,
	}
}

// Caravan economics (tunable).
const (
	caravanCapacity = 300.0
	caravanSpeed    = 40.0 // km per day
	guardUpkeep     = 2.0  // gold per guard per day
	animalUpkeep    = 1.0  // gold per animal per day
)

func run(v *sim.View, w *sim.WriteSet) {
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil {
			continue
		}
		// Caravans are parties with the Caravan flag set.
		if !p.IsCaravan {
			continue
		}

		read := shared.ReadString(
			shared.Pair("party", float64(pid)),
		)
		causes := v.Log.RecentFor(model.KindParty, pid, []string{"caravan_gold"}, 2)

		// Upkeep: guards and pack animals cost money.
		upkeep := float64(p.CaravanGuards)*guardUpkeep + float64(p.CaravanAnimals)*animalUpkeep
		if upkeep > 0 {
			w.Add(model.KindParty, pid, "caravan_gold", -upkeep,
				read, causes, "caravan upkeep: guards and animals")
		}

		// If the caravan is at a town, trade.
		if p.CaravanAtTown >= 0 {
			town := v.State.Towns[p.CaravanAtTown]
			if town != nil {
				tradeAtTown(v, w, p, town, read, causes)
			}
		}

		// Movement: if en route, advance toward destination.
		if p.CaravanDestTown >= 0 && p.CaravanAtTown != p.CaravanDestTown {
			advanceCaravan(v, w, p, read, causes)
		}

		// Bandit risk: caravans in dangerous areas can be attacked.
		// Risk scales inversely with guards.
		if p.CaravanGuards < 10 {
			risk := 0.02 * (1 - float64(p.CaravanGuards)/10.0)
			// Deterministic check using party ID and tick.
			tick := v.State.Tick
			if float64((pid*7919+tick*104729)%1000)/1000.0 < risk {
				// Bandit attack: lose some goods.
				loss := p.CaravanCargo * 0.2
				w.Add(model.KindParty, pid, "caravan_cargo", -loss,
					read, causes, "caravan ambushed by bandits: goods stolen")
			}
		}
	}
}

// tradeAtTown handles buying/selling when a caravan is at a town.
func tradeAtTown(v *sim.View, w *sim.WriteSet, p *model.Party, town *model.Town, read string, causes []int) {
	// Simple strategy: if cargo is empty, buy the cheapest good.
	// If cargo is full, sell everything.
	// Otherwise, continue to destination.

	if p.CaravanCargo <= 0 {
		// Find cheapest good at this town.
		cheapest, price := cheapestGood(town)
		if cheapest != "" && price > 0 {
			// Buy as much as we can afford and can carry.
			affordable := p.CaravanGold / price
			buyAmount := minFloat(affordable, caravanCapacity)
			if buyAmount > 0 {
				cost := buyAmount * price
				w.Add(model.KindParty, p.ID, "caravan_gold", -cost,
					read, causes, "caravan buys "+cheapest)
				w.Add(model.KindParty, p.ID, "caravan_cargo", buyAmount,
					read, causes, "caravan loads "+cheapest)
				w.Set(model.KindParty, p.ID, "caravan_cargo_type", hashGood(cheapest),
					read, causes, "caravan cargo type set")
				// Pick destination: town with highest price for this good.
				dest := bestSellTown(v, p, cheapest)
				if dest >= 0 {
					w.Set(model.KindParty, p.ID, "caravan_dest_town", float64(dest),
						read, causes, "caravan sets course for "+townName(v, dest))
				}
			}
		}
	} else if p.CaravanCargo >= caravanCapacity*0.9 {
		// Sell everything.
		good := unhashGood(p.CaravanCargoType)
		price := goodPrice(town, good)
		if price > 0 {
			revenue := p.CaravanCargo * price
			w.Add(model.KindParty, p.ID, "caravan_gold", revenue,
				read, causes, "caravan sells "+good)
			w.Set(model.KindParty, p.ID, "caravan_cargo", 0,
				read, causes, "caravan unloads cargo")
		}
	}
}

// advanceCaravan moves the caravan toward its destination.
func advanceCaravan(v *sim.View, w *sim.WriteSet, p *model.Party, read string, causes []int) {
	dest := v.State.Towns[p.CaravanDestTown]
	current := v.State.Towns[p.CaravanAtTown]
	if dest == nil || current == nil {
		return
	}
	// Calculate distance (simplified: Euclidean).
	dx := dest.X - current.X
	dy := dest.Y - current.Y
	dist := sqrt(dx*dx + dy*dy)

	if dist <= caravanSpeed {
		// Arrived.
		w.Set(model.KindParty, p.ID, "caravan_at_town", float64(p.CaravanDestTown),
			read, causes, "caravan arrives at "+dest.Name)
	} else {
		// Move proportionally (abstract: we just track progress).
		// In a full implementation, this would update coordinates.
		progress := caravanSpeed / dist
		w.Add(model.KindParty, p.ID, "caravan_progress", progress,
			read, causes, "caravan travels toward "+dest.Name)
	}
}

// cheapestGood finds the cheapest trade good at a town.
func cheapestGood(t *model.Town) (string, float64) {
	goods := map[string]float64{
		"food":     t.PriceFood,
		"medicine": t.PriceMedicine,
		"metal":    t.PriceMetal,
	}
	best := ""
	bestPrice := 1e9
	for good, price := range goods {
		if price > 0 && price < bestPrice {
			best = good
			bestPrice = price
		}
	}
	if bestPrice >= 1e9 {
		return "", 0
	}
	return best, bestPrice
}

// goodPrice returns the price of a good at a town.
func goodPrice(t *model.Town, good string) float64 {
	switch good {
	case "food":
		return t.PriceFood
	case "medicine":
		return t.PriceMedicine
	case "metal":
		return t.PriceMetal
	}
	return 0
}

// bestSellTown finds the town with the highest price for a good.
func bestSellTown(v *sim.View, p *model.Party, good string) int {
	best := -1
	bestPrice := 0.0
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil || id == p.CaravanAtTown {
			continue
		}
		price := goodPrice(t, good)
		if price > bestPrice {
			best = id
			bestPrice = price
		}
	}
	return best
}

func townName(v *sim.View, id int) string {
	if t := v.State.Towns[id]; t != nil {
		return t.Name
	}
	return "unknown"
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func sqrt(x float64) float64 {
	// Newton's method.
	if x <= 0 {
		return 0
	}
	z := x
	for i := 0; i < 10; i++ {
		z = z - (z*z-x)/(2*z)
	}
	return z
}

// hashGood converts a good name to a float for storage.
func hashGood(good string) float64 {
	switch good {
	case "food":
		return 1
	case "medicine":
		return 2
	case "metal":
		return 3
	}
	return 0
}

// unhashGood converts back.
func unhashGood(h float64) string {
	switch int(h) {
	case 1:
		return "food"
	case 2:
		return "medicine"
	case 3:
		return "metal"
	}
	return ""
}
