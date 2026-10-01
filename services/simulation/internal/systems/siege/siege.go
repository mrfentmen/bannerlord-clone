// Package siege starves a town into opening its gates.
//
// Reads the besieger's supplies, the besieged town's food, infection, loyalty,
// and unrest, and writes the town's food, disease, sanitation, loyalty, unrest,
// the breach progress, and the outcome. It is MARCH_AND_WAR.md section 6 and
// CAUSE_EFFECT.md chain 10: "a siege drains food and spreads disease, loyalty
// falls, and the town opens its gates before the assault".
//
// A siege does not decide the town falls. It makes the conditions for falling,
// and the conditions are read by a separate check that rolls against them, so a
// siege that starves a town still ends at the gates if the town's loyalty
// holds.
package siege

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the siege system.
func System() sim.System {
	return sim.System{
		Name: "siege",
		Doc:  "surrounds a town, drains it of food and health, and lets it capitulate before an assault",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg

	// --- begin sieges ---
	// A besieging party that has arrived at a town it did not already besiege
	// starts a siege. This is a read of shared state, not a call: the party
	// holds itself to be sieging, and this system notices.
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if !p.IsSieging || p.Troops <= 0 {
			continue
		}
		t := v.State.Towns[p.DestTown]
		if t == nil {
			continue
		}
		// Already under siege: this system does not stack sieges, because a
		// second wall of attackers does not double the starvation rate in any
		// sense the player would recognise.
		already := false
		for _, sid := range v.State.SiegeIDs() {
			if s := v.State.Sieges[sid]; s.TownID == t.ID && s.Outcome == model.SiegeOngoing {
				already = true
				break
			}
		}
		if already {
			continue
		}
		// A siege needs an attacker with men and a defender with a town. An
		// empty town cannot be besieged and a lone rider cannot besiege
		// anything.
		if t.Population <= 0 || p.Troops < c.Siege.MinTroopsToBesiege {
			continue
		}
		newSiege := &model.Siege{
			ID:           v.State.NewID(model.IDSiege),
			TownID:       t.ID,
			AttackerID:   pid,
			DefenderID:   t.Holder,
			AttackerSide: p.SideID,
		}
		w.CreateEntity(func(s *model.State) { s.Sieges[newSiege.ID] = newSiege })
		w.Set(model.KindTown, t.ID, "is_besieged", 1,
			"besieged", nil, "under siege")
	}

	// --- run sieges ---
	for _, sid := range v.State.SiegeIDs() {
		s := v.State.Sieges[sid]
		if s.Outcome != model.SiegeOngoing {
			continue
		}
		t := v.State.Towns[s.TownID]
		attacker := v.State.Parties[s.AttackerID]
		if t == nil || attacker == nil || attacker.Troops <= 0 {
			// The besieger is gone: the siege is lifted, which is exactly what
			// happens when a relief force arrives or the attacker gives up.
			s.Outcome = model.SiegeLifted
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeLifted), "attacker gone", nil, "")
			if t != nil {
				w.Set(model.KindTown, s.TownID, "is_besieged", 0, "siege lifted", nil, "")
			}
			continue
		}

		// --- relief ---
		// A friendly army close enough breaks the siege without a battle being
		// fought, which is why a besieged ruler's relief force is worth more
		// than its size suggests.
		relieved := false
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p.Troops <= 0 || p.SideID != t.HolderSide {
				continue
			}
			if p.SideID < 0 {
				continue
			}
			if v.State.DistanceTo(p, t.ID) <= c.Siege.ReliefRadius {
				relieved = true
				break
			}
		}
		if relieved {
			s.Outcome = model.SiegeLifted
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeLifted), "relief force arrived", nil, "")
			w.Set(model.KindTown, s.TownID, "is_besieged", 0, "siege lifted", nil, "")
			continue
		}

		days := s.Days + 1
		w.Set(model.KindSiege, sid, "siege_days", days,
			shared.PairF("previous", s.Days), nil, "")

		// --- the besieger pays too ---
		// A besieging army is stationary and crowded in its own camp, so it
		// burns food and takes disease losses. MARCH_AND_WAR.md section 6 says
		// both sides burn resources every day of a siege, and a siege that
		// only hurt the defenders would be an exploit.
		foodBurn := attacker.Troops * c.Siege.FoodBurnPerTroop
		w.Add(model.KindParty, s.AttackerID, "party_food", -foodBurn,
			shared.PairF("troops", attacker.Troops), nil, "siege camp rations")
		attackerLosses := attacker.Troops * c.Siege.AttritionPerDay
		if attackerLosses > attacker.Troops {
			attackerLosses = attacker.Troops
		}
		w.Add(model.KindParty, s.AttackerID, "troops", -attackerLosses,
			shared.PairF("besieging_troops", attacker.Troops), nil, "disease in the besieging camp")
		w.Add(model.KindSiege, sid, "attacker_loss", attackerLosses,
			shared.PairF("attacker_troops", attacker.Troops), nil, "")

		// --- the besieged town ---
		// A besieged town is cut off. It cannot import, it cannot export, and
		// its people are crowded into whatever space the walls allow. Every
		// term here is a number the player can see change.
		w.Set(model.KindTown, t.ID, "blockade", 1, "besieged", nil, "cut off")
		w.Add(model.KindTown, t.ID, "blockade_days", 1, "besieged", nil, "")

		// The town's food is consumed and cannot be replaced. The food system
		// has already computed the balance; this system only removes the
		// import side by raising blockade, which the food system reads. That
		// is the honest decoupling: the siege does not write food_stock, it
		// writes the condition that makes the food system starve the town.
		//
		// Disease grows. A crowded, unsupplied town with no fresh supplies is
		// the worst possible place to be, and this is chain 10's second link.
		w.Add(model.KindTown, t.ID, "crowding", c.Siege.CrowdingPerDay,
			shared.PairF("besieged_days", days), nil, "refugees crowding in")
		w.Add(model.KindTown, t.ID, "sanitation", -c.Siege.SanitationLossPerDay,
			"besieged", nil, "no clean water, no supply")
		w.Add(model.KindTown, t.ID, "infected", c.Siege.DiseasePerDay,
			"besieged", nil, "disease in a crowded town")
		// Loyalty and unrest both move against the ruler who let this happen.
		// A ruler who abandoned a town under siege is the one they turn on.
		w.Add(model.KindTown, t.ID, "loyalty", -c.Siege.LoyaltyLossPerDay,
			"besieged", nil, "besieged")
		w.Add(model.KindTown, t.ID, "pressure", c.Siege.UnrestLossPerDay,
			"besieged", nil, "besieged")

		read := shared.ReadString(
			shared.PairF("siege_days", days),
			shared.PairF("attacker_troops", attacker.Troops),
			shared.PairF("town_food", t.FoodStock),
			shared.Pair("town_unrest", t.Unrest),
			shared.Pair("town_loyalty", t.Loyalty),
			shared.Pair("town_infected", t.Infected),
			shared.PairF("breach", s.Breach),
		)
		causes := v.Log.RecentFor(model.KindTown, t.ID,
			[]string{"blockade", "food_stock", "food_days", "infected", "crowding", "loyalty", "unrest", "is_besieged"}, 6)

		// --- breach ---
		// Metal buys siege equipment, and equipment breaches walls in days.
		// This is the reason a ruler with no metal cannot take a walled town
		// quickly, and it is why metal matters in a war (ECONOMY.md section 4).
		if attacker.Metal > 0 {
			work := shared.SafeDiv(attacker.Metal*c.Siege.EquipmentPerBreachDay, c.Siege.BreachDays*c.Siege.BreachWorkPerDay)
			// City Walls (Bannerlord's Fortifications) slow the breach work
			// per completed tier.
			work = shared.SafeDiv(work, 1+t.BuildingWalls*c.Siege.WallLevelSlowdown)
			w.Add(model.KindParty, s.AttackerID, "party_metal", -attacker.Metal*0.02,
				"besieging", nil, "siege equipment consumed")
			breach := s.Breach + work
			if breach > 1 {
				breach = 1
			}
			w.Set(model.KindSiege, sid, "breach_progress", breach, read, causes, "breach progress")
			if breach >= 1 {
				s.Outcome = model.SiegeBreached
				w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeBreached), read, causes, "walls breached")
				w.Set(model.KindTown, t.ID, "is_besieged", 0, read, causes, "")
				w.Add(model.KindRuler, s.DefenderID, "influence", -c.Siege.InfluenceLossOnFall,
					"town lost", nil, "town lost to assault")
				continue
			}
		}

		// --- the gates open ---
		// The chain-10 outcome, and the one that matters most, because a
		// captured town taken by assault and a town that surrendered are very
		// different in cost. All three conditions must hold: the town must be
		// hungry, it must have stopped trusting its ruler, and it must be angry.
		// A town that is merely starving but still loyal fights to the end.
		gateRisk := 0.0
		if t.FoodDays < c.Siege.GateOpenFoodDays {
			gateRisk += shared.Clamp01((c.Siege.GateOpenFoodDays - t.FoodDays) / c.Siege.GateOpenFoodDays)
		}
		if t.Loyalty < c.Siege.GateOpenLoyalty {
			gateRisk += shared.Clamp01((c.Siege.GateOpenLoyalty - t.Loyalty) / c.Siege.GateOpenLoyalty)
		}
		if t.Unrest > c.Siege.GateOpenUnrest {
			gateRisk += shared.Clamp01((t.Unrest - c.Siege.GateOpenUnrest) / (1 - c.Siege.GateOpenUnrest))
		}
		gateRisk = shared.Clamp01(gateRisk / 3)
		w.Set(model.KindSiege, sid, "gate_risk", gateRisk, read, causes, "chance the gates open")

		// The more days it goes on, the likelier the gates open: endurance
		// erodes patience, and a ruler's people tire of dying for a wall.
		daysFactor := shared.Clamp01(days / c.Siege.GatePatienceDays)
		chance := c.Siege.GateOpenChance * gateRisk * daysFactor
		if v.Rng.Chance(chance) {
			s.Outcome = model.SiegeGatesOpened
			w.Set(model.KindSiege, sid, "gates_opened", 1, read, causes, "gates opened")
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeGatesOpened), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "is_besieged", 0, read, causes, "")
			// The town changes hands without a battle. The holder loses the
			// town, which is the strategic consequence, and the new holder's
			// authority starts from a conquered population's hostility.
			w.Set(model.KindTown, t.ID, "holder", float64(attacker.RulerID), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "holder_side", float64(attacker.SideID), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "loyalty", c.Siege.LoyaltyAfterSurrender, read, causes, "a defeated population")
			w.Add(model.KindRuler, s.DefenderID, "influence", -c.Siege.InfluenceLossOnFall,
				"town surrendered", nil, "town surrendered without a fight")
			w.Add(model.KindRuler, attacker.RulerID, "renown", c.Influence.RenownPerVictory*c.Siege.RenownForBloodlessWin,
				"town surrendered", nil, "took a town without a battle")
			continue
		}

		// --- stalemate ---
		// A siege cannot last for ever, or a war would never end by exhaustion
		// as MARCH_AND_WAR.md section 7 requires. At the limit the attacker
		// withdraws, and the town is left damaged but held.
		if days > c.Siege.MaxDays {
			s.Outcome = model.SiegeStarved
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeStarved), read, causes, "attacker withdrew")
			w.Set(model.KindTown, t.ID, "is_besieged", 0, read, causes, "")
			w.Add(model.KindRuler, attacker.RulerID, "influence", -c.Siege.InfluenceLossOnFailedSiege,
				"siege failed", nil, "could not take a walled town")
			continue
		}
	}
}
