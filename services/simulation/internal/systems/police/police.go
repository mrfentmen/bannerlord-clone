// Package police handles law enforcement and wanted levels.
//
// Criminal actions raise heat. High heat brings police response.
// Police can arrest, and jails hold captives until bail or breakout.
package police

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// WantedLevel thresholds.
const (
	WantedNone    = 0
	WantedLow     = 25  // Local cops notice
	WantedMedium  = 50  // Patrols actively hunt
	WantedHigh    = 75  // SWAT response
	WantedExtreme = 100 // Military intervention
)

// System returns the police system.
func System() sim.System {
	return sim.System{
		Name: "police",
		Doc:  "wanted levels decay; police hunt high-heat parties",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil {
			continue
		}
		// Heat decays over time when laying low.
		// TODO: track heat per party when model supports it.
		_ = p
	}
}

// CrimeHeat returns heat gained for a crime type.
func CrimeHeat(crime string) float64 {
	switch crime {
	case "murder":
		return 20
	case "robbery":
		return 10
	case "smuggling":
		return 5
	case "vandalism":
		return 2
	default:
		return 1
	}
}

// PoliceResponse returns the response level for a heat value.
func PoliceResponse(heat float64) string {
	switch {
	case heat >= WantedExtreme:
		return "military"
	case heat >= WantedHigh:
		return "swat"
	case heat >= WantedMedium:
		return "patrol"
	case heat >= WantedLow:
		return "local"
	default:
		return "none"
	}
}

// BailCost calculates bail for a heat level.
func BailCost(heat float64) float64 {
	return heat * 100
}

var _ = model.KindParty // keep import
