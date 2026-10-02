package campaign

import (
	"context"
	"fmt"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Trade buys or sells a good in a town market.
//
// The work runs inside a tick, staging into the WriteSet, for the reason the
// package comment gives: a system cannot reach into state, and the only way in is
// a staged write the engine commits along with everyone else's. So a trade lands
// in the cause log like any other change and the Why panel can walk it.
func (c *Campaign) Trade(ctx context.Context, req wire.TradeRequest) (any, error) {
	c.mu.RLock()
	dayErr := c.validateOrderDay(req.ExpectedDay)
	c.mu.RUnlock()
	if dayErr != nil {
		return nil, dayErr
	}
	if req.Side != "buy" && req.Side != "sell" {
		return nil, badRequestf("side must be \"buy\" or \"sell\", got %q", req.Side)
	}
	if req.Quantity <= 0 {
		return nil, unprocessablef("There is no such thing as buying none of them.",
			"quantity must be positive, got %v", req.Quantity)
	}
	good, ok := tradeGood(req.GoodID)
	if !ok {
		return nil, unprocessablef(
			fmt.Sprintf("This world trades %s. There is nothing here called %q.", joinNames(goodNames()), req.GoodID),
			"goodId %q is not one of the simulation's priced goods: %v", req.GoodID, goodNames())
	}

	j := newJob("trade",
		func(c *Campaign, v *sim.View, w *sim.WriteSet) (any, error) {
			return c.stageTrade(v, w, req, good)
		},
		func(c *Campaign, s *model.State, staged any) any {
			return c.finishTrade(s, staged)
		})
	return c.Submit(ctx, j)
}

// validateOrderDay refuses an order made against a day the world has left.
//
// This is what the client's expectedDay field is for: a player looking at a price
// must not be able to buy against a price they never saw. The world moves on its
// own schedule, so a stale order is a conflict rather than a mistake, and the
// client shows a conflict's reason to the player.
func (c *Campaign) validateOrderDay(expected int) error {
	if expected <= 0 {
		return badRequestf("expectedDay is required and must be a positive day number, got %d", expected)
	}
	now := c.state.Tick
	if expected == now {
		return nil
	}
	return conflictf(
		fmt.Sprintf("The world is on day %d. That order was priced against day %d.", now, expected),
		"stale order: expectedDay %d but the world is on tick %d", expected, now)
}

// tradeStaged is what the stage step worked out, handed to the finish step.
type tradeStaged struct {
	result   wire.TradeResult
	good     goodDef
	accepted bool
	party    int
	town     int
}

// stageTrade validates against committed state and stages the writes.
//
// The price is read here, from committed state, on the tick the order lands. That
// is the price charged: not one from the request, and not one predicted from the
// tick before.
func (c *Campaign) stageTrade(v *sim.View, w *sim.WriteSet, req wire.TradeRequest, g goodDef) (any, error) {
	party := c.partyForOrder(req.PartyID)
	if party == nil {
		return nil, notFoundf("no party %q", req.PartyID)
	}
	town := c.townRef(req.TownID)
	if town == nil {
		return nil, notFoundf("no town %q", req.TownID)
	}
	if party.Troops <= 0 {
		return nil, unprocessablef("There is nobody left to carry it.", "party %d has no troops", party.ID)
	}

	price, _ := v.State.Get(model.KindTown, town.ID, g.priceField)
	stock, _ := v.State.Get(model.KindTown, town.ID, g.stockField)
	held := c.partyGoodQuantity(party, g)

	unit := price * unitCost(v.Cfg, g)
	if req.Side == "sell" {
		// The town takes its cut, so a seller receives less than the buy price.
		unit *= 1 - sellDiscount(v.Cfg)
	}
	total := unit * req.Quantity

	out := tradeStaged{
		good:  g,
		party: party.ID,
		town:  town.ID,
		result: wire.TradeResult{
			Side:             req.Side,
			GoodName:         g.Name,
			Quantity:         req.Quantity,
			UnitPrice:        round3(unit),
			Total:            round2(total),
			PartyQuantity:    round2(held),
			MarketPriceAfter: round3(price),
		},
	}

	if refusal := c.tradeRefusal(v, g, req.Side, req.Quantity, total, stock, held, party, town); refusal != nil {
		out.result.Reason = refusal.Reason
		return out, nil
	}

	read := shared.ReadString(
		shared.PairF("quantity", req.Quantity),
		shared.Pair(g.priceField, price),
		shared.PairF("town_"+g.stockField, stock),
		shared.PairF("total", total))
	causes := v.Log.RecentFor(model.KindTown, town.ID,
		[]string{g.stockField, g.priceField, "money"}, 3)

	if req.Side == "buy" {
		w.Add(model.KindTown, town.ID, g.stockField, -req.Quantity, read, causes,
			"bought by "+party.Name+": "+g.Name)
		w.Add(model.KindTown, town.ID, "money", total, read, causes,
			"trade: sold "+g.Name+" to "+party.Name)
		w.Add(model.KindParty, party.ID, g.partyField, req.Quantity, read, causes,
			"bought "+g.Name+" in "+town.Name)
		w.Add(model.KindParty, party.ID, "party_money", -total, read, causes,
			"paid "+town.Name+" for "+g.Name)
	} else {
		w.Add(model.KindTown, town.ID, g.stockField, req.Quantity, read, causes,
			"bought by "+town.Name+" from "+party.Name+": "+g.Name)
		w.Add(model.KindTown, town.ID, "money", -total, read, causes,
			"trade: bought "+g.Name+" from "+party.Name)
		w.Add(model.KindParty, party.ID, g.partyField, -req.Quantity, read, causes,
			"sold "+g.Name+" in "+town.Name)
		w.Add(model.KindParty, party.ID, "party_money", total, read, causes,
			"took "+trimNum(total)+" from "+town.Name+" for "+g.Name)
	}
	out.accepted = true
	out.result.Accepted = true
	return out, nil
}

// tradeRefusal decides whether the trade cannot happen and says why in a sentence
// a player can read. A nil pointer means it can go ahead.
func (c *Campaign) tradeRefusal(v *sim.View, g goodDef, side string, qty, total, stock, held float64, party *model.Party, town *model.Town) *Refusal {
	// A market is not a shop. There is no mechanism in the simulation for
	// trading with a besieged town or one at war with you, so it is refused
	// rather than half-performed.
	if town.IsBesieged {
		return refuse(town.Name + " is under siege. No market is running.")
	}
	if party.SideID >= 0 && town.HolderSide >= 0 && v.State.AtWar(party.SideID, town.HolderSide) {
		return refuse("There is no trade with " + town.Name + " while the two of you are at war.")
	}
	if side == "buy" {
		if stock < qty {
			return refuse(fmt.Sprintf("%s has %s to sell, not %s.",
				town.Name, trimNum(stock), trimNum(qty)))
		}
		if party.Money < total {
			return refuse(fmt.Sprintf("%s for that much %s, and you have %s.",
				trimNum(total), g.Name, trimNum(party.Money)))
		}
		return nil
	}
	if held < qty {
		return refuse(fmt.Sprintf("You have %s of %s, not %s.", trimNum(held), g.Name, trimNum(qty)))
	}
	// A town's shelves are its population scaled. Past that there is nowhere to
	// put the goods, so the town stops buying rather than going into debt.
	if stock+qty > town.Population*4 {
		return refuse(town.Name + " has no room for that much " + g.Name + ".")
	}
	if town.Money < total {
		return refuse(fmt.Sprintf("%s cannot pay %s for it.", town.Name, trimNum(total)))
	}
	return nil
}

// finishTrade reads committed state and builds the reply.
//
// marketPriceAfter is read after the engine has applied the tick, so it is the
// price the market system actually left behind. Prices move by inertia rather than
// snapping, so it will have shifted a little in the direction the trade pushed it;
// reporting the pre-trade number would tell the player their trade changed nothing.
func (c *Campaign) finishTrade(s *model.State, staged any) any {
	st, ok := staged.(tradeStaged)
	if !ok {
		return nil
	}
	res := st.result
	party := s.Parties[st.party]
	if party != nil {
		res.PartyQuantity = round2(c.partyGoodQuantity(party, st.good))
		if res.CausedBy == "" && st.accepted {
			if row, found := c.log.LatestFor(model.KindParty, st.party, st.good.partyField); found {
				res.CausedBy = RowID(row.ID)
			}
		}
		// The roster's running average is the runner's own bookkeeping, updated
		// here rather than inside the tick, so it cannot influence a simulation
		// result. It is what makes the client's avgPaid a real mean of real
		// trades rather than a figure with nothing behind it.
		if st.accepted {
			if res.Side == "buy" {
				c.ro.hold(st.good.ID, res.Quantity, res.Total)
			} else {
				c.ro.unhold(st.good.ID, res.Quantity)
			}
		}
	}
	if price, found := s.Get(model.KindTown, st.town, st.good.priceField); found {
		res.MarketPriceAfter = round3(price)
	}
	return res
}

// partyForOrder resolves the party an order names, defaulting to the player's own
// party when the client sends nothing. The client always sends one; defaulting
// keeps a bare order working rather than failing on a technicality.
func (c *Campaign) partyForOrder(ref string) *model.Party {
	if ref == "" {
		return c.state.Parties[c.party]
	}
	if p, ok := c.partyByRef(ref); ok {
		return p
	}
	return c.state.Parties[c.party]
}

func trimNum(v float64) string { return fmt.Sprintf("%.0f", v) }

// joinNames renders a name list as "A, B and C" for a sentence.
func joinNames(names []string) string {
	switch len(names) {
	case 0:
		return ""
	case 1:
		return names[0]
	case 2:
		return names[0] + " and " + names[1]
	default:
		out := ""
		for i, n := range names {
			switch {
			case i == len(names)-1:
				out += " and " + n
			case i > 0:
				out += ", " + n
			default:
				out = n
			}
		}
		return out
	}
}
