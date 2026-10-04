// Package champion handles arena careers.
//
// Builds on tournament (fights), reputation (fame), bounty (challengers).
// Rise from pit fighter to champion, gain fame and fortune.
package champion

import (
	"mbclone/simulation/internal/systems/bounty"
	"mbclone/simulation/internal/systems/reputation"
	"mbclone/simulation/internal/systems/tournament"
)

// Career is a fighter's arena record.
type Career struct {
	Wins       int
	Losses     int
	KOs        int
	Fame       float64
	TitleHolds int // Times defended championship
}

// WinRate returns the fighter's win percentage.
func (c *Career) WinRate() float64 {
	total := c.Wins + c.Losses
	if total == 0 {
		return 0
	}
	return float64(c.Wins) / float64(total)
}

// FameGain returns fame from a win.
// Uses tournament renown and reputation scaling.
func FameGain(c *Career, entrants int) float64 {
	base := tournament.RenownGain(1, entrants)
	// Undefeated fighters gain more fame.
	if c.Losses == 0 && c.Wins > 5 {
		base *= 1.5
	}
	return base
}

// TitleShot checks if the fighter earns a championship bout.
// Needs high win rate and fame.
func TitleShot(c *Career) bool {
	return c.WinRate() > 0.8 && c.Fame > 50 && c.Wins >= 10
}

// ChallengerBounty returns the bounty on a champion's head.
// Uses bounty system - rivals post bounties to dethrone them.
func ChallengerBounty(c *Career) float64 {
	return bounty.RewardFor(c.Fame, false)
}

// Sponsorship returns income from fame.
// Uses reputation tiers for sponsor interest.
func Sponsorship(c *Career) float64 {
	standing := c.Fame // Fame acts as standing for sponsors
	tier := reputation.Standing(standing)
	switch tier {
	case "allied":
		return 1000
	case "friendly":
		return 500
	case "neutral":
		return 100
	default:
		return 0
	}
}
