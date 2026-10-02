package battle

import (
	"fmt"
	"testing"
)

// TestDiagHashCoverage is SCRATCH. It checks the one claim grid.go makes about
// forEachCell: that a query of radius r visits every unit within r.
//
// A unit is placed exactly on a cell boundary in the worst possible spot — at
// the far edge of its own cell, so that a target at distance r sits one cell
// further out than a naive floor(r/size) walk reaches.
func TestDiagHashCoverage(t *testing.T) {
	cfg := loadConfig(t)
	c := cfg.Battle
	fmt.Printf("\nmelee_range=%g melee_cell=%g | ranged_range=%g ranged_cell=%g | nbhd=%g\n",
		c.MeleeRange, c.GridCellSize, c.RangedRange, c.RangedGridCellSize, c.MoraleNeighbourhood)
	fmt.Printf("melee span=%d  ranged span=%d  morale span(on fire hash)=%d\n\n",
		func() int { h := newHash(c.GridCellSize, int(c.GridMaxCells)); return h.span(c.MeleeRange) }(),
		func() int { h := newHash(c.RangedGridCellSize, int(c.GridMaxCells)); return h.span(c.RangedRange) }(),
		func() int {
			h := newHash(c.RangedGridCellSize, int(c.GridMaxCells))
			return h.span(c.MoraleNeighbourhood)
		}())

	check := func(name string, h *hash, ax, ay, r float64) {
		units := []*Unit{
			{ID: 0, X: ax, Y: ay, Status: StatusFighting},
			{ID: 1, X: ax + r, Y: ay, Status: StatusFighting}, // exactly at range
			{ID: 2, X: ax + r*0.999, Y: ay, Status: StatusFighting},
		}
		h.rebuild(units)
		seen := map[int]bool{}
		h.forEachCell(ax, ay, r, func(id int) { seen[id] = true })
		_, gotAtRange := seen[1]
		_, gotJustInside := seen[2]
		status := "OK"
		if !gotAtRange {
			status = "*** MISSED a target at exactly the query radius ***"
		}
		fmt.Printf("%-22s radius=%7.1f at (%8.2f,%8.2f) cell=(%d,%d) -> found target at range: %-5v just inside: %-5v  %s\n",
			name, r, ax, ay, h.cellOf(ax, ay).CX, h.cellOf(ax, ay).CY, gotAtRange, gotJustInside, status)
	}

	// The worst case for the walk: the querying unit sits at the far edge of its
	// own cell, so the target lands one cell further out than floor(r/size).
	melee := newHash(c.GridCellSize, int(c.GridMaxCells))
	edge := c.GridCellSize - 1e-6
	check("melee, far edge", melee, edge, 0, c.MeleeRange)
	check("melee, at origin", melee, 0, 0, c.MeleeRange)

	fire := newHash(c.RangedGridCellSize, int(c.GridMaxCells))
	fedge := c.RangedGridCellSize - 1e-6
	check("ranged, far edge", fire, fedge, 0, c.RangedRange)
	check("ranged, at origin", fire, 0, 0, c.RangedRange)
	check("morale nbhd, far edge", fire, fedge, 0, c.MoraleNeighbourhood)

	// And the case that matters most in practice: two men in contact, one either
	// side of a cell boundary. This is the melee stage's whole precondition.
	units := []*Unit{
		{ID: 0, X: 11.9, Y: 0, Status: StatusFighting, Troops: 1, MaxHP: 100, HP: 100, Morale: 0.8, Side: SideA},
		{ID: 1, X: 14.4, Y: 0, Status: StatusFighting, Troops: 1, MaxHP: 100, HP: 100, Morale: 0.8, Side: SideB},
	}
	melee.rebuild(units)
	fmt.Printf("\ncontact across a cell boundary: gap=%.2f m, melee_range=%g m", 14.4-11.9, c.MeleeRange)
	b := &Battle{c: c, units: units, byID: units, meleeHash: melee}
	fmt.Printf(" -> enemyInMelee()=%v\n", b.enemyInMelee(11.9, 0, SideA))
	fmt.Printf("(two men 2.5 m apart, a swing reaches 2.6 m)\n")
}
