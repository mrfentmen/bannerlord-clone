package campaign

import (
	"sort"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
)

// This simulation holds exactly three priced physical stocks: food, medicine, and
// metal. They are what internal/systems/market prices, what internal/systems/food
// produces and consumes, and what internal/systems/logistics carries.
//
// The client's GOODS list also names fuel, arms, textiles, tools, and lumber. The
// model has no stock, no production, and no price for any of them, so this server
// does not quote them. A price for a good nothing produces would be a number
// invented to fill a table, which is the one thing a simulation server must never
// do. Those ids are refused with a reason naming the three that are real.

// goodDef binds a wire good id to the simulation fields that hold it.
type goodDef struct {
	// ID is the client's good id.
	ID string
	// Name is the display name.
	Name string
	// stockField is the town field holding what the market has.
	stockField string
	// priceField is the town field holding the price multiplier.
	priceField string
	// partyField is the party field holding what the party carries.
	partyField string
	// cargoField is the party field holding what a caravan carries, which is
	// part of the party's hold as far as the client is concerned.
	cargoField string
	// demandOf reads a town's demand for this good.
	demandOf func(c *config.Config, t *model.Town) float64
}

// tradableGoods are the three goods this server trades, in the client's GOODS
// order. The order is stable so a market always lists its goods the same way.
func tradableGoods() []goodDef {
	return []goodDef{
		{
			ID: "grain", Name: "Grain",
			stockField: "food_stock", priceField: "price_food",
			partyField: "party_food", cargoField: "cargo_food",
			// The food system writes food_demand, so the market's own demand
			// figure is used rather than recomputed from population.
			demandOf: func(_ *config.Config, t *model.Town) float64 { return t.FoodDemand },
		},
		{
			ID: "medicine", Name: "Medicine",
			stockField: "medicine_stock", priceField: "price_medicine",
			partyField: "party_medicine", cargoField: "cargo_medicine",
			// The same denominator internal/systems/market prices medicine
			// against: four times the per-capita clinic stock.
			demandOf: func(c *config.Config, t *model.Town) float64 {
				return t.Population * c.World.MedicinePerCapita * 4
			},
		},
		{
			ID: "metal", Name: "Metal",
			stockField: "metal", priceField: "price_metal",
			partyField: "party_metal", cargoField: "cargo_metal",
			// The same denominator internal/systems/market prices metal
			// against: three times the per-capita industrial stock.
			demandOf: func(c *config.Config, t *model.Town) float64 {
				return t.Population * c.World.StartMetalPerCapita * 3
			},
		},
	}
}

// tradeGoods is the cached list, built once per campaign.
var tradeGoods = tradableGoods()

// tradeGood looks a wire good id up in the tradable set.
func tradeGood(id string) (goodDef, bool) {
	for _, g := range tradeGoods {
		if g.ID == id {
			return g, true
		}
	}
	return goodDef{}, false
}

// goodNames lists the tradable ids, for a refusal that has to say what is real.
func goodNames() []string {
	out := make([]string, 0, len(tradeGoods))
	for _, g := range tradeGoods {
		out = append(out, g.Name)
	}
	return out
}

// unitCost is what one unit costs at a price multiplier of one.
//
// Medicine uses campaign.medicine_unit_price because that is the constant
// internal/systems/player already charges for a dose at a price of one, so buying
// medicine through this route and buying it through the town order cost the same
// money. Grain and metal use market.base_price, which the market system documents
// as the reference price of food in an ordinary well-supplied town; the client
// multiplies by the town's multiplier on top.
func unitCost(c *config.Config, g goodDef) float64 {
	if g.ID == "medicine" {
		return c.Campaign.MedicineUnitPrice
	}
	return c.Market.BasePrice
}

// sellDiscount is what the town keeps when it buys from the player:
// currency.market_fee_rate, whose balance.toml comment is "cut of trade the town
// takes".
func sellDiscount(c *config.Config) float64 {
	return c.Currency.MarketFeeRate
}

// marketKey identifies one good's price series in one town.
type marketKey struct {
	town int
	good string
}

// priceSeries is a rolling window of one good's price in one town.
type priceSeries struct {
	// last is the most recent price, and previous the one before it. The client
	// shows the trend arrow from them.
	last     float64
	previous float64
	// seen counts how many prices have been recorded, so previous is only
	// reported once there is a previous to report.
	seen int
	// points is oldest-first, which is the order the client's sparkline wants.
	points []wire.PricePoint
	limit  int
}

// observe records one day's price, keeping the window bounded.
func (ps *priceSeries) observe(day int, price float64, limit int) {
	if ps.seen > 0 {
		ps.previous = ps.last
	}
	ps.last = price
	ps.seen++
	ps.points = append(ps.points, wire.PricePoint{Day: day, Price: round3(price)})
	if limit > 0 && len(ps.points) > limit {
		// Trim from the front, keeping the most recent entries. A copy is made
		// rather than resliced, so the backing array does not grow without
		// bound over a long campaign.
		keep := make([]wire.PricePoint, limit)
		copy(keep, ps.points[len(ps.points)-limit:])
		ps.points = keep
	}
}

// marketState renders one town's market for the wire.
func (c *Campaign) marketState(t *model.Town) wire.MarketState {
	out := wire.MarketState{
		TownID: EntityID(model.KindTown, t.ID),
		Goods:  make([]wire.MarketGood, 0, len(tradeGoods)),
	}
	for _, g := range tradeGoods {
		price, ok := c.state.Get(model.KindTown, t.ID, g.priceField)
		if !ok {
			continue
		}
		stock, _ := c.state.Get(model.KindTown, t.ID, g.stockField)
		mg := wire.MarketGood{
			GoodID:  g.ID,
			Name:    g.Name,
			Price:   round3(price),
			Stock:   round2(stock),
			Demand:  round2(g.demandOf(c.cfg, t)),
			History: []wire.PricePoint{},
		}
		if ps := c.history[marketKey{town: t.ID, good: g.ID}]; ps != nil {
			if ps.seen > 1 {
				prev := ps.previous
				mg.PreviousPrice = &prev
			}
			mg.History = append(mg.History, ps.points...)
		}
		out.Goods = append(out.Goods, mg)
	}
	return out
}

// marketsLocked builds the markets map, keyed by town id as the client expects.
func (c *Campaign) marketsLocked() map[string]wire.MarketState {
	out := make(map[string]wire.MarketState, len(c.state.Towns))
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil || t.Population <= 0 {
			continue
		}
		out[EntityID(model.KindTown, id)] = c.marketState(t)
	}
	return out
}

// partyGoodQuantity is what the party holds of a good: what it carries plus what
// a caravan of its own is carrying, since the client shows one hold.
func (c *Campaign) partyGoodQuantity(p *model.Party, g goodDef) float64 {
	v, _ := c.state.Get(model.KindParty, p.ID, g.partyField)
	cargo, _ := c.state.Get(model.KindParty, p.ID, g.cargoField)
	return v + cargo
}

// partyGoodsLocked renders the party's hold for the wire.
func (c *Campaign) partyGoodsLocked(p *model.Party) []wire.PartyGood {
	out := make([]wire.PartyGood, 0, len(tradeGoods))
	for _, g := range tradeGoods {
		qty := c.partyGoodQuantity(p, g)
		h := c.ro.goods[g.ID]
		if qty <= 0 && h == nil {
			continue
		}
		avg := 0.0
		if h != nil {
			avg = h.AvgPaid()
		}
		out = append(out, wire.PartyGood{
			GoodID:   g.ID,
			Name:     g.Name,
			Quantity: round2(qty),
			AvgPaid:  round3(avg),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].GoodID < out[j].GoodID })
	return out
}
