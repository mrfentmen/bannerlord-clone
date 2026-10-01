package main

import (
	"fmt"
	"strconv"
	"strings"

	"mbclone/simulation/internal/model"
)

// buildSnapshot converts live simulation state into the JSON shape the
// campaign client's HttpSimulationProvider expects (see
// clients/campaign/src/data/types.ts SimSnapshot).
func buildSnapshot(s *Server) map[string]any {
	st := s.state
	playerID := s.playerLeaderID()

	towns := make([]map[string]any, 0, len(st.Towns))
	for _, t := range st.Towns {
		towns = append(towns, map[string]any{
			"id":         fmt.Sprintf("town-%d", t.ID),
			"name":       t.Name,
			"factionId":  fmt.Sprintf("side-%d", t.SideID),
			"x":          t.X,
			"y":          t.Y,
			"population": t.Population,
			"prosperity": t.Prosperity,
			"loyalty":    t.Loyalty,
			"unrest":     t.Unrest,
			"taxRate":    t.TaxRate,
			"garrison":   t.Garrison,
			"militia":    t.Militia,
			"food":       t.FoodStock,
			"medicine":   t.MedicineStock,
			"money":      t.Money,
			"prices": map[string]any{
				"food":     t.PriceFood,
				"medicine": t.PriceMedicine,
				"metal":    t.PriceMetal,
			},
		})
	}

	sides := make([]map[string]any, 0, len(st.Sides))
	for _, sd := range st.Sides {
		sides = append(sides, map[string]any{
			"id":   fmt.Sprintf("side-%d", sd.ID),
			"name": sd.Name,
		})
	}

	rulers := make([]map[string]any, 0, len(st.Leaders))
	for _, l := range st.Leaders {
		if !l.IsAlive {
			continue
		}
		rulers = append(rulers, map[string]any{
			"id":        fmt.Sprintf("leader-%d", l.ID),
			"name":      l.Name,
			"factionId": fmt.Sprintf("side-%d", l.SideID),
			"renown":    l.Renown,
			"influence": l.Influence,
			"gold":      l.Gold,
		})
	}

	// Player block: find the player's party.
	var playerParty map[string]any
	playerName := "Player"
	playerFaction := ""
	playerGold := 0.0
	playerRenown := 0.0
	playerInfluence := 0.0
	partyID := ""
	if l, ok := st.Leaders[playerID]; ok {
		playerName = l.Name
		playerFaction = fmt.Sprintf("side-%d", l.SideID)
		playerGold = l.Gold
		playerRenown = l.Renown
		playerInfluence = l.Influence
		for _, p := range st.Parties {
			if p.LeaderID == playerID {
				partyID = fmt.Sprintf("party-%d", p.ID)
				playerParty = map[string]any{
					"id":       partyID,
					"leaderId": fmt.Sprintf("leader-%d", p.LeaderID),
					"troops":   []any{map[string]any{"count": p.Troops, "wounded": p.Wounded}},
					"wounded":  p.Wounded,
					"x":        p.X,
					"y":        p.Y,
					"position": map[string]any{"x": p.X, "z": p.Y},
					"food":     p.Food,
					"medicine": p.Medicine,
					"gold":     p.Gold,
					"morale":   p.Morale,
				}
				break
			}
		}
	}
	if playerParty == nil {
		playerParty = map[string]any{
			"id":       "party-none",
			"troops":   []any{},
			"morale":   0.0,
			"position": map[string]any{"x": 0, "z": 0},
		}
	}

	return map[string]any{
		"day":     st.Tick % 365,
		"year":    st.Year,
		"eraTier": 1,
		"player": map[string]any{
			"partyId":       partyID,
			"characterName": playerName,
			"factionId":     playerFaction,
			"resources": map[string]any{
				"money":    playerGold,
				"gold":     playerGold,
				"food":     100.0,
				"metal":    0.0,
				"medicine": 0.0,
			},
			"influence": playerInfluence,
			"renown":    playerRenown,
		},
		"party":         playerParty,
		"towns":         towns,
		"markets":       map[string]any{},
		"sides":         sides,
		"rulers":        rulers,
		"ledger":        map[string]any{"entries": []any{}, "netPerDay": map[string]any{}},
		"warnings":      []any{},
		"notifications": []any{},
		"causeLog":      map[string]any{},
	}
}

// playerLeaderID returns the leader the API acts as. For now this is the
// first living leader; a real session would pick this at login.
func (s *Server) playerLeaderID() int {
	for id, l := range s.state.Leaders {
		if l.IsAlive {
			return id
		}
	}
	return -1
}

func (s *Server) playerMarching() bool {
	pid := s.playerLeaderID()
	for _, p := range s.state.Parties {
		if p.LeaderID == pid && p.DestTown >= 0 {
			return true
		}
	}
	return false
}

func (s *Server) planMarchTo(destTown int) map[string]any {
	pid := s.playerLeaderID()
	var px, py float64
	for _, p := range s.state.Parties {
		if p.LeaderID == pid {
			px, py = p.X, p.Y
			break
		}
	}
	t := s.state.Towns[destTown]
	if t == nil {
		return map[string]any{"ok": false, "reason": "unknown town"}
	}
	dx, dy := t.X-px, t.Y-py
	dist := (dx*dx + dy*dy)
	// Rough: 1 unit = 1 km, march speed ~30 km/day.
	days := dist / 30.0
	if days < 0.5 {
		days = 0.5
	}
	return map[string]any{
		"ok":               true,
		"destinationTownId": destTown,
		"estimatedDays":    days,
	}
}

func (s *Server) whyChain(entity, field string) map[string]any {
	// Parse "town-37" style IDs.
	parts := strings.Split(entity, "-")
	if len(parts) != 2 {
		return map[string]any{"entity": entity, "field": field, "chain": []any{}}
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil {
		return map[string]any{"entity": entity, "field": field, "chain": []any{}}
	}
	var kind model.Kind
	switch parts[0] {
	case "town":
		kind = model.KindTown
	case "leader":
		kind = model.KindLeader
	case "party":
		kind = model.KindParty
	default:
		return map[string]any{"entity": entity, "field": field, "chain": []any{}}
	}
	rows := s.log.RecentFor(kind, id, []string{field}, 8)
	chain := make([]map[string]any, 0, len(rows))
	for _, rowID := range rows {
		r, ok := s.log.Row(rowID)
		if !ok {
			continue
		}
		chain = append(chain, map[string]any{
			"id":      fmt.Sprintf("cause-%d", r.ID),
			"tick":    r.Tick,
			"old":     r.Old,
			"new":     r.New,
			"causedBy": []any{},
			"note":    r.Note,
			"system":  r.System,
		})
	}
	return map[string]any{
		"entityId":   entity,
		"field":      field,
		"rows":       chain,
		"related":    []any{},
		"totalDepth": len(chain),
		"truncated":  false,
	}
}
