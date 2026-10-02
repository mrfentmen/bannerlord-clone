package campaign

import (
	"mbclone/simulation/internal/systems/bandit"
)

// ListBandits returns active raider parties for GET /v1/bandits.
func (c *Campaign) ListBandits() []map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.state == nil {
		return nil
	}
	return bandit.ListBandits(c.state)
}

// ClaimBounty attempts to claim a bounty. Returns (reward, true) on success.
// Credits gold to the player's party.
func (c *Campaign) ClaimBounty(id int) (float64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.state == nil {
		return 0, false
	}
	reward := bandit.ClaimBounty(id, c.state)
	if reward <= 0 {
		return 0, false
	}
	if p := c.state.Parties[c.party]; p != nil {
		p.Gold += reward
	}
	return reward, true
}
