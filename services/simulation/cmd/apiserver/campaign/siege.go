package campaign

import (
	"context"
	"fmt"
	"strconv"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
)

// toWireSiege converts a model.Siege into the wire shape.
// Phase is derived from outcome/breach until full phase fields land in the model.
func (c *Campaign) toWireSiege(s *model.Siege) *wire.Siege {
	attTroops := 0
	if p := c.state.Parties[s.AttackerID]; p != nil {
		attTroops = int(p.Troops)
	}
	defTroops := 20
	if t := c.state.Towns[s.TownID]; t != nil {
		g := int(t.Garrison)
		if g > 0 {
			defTroops = g
		} else {
			defTroops = int(t.Population * 0.05)
			if defTroops < 20 {
				defTroops = 20
			}
		}
	}
	phase := "preparing"
	outcome := "ongoing"
	wallHP := 100.0 * (1.0 - s.Breach)
	if wallHP < 0 {
		wallHP = 0
	}
	switch s.Outcome {
	case model.SiegeOngoing:
		outcome = "ongoing"
		if s.Breach >= 1 {
			phase = "breached"
			wallHP = 0
		} else if s.Days >= 3 {
			phase = "bombarding"
		} else {
			phase = "preparing"
		}
	case model.SiegeBreached:
		outcome, phase, wallHP = "breached", "breached", 0
	case model.SiegeGatesOpened:
		outcome, phase = "gates_opened", "resolved"
	case model.SiegeLifted:
		outcome, phase = "lifted", "resolved"
	case model.SiegeStarved:
		outcome, phase = "starved", "resolved"
	}
	return &wire.Siege{
		ID:              strconv.Itoa(s.ID),
		TownID:          s.TownID,
		AttackerPartyID: s.AttackerID,
		DefenderRulerID: s.DefenderID,
		Phase:           phase,
		Outcome:         outcome,
		Days:            int(s.Days),
		WallHP:          wallHP,
		Food:            s.Supply,
		AttackerTroops:  attTroops,
		DefenderTroops:  defTroops,
		Equipment:       s.Breach * 10,
		Morale:          70 - s.Days*1.5,
		GateRisk:        s.GateRisk,
		Breach:          s.Breach,
	}
}

// StartSiege creates a siege of townId by attackerPartyId.
func (c *Campaign) StartSiege(ctx context.Context, attackerPartyID, townID int) (*wire.Siege, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	p := c.state.Parties[attackerPartyID]
	if p == nil {
		return nil, fmt.Errorf("attacker party %d not found", attackerPartyID)
	}
	t := c.state.Towns[townID]
	if t == nil {
		return nil, fmt.Errorf("town %d not found", townID)
	}
	if p.Troops < c.cfg.Siege.MinTroopsToBesiege {
		return nil, fmt.Errorf("party has insufficient troops to besiege (need %.0f)", c.cfg.Siege.MinTroopsToBesiege)
	}
	for _, sid := range c.state.SiegeIDs() {
		s := c.state.Sieges[sid]
		if s.TownID == townID && s.Outcome == model.SiegeOngoing {
			return nil, fmt.Errorf("town %d is already under siege", townID)
		}
	}

	id := c.state.NewID(model.IDSiege)
	s := &model.Siege{
		ID:           id,
		TownID:       townID,
		AttackerID:   attackerPartyID,
		DefenderID:   t.Holder,
		AttackerSide: p.SideID,
		Outcome:      model.SiegeOngoing,
		Supply:       t.FoodStock,
	}
	if s.Supply <= 0 {
		s.Supply = 14
	}
	c.state.Sieges[id] = s
	t.IsBesieged = true
	p.IsSieging = true
	p.DestTown = townID

	return c.toWireSiege(s), nil
}

// GetSiege returns siege status by numeric id string.
func (c *Campaign) GetSiege(ctx context.Context, idStr string) (*wire.Siege, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return nil, fmt.Errorf("invalid siege id %q", idStr)
	}
	s := c.state.Sieges[id]
	if s == nil {
		return nil, fmt.Errorf("siege %s not found", idStr)
	}
	return c.toWireSiege(s), nil
}

// ListSieges returns all sieges.
func (c *Campaign) ListSieges(ctx context.Context) ([]*wire.Siege, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]*wire.Siege, 0, len(c.state.Sieges))
	for _, sid := range c.state.SiegeIDs() {
		if s := c.state.Sieges[sid]; s != nil {
			out = append(out, c.toWireSiege(s))
		}
	}
	return out, nil
}

// AssaultSiege marks the siege for assault resolution on the next tick.
func (c *Campaign) AssaultSiege(ctx context.Context, idStr string) (*wire.Siege, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return nil, fmt.Errorf("invalid siege id %q", idStr)
	}
	s := c.state.Sieges[id]
	if s == nil {
		return nil, fmt.Errorf("siege %s not found", idStr)
	}
	if s.Outcome != model.SiegeOngoing {
		return nil, fmt.Errorf("siege %s is already resolved", idStr)
	}
	if s.Days < 3 {
		return nil, fmt.Errorf("cannot assault while still preparing siege equipment")
	}
	s.Breach = 1
	return c.toWireSiege(s), nil
}

// LiftSiege abandons the siege.
func (c *Campaign) LiftSiege(ctx context.Context, idStr string) (*wire.Siege, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return nil, fmt.Errorf("invalid siege id %q", idStr)
	}
	s := c.state.Sieges[id]
	if s == nil {
		return nil, fmt.Errorf("siege %s not found", idStr)
	}
	if s.Outcome != model.SiegeOngoing {
		return nil, fmt.Errorf("siege %s is already resolved", idStr)
	}
	s.Outcome = model.SiegeLifted
	if t := c.state.Towns[s.TownID]; t != nil {
		t.IsBesieged = false
	}
	if p := c.state.Parties[s.AttackerID]; p != nil {
		p.IsSieging = false
	}
	return c.toWireSiege(s), nil
}
