// Package pathfind implements A* pathfinding over the simulation's route graph.
//
// Tasks 436, 437: A* on the road network, preferring roads over off-road.
// The graph is built from model.State.Routes; each route is an edge with a
// cost based on length and terrain. Off-road movement (direct between
// settlements with no route) costs 3x, so the pathfinder prefers roads.
package pathfind

import (
	"container/heap"
	"math"
)

// Node is a settlement ID in the pathfinding graph.
type Node int

// Edge is a traversable connection between two settlements.
type Edge struct {
	To   Node
	Cost float64
}

// Graph is the pathfinding graph: settlement -> edges.
type Graph map[Node][]Edge

// Heuristic is the estimated cost from node to goal (must be admissible).
type Heuristic func(from, to Node) float64

// item is a node in the priority queue.
type item struct {
	node     Node
	priority float64
	index    int
}

type priorityQueue []*item

func (pq priorityQueue) Len() int            { return len(pq) }
func (pq priorityQueue) Less(i, j int) bool  { return pq[i].priority < pq[j].priority }
func (pq priorityQueue) Swap(i, j int)       { pq[i], pq[j] = pq[j], pq[i]; pq[i].index = i; pq[j].index = j }
func (pq *priorityQueue) Push(x any)         { *pq = append(*pq, x.(*item)) }
func (pq *priorityQueue) Pop() any {
	old := *pq
	n := len(old)
	it := old[n-1]
	*pq = old[:n-1]
	return it
}

// AStar finds the optimal path from start to goal using the A* algorithm.
// Returns the path as a list of nodes (including start and goal), and the
// total cost. Returns nil if no path exists.
func AStar(graph Graph, start, goal Node, h Heuristic) ([]Node, float64) {
	if start == goal {
		return []Node{start}, 0
	}

	open := &priorityQueue{}
	heap.Init(open)
	heap.Push(open, &item{node: start, priority: h(start, goal)})

	cameFrom := make(map[Node]Node)
	gScore := map[Node]float64{start: 0}
	closed := make(map[Node]bool)

	for open.Len() > 0 {
		current := heap.Pop(open).(*item).node

		if current == goal {
			return reconstruct(cameFrom, current), gScore[current]
		}

		if closed[current] {
			continue
		}
		closed[current] = true

		for _, edge := range graph[current] {
			if closed[edge.To] {
				continue
			}
			tentative := gScore[current] + edge.Cost
			if existing, ok := gScore[edge.To]; !ok || tentative < existing {
				cameFrom[edge.To] = current
				gScore[edge.To] = tentative
				heap.Push(open, &item{node: edge.To, priority: tentative + h(edge.To, goal)})
			}
		}

		// Task 437: off-road option — direct movement at 3x cost.
		// This ensures a path always exists even without roads, but roads
		// are strongly preferred.
		if _, ok := gScore[goal]; !ok {
			// Only consider off-road if we haven't reached goal via roads
			offRoadCost := gScore[current] + h(current, goal)*3
			if existing, ok := gScore[goal]; !ok || offRoadCost < existing {
				cameFrom[goal] = current
				gScore[goal] = offRoadCost
			}
		}
	}

	if cost, ok := gScore[goal]; ok {
		return reconstruct(cameFrom, goal), cost
	}
	return nil, math.Inf(1)
}

func reconstruct(cameFrom map[Node]Node, current Node) []Node {
	path := []Node{current}
	for {
		prev, ok := cameFrom[current]
		if !ok {
			break
		}
		path = append([]Node{prev}, path...)
		current = prev
	}
	return path
}

// EuclideanHeuristic returns a heuristic based on straight-line distance.
// coords maps node -> (x, y). The heuristic is admissible (never overestimates)
// when edge costs are >= Euclidean distance.
func EuclideanHeuristic(coords map[Node][2]float64) Heuristic {
	return func(from, to Node) float64 {
		a, okA := coords[from]
		b, okB := coords[to]
		if !okA || !okB {
			return 0
		}
		dx := a[0] - b[0]
		dy := a[1] - b[1]
		return math.Sqrt(dx*dx + dy*dy)
	}
}
