package pathfind

import (
	"math"
	"testing"
)

func testGraph() *Graph {
	// A --1-- B --1-- C
	// |               |
	// 5               5
	// |               |
	// D ------1------ E
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 1, 0)
	g.AddNode(3, 2, 0)
	g.AddNode(4, 0, 1)
	g.AddNode(5, 2, 1)
	g.AddRoad(1, 2, 1, 101)
	g.AddRoad(2, 3, 1, 102)
	g.AddRoad(1, 4, 5, 103)
	g.AddRoad(4, 5, 1, 104)
	g.AddRoad(3, 5, 5, 105)
	return g
}

func TestAStarOptimal(t *testing.T) {
	g := testGraph()
	// Optimal: 1->2->3 (cost 2), not 1->4->5->3 (cost 11)
	res := AStar(1, 3, g)
	if !res.Reachable {
		t.Fatal("expected reachable")
	}
	if res.Cost != 2 {
		t.Errorf("expected cost 2, got %v", res.Cost)
	}
	if len(res.Path) != 3 || res.Path[0] != 1 || res.Path[1] != 2 || res.Path[2] != 3 {
		t.Errorf("wrong path: %v", res.Path)
	}
}

func TestAStarSameNode(t *testing.T) {
	g := testGraph()
	res := AStar(1, 1, g)
	if !res.Reachable {
		t.Fatal("expected reachable")
	}
	if len(res.Path) != 1 || res.Cost != 0 {
		t.Errorf("expected [1],0 got %v,%v", res.Path, res.Cost)
	}
}

func TestAStarPrefersRoads(t *testing.T) {
	// Task 437: off-road costs 3x, so roads are preferred even if longer
	g := New()
	g.AddNode(1, 0, 0)
	g.AddNode(2, 10, 0)
	g.AddNode(3, 1, 0)
	g.AddRoad(1, 2, 10, 201) // long road to node 2
	// No road 1->3, so off-road at 3x (distance 1 * 3 = 3)
	// Road 1->2 costs 10, off-road 1->3 costs 3, so 1->3 wins
	res := AStar(1, 3, g)
	if !res.Reachable {
		t.Fatal("expected reachable via off-road")
	}
	if math.IsInf(res.Cost, 1) {
		t.Error("cost should not be infinite")
	}
}
