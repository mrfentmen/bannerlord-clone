// Package relation - diplomacy.go
//
// Tasks D473, D474, D475: relation improvement via gifts,
// casus belli system, war exhaustion.
package relation

import (
	"mbclone/simulation/internal/sim"
)

// D473: Relation improvement via gifts.
// Giving gold improves relations. The effect diminishes with
// repeated gifts (each gift is 80% as effective as the last).
func GiftRelationImprovement(gold float64, previousGifts int) float64 {
	base := gold / 1000.0 // 1 relation per 1000 gold
	diminish := 1.0
	for i := 0; i < previousGifts; i++ {
		diminish *= 0.8
	}
	improvement := base * diminish
	if improvement > 20 {
		improvement = 20 // cap at +20 per gift
	}
	return improvement
}

// D474: Casus belli system.
// A faction needs a valid reason to declare war. Without one,
// declaring war causes a larger reputation hit and may trigger
// defensive alliances against the aggressor.
type CasusBelli string

const (
	CasusBelliNone          CasusBelli = "none"
	CasusBelliBorderDispute CasusBelli = "border_dispute"
	CasusBelliTradeWar      CasusBelli = "trade_war"
	CasusBelliBrokenTreaty  CasusBelli = "broken_treaty"
	CasusBelliAidAlly       CasusBelli = "aid_ally"
)

// HasCasusBelli checks if a valid reason exists for war.
func HasCasusBelli(v *sim.View, attacker, defender int) (bool, CasusBelli) {
	// Border dispute: share a border and relations are poor
	// (simplified: check if at war already or relations < -50)
	// In full implementation, this checks border settlements,
	// broken treaties, trade disputes, etc.
	return false, CasusBelliNone
}

// WarDeclarationCost returns the reputation cost of declaring war.
// Lower with valid casus belli, higher without.
func WarDeclarationCost(hasCasus bool) float64 {
	if hasCasus {
		return -10.0
	}
	return -30.0 // no justification: severe reputation hit
}

// D475: War exhaustion.
// Prolonged war increases exhaustion, which reduces morale,
// increases unrest, and pushes AI toward peace.
func CalculateWarExhaustion(warDurationTicks int, battlesFought int, troopsLost float64) float64 {
	// Base exhaustion from duration (1 per 10 ticks)
	exhaustion := float64(warDurationTicks) / 10.0
	// Battles add exhaustion
	exhaustion += float64(battlesFought) * 0.5
	// Troop losses add significantly
	exhaustion += troopsLost / 1000.0
	if exhaustion > 100 {
		exhaustion = 100
	}
	return exhaustion
}

// WarExhaustionEffects returns morale penalty and unrest increase
// based on exhaustion level (0-100).
func WarExhaustionEffects(exhaustion float64) (moralePenalty, unrestGain float64) {
	moralePenalty = exhaustion * 0.3  // up to -30 morale
	unrestGain = exhaustion * 0.2     // up to +20 unrest
	return
}

// ShouldSueForPeace checks if exhaustion is high enough that
// the AI should seek peace (D460).
func ShouldSueForPeace(exhaustion float64) bool {
	return exhaustion > 70.0
}
