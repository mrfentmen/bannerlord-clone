// Package xp handles troop experience and levels.
//
// Troops gain XP from combat. Higher levels fight better:
// each level adds +5% effectiveness in battle.
package xp

// XP thresholds for each level.
// Level 0: 0 XP (recruit)
// Level 1: 100 XP (regular)
// Level 2: 300 XP (veteran)
// Level 3: 600 XP (elite)
// Level 4: 1000 XP (legendary)
var thresholds = []float64{0, 100, 300, 600, 1000}

// MaxLevel is the highest achievable level.
const MaxLevel = 4

// LevelFor returns the level for given XP.
func LevelFor(xp float64) int {
	level := 0
	for i, th := range thresholds {
		if xp >= th {
			level = i
		}
	}
	if level > MaxLevel {
		return MaxLevel
	}
	return level
}

// Effectiveness returns the combat multiplier for a level.
// Each level is +5% effectiveness.
func Effectiveness(level int) float64 {
	if level < 0 {
		level = 0
	}
	if level > MaxLevel {
		level = MaxLevel
	}
	return 1.0 + float64(level)*0.05
}

// XPGain calculates XP from a battle.
// Winners gain more; casualties inflicted grant XP.
func XPGain(won bool, casualtiesInflicted, troops float64) float64 {
	if troops <= 0 {
		return 0
	}
	// Base XP per casualty inflicted, scaled by participation.
	base := casualtiesInflicted * 0.5
	if won {
		base *= 1.5 // winners learn more
	}
	// Diminishing returns for large armies (prevents XP farming).
	return base / (1 + troops/1000)
}
