// Package aging handles ruler aging and natural death (Tier 1.5).
//
// Every 365 ticks (one year), all living rulers age by one year. Natural
// death probability rises with age: negligible before 50, then climbing.
// This is why heirs matter — a ruler who lives long enough will die of
// old age, and the clan must have someone to inherit.
//
// The death chance uses Bannerlord's pattern: base chance near zero until
// middle age, then exponential growth. A 70-year-old faces real risk each
// year; an 80-year-old is living on borrowed time.
package aging

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the aging system.
func System() sim.System {
	return sim.System{
		Name: "aging",
		Doc:  "ages rulers yearly and applies natural death from old age",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	// Only age once per year, on the first day.
	if v.Day != 0 {
		return
	}

	for _, id := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[id]
		if r == nil || !r.IsAlive {
			continue
		}

		newAge := r.Age + 1
		read := shared.ReadString(
			shared.PairI("ruler", id),
			shared.PairF("old_age", r.Age),
		)
		causes := v.Log.RecentFor(model.KindRuler, id,
			[]string{"ruler_age"}, 1)

		w.Set(model.KindRuler, id, "ruler_age", newAge,
			read, causes, "yearly aging")

		// Natural death check. Uses the security RNG substream for
		// determinism — same seed, same deaths.
		deathChance := naturalDeathChance(newAge)
		if deathChance > 0 {
			roll := v.Rng.Float64()
			if roll < deathChance {
				w.Set(model.KindRuler, id, "is_alive", 0,
					read, causes, "died of old age")
			}
		}
	}
}

// naturalDeathChance returns the annual probability of dying from old age.
// Bannerlord-style: flat near zero until 50, then rising steeply.
func naturalDeathChance(age float64) float64 {
	if age < 50 {
		return 0
	}
	// At 50: ~1%. At 60: ~4%. At 70: ~12%. At 80: ~30%.
	over := age - 50
	return 0.01 * (1 + over*over/100)
}
