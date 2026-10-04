// Package voting implements Bannerlord-style kingdom decisions.
//
// Any clan leader with enough influence can propose a decision.
// The proposer becomes the sponsor, an opposition sponsor is chosen,
// and every clan leader votes, optionally spending influence to push
// their side. Majority wins; ties go to the ruler for free; the ruler
// can overrule by spending influence equal to the vote gap.
//
// Based on TaleWorlds dev blog (2019) and decompiled v1.3.15 game code.
package voting

// DecisionType is what kind of kingdom decision is being voted on.
type DecisionType string

const (
	DecisionWar        DecisionType = "war"         // Declare war on another faction
	DecisionPeace      DecisionType = "peace"       // Make peace (with tribute terms)
	DecisionPolicy     DecisionType = "policy"      // Enact or repeal a kingdom policy
	DecisionGrantFief  DecisionType = "grant_fief"  // Grant a captured fief to a clan
	DecisionAnnexFief  DecisionType = "annex_fief"  // Take a fief from another clan
	DecisionExpelClan  DecisionType = "expel_clan"  // Expel a clan from the kingdom
	DecisionTradePact  DecisionType = "trade_pact"  // Trade agreement with another faction
)

// ProposalCost returns the influence cost to propose a decision.
// Code-derived from decompiled v1.3.15 (DefaultDiplomacyModel).
func ProposalCost(t DecisionType) float64 {
	switch t {
	case DecisionWar:
		return 200
	case DecisionPeace:
		return 100
	case DecisionPolicy:
		return 100
	case DecisionGrantFief:
		return 0 // Automatic on capture, no proposal cost
	case DecisionAnnexFief:
		return 200
	case DecisionExpelClan:
		return 200
	case DecisionTradePact:
		return 200
	default:
		return 100
	}
}

// Push tiers: influence a clan can spend to back their chosen outcome.
// Slightly favor / Strongly favor / Fully push.
var PushTiers = []float64{20, 60, 150}

// FiefPushTiers are the cheaper tiers for fief votes.
var FiefPushTiers = []float64{20, 60, 100}

// MinInfluenceToVote is the floor below which clans stop participating.
// Community-observed: clans at ~100 or less influence sit out entirely.
const MinInfluenceToVote = 100

// SupportClanCost is the influence cost to "support a clan in a decision"
// (also grants relation with that clan).
const SupportClanCost = 50

// Proposal is a kingdom decision put to a vote.
type Proposal struct {
	ID               int
	Type             DecisionType
	SponsorID        int // Clan leader who proposed (ruler ID)
	OppositionID     int // Opposition sponsor (ruler ID, -1 if none)
	TargetFactionID  int // For war/peace/trade: the other faction
	TargetClanID     int // For annex/expel: the targeted clan
	TargetFiefID     int // For fief decisions: the settlement
	PolicyID         string
	Day              int
}

// Vote is a single clan's ballot.
type Vote struct {
	ClanID    int // Ruler ID of the voting clan leader
	ProposalID int
	// Side: true = for the sponsor, false = for the opposition
	ForSponsor bool
	// Push is influence spent to add weight (0, or one of the push tiers)
	Push float64
}

// Tally counts votes and returns the result.
// Each clan gets 1 base vote; push influence adds weight.
// Returns (sponsorVotes, oppositionVotes, tied).
func Tally(votes []Vote) (sponsor, opposition float64, tied bool) {
	for _, v := range votes {
		weight := 1.0 + v.Push/50 // Each 50 influence ≈ 1 extra vote of weight
		if v.ForSponsor {
			sponsor += weight
		} else {
			opposition += weight
		}
	}
	tied = sponsor == opposition
	return sponsor, opposition, tied
}

// Passed returns true if the sponsor's side won outright.
func Passed(votes []Vote) bool {
	s, o, tied := Tally(votes)
	if tied {
		return false // Ties go to ruler, not automatic pass
	}
	return s > o
}

// OverruleCost returns the influence the ruler must spend to flip a result.
// Cost = majority votes minus minority votes (the gap).
// Royal Privilege policy: -20%. Peerage policy: x2.
func OverruleCost(votes []Vote, royalPrivilege, peerage bool) float64 {
	s, o, _ := Tally(votes)
	gap := s - o
	if gap < 0 {
		gap = -gap
	}
	// Convert vote gap to influence: each vote of gap costs ~50 influence
	cost := gap * 50
	if royalPrivilege {
		cost *= 0.8
	}
	if peerage {
		cost *= 2
	}
	return cost
}

// PushTierFor returns the highest push tier a clan can afford.
// Clans won't spend if it would drop them below the voting floor.
func PushTierFor(influence float64, isFief bool) float64 {
	tiers := PushTiers
	if isFief {
		tiers = FiefPushTiers
	}
	best := 0.0
	for _, t := range tiers {
		if influence-t >= MinInfluenceToVote {
			best = t
		}
	}
	return best
}

// CanVote returns true if a clan has enough influence to participate.
func CanVote(influence float64) bool {
	return influence > MinInfluenceToVote
}

// BribeCost returns the influence cost to bribe a clan leader's vote.
// Higher relation = cheaper. Based on the "support a clan" mechanic (50 base).
func BribeCost(relation float64) float64 {
	base := float64(SupportClanCost)
	// Good relations make bribes cheaper, bad relations make them pricier
	modifier := 1.0 - (relation / 200)
	if modifier < 0.5 {
		modifier = 0.5
	}
	if modifier > 2.0 {
		modifier = 2.0
	}
	return base * modifier
}

// CanPropose returns true if a clan can afford to propose this decision.
func CanPropose(influence float64, t DecisionType) bool {
	return influence-ProposalCost(t) >= MinInfluenceToVote
}
