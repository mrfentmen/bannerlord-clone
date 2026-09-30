// Package currency handles money, the gold reserve, the exchange rate, and
// debt.
//
// Reads tax rate, prosperity, unrest, loyalty, wages, and prices, and writes
// money, gold, metal, debt, the exchange rate, and inflation pressure. It is
// where a long war drains a treasury (chain 7) and where a ruler who cannot
// pay wages has to start borrowing.
package currency

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the currency system.
func System() sim.System {
	return sim.System{
		Name: "currency",
		Doc:  "collects taxes, pays wages and upkeep, manages gold, debt, and the exchange rate",
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

		// --- income ---
		// Taxes scale with population, rate, and prosperity, and collapse when
		// collection fails. A ruler who taxes a town into unrest collects less,
		// which is the self-defeating arithmetic behind chain 1: the money
		// stops justifying the anger it caused.
		collection := 1 - c.Currency.TaxUnrestPenalty*shared.Clamp01(t.Unrest/c.Currency.TaxHarshUnrest)
		// An unpopular holder collects less even at the same unrest, because
		// people withhold cooperation rather than only pay late.
		collection -= c.Currency.TaxLoyaltyPenalty * (1 - shared.Clamp01(t.Loyalty))
		if collection < 0 {
			collection = 0
		}
		prosperityTerm := 1 - c.Currency.TaxProsperityWeight*(1-shared.Clamp01(t.Prosperity))
		taxIncome := t.Population * c.Currency.TaxIncomePerCapita * t.TaxRate * prosperityTerm * collection
		// Market fees on the trade that actually arrives. A blockaded or
		// unsafe town collects no trade toll, which is the economic cost of
		// chain 3 and chain 8.
		tradeIncome := t.FoodImports * c.Currency.MarketFeeRate
		tradeIncome += t.FoodExports * c.Currency.MarketFeeRate * 0.5
		income := taxIncome + tradeIncome

		// --- expenses ---
		// Garrison wages. A garrison is a standing cost, which is the point:
		// a town that pulls its garrison to fight elsewhere stops paying for
		// troops it no longer has, and the roads it no longer patrols rot.
		garrisonWages := t.Garrison * c.Currency.WagesPerTroop
		militiaPayroll := t.MilitiaPayroll
		// Civic upkeep: the clinic, the granary, the walls, the market.
		upkeep := t.Population * c.Currency.BuildingUpkeepPerCapita
		// Wages for everyone else who works. Wages rose when prices rose, so a
		// town that is being squeezed pays more for the same work.
		labourWages := t.Population * t.Wages * (1 - c.Currency.GarrisonWageShare)
		expense := garrisonWages + militiaPayroll + upkeep + labourWages

		net := income - expense

		read := shared.ReadString(
			shared.Pair("tax_rate", t.TaxRate),
			shared.PairF("tax_income", taxIncome),
			shared.PairF("trade_income", tradeIncome),
			shared.PairF("expense", expense),
			shared.Pair("prosperity", t.Prosperity),
			shared.Pair("unrest", t.Unrest),
			shared.Pair("loyalty", t.Loyalty),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"tax_rate", "prosperity", "unrest", "loyalty", "garrison", "wages", "food_imports", "price_index"}, 6)

		w.Set(model.KindTown, id, "tax_income", taxIncome, read, causes, "")
		w.Set(model.KindTown, id, "expenditure", expense, read, causes, "")
		w.Set(model.KindTown, id, "net_cash", net, read, causes, "")
		w.Add(model.KindTown, id, "money", net, read, causes, "daily balance")

		// --- debt ---
		// A town that cannot pay wages borrows. Borrowing is what turns a bad
		// year into a slow squeeze, since interest compounds against it.
		shortfall := 0.0
		if net < 0 {
			shortfall = -net
		}
		borrowing := 0.0
		if t.Money < c.Currency.BankruptcyDebtFloor {
			borrowing = shortfall * c.Currency.BorrowingPerDeficit
		}
		interest := 0.0
		if t.Debt > 0 {
			interest = t.Debt * c.Currency.InterestRate
		}
		w.Add(model.KindTown, id, "debt", borrowing+interest, read, causes, "borrowing and interest")

		// --- gold ---
		// Gold does not lose value, which is the whole distinction from money
		// (ECONOMY.md section 2). A ruler burns gold to cover money shortfalls
		// only when the reserve is healthy; doing it out of desperation is how
		// a treasury empties in a long war, which is chain 7.
		burn := 0.0
		if t.Money < 0 && t.Gold > 0 {
			// Convert at the current rate, paying the conversion cost.
			burn = shared.SafeDiv(-t.Money, c.Currency.GoldPerMoney) * (1 + c.Currency.ConversionCost)
			// Only a fraction of the reserve is ever spent this way, so a town
			// does not liquidate its hard reserve in a single bad week.
			burn = minF(burn, t.Gold*c.Currency.ReserveSpendRate)
		}
		w.Add(model.KindTown, id, "money", burn, read, causes, "gold converted to cover a shortfall")
		w.Add(model.KindTown, id, "gold", -burn, read, causes, "gold reserve spent")

		// --- metal ---
		// Metal is consumed by ammunition and repairs. A town at war burns
		// metal fast, and a town out of metal cannot equip its garrison, which
		// is ECONOMY.md section 4's mechanism rather than a rule.
		metalUse := 0.0
		if t.Garrison > 0 {
			metalUse = t.Garrison * c.Currency.MetalUsePerTroop
		}
		// Industry produces metal slowly in proportion to prosperity.
		metalMake := t.Population * c.World.StartMetalPerCapita * shared.Clamp01(t.Prosperity) * c.Currency.MetalMakeRate
		metalNet := metalMake - metalUse
		readMetal := read + ", " + shared.PairF("metal_use", metalUse) + ", " + shared.PairF("metal_made", metalMake)
		w.Add(model.KindTown, id, "metal", metalNet, readMetal, causes, "industry and military consumption")
	}
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
