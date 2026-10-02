// Package player applies queued player and scripted orders to shared state.
//
// Orders are data, not calls (SPEC.md section 4: "player actions are queued
// and applied at tick boundaries"). This is the system that applies them, and
// it writes to the same fields the AI writes, so a player's town and an AI's
// town are governed by identical rules. That is what makes a scripted "dumb
// player" run a fair test: the profile can order a thing, and the consequences
// come out of the same systems either way.
package player

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the player-orders system.
func System() sim.System {
	return sim.System{
		Name: "player",
		Doc:  "applies queued player and scripted orders to shared state",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, o := range v.Orders {
		switch o.Kind {
		case sim.OrderSetTax:
			applyTax(v, w, o)
		case sim.OrderSendAid:
			applyAid(v, w, o)
		case sim.OrderMoveGarrison:
			applyGarrison(v, w, o)
		case sim.OrderBuyMedicine:
			applyMedicine(v, w, o)
		case sim.OrderMarchTo:
			applyMarch(v, w, o)
		case sim.OrderTradeRun:
			applyTrade(v, w, o)
		case sim.OrderHireMercenaries:
			applyMercenaries(v, w, o)
		case sim.OrderRecruitTroops:
			applyRecruit(v, w, o)
		case sim.OrderExecutePrisoner, sim.OrderRansomPrisoner, sim.OrderReleasePrisoner:
			applyPrisoner(v, w, o)
		case sim.OrderDeclareWar, sim.OrderSuePeace:
			applyWar(v, w, o)
		case sim.OrderBuildFortify:
			applyFortify(v, w, o)
		}
	}
}

func applyTax(v *sim.View, w *sim.WriteSet, o sim.Order) {
	t := v.State.Towns[o.TownID]
	if t == nil {
		return
	}
	rate := shared.Clamp(o.Amount, 0, v.Cfg.Currency.TaxMaxRate)
	if rate == t.TaxRate {
		return
	}
	read := shared.ReadString(
		shared.Pair("tax_rate", t.TaxRate),
		shared.Pair("ordered", rate))
	causes := v.Log.RecentFor(model.KindTown, o.TownID, []string{"tax_rate", "unrest", "loyalty", "prosperity"}, 3)
	w.Set(model.KindTown, o.TownID, "tax_rate", rate, read, causes, "the holder set the tax rate")
}

func applyAid(v *sim.View, w *sim.WriteSet, o sim.Order) {
	r := v.State.Leaders[o.LeaderID]
	if r == nil {
		return
	}
	p := v.State.Parties[r.PartyID]
	if p == nil || p.Troops <= 0 {
		return
	}
	dest := v.State.Towns[o.Target]
	if dest == nil {
		return
	}
	// Aid is loaded from the sender's own larder and delivered by the party,
	// so it costs the sender and takes as long as the road does. Aid that were
	// instantaneous and free would make chain 5's recovery prove nothing about
	// whether the systems work.
	load := p.Food * v.Cfg.Campaign.AidOrderShare
	medicine := p.Medicine * v.Cfg.Campaign.AidOrderShare
	w.Add(model.KindParty, p.ID, "party_food", -load, "aid ordered", nil, "cargo loaded for aid")
	w.Add(model.KindParty, p.ID, "party_medicine", -medicine, "aid ordered", nil, "cargo loaded for aid")
	w.Set(model.KindParty, p.ID, "cargo_food", load, "aid ordered", nil, "")
	w.Set(model.KindParty, p.ID, "cargo_medicine", medicine, "aid ordered", nil, "")
	w.Set(model.KindParty, p.ID, "activity", float64(model.ActMarching), "aid ordered", nil, "carrying aid")
	w.Set(model.KindParty, p.ID, "dest_town", float64(o.Target), "aid ordered", nil, "")
	w.Set(model.KindParty, p.ID, "dest_x", dest.X, "aid ordered", nil, "")
	w.Set(model.KindParty, p.ID, "dest_y", dest.Y, "aid ordered", nil, "")
}

// applyGarrison moves troops between a town's garrison and the field. A player
// pulling the garrison out is chain 3's cause, and the security system reads
// the result: the roads are no longer patrolled.
func applyGarrison(v *sim.View, w *sim.WriteSet, o sim.Order) {
	t := v.State.Towns[o.TownID]
	r := v.State.Leaders[o.LeaderID]
	if t == nil || r == nil {
		return
	}
	p := v.State.Parties[r.PartyID]
	if p == nil {
		return
	}
	// A negative amount moves troops out of the town into the field party; a
	// positive amount brings them home.
	delta := o.Amount
	if delta < 0 {
		moving := -delta
		if moving > t.Garrison {
			moving = t.Garrison
		}
		w.Add(model.KindTown, o.TownID, "garrison", -moving,
			shared.PairF("moving", moving), nil, "garrison detached to the field")
		w.Add(model.KindParty, p.ID, "troops", moving,
			shared.PairF("moving", moving), nil, "troops joined the field army")
		return
	}
	if delta > 0 {
		moving := delta
		if moving > p.Troops {
			moving = p.Troops
		}
		w.Add(model.KindParty, p.ID, "troops", -moving,
			shared.PairF("moving", moving), nil, "troops recalled to garrison")
		w.Add(model.KindTown, o.TownID, "garrison", moving,
			shared.PairF("moving", moving), nil, "garrison reinforced")
	}
}

func applyMedicine(v *sim.View, w *sim.WriteSet, o sim.Order) {
	t := v.State.Towns[o.TownID]
	if t == nil {
		return
	}
	amount := o.Amount
	if amount <= 0 {
		return
	}
	// Medicine is bought at the local price, so a town with scarce medicine
	// pays more for it. That is ECONOMY.md section 7's price rule reaching the
	// clinic shelf, and it means a robbed medicine caravan has a second-order
	// cost beyond the doses themselves.
	price := t.PriceMedicine
	if price <= 0 {
		price = 1
	}
	cost := amount * price * v.Cfg.Campaign.MedicineUnitPrice
	if t.Money < cost {
		// The town cannot afford it. A poor town does not get medicine because
		// it decided not to; it does not get it because it cannot pay, which is
		// the same mechanism that makes a rich side's cities survive a
		// blockade better (FACTIONS.md).
		return
	}
	w.Add(model.KindTown, o.TownID, "medicine_stock", amount,
		shared.ReadString(
			shared.PairF("money", t.Money),
			shared.PairF("cost", cost),
			shared.Pair("price_medicine", price)),
		v.Log.RecentFor(model.KindTown, o.TownID, []string{"money", "price_medicine", "medicine_stock"}, 3),
		"clinic stock bought")
	w.Add(model.KindTown, o.TownID, "money", -cost,
		shared.PairF("cost", cost), nil, "medicine bought")
}

func applyMarch(v *sim.View, w *sim.WriteSet, o sim.Order) {
	r := v.State.Leaders[o.LeaderID]
	if r == nil {
		return
	}
	p := v.State.Parties[r.PartyID]
	if p == nil || p.Troops <= 0 {
		return
	}
	t := v.State.Towns[o.Target]
	if t == nil {
		return
	}
	w.Set(model.KindParty, p.ID, "activity", float64(model.ActMarching), "player ordered a march", nil, "marches on the player's order")
	w.Set(model.KindParty, p.ID, "dest_town", float64(o.Target), "player ordered a march", nil, "")
	w.Set(model.KindParty, p.ID, "dest_x", t.X, "player ordered a march", nil, "")
	w.Set(model.KindParty, p.ID, "dest_y", t.Y, "player ordered a march", nil, "")
}

func applyTrade(v *sim.View, w *sim.WriteSet, o sim.Order) {
	r := v.State.Leaders[o.LeaderID]
	if r == nil {
		return
	}
	p := v.State.Parties[r.PartyID]
	if p == nil || p.Troops <= 0 {
		return
	}
	t := v.State.Towns[o.Target]
	if t == nil {
		return
	}
	// A trade run commits capital and buys a load on arrival. It is modelled
	// as a caravan the party carries itself, so the same road risk applies that
	// applies to a merchant's caravan, which is what makes an unsafe road a
	// problem for traders as well as for towns.
	load := p.Money * v.Cfg.Campaign.TradeCapitalShare
	w.Add(model.KindParty, p.ID, "party_money", -load, "trade ordered", nil, "trade capital committed")
	w.Set(model.KindParty, p.ID, "cargo_food", load*v.Cfg.Logistic.FoodShare, "trade ordered", nil, "")
	w.Set(model.KindParty, p.ID, "cargo_metal", load*v.Cfg.Logistic.MetalShare, "trade ordered", nil, "")
	w.Set(model.KindParty, p.ID, "activity", float64(model.ActTrading), "trade ordered", nil, "runs a trade caravan")
	w.Set(model.KindParty, p.ID, "dest_town", float64(o.Target), "trade ordered", nil, "")
	w.Set(model.KindParty, p.ID, "dest_x", t.X, "trade ordered", nil, "")
	w.Set(model.KindParty, p.ID, "dest_y", t.Y, "trade ordered", nil, "")
}

func applyMercenaries(v *sim.View, w *sim.WriteSet, o sim.Order) {
	r := v.State.Leaders[o.LeaderID]
	if r == nil {
		return
	}
	// Hired with gold, paid in money. This is chain 7's premise: a ruler who
	// spends the hard reserve on soldiers in a long war has nothing left when
	// the money runs out.
	if r.Gold < v.Cfg.Currency.MercenaryGold {
		return
	}
	w.Add(model.KindLeader, o.LeaderID, "gold", -v.Cfg.Currency.MercenaryGold,
		"hiring mercenaries", nil, "gold spent on mercenaries")
	w.Add(model.KindLeader, o.LeaderID, "party_money",
		-v.Cfg.Currency.MercenaryWage*20,
		"hiring mercenaries", nil, "advance on mercenary wages")
	w.Add(model.KindLeader, o.LeaderID, "renown", v.Cfg.Currency.MercenaryValue,
		"hiring mercenaries", nil, "hired a company")
}

// applyRecruit recruits volunteers from a town into the leader's party.
// Costs gold per troop, limited by town prosperity (more prosperous towns
// have more willing recruits) and the leader's available gold.
// The party must be physically at the town (within 5km) to recruit.
func applyRecruit(v *sim.View, w *sim.WriteSet, o sim.Order) {
	r := v.State.Leaders[o.LeaderID]
	t := v.State.Towns[o.TownID]
	if r == nil || t == nil {
		return
	}
	// Find the leader's party.
	var party *model.Party
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p != nil && p.LeaderID == r.ID {
			party = p
			break
		}
	}
	if party == nil {
		return
	}
	// Physical presence check: party must be within 5km of the town.
	// Recruitment is in-person; you can't hire from across the map.
	dx := party.X - t.X
	dy := party.Y - t.Y
	distSq := dx*dx + dy*dy
	if distSq > 25 { // 5km squared
		return
	}
	// Available recruits scale with prosperity and town size.
	available := int(t.Prosperity * 20)
	if available < 1 {
		available = 1
	}
	want := int(o.Amount)
	if want < 1 {
		want = 1
	}
	if want > available {
		want = available
	}
	// Cost: 10 gold per recruit (base).
	cost := float64(want * 10)
	if r.Gold < cost {
		// Recruit as many as affordable.
		want = int(r.Gold / 10)
		if want < 1 {
			return
		}
		cost = float64(want * 10)
	}
	w.Add(model.KindLeader, o.LeaderID, "gold", -cost,
		"recruiting troops", nil, "gold spent on recruits")
	w.Add(model.KindParty, party.ID, "troops", float64(want),
		"recruited volunteers", nil, "new recruits joined")
}

// applyPrisoner resolves a captured ruler, which is chain 9's trigger. An
// execution is a policy decision with a large and lasting cost: the loyalty
// system notices the broken oaths, the relation system spreads the damage, and
// a coalition forms out of it. None of that is applied here; this only records
// the decision, and the consequences come out of the same systems as everything
// applyPrisoner handles ransom, release, and execution orders.
// Only the actual captor (the leader whose ID is in the prisoner's captured_by
// field) may issue these orders. This prevents a third party from freeing or
// killing someone else's prisoner.
func applyPrisoner(v *sim.View, w *sim.WriteSet, o sim.Order) {
	c := v.Cfg
	prisoner := v.State.Leaders[o.Target]
	captor := v.State.Leaders[o.LeaderID]
	if prisoner == nil || captor == nil {
		return
	}
	// Captor ownership check: the orderer must be the one holding the prisoner.
	// A prisoner with captured_by == -1 is free; anyone attempting to act on
	// a free prisoner is ignored.
	if prisoner.CapturedBy != o.LeaderID {
		return
	}
	if o.Kind == sim.OrderRansomPrisoner {
		// A ransom is money for a life: gold to the captor, and a quieter
		// outcome than an execution. Split: half to the leader, half to
		// the party treasury (for wages and supplies).
		half := c.RulerAI.PrisonerRansomGold / 2
		w.Add(model.KindLeader, o.LeaderID, "gold", half,
			"ransomed a prisoner", nil, "ransom received (leader share)")
		// Find the captor's party for the party share.
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p != nil && p.LeaderID == o.LeaderID {
				w.Add(model.KindParty, pid, "party_gold", half,
					"ransomed a prisoner", nil, "ransom received (party share)")
				break
			}
		}
		w.Set(model.KindLeader, o.Target, "captured_by", -1, "ransomed", nil, "released for ransom")
		w.AddRelation(o.LeaderID, o.Target, -c.RulerAI.PrisonerRansomRelation, "ransomed", nil, "ransom")
		return
	}
	if o.Kind == sim.OrderReleasePrisoner {
		// A release is the honorable option: the prisoner goes free, and
		// the captor gains relation with the prisoner's faction. This is
		// the primary political tool for building goodwill.
		w.Set(model.KindLeader, o.Target, "captured_by", -1, "released", nil, "released by captor")
		// Grant positive relation with the prisoner (and by extension their side).
		w.AddRelation(o.LeaderID, o.Target, c.RulerAI.PrisonerReleaseRelation, "released a prisoner", nil, "honorable release")
		return
	}
	// An execution. The prisoner dies; the broken oaths and the spreading
	// damage are read by other systems from the shared state this leaves.
	w.Set(model.KindLeader, o.Target, "is_alive", 0, "executed", nil, "executed")
	w.Set(model.KindLeader, o.Target, "captured_by", -1, "executed", nil, "")
	// Dread: executing a prisoner terrifies nearby towns.
	// Towns within 50km lose morale (they fear the same fate).
	if captor != nil {
		for _, tid := range v.State.TownIDs() {
			t := v.State.Towns[tid]
			if t == nil {
				continue
			}
			// Find captor's party position for distance check.
			for _, pid := range v.State.PartyIDs() {
				p := v.State.Parties[pid]
				if p != nil && p.LeaderID == o.LeaderID {
					dx := p.X - t.X
					dy := p.Y - t.Y
					if dx*dx+dy*dy < 2500 { // 50km squared
						w.Add(model.KindTown, tid, "morale", -0.1,
							"execution nearby", nil, "dread from execution")
					}
					break
				}
			}
			break // only check once
		}
	}
	// Every oath the prisoner had made is broken by their death, and the
	// relation system reads the oaths, not this system.
	for _, oath := range v.State.Oaths {
		if oath.Promisee == o.Target && !oath.Broken {
			w.BreakOathByPair(oath.Promisor, o.Target)
		}
	}
	w.AddRelation(o.LeaderID, o.Target, -c.Relation.BrokenOathRelation, "executed a prisoner", nil, "executed a ruler")
	w.Add(model.KindLeader, o.LeaderID, "broken_oaths", 1, "executed a prisoner", nil, "broke an oath by execution")
}

func applyWar(v *sim.View, w *sim.WriteSet, o sim.Order) {
	c := v.Cfg
	r := v.State.Leaders[o.LeaderID]
	if r == nil || r.SideID < 0 {
		return
	}
	other := v.State.Sides[o.Target]
	if other == nil {
		return
	}
	if o.Kind == sim.OrderSuePeace {
		for _, wid := range v.State.WarIDs() {
			war := v.State.Wars[wid]
			if war.EndTick >= 0 {
				continue
			}
			if war.SideA != r.SideID && war.SideB != r.SideID {
				continue
			}
			w.Set(model.KindWar, wid, "war_end_tick", float64(v.Tick),
				"player sued for peace", nil, "peace")
			w.AddSideRelation(war.SideA, war.SideB, c.FactionAI.PeaceRelationGain,
				"player sued for peace", nil, "made peace")
		}
		return
	}
	// Declaring war. The war's existence is a shared fact other systems read.
	war := &model.War{
		ID:        v.State.NewID(model.IDWar),
		SideA:     r.SideID,
		SideB:     other.ID,
		StartTick: float64(v.Tick),
		EndTick:   -1,
		Reason:    model.WarBorder,
	}
	w.CreateEntity(func(s *model.State) { s.Wars[war.ID] = war })
	w.Set(model.KindSide, r.SideID, "side_intent", float64(model.SideWar), "player declared war", nil, "declared war")
	w.Set(model.KindSide, r.SideID, "side_enemy", float64(other.ID), "player declared war", nil, "")
	w.Set(model.KindSide, other.ID, "side_enemy", float64(r.SideID), "player declared war", nil, "")
	w.AddSideRelation(r.SideID, other.ID, -c.Relation.BattleRelation,
		"player declared war", nil, "declared war")
}

func applyFortify(v *sim.View, w *sim.WriteSet, o sim.Order) {
	t := v.State.Towns[o.TownID]
	if t == nil {
		return
	}
	cost := o.Amount * v.Cfg.Campaign.FortifyMetalPerLevel
	if t.Metal < cost {
		return
	}
	w.Add(model.KindTown, o.TownID, "metal", -cost, "fortifying", nil, "walls and equipment")
	w.Add(model.KindTown, o.TownID, "garrison_morale", v.Cfg.Campaign.FortifyMoraleBonus,
		"fortifying", nil, "the town feels safer")
}
