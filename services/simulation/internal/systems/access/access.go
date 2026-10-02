// Package access is the treaty and town-entry model: who may enter whose
// towns and do business there.
//
// Before this package, access was ad-hoc: recruitment blocked entry when at
// war or relations fell below -0.5, trade checked nothing, and barter checked
// nothing. A ruler at war with a town's side could march a trade caravan
// straight through its gates. This package is the single place that answers
// "can this party enter this town", and every town interaction consults it.
//
// The rule is Bannerlord's: you may enter any town not at war with you.
// Below that, a side whose relations with the town's side are deeply negative
// denies entry even without formal war — the treaty-like denial the old
// recruitment check described. The threshold is a named constant so the
// treaty rule stays visible in the one place that defines it.
package access

import (
	"mbclone/simulation/internal/model"
)

// Status is whether a party may enter a town.
type Status int

const (
	// Denied means the gates are closed: at war, or relations too poor.
	Denied Status = iota
	// Allowed means the party may enter and do business.
	Allowed
)

// hostilityThreshold is the side relation below which entry is denied even
// without formal war. It preserves the old recruitment check's -0.5.
const hostilityThreshold = -0.5

// TownAccess reports whether a party of partySide may enter a town held by
// townSide, and why not when denied. Same side is always allowed; war always
// denies; deeply negative relations deny even without war.
func TownAccess(s *model.State, townSide, partySide int) (Status, string) {
	if townSide == partySide {
		return Allowed, "own territory"
	}
	if s.AtWar(townSide, partySide) {
		return Denied, "at war with the town's side"
	}
	if rel := s.SideRelation(townSide, partySide); rel < hostilityThreshold {
		return Denied, "relations too poor for entry"
	}
	return Allowed, ""
}
