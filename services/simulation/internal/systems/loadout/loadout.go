// Package loadout models civilian settlement equipment (Tier 6).
//
// Bannerlord towns have militia whose equipment quality depends on the
// town's prosperity. This system models that: each tick, a town's
// militia effectiveness is adjusted based on prosperity and the
// town's metal stock (weapons need metal).
//
// Mechanics:
//   - Militia count is set by other systems (growth, etc.). This system
//     computes an equipment quality multiplier from prosperity and
//     metal availability.
//   - The quality is stored as militia_morale (proxy for effectiveness;
//     well-equipped militia fight with confidence). High prosperity +
//     metal stock = high morale = effective militia.
//   - Poor towns with no metal have poorly-equipped militia (low morale).
//
// This is a staged-write system using existing fields only.
package loadout

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// Tuning constants.
const (
	// prosperityWeight is how much prosperity affects equipment quality.
	prosperityWeight = 0.5
	// metalWeight is how much metal stock affects equipment quality.
	metalWeight = 0.5
	// metalForFullKit is the metal stock needed for fully-equipped militia.
	metalForFullKit = 100.0
	// baseMorale is the morale for a town with no prosperity or metal.
	baseMorale = 0.2
)

// System returns the loadout system.
func System() sim.System {
	return sim.System{
		Name: "loadout",
		Doc:  "militia equipment quality from prosperity and metal stock",
		Runs: run,
	}
}

// equipmentQuality computes the 0-1 equipment quality.
func equipmentQuality(prosperity, metalStock float64) float64 {
	metalFactor := metalStock / metalForFullKit
	if metalFactor > 1.0 {
		metalFactor = 1.0
	}
	q := baseMorale + prosperity*prosperityWeight + metalFactor*metalWeight
	return shared.Clamp(q, 0.0, 1.0)
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.Militia <= 0 {
			continue
		}

		metal, _ := v.State.Get(model.KindTown, tid, "metal")
		quality := equipmentQuality(t.Prosperity, metal)
		read := shared.ReadString(
			shared.Pair("prosperity", t.Prosperity),
			shared.Pair("metal", metal),
			shared.Pair("militia", float64(t.Militia)),
			shared.Pair("quality", quality),
		)
		causes := v.Log.RecentFor(model.KindTown, tid,
			[]string{"prosperity", "metal"}, 3)

		// Well-equipped militia have high readiness (effectiveness).
		// We move toward the quality target gradually to avoid runaway.
		current, ok := v.State.Get(model.KindTown, tid, "militia_readiness")
		if !ok {
			continue
		}
		delta := (quality - current) * 0.1
		w.Add(model.KindTown, tid, "militia_readiness", delta,
			read, causes, "militia re-equipped")
	}
}
