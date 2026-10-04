// Package espionage handles spies and sabotage.
//
// Players can plant spies in towns to gather intel, sabotage
// defenses, or assassinate targets. Counter-espionage catches spies.
package espionage

// SpyMission is a type of covert operation.
type SpyMission string

const (
	MissionGatherIntel SpyMission = "gather_intel"
	MissionSabotage    SpyMission = "sabotage"
	MissionAssassinate SpyMission = "assassinate"
	MissionStealPlans  SpyMission = "steal_plans"
)

// MissionCost returns the gold cost.
func MissionCost(m SpyMission) float64 {
	switch m {
	case MissionGatherIntel:
		return 500
	case MissionSabotage:
		return 1000
	case MissionAssassinate:
		return 5000
	case MissionStealPlans:
		return 2000
	default:
		return 500
	}
}

// SuccessChance returns probability of success (0-1).
// Higher roguery skill improves odds.
func SuccessChance(m SpyMission, roguerySkill int) float64 {
	base := 0.5
	switch m {
	case MissionGatherIntel:
		base = 0.7
	case MissionSabotage:
		base = 0.5
	case MissionAssassinate:
		base = 0.3
	case MissionStealPlans:
		base = 0.4
	}
	return base + float64(roguerySkill)*0.03
}

// DetectionChance returns probability the spy is caught.
func DetectionChance(m SpyMission, targetSecurity float64) float64 {
	base := 0.2
	if m == MissionAssassinate {
		base = 0.4
	}
	return base + targetSecurity*0.01
}
