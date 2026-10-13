// Package pathfind answers how a column should cross the map, not which road
// happens to be nearest to it.
//
// Tasks 436 and 437. The march system used to ask which route lay closest to a
// party, which is not the same question. The nearest road can lead away from the
// destination, and a road network is only worth having if something can route
// across it rather than merely stand on it. So this package holds the search:
// given a start and a goal, what is the cheapest sequence of roads to travel.
//
// Costs come from the model rather than from being invented here. A road's cost
// is its length divided by its quality, and both are read off model.Route by
// RoadCost. Quality is Route.Safety, which is the security system's own published
// number and which already folds in the ends' road safety, patrol coverage,
// raider pressure, and how rough the ground is. That is why this package does not
// carry a terrain table of its own: a second copy of one would be free to drift
// away from the roads it claims to describe.
//
// Task 437 is the one rule the package adds. Crossing open country costs
// OffRoadCostMultiplier times the straight-line distance between two settlements,
// and no more, so a road is preferred whenever following it costs less than three
// times the ground it covers. Open country therefore loses to any ordinary road
// and wins only where the detour is genuinely bad, which is the shape of the
// decision a player actually makes at a crossroads.
package pathfind

import (
	"math"
	"sort"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/systems/shared"
)

// Node is a settlement id in the pathfinding graph. It is the same integer as
// the town's id in model.State, so a caller can go from one to the other without
// a lookup table.
type Node int

// NoRoute marks a step of a path that is not on a road, which today means only
// the final crossing of open country.
const NoRoute = -1

const (
	// OffRoadCostMultiplier is task 437's rule: the same ground costs this many
	// times as much to cross off the roads as it does to drive along one. At 3
	// a detour has to be worse than three times the direct distance before open
	// country is cheaper than going round, which is what makes a road network
	// worth building and a lost road worth detouring around.
	OffRoadCostMultiplier = 3.0

	// MinRoadQuality is the floor on a road's quality. Route.Safety is written
	// every tick by the security system and reaches zero on a road nobody
	// patrols and that raiders hold. Quality divides into cost, so an unfloored
	// quality would make that road cost infinitely much, and an infinite edge is
	// indistinguishable from an absent one -- a road would silently vanish from
	// the map because it was dangerous. The floor keeps it passable at a price
	// instead, which is the honest reading: a road nobody keeps safe is still a
	// road, it is just an expensive one.
	MinRoadQuality = 0.25
)

// Edge is one traversable connection between two settlements: a road, and the
// route it came from.
type Edge struct {
	To   Node
	Cost float64
	// Route is the model.Route this edge was built from, so a caller can say
	// which road it is on rather than inferring it from the two towns.
	Route int
}

// point is a settlement's position on the map.
type point struct{ x, y float64 }

// Graph is the pathfinding graph: settlements, the roads between them, and
// whether a column is allowed to leave the roads at all.
//
// A Graph is built with New, FromState, or AddRoad. Its zero value is not
// usable, because a zero Graph has no map to measure a heuristic against and no
// adjacency to walk.
type Graph struct {
	pos map[Node]point
	adj map[Node][]Edge
	// offRoad is whether the search may consider crossing open country straight
	// to the goal. FromState leaves it on, because on a real map a column can
	// always strike out across country; a graph built for a question about roads
	// alone turns it off, and then a goal with no road to it is genuinely
	// unreachable rather than three times the crow-flies away.
	offRoad bool
}

// New returns an empty graph with open country allowed.
func New() *Graph {
	return &Graph{
		pos:     map[Node]point{},
		adj:     map[Node][]Edge{},
		offRoad: true,
	}
}

// FromState builds the graph of a map: every town as a node, every passable
// route between two towns as a road in both directions.
//
// A blocked route is left out entirely, the same way the logistics system leaves
// it out when it decides which roads a caravan may use. Blocked means the road
// carries nothing, and a pathfinder that routed columns over it would be sending
// them somewhere the rest of the simulation has already decided is closed.
//
// Routes are visited in sorted id order and towns in sorted id order, so the same
// state always builds the same graph with its edges in the same order. That is
// not cosmetic: the search breaks ties by insertion order, and a graph whose edge
// order changed between ticks would let two equally cheap routes swap places
// from one day to the next.
func FromState(s *model.State) *Graph {
	g := New()
	if s == nil {
		return g
	}
	for _, tid := range s.TownIDs() {
		t := s.Towns[tid]
		if t == nil {
			continue
		}
		g.AddNode(Node(tid), t.X, t.Y)
	}
	for _, rid := range s.RouteIDs() {
		r := s.Routes[rid]
		if r == nil || r.Blocked {
			continue
		}
		a, b := s.Towns[r.TownA], s.Towns[r.TownB]
		if a == nil || b == nil || r.TownA == r.TownB {
			// A route naming a town that is not there cannot be walked, and a
			// route from a town to itself is a loop that goes nowhere.
			continue
		}
		g.AddRoad(Node(r.TownA), Node(r.TownB), RoadCost(r, a, b), r.ID)
	}
	return g
}

// RoadQuality returns how good a road is, in [MinRoadQuality, 1], where 1 is a
// road as good as this map allows and MinRoadQuality is one nobody looks after.
//
// It reads Route.Safety rather than measuring anything of its own, because
// Route.Safety is the security system's verdict on that road and already
// accounts for the ground it crosses: security computes it from the two towns'
// road safety, how well the road is patrolled, how many raiders are on it, and
// the roughness of its terrain. Reading that number keeps one authority on what
// a road is worth.
func RoadQuality(r *model.Route) float64 {
	if r == nil {
		return MinRoadQuality
	}
	return shared.Clamp(shared.Clamp01(r.Safety), MinRoadQuality, 1)
}

// RoadCost returns what it costs to travel a route between the two towns it
// joins: the road's length divided by its quality.
//
// Dividing is the whole point of the quality term. Two roads of the same length
// cost differently, so a patrol that makes one of them safe is worth money, and a
// route through hills that is also a raider's road is avoided for the reason it
// is actually bad rather than for being far.
func RoadCost(r *model.Route, a, b *model.Town) float64 {
	if r == nil {
		return math.Inf(1)
	}
	return roadLength(r, a, b) / RoadQuality(r)
}

// roadLength returns a route's travel length, and never less than the
// straight-line distance between the towns it joins.
//
// The world generator writes a road longer than the ground it covers, since
// world.road_length_over_distance is 1.22 by default and roads follow the
// terrain rather than rulers' intentions, so the clamp does nothing to a
// generated map. It is here for a save file or a world-data feed that says
// otherwise. A road shorter than the ground between its ends would cost less
// than the straight-line distance, and then the straight-line heuristic would
// overestimate the remaining cost, and A* would stop being guaranteed optimal:
// it would return the path it found first rather than the cheapest path.
func roadLength(r *model.Route, a, b *model.Town) float64 {
	length := math.Max(r.Length, 0)
	if a == nil || b == nil {
		return length
	}
	if d := math.Hypot(b.X-a.X, b.Y-a.Y); length < d {
		return d
	}
	return length
}

// AddNode records where a settlement is. A node without a position can still be
// reached along its roads, but it has no distance from anywhere, so the search
// cannot guide itself toward it and cannot leave the roads from it.
func (g *Graph) AddNode(n Node, x, y float64) {
	g.pos[n] = point{x, y}
	g.touch(n)
}

// AddRoad joins two settlements in both directions at the given cost.
//
// Roads are two-way because a model.Route is an unordered pair of towns: the
// logistics system sends caravans down one and then the other with no change of
// rules, and a road that could only be walked in one direction would be a
// one-way street that nothing else in the model has.
//
// A cost that is negative or not a number is refused rather than stored. A
// negative edge has no cheapest path -- a cycle round it costs arbitrarily
// little -- and every shortest-path algorithm here would then return nonsense.
func (g *Graph) AddRoad(a, b Node, cost float64, route int) {
	if math.IsNaN(cost) || math.IsInf(cost, 0) || cost < 0 {
		return
	}
	g.touch(a)
	g.touch(b)
	g.adj[a] = append(g.adj[a], Edge{To: b, Cost: cost, Route: route})
	g.adj[b] = append(g.adj[b], Edge{To: a, Cost: cost, Route: route})
}

// touch makes sure a settlement has an adjacency entry, so that a node with no
// roads is still a node the search can pop and reject as a dead end rather than
// one it silently never learns about.
func (g *Graph) touch(n Node) {
	if _, ok := g.adj[n]; !ok {
		g.adj[n] = nil
	}
}

// SetOffRoad allows or forbids crossing open country. A graph that forbids it is
// a graph about roads only, in which a goal with no road to it is unreachable.
func (g *Graph) SetOffRoad(allowed bool) { g.offRoad = allowed }

// OffRoad reports whether the search may cross open country.
func (g *Graph) OffRoad() bool { return g.offRoad }

// Distance returns the straight-line distance between two settlements, or zero
// if either has no recorded position.
//
// Zero is the safe answer for a missing position: it underestimates the distance
// rather than overestimating it, which keeps the heuristic admissible and costs
// the search some guidance instead of its correctness. Overestimating would do
// the opposite, and a shortest-path answer that depends on which nodes happen to
// carry coordinates is not an answer worth having.
func (g *Graph) Distance(a, b Node) float64 {
	pa, okA := g.pos[a]
	pb, okB := g.pos[b]
	if !okA || !okB {
		return 0
	}
	return math.Hypot(pb.x-pa.x, pb.y-pa.y)
}

// Has reports whether a settlement is in the graph, with or without roads.
func (g *Graph) Has(n Node) bool {
	_, ok := g.adj[n]
	return ok
}

// Positioned reports whether a settlement has a recorded position, which is what
// the straight-line heuristic and any off-road crossing need.
func (g *Graph) Positioned(n Node) bool {
	_, ok := g.pos[n]
	return ok
}

// Edges returns the roads leaving a settlement, in the order they were added.
func (g *Graph) Edges(n Node) []Edge { return g.adj[n] }

// Nodes returns every settlement in the graph, in ascending id order.
func (g *Graph) Nodes() []Node {
	out := make([]Node, 0, len(g.adj))
	for n := range g.adj {
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
