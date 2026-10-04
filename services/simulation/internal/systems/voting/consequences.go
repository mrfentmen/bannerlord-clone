// Voting consequences: relation effects and outcome application.
//
// From the research (TaleWorlds dev blog):
// - A supporter gains relationship with the sponsor they vote for
//   and loses relationship with the opposing sponsor(s)
// - Expelling a clan costs the expeller -20 relation (code-confirmed)
// - Overruling "draws the ire of vassals" (relation hit)
package voting

// RelationGainForSupport is the relation gained with a sponsor you back.
const RelationGainForSupport = 3.0

// RelationLossForOppose is the relation lost with the sponsor you oppose.
const RelationLossForOppose = -3.0

// ExpelRelationCost is the relation hit for expelling a clan (code-confirmed).
const ExpelRelationCost = -20.0

// OverruleRelationHit is the vassal relation penalty for overruling.
// Exact value unverified; dev blog says it "draws the ire of vassals."
const OverruleRelationHit = -5.0

// VoteConsequence describes the relation changes from a single vote.
type VoteConsequence struct {
	VoterID            int
	SponsorID          int
	OppositionID       int
	RelationWithSponsor    float64
	RelationWithOpposition float64
}

// ConsequenceFor calculates relation changes for one vote.
func ConsequenceFor(v Vote, p Proposal) VoteConsequence {
	c := VoteConsequence{
		VoterID:      v.ClanID,
		SponsorID:    p.SponsorID,
		OppositionID: p.OppositionID,
	}
	if v.ForSponsor {
		c.RelationWithSponsor = RelationGainForSupport
		c.RelationWithOpposition = RelationLossForOppose
	} else {
		c.RelationWithSponsor = RelationLossForOppose
		c.RelationWithOpposition = RelationGainForSupport
	}
	// Don't change relation with yourself
	if v.ClanID == p.SponsorID {
		c.RelationWithSponsor = 0
	}
	if v.ClanID == p.OppositionID {
		c.RelationWithOpposition = 0
	}
	return c
}
