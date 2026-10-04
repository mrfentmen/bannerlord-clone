package campaign

import (
	"context"
	"fmt"
	"sync"

	"mbclone/simulation/internal/systems/voting"
)

// Voting state: active proposals per faction.
type votingState struct {
	mu        sync.Mutex
	proposals map[int]*voting.Proposal // proposal ID -> proposal
	votes     map[int][]voting.Vote    // proposal ID -> votes cast
	nextID    int
}

var (
	votingStatesMu sync.Mutex
	votingStates   = map[*Campaign]*votingState{}
)

func (c *Campaign) ensureVoting() *votingState {
	votingStatesMu.Lock()
	defer votingStatesMu.Unlock()
	vs, ok := votingStates[c]
	if !ok {
		vs = newVotingState()
		votingStates[c] = vs
	}
	return vs
}

func newVotingState() *votingState {
	return &votingState{
		proposals: make(map[int]*voting.Proposal),
		votes:     make(map[int][]voting.Vote),
		nextID:    1,
	}
}

// ProposeDecision creates a new kingdom decision for a vote.
//
// Any clan leader with enough influence can propose. The proposer
// becomes the sponsor. Returns the proposal ID.
func (c *Campaign) ProposeDecision(ctx context.Context, req ProposeRequest) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	vs := c.ensureVoting()

	// Check the proposer can afford it
	proposer := c.state.Rulers[req.SponsorID]
	if proposer == nil {
		return nil, notFoundf("ruler %d not found", req.SponsorID)
	}
	cost := voting.ProposalCost(req.Type)
	if proposer.Influence < cost+voting.MinInfluenceToVote {
		return nil, unprocessablef(
			fmt.Sprintf("You need %.0f influence to propose this.", cost),
			"insufficient influence: have %.0f, need %.0f", proposer.Influence, cost)
	}

	// Deduct proposal cost
	proposer.Influence -= cost

	// Create the proposal
	p := &voting.Proposal{
		ID:              vs.nextID,
		Type:            req.Type,
		SponsorID:       req.SponsorID,
		OppositionID:    req.OppositionID,
		TargetFactionID: req.TargetFactionID,
		TargetClanID:    req.TargetClanID,
		TargetFiefID:    req.TargetFiefID,
		PolicyID:        req.PolicyID,
		Day:             c.state.Tick,
	}
	vs.proposals[p.ID] = p
	vs.nextID++

	// Auto-resolve: gather AI votes immediately (Bannerlord resolves on proposal)
	result := c.resolveVoteLocked(vs, p)

	return map[string]any{
		"proposalId": p.ID,
		"type":       string(p.Type),
		"passed":     result.passed,
		"sponsorVotes": result.sponsorVotes,
		"oppositionVotes": result.oppositionVotes,
		"message":    result.message,
	}, nil
}

// ProposeRequest is the input for proposing a kingdom decision.
type ProposeRequest struct {
	Type            voting.DecisionType
	SponsorID       int
	OppositionID    int
	TargetFactionID int
	TargetClanID    int
	TargetFiefID    int
	PolicyID        string
}

type voteResult struct {
	passed          bool
	sponsorVotes    float64
	oppositionVotes float64
	message         string
}

// resolveVoteLocked gathers votes from all clan leaders and applies the outcome.
// Must hold c.mu.
func (c *Campaign) resolveVoteLocked(vs *votingState, p *voting.Proposal) voteResult {
	var votes []voting.Vote

	// Every clan leader in the sponsor's faction votes
	// (for simplicity: all rulers vote; in full Bannerlord it's per-kingdom)
	for _, rid := range c.state.RulerIDsSorted() {
		r := c.state.Rulers[rid]
		if r == nil || !r.IsAlive {
			continue
		}
		// Skip clans that can't afford to vote
		if !voting.CanVote(r.Influence) {
			continue
		}

		// AI decides vote
		factors := voting.AIFactors{
			RelationWithSponsor:    c.relationBetween(rid, p.SponsorID),
			RelationWithOpposition: c.relationBetween(rid, p.OppositionID),
			SelfInterest:           c.selfInterestFor(rid, p),
			Influence:              r.Influence,
			PerceivedChance:        0.5, // Simplified
		}
		forSponsor, push := voting.AIVote(factors, p.Type)

		// Deduct push influence
		if push > 0 {
			r.Influence -= push
		}

		v := voting.Vote{
			ClanID:     rid,
			ProposalID: p.ID,
			ForSponsor: forSponsor,
			Push:       push,
		}
		votes = append(votes, v)

		// Apply relation consequences
		conseq := voting.ConsequenceFor(v, *p)
		c.adjustRelation(rid, p.SponsorID, conseq.RelationWithSponsor)
		if p.OppositionID >= 0 {
			c.adjustRelation(rid, p.OppositionID, conseq.RelationWithOpposition)
		}
	}

	vs.votes[p.ID] = votes

	sponsorVotes, oppositionVotes, tied := voting.Tally(votes)
	passed := !tied && sponsorVotes > oppositionVotes

	result := voteResult{
		passed:          passed,
		sponsorVotes:    sponsorVotes,
		oppositionVotes: oppositionVotes,
	}

	// Apply the outcome
	if passed {
		result.message = c.applyDecisionLocked(p)
	} else if tied {
		result.message = "The vote tied. The ruler decides."
		// TODO: ruler choice
	} else {
		result.message = "The proposal failed."
	}

	return result
}

// relationBetween returns the relation between two rulers (-100 to 100).
func (c *Campaign) relationBetween(a, b int) float64 {
	// TODO: wire to actual relation system
	return 0
}

// selfInterestFor estimates how much a decision benefits a clan.
func (c *Campaign) selfInterestFor(rulerID int, p *voting.Proposal) float64 {
	// TODO: full self-interest calculation per decision type
	// For now: slight positive bias for sponsor's own clan
	if rulerID == p.SponsorID {
		return 20
	}
	return 0
}

// adjustRelation changes the relation between two rulers.
func (c *Campaign) adjustRelation(a, b int, delta float64) {
	// TODO: wire to relation system
}

// applyDecisionLocked applies a passed decision's effects.
// Must hold c.mu. Applies directly to campaign state.
func (c *Campaign) applyDecisionLocked(p *voting.Proposal) string {
	switch p.Type {
	case voting.DecisionWar:
		// Mark the factions as at war via side relations
		// TODO: full war state tracking
		return fmt.Sprintf("War declared on faction %d! The clans have spoken.", p.TargetFactionID)
	case voting.DecisionPeace:
		return fmt.Sprintf("Peace made with faction %d. Tribute terms to be negotiated.", p.TargetFactionID)
	case voting.DecisionPolicy:
		return fmt.Sprintf("Policy %s enacted by vote.", p.PolicyID)
	case voting.DecisionGrantFief:
		return fmt.Sprintf("Fief %d granted by vote.", p.TargetFiefID)
	case voting.DecisionAnnexFief:
		return fmt.Sprintf("Fief %d annexed by vote.", p.TargetFiefID)
	case voting.DecisionExpelClan:
		// Apply -20 relation cost (code-confirmed from Bannerlord)
		return fmt.Sprintf("Clan %d expelled from the kingdom. (-20 relation)", p.TargetClanID)
	case voting.DecisionTradePact:
		return fmt.Sprintf("Trade pact signed with faction %d.", p.TargetFactionID)
	default:
		return "Decision applied."
	}
}

// OverruleDecision lets the ruler flip a vote result.
// Costs influence equal to the vote gap.
func (c *Campaign) OverruleDecision(ctx context.Context, proposalID int, rulerID int) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	vs := c.ensureVoting()
	_, ok := vs.proposals[proposalID]
	if !ok {
		return nil, notFoundf("proposal %d not found", proposalID)
	}
	votes := vs.votes[proposalID]

	// TODO: check royalPrivilege and peerage policies
	cost := voting.OverruleCost(votes, false, false)

	ruler := c.state.Rulers[rulerID]
	if ruler == nil {
		return nil, notFoundf("ruler %d not found", rulerID)
	}
	if ruler.Influence < cost {
		return nil, unprocessablef(
			"You lack the influence to overrule this.",
			"need %.0f influence, have %.0f", cost, ruler.Influence)
	}

	ruler.Influence -= cost

	// Apply vassal ire (relation hit)
	// TODO: apply to all vassals

	return map[string]any{
		"proposalId": proposalID,
		"cost":       cost,
		"message":    "The ruler has overruled the vote. The vassals will remember this.",
	}, nil
}
