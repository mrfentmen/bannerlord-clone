// Package diplomacy handles war and peace between factions.
//
// Sides can be at war or at peace. War enables battles and raids.
// Peace allows trade and travel. War weariness grows during war and
// pushes sides toward peace.
package diplomacy

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the diplomacy system.
func System() sim.System {
	return sim.System{
		Name: "diplomacy",
		Doc:  "war and peace between factions; war weariness pushes toward peace",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, sid := range v.State.SideIDs() {
		s := v.State.Sides[sid]
		if s == nil {
			continue
		}

		// War weariness decays during peace, grows during war.
		// TODO: track actual war state per side pair.
		// For now, war weariness slowly decays.
		if s.WarWeariness > 0 {
			decay := s.WarWeariness * 0.01
			w.Add(model.KindSide, sid, "war_weariness", -decay,
				"war weariness fades", nil, "diplomacy")
		}
	}
}

// DeclareWar marks two sides as at war.
// This enables battles between their parties.
func DeclareWar(w *sim.WriteSet, sideA, sideB int) {
	// War state is tracked via the relation system.
	// A relation of -100 means total war.
	w.Set(model.KindSide, sideA, "war_weariness",
		0, "war declared", nil, "diplomacy")
}

// MakePeace ends a war between two sides.
func MakePeace(w *sim.WriteSet, sideA, sideB int) {
	w.Set(model.KindSide, sideA, "war_weariness",
		50, "war ended, weariness remains", nil, "diplomacy")
}
