package campaign

import (
	"math"
	"sort"

	"mbclone/simulation/cmd/apiserver/wire"
)

// The client's TROOP_TIERS ladder, transcribed because the server has to keep a
// stack's tier inside its bounds and has to know what a promotion costs in XP.
// The ladder itself is the client's; the server never invents a sixth tier.
var troopTiers = []struct {
	Name           string
	XPToNext       float64 // per soldier; zero means the top tier
	CombatMultiply float64
	WageMultiply   float64
}{
	{Name: "Recruit", XPToNext: 100, CombatMultiply: 1.0, WageMultiply: 1.0},
	{Name: "Militia", XPToNext: 250, CombatMultiply: 1.3, WageMultiply: 1.4},
	{Name: "Soldier", XPToNext: 500, CombatMultiply: 1.7, WageMultiply: 1.9},
	{Name: "Veteran", XPToNext: 1000, CombatMultiply: 2.2, WageMultiply: 2.5},
	{Name: "Elite", XPToNext: 0, CombatMultiply: 2.8, WageMultiply: 3.2},
}

const maxTier = 5

// stack is one named unit type in the player's party.
//
// model.Party holds troops as a single float64 count, and that is deliberate: the
// simulation cares about how many bodies a column has and what they cost to feed,
// not what they are called. The client wants a roster, so this is the roster. It
// is the runner's own state, written by the recruitment route and read by the
// snapshot route, and it never feeds back into a simulation result.
type stack struct {
	ID      string
	Name    string
	Count   int
	Quality float64
	Tier    int
	XP      float64
	// Morale is the stack's own morale, seeded from the party's and tracking it
	// as the party falls, so a demoralised column shows up per stack rather
	// than only in the party total.
	Morale float64
}

// goodHold is what the party has paid for one good, so the client's avgPaid is a
// real average of real trades rather than a figure with nothing behind it.
type goodHold struct {
	Quantity  float64
	TotalPaid float64
	Bought    float64
}

// AvgPaid is the running mean price per unit paid, or zero when nothing has been
// bought, which is the honest answer when there is no average to give.
func (g *goodHold) AvgPaid() float64 {
	if g.Bought <= 0 {
		return 0
	}
	return g.TotalPaid / g.Bought
}

// roster is the player's army book: named stacks, per-good holdings, and the
// path the party's soldiers actually marched.
type roster struct {
	stacks []*stack
	goods  map[string]*goodHold
	// marchStart is the tick the party's current march began, or -1 when it is
	// stationary. The client shows this as marchingSinceDay.
	marchStart int
}

func newRoster() *roster {
	return &roster{goods: map[string]*goodHold{}, marchStart: -1}
}

// stack finds a stack by its wire id.
func (ro *roster) stack(id string) *stack {
	for _, s := range ro.stacks {
		if s.ID == id {
			return s
		}
	}
	return nil
}

// countOf is how many of a unit type the party holds, or zero.
func (ro *roster) countOf(unitID string) int {
	if s := ro.stack(unitID); s != nil {
		return s.Count
	}
	return 0
}

// grow recruits into a stack, creating it when the unit type is new. It is the
// roster's write side, called once a hire has been committed.
func (ro *roster) grow(unitID, name string, quality float64, qty int) *stack {
	if qty <= 0 {
		return ro.stack(unitID)
	}
	return ro.add(unitID, name, qty, quality, 0)
}

// remove takes soldiers out of a stack, dissolving an empty one. Attrition and
// desertion are why a stack empties, so leaving an empty stack behind would be a
// lie about the army book.
func (ro *roster) remove(unitID string, qty int) {
	s := ro.stack(unitID)
	if s == nil {
		return
	}
	s.Count -= qty
	if s.Count <= 0 {
		ro.drop(unitID)
	}
}

// drop removes a unit type from the roster outright.
func (ro *roster) drop(unitID string) {
	for i, other := range ro.stacks {
		if other.ID == unitID {
			ro.stacks = append(ro.stacks[:i], ro.stacks[i+1:]...)
			return
		}
	}
}

// total is the whole party, which is what the simulation's troops field holds.
func (ro *roster) total() int {
	n := 0
	for _, s := range ro.stacks {
		n += s.Count
	}
	return n
}

// awardXP banks battle experience against a stack, capped at what the next tier
// needs. Capping matters: without it a long campaign accumulates an unbounded XP
// number that means nothing, because the ladder ends at Elite.
func (ro *roster) awardXP(id string, xp float64) float64 {
	s := ro.stack(id)
	if s == nil || xp <= 0 {
		return 0
	}
	cap := ro.xpCapFor(s)
	if cap > 0 && s.XP+xp > cap {
		xp = cap - s.XP
	}
	if xp <= 0 {
		return 0
	}
	s.XP += xp
	return xp
}

// xpCapFor is the most XP a stack can usefully hold: what its next tier costs,
// which is the client's per-soldier threshold times the stack's count. A stack
// already at the top tier has no ceiling, because there is nothing above it.
func (ro *roster) xpCapFor(s *stack) float64 {
	if s.Tier >= maxTier {
		return 0
	}
	return troopTiers[s.Tier-1].XPToNext * float64(maxInt(s.Count, 1))
}

// xpNeededFor is the XP a promotion costs, from the client's per-soldier
// threshold times the stack's count. Zero at the top tier.
func (ro *roster) xpNeededFor(s *stack) float64 {
	if s == nil || s.Tier >= maxTier {
		return 0
	}
	return troopTiers[s.Tier-1].XPToNext * float64(maxInt(s.Count, 1))
}

// promote spends a stack's banked XP and raises it a tier.
func (ro *roster) promote(id string) (*stack, float64, bool) {
	s := ro.stack(id)
	if s == nil {
		return nil, 0, false
	}
	if s.Tier >= maxTier {
		return s, 0, false
	}
	need := ro.xpNeededFor(s)
	if s.XP < need {
		return s, 0, false
	}
	s.XP -= need
	s.Tier++
	s.Quality = math.Max(s.Quality, float64(s.Tier))
	return s, need, true
}

// hold records a purchase, keeping the running average the client shows.
func (ro *roster) hold(goodID string, qty, paid float64) {
	h := ro.goods[goodID]
	if h == nil {
		h = &goodHold{}
		ro.goods[goodID] = h
	}
	if qty > 0 {
		h.Quantity += qty
		h.TotalPaid += paid
		h.Bought += qty
	}
}

// unhold records a sale, dropping the running average's basis rather than
// pretending the party still paid for stock it no longer has.
func (ro *roster) unhold(goodID string, qty float64) {
	h := ro.goods[goodID]
	if h == nil {
		return
	}
	h.Quantity -= qty
	if h.Quantity <= 0 {
		h.Quantity = 0
	}
	if h.Bought > 0 {
		h.Bought = math.Max(0, h.Bought-qty)
	}
}

// syncToParty keeps the roster honest against the simulation's own count.
//
// The simulation is the authority on how many soldiers the party has: attrition,
// desertion, and the upkeep system's minimum-size rule all change troops without
// the server being told. Rather than let the roster drift away from the
// simulation, the difference is pushed onto the largest stack, which is where
// losses actually land in a column that has no muster.
func (ro *roster) syncToParty(simTroops float64) {
	want := int(math.Round(simTroops))
	if want < 0 {
		want = 0
	}
	got := ro.total()
	if got == want {
		return
	}
	switch {
	case len(ro.stacks) == 0:
		if want > 0 {
			ro.stacks = append(ro.stacks, &stack{
				ID: "levy", Name: "Levies", Count: want, Quality: 1, Tier: 1,
			})
		}
	case want <= 0:
		ro.stacks = ro.stacks[:0]
	default:
		ro.stacks[0].Count += want - got
		if ro.stacks[0].Count <= 0 {
			ro.drop(ro.stacks[0].ID)
		}
	}
}

// add recruits into a stack, creating it when the unit type is new.
func (ro *roster) add(unitID, name string, qty int, quality, morale float64) *stack {
	if s := ro.stack(unitID); s != nil {
		s.Count += qty
		s.Quality = quality
		return s
	}
	s := &stack{
		ID: unitID, Name: name, Count: qty,
		Quality: quality, Tier: tierForQuality(quality), Morale: morale,
	}
	ro.stacks = append(ro.stacks, s)
	return s
}

// followMorale carries the party's morale onto every stack, so the army book
// agrees with the simulation about how the column feels.
func (ro *roster) followMorale(morale float64) {
	for _, s := range ro.stacks {
		s.Morale = morale
	}
}

// render builds the roster for the wire.
//
// simTroops is the simulation's own count for the party, which is the authority:
// attrition, desertion, and the upkeep system's minimum-size rule all change it
// without telling the server. The roster is reconciled against it before it is
// shown, so the army book can never disagree with the world about how many men
// the column has.
//
// wage is what the upkeep system charges per soldier. It is passed in rather
// than read from a config here, so the figure the roster shows is exactly the
// figure the simulation takes, by construction.
func (ro *roster) render(simTroops, wage float64) []wire.TroopStack {
	ro.syncToParty(simTroops)
	out := make([]wire.TroopStack, 0, len(ro.stacks))
	for _, st := range ro.stacks {
		if st.Count <= 0 {
			continue
		}
		out = append(out, wire.TroopStack{
			ID:      st.ID,
			Name:    st.Name,
			Count:   st.Count,
			Quality: round2(st.Quality),
			Tier:    st.Tier,
			XP:      round2(st.XP),
			Wage:    round3(wage),
			Morale:  round2(st.Morale),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// tierForQuality maps a 0-5 quality onto the client's 1-5 tier ladder, rounding
// up so any measurable quality is at least a Recruit.
func tierForQuality(q float64) int {
	t := int(math.Ceil(q))
	if t < 1 {
		return 1
	}
	if t > maxTier {
		return maxTier
	}
	return t
}

// tierName is the ladder's name for a tier, which the roster shows.
func tierName(tier int) string {
	if tier < 1 {
		tier = 1
	}
	if tier > maxTier {
		tier = maxTier
	}
	return troopTiers[tier-1].Name
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }
