package campaign

import (
	"fmt"

	"mbclone/simulation/internal/battle"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
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

	// Apply troop losses.
	if am.WinnerLosses > 0 {
		w.Add(model.KindParty, winnerID, "troops", -am.WinnerLosses,
			fmt.Sprintf("battle casualties: %.0f lost", am.WinnerLosses),
			nil, "battle aftermath")
	}
	if am.LoserLosses > 0 {
		w.Add(model.KindParty, loserID, "troops", -am.LoserLosses,
			fmt.Sprintf("battle casualties: %.0f lost", am.LoserLosses),
			nil, "battle aftermath")
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
	w.Add(model.KindParty, winnerID, "morale", 0.1,
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

	return am
}
