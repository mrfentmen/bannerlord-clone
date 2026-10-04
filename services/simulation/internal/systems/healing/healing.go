// Package healing handles wounded troop recovery.
//
// Wounded troops heal over time and return to duty. The heal rate depends
// on medicine availability and whether a surgeon companion is present.
package healing

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the healing system.
func System() sim.System {
	return sim.System{
		Name: "healing",
		Doc:  "wounded troops recover over time; medicine and surgeons speed healing",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Wounded <= 0 {
			continue
		}

		// Base heal rate: 10% of wounded per day.
		healRate := 0.1

		// Surgeon companion speeds healing: +5% per skill point.
		if skill, ok := p.Companions["surgeon"]; ok && skill > 0 {
			healRate *= 1.0 + float64(skill)*0.05
		}

		// Medicine speeds healing.
		if p.Medicine > 0 {
			healRate *= 1.5
			// Consume medicine.
			used := p.Wounded * 0.01
			if used > p.Medicine {
				used = p.Medicine
			}
			w.Add(model.KindParty, pid, "medicine", -used,
				"treating wounded", nil, "healing")
		}

		// TODO: surgeon companion bonus.

		healed := p.Wounded * healRate
		if healed > p.Wounded {
			healed = p.Wounded
		}
		// Some wounded die instead of healing (5% of healing amount).
		died := healed * 0.05
		actuallyHealed := healed - died

		w.Add(model.KindParty, pid, "wounded", -healed,
			shared.PairF("healed", actuallyHealed),
			nil, "wounded recovering")
		w.Add(model.KindParty, pid, "troops", actuallyHealed,
			"wounded returned to duty", nil, "healing")
		if died > 0 {
			// The died are already removed from wounded; they're just gone.
			_ = c // config could tune death rate
		}
	}
}
