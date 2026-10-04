package campaign

import (
	"context"
	"fmt"
	"math"
	"sync"
)

// Prisoner system: after a win, some enemy survivors become prisoners.
// They eat food, need guards, can be ransomed, recruited, released, or executed.

type PrisonerRank string

const (
	RankTrooper  PrisonerRank = "trooper"
	RankSergeant PrisonerRank = "sergeant"
	RankOfficer  PrisonerRank = "officer"
	RankNotable  PrisonerRank = "notable"
)

type Prisoner struct {
	ID          string
	Name        string
	Rank        PrisonerRank
	FactionID   int
	FactionName string
	RansomValue float64
	Loyalty     float64
	CapturedAt  int
}

type PrisonerView struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Rank        string  `json:"rank"`
	FactionID   string  `json:"factionId,omitempty"`
	FactionName string  `json:"factionName"`
	RansomValue float64 `json:"ransomValue"`
	Loyalty     float64 `json:"loyalty"`
}

type prisonerState struct {
	byID      map[string]*Prisoner
	order     []string
	nextID    int
	lastMercy bool
	fear      float64
}

func newPrisonerState() *prisonerState {
	return &prisonerState{byID: make(map[string]*Prisoner)}
}

var (
	prisonerStatesMu sync.Mutex
	prisonerStates   = map[*Campaign]*prisonerState{}
)

func (c *Campaign) ensurePrisoners() *prisonerState {
	prisonerStatesMu.Lock()
	defer prisonerStatesMu.Unlock()
	ps, ok := prisonerStates[c]
	if !ok {
		ps = newPrisonerState()
		prisonerStates[c] = ps
	}
	return ps
}

func (c *Campaign) captureFromBattleLocked(loserPartyID, loserStartTroops, loserLosses int, winnerIsPlayer, mercy bool) []PrisonerView {
	if !winnerIsPlayer {
		return nil
	}
	ps := c.ensurePrisoners()
	ps.lastMercy = mercy
	survivors := loserStartTroops - loserLosses
	if survivors < 1 {
		return nil
	}
	rate := 0.15
	if mercy {
		rate = 0.45
	}
	cs := c.ensureCompanions()
	{
		for _, id := range cs.hired {
			comp := cs.byID[id]
			if comp != nil && comp.Role == RoleScout && !comp.Dead {
				rate += float64(comp.Skills[SkillScout]) / 500.0
			}
		}
	}
	if rate > 0.7 {
		rate = 0.7
	}
	n := int(math.Round(float64(survivors) * rate))
	if n < 1 && survivors > 0 && rate > 0.1 {
		n = 1
	}
	if n > survivors {
		n = survivors
	}
	if n < 1 {
		return nil
	}
	loser := c.state.Parties[loserPartyID]
	factionName := "Unknown"
	factionID := 0
	if loser != nil {
		factionName = loser.Name
		if s := c.state.Sides[loser.SideID]; s != nil {
			factionName = s.Name
			factionID = s.ID
		}
	}
	out := make([]PrisonerView, 0, n)
	for i := 0; i < n; i++ {
		ps.nextID++
		id := fmt.Sprintf("pris-%d", ps.nextID)
		rank := RankTrooper
		ransom := 20.0
		loyalty := 0.55
		name := fmt.Sprintf("%s fighter %d", factionName, ps.nextID)
		h := hashID(id)
		switch {
		case h > 0.92:
			rank, ransom, loyalty, name = RankNotable, 400, 0.85, factionName+" notable"
		case h > 0.78:
			rank, ransom, loyalty, name = RankOfficer, 150, 0.75, factionName+" officer"
		case h > 0.55:
			rank, ransom, loyalty, name = RankSergeant, 50, 0.65, factionName+" sergeant"
		}
		p := &Prisoner{ID: id, Name: name, Rank: rank, FactionID: factionID, FactionName: factionName, RansomValue: ransom, Loyalty: loyalty, CapturedAt: c.ticksRun}
		ps.byID[id] = p
		ps.order = append(ps.order, id)
		out = append(out, prisonerToView(p))
	}
	return out
}

func (c *Campaign) ListPrisoners(ctx context.Context) ([]PrisonerView, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	out := make([]PrisonerView, 0, len(ps.order))
	for _, id := range ps.order {
		if p := ps.byID[id]; p != nil {
			out = append(out, prisonerToView(p))
		}
	}
	return out, nil
}

func (c *Campaign) RansomPrisoner(ctx context.Context, id string) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	p := ps.byID[id]
	if p == nil {
		return nil, notFoundf("prisoner %s not found", id)
	}
	party := c.state.Parties[c.party]
	if party == nil {
		return nil, conflictf("No party.", "player party missing")
	}
	gold := p.RansomValue
	party.Money += gold
	removePrisonerLocked(ps, id)
	return map[string]any{"id": id, "gold": gold, "message": fmt.Sprintf("Their people paid %.0f for %s. Don't expect gratitude.", gold, p.Name)}, nil
}

func (c *Campaign) RecruitPrisoner(ctx context.Context, id string) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	p := ps.byID[id]
	if p == nil {
		return nil, notFoundf("prisoner %s not found", id)
	}
	party := c.state.Parties[c.party]
	if party == nil {
		return nil, conflictf("No party.", "player party missing")
	}
	renown := 0.0
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		renown = r.Renown
	}
	chance := 0.35 - p.Loyalty*0.25 + math.Min(renown, 50)/200.0
	if chance < 0.05 {
		chance = 0.05
	}
	if chance > 0.75 {
		chance = 0.75
	}
	roll := hashID(id + fmt.Sprintf("-recruit-%d", c.ticksRun))
	if roll > chance {
		return map[string]any{"id": id, "success": false, "message": fmt.Sprintf("%s spat at your boots. Loyalty holds.", p.Name)}, nil
	}
	party.Troops += 1
	if c.ro != nil {
		c.ro.grow("militia", p.Name+" (turned)", 0.4, 1)
	}
	removePrisonerLocked(ps, id)
	return map[string]any{"id": id, "success": true, "message": fmt.Sprintf("%s put down the old colors. One more mouth, one more gun.", p.Name)}, nil
}

func (c *Campaign) ReleasePrisoner(ctx context.Context, id string) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	p := ps.byID[id]
	if p == nil {
		return nil, notFoundf("prisoner %s not found", id)
	}
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		r.Renown += 0.5
	}
	name := p.Name
	removePrisonerLocked(ps, id)
	return map[string]any{"id": id, "message": fmt.Sprintf("You cut %s loose. Word travels. Their people notice.", name)}, nil
}

func (c *Campaign) ExecutePrisoner(ctx context.Context, id string) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	p := ps.byID[id]
	if p == nil {
		return nil, notFoundf("prisoner %s not found", id)
	}
	ps.fear = math.Min(1, ps.fear+0.08)
	if r := c.state.Rulers[c.playerRuler]; r != nil {
		r.Renown -= 1
		if r.Renown < 0 {
			r.Renown = 0
		}
	}
	name := p.Name
	removePrisonerLocked(ps, id)
	return map[string]any{"id": id, "fear": ps.fear, "message": fmt.Sprintf("%s dies in the dirt. The next ones you face may run.", name)}, nil
}

// InterrogatePrisoner extracts intel from a captive.
// Higher rank prisoners know more. The prisoner is not consumed,
// but repeated interrogations yield diminishing returns.
func (c *Campaign) InterrogatePrisoner(ctx context.Context, id string) (map[string]any, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	ps := c.ensurePrisoners()
	p := ps.byID[id]
	if p == nil {
		return nil, notFoundf("prisoner %s not found", id)
	}

	// Intel quality depends on rank.
	intel := map[string]any{"prisoner": p.Name, "rank": string(p.Rank)}
	switch p.Rank {
	case RankNotable, RankOfficer:
		// Officers know troop dispositions and town defenses.
		intel["troopIntel"] = fmt.Sprintf("%s reports %s fields %d troops across their lands.", p.Name, p.FactionName, 100+int(p.Loyalty*500))
		intel["townIntel"] = fmt.Sprintf("Their towns are defended but stretched thin.")
	case RankSergeant:
		intel["troopIntel"] = fmt.Sprintf("%s describes patrol routes and supply trains.", p.Name)
	default:
		intel["troopIntel"] = fmt.Sprintf("%s knows little beyond camp gossip.", p.Name)
	}

	// Interrogation lowers loyalty (they resent it).
	p.Loyalty = math.Max(0, p.Loyalty-0.1)

	return map[string]any{
		"id":      id,
		"intel":   intel,
		"message": fmt.Sprintf("%s talks. Some of it may even be true.", p.Name),
	}, nil
}

func (c *Campaign) prisonerUpkeepLocked() {
	ps := c.ensurePrisoners()
	n := len(ps.order)
	if n == 0 {
		return
	}
	party := c.state.Parties[c.party]
	if party == nil {
		return
	}
	need := float64(n) * 0.5
	if party.Food >= need {
		party.Food -= need
	} else {
		party.Food = 0
		party.Morale -= 2
		if party.Morale < 0 {
			party.Morale = 0
		}
	}
	guardsNeeded := (n + 4) / 5
	guardsHave := int(party.Troops) / 10
	if guardsHave < guardsNeeded && n > 0 {
		escape := guardsNeeded - guardsHave
		if escape > n {
			escape = n
		}
		for i := 0; i < escape && len(ps.order) > 0; i++ {
			id := ps.order[len(ps.order)-1]
			removePrisonerLocked(ps, id)
		}
		party.Morale -= float64(escape)
		if party.Morale < 0 {
			party.Morale = 0
		}
	}
}

func removePrisonerLocked(ps *prisonerState, id string) {
	delete(ps.byID, id)
	for i, x := range ps.order {
		if x == id {
			ps.order = append(ps.order[:i], ps.order[i+1:]...)
			return
		}
	}
}

func prisonerToView(p *Prisoner) PrisonerView {
	return PrisonerView{ID: p.ID, Name: p.Name, Rank: string(p.Rank), FactionName: p.FactionName, RansomValue: p.RansomValue, Loyalty: p.Loyalty}
}
