// Package voting AI behavior: how NPC clan leaders decide their vote.
//
// From the research:
// - Merit for an outcome includes relation x 0.8 with the proposer (code)
// - Clans weigh self-interest, available influence, chance of success
// - War votes: sameCultureTownScore + benefit x exposure x allianceFactor - risk + relationScore
// - Tribute dominates: receiving tribute -> oppose war; paying tribute -> favor war
// - Fief votes: fief-less clans get priority, prefer adjacent holdings
// - Clans won't spend if it depletes them below the voting floor
package voting

import "math"

// AIFactors are the inputs to an AI clan's vote decision.
type AIFactors struct {
	// Relation with the sponsor (-100 to 100)
	RelationWithSponsor float64
	// Relation with the opposition sponsor
	RelationWithOpposition float64
	// SelfInterest: how much this decision benefits the clan (-100 to 100)
	SelfInterest float64
	// Influence: the clan's current influence stock
	Influence float64
	// PerceivedChance: how likely the clan thinks their side wins (0-1)
	PerceivedChance float64
	// TributeReceived: positive if this clan receives tribute (oppose war)
	TributeReceived float64
	// TributePaid: positive if this clan pays tribute (favor war)
	TributePaid float64
}

// Merit calculates how attractive the sponsor's side is to this clan.
// Code-derived: merit includes relation x 0.8 with the proposer.
func Merit(f AIFactors) float64 {
	merit := f.RelationWithSponsor * 0.8
	merit -= f.RelationWithOpposition * 0.8
	merit += f.SelfInterest
	return merit
}

// AIVote decides how an NPC clan votes.
// Returns (forSponsor, pushAmount).
func AIVote(f AIFactors, decisionType DecisionType) (bool, float64) {
	// Can't vote without influence
	if !CanVote(f.Influence) {
		return false, 0
	}

	merit := Merit(f)

	// War-specific: tribute flows dominate
	if decisionType == DecisionWar {
		// Receiving tribute -> oppose war (would lose income)
		merit -= f.TributeReceived * 0.5
		// Paying tribute -> favor war (payments are bankrupting)
		merit += f.TributePaid * 0.5
	}

	// Won't back a lost cause if the chance is very low
	// (unless merit is overwhelmingly positive)
	if f.PerceivedChance < 0.2 && merit < 50 {
		// Abstain by voting with minimal push
		forSponsor := merit > 0
		return forSponsor, 0
	}

	forSponsor := merit > 0

	// Choose push tier based on how much they care and can afford
	push := 0.0
	absMerit := math.Abs(merit)
	if absMerit > 60 {
		// Strong feelings: push hard if affordable
		push = PushTierFor(f.Influence, decisionType == DecisionGrantFief)
	} else if absMerit > 20 {
		// Moderate: slight push
		tiers := PushTiers
		if decisionType == DecisionGrantFief {
			tiers = FiefPushTiers
		}
		if f.Influence-tiers[0] >= MinInfluenceToVote {
			push = tiers[0]
		}
	}
	// Low merit: vote but don't spend influence

	return forSponsor, push
}

// WarScore calculates a clan's war enthusiasm.
// Formula from decompiled code:
// sameCultureTownScore + benefit x exposure x allianceFactor - risk + relationScore
func WarScore(sameCultureTowns int, benefit, exposure, allianceFactor, risk, relationScore float64) float64 {
	return float64(sameCultureTowns)*10 + benefit*exposure*allianceFactor - risk + relationScore
}

// FiefDesire calculates how much a clan wants a particular fief.
// Fief-less clans get priority; prefer adjacent holdings.
func FiefDesire(fiefCount int, isAdjacent bool, relationWithRuler float64) float64 {
	desire := 0.0
	if fiefCount == 0 {
		desire += 50 // Fief-less clans get top priority
	}
	if isAdjacent {
		desire += 20 // Prefer contiguous domains
	}
	desire += relationWithRuler * 0.5
	return desire
}
