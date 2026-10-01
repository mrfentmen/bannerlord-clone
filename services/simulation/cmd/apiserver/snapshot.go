package main

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/systems/visibility"
)

// buildSnapshot converts live simulation state into the JSON shape the
// campaign client's HttpSimulationProvider expects (see
// clients/campaign/src/data/types.ts SimSnapshot).
func buildSnapshot(s *Server) map[string]any {
	st := s.state
	playerID := s.playerLeaderID()

	// The player's own side is what fog of war is relative to. Everything about
	// what this side can see is stated against it, so it is resolved once here
	// rather than inside the town loop.
	playerSide := -1
	if l, ok := st.Leaders[playerID]; ok {
		playerSide = l.SideID
	}

	knownSet := make(map[int]bool)
	if playerSide >= 0 {
		for _, id := range visibility.KnownTowns(st, playerSide) {
			knownSet[id] = true
		}
	}
	visibleSet := make(map[int]bool)
	if playerSide >= 0 {
		for _, id := range visibility.CurrentlyVisibleTowns(st, playerSide) {
			visibleSet[id] = true
		}
	}

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
			// Fog of war, per town. A town the player's side has never found is
			// still real and still on the map, and its name is still known from
			// the survey the world was built from; what the side does not know
			// is anything that changes. The three flags say which of the three
			// states this town is in, so a client can dim what is remembered and
			// hide what has never been found without re-deriving any of it.
			"visible":      visibleSet[t.ID],
			"known":        knownSet[t.ID],
			"lastSeenTick": t.LastSeenTick,
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
			// Fog of war per side: how much of the map it is looking at and how
			// much of it it has ever found. Reported for every side rather than
			// only the player's because a client drawing a strategic overview
			// needs the comparison, and because these are counts of knowledge
			// rather than the knowledge itself.
			"visibleTowns": sd.VisibleTowns,
			"knownTowns":   sd.KnownTowns,
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
		"fog":           buildFog(s, playerSide, visibleSet, knownSet),
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

// buildFog renders the fog-of-war state for the snapshot.
//
// It reports the four numbers a client needs to draw the world honestly and
// nothing it could work out for itself: the radius in the units the player
// thinks in, the three counts of towns (visible, remembered, never found), and
// the town's ids for the two states that are not "every town in the list".
//
// The unseen ids are sent as an explicit list rather than left to the client to
// subtract. A client that had to derive "never found" by set-subtraction would
// get it wrong the first time a town was added or removed mid-session, and the
// failure would be a town wrongly shown rather than a town wrongly hidden.
func buildFog(s *Server, playerSide int, visible, known map[int]bool) map[string]any {
	st := s.state
	fog := map[string]any{
		// The radius is stated in both units. Kilometres is what the design was
		// written in and what a player reads; leagues is what the map is
		// measured in and what the client's own coordinate maths uses.
		"sightRadiusKm":      visibility.SightRadiusKm(s.cfg.Visibility),
		"sightRadiusLeagues": visibility.SightRadiusKm(s.cfg.Visibility) / visibility.KM_PER_LEAGUE,
		"sightingMemoryDays": s.cfg.Visibility.SightingMemoryDays,
	}
	if playerSide < 0 {
		// No player means no vantage point, and a fog block claiming zero
		// visibility would be a statement about a side that does not exist.
		// Every list is empty and the counts are null rather than zero, because
		// "nothing" and "nobody is looking" are different answers.
		fog["sideId"] = nil
		fog["visibleTowns"] = []any{}
		fog["knownTowns"] = []any{}
		fog["unseenTowns"] = []any{}
		fog["counts"] = map[string]any{
			"visible": nil, "known": nil, "unseen": nil, "total": len(st.Towns),
		}
		return fog
	}

	visibleIDs := sortedTownIDs(visible)
	knownIDs := sortedTownIDs(known)
	unseenIDs := make([]int, 0, len(st.Towns))
	for _, tid := range st.TownIDs() {
		if st.Towns[tid] == nil || known[tid] {
			continue
		}
		unseenIDs = append(unseenIDs, tid)
	}

	fog["sideId"] = fmt.Sprintf("side-%d", playerSide)
	fog["visibleTowns"] = townRefList(visibleIDs)
	fog["knownTowns"] = townRefList(knownIDs)
	fog["unseenTowns"] = townRefList(unseenIDs)
	fog["counts"] = map[string]any{
		"visible": len(visibleIDs),
		"known":   len(knownIDs),
		"unseen":  len(unseenIDs),
		"total":   len(st.Towns),
	}
	return fog
}

// townRefList renders town ids in the client's "town-N" form, in ascending
// numeric order. The order is numeric rather than the client's id-sorted order
// so that the list is stable and diffable between snapshots; a client that
// cares about drawing order can sort on the number.
func townRefList(ids []int) []any {
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, fmt.Sprintf("town-%d", id))
	}
	return out
}

// sortedTownIDs returns the ids of a town-id set in ascending order. Iterating
// the set directly would give Go's randomised map order, which would make two
// identical snapshots differ in their JSON and break any client that compares
// them.
func sortedTownIDs(set map[int]bool) []int {
	out := make([]int, 0, len(set))
	for id := range set {
		out = append(out, id)
	}
	sort.Ints(out)
	return out
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
		"ok":                true,
		"destinationTownId": destTown,
		"estimatedDays":     days,
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
			"id":       fmt.Sprintf("cause-%d", r.ID),
			"tick":     r.Tick,
			"old":      r.Old,
			"new":      r.New,
			"causedBy": []any{},
			"note":     r.Note,
			"system":   r.System,
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
