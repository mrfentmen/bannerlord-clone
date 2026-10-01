// Package siege implements the siege lifecycle: prepare, bombard, sally, starve, assault.
package siege

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

const (
	preparingDays   = 3.0 // ticks building siege equipment before bombardment
	sallyBaseChance = 0.08
	assaultCasMult  = 2.0 // attacker casualties when assaulting unbreached walls
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
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if !p.IsSieging || p.Troops <= 0 {
			continue
		}
		t := v.State.Towns[p.DestTown]
		if t == nil {
			continue
		}
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
		w.Set(model.KindTown, t.ID, "is_besieged", 1, "besieged", nil, "under siege")
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
			s.Outcome = model.SiegeLifted
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeLifted), "attacker gone", nil, "")
			if t != nil {
				w.Set(model.KindTown, s.TownID, "is_besieged", 0, "siege lifted", nil, "")
			}
			continue
		}

		relieved := false
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p.Troops <= 0 || p.SideID != t.HolderSide || p.SideID < 0 {
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
		w.Set(model.KindSiege, sid, "siege_days", days, shared.PairF("previous", s.Days), nil, "")

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

		w.Set(model.KindTown, t.ID, "blockade", 1, "besieged", nil, "cut off")
		w.Add(model.KindTown, t.ID, "blockade_days", 1, "besieged", nil, "")
		w.Add(model.KindTown, t.ID, "crowding", c.Siege.CrowdingPerDay,
			shared.PairF("besieged_days", days), nil, "refugees crowding in")
		w.Add(model.KindTown, t.ID, "sanitation", -c.Siege.SanitationLossPerDay,
			"besieged", nil, "no clean water, no supply")
		w.Add(model.KindTown, t.ID, "infected", c.Siege.DiseasePerDay,
			"besieged", nil, "disease in a crowded town")
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

		// --- sally (defender may sortie) ---
		trySally(v, w, s, attacker, t)

		// --- preparing phase: no breach work for the first few days ---
		if days < preparingDays {
			continue
		}

		// --- breach / bombarding ---
		if attacker.Metal > 0 {
			work := shared.SafeDiv(attacker.Metal*c.Siege.EquipmentPerBreachDay, c.Siege.BreachDays*c.Siege.BreachWorkPerDay)
			work = shared.SafeDiv(work, 1+t.BuildingWalls*c.Siege.WallLevelSlowdown)
			w.Add(model.KindParty, s.AttackerID, "party_metal", -attacker.Metal*0.02,
				"besieging", nil, "siege equipment consumed")
			breach := s.Breach + work
			if breach > 1 {
				breach = 1
			}
			w.Set(model.KindSiege, sid, "breach_progress", breach, read, causes, "breach progress")
			if breach >= 1 {
				if attacker.Troops > 50 {
					resolveAssault(v, w, s, attacker, t)
					if s.Outcome != model.SiegeOngoing {
						continue
					}
				}
			}
		}

		// --- the gates open ---
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

		daysFactor := shared.Clamp01(days / c.Siege.GatePatienceDays)
		chance := c.Siege.GateOpenChance * gateRisk * daysFactor
		if v.Rng.Chance(chance) {
			s.Outcome = model.SiegeGatesOpened
			w.Set(model.KindSiege, sid, "gates_opened", 1, read, causes, "gates opened")
			w.Set(model.KindSiege, sid, "siege_outcome", float64(model.SiegeGatesOpened), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "is_besieged", 0, read, causes, "")
			w.Set(model.KindTown, t.ID, "holder", float64(attacker.RulerID), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "holder_side", float64(attacker.SideID), read, causes, "surrendered")
			w.Set(model.KindTown, t.ID, "loyalty", c.Siege.LoyaltyAfterSurrender, read, causes, "a defeated population")
			w.Add(model.KindRuler, s.DefenderID, "influence", -c.Siege.InfluenceLossOnFall,
				"town surrendered", nil, "town surrendered without a fight")
			w.Add(model.KindRuler, attacker.RulerID, "renown", c.Influence.RenownPerVictory*c.Siege.RenownForBloodlessWin,
				"town surrendered", nil, "took a town without a battle")
			continue
		}

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
