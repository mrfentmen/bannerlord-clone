// Package witness handles witness protection.
//
// Builds on bounty (hunters), police (protection), informant (intel).
// Hide witnesses from bounty hunters, relocate them, keep them alive.
package witness

import (
	"mbclone/simulation/internal/systems/bounty"
	"mbclone/simulation/internal/systems/informant"
	"mbclone/simulation/internal/systems/police"
)

// Witness is someone in protective custody.
type Witness struct {
	ID         int
	Name       string
	Heat       float64 // How badly hunters want them
	Safehouse  int     // Town ID
	Protection float64 // Guard strength
}

// HuntRisk returns probability bounty hunters find them.
func HuntRisk(w *Witness, hunterSkill int) float64 {
	base := 0.3
	// Higher heat = more hunters looking.
	base += w.Heat / 200
	// Protection reduces risk.
	base -= w.Protection / 200
	if base < 0.05 {
		base = 0.05
	}
	return base
}

// ProtectionCost returns daily cost of keeping them safe.
func ProtectionCost(w *Witness) float64 {
	return w.Protection * 5
}

// BountyOnHead returns the reward for this witness.
// Uses bounty system to calculate.
func BountyOnHead(w *Witness) float64 {
	return bounty.RewardFor(w.Heat, false)
}

// CanTestify checks if they're safe enough to testify.
// Needs low hunt risk and police protection.
func CanTestify(w *Witness, policeHelp bool) bool {
	risk := HuntRisk(w, 5)
	if policeHelp {
		risk *= 0.5
	}
	return risk < 0.2
}

// InformantValue returns intel value if they're an informant too.
func InformantValue(w *Witness) float64 {
	// Witnesses with high heat know valuable things.
	return w.Heat / 10
}

var _ = informant.IntelTypes
var _ = police.WantedHigh
