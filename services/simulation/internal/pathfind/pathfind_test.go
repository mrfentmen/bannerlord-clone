package pathfind

import (
	"math"
	"strconv"
	"testing"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
)

// Tests for A* over the road network (tasks 436, 437).
//
// The tests are grouped around what the search has to get right rather than
// around what the code happens to do: that it returns the cheapest path, that it
// says so plainly when there is no path, that a road beats open country at three
// times the distance, and that it keeps saying the same thing when asked twice.
// The randomised comparison against a separate Dijkstra is the broad one; the
// hand-built cases are there to name the specific failures, because a mismatch
// found by the comparison tells you the search is wrong and tells you nothing
// about which of its rules is.

// --- helpers ---

// line builds n settlements along the x axis, spaced one unit apart, and returns
// the graph. Node ids run 1..n so the arithmetic in a test reads as settlement
// numbers.
func line(n int, offRoad bool) *Graph {
	g := New()
	g.SetOffRoad(offRoad)
	for i := 1; i <= n; i++ {
		g.AddNode(Node(i), float64(i-1), 0)
	}
	return g
}

// square builds four settlements in a box of the given side, numbered 1
// bottom-left, 2 bottom-right, 3 top-right, 4 top-left.
func square(side float64, offRoad bool) *Graph {
	g := New()
	g.SetOffRoad(offRoad)
	g.AddNode(1, 0, 0)
	g.AddNode(2, side, 0)
	g.AddNode(3, side, side)
	g.AddNode(4, 0, side)
	return g
}

// referenceCost is a plain Dijkstra over the same edges A* walks, written
// without a heuristic and without a heap.
//
// It exists to be obviously correct rather than fast: it picks the nearest
// unvisited settlement with a linear scan, so there is no second heap whose bugs
// could be mistaken for A*'s. The off-road rule is modelled the same way A* sees
// it -- an edge from every positioned settlement straight to the goal at three
// times the distance -- because that is the edge set being searched, and a
// reference that searched a different one would disagree for the right reason and
// be useless.
func referenceCost(g *Graph, start, goal Node) (float64, bool) {
	vertices := g.Nodes()
	known := false
	for _, n := range vertices {
		if n == goal {
			known = true
			break
		}
	}
	if !known {
		// The goal is reachable as the far end of an off-road crossing even when
		// no road touches it, so it belongs in the vertex set.
		vertices = append(vertices, goal)
	}
	if !g.Has(start) {
		return math.Inf(1), false
	}

	dist := make(map[Node]float64, len(vertices))
	for _, n := range vertices {
		dist[n] = math.Inf(1)
	}
	done := make(map[Node]bool, len(vertices))
	dist[start] = 0

	relax := func(cur, to Node, cost float64) {
		if done[to] {
			return
		}
		if v := dist[cur] + cost; v < dist[to] {
			dist[to] = v
		}
	}

	for {
		cur, best, found := Node(0), math.Inf(1), false
		for _, n := range vertices {
			if done[n] || dist[n] >= best {
				continue
			}
			cur, best, found = n, dist[n], true
		}
		if !found {
			return math.Inf(1), false
		}
		done[cur] = true
		if cur == goal {
			return best, true
		}
		for _, e := range g.Edges(cur) {
			relax(cur, e.To, e.Cost)
		}
		if g.offRoad {
			if d := g.Distance(cur, goal); d > 0 {
				relax(cur, goal, OffRoadCostMultiplier*d)
			}
		}
	}
}

// legCost is what it costs to travel from a to b on the named route, or across
// open country if the route is NoRoute.
func legCost(g *Graph, a, b Node, route int) (float64, bool) {
	if route == NoRoute {
		d := g.Distance(a, b)
		if d == 0 {
			return 0, false
		}
		return OffRoadCostMultiplier * d, true
	}
	for _, e := range g.Edges(a) {
		if e.To == b && e.Route == route {
			return e.Cost, true
		}
	}
	return 0, false
}

// checkPath asserts the whole of a result's claims: that the path starts at the
// start and ends at the goal, that every leg of it is a road the graph actually
// has or a crossing of open country, that the route list lines up with the path,
// and that the cost is the sum of the legs rather than a number the search
// asserted separately. A search can return a right cost with a wrong path and a
// right path with a wrong cost, and neither shows up if only the cost is checked.
func checkPath(t *testing.T, g *Graph, start, goal Node, res Result) {
	t.Helper()
	if !res.Reachable {
		t.Fatalf("expected a reachable goal, got %v", res)
	}
	if len(res.Path) == 0 {
		t.Fatal("reachable result with an empty path")
	}
	if res.Path[0] != start {
		t.Errorf("path starts at %d, want %d", res.Path[0], start)
	}
	if res.Path[len(res.Path)-1] != goal {
		t.Errorf("path ends at %d, want %d", res.Path[len(res.Path)-1], goal)
	}
	if len(res.RouteIDs) != len(res.Path) {
		t.Fatalf("path has %d nodes but %d route ids", len(res.Path), len(res.RouteIDs))
	}

	total := 0.0
	for i := 1; i < len(res.Path); i++ {
		from, to := res.Path[i-1], res.Path[i]
		if from == to {
			t.Errorf("path %v stands still at %d", res.Path, from)
		}
		cost, ok := legCost(g, from, to, res.RouteIDs[i])
		if !ok {
			t.Errorf("leg %d->%d on route %d is not in the graph", from, to, res.RouteIDs[i])
			continue
		}
		total += cost
	}
	if math.Abs(total-res.Cost) > 1e-9 {
		t.Errorf("legs add up to %v but the result claims %v", total, res.Cost)
	}
	// A road to the first node is not a leg, and a leg of no road is the
	// off-road crossing, so the first entry is never a real road.
	if res.RouteIDs[0] != NoRoute {
		t.Errorf("the first node is entered on route %d, but a path starts nowhere", res.RouteIDs[0])
	}
}

// wantPath asserts an exact expected route through named settlements.
func wantPath(t *testing.T, got []Node, want ...Node) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("path %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("path %v, want %v", got, want)
		}
	}
}

// --- the search finds the cheapest path ---

func TestAStarTakesTheCheaperOfTwoRoads(t *testing.T) {
	// A square with the top and bottom roads unequal: the long way round has to
	// lose even though it is the direct line. A search that returned the first
	// route it found would take the expensive one, which is the failure this is
	// here to catch.
	g := square(10, false)
	g.AddRoad(1, 2, 1, 10)
	g.AddRoad(2, 3, 1, 11)
	g.AddRoad(1, 4, 5, 12)
	g.AddRoad(4, 3, 5, 13)

	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 2, 3)
	if res.Cost != 2 {
		t.Errorf("cost %v, want 2", res.Cost)
	}
	for i, id := range res.RouteIDs {
		if want := []int{NoRoute, 10, 11}[i]; id != want {
			t.Errorf("route id %d at step %d, want %d", id, i, want)
		}
	}
}

func TestAStarWalksBackwardsToo(t *testing.T) {
	// Roads are two-way, so the answer must not depend on which end is the start.
	g := square(10, false)
	g.AddRoad(1, 2, 1, 10)
	g.AddRoad(2, 3, 1, 11)
	g.AddRoad(1, 4, 5, 12)
	g.AddRoad(4, 3, 5, 13)

	forward := AStar(1, 3, g)
	backward := AStar(3, 1, g)
	checkPath(t, g, 3, 1, backward)
	if forward.Cost != backward.Cost {
		t.Errorf("1->3 costs %v but 3->1 costs %v", forward.Cost, backward.Cost)
	}
	wantPath(t, backward.Path, 3, 2, 1)
}

func TestAStarOnAChainOfTowns(t *testing.T) {
	// A road the whole way, so the path is every town on it. This is the shape
	// a generated map mostly has, and it checks that a path longer than a few
	// settlements is reassembled in the right order and not reversed.
	g := line(6, false)
	for i := 1; i < 6; i++ {
		g.AddRoad(Node(i), Node(i+1), 2, 100+i)
	}
	res := AStar(1, 6, g)
	checkPath(t, g, 1, 6, res)
	wantPath(t, res.Path, 1, 2, 3, 4, 5, 6)
	if res.Cost != 10 {
		t.Errorf("cost %v, want 10", res.Cost)
	}
}

func TestAStarPrefersTheGoodRoadToTheBadOne(t *testing.T) {
	// Two roads over the same ground, one patrolled and one not. Length is
	// identical, so the only thing that can separate them is the quality term,
	// and a search that treated cost as distance would have no opinion.
	g := square(10, false)
	g.AddRoad(1, 2, 1.25, 10) // length 10 over quality 0.8
	g.AddRoad(2, 3, 1.25, 11)
	g.AddRoad(1, 4, 10, 12) // length 40 over a poor quality
	g.AddRoad(4, 3, 10, 13)

	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 2, 3)
	if math.Abs(res.Cost-2.5) > 1e-9 {
		t.Errorf("cost %v, want 2.5", res.Cost)
	}
}

func TestAStarStartIsGoalCostsNothing(t *testing.T) {
	g := line(3, true)
	res := AStar(2, 2, g)
	checkPath(t, g, 2, 2, res)
	if res.Cost != 0 {
		t.Errorf("cost %v, want 0", res.Cost)
	}
	wantPath(t, res.Path, 2)
	if res.OffRoad() {
		t.Error("standing still should not count as leaving the roads")
	}
}

// --- unreachable goals ---

func TestAStarReportsNoRoadAndNoOffRoadAsUnreachable(t *testing.T) {
	// Two settlements with nothing between them, and open country forbidden. The
	// honest answer is that the goal cannot be got to, and it has to be
	// distinguishable from a path of cost zero.
	g := New()
	g.SetOffRoad(false)
	g.AddNode(1, 0, 0)
	g.AddNode(2, 100, 0)
	g.AddNode(3, 200, 100) // connected to nothing

	for _, tc := range []struct {
		name        string
		start, goal Node
	}{
		{"no road at all", 1, 2},
		{"isolated goal", 1, 3},
		{"isolated start", 3, 1},
		{"start not in the graph", 99, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := AStar(tc.start, tc.goal, g)
			if res.Reachable {
				t.Fatalf("claimed a path %v to an unreachable goal", res.Path)
			}
			if res.Path != nil {
				t.Errorf("unreachable result carries a path: %v", res.Path)
			}
			if !math.IsInf(res.Cost, 1) {
				t.Errorf("cost %v, want +Inf", res.Cost)
			}
		})
	}
}

func TestAStarOnAnEmptyGraph(t *testing.T) {
	res := AStar(1, 2, New())
	if res.Reachable {
		t.Errorf("an empty graph reached %v", res.Path)
	}
	if res := AStar(1, 2, nil); res.Reachable {
		t.Errorf("a nil graph reached %v", res.Path)
	}
}

func TestAStarReachesAnUnconnectedGoalAcrossCountry(t *testing.T) {
	// The same map with open country allowed. The goal has no road to it and no
	// road near it, and it is still reachable, because a column can strike out
	// across the fields. Two graphs differing only in this flag must be able to
	// disagree about the same query.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 10, 0)
	res := AStar(1, 2, g)
	checkPath(t, g, 1, 2, res)
	if res.Cost != OffRoadCostMultiplier*10 {
		t.Errorf("cost %v, want %v", res.Cost, OffRoadCostMultiplier*10)
	}
	if !res.OffRoad() {
		t.Error("a crossing of open country should be reported as off-road")
	}
}

// --- task 437: roads over open country ---

func TestAStarPrefersRoadsToOpenCountry(t *testing.T) {
	// The direct line is 10 across open country, which costs 30. The road goes
	// round and costs 14. The road is longer and still wins, which is the rule
	// task 437 asks for.
	g := square(10, true)
	g.AddRoad(1, 2, 7, 10)
	g.AddRoad(2, 3, 7, 11)

	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 2, 3)
	if res.OffRoad() {
		t.Error("path left the roads when a road was cheaper")
	}
	if res.Cost != 14 {
		t.Errorf("cost %v, want 14", res.Cost)
	}
}

func TestAStarCrossesCountryWhenTheDetourIsWorse(t *testing.T) {
	// The same shape with the road made dearer than three times the ground it
	// covers: 25 a leg is 50 the long way against 42.4 straight across the
	// diagonal. Following the road would cost more than crossing the fields, so
	// the search should cross the fields -- and should still account for the road
	// it could have taken, by not pretending the crossing is free.
	g := square(10, true)
	g.AddRoad(1, 2, 25, 10)
	g.AddRoad(2, 3, 25, 11)

	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 3)
	if !res.OffRoad() {
		t.Error("expected the last leg to be a crossing of open country")
	}
	direct := math.Hypot(10, 10)
	want := OffRoadCostMultiplier * direct
	if math.Abs(res.Cost-want) > 1e-9 {
		t.Errorf("cost %v, want %v", res.Cost, want)
	}
	if res.RouteIDs[1] != NoRoute {
		t.Errorf("crossing named route %d, want NoRoute", res.RouteIDs[1])
	}
}

func TestOffRoadCrossingBeatsAnAbsurdRoad(t *testing.T) {
	// One road, absurdly long, and a settlement with no road at all. Three times
	// the direct distance is the entire cost, so the road is never worth walking.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 5, 0)
	g.AddRoad(1, 2, 1000, 10)

	res := AStar(1, 2, g)
	checkPath(t, g, 1, 2, res)
	wantPath(t, res.Path, 1, 2)
	if res.Cost != OffRoadCostMultiplier*5 {
		t.Errorf("cost %v, want %v", res.Cost, OffRoadCostMultiplier*5)
	}
}

func TestOffRoadIsNeverCheaperThanTheGroundItCovers(t *testing.T) {
	// The multiplier is a floor on cost, not a surcharge on a road. Wherever a
	// road exists and costs less than three times the ground, the crossing must
	// not be offered as the winner. Checked over a spread of road costs so that
	// a threshold implemented at the wrong value still fails here.
	const ground = 4.0
	across := OffRoadCostMultiplier * ground
	for _, cost := range []float64{0.1, 1, ground, across - 0.01, across} {
		g := New()
		g.AddNode(1, 0, 0)
		g.AddNode(2, ground, 0)
		g.AddRoad(1, 2, cost, 10)
		res := AStar(1, 2, g)
		checkPath(t, g, 1, 2, res)
		if res.OffRoad() {
			t.Errorf("road costing %v beat by a crossing costing %v", cost, across)
		}
		if math.Abs(res.Cost-cost) > 1e-9 {
			t.Errorf("road costing %v gave cost %v", cost, res.Cost)
		}
	}
	// One step cheaper and the crossing wins, which pins the threshold from the
	// other side.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, ground, 0)
	g.AddRoad(1, 2, across+0.01, 10)
	if res := AStar(1, 2, g); !res.OffRoad() {
		t.Errorf("a road costing %v should have lost to a crossing costing %v",
			across+0.01, across)
	}
}

func TestAStarUsesRoadsForAllButTheLastLeg(t *testing.T) {
	// Three roads of one unit each, then a settlement with no road to it at all.
	// Everything up to the last town should be on a road, and only the final
	// approach across country. This checks the crossing is offered per node and
	// not as a shortcut that discards the part of the route already travelled:
	// cutting straight across from the start would cost 12, against 3 of road
	// followed by a 3 crossing.
	g := line(5, true)
	for i := 1; i < 4; i++ {
		g.AddRoad(Node(i), Node(i+1), 1, 100+i)
	}
	res := AStar(1, 5, g)
	checkPath(t, g, 1, 5, res)
	if !res.OffRoad() {
		t.Error("expected a crossing of open country for the last leg")
	}
	wantPath(t, res.Path, 1, 2, 3, 4, 5)
	for i := 1; i < len(res.RouteIDs)-1; i++ {
		if res.RouteIDs[i] == NoRoute {
			t.Errorf("leg %d left the roads, want a road", i)
		}
	}
	// Three units of road, then one unit of ground crossed.
	if want := 3.0 + OffRoadCostMultiplier; math.Abs(res.Cost-want) > 1e-9 {
		t.Errorf("cost %v, want %v", res.Cost, want)
	}
}

// --- determinism ---

func TestAStarAnswersTheSameEveryTime(t *testing.T) {
	// Two routes of exactly equal cost. Which one comes back is arbitrary, but
	// it has to be the same arbitrary one every time: the simulation is replayed
	// and hashed, and a search that wobbled between equal-cost routes would put
	// a difference in that hash that nothing in the campaign explains.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 10, 0)
	g.AddNode(3, 20, 10)
	g.AddNode(4, 10, 20)
	g.AddRoad(1, 2, 5, 10)
	g.AddRoad(2, 3, 5, 11)
	g.AddRoad(1, 4, 5, 12)
	g.AddRoad(4, 3, 5, 13)

	first := AStar(1, 3, g)
	for i := 0; i < 200; i++ {
		again := AStar(1, 3, g)
		if len(again.Path) != len(first.Path) {
			t.Fatalf("run %d returned %v, first run returned %v", i, again.Path, first.Path)
		}
		for j := range first.Path {
			if again.Path[j] != first.Path[j] {
				t.Fatalf("run %d returned %v, first run returned %v", i, again.Path, first.Path)
			}
		}
		if again.Cost != first.Cost {
			t.Fatalf("run %d cost %v, first run cost %v", i, again.Cost, first.Cost)
		}
	}
	if first.Cost != 10 {
		t.Errorf("cost %v, want 10", first.Cost)
	}
}

func TestFromStateIsDeterministic(t *testing.T) {
	// The graph is built by walking a map, so its edges have to come out in a
	// fixed order or the tie-break above is not pinned down. Built twice from the
	// same state and compared edge for edge.
	s := roadState()
	a, b := FromState(s), FromState(s)
	if len(a.Nodes()) != len(b.Nodes()) {
		t.Fatalf("node counts differ: %d and %d", len(a.Nodes()), len(b.Nodes()))
	}
	for _, n := range a.Nodes() {
		ea, eb := a.Edges(n), b.Edges(n)
		if len(ea) != len(eb) {
			t.Fatalf("node %d has %d edges then %d", n, len(ea), len(eb))
		}
		for i := range ea {
			if ea[i] != eb[i] {
				t.Fatalf("node %d edge %d: %+v then %+v", n, i, ea[i], eb[i])
			}
		}
	}
}

func TestOpenSetBreaksTiesByQueuingOrder(t *testing.T) {
	// Two settlements the same estimated distance from the goal. Which one the
	// search takes first is arbitrary, but it must not be left to
	// container/heap's unspecified ordering of equal elements, because the
	// standard library does not promise that ordering holds across releases and
	// the search's answer has to depend on this package alone.
	var s openSet
	s.push(openItem{node: 1, f: 5})
	s.push(openItem{node: 2, f: 5})
	s.push(openItem{node: 3, f: 4})

	early, late, cheap := s.at(1), s.at(2), s.at(3)
	if !s.Less(cheap, early) {
		t.Error("a lower estimate ordered after a higher one")
	}
	if !s.Less(early, late) {
		t.Error("the earlier of two equal estimates ordered after the later one")
	}
	if s.Less(late, early) {
		t.Error("the later of two equal estimates ordered before the earlier one")
	}
}

// at returns where a settlement sits in the heap, so that a test can ask the
// ordering directly rather than inferring it from what came out.
func (s *openSet) at(node Node) int {
	for i, it := range s.items {
		if it.node == node {
			return i
		}
	}
	return -1
}

// --- the broad check: the same answer as a search without a heuristic ---

func TestAStarMatchesAnUnguidedSearch(t *testing.T) {
	// Random maps, A* against the plain Dijkstra above. This is the test that
	// catches a heuristic which has stopped underestimating, because the moment
	// it overestimates the two disagree on some map -- and it catches an
	// off-road rule wired into the search wrongly, for the same reason. The
	// explicit cases elsewhere say which rule broke; this one says that none did.
	for seed := uint64(1); seed <= 60; seed++ {
		for _, offRoad := range []bool{true, false} {
			t.Run(name(seed, offRoad), func(t *testing.T) {
				g := randomGraph(seed, offRoad)
				start, goal := Node(1), Node(8)
				res := AStar(start, goal, g)
				want, wantOK := referenceCost(g, start, goal)

				if res.Reachable != wantOK {
					t.Fatalf("reachable %v, reference says %v", res.Reachable, wantOK)
				}
				if !wantOK {
					if !math.IsInf(res.Cost, 1) {
						t.Errorf("unreachable but cost %v", res.Cost)
					}
					return
				}
				checkPath(t, g, start, goal, res)
				if math.Abs(res.Cost-want) > 1e-9 {
					t.Errorf("cost %v, cheapest is %v, path %v", res.Cost, want, res.Path)
				}
			})
		}
	}
}

func TestAStarMatchesAnUnguidedSearchFromEverySettlement(t *testing.T) {
	// The same comparison run from every settlement to every other on one
	// generated map, so the search is checked over all its start/goal pairs
	// rather than the one pair that happened to be interesting.
	g := randomGraph(99, true)
	for _, start := range g.Nodes() {
		for _, goal := range g.Nodes() {
			res := AStar(start, goal, g)
			want, wantOK := referenceCost(g, start, goal)
			if res.Reachable != wantOK {
				t.Fatalf("%d->%d reachable %v, reference %v", start, goal, res.Reachable, wantOK)
			}
			if wantOK && math.Abs(res.Cost-want) > 1e-9 {
				t.Fatalf("%d->%d cost %v, cheapest %v, path %v", start, goal, res.Cost, want, res.Path)
			}
			if wantOK {
				checkPath(t, g, start, goal, res)
			}
		}
	}
}

// name labels a subtest so a failure says which map produced it.
func name(seed uint64, offRoad bool) string {
	if offRoad {
		return "seed" + strconv.FormatUint(seed, 10) + "-offroad"
	}
	return "seed" + strconv.FormatUint(seed, 10) + "-roadsonly"
}

// randomGraph builds a jittered grid of settlements with roads along the lattice
// and some of them missing, which is the shape a world generator's nearest-
// neighbours actually produce and the shape that makes the heuristic worth
// testing.
//
// A lattice is used deliberately in place of a scattering of arbitrary pairs. On a
// scattered graph the answer is nearly always one or two roads long, so a broken
// heuristic still stumbles onto the right one and the comparison below proves
// nothing. On a grid the goal is diagonally opposite, the cheap route runs
// straight at it, and a route that is very slightly wrong is available and
// nearly as cheap -- so a heuristic that has stopped underestimating settles for
// the wrong one and is caught. Roughly a fifth of the roads are removed so that
// unreachable goals and forced detours come up on their own rather than having to
// be arranged by hand.
//
// Road costs are at least the straight-line distance between their ends. That is
// not a convenience: it is what keeps the straight-line heuristic admissible, and
// a generated graph that broke it would be testing a different algorithm.
//
// Most roads cost only a little over the ground between their ends, for the same
// reason: a heuristic is only interesting where it is sharp, because against roads
// costing six times the ground it barely bends the search's order and stays
// correct however wrong it gets.
func randomGraph(seed uint64, offRoad bool) *Graph {
	r := rng.New(seed)
	g := New()
	g.SetOffRoad(offRoad)
	const side = 5
	const spacing = 9.0

	// Node id 1..25 laid out on the lattice, row by row.
	at := func(col, row int) Node { return Node(row*side + col + 1) }
	for row := 0; row < side; row++ {
		for col := 0; col < side; col++ {
			g.AddNode(at(col, row),
				float64(col)*spacing+r.Range(-0.4, 0.4),
				float64(row)*spacing+r.Range(-0.4, 0.4))
		}
	}
	road := func(a, b Node) {
		// Never shorter than the ground, so the heuristic stays admissible.
		g.AddRoad(a, b, g.Distance(a, b)*r.Range(1.0, 1.2), int(a)*100+int(b))
	}
	for row := 0; row < side; row++ {
		for col := 0; col < side; col++ {
			if col+1 < side && r.Chance(0.85) {
				road(at(col, row), at(col+1, row))
			}
			if row+1 < side && r.Chance(0.85) {
				road(at(col, row), at(col, row+1))
			}
		}
	}
	// A few diagonals, so the grid is not a lattice of dead ends and the search
	// has genuinely competing routes to weigh.
	for i := 0; i < 6; i++ {
		a, b := Node(r.IntRange(1, side*side)), Node(r.IntRange(1, side*side))
		if a != b && r.Chance(0.85) {
			road(a, b)
		}
	}
	return g
}

// --- building the graph from a map ---

// roadState is a small map with two ways between 1 and 3: the direct road, and a
// longer detour through 4. It is the shape the rest of these tests use, because
// it is the smallest map on which "which way" is a real question.
func roadState() *model.State {
	s := model.NewState()
	s.Towns[1] = &model.Town{ID: 1, Name: "One", X: 0, Y: 0}
	s.Towns[2] = &model.Town{ID: 2, Name: "Two", X: 10, Y: 0}
	s.Towns[3] = &model.Town{ID: 3, Name: "Three", X: 20, Y: 0}
	s.Towns[4] = &model.Town{ID: 4, Name: "Four", X: 0, Y: 20}
	s.Routes[10] = &model.Route{ID: 10, TownA: 1, TownB: 2, Length: 12.2, Safety: 1, Terrain: model.TerrainPlain}
	s.Routes[11] = &model.Route{ID: 11, TownA: 2, TownB: 3, Length: 12.2, Safety: 1, Terrain: model.TerrainPlain}
	s.Routes[12] = &model.Route{ID: 12, TownA: 1, TownB: 4, Length: 24, Safety: 1, Terrain: model.TerrainPlain}
	s.Routes[13] = &model.Route{ID: 13, TownA: 4, TownB: 3, Length: 30, Safety: 1, Terrain: model.TerrainPlain}
	return s
}

func TestFromStateReadsRoadsOffTheMap(t *testing.T) {
	g := FromState(roadState())
	for _, id := range []Node{1, 2, 3, 4} {
		if !g.Has(id) {
			t.Errorf("town %d missing from the graph", id)
		}
		if !g.Positioned(id) {
			t.Errorf("town %d has no position", id)
		}
	}
	if got := len(g.Edges(1)); got != 2 {
		t.Errorf("town 1 has %d roads, want 2", got)
	}
	// Every town, in ascending order, because the order is what pins the search's
	// tie-break down.
	wantPath(t, g.Nodes(), 1, 2, 3, 4)
}

func TestFromStateRoadsAreTwoWay(t *testing.T) {
	g := FromState(roadState())
	forward, back := false, false
	for _, e := range g.Edges(1) {
		if e.To == 2 && e.Route == 10 {
			forward = true
		}
		if e.To == 2 && e.Route == 10 {
			back = true
		}
	}
	if !forward {
		t.Error("no road from 1 to 2")
	}
	// The mirrored edge must exist with the same cost, or a column could leave a
	// town by a road and not come back by it.
	for _, e := range g.Edges(2) {
		if e.To != 1 || e.Route != 10 {
			continue
		}
		back = e.Cost == 12.2
	}
	if !back {
		t.Error("no matching road from 2 back to 1")
	}
}

func TestFromStateLeavesOutBlockedRoads(t *testing.T) {
	// A blocked road carries nothing, the same way the logistics system leaves it
	// out when choosing where a caravan may go. Pathing a column over it would
	// send it somewhere the simulation has already closed.
	s := roadState()
	s.Routes[10].Blocked = true

	g := FromState(s)
	g.SetOffRoad(false)
	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 4, 3)
	for _, id := range res.RouteIDs {
		if id == 10 {
			t.Error("path used the blocked road")
		}
	}
}

func TestFromStateSkipsRoadsItCannotWalk(t *testing.T) {
	s := roadState()
	// A road to a town that is not on the map, a road to itself, and a road
	// naming a town id that belongs to nothing. None of them is a road a column
	// can travel, and none of them should stop the map being built.
	s.Routes[20] = &model.Route{ID: 20, TownA: 1, TownB: 77, Length: 5, Safety: 1}
	s.Routes[21] = &model.Route{ID: 21, TownA: 2, TownB: 2, Length: 5, Safety: 1}
	s.Routes[22] = &model.Route{ID: 22, TownA: 1, TownB: 88, Length: 5, Safety: 1}

	g := FromState(s)
	if g.Has(77) || g.Has(88) {
		t.Error("a road invented a town")
	}
	if len(g.Edges(2)) != 2 {
		t.Errorf("town 2 has %d roads, want 2 (a road to itself is not one)", len(g.Edges(2)))
	}
	if len(g.Edges(1)) != 2 {
		t.Errorf("town 1 has %d roads, want 2", len(g.Edges(1)))
	}
}

func TestFromStateOnAnEmptyMap(t *testing.T) {
	g := FromState(model.NewState())
	if len(g.Nodes()) != 0 {
		t.Errorf("an empty state produced %d settlements", len(g.Nodes()))
	}
	if res := AStar(1, 2, g); res.Reachable {
		t.Error("reached across an empty map")
	}
	if g := FromState(nil); len(g.Nodes()) != 0 {
		t.Errorf("a nil state produced %d settlements", len(g.Nodes()))
	}
}

func TestFromStateRouteCostsAreAdmissibleForTheHeuristic(t *testing.T) {
	// The straight-line heuristic is only legal if no edge costs less than the
	// ground it covers. Every road A* builds is checked against that here, on a
	// generated map rather than a hand-made one, because this is the invariant
	// that quietly stops holding when a save, a mod, or a world-data feed writes
	// a road length that means something else.
	s := generatedState(20251004)
	g := FromState(s)
	if len(g.Nodes()) == 0 {
		t.Fatal("no settlements built")
	}
	checked := 0
	for _, n := range g.Nodes() {
		for _, e := range g.Edges(n) {
			ground := g.Distance(n, e.To)
			if e.Cost < ground-1e-9 {
				t.Errorf("road %d from %d to %d costs %v, less than the %v between them",
					e.Route, n, e.To, e.Cost, ground)
			}
			if e.Cost <= 0 {
				t.Errorf("road %d costs %v", e.Route, e.Cost)
			}
			checked++
		}
	}
	if checked == 0 {
		t.Fatal("no roads to check")
	}
}

func TestFromStateRoutesTheWholeMap(t *testing.T) {
	// End to end: a generated map, a real query on it, checked against the
	// unguided search. This is the path the march system would take, from a state
	// rather than a graph someone assembled.
	s := generatedState(4242)
	g := FromState(s)
	nodes := g.Nodes()
	if len(nodes) < 4 {
		t.Fatalf("generated only %d settlements", len(nodes))
	}
	start, goal := nodes[0], nodes[len(nodes)-1]
	res := AStar(start, goal, g)
	if !res.Reachable {
		t.Fatalf("no path from %d to %d across a connected map", start, goal)
	}
	checkPath(t, g, start, goal, res)
	want, ok := referenceCost(g, start, goal)
	if !ok || math.Abs(res.Cost-want) > 1e-9 {
		t.Errorf("cost %v, cheapest %v", res.Cost, want)
	}
	// Nothing in the world generator writes a road quality below the floor, so on
	// a generated map the floor should never be what decides a cost.
	if RoadQuality(s.Routes[s.RouteIDs()[0]]) < MinRoadQuality {
		t.Error("a generated road is below the quality floor")
	}
}

// generatedState builds a small map the way the world generator does: towns on a
// grid with jitter, each joined to its nearest few neighbours by a road a little
// longer than the ground between them, with road safety seeded across the range.
func generatedState(seed uint64) *model.State {
	r := rng.New(seed)
	s := model.NewState()
	const towns = 24
	const spacing = 12.0
	ids := make([]int, 0, towns)
	for i := 0; i < towns; i++ {
		id := s.NewID(model.IDTown)
		ids = append(ids, id)
		s.Towns[id] = &model.Town{
			ID:      id,
			Name:    "Town",
			X:       float64(i%6)*spacing + r.Range(-2, 2),
			Y:       float64(i/6)*spacing + r.Range(-2, 2),
			Terrain: r.IntRange(model.TerrainPlain, model.TerrainMax),
		}
	}
	for _, id := range ids {
		type cand struct {
			id   int
			dist float64
		}
		var cands []cand
		for _, oid := range ids {
			if oid == id {
				continue
			}
			cands = append(cands, cand{oid, s.DistanceBetweenTowns(id, oid)})
		}
		for x := 0; x < len(cands); x++ {
			for y := x + 1; y < len(cands); y++ {
				if cands[y].dist < cands[x].dist {
					cands[x], cands[y] = cands[y], cands[x]
				}
			}
		}
		for k := 0; k < 3 && k < len(cands); k++ {
			if r.Chance(0.2) {
				continue
			}
			pair := model.MakePair(id, cands[k].id)
			if routeBetween(s, pair) {
				continue
			}
			rid := s.NewID(model.IDRoute)
			s.Routes[rid] = &model.Route{
				ID:      rid,
				TownA:   id,
				TownB:   cands[k].id,
				Length:  cands[k].dist * 1.22,
				Safety:  r.Range(0.2, 1),
				Terrain: r.IntRange(model.TerrainPlain, model.TerrainMax),
				Blocked: r.Chance(0.1),
			}
		}
	}
	return s
}

// routeBetween reports whether the state already has a road joining a pair of
// towns, so the generator does not lay two roads down the same way.
func routeBetween(s *model.State, pair model.Pair) bool {
	for _, rid := range s.RouteIDs() {
		r := s.Routes[rid]
		if model.MakePair(r.TownA, r.TownB) == pair {
			return true
		}
	}
	return false
}

// --- road costs ---

func TestRoadCostIsLengthOverQuality(t *testing.T) {
	a := &model.Town{ID: 1, X: 0, Y: 0}
	b := &model.Town{ID: 2, X: 30, Y: 40} // 50 away

	for _, tc := range []struct {
		name   string
		route  model.Route
		length float64
		cost   float64
	}{
		{"a perfect road costs its length", model.Route{Length: 50, Safety: 1}, 50, 50},
		{"half safe costs twice", model.Route{Length: 50, Safety: 0.5}, 50, 100},
		{"a quarter safe costs four times", model.Route{Length: 50, Safety: 0.25}, 50, 200},
		{"safety above one is not a bonus", model.Route{Length: 50, Safety: 4}, 50, 50},
		{"negative safety is not a discount", model.Route{Length: 50, Safety: -3}, 50, 200},
		{"a road is never shorter than the ground", model.Route{Length: 1, Safety: 1}, 50, 50},
		{"a longer road stays longer", model.Route{Length: 120, Safety: 1}, 120, 120},
		{"rough ground on a poor road", model.Route{Length: 50, Safety: 0.1, Terrain: model.TerrainMountain}, 50, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := tc.route
			want := expectedQuality(&r)
			if got := RoadQuality(&r); math.Abs(got-want) > 1e-9 {
				t.Errorf("quality %v, want %v", got, want)
			}
			if got := RoadCost(&r, a, b); math.Abs(got-tc.cost) > 1e-9 {
				t.Errorf("cost %v, want %v", got, tc.cost)
			}
		})
	}
}

// expectedQuality restates RoadQuality independently, so a change to the formula
// cannot quietly change what this test asserts. Safety clamped to [0,1], then
// floored at MinRoadQuality: nothing about the terrain is applied here, because
// Route.Safety is already the security system's verdict on the road and has the
// ground folded into it.
func expectedQuality(r *model.Route) float64 {
	q := math.Max(0, math.Min(1, r.Safety))
	return math.Max(MinRoadQuality, q)
}

func TestRoadQualityHasAFloor(t *testing.T) {
	// A road nobody patrols and raiders hold has a safety of zero. Quality
	// divides into cost, so without a floor that road would cost an infinity,
	// and an infinite edge is indistinguishable from an absent one: the road
	// would vanish off the map precisely when it was most worth avoiding and
	// least worth trusting.
	r := &model.Route{Length: 40, Safety: 0, Raiders: 1, Terrain: model.TerrainMountain}
	q := RoadQuality(r)
	if q < MinRoadQuality {
		t.Errorf("quality %v is below the floor %v", q, MinRoadQuality)
	}
	cost := RoadCost(r, &model.Town{X: 0, Y: 0}, &model.Town{X: 0, Y: 40})
	if math.IsInf(cost, 1) || math.IsNaN(cost) {
		t.Fatalf("a lawless road costs %v", cost)
	}
	if want := 40 / MinRoadQuality; math.Abs(cost-want) > 1e-9 {
		t.Errorf("cost %v, want %v", cost, want)
	}
}

func TestRoadCostOnANilRoute(t *testing.T) {
	if got := RoadQuality(nil); got != MinRoadQuality {
		t.Errorf("quality of no route %v, want the floor %v", got, MinRoadQuality)
	}
	if got := RoadCost(nil, nil, nil); !math.IsInf(got, 1) {
		t.Errorf("cost of no route %v, want +Inf", got)
	}
}

func TestRoadCostWithUnknownTownsFallsBackToLength(t *testing.T) {
	r := &model.Route{Length: 25, Safety: 0.5}
	if got := RoadCost(r, nil, nil); math.Abs(got-50) > 1e-9 {
		t.Errorf("cost %v, want 50", got)
	}
}

// --- the graph's own rules ---

func TestAddRoadRefusesCostsThatWouldBreakTheSearch(t *testing.T) {
	// A negative edge has no cheapest path: a cycle around it can be repeated for
	// arbitrarily little cost, and every shortest-path answer would then be
	// arbitrary. Refusing it at the door is better than returning one.
	g := line(3, false)
	g.AddRoad(1, 2, -5, 10)
	g.AddRoad(2, 3, math.NaN(), 11)
	g.AddRoad(1, 3, math.Inf(1), 12)
	for _, n := range []Node{1, 2, 3} {
		if got := len(g.Edges(n)); got != 0 {
			t.Errorf("node %d has %d edges, want none", n, got)
		}
	}
	// A zero-cost road is a different matter and is kept: two settlements on the
	// same spot, or a road the world gives away, are both real.
	g.AddRoad(1, 2, 0, 13)
	if got := len(g.Edges(1)); got != 1 {
		t.Errorf("a zero-cost road was dropped")
	}
	if res := AStar(1, 2, g); !res.Reachable || res.Cost != 0 {
		t.Errorf("a zero-cost road gave %+v", res)
	}
}

func TestDistanceIsZeroForASettlementWithNoPosition(t *testing.T) {
	// The heuristic must never overestimate, and a missing position has to
	// underestimate rather than guess. Zero is the safe direction: the search
	// loses its guidance for that settlement instead of its correctness.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddRoad(1, 2, 1, 10) // node 2 has no position
	if got := g.Distance(1, 2); got != 0 {
		t.Errorf("distance to an unpositioned settlement %v, want 0", got)
	}
	if got := g.Distance(1, 1); got != 0 {
		t.Errorf("distance to itself %v, want 0", got)
	}
	if got := g.Distance(99, 1); got != 0 {
		t.Errorf("distance from an unknown settlement %v, want 0", got)
	}

	// So a map whose settlements have no coordinates is still searchable, and
	// still costs what the roads say rather than nothing.
	res := AStar(1, 2, g)
	if !res.Reachable {
		t.Fatal("a road with no coordinates is still a road")
	}
	if res.Cost != 1 {
		t.Errorf("cost %v, want 1 -- crossing nowhere should not be free", res.Cost)
	}
}

func TestUnpositionedSettlementsStillRoute(t *testing.T) {
	// A graph where only some settlements have positions. The search has to keep
	// working, and keep finding the same answer the unguided search finds.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(3, 30, 0)
	g.AddRoad(1, 2, 2, 10)
	g.AddRoad(2, 3, 2, 11)
	if g.Positioned(2) {
		t.Error("node 2 should have no position")
	}
	res := AStar(1, 3, g)
	checkPath(t, g, 1, 3, res)
	wantPath(t, res.Path, 1, 2, 3)
	if res.Cost != 4 {
		t.Errorf("cost %v, want 4", res.Cost)
	}
}

func TestGraphEdgesComeBackInTheOrderTheyWentIn(t *testing.T) {
	// The search relaxes a settlement's edges in the order they are stored, and
	// its tie-break is insertion order, so the stored order is part of what makes
	// the answer repeatable.
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 1, 0)
	g.AddNode(3, 2, 0)
	g.AddRoad(1, 3, 5, 30)
	g.AddRoad(1, 2, 5, 20)
	edges := g.Edges(1)
	if len(edges) != 2 {
		t.Fatalf("node 1 has %d edges, want 2", len(edges))
	}
	if edges[0].Route != 30 || edges[1].Route != 20 {
		t.Errorf("edges came back as %d then %d, want 30 then 20", edges[0].Route, edges[1].Route)
	}
}

func TestResultOffRoadOnlyReportsRealCrossings(t *testing.T) {
	// The first entry of a route list is always NoRoute, because a path starts
	// nowhere. Counting that as a crossing would make every path on earth look
	// like it left the roads, which is the mistake this pins down.
	roads := Result{Path: []Node{1, 2}, RouteIDs: []int{NoRoute, 10}, Reachable: true}
	if roads.OffRoad() {
		t.Error("a path entirely on roads reported as off-road")
	}
	crossing := Result{Path: []Node{1, 2, 3}, RouteIDs: []int{NoRoute, 11, NoRoute}, Reachable: true}
	if !crossing.OffRoad() {
		t.Error("a path that crossed open country reported as on-road")
	}
}
