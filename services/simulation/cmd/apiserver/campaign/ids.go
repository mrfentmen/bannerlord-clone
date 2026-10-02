package campaign

import (
	"strconv"
	"strings"

	"mbclone/simulation/internal/model"
)

// Entity ids on the wire are strings, because every id field in the client's
// types is a string. The scheme is prefix-plus-number, which is unambiguous to
// parse back and legible in a log:
//
//	town-41, village-118, party-7, ruler-12, side-3
//
// A cause-log row is c-9182, which cannot collide with an entity id because no
// entity uses the c prefix.
const (
	prefixTown    = "town-"
	prefixVillage = "village-"
	prefixParty   = "party-"
	prefixRuler   = "ruler-"
	prefixSide    = "side-"
	prefixRow     = "c-"
)

// EntityID formats a simulation id for the wire.
func EntityID(kind model.Kind, id int) string {
	switch kind {
	case model.KindTown:
		return prefixTown + strconv.Itoa(id)
	case model.KindVillage:
		return prefixVillage + strconv.Itoa(id)
	case model.KindParty:
		return prefixParty + strconv.Itoa(id)
	case model.KindRuler:
		return prefixRuler + strconv.Itoa(id)
	case model.KindSide:
		return prefixSide + strconv.Itoa(id)
	default:
		return strconv.Itoa(id)
	}
}

// RowID formats a cause-log row id for the wire.
func RowID(id int) string { return prefixRow + strconv.Itoa(id) }

// ParseEntityID reads an id written by EntityID. The bool is false for anything
// it does not recognise, including a bare number and a cause-row id, so a caller
// that wanted an entity never silently reads a row.
func ParseEntityID(s string) (model.Kind, int, bool) {
	s = strings.TrimSpace(s)
	for _, p := range []struct {
		prefix string
		kind   model.Kind
	}{
		{prefixTown, model.KindTown},
		{prefixVillage, model.KindVillage},
		{prefixParty, model.KindParty},
		{prefixRuler, model.KindRuler},
		{prefixSide, model.KindSide},
	} {
		if !strings.HasPrefix(s, p.prefix) {
			continue
		}
		n, err := strconv.Atoi(strings.TrimPrefix(s, p.prefix))
		if err != nil {
			return model.KindTown, 0, false
		}
		return p.kind, n, true
	}
	return model.KindTown, 0, false
}

// ParseRowID reads an id written by RowID.
func ParseRowID(s string) (int, bool) {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, prefixRow) {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimPrefix(s, prefixRow))
	if err != nil {
		return 0, false
	}
	return n, true
}

// Slug turns a settlement's name into the shared key the client can match
// against its own OSM-derived settlement list.
//
// The client's TownState.settlementId is documented as shared with the client's
// own settlement ids, which this server has never seen. A name slug is the only
// honest key both sides can compute, so it is what the server publishes and what
// every route accepts alongside the simulation's own id. See the contract's
// section 1.
func Slug(name string) string {
	var sb strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			sb.WriteRune(r)
			prevDash = false
		default:
			if !prevDash && sb.Len() > 0 {
				sb.WriteByte('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(sb.String(), "-")
}

// townByRef resolves a town from anything a client might send: the simulation's
// own id, the name slug, or the bare town name. It exists because the client
// sends town.id on order routes but destinationSettlementId on the march routes,
// and this server must answer both without asking the client to change.
func (c *Campaign) townByRef(ref string) (*model.Town, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, false
	}
	if kind, id, ok := ParseEntityID(ref); ok && kind == model.KindTown {
		t, exists := c.state.Towns[id]
		return t, exists && t != nil
	}
	slug := Slug(ref)
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil {
			continue
		}
		if Slug(t.Name) == slug {
			return t, true
		}
	}
	return nil, false
}

// partyByRef resolves a party from an id or a name slug.
func (c *Campaign) partyByRef(ref string) (*model.Party, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, false
	}
	if kind, id, ok := ParseEntityID(ref); ok && kind == model.KindParty {
		p, exists := c.state.Parties[id]
		return p, exists && p != nil
	}
	// A bare integer is a simulation party id. Clients that only know the
	// number should not have to guess the "party-" prefix.
	if id, err := strconv.Atoi(ref); err == nil {
		p, exists := c.state.Parties[id]
		return p, exists && p != nil
	}
	slug := Slug(ref)
	for _, id := range c.state.PartyIDs() {
		p := c.state.Parties[id]
		if p == nil {
			continue
		}
		if Slug(p.Name) == slug {
			return p, true
		}
	}
	return nil, false
}

// rulerByRef resolves a ruler, who is also a notable.
func (c *Campaign) rulerByRef(ref string) (*model.Ruler, bool) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, false
	}
	if kind, id, ok := ParseEntityID(ref); ok && kind == model.KindRuler {
		r, exists := c.state.Rulers[id]
		return r, exists && r != nil
	}
	slug := Slug(ref)
	for _, id := range c.state.RulerIDsSorted() {
		r := c.state.Rulers[id]
		if r == nil {
			continue
		}
		if Slug(r.Name) == slug {
			return r, true
		}
	}
	return nil, false
}

// townRef resolves a town reference and returns nil when it names nothing. It is
// the shape most call sites want: a nil town and a not-found fault are two
// different things, and only some routes care which.
func (c *Campaign) townRef(ref string) *model.Town {
	t, _ := c.townByRef(ref)
	return t
}

// rulerRef resolves a ruler reference, or nil.
func (c *Campaign) rulerRef(ref string) *model.Ruler {
	r, _ := c.rulerByRef(ref)
	return r
}

// rulersOfTown lists the rulers based in a town, sorted by id so every snapshot
// lists them in the same order.
func (c *Campaign) rulersOfTown(townID int) []*model.Ruler {
	var out []*model.Ruler
	for _, id := range c.state.RulerIDsSorted() {
		r := c.state.Rulers[id]
		if r == nil || r.TownID != townID {
			continue
		}
		out = append(out, r)
	}
	return out
}

// heldTowns are the towns the player's side controls. HolderSide is the current
// holder's side, which is what control means; SideID is the generation-time
// assignment and goes stale the moment a town changes hands.
func (c *Campaign) heldTowns() []*model.Town {
	side := c.playerSide()
	var out []*model.Town
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil || t.HolderSide != side {
			continue
		}
		out = append(out, t)
	}
	return out
}

// SystemNames returns the documented system order the engine runs, which includes
// this package's order system. A status route reports it so the systems actually
// running can be read without a separate report command.
func (c *Campaign) SystemNames() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.eng.SystemNames()
}

// TownCount is how many settlements the campaign is running.
func (c *Campaign) TownCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.state.Towns)
}

// RulerCount is how many characters the campaign is running.
func (c *Campaign) RulerCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.state.Rulers)
}
