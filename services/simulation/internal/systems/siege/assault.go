package siege

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

func trySally(v *sim.View, w *sim.WriteSet, s *model.Siege, attacker *model.Party, t *model.Town) {
	defTroops := t.Population * 0.05
	if defTroops < 10 {
		defTroops = 10
	}
	rel := defTroops / (attacker.Troops + 1)
	chance := sallyBaseChance * shared.Clamp01(rel*2)
	if t.FoodStock <= 0 {
		chance *= 1.5
	}
	if !v.Rng.Chance(chance) {
		return
	}
	sallyForce := defTroops * 0.4
	if sallyForce > attacker.Troops*0.6 {
		sallyForce = attacker.Troops * 0.6
	}
	if sallyForce > attacker.Troops*0.3 {
		breach := s.Breach * 0.85
		w.Set(model.KindSiege, s.ID, "breach_progress", breach, "sally", nil, "engines damaged")
		loss := attacker.Troops * 0.05
		w.Add(model.KindParty, s.AttackerID, "troops", -loss, "sally", nil, "sally casualties")
		w.Add(model.KindSiege, s.ID, "attacker_loss", loss, "sally", nil, "sally casualties")
	} else {
		w.Add(model.KindTown, t.ID, "population", -sallyForce*0.5, "sally", nil, "failed sally")
	}
}

func resolveAssault(v *sim.View, w *sim.WriteSet, s *model.Siege, attacker *model.Party, t *model.Town) {
	cfg := v.Cfg
	defTroops := t.Population * 0.05
	if defTroops < 20 {
		defTroops = 20
	}
	if defTroops > 500 {
		defTroops = 500
	}
	casMult := 1.0
	if s.Breach < 1 {
		casMult = assaultCasMult
	}
	effectiveAtt := attacker.Troops / casMult
	attackerWins := effectiveAtt >= defTroops*0.75*0.9

	attLossRatio := 0.25 * casMult
	defLossRatio := 0.40
	if attackerWins {
		attLossRatio = 0.15 * casMult
		defLossRatio = 0.70
	}
	attLoss := attacker.Troops * attLossRatio
	if attLoss > attacker.Troops {
		attLoss = attacker.Troops
	}
	w.Add(model.KindParty, s.AttackerID, "troops", -attLoss, "assault", nil, "assault casualties")
	w.Add(model.KindSiege, s.ID, "attacker_loss", attLoss, "assault", nil, "assault casualties")
	w.Add(model.KindTown, t.ID, "population", -defTroops*defLossRatio, "assault", nil, "garrison casualties")

	if attackerWins {
		s.Outcome = model.SiegeBreached
		w.Set(model.KindSiege, s.ID, "siege_outcome", float64(model.SiegeBreached), "assault", nil, "town taken")
		w.Set(model.KindTown, t.ID, "is_besieged", 0, "assault", nil, "")
		w.Set(model.KindTown, t.ID, "holder", float64(attacker.RulerID), "assault", nil, "captured")
		w.Set(model.KindTown, t.ID, "holder_side", float64(attacker.SideID), "assault", nil, "captured")
		w.Set(model.KindTown, t.ID, "loyalty", cfg.Siege.LoyaltyAfterSurrender*0.8, "assault", nil, "conquered")
		w.Add(model.KindRuler, s.DefenderID, "influence", -cfg.Siege.InfluenceLossOnFall,
			"town fell", nil, "town taken by assault")
		w.Add(model.KindRuler, attacker.RulerID, "renown", cfg.Influence.RenownPerVictory,
			"town fell", nil, "took a town by assault")
	}
}
