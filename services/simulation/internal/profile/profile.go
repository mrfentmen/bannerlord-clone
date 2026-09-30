// Package profile provides the scripted player behaviours from
// TESTING_AND_BALANCE.md section 3: idle, greedy, warmonger, caretaker, and
// trader.
//
// A profile is not a system and not a privileged path. It is an order
// generator, exactly like a player's input, and it goes through the same order
// queue. That matters for the exit criteria: if a "dumb player" could reach
// into a system, a chain that appeared only under it would be evidence of
// nothing, and the rule that chains must emerge unscripted would be untestable.
package profile

import (
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/sim"
)

// Kind selects a profile.
type Kind string

const (
	// Idle does nothing. The baseline against which the others are read.
	Idle Kind = "idle"
	// Greedy maxes taxes and ignores food. Tests the famine and vote chains.
	Greedy Kind = "greedy"
	// Warmonger marches constantly. Tests the supply and attrition chains.
	Warmonger Kind = "warmonger"
	// Caretaker feeds, heals, and repairs. Tests the recovery chain.
	Caretaker Kind = "caretaker"
	// Trader runs caravans. Tests the economy and road safety chains.
	Trader Kind = "trader"
	// None means no player at all: the world runs on its own AI.
	None Kind = "none"
)

// All lists every profile, for the CLI and the test sweep.
func All() []Kind { return []Kind{Idle, Greedy, Warmonger, Caretaker, Trader, None} }

// Valid reports whether a kind is one this package knows.
func Valid(k Kind) bool {
	for _, v := range All() {
		if v == k {
			return true
		}
	}
	return false
}

// Player is a scripted player's holdings and current orders. It holds one town
// and one ruler: a single player character, not a faction, because the profiles
// exist to test what a player does to a town, and giving them a whole side
// would test the faction AI instead.
type Player struct {
	Kind Kind
	// RulerID is the player character, who holds TownID.
	RulerID int
	TownID  int
	// SideID is the player's side.
	SideID int
	cfg    *config.Config
}

// New creates a player profile attached to a ruler.
func New(kind Kind, rulerID, townID, sideID int, cfg *config.Config) *Player {
	return &Player{Kind: kind, RulerID: rulerID, TownID: townID, SideID: sideID, cfg: cfg}
}

// Orders returns the orders this profile wants issued today, given what it can
// read from the state. It reads shared state only; it has no privileged access
// and no way to call a system.
func (p *Player) Orders(v *sim.View) []sim.Order {
	if p.Kind == None {
		return nil
	}
	t := v.State.Towns[p.TownID]
	if t == nil || t.Population <= 0 {
		return nil
	}
	c := p.cfg
	var out []sim.Order

	switch p.Kind {
	case Idle:
		// Deliberately nothing. The world is expected to be interesting without
		// a player, and this is the profile that proves whether it is.

	case Greedy:
		// Maxes taxes and never looks at the consequences. This is the profile
		// that should produce chain 1: taxes up, prices up, food down, unrest
		// up, loyalty down, vote out. The tax rate is pushed every day, so the
		// chain has no excuse for not happening except that the systems do not
		// connect.
		if t.TaxRate < c.Currency.TaxMaxRate {
			out = append(out, sim.Order{
				Kind:    sim.OrderSetTax,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  c.Currency.TaxMaxRate,
			})
		}
		// A greedy player also refuses to fund anything that is not a tax
		// receipt, so no aid goes out and no medicine is bought.

	case Warmonger:
		// Orders the maximum tax to fund an army, then marches it. Chain 6
		// needs an army that goes further than its supply; this profile is what
		// produces one.
		if t.TaxRate < c.Currency.TaxMaxRate {
			out = append(out, sim.Order{
				Kind:    sim.OrderSetTax,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  c.Currency.TaxMaxRate,
			})
		}
		if party := v.State.Parties[playerParty(v, p.RulerID)]; party != nil && party.Troops > 0 {
			// March at the most distant reachable enemy town, which is what
			// makes the supply line too long. A cautious player would not; this
			// one does not compute the distance at all.
			if far := farthestEnemy(v, party.ID); far > 0 {
				out = append(out, sim.Order{
					Kind:    sim.OrderMarchTo,
					RulerID: p.RulerID,
					TownID:  p.TownID,
					Target:  far,
				})
			}
		}
		// A warmonger also pulls the garrison out to go with the army, which is
		// chain 3's cause: the roads stop being patrolled.
		if t.Garrison > 0 {
			out = append(out, sim.Order{
				Kind:    sim.OrderMoveGarrison,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  -c.Security.GarrisonDetachShare * t.Garrison,
			})
		}

	case Caretaker:
		// Cuts taxes to buy loyalty, sends aid to the worst neighbour, and
		// keeps a reserve. Chain 5 needs a player who does the right things,
		// and the recovery must then emerge from the food, disease, labor, and
		// loyalty systems rather than being applied by the profile.
		target := c.Campaign.TaxCutLoyaltyRate
		if t.TaxRate > target {
			out = append(out, sim.Order{
				Kind:    sim.OrderSetTax,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  target,
			})
		}
		if needy, ok := neediestNeighbour(v, p.TownID); ok {
			out = append(out, sim.Order{
				Kind:    sim.OrderSendAid,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Target:  needy,
				Amount:  c.Campaign.AidLoadShare,
			})
		}
		// And keeps medicine in stock, which is the other half of chain 5.
		want := t.Population * c.World.MedicinePerCapita * c.Campaign.CaretakerMedicineStock
		if t.MedicineStock < want {
			out = append(out, sim.Order{
				Kind:    sim.OrderBuyMedicine,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  want - t.MedicineStock,
			})
		}

	case Trader:
		// Runs a caravan whenever a margin exists and the roads are safe
		// enough. Tests the economy and the road safety systems.
		if party := v.State.Parties[playerParty(v, p.RulerID)]; party != nil && party.Troops > 0 {
			if target, ok := bestTradeTarget(v, party.HomeTown); ok {
				out = append(out, sim.Order{
					Kind:    sim.OrderTradeRun,
					RulerID: p.RulerID,
					TownID:  p.TownID,
					Target:  target,
				})
			}
		}
		// A trader also keeps taxes moderate, because a tax-struck town is a
		// bad market.
		if t.TaxRate > c.Campaign.TraderTaxCeiling {
			out = append(out, sim.Order{
				Kind:    sim.OrderSetTax,
				RulerID: p.RulerID,
				TownID:  p.TownID,
				Amount:  c.Campaign.TraderTaxCeiling,
			})
		}
	}
	return out
}

// playerParty returns a ruler's party id, or -1.
func playerParty(v *sim.View, rulerID int) int {
	if r := v.State.Rulers[rulerID]; r != nil {
		return r.PartyID
	}
	return -1
}

// farthestEnemy returns the most distant enemy town within reach, which is what
// a warmonger marches to and what a supply line cannot support.
func farthestEnemy(v *sim.View, partyID int) int {
	p := v.State.Parties[partyID]
	if p == nil {
		return -1
	}
	c := v.Cfg
	best, bestD := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide < 0 || !v.State.AtWar(p.SideID, t.HolderSide) {
			continue
		}
		d := v.State.DistanceBetweenTowns(p.HomeTown, tid)
		if d > c.Campaign.AttackRangeLeagues {
			continue
		}
		if d > bestD {
			best, bestD = tid, d
		}
	}
	return best
}

// neediestNeighbour returns the nearest town of the same side with the worst
// food buffer.
func neediestNeighbour(v *sim.View, townID int) (int, bool) {
	c := v.Cfg
	me := v.State.Towns[townID]
	if me == nil {
		return 0, false
	}
	best, bestFood := -1, c.World.FullFoodDays
	for _, tid := range v.State.TownIDs() {
		if tid == townID {
			continue
		}
		t := v.State.Towns[tid]
		if t.HolderSide != me.HolderSide || t.HolderSide < 0 {
			continue
		}
		if v.State.DistanceBetweenTowns(townID, tid) > c.Campaign.AidRangeLeagues {
			continue
		}
		if t.FoodDays < bestFood {
			best, bestFood = tid, t.FoodDays
		}
	}
	return best, best >= 0
}

// bestTradeTarget returns the most profitable town to trade with.
func bestTradeTarget(v *sim.View, townID int) (int, bool) {
	c := v.Cfg
	me := v.State.Towns[townID]
	if me == nil {
		return 0, false
	}
	best, bestMargin := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t.HolderSide == me.HolderSide {
			continue
		}
		if t.RoadSafety < c.Campaign.TradeMinRoadSafety {
			continue
		}
		d := v.State.DistanceBetweenTowns(townID, tid)
		if d > c.Campaign.TradeRangeLeagues {
			continue
		}
		margin := (t.PriceFood - c.Market.BasePrice) * (1 - d/c.Campaign.TradeRangeLeagues)
		if margin > bestMargin {
			best, bestMargin = tid, margin
		}
	}
	return best, best >= 0
}
