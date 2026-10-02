package main

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/systems/access"
	"mbclone/simulation/internal/systems/visibility"
)

// buildNotifications drains the sim's pending notifications and converts them
// to the client's Notification shape. Priority is player-relative: anything
// involving the player's side is critical, other battles and sieges are
// important. Draining here means each notification is delivered once, in the
// first snapshot or tick frame after it fires.
func buildNotifications(s *Server, playerSide int) []any {
	st := s.state
	pending := st.DrainNotifications()
	out := make([]any, 0, len(pending))
	for _, n := range pending {
		priority := "important"
		if n.WinnerSide == playerSide || n.LoserSide == playerSide {
			priority = "critical"
		}
		entityID := any(nil)
		if n.TownID >= 0 {
			entityID = fmt.Sprintf("town-%d", n.TownID)
		}
		out = append(out, map[string]any{
			"id":         fmt.Sprintf("notif-%d", n.ID),
			"day":        n.Tick % 365,
			"priority":   priority,
			"text":       n.Text,
			"entityId":   entityID,
			"field":      nil,
			"kind":       n.Kind,
			"winnerSide": n.WinnerSide,
			"loserSide":  n.LoserSide,
		})
	}
	return out
}

// buildSnapshot converts live simulation state into the JSON shape the
// campaign client's HttpSimulationProvider expects (see
// clients/campaign/src/data/types.ts SimSnapshot).
func buildSnapshot(s *Server) map[string]any {
	st := s.state
	playerID := s.playerLeaderID()

	// The player's own side is what fog of war is relative to, and the two id sets that
	// follow from it. Resolved by the shared helper rather than inline, because the tick
	// frame needs the same three answers and two copies of "which side is the player's"
	// is two copies of exactly the bug `playerLeaderID`'s comment is about.
	playerSide, knownSet, visibleSet := fogViewFor(s)

	towns := make([]map[string]any, 0, len(st.Towns))
	for _, t := range st.Towns {
		// Treaty/town-entry, from the player's side: the client greys out
		// trade/recruit/barter in towns whose gates are closed.
		accessStatus, accessReason := access.TownAccess(st, t.SideID, playerSide)
		towns = append(towns, map[string]any{
			"id":         fmt.Sprintf("town-%d", t.ID),
			"name":       t.Name,
			"factionId":  fmt.Sprintf("side-%d", t.SideID),
			"access":     map[string]any{"allowed": accessStatus == access.Allowed, "reason": accessReason},
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
		"villages":      buildVillages(s, playerSide),
		"workshops":     buildWorkshops(st),
		"fog":           buildFog(s, playerSide, visibleSet, knownSet),
		"markets":       map[string]any{},
		"sides":         sides,
		"rulers":        rulers,
		"ledger":        map[string]any{"entries": []any{}, "netPerDay": map[string]any{}},
		"warnings":      []any{},
		"notifications": buildNotifications(s, playerSide),
		"causeLog":      map[string]any{},
	}
}

// buildVillages converts villages to the client's shape, with fog of war
// relative to the player's side. A village never seen is still on the map
// (name known from the survey); what the side does not know is anything that
// changes.
func buildVillages(s *Server, playerSide int) []any {
	st := s.state
	out := make([]any, 0, len(st.Villages))
	// Mirror visibility.sideBit: invalid side IDs get no bit.
	var bit uint64
	if playerSide >= 0 && playerSide < 64 {
		bit = uint64(1) << uint(playerSide)
	}
	for _, vl := range st.Villages {
		sighted := uint64(vl.SightedSides)
		ever := uint64(vl.EverSeenSides)
		out = append(out, map[string]any{
			"id":           fmt.Sprintf("village-%d", vl.ID),
			"name":         vl.Name,
			"factionId":    fmt.Sprintf("side-%d", vl.SideID),
			"x":            vl.X,
			"y":            vl.Y,
			"population":   vl.Population,
			"prosperity":   vl.Prosperity,
			"visible":      sighted&bit != 0,
			"known":        ever&bit != 0,
			"lastSeenTick": vl.LastSeenTick,
		})
	}
	return out
}

// playerLeaderID returns the leader the API acts as.
//
// Resolved once at startup by pickPlayerLeader and never re-derived, because the
// original implementation walked the Leaders map and returned the first living
// lord it happened to reach. Go randomises map iteration, so that returned a
// different lord on successive calls within one request: the panel could read
// the snapshot as one lord, name a trader from it, and have the commit resolved
// against another. Every caller already holds the lock (or is the constructor),
// and the field is immutable after startup, so this needs none.
func (s *Server) playerLeaderID() int { return s.player }

// fogViewFor answers the three questions every fog rendering starts with: which side
// the block is stated from, which towns that side has in sight now, and which it has
// ever had in sight.
//
// Split out of `buildSnapshot` because `broadcastTick` in ws.go needs the same answers,
// and the whole reason the tick frame carries fog is that visibility moves with the
// party. Two inline copies of this would be two places for one of them to fall a tick
// behind, which is the exact symptom the tick frame exists to remove.
//
// Reads `s.state` and takes no lock of its own. Every caller already holds `s.mu`: the
// snapshot handler holds it for the duration of the request, and `broadcastTick` holds
// it across the marshal. A second RLock here would be a lock upgrade from underneath a
// writer, and the deadlock that shape causes is written down in `barter.go`.
func fogViewFor(s *Server) (side int, visible, known map[int]bool) {
	st := s.state
	side = -1
	if l, ok := st.Leaders[s.playerLeaderID()]; ok {
		side = l.SideID
	}
	// Both sets are empty for a side that does not exist, which is what makes the
	// no-vantage-point case below read as "nobody is looking" rather than as a world
	// where every town is unknown.
	visible = make(map[int]bool)
	known = make(map[int]bool)
	if side < 0 {
		return side, visible, known
	}
	for _, id := range visibility.CurrentlyVisibleTowns(st, side) {
		visible[id] = true
	}
	for _, id := range visibility.KnownTowns(st, side) {
		known[id] = true
	}
	return side, visible, known
}

// fogBlock is the `fog` object as it goes on the wire.
//
// A typed struct rather than the map literal this used to be, and the reason is the
// number of producers. There are two now — the HTTP snapshot and every tick frame — and
// two hand-built maps drift: a field added to one is missing from the other, and because
// the tick frame arrives more often than the snapshot the missing one is what the player
// sees. That failure has no error anywhere, so the shape is pinned in a type instead.
//
// The client's counterpart is `FogState` in clients/campaign/src/data/types.ts and the
// two are meant to be read together. The lists are never nil, because the client's
// validator requires arrays and a `null` would read as "unreadable" and discard the
// whole block.
type fogBlock struct {
	// Null when there is no player to state visibility from. See `buildFog`.
	SideID             *string `json:"sideId"`
	SightRadiusKm      float64 `json:"sightRadiusKm"`
	SightRadiusLeagues float64 `json:"sightRadiusLeagues"`
	SightingMemoryDays float64 `json:"sightingMemoryDays"`
	// The simulation tick this block is stated at, in the same unit as every value in
	// LastSeen.
	//
	// Sent because the client has no other clock in that unit and cannot invent one:
	// `snapshot.day` is `Tick % 365`, which wraps every year, and `TickUpdate.tick` was
	// a count of frames this server had pushed since startup. Without a tick in the fog
	// block there is nothing to subtract a last-seen tick from, and every remembered town
	// is permanently the same age. This is the field that makes "seen 12 days ago"
	// computable rather than guessed.
	Tick         int      `json:"tick"`
	VisibleTowns []string `json:"visibleTowns"`
	KnownTowns   []string `json:"knownTowns"`
	UnseenTowns  []string `json:"unseenTowns"`
	// When each known town was last in some side's sight, in the same ticks as `tick`.
	//
	// Only for towns this side has found: a town nobody has ever been near has an age of
	// nothing, and a map of 124 identical -1s would be a frame carrying a fact the client
	// already gets from the town being absent from `knownTowns`. Absence here means never
	// seen, which is the one reading that is unambiguous — the model's own sentinel is
	// -1, the client's is 0, and this block is where that disagreement gets settled
	// rather than passed on.
	LastSeen map[string]int `json:"lastSeen"`
	Counts   fogCounts      `json:"counts"`
}

// fogCounts are the server's three tallies. Nullable for the same reason `SideID` is.
type fogCounts struct {
	Visible *int `json:"visible"`
	Known   *int `json:"known"`
	Unseen  *int `json:"unseen"`
	Total   int  `json:"total"`
}

func intPtr(v int) *int       { return &v }
func strPtr(v string) *string { return &v }

// buildFog renders the fog-of-war state.
//
// It reports the numbers a client needs to draw the world honestly and nothing it could
// work out for itself: the radius in the units the player thinks in, the three counts of
// towns (visible, remembered, never found), and the town's ids for the two states that
// are not "every town in the list".
//
// The unseen ids are sent as an explicit list rather than left to the client to
// subtract. A client that had to derive "never found" by set-subtraction would get it
// wrong the first time a town was added or removed mid-session, and the failure would be
// a town wrongly shown rather than a town wrongly hidden.
func buildFog(s *Server, side int, visible, known map[int]bool) fogBlock {
	st := s.state
	fog := fogBlock{
		// The radius is stated in both units. Kilometres is what the design was
		// written in and what a player reads; leagues is what the map is
		// measured in and what the client's own coordinate maths uses.
		SightRadiusKm:      visibility.SightRadiusKm(s.cfg.Visibility),
		SightRadiusLeagues: visibility.SightRadiusKm(s.cfg.Visibility) / visibility.KM_PER_LEAGUE,
		SightingMemoryDays: s.cfg.Visibility.SightingMemoryDays,
		Tick:               st.Tick,
		VisibleTowns:       []string{},
		KnownTowns:         []string{},
		UnseenTowns:        []string{},
		LastSeen:           map[string]int{},
	}
	if side < 0 {
		// No player means no vantage point, and a fog block claiming zero
		// visibility would be a statement about a side that does not exist.
		// Every list is empty and the counts are null rather than zero, because
		// "nothing" and "nobody is looking" are different answers.
		fog.Counts = fogCounts{Total: len(st.Towns)}
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

	fog.SideID = strPtr(fmt.Sprintf("side-%d", side))
	fog.VisibleTowns = townRefList(visibleIDs)
	fog.KnownTowns = townRefList(knownIDs)
	fog.UnseenTowns = townRefList(unseenIDs)
	// A sighting at or after the current tick is not a sighting, it is a clock that has
	// not gone off yet; both are dropped rather than sent as an age of zero or less.
	for _, tid := range knownIDs {
		if t := st.Towns[tid]; t != nil && t.LastSeenTick >= 0 && t.LastSeenTick <= float64(st.Tick) {
			fog.LastSeen[fmt.Sprintf("town-%d", tid)] = int(t.LastSeenTick)
		}
	}
	fog.Counts = fogCounts{
		Visible: intPtr(len(visibleIDs)),
		Known:   intPtr(len(knownIDs)),
		Unseen:  intPtr(len(unseenIDs)),
		Total:   len(st.Towns),
	}
	return fog
}

// townRefList renders town ids in the client's "town-N" form, in ascending
// numeric order. The order is numeric rather than the client's id-sorted order
// so that the list is stable and diffable between snapshots; a client that
// cares about drawing order can sort on the number.
func townRefList(ids []int) []string {
	out := make([]string, 0, len(ids))
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
	dist := math.Sqrt(dx*dx + dy*dy)
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
	truncated := false
	chain := make([]map[string]any, 0, len(rows))
	seen := map[int]bool{}
	depth := map[int]int{}
	queue := make([]int, 0, len(rows))
	for _, rowID := range rows {
		r, ok := s.log.Row(rowID)
		if !ok {
			truncated = true
			continue
		}
		chain = append(chain, causeNode(r, 0))
		seen[r.ID] = true
		depth[r.ID] = 0
		queue = append(queue, r.ID)
	}

	// Walk what caused each of those rows.
	//
	// This used to send `"causedBy": []any{}` and `"related": []any{}`
	// unconditionally, which made every chain a dead end: the panel could show
	// that the barter system spent a lord's gold and nothing at all about the
	// bargain that spent it. The rows carried their edges all along — every
	// other system had been passing RecentFor into them — so this was a renderer
	// discarding information the log was already keeping.
	//
	// Breadth-first and depth-bounded, because a cause graph is not a tree: the
	// rows for six lines of one deal share a parent, and walking it naively would
	// reprint that parent six times and return a chain longer than the history it
	// summarizes.
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		d := depth[id]
		if d >= whyMaxDepthSteps || len(chain) >= whyMaxRows {
			truncated = true
			break
		}
		r, ok := s.log.Row(id)
		if !ok {
			continue
		}
		for _, parent := range r.CausedBy {
			if seen[parent] {
				continue
			}
			pr, ok := s.log.Row(parent)
			if !ok {
				// A cited event that has aged out of the log. The chain stops
				// here rather than inventing a parent, and `truncated` says so.
				truncated = true
				continue
			}
			seen[pr.ID] = true
			depth[pr.ID] = d + 1
			chain = append(chain, causeNode(pr, d+1))
			queue = append(queue, pr.ID)
		}
	}
	return map[string]any{
		"entityId":   entity,
		"field":      field,
		"rows":       chain,
		"related":    []any{},
		"totalDepth": deepest(chain),
		"truncated":  truncated,
	}
}

// whyMaxRows bounds one chain, so a field with a long history cannot produce a
// response the panel has to render without limit.
const whyMaxRows = 64

// whyMaxDepthSteps bounds how far back a walk goes from the rows it started at.
// Four is enough to get from a number to the bargain that moved it to the market
// row that priced it; deeper than that is history the player did not ask for.
const whyMaxDepthSteps = 4

// deepest is the depth of the furthest row in a chain, which is what the panel
// reports as the chain's depth.
func deepest(chain []map[string]any) int {
	max := 0
	for _, n := range chain {
		if d, ok := n["depth"].(int); ok && d > max {
			max = d
		}
	}
	return max
}

// causeNode renders one row.
//
// Depth is added here rather than kept on the row because it is a property of
// the walk that reached the row, not of the event itself: the same event sits at
// depth 1 behind a lord's gold and at depth 0 behind a query for the deal.
func causeNode(r cause.Row, depth int) map[string]any {
	return map[string]any{
		"id":       fmt.Sprintf("cause-%d", r.ID),
		"tick":     r.Tick,
		"old":      r.Old,
		"new":      r.New,
		"causedBy": causeRefs(r.CausedBy),
		"note":     r.Note,
		"system":   r.System,
		"depth":    depth,
	}
}

// causeRefs renders a row's edges in the same "cause-N" form the chain uses for
// ids, so a client can join on the string rather than having to know that one
// side is a number and the other a reference.
//
// It is always a list and never null, for the same reason renderItems is: an
// empty edge set and a missing one are different answers.
func causeRefs(ids []int) []any {
	out := make([]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, fmt.Sprintf("cause-%d", id))
	}
	return out
}

// buildWorkshops renders workshop data for the snapshot.
func buildWorkshops(st *model.State) []map[string]any {
	out := make([]map[string]any, 0, len(st.Workshops))
	for _, w := range st.Workshops {
		if w == nil {
			continue
		}
		townName := ""
		if t := st.Towns[w.TownID]; t != nil {
			townName = t.Name
		}
		out = append(out, map[string]any{
			"id":       w.ID,
			"townId":   w.TownID,
			"townName": townName,
			"type":     int(w.Type),
			"level":    w.Level,
			"output":   w.OutputStock,
			"workers":  w.Workers,
		})
	}
	return out
}
