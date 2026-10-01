// Package crime models urban criminality (Tier 5).
//
// Crime grows where prosperity is high but security is low: rich towns with
// weak garrisons breed thieves. Crime reduces prosperity and tax income,
// and it feeds unrest. A ruler can suppress crime by stationing troops,
// but troops cost money — the classic guns-vs-butter tradeoff.
//
// This is depth, not a core loop: it makes rich, neglected towns fragile
// in a way that prosperity alone would not.
package crime

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the crime system.
func System() sim.System {
	return sim.System{
		Name: "crime",
		Doc:  "grows criminality in rich, under-policed towns; crime erodes prosperity",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil {
			continue
		}
		// Crime pressure: prosperity attracts criminals; garrison +
		// militia deter them. Coverage is troops per capita.
		troops := t.Garrison + t.Militia*0.5
		coverage := 0.0
		if t.Population > 0 {
			coverage = troops / t.Population
		}
		// Target crime: high prosperity + low coverage = high crime.
		target := shared.Clamp01(t.Prosperity*0.8 - coverage*c.Crime.DeterrencePerCoverage)
		// Crime moves toward target slowly.
		delta := (target - t.Crime) * c.Crime.AdjustmentRate
		if delta != 0 {
			read := shared.ReadString(
				shared.Pair("prosperity", t.Prosperity),
				shared.Pair("coverage", coverage),
				shared.Pair("crime", t.Crime),
			)
			causes := v.Log.RecentFor(model.KindTown, id,
				[]string{"prosperity", "garrison"}, 3)
			w.Add(model.KindTown, id, "crime", delta, read, causes, "")
		}
		// Crime erodes prosperity and feeds unrest.
		if t.Crime > 0 {
			read := shared.ReadString(shared.Pair("crime", t.Crime))
			causes := v.Log.RecentFor(model.KindTown, id, []string{"crime"}, 2)
			w.Add(model.KindTown, id, "prosperity",
				-t.Crime*c.Crime.ProsperityErosion, read, causes,
				"crime erodes prosperity")
			w.Add(model.KindTown, id, "unrest",
				t.Crime*c.Crime.UnrestPerCrime, read, causes,
				"crime breeds unrest")
		}
	}
}
