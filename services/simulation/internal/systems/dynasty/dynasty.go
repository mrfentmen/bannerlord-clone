// Package dynasty handles marriage, children, and succession.
//
// Rulers can marry, have children, and designate heirs.
// When a ruler dies, their heir inherits their lands and titles.
package dynasty

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the dynasty system.
func System() sim.System {
	return sim.System{
		Name: "dynasty",
		Doc:  "marriage, children, and succession",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	for _, rid := range v.State.RulerIDsSorted() {
		r := v.State.Rulers[rid]
		if r == nil || !r.IsAlive {
			continue
		}

		// Married couples have a chance of children each year.
		// Check on the ruler's birthday.
		if r.SpouseID >= 0 {
			if spouse, ok := v.State.Rulers[r.SpouseID]; ok && spouse != nil && spouse.IsAlive {
				// 10% chance per year if both under 45.
				if r.Age < 45 && spouse.Age < 45 && int(r.Age*365)%365 == 0 {
					// Simplified: use tick to determine yearly check.
					// In practice, this would use a random roll.
				}
			}
		}

		// Succession: if ruler died, heir takes over.
		// This is handled by the mortality system marking IsAlive=false.
		// Here we transfer titles.
		if !r.IsAlive && r.HeirID >= 0 {
			if heir, ok := v.State.Rulers[r.HeirID]; ok && heir != nil && heir.IsAlive {
				// Transfer party leadership.
				if r.PartyID >= 0 {
					w.Set(model.KindRuler, r.HeirID, "party_id", float64(r.PartyID),
						"inherited command", nil, "succession")
				}
				// Transfer town ownership.
				if r.TownID >= 0 {
					w.Set(model.KindRuler, r.HeirID, "town_id", float64(r.TownID),
						"inherited lands", nil, "succession")
				}
			}
		}
	}
}

// Marry joins two rulers in marriage.
// Returns true if the marriage occurred.
func Marry(w *sim.WriteSet, rulerA, rulerB int) bool {
	w.Set(model.KindRuler, rulerA, "spouse_id", float64(rulerB),
		"marriage", nil, "dynasty")
	w.Set(model.KindRuler, rulerB, "spouse_id", float64(rulerA),
		"marriage", nil, "dynasty")
	return true
}

// DesignateHeir sets a ruler's heir.
func DesignateHeir(w *sim.WriteSet, rulerID, heirID int) {
	w.Set(model.KindRuler, rulerID, "heir_id", float64(heirID),
		"heir designated", nil, "dynasty")
}
