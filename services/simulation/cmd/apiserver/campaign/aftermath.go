package campaign

import (
	"fmt"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/xp"
)

// Aftermath applies a battle result to campaign state.
//
// This is the bridge between the battle sim and the campaign: it takes the
// battle's casualty counts, determines loot, generates prisoners, and updates
// the parties. Without this, a fight ends but nothing changes in the world.
type Aftermath struct {
	// WinnerPartyID is the victorious party.
	WinnerPartyID int
	// LoserPartyID is the defeated party.
	LoserPartyID int
	// WinnerLosses are troops the winner lost.
	WinnerLosses float64
	// LoserLosses are troops the loser lost.
	LoserLosses float64
	// LootMoney is money transferred from loser to winner.
	LootMoney float64
	// PrisonersTaken are enemy survivors captured.
	PrisonersTaken int
}

// splitCasualties divides losses into dead and wounded.
// Base: 60% wounded, 40% dead. A surgeon companion improves survival.
func splitCasualties(losses float64, p *model.Party) (dead, wounded float64) {
	woundedShare := 0.6
	// TODO: check for surgeon companion and increase woundedShare
	wounded = losses * woundedShare
	dead = losses - wounded
	return dead, wounded
}

// ProcessAftermath applies a battle result to the sim state.
// It returns the aftermath summary for the client.
func ProcessAftermath(v *sim.View, w *sim.WriteSet, result *battle.Result, winnerID, loserID int) *Aftermath {
	am := &Aftermath{
		WinnerPartyID: winnerID,
		LoserPartyID:  loserID,
	}

	winner, wok := v.State.Parties[winnerID]
	loser, lok := v.State.Parties[loserID]
	if !wok || !lok {
		return am
	}

	// Casualties from the battle result.
	// Sides[0] is A, Sides[1] is B. We need to map to winner/loser.
	// For now, use the result's per-side casualty counts.
	if len(result.Sides) >= 2 {
		// Assume winner is side 0 if they won, else side 1.
		// This is simplified; a full implementation would track which
		// party was on which side.
		am.WinnerLosses = result.Sides[0].CasualtiesInflicted
		am.LoserLosses = result.Sides[1].CasualtiesInflicted
	}

	// Apply troop losses, split into dead vs wounded.
	// 60% of casualties are wounded (recoverable), 40% are dead.
	// The surgeon's skill (if present) increases the wounded share.
	if am.WinnerLosses > 0 {
		dead, wounded := splitCasualties(am.WinnerLosses, winner)
		w.Add(model.KindParty, winnerID, "troops", -dead,
			fmt.Sprintf("battle dead: %.0f", dead), nil, "battle aftermath")
		if wounded > 0 {
			w.Add(model.KindParty, winnerID, "wounded", wounded,
				fmt.Sprintf("battle wounded: %.0f", wounded), nil, "battle aftermath")
		}
	}
	if am.LoserLosses > 0 {
		dead, wounded := splitCasualties(am.LoserLosses, loser)
		w.Add(model.KindParty, loserID, "troops", -dead,
			fmt.Sprintf("battle dead: %.0f", dead), nil, "battle aftermath")
		if wounded > 0 {
			w.Add(model.KindParty, loserID, "wounded", wounded,
				fmt.Sprintf("battle wounded: %.0f", wounded), nil, "battle aftermath")
		}
	}

	// Loot: winner takes a share of loser's money.
	// The share scales with how decisively they won.
	if loser.Money > 0 {
		lootShare := 0.3 // 30% of loser's money
		am.LootMoney = loser.Money * lootShare
		w.Add(model.KindParty, loserID, "party_money", -am.LootMoney,
			"looted after defeat", nil, "battle loot")
		w.Add(model.KindParty, winnerID, "party_money", am.LootMoney,
			"loot from victory", nil, "battle loot")
	}

	// Prisoners: a fraction of loser survivors are captured.
	// The fraction depends on the loser's remaining troops.
	loserSurvivors := loser.Troops - am.LoserLosses
	if loserSurvivors > 0 {
		// 20% of survivors become prisoners.
		am.PrisonersTaken = int(loserSurvivors * 0.2)
		if am.PrisonersTaken > 0 {
			w.Add(model.KindParty, loserID, "troops", -float64(am.PrisonersTaken),
				fmt.Sprintf("%d captured", am.PrisonersTaken),
				nil, "prisoners taken")
			// Prisoners are tracked on the winner's party.
			// The prisoner system handles the details.
			w.Add(model.KindParty, winnerID, "prisoners", float64(am.PrisonersTaken),
				fmt.Sprintf("%d prisoners taken", am.PrisonersTaken),
				nil, "prisoners taken")
		}
	}

	// Morale: winner gains, loser loses.
	// Leadership skill amplifies the winner's morale gain.
	moraleGain := 0.1
	if winner.RulerID >= 0 {
		if ruler, ok := v.State.Rulers[winner.RulerID]; ok && ruler != nil {
			moraleGain *= 1.0 + float64(ruler.Skills.Leadership)*0.02
		}
	}
	w.Add(model.KindParty, winnerID, "morale", moraleGain,
		"victory", nil, "battle aftermath")
	w.Add(model.KindParty, loserID, "morale", -0.2,
		"defeat", nil, "battle aftermath")

	// Renown for the winner's ruler.
	if winner.RulerID >= 0 {
		if ruler, ok := v.State.Rulers[winner.RulerID]; ok && ruler != nil {
			renownGain := 10.0 + am.LoserLosses*0.01
			w.Add(model.KindRuler, winner.RulerID, "renown", renownGain,
				"battle victory", nil, "battle aftermath")
		}
	}

	// XP: both sides gain experience, winners gain more.
	winnerXP := xp.XPGain(true, am.LoserLosses, winner.Troops)
	loserXP := xp.XPGain(false, am.WinnerLosses, loser.Troops)
	if winnerXP > 0 {
		newXP := winner.XP + winnerXP
		newLevel := xp.LevelFor(newXP)
		w.Set(model.KindParty, winnerID, "xp", newXP, "battle experience", nil, "")
		if newLevel > winner.Level {
			w.Set(model.KindParty, winnerID, "level", float64(newLevel),
				fmt.Sprintf("leveled up to %d", newLevel), nil, "veteran troops")
		}
	}
	if loserXP > 0 {
		newXP := loser.XP + loserXP
		newLevel := xp.LevelFor(newXP)
		w.Set(model.KindParty, loserID, "xp", newXP, "battle experience", nil, "")
		if newLevel > loser.Level {
			w.Set(model.KindParty, loserID, "level", float64(newLevel),
				fmt.Sprintf("leveled up to %d", newLevel), nil, "veteran troops")
		}
	}

	return am
}
