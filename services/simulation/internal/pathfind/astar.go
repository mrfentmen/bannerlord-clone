package pathfind

import (
	"container/heap"
	"math"
)

// Result is what a search found.
//
// The two ways a search can end are both ordinary answers rather than errors: a
// path with a cost, or no path at all. Reachable says which, so a caller does not
// have to recognise a sentinel cost to know whether a column has somewhere to go.
type Result struct {
	// Path is the sequence of settlements to travel, start first and goal last,
	// with one entry per place the column actually stops. It is nil when the
	// goal cannot be reached, which is the one case where an empty slice and a
	// nil slice mean different things: a path from a town to itself is empty of
	// legs but still a path, and its node list holds that one town.
	Path []Node
	// RouteIDs runs alongside Path, naming the road travelled to arrive at each
	// node. It is NoRoute where no road was used, which today is the entry for
	// the first node and the entry for a final crossing of open country.
	RouteIDs []int
	// Cost is the total travel cost of Path. It is +Inf when the goal cannot be
	// reached, because no finite cost buys a journey that does not exist.
	Cost float64
	// Reachable reports whether Path is a real route to the goal.
	Reachable bool
}

// OffRoad reports whether the path leaves the roads, which is the decision task
// 437 puts a price on.
func (r Result) OffRoad() bool {
	for _, id := range r.RouteIDs {
		if id == NoRoute {
			return true
		}
	}
	return false
}

// AStar finds the cheapest path from start to goal across a graph, using the
// straight-line distance between settlements as its heuristic.
//
// The heuristic never overestimates, because every step costs at least the ground
// it covers: a road costs its length over its quality, quality is at most 1, and
// FromState keeps a road's length at least the distance between its towns.
// Crossing open country costs three times that distance, which is more again. So
// the estimate is a lower bound on what is left, which is what lets the search
// stop at the first time it reaches the goal rather than exploring everything and
// comparing afterwards, and still return the cheapest path.
//
// A settlement with no recorded position has a heuristic of zero for it. Zero
// underestimates, so the answer stays correct and the search simply loses its
// guidance for that node, which is the right way round to be wrong.
func AStar(start, goal Node, g *Graph) Result {
	if g == nil {
		return unreachable()
	}
	if start == goal {
		// Already there. The cost is nothing and the path is the one settlement,
		// on no road, because travelling between two identical points is not
		// travel.
		return Result{
			Path:      []Node{start},
			RouteIDs:  []int{NoRoute},
			Cost:      0,
			Reachable: true,
		}
	}

	gScore := map[Node]float64{start: 0}
	cameFrom := map[Node]Node{}
	cameBy := map[Node]int{}
	closed := map[Node]bool{}

	open := &openSet{}
	heap.Init(open)
	open.push(openItem{node: start, f: g.Distance(start, goal)})

	for open.Len() > 0 {
		cur := heap.Pop(open).(openItem).node
		if closed[cur] {
			// A settlement can be queued more than once, once per improvement
			// found for it. The first time it is popped is with its best known
			// cost; any later pop of it is stale and has nothing to add.
			continue
		}
		closed[cur] = true

		if cur == goal {
			path, routes := reconstruct(cameFrom, cameBy, goal)
			return Result{Path: path, RouteIDs: routes, Cost: gScore[goal], Reachable: true}
		}

		for _, e := range g.adj[cur] {
			if closed[e.To] {
				continue
			}
			tryImprove(g, e.To, gScore[cur]+e.Cost, cur, e.Route, gScore, cameFrom, cameBy, open, goal)
		}

		// Task 437: from anywhere, a column may strike out across open country
		// and go straight to where it is going. This is offered as an ordinary
		// edge into the open set rather than as a special case that writes the
		// goal's cost directly, because the goal then has to be popped like any
		// other settlement. Writing its cost straight in is the version that
		// looks simpler and is wrong twice over: the search cannot stop early,
		// and a settlement whose heuristic happens to be zero -- because its
		// position was never recorded -- makes the crossing cost nothing at all,
		// so every map on which coordinates are missing reports every journey as
		// free.
		if g.offRoad && !closed[goal] {
			if d := g.Distance(cur, goal); d > 0 {
				tryImprove(g, goal, gScore[cur]+OffRoadCostMultiplier*d, cur, NoRoute,
					gScore, cameFrom, cameBy, open, goal)
			}
		}
	}

	return unreachable()
}

// tryImprove records a cheaper way to reach a settlement, or does nothing if the
// way already known is at least as cheap.
//
// Both ways of arriving are treated identically on purpose. Whether the leg is a
// road or open country, it is a step in the search with a cost, and letting one of
// them skip the open set would be letting it skip the comparison that decides
// whether the goal was reached cheaply.
func tryImprove(g *Graph, to Node, cost float64, from Node, route int,
	gScore map[Node]float64, cameFrom map[Node]Node, cameBy map[Node]int,
	open *openSet, goal Node) {

	if known, ok := gScore[to]; ok && cost >= known {
		return
	}
	gScore[to] = cost
	cameFrom[to] = from
	cameBy[to] = route
	open.push(openItem{node: to, f: cost + g.Distance(to, goal)})
}

// reconstruct walks the recorded predecessors back from the goal and reverses
// them, so the path comes out start-first.
//
// The reversal walks backwards and then flips, rather than prepending onto a
// slice at each step. Prepending is the same answer and copies the whole path
// once per settlement on it, which on a long route across a large map is
// quadratic work for a search whose entire purpose is to be cheap.
func reconstruct(cameFrom map[Node]Node, cameBy map[Node]int, goal Node) ([]Node, []int) {
	// At most one entry per settlement that has a predecessor, plus the goal.
	n := len(cameFrom) + 1
	path := make([]Node, 0, n)
	routes := make([]int, 0, n)
	for {
		path = append(path, goal)
		routes = append(routes, cameBy[goal])
		prev, ok := cameFrom[goal]
		if !ok {
			break
		}
		goal = prev
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
		routes[i], routes[j] = routes[j], routes[i]
	}
	return path, routes
}

// unreachable is the answer for a goal that cannot be got to.
func unreachable() Result {
	return Result{Cost: math.Inf(1), Reachable: false}
}

// openItem is a settlement waiting to be expanded, with the cost of the best way
// to it plus the straight-line estimate of what is left to the goal.
type openItem struct {
	node Node
	f    float64
	seq  uint64
}

// openSet is the A* frontier, a binary heap ordered by f.
//
// seq breaks ties. Go randomises map iteration, so without a tie-break two
// settlements the same distance from the goal could be expanded in either order
// and a query with two equally cheap routes could return either of them, which
// would make the same question asked twice give different answers. Expanding in
// the order things were queued makes the result a function of the graph alone.
// The simulation is replayed and hashed elsewhere, and a search whose answer
// wobbled on equal costs would put a difference in that hash that no change to
// the campaign explains.
type openSet struct {
	items []openItem
	seq   uint64
}

func (s openSet) Len() int { return len(s.items) }

func (s openSet) Less(i, j int) bool {
	if s.items[i].f != s.items[j].f {
		return s.items[i].f < s.items[j].f
	}
	return s.items[i].seq < s.items[j].seq
}

func (s openSet) Swap(i, j int) { s.items[i], s.items[j] = s.items[j], s.items[i] }

func (s *openSet) Push(x any) { s.items = append(s.items, x.(openItem)) }

func (s *openSet) Pop() any {
	last := len(s.items) - 1
	it := s.items[last]
	s.items = s.items[:last]
	return it
}

func (s *openSet) push(it openItem) {
	s.seq++
	it.seq = s.seq
	heap.Push(s, it)
}
