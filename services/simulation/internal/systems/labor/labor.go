// Package labor converts people into workers, and workers into output.
//
// Reads population, infection, and starvation, writes workers, employment,
// prosperity, and the unrest that unemployment creates. This is the middle of
// the two chains that matter: a plague lowers workers, fewer workers lower
// food production, and that is how a disease becomes a famine (chain 2).
package labor

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the labor system.
func System() sim.System {
	return sim.System{
		Name: "labor",
		Doc:  "turns living people into workers, and workers into output and prosperity",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			w.Set(model.KindTown, id, "workers", 0, "population=0", nil, "town is empty")
			continue
		}

		// The healthy working-age share is the ceiling on labour. Sickness
		// removes workers directly: a sick worker cannot work, which is the
		// disease system's whole contribution to the food chain.
		healthyShare := shared.Clamp01(c.Labor.HealthyWorkerShare) * (1 - shared.Clamp01(t.Infected))
		// A starving town loses workers as well as people, because the
		// weakened cannot labour even if they are alive.
		starveDrag := 1 - 0.5*shared.Clamp01(t.StarveSeverity)
		capable := t.Population * healthyShare * starveDrag

		// The labor system is the only writer of town workers, and it writes
		// toward the capable count rather than jumping to it. A town recovering
		// from plague gets its workers back over weeks, which is chain 5's
		// recovery speed (TESTING_AND_BALANCE.md section 4: recovery takes
		// weeks, not instantly).
		// Recovery is faster when there is slack (unfilled jobs) and slower
		// when everyone healthy is already working.
		headroom := 1 - shared.SafeDiv(t.Workers, capable)
		if headroom < 0 {
			headroom = 0
		}
		target := t.Workers + (capable-t.Workers)*c.Labor.WorkerRecoveryRate*(0.5+0.5*shared.Clamp01(headroom))
		target = shared.Clamp(target, t.Population*c.Labor.MinWorkerShare, t.Population*c.Labor.MaxWorkerShare)
		if target < 0 {
			target = 0
		}

		// Employment: how much of the potential workforce has a job. In a poor
		// town, healthy workers cannot find work even though they can work it.
		employment := shared.Clamp01(shared.SafeDiv(t.Workers, capable))
		if capable <= 0 {
			employment = 0
		}
		// Prosperity is commerce, and commerce needs both labour and public
		// health: a clean, employed town trades well.
		prosperity := (c.Labor.ProsperityFromWorkers*employment +
			c.Labor.ProsperityFromSanitation*shared.Clamp01(t.Sanitation)) / (c.Labor.ProsperityFromWorkers + c.Labor.ProsperityFromSanitation)
		prosperity *= c.Labor.ProsperityCap
		// Prosperity erodes if nothing supports it, so a town that loses both
		// labour and hygiene keeps falling rather than settling at a middling
		// level.
		prosperity -= c.Labor.ProsperityDecay * (1 - prosperity)

		// Unemployment: people who could work and cannot find work are the
		// classic source of unrest that has nothing to do with taxes or famine.
		unemployment := 0.0
		if employment < c.Labor.UnemploymentThreshold {
			span := c.Labor.UnemploymentMax - c.Labor.UnemploymentThreshold
			unemployment = shared.Clamp01((c.Labor.UnemploymentThreshold - employment) / shared.SafeDiv(span, 1))
		}
		unemploymentRage := c.Labor.UnrestFromUnemployment * unemployment

		read := shared.ReadString(
			shared.PairF("population", t.Population),
			shared.PairF("workers", t.Workers),
			shared.Pair("infected", t.Infected),
			shared.Pair("sanitation", t.Sanitation),
			shared.Pair("starve_severity", t.StarveSeverity),
			shared.Pair("prosperity", t.Prosperity),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"population", "infected", "sanitation", "is_starving", "prosperity"}, 5)

		w.Set(model.KindTown, id, "workers", target, read, causes, "workers available")
		w.Set(model.KindTown, id, "sick_workers", t.Workers-capable, read, causes, "workers lost to sickness")
		w.Set(model.KindTown, id, "employment", employment, read, causes, "")
		w.Set(model.KindTown, id, "prosperity", shared.Clamp01(prosperity), read, causes, "")

		// The unemployment component of unrest. Unrest itself is written only
		// by the unrest system, which sums pressure from every source; this
		// system stages its contribution into pressure, which is shared state
		// rather than a direct call (CONSTITUTION.md section 2.1).
		w.Add(model.KindTown, id, "pressure", unemploymentRage, read, causes, "unemployment")
	}
}
