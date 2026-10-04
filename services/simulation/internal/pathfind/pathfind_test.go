package pathfind

import (
	"math"
	"testing"
)

func testGraph() (Graph, map[Node][2]float64) {
	// A --1-- B --1-- C
	// |               |
	// 5               5
	// |               |
	// D ------1------ E
	graph := Graph{
		1: {{To: 2, Cost: 1}, {To: 4, Cost: 5}},
		2: {{To: 1, Cost: 1}, {To: 3, Cost: 1}},
		3: {{To: 2, Cost: 1}, {To: 5, Cost: 5}},
		4: {{To: 1, Cost: 5}, {To: 5, Cost: 1}},
		5: {{To: 4, Cost: 1}, {To: 3, Cost: 5}},
	}
	coords := map[Node][2]float64{
		1: {0, 0}, 2: {1, 0}, 3: {2, 0}, 4: {0, 1}, 5: {2, 1},
	}
	return graph, coords
}

func TestAStarOptimal(t *testing.T) {
	graph, coords := testGraph()
	h := EuclideanHeuristic(coords)
	// Optimal: 1->2->3 (cost 2), not 1->4->5->3 (cost 11)
	path, cost := AStar(graph, 1, 3, h)
	if cost != 2 {
		t.Errorf("expected cost 2, got %v", cost)
	}
	if len(path) != 3 || path[0] != 1 || path[1] != 2 || path[2] != 3 {
		t.Errorf("wrong path: %v", path)
	}
}

func TestAStarSameNode(t *testing.T) {
	graph, coords := testGraph()
	h := EuclideanHeuristic(coords)
	path, cost := AStar(graph, 1, 1, h)
	if len(path) != 1 || cost != 0 {
		t.Errorf("expected [1],0 got %v,%v", path, cost)
	}
}

func TestAStarPrefersRoads(t *testing.T) {
	// Task 437: off-road costs 3x, so roads are preferred even if longer
	graph := Graph{
		1: {{To: 2, Cost: 10}}, // long road
		2: {{To: 1, Cost: 10}},
	}
	coords := map[Node][2]float64{1: {0, 0}, 2: {1, 0}, 3: {0.5, 0}}
	h := EuclideanHeuristic(coords)
	// No road 1->3, so off-road at 3x heuristic (0.5*3=1.5)
	// Road 1->2 costs 10, so off-road 1->3 (1.5) wins if goal is 3
	path, cost := AStar(graph, 1, 3, h)
	if path == nil {
		t.Fatal("expected a path via off-road")
	}
	if math.IsInf(cost, 1) {
		t.Error("cost should not be infinite")
	}
}
