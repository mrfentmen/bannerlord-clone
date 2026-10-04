package campaign

import (
	"context"
	"fmt"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
)

// Heritage modifiers for side acceptance. Each side has a preferred heritage
// (lower threshold) and a least-liked heritage (higher threshold). Ethnicity
// raises or lowers the bar but never blocks acceptance entirely.
var heritageModifiers = map[string]float64{
	// Preferred heritage: 0.7x threshold (easier)
	// Neutral: 1.0x threshold
	// Least-liked: 1.5x threshold (harder, but achievable)
	"preferred": 0.7,
	"neutral":   1.0,
	"disliked":  1.5,
}

// JoinSideRequest is a request to join a side.
type JoinSideRequest struct {
	SideID int `json:"side_id"`
}

// JoinSideResponse is the result of a join request.
type JoinSideResponse struct {
	Accepted   bool    `json:"accepted"`
	Reason     string  `json:"reason"`
	Threshold  float64 `json:"threshold"`
	PlayerScore float64 `json:"player_score"`
}

// JoinSide handles a player's request to join a side.
func (c *Campaign) JoinSide(ctx context.Context, req wire.JoinSideRequest) (any, error) {
	player, ok := c.state.Rulers[c.playerRuler]
	if !ok || player == nil {
		return nil, fmt.Errorf("player ruler not found")
	}

	// Already in a side?
	if player.SideID >= 0 {
		return &JoinSideResponse{
			Accepted: false,
			Reason:   "You are already a member of a side.",
		}, nil
	}

	side, ok := c.state.Sides[req.SideID]
	if !ok || side == nil {
		return nil, fmt.Errorf("side %d not found", req.SideID)
	}

	// Calculate acceptance threshold.
	// Base threshold from renown + influence.
	baseThreshold := 100.0

	// Heritage modifier: ethnicity affects the bar, never blocks.
	modifier := heritageModifierFor(player.Heritage, side)
	threshold := baseThreshold * modifier

	// Player score from renown and influence.
	score := player.Renown + player.Influence*0.5

	accepted := score >= threshold
	reason := ""
	if accepted {
		reason = fmt.Sprintf("Welcome to %s.", side.Name)
	} else {
		needed := threshold - score
		reason = fmt.Sprintf("You need %.0f more renown/influence to join %s.", needed, side.Name)
		if modifier > 1.0 {
			reason += " Your heritage makes this harder, but not impossible."
		}
	}

	return &JoinSideResponse{
		Accepted:    accepted,
		Reason:      reason,
		Threshold:   threshold,
		PlayerScore: score,
	}, nil
}

// heritageModifierFor returns the threshold multiplier for a heritage/side combo.
// This is a simplified version: in a full implementation, each side would have
// per-heritage attitudes. For the sprint, we use a simple rule.
func heritageModifierFor(heritage string, side *model.Side) float64 {
	// Default to neutral.
	return heritageModifiers["neutral"]
}

// AcceptJoinSide processes an accepted join (called after JoinSide returns accepted).
func (c *Campaign) AcceptJoinSide(sideID int) error {
	player, ok := c.state.Rulers[c.playerRuler]
	if !ok || player == nil {
		return fmt.Errorf("player ruler not found")
	}
	player.SideID = sideID
	return nil
}
