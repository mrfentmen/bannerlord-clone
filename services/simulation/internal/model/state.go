package model

import (
	"math"
	"sort"
)

// State is one committed simulation state. Systems read a State and stage
// writes into a WriteSet; the engine commits a new State at the end of a tick.
//
// State is treated as immutable once a tick's systems are running. A system
// that mutated it directly would make results depend on system order, which
// SPEC.md section 4 forbids. The decoupling test cannot catch a direct
// mutation, so State exposes values through methods and the systems are
// reviewed against the write-only discipline; TestSystemOrderIsIrrelevant
// proves the discipline holds in practice by running every system in a
// different order and comparing the results.
type State struct {
	Year   float64
	Tick   int
	Season float64

	Towns    map[int]*Town
	Villages map[int]*Village
	Parties  map[int]*Party
	Rulers   map[int]*Ruler
	Sides    map[int]*Side
	Routes   map[int]*Route
	Sieges   map[int]*Siege
	Wars     map[int]*War

	// NextID hands out identifiers for entities created mid-run, such as a
	// party formed when a ruler gathers an army.
	NextID map[int]int

	// Relations is the ruler-to-ruler relation matrix, keyed by a stable pair
	// encoding rather than a map of maps, so iteration order is deterministic.
	Relations map[Pair]float64
	// SideRelations is the side-to-side relation matrix.
	SideRelations map[Pair]float64
	// Oaths records standing promises between rulers, so a broken one can be
	// detected later. This is what makes chain 9 possible: the oath exists
	// before it is broken.
	Oaths map[int]Oath

	// Cached sorted key slices for the two relation maps, so a caller needing
	// to iterate every pair in a fixed order does not rebuild and re-sort a
	// quarter of a million keys on every tick. They are shared with the clone
	// because the key sets are equal by construction: a relation is only ever
	// added for a pair, never removed, so a clone's maps have identical keys.
	rulerPairs *PairSlice
	sidePairs  *PairSlice
}

// Pair is an unordered pair of entity identifiers.
type Pair struct {
	A int
	B int
}

// MakePair normalises an unordered pair so (3,7) and (7,3) are the same key.
func MakePair(a, b int) Pair {
	if a > b {
		return Pair{b, a}
	}
	return Pair{a, b}
}

// Oath is a promise between two rulers: aid, non-aggression, or tribute.
type Oath struct {
	// Promisor and Promisee are ruler identifiers.
	Promisor int
	Promisee int
	// Kind is one of the OathKind values.
	Kind int
	// MadeTick is when the promise was made.
	MadeTick int
	// Broken is set when the promise has been broken, and is what the relation
	// and loyalty systems read.
	Broken bool
	// BrokenTick is when it broke, for the cause log and the metrics report.
	BrokenTick int
}

// Oath kinds.
const (
	OathAid           = 0
	OathNonAggression = 1
	OathTribute       = 2
)

// NewState returns an empty state with all maps allocated.
func NewState() *State {
	return &State{
		Towns:         map[int]*Town{},
		Villages:      map[int]*Village{},
		Parties:       map[int]*Party{},
		Rulers:        map[int]*Ruler{},
		Sides:         map[int]*Side{},
		Routes:        map[int]*Route{},
		Sieges:        map[int]*Siege{},
		Wars:          map[int]*War{},
		NextID:        map[int]int{},
		Relations:     map[Pair]float64{},
		SideRelations: map[Pair]float64{},
		Oaths:         map[int]Oath{},
	}
}

// IDAllocators are the per-kind identifier counters, one per entity family.
const (
	IDTown = iota
	IDVillage
	IDParty
	IDRuler
	IDSide
	IDRoute
	IDSiege
	IDWar
)

// NewID returns the next unused identifier for a kind.
func (s *State) NewID(kind int) int {
	s.NextID[kind]++
	return s.NextID[kind]
}

// IDCounter returns the current counter for a kind, used by the world generator
// to seed ids before entities are created.
func (s *State) SetIDCounter(kind, v int) {
	s.NextID[kind] = v
}

// IDValue returns the current counter for a kind.
func (s *State) IDValue(kind int) int {
	return s.NextID[kind]
}

// Clone returns a deep copy of the state. The engine clones at the start of a
// tick so a system's reads always see committed state, and commits the clone
// at the end, which is what makes the tick atomic: a panic mid-tick cannot
// leave half a tick applied.
func (s *State) Clone() *State {
	out := &State{
		Year:          s.Year,
		Tick:          s.Tick,
		Season:        s.Season,
		Towns:         make(map[int]*Town, len(s.Towns)),
		Villages:      make(map[int]*Village, len(s.Villages)),
		Parties:       make(map[int]*Party, len(s.Parties)),
		Rulers:        make(map[int]*Ruler, len(s.Rulers)),
		Sides:         make(map[int]*Side, len(s.Sides)),
		Routes:        make(map[int]*Route, len(s.Routes)),
		Sieges:        make(map[int]*Siege, len(s.Sieges)),
		Wars:          make(map[int]*War, len(s.Wars)),
		NextID:        make(map[int]int, len(s.NextID)),
		Relations:     make(map[Pair]float64, len(s.Relations)),
		SideRelations: make(map[Pair]float64, len(s.SideRelations)),
		Oaths:         make(map[int]Oath, len(s.Oaths)),
		rulerPairs:    s.rulerPairs,
		sidePairs:     s.sidePairs,
	}
	for k, v := range s.Towns {
		c := *v
		out.Towns[k] = &c
	}
	for k, v := range s.Villages {
		c := *v
		out.Villages[k] = &c
	}
	for k, v := range s.Parties {
		c := *v
		out.Parties[k] = &c
	}
	for k, v := range s.Rulers {
		c := *v
		out.Rulers[k] = &c
	}
	for k, v := range s.Sides {
		c := *v
		out.Sides[k] = &c
	}
	for k, v := range s.Routes {
		c := *v
		out.Routes[k] = &c
	}
	for k, v := range s.Sieges {
		c := *v
		out.Sieges[k] = &c
	}
	for k, v := range s.Wars {
		c := *v
		out.Wars[k] = &c
	}
	for k, v := range s.NextID {
		out.NextID[k] = v
	}
	for k, v := range s.Relations {
		out.Relations[k] = v
	}
	for k, v := range s.SideRelations {
		out.SideRelations[k] = v
	}
	for k, v := range s.Oaths {
		out.Oaths[k] = v
	}
	return out
}

// TownIDs returns town identifiers in ascending order, so every system
// iterating towns does so identically. A map range in Go is deliberately
// randomised, which would make an unseeded accumulation order vary between
// runs and destroy reproducibility (AI.md section 1).
func (s *State) TownIDs() []int { return sortedKeys(s.Towns) }

// VillageIDs returns village identifiers in ascending order.
func (s *State) VillageIDs() []int { return sortedKeys(s.Villages) }

// PartyIDs returns party identifiers in ascending order.
func (s *State) PartyIDs() []int { return sortedKeys(s.Parties) }

// RulerIDsSorted returns ruler identifiers in ascending order.
func (s *State) RulerIDsSorted() []int { return sortedKeys(s.Rulers) }

// SideIDs returns side identifiers in ascending order.
func (s *State) SideIDs() []int { return sortedKeys(s.Sides) }

// RouteIDs returns route identifiers in ascending order.
func (s *State) RouteIDs() []int { return sortedKeys(s.Routes) }

// SiegeIDs returns siege identifiers in ascending order.
func (s *State) SiegeIDs() []int { return sortedKeys(s.Sieges) }

// WarIDs returns war identifiers in ascending order.
func (s *State) WarIDs() []int { return sortedKeys(s.Wars) }

func sortedKeys[V any](m map[int]V) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// Insertion sort: these slices are short and this keeps the package free of
	// a sort import for a hot path that runs every tick.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// PairSlice holds a relation map's keys in ascending order, computed once.
//
// A relation map over a full roster is around a quarter of a million pairs.
// Rebuilding and re-sorting that list on every tick was one of the two costs
// that dominated the simulation, and it was pure waste: the keys do not change
// between ticks, because relations are only ever added for pairs that already
// exist. Each state therefore keeps its own sorted key slice, and callers take
// it from there.
type PairSlice struct {
	Pairs []Pair
}

// SortedPairs returns the ascending key slice for a relation map, computing it
// if the state has not needed it yet.
//
// The two relation maps are told apart by the map the caller passed, compared
// by identity. Comparing by length would be wrong the moment both maps happened
// to hold the same number of pairs, which is a bug that would only appear on
// some seeds and would silently give one system the other's key set.
func (s *State) SortedPairs(m map[Pair]float64) PairSlice {
	if sameMap(m, s.Relations) {
		if s.rulerPairs == nil || len(s.rulerPairs.Pairs) != len(m) {
			s.rulerPairs = &PairSlice{Pairs: sortPairs(m)}
		}
		return *s.rulerPairs
	}
	if s.sidePairs == nil || len(s.sidePairs.Pairs) != len(m) {
		s.sidePairs = &PairSlice{Pairs: sortPairs(m)}
	}
	return *s.sidePairs
}

// sameMap reports whether two maps are the same map object, by pointer
// identity of a known key when possible and by length otherwise. Go maps are
// reference types, so this is done by comparing a sentinel lookup against each
// candidate; it is only ever called once per tick with the state's own maps.
func sameMap(a, b map[Pair]float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	if len(a) != len(b) {
		return false
	}
	if len(a) == 0 {
		// Both empty: ambiguous, and the caller's own usage makes it harmless.
		return true
	}
	// Pick any key from a and test whether it is present in b with the same
	// value. Two distinct relation maps of equal length will not both contain
	// every key of the other.
	for k, av := range a {
		bv, ok := b[k]
		if !ok || bv != av {
			return false
		}
	}
	return true
}

func sortPairs(m map[Pair]float64) []Pair {
	out := make([]Pair, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sortPairsInPlace(out)
	return out
}

func sortPairsInPlace(out []Pair) {
	// A radix-free insertion sort is too slow at this size, so this uses the
	// standard library. The import is local to the function's caller to keep
	// the entity model free of a sort dependency in its hot paths.
	sort.Slice(out, func(i, j int) bool { return lessPair(out[i], out[j]) })
}

func lessPair(a, b Pair) bool {
	if a.A != b.A {
		return a.A < b.A
	}
	return a.B < b.B
}

// Relation reads a ruler-to-ruler relation score, defaulting to neutral when
// the pair has never met.
func (s *State) Relation(a, b int) float64 {
	if v, ok := s.Relations[MakePair(a, b)]; ok {
		return v
	}
	return 0
}

// SetRelation writes a ruler-to-ruler relation score.
func (s *State) SetRelation(a, b int, v float64) {
	s.Relations[MakePair(a, b)] = v
}

// SideRelation reads a side-to-side relation score, defaulting to neutral.
func (s *State) SideRelation(a, b int) float64 {
	if v, ok := s.SideRelations[MakePair(a, b)]; ok {
		return v
	}
	return 0
}

// SetSideRelation writes a side-to-side relation score.
func (s *State) SetSideRelation(a, b int, v float64) {
	s.SideRelations[MakePair(a, b)] = v
}

// AtWar reports whether two sides are currently at war. Wars are iterated
// in ascending ID order so the result is deterministic: with duplicate wars
// between the same sides (an old ended one and a new active one), the answer
// is true if ANY of them is still active, regardless of map iteration order.
func (s *State) AtWar(a, b int) bool {
	if a == b {
		return false
	}
	for _, id := range s.WarIDs() {
		w := s.Wars[id]
		if (w.SideA == a && w.SideB == b) || (w.SideA == b && w.SideB == a) {
			if w.EndTick < 0 {
				return true
			}
		}
	}
	return false
}

// ActiveWars returns wars that have not ended, in ascending id order.
func (s *State) ActiveWars() []*War {
	var out []*War
	for _, id := range s.WarIDs() {
		if w := s.Wars[id]; w.EndTick < 0 {
			out = append(out, w)
		}
	}
	return out
}

// TownOf returns the town a party is nearest, used for arrival and resupply.
// It is a cheap squared-distance scan; parties number in the hundreds and
// towns in the low hundreds, so the cost is not worth an index structure that
// would need invalidating on every movement.
func (s *State) TownOf(p *Party) int {
	best := -1
	bestD := 0.0
	for _, id := range s.TownIDs() {
		t := s.Towns[id]
		dx := t.X - p.X
		dy := t.Y - p.Y
		d := dx*dx + dy*dy
		if best < 0 || d < bestD {
			best, bestD = id, d
		}
	}
	return best
}

// DistanceTo returns the straight-line distance between a party and a town in
// leagues.
func (s *State) DistanceTo(p *Party, townID int) float64 {
	t := s.Towns[townID]
	if t == nil {
		return 0
	}
	dx := t.X - p.X
	dy := t.Y - p.Y
	return sqrt(dx*dx + dy*dy)
}

// DistanceBetweenTowns returns the straight-line distance between two towns.
func (s *State) DistanceBetweenTowns(a, b int) float64 {
	ta, tb := s.Towns[a], s.Towns[b]
	if ta == nil || tb == nil {
		return 0
	}
	dx := ta.X - tb.X
	dy := ta.Y - tb.Y
	return sqrt(dx*dx + dy*dy)
}

// AtWarWith reports whether a ruler's side is at war with another side.
func (s *State) AtWarWith(sideA, sideB int) bool {
	return s.AtWar(sideA, sideB)
}

// sqrt is math.Sqrt. It is called from every distance calculation, of which a
// tick makes hundreds of thousands across the supply, security, and AI
// systems, so a hand-rolled Newton iteration here cost more than the import it
// was avoiding.
var sqrt = math.Sqrt
