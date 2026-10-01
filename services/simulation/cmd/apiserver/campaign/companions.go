package campaign

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// Companion roles for party staff.
type CompanionRole string

const (
	RoleSurgeon       CompanionRole = "surgeon"
	RoleScout         CompanionRole = "scout"
	RoleEngineer      CompanionRole = "engineer"
	RoleQuartermaster CompanionRole = "quartermaster"
	RoleNone          CompanionRole = ""
)

const (
	SkillMedic         = "medic"
	SkillScout         = "scout"
	SkillEngineer      = "engineer"
	SkillQuartermaster = "quartermaster"
	SkillFighter       = "fighter"
)

const (
	TraitHotHeaded = "hot-headed"
	TraitCautious  = "cautious"
	TraitSarcastic = "sarcastic"
	TraitLoyal     = "loyal"
	TraitGreedy    = "greedy"
	TraitHonorable = "honorable"
	TraitRuthless  = "ruthless"
	TraitJoker     = "joker"
)

const (
	RecruitGold       = "gold"
	RecruitReputation = "reputation"
	RecruitWinFight   = "win_fight"
)

// Companion is a named hireable NPC.
type Companion struct {
	ID           string
	Name         string
	Backstory    string
	Traits       []string
	Skills       map[string]int
	WageDaily    float64
	RecruitKind  string
	RecruitValue float64
	HometownHint string
	Hired        bool
	Role         CompanionRole
	XP           float64
	Dead         bool
	Left         bool
	LeftReason   string
}

// CompanionView is the JSON shape for the API.
type CompanionView struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Backstory    string         `json:"backstory"`
	Traits       []string       `json:"traits"`
	Skills       map[string]int `json:"skills"`
	WageDaily    float64        `json:"wageDaily"`
	RecruitKind  string         `json:"recruitKind"`
	RecruitValue float64        `json:"recruitValue"`
	Hired        bool           `json:"hired"`
	Role         string         `json:"role,omitempty"`
	XP           float64        `json:"xp"`
	Dead         bool           `json:"dead,omitempty"`
	Available    bool           `json:"available"`
}

type companionState struct {
	byID        map[string]*Companion
	hired       []string
	battlesWon  int
	tavernCache map[int][]string
}

func newCompanionState() *companionState {
	cs := &companionState{
		byID:        make(map[string]*Companion, len(companionPool)),
		tavernCache: make(map[int][]string),
	}
	for i := range companionPool {
		cp := companionPool[i]
		cs.byID[cp.ID] = &cp
	}
	return cs
}

func (c *Campaign) ensureCompanions() *companionState {
	if c.companions == nil {
		c.companions = newCompanionState()
	}
	return c.companions
}

// TavernCompanions returns 0-3 companions available in a town tavern.
func (c *Campaign) TavernCompanions(ctx context.Context, townID int) ([]CompanionView, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	cs := c.ensureCompanions()
	t := c.state.Towns[townID]
	if t == nil {
		return nil, notFoundf("town %d not found", townID)
	}
	ids, ok := cs.tavernCache[townID]
	if !ok {
		ids = pickTavernCompanions(cs, t.Name, townID)
		cs.tavernCache[townID] = ids
	}
	out := make([]CompanionView, 0, len(ids))
	for _, id := range ids {
		comp := cs.byID[id]
		if comp == nil || comp.Hired || comp.Dead || comp.Left {
			continue
		}
		out = append(out, companionToView(comp, true))
	}
	return out, nil
}

func pickTavernCompanions(cs *companionState, townName string, townID int) []string {
	h := int(hashID(fmt.Sprintf("tavern-%d-%s", townID, townName)) * 1000)
	n := h % 4
	if n == 0 {
		return nil
	}
	var candidates, preferred []string
	lower := strings.ToLower(townName)
	for id, comp := range cs.byID {
		if comp.Hired || comp.Dead || comp.Left {
			continue
		}
		candidates = append(candidates, id)
		if comp.HometownHint != "" && strings.Contains(lower, strings.ToLower(comp.HometownHint)) {
			preferred = append(preferred, id)
		}
	}
	sort.Strings(candidates)
	sort.Strings(preferred)
	picked := make([]string, 0, n)
	for _, id := range preferred {
		if len(picked) >= n {
			break
		}
		picked = append(picked, id)
	}
	for _, id := range candidates {
		if len(picked) >= n {
			break
		}
		dup := false
		for _, p := range picked {
			if p == id {
				dup = true
				break
			}
		}
		if !dup {
			picked = append(picked, id)
		}
	}
	return picked
}

// HireCompanion recruits under the companion's condition.
func (c *Campaign) HireCompanion(ctx context.Context, companionID string) (*CompanionView, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	cs := c.ensureCompanions()
	comp := cs.byID[companionID]
	if comp == nil {
		return nil, notFoundf("companion %s not found", companionID)
	}
	if comp.Hired {
		return nil, conflictf("They're already riding with you.", "companion %s already hired", companionID)
	}
	if comp.Dead {
		return nil, conflictf("They're dead.", "companion %s is dead", companionID)
	}
	if comp.Left {
		return nil, conflictf("They already walked.", "companion %s left", companionID)
	}
	party := c.state.Parties[c.party]
	if party == nil {
		return nil, conflictf("No party.", "player party missing")
	}
	switch comp.RecruitKind {
	case RecruitGold:
		if party.Money < comp.RecruitValue {
			return nil, conflictf(fmt.Sprintf("They want %.0f gold up front. You're short.", comp.RecruitValue), "need %.0f gold, have %.0f", comp.RecruitValue, party.Money)
		}
		party.Money -= comp.RecruitValue
	case RecruitReputation:
		renown := 0.0
		if r := c.state.Rulers[c.playerRuler]; r != nil {
			renown = r.Renown
		}
		if renown < comp.RecruitValue {
			return nil, conflictf(fmt.Sprintf("They don't know your name yet. Need renown %.0f.", comp.RecruitValue), "need renown %.0f, have %.0f", comp.RecruitValue, renown)
		}
	case RecruitWinFight:
		if cs.battlesWon < int(comp.RecruitValue) {
			return nil, conflictf(fmt.Sprintf("Win %d fight(s) first. They don't follow losers.", int(comp.RecruitValue)), "need %d battles won, have %d", int(comp.RecruitValue), cs.battlesWon)
		}
	default:
		return nil, badRequestf("unknown recruit kind %q", comp.RecruitKind)
	}
	comp.Hired = true
	cs.hired = append(cs.hired, companionID)
	for tid, ids := range cs.tavernCache {
		filtered := ids[:0]
		for _, id := range ids {
			if id != companionID {
				filtered = append(filtered, id)
			}
		}
		cs.tavernCache[tid] = filtered
	}
	v := companionToView(comp, false)
	return &v, nil
}

// ListHiredCompanions returns companions in the party.
func (c *Campaign) ListHiredCompanions(ctx context.Context) ([]CompanionView, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	cs := c.ensureCompanions()
	out := make([]CompanionView, 0, len(cs.hired))
	for _, id := range cs.hired {
		comp := cs.byID[id]
		if comp == nil || !comp.Hired || comp.Dead || comp.Left {
			continue
		}
		out = append(out, companionToView(comp, false))
	}
	return out, nil
}

// AssignCompanionRole sets a party role.
func (c *Campaign) AssignCompanionRole(ctx context.Context, companionID string, role CompanionRole) (*CompanionView, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	cs := c.ensureCompanions()
	comp := cs.byID[companionID]
	if comp == nil || !comp.Hired || comp.Dead || comp.Left {
		return nil, notFoundf("companion %s not in party", companionID)
	}
	switch role {
	case RoleSurgeon, RoleScout, RoleEngineer, RoleQuartermaster, RoleNone:
	default:
		return nil, badRequestf("unknown role %q", role)
	}
	if role != RoleNone {
		for _, id := range cs.hired {
			other := cs.byID[id]
			if other != nil && other.Role == role && other.ID != companionID {
				other.Role = RoleNone
			}
		}
	}
	comp.Role = role
	v := companionToView(comp, false)
	return &v, nil
}

func (c *Campaign) companionRolesLocked() map[string]string {
	cs := c.ensureCompanions()
	roles := map[string]string{}
	for _, id := range cs.hired {
		comp := cs.byID[id]
		if comp == nil || !comp.Hired || comp.Dead || comp.Left || comp.Role == RoleNone {
			continue
		}
		roles[string(comp.Role)] = comp.ID
	}
	return roles
}

func (c *Campaign) companionWageDailyLocked() float64 {
	cs := c.ensureCompanions()
	var total float64
	for _, id := range cs.hired {
		comp := cs.byID[id]
		if comp != nil && comp.Hired && !comp.Dead && !comp.Left {
			total += comp.WageDaily
		}
	}
	return total
}

func (c *Campaign) recordBattleWinLocked() {
	cs := c.ensureCompanions()
	cs.battlesWon++
}

func companionToView(comp *Companion, available bool) CompanionView {
	skills := make(map[string]int, len(comp.Skills))
	for k, v := range comp.Skills {
		skills[k] = v
	}
	traits := append([]string{}, comp.Traits...)
	return CompanionView{
		ID: comp.ID, Name: comp.Name, Backstory: comp.Backstory, Traits: traits, Skills: skills,
		WageDaily: comp.WageDaily, RecruitKind: comp.RecruitKind, RecruitValue: comp.RecruitValue,
		Hired: comp.Hired, Role: string(comp.Role), XP: comp.XP, Dead: comp.Dead, Available: available,
	}
}
