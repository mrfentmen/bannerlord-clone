// Package supply keeps an army fed from friendly towns, and marks it starving
// when it cannot be.
//
// Reads army food stocks, the food and distance of the nearest friendly towns,
// and route safety, and writes army food, the starving flag, and morale. It is
// the mechanism that decides whether a ruler can campaign at all, per
// MARCH_AND_WAR.md section 2, and it is the reason the home garrison thins in
// chain 6: an army that resupplies at home is an army that took the garrison
// with it.
package supply

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the supply system.
func System() sim.System {
	return sim.System{
		Name: "supply",
		Doc:  "feeds an army from friendly towns, and marks it starving when it cannot be",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Troops <= 0 {
			continue
		}
		// Caravans carry their own supplies and resupply themselves; an army
		// does not. Mixing them would mean a merchant's larder paying for a
		// campaign, which is not how any of this works.
		if p.IsCaravan || p.IsRaider {
			continue
		}

		// --- how long does the larder last ---
		// Days of food is the number the player sees, and it is what a ruler
		// checks before setting out (RULERS.md section 5, and the
		// supply_check_food constant that the ruler AI uses to decide).
		dailyNeed := p.Troops * c.March.FoodPerTroop
		if !underway(p.Activity) {
			dailyNeed = p.Troops * c.March.StationaryFoodRate * c.Food.PersonDaysPerPersonDay
		}
		daysFood := shared.SafeDiv(p.Food, dailyNeed)
		w.Set(model.KindParty, pid, "days_food", daysFood,
			shared.ReadString(
				shared.PairF("food", p.Food),
				shared.PairF("daily_need", dailyNeed)),
			v.Log.RecentFor(model.KindParty, pid, []string{"party_food", "troops"}, 3), "days of food")

		// --- resupply ---
		// The nearest friendly town that has food to give. Friendly means the
		// army's own side, and it must be close enough to matter: an army deep
		// in enemy country with no friendly town nearby is exactly the
		// situation chain 6 requires.
		bestTown := -1
		bestDist := 0.0
		for _, tid := range v.State.TownIDs() {
			t := v.State.Towns[tid]
			if t.HolderSide != p.SideID || t.HolderSide < 0 {
				continue
			}
			// A besieged town cannot supply anyone, which is why a blockade or a
			// siege can genuinely starve an army rather than just inconvenience
			// it.
			if t.IsBesieged {
				continue
			}
			// A blockaded town has no trade route to bring food in, so it
			// cannot supply an army either. This is chain 8's military
			// consequence.
			if t.Blockade > c.Supply.BlockadeBlockSupply {
				continue
			}
			d := v.State.DistanceTo(p, tid)
			if d > c.Supply.ResupplyRangeLeagues {
				continue
			}
			if bestTown < 0 || d < bestDist {
				bestTown, bestDist = tid, d
			}
		}
		// Record how far the nearest supply is, because the supply system and
		// the attrition system both need it and neither may ask the other.
		nearest := 0.0
		if bestTown >= 0 {
			nearest = bestDist
		} else {
			// Nothing reachable: the army is as far from supply as the map
			// allows, which is the honest encoding of "no supply line".
			nearest = c.Supply.ResupplyRangeLeagues * 2
		}
		w.Set(model.KindParty, pid, "supply_distance", nearest,
			shared.PairF("nearest_friendly", bestDist), nil, "distance to supply")

		// Take what the town can spare. A town keeps a reserve for itself, so
		// a ruler cannot strip his own capital to feed a campaign.
		if bestTown >= 0 {
			t := v.State.Towns[bestTown]
			available := t.FoodStock - t.FoodDemand*c.Supply.HomeStockReserve
			if available > 0 {
				// Distance and road safety both reduce what actually arrives.
				delivered := available * c.Supply.ResupplyFraction *
					(1 - c.Supply.ResupplyDistanceWeight*shared.Clamp01(bestDist/c.Supply.ResupplyRangeLeagues))
				// A road under blockade or thick with raiders carries less.
				delivered *= shared.Clamp01(t.RoadSafety)
				if delivered > 0 {
					w.Add(model.KindParty, pid, "party_food", delivered,
						shared.ReadString(
							shared.PairI("town", bestTown),
							shared.PairF("distance", bestDist),
							shared.PairF("available", available),
							shared.Pair("road_safety", t.RoadSafety)),
						v.Log.RecentFor(model.KindTown, bestTown, []string{"food_stock", "blockade", "road_safety"}, 4),
						"resupplied from a friendly town")
					w.Add(model.KindTown, bestTown, "food_stock", -delivered,
						shared.ReadString(
							shared.PairI("to_party", pid),
							shared.PairF("delivered", delivered)),
						v.Log.RecentFor(model.KindTown, bestTown, []string{"food_stock", "food_days"}, 3),
						"supplied an army")
					// A town feeding an army is a town whose own buffer drops,
					// which can start the next town's famine. War propagates
					// scarcity, and this is how.
				}
			}
		}

		// --- starvation ---
		// An army is starving when its larder has run out and it is beyond
		// reach of resupply. Days-of-food is recomputed after any resupply so
		// the flag reflects the tick's actual position.
		daysNow := shared.SafeDiv(p.Food, dailyNeed)
		starving := daysNow < c.Supply.DaysOfFoodStarved
		w.Set(model.KindParty, pid, "party_starving", b2f(starving),
			shared.ReadString(
				shared.Pair("days_food", daysNow),
				shared.PairF("supply_distance", nearest),
				shared.PairI("nearest_friendly", bestTown)),
			v.Log.RecentFor(model.KindParty, pid, []string{"party_food", "days_food", "party_starving", "supply_distance"}, 4),
			"")

		// Starving troops lose morale, and a well-supplied army gains a little.
		// Both terms read state rather than being told by another system.
		if starving {
			w.Add(model.KindParty, pid, "morale", -c.Supply.StarvingMoraleLoss,
				shared.Pair("days_food", daysNow), nil, "hungry")
		} else if daysNow > c.Supply.DaysOfFoodStarved*2 {
			w.Add(model.KindParty, pid, "morale", c.Supply.SupplyMoraleBonus,
				shared.Pair("days_food", daysNow), nil, "well supplied")
		}
	}
}

// underway reports whether an activity means the party is consuming march
// rations, which are heavier than quartering.
func underway(a model.Activity) bool {
	return a == model.ActMarching || a == model.ActResupplying || a == model.ActReturning
}

func b2f(b bool) float64 {
	if b {
		return 1
	}
	return 0
}
