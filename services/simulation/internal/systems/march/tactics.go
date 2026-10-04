// Package march - tactics.go
//
// Tasks D442, D444, D449: forced march, interrupt on enemy contact,
// night travel modifier.
//
// These are tactical movement options that modify the base march behavior.
package march

import (
	"math"

	"mbclone/simulation/internal/sim"
)

// D442: Forced march.
// A party can choose to march faster at the cost of fatigue and morale.
// Speed +50%, fatigue gain x2, morale loss x2.
// The caller sets forced=true when the player orders it.
func forcedMarchModifier(forced bool) (speedMult, fatigueMult, moraleMult float64) {
	if !forced {
		return 1.0, 1.0, 1.0
	}
	return 1.5, 2.0, 2.0
}

// D444: Check for enemy interruption.
// Returns true if a hostile party is within interruptRange of the given position.
// A party that makes contact stops moving for the tick.
func checkEnemyInterrupt(v *sim.View, pid int, x, y float64, interruptRange float64) bool {
	p := v.State.Parties[pid]
	for oid, op := range v.State.Parties {
		if oid == pid {
			continue
		}
		// Skip if same side or not hostile
		if op.SideID == p.SideID {
			continue
		}
		// Check if hostile (at war or raiding)
		if !isHostile(v, p.SideID, op.SideID) {
			continue
		}
		dx := op.X - x
		dy := op.Y - y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist < interruptRange {
			return true
		}
	}
	return false
}

// isHostile checks if two sides are hostile (at war).
func isHostile(v *sim.View, sideA, sideB int) bool {
	// Check wars in state
	for _, war := range v.State.Wars {
		if (war.SideA == sideA && war.SideB == sideB) ||
			(war.SideA == sideB && war.SideB == sideA) {
			return true
		}
	}
	return false
}

// D449: Night travel modifier.
// Parties moving at night (Tick mod 2 == 1, representing night hours)
// move 30% slower due to reduced visibility.
// The sim doesn't have intraday time, so we use tick parity as a proxy:
// even ticks = day, odd ticks = night.
func nightTravelModifier(tick int) float64 {
	if tick%2 == 1 {
		return 0.7 // 30% slower at night
	}
	return 1.0
}
