// Package companion handles party roles filled by companions.
//
// A companion in a role gives the whole party a mechanical benefit:
//   - Quartermaster: -20% food consumption
//   - Scout: +30% march speed, sees further
//   - Surgeon: +50% wound healing, +10% wounded survival
//   - Engineer: +50% siege effectiveness
package companion

// Role is a party role a companion can fill.
type Role string

const (
	RoleQuartermaster Role = "quartermaster"
	RoleScout         Role = "scout"
	RoleSurgeon       Role = "surgeon"
	RoleEngineer      Role = "engineer"
)

// Companion is a named character serving in a party role.
type Companion struct {
	ID     string
	Name   string
	Role   Role
	Skill  int // 1-10, higher is better
	PartyID int
}

// FoodMultiplier returns the food consumption multiplier for a party.
// A quartermaster reduces consumption by 2% per skill point.
func FoodMultiplier(comps []Companion) float64 {
	for _, c := range comps {
		if c.Role == RoleQuartermaster {
			return 1.0 - float64(c.Skill)*0.02
		}
	}
	return 1.0
}

// SpeedMultiplier returns the march speed multiplier.
// A scout increases speed by 3% per skill point.
func SpeedMultiplier(comps []Companion) float64 {
	for _, c := range comps {
		if c.Role == RoleScout {
			return 1.0 + float64(c.Skill)*0.03
		}
	}
	return 1.0
}

// HealMultiplier returns the wound healing multiplier.
// A surgeon increases healing by 5% per skill point.
func HealMultiplier(comps []Companion) float64 {
	for _, c := range comps {
		if c.Role == RoleSurgeon {
			return 1.0 + float64(c.Skill)*0.05
		}
	}
	return 1.0
}

// SiegeMultiplier returns the siege effectiveness multiplier.
// An engineer increases it by 5% per skill point.
func SiegeMultiplier(comps []Companion) float64 {
	for _, c := range comps {
		if c.Role == RoleEngineer {
			return 1.0 + float64(c.Skill)*0.05
		}
	}
	return 1.0
}
