// Package logistics runs caravans along real routes and delivers the goods
// they carry.
//
// Reads route safety, route length, terrain, and each town's surplus and need,
// and writes arriving cargo, route traffic, and the income a delivered caravan
// earns. It is the delivery mechanism for chain 3: when a road is unsafe, a
// caravan is attacked, and "a robbed caravan writes nothing into the
// destination stocks" per CAUSE_EFFECT.md section 3. That single sentence is
// what makes chain 3 reach chains 1 and 2.
package logistics

import (
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/security"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the logistics system.
func System() sim.System {
	return sim.System{
		Name: "logistics",
		Doc:  "moves food, medicine, and metal along routes; a robbed caravan delivers nothing",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg

	// --- caravans already in transit ---
	// A caravan moves along its route, consuming its animals' food, losing a
	// little of its cargo to spoilage, and being at risk the whole way. Its
	// cargo is staged into arriving_* fields, which the town reads when the
	// caravan lands. Staging rather than writing to the town directly keeps the
	// two systems decoupled: logistics never calls anything.
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if !p.IsCaravan {
			continue
		}
		// The destination town.
		dest := v.State.Towns[p.DestTown]
		if dest == nil || p.DestTownParty < 0 {
			// A caravan with nowhere to go is a broken instruction, not a
			// simulation state. Removing it is the honest response.
			w.DeleteEntity(model.KindParty, pid)
			continue
		}
		// Find the route it is on: the one joining its origin to its
		// destination, or the nearest if it has already left its origin.
		route := routeBetween(v, p.HomeTown, p.DestTown)
		speed := c.Logistic.SpeedPerDay
		safety := 1.0
		terrain := 0.0
		if route >= 0 {
			r := v.State.Routes[route]
			speed *= 1 - c.Logistic.SafetySpeedWeight*(1-shared.Clamp01(r.Safety))
			terrain = security.TerrainRoughness(r.Terrain)
			speed *= 1 - c.Logistic.TerrainSpeedWeight*terrain
			safety = r.Safety
			// Traffic: a busy road attracts more bandits, so a caravan both
			// increases and suffers from traffic.
			w.Add(model.KindRoute, route, "route_traffic", 1,
				shared.PairF("caravan", p.Troops), nil, "caravan on the road")
		}

		// Move. The caravan is at a position between two towns; each tick it
		// covers distance until it arrives.
		p.Distance -= speed
		w.Add(model.KindParty, pid, "party_food", -c.Logistic.CaravanFoodNeed,
			shared.PairF("speed", speed), nil, "caravan animals and guards eat")

		// Spoilage in transit without cold storage, per ECONOMY.md section 3.
		spoiledFood := p.CargoFood * c.Logistic.SpoilagePerDay
		spoiledMed := p.CargoMedicine * c.Logistic.SpoilagePerDay
		spoiledMetal := p.CargoMetal * c.Logistic.SpoilagePerDay
		w.Add(model.KindParty, pid, "cargo_food", -spoiledFood,
			shared.PairF("spoilage", spoiledFood), nil, "")
		w.Add(model.KindParty, pid, "cargo_medicine", -spoiledMed,
			shared.PairF("spoilage", spoiledMed), nil, "")
		w.Add(model.KindParty, pid, "cargo_metal", -spoiledMetal,
			shared.PairF("spoilage", spoiledMetal), nil, "")

		// The attack. A safe road nearly eliminates the risk; an unsafe one
		// makes a caravan a target. This is chain 3's moment: the medicine and
		// food stop arriving.
		robChance := shared.Clamp01(c.Security.RobChanceBase * (1 - shared.Clamp01(safety)*c.Security.RobChanceSafetyWeight))
		if v.Rng.Chance(robChance) {
			// The cargo is taken. Nothing is staged into the destination, which
			// is the whole point: a robbed caravan writes nothing into the
			// destination's stocks (CAUSE_EFFECT.md section 3).
			lost := p.CargoFood + p.CargoMedicine + p.CargoMetal
			casualties := p.Troops * c.Logistic.CaravanRiskDeath
			w.Set(model.KindParty, pid, "cargo_food", 0,
				"robbed on the road", nil, "caravan robbed")
			w.Set(model.KindParty, pid, "cargo_medicine", 0,
				"robbed on the road", nil, "caravan robbed")
			w.Set(model.KindParty, pid, "cargo_metal", 0,
				"robbed on the road", nil, "caravan robbed")
			w.Add(model.KindParty, pid, "troops", -casualties,
				"robbed on the road", nil, "guards killed")
			// A town starved of trade resents whoever should have protected
			// the road. This is the political cost of chain 3.
			w.Add(model.KindTown, dest.ID, "pressure", c.Logistic.CaravanLossUnrest*lost,
				"caravan robbed", nil, "trade lost to robbery")
			w.DeleteEntity(model.KindParty, pid)
			continue
		}

		// Arrival. The cargo is staged into the destination's arriving fields,
		// which the food and disease systems read.
		if p.Distance <= 0 {
			w.Add(model.KindTown, dest.ID, "arriving_cargo_food", p.CargoFood,
				"caravan arrived", v.Log.RecentFor(model.KindTown, dest.ID, []string{"food_stock", "food_days"}, 2), "food delivered")
			w.Add(model.KindTown, dest.ID, "arriving_cargo_medicine", p.CargoMedicine,
				"caravan arrived", v.Log.RecentFor(model.KindTown, dest.ID, []string{"medicine_stock"}, 2), "medicine delivered")
			w.Add(model.KindTown, dest.ID, "arriving_cargo_metal", p.CargoMetal,
				"caravan arrived", nil, "metal delivered")
			// The profit. Trade is worth doing only if it pays, which is why
			// the economy of the roads matters as much as their safety.
			profit := (p.CargoFood + p.CargoMedicine*c.World.MedicinePerCapita*40 + p.CargoMetal*4) * c.Logistic.TradeMargin
			w.Add(model.KindTown, dest.ID, "money", profit,
				"caravan arrived", nil, "trade profit")
			w.DeleteEntity(model.KindParty, pid)
		}
	}

	// --- dispatch new caravans ---
	// A town with a surplus and a neighbour with a shortage sends a caravan.
	// Dispatch is decided from shared state only, and a new caravan is spawned
	// as a party the next stage of the tick can move.
	spawnID := v.State.IDValue(model.IDParty)
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		a, b := v.State.Towns[r.TownA], v.State.Towns[r.TownB]
		if a == nil || b == nil {
			continue
		}
		// Only if the road can carry it: a blocked road carries nothing, which
		// is chain 8's mechanism at the route level.
		if r.Blocked {
			continue
		}
		// Send from the town that has a surplus toward the town that needs one.
		// Which direction is chosen by comparing the two, and the comparison is
		// symmetric, so a pair cannot bias toward whichever town has the
		// lower id.
		forward := a.FoodStock > a.FoodDemand*foodRatio(c) && b.FoodStock < b.FoodDemand*foodRatio(c)
		backward := b.FoodStock > b.FoodDemand*foodRatio(c) && a.FoodStock < a.FoodDemand*foodRatio(c)
		if !forward && !backward {
			continue
		}
		origin, target := a, b
		if backward {
			origin, target = b, a
		}
		// Enough surplus to be worth the trip, and a road safe enough that the
		// caravan might arrive. Merchants are not suicidal, which is why a
		// collapsed road stops all trade rather than only making it loss-making.
		surplus := origin.FoodStock - origin.FoodDemand*foodRatio(c)
		if surplus < c.Logistic.MinSurplusForCaravan {
			continue
		}
		if r.Safety < c.Logistic.MinSafetyToDispatch {
			continue
		}
		// Cap the number of caravans in flight, so a rich town does not flood
		// the roads.
		if r.Traffic >= c.Logistic.MaxCaravansPerRoute {
			continue
		}
		amount := surplus * c.Logistic.DispatchShare
		if amount > c.Logistic.CaravanCapacity {
			amount = c.Logistic.CaravanCapacity
		}
		caravan := &model.Party{
			Name:          "Caravan from " + origin.Name,
			SideID:        origin.HolderSide,
			X:             origin.X,
			Y:             origin.Y,
			HomeTown:      origin.ID,
			DestTown:      target.ID,
			DestTownParty: -1,
			Troops:        c.Logistic.CaravanGuards,
			Food:          c.Logistic.CaravanFoodNeed * c.Logistic.CaravanFoodDays,
			// The cargo split is computed before the party is built, so the
			// shares add to the load. A caravan that was only ever food would
			// make chain 3's medicine caravans impossible to rob, and chain 3 is
			// specifically about medicine that fails to arrive.
			IsCaravan: true,
			Activity:  model.ActTrading,
			Morale:    0.8,
			// The initial distance is the road length; the caravan walks it.
			Distance: r.Length,
		}
		caravan.CargoMedicine = amount * c.Logistic.MedicineShare
		caravan.CargoMetal = amount * c.Logistic.MetalShare
		caravan.CargoFood = amount - caravan.CargoMedicine - caravan.CargoMetal
		// The goods leave the origin now. The arrival is what logistics stages
		// when the caravan lands, so a caravan that is robbed delivers nothing
		// while its origin has already paid for it: that is the actual cost of
		// an unsafe road, and it is why merchants demand safe roads.
		w.Add(model.KindTown, origin.ID, "food_stock", -caravan.CargoFood,
			"caravan dispatched",
			v.Log.RecentFor(model.KindTown, origin.ID, []string{"food_stock"}, 2), "goods loaded")
		w.Add(model.KindTown, origin.ID, "medicine_stock", -caravan.CargoMedicine,
			"caravan dispatched",
			v.Log.RecentFor(model.KindTown, origin.ID, []string{"medicine_stock"}, 2), "goods loaded")
		w.Add(model.KindTown, origin.ID, "metal", -caravan.CargoMetal,
			"caravan dispatched", nil, "goods loaded")
		w.SpawnParty(caravan)
		spawnID++
	}
}

// foodRatio is the buffer in days a town treats as comfortable. A town above
// it has a surplus worth selling; a town below it has a reason to buy. It is
// deliberately not the merchant's own target stock, because a merchant holding
// less than usual is a sign of hardship, and this is a trade trigger, not a
// welfare measure.
func foodRatio(c *config.Config) float64 { return c.Market.StockTargetDays * 0.5 }

// routeBetween returns the route joining two towns, or -1 if they are not
// directly connected. A caravan only travels along a real road: it does not cut
// across country, because MARCH_AND_WAR.md section 1 is explicit that distance
// is along roads.
func routeBetween(v *sim.View, a, b int) int {
	if a < 0 || b < 0 {
		return -1
	}
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if (r.TownA == a && r.TownB == b) || (r.TownA == b && r.TownB == a) {
			return rid
		}
	}
	return -1
}
