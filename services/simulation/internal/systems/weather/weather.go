// Package weather handles environmental effects.
//
// Weather affects battles and travel:
//   - Rain: -10% ranged effectiveness, -5% speed
//   - Snow: -20% speed, -10% effectiveness
//   - Fog: -30% ranged effectiveness, ambush bonus
//   - Clear: no modifiers
package weather

// Condition is the weather type.
type Condition string

const (
	Clear Condition = "clear"
	Rain  Condition = "rain"
	Snow  Condition = "snow"
	Fog   Condition = "fog"
	Storm Condition = "storm"
)

// RangedModifier returns effectiveness multiplier for ranged units.
func RangedModifier(c Condition) float64 {
	switch c {
	case Rain:
		return 0.9
	case Snow:
		return 0.85
	case Fog:
		return 0.7
	case Storm:
		return 0.6
	default:
		return 1.0
	}
}

// SpeedModifier returns march speed multiplier.
func SpeedModifier(c Condition) float64 {
	switch c {
	case Rain:
		return 0.95
	case Snow:
		return 0.8
	case Storm:
		return 0.7
	default:
		return 1.0
	}
}

// MeleeModifier returns melee effectiveness multiplier.
func MeleeModifier(c Condition) float64 {
	switch c {
	case Snow:
		return 0.9
	case Storm:
		return 0.85
	default:
		return 1.0
	}
}
