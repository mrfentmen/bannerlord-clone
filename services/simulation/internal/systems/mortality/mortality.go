// Package mortality handles aging and death.
//
// Rulers age one year per 365 ticks. Death chance increases with age:
//   - Under 50: negligible
//   - 50-60: 1% per year
//   - 60-70: 5% per year
//   - 70-80: 15% per year
//   - 80+: 30% per year
//
// When a ruler dies, their heir (if any) succeeds them. Otherwise
// their lands go to the faction leader.
package mortality

import (
	"math/rand"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the mortality system.
func System() sim.System {
	return sim.System{
		Name: "mortality",
		Doc:  "rulers age and die; heirs succeed",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, rid := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[rid]
		if r == nil || !r.IsAlive {
			continue
		}

		// Age one year per 365 ticks.
		newAge := r.Age + 1.0/365.0
		w.Set(model.KindRuler, rid, "age", newAge, "", nil, "")

		// Death check (once per year, on birthday).
		if int(newAge) > int(r.Age) {
			deathChance := deathChanceFor(newAge)
			if rand.Float64() < deathChance {
				// Ruler dies.
				w.Set(model.KindRuler, rid, "is_alive", 0,
					"died of old age", nil, "mortality")
				// TODO: succession - transfer lands to heir
			}
		}
	}
}

// deathChanceFor returns the annual death probability for an age.
func deathChanceFor(age float64) float64 {
	switch {
	case age < 50:
		return 0.001
	case age < 60:
		return 0.01
	case age < 70:
		return 0.05
	case age < 80:
		return 0.15
	default:
		return 0.30
	}
}
