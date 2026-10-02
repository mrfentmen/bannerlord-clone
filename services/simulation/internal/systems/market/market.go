// Package market sets prices from scarcity, and sets wages from prices.
//
// Reads stock, demand, road safety, and tax rate, and writes prices, wages, and
// the price index. The wage lag is the important part: wages chase prices
// slowly, so a price rise briefly outruns what people earn, and that gap is
// what turns a bad harvest into unrest rather than a mildly expensive week.
package market

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the market system.
func System() sim.System {
	return sim.System{
		Name: "market",
		Doc:  "sets food, medicine, and metal prices from scarcity; wages follow prices slowly",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			continue
		}
		demand := t.FoodDemand
		if demand <= 0 {
			// A town whose demand is not yet computed this tick has no market
			// to speak of. Skipping is correct: the food system writes demand
			// in the same tick, and reading it here would be a dependency on
			// system order, which SPEC.md section 4 forbids.
			continue
		}

		// Scarcity is stock relative to demand. The merchant's target stock is
		// the buffer the market aims for, and a town sitting on its target
		// pays the reference price. Below target, price rises.
		//
		// Both sides are in person-days: stock is person-days on hand and the
		// target is person-days of demand the merchant wants covered. An
		// earlier version divided days-of-stock by person-days of target,
		// which is always ~0, so every town priced at full crisis pressure
		// from the second week and unrest pinned at maximum (depop 2026-10-02).
		target := t.StockTarget
		if target <= 0 {
			target = demand * c.Market.StockTargetDays
		}
		relative := shared.SafeDiv(t.FoodStock, target)
		// A town holding less than a day's demand is in crisis and the price
		// should be at the cap, so the ratio is scaled against the target
		// rather than against a fixed number of days.
		// Scarcity pricing: at or above the target the price is the reference
		// price; below it the price rises in proportion to the shortfall.
		pressure := 0.0
		if relative < c.Market.ScarcityForPrice {
			pressure = (c.Market.ScarcityForPrice - relative) / c.Market.ScarcityForPrice
		}
		foodPrice := 1 + c.Market.PriceElasticity*pressure
		// Safe roads bring goods in and damp local prices; unsafe roads are
		// the reason a price rises somewhere the player thinks is safe, per
		// ECONOMY.md section 7.
		foodPrice *= 1 - c.Market.RoadSafetyWeight*(1-shared.Clamp01(t.RoadSafety))
		// A miserable town pays more for what little there is.
		if t.Prosperity < 0.5 {
			foodPrice *= 1 + 0.2*(0.5-t.Prosperity)
		}

		// Medicine and metal prices come from their own scarcity. Medicine is
		// deliberately the most price-elastic of the three: when a clinic runs
		// dry, what little is left is worth a great deal, which is the
		// economic half of chain 3.
		medicineScarcity := 1 - shared.Clamp01(shared.SafeDiv(t.MedicineStock, t.Population*c.World.MedicinePerCapita*4))
		medicinePrice := 1 + c.Market.MedicineScarcityWeight*medicineScarcity
		medicinePrice *= 1 - c.Market.RoadSafetyWeight*(1-shared.Clamp01(t.RoadSafety))
		metalScarcity := 1 - shared.Clamp01(shared.SafeDiv(t.Metal, t.Population*c.World.StartMetalPerCapita*3))
		metalPrice := 1 + c.Market.MetalScarcityWeight*metalScarcity

		// Move prices toward the target rather than snapping to it. A market
		// that teleports to equilibrium would make every chain instantaneous,
		// and TESTING_AND_BALANCE.md section 4 wants weeks of in-game time.
		newFoodPrice := moveToward(t.PriceFood, foodPrice, c.Market.PriceInertia*foodPrice*0.25)
		newFoodPrice = shared.Clamp(newFoodPrice, c.Market.PriceFloor, c.Market.PriceCap)
		newMedicinePrice := moveToward(t.PriceMedicine, medicinePrice, c.Market.PriceInertia*medicinePrice*0.25)
		newMedicinePrice = shared.Clamp(newMedicinePrice, c.Market.PriceFloor, c.Market.PriceCap*3)
		newMetalPrice := moveToward(t.PriceMetal, metalPrice, c.Market.PriceInertia*metalPrice*0.25)
		newMetalPrice = shared.Clamp(newMetalPrice, c.Market.PriceFloor, c.Market.PriceCap*2)

		// Wages. A town's wage bill is a share of what its people produce,
		// measured by prosperity, and it tracks the cost of living only
		// slowly. The lag is the wage spiral: prices jump, wages crawl, and in
		// between the gap is anger.
		wageTarget := t.WagesTarget
		if wageTarget <= 0 {
			wageTarget = c.Market.BasePrice * c.Currency.TaxIncomePerCapita * 4
		}
		newWages := moveToward(t.Wages, wageTarget, c.Market.WageFollowRate*shared.SafeDiv(wageTarget, 1))
		if newWages < 0 {
			newWages = 0
		}
		// A starving town cannot pay wages at all.
		if shared.Clamp01(t.StarveSeverity) > 0.5 {
			newWages *= 1 - 0.5*shared.Clamp01(t.StarveSeverity)
		}

		read := shared.ReadString(
			shared.PairF("food_stock", t.FoodStock),
			shared.PairF("demand", demand),
			shared.PairF("stock_target", target),
			shared.Pair("road_safety", t.RoadSafety),
			shared.Pair("tax_rate", t.TaxRate),
			shared.Pair("price_food", t.PriceFood),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"food_stock", "food_demand", "road_safety", "prosperity", "stock_target", "medicine_stock", "metal"}, 6)

		w.Set(model.KindTown, id, "scarcity", relative, read, causes, "")
		w.Set(model.KindTown, id, "price_food", newFoodPrice, read, causes, "")
		w.Set(model.KindTown, id, "price_medicine", newMedicinePrice, read, causes, "")
		w.Set(model.KindTown, id, "price_metal", newMetalPrice, read, causes, "")
		w.Set(model.KindTown, id, "wages", newWages, read, causes, "")
		// A single index for the overall cost of living, which the currency
		// system uses for inflation and the unrest system for the real cost
		// felt by a household.
		index := (newFoodPrice*0.6 + newMedicinePrice*0.2 + newMetalPrice*0.2) / c.Market.BasePrice
		w.Set(model.KindTown, id, "price_index", index, read, causes, "cost of living")

		// Wage target: what a healthy, employed town would pay, scaled by
		// prosperity. The wage system reads nothing; it simply holds this.
		target2 := c.Market.BasePrice * c.Currency.TaxIncomePerCapita * 4 * (0.5 + shared.Clamp01(t.Prosperity))
		w.Set(model.KindTown, id, "wages_target", target2, read, causes, "")
	}
}

// moveToward moves v toward target by step without overshooting.
func moveToward(v, target, step float64) float64 {
	if step < 0 {
		step = 0
	}
	if v < target {
		v += step
		if v > target {
			return target
		}
		return v
	}
	v -= step
	if v < target {
		return target
	}
	return v
}
