// Package gang handles street gang territory and rackets.
//
// Gangs control city blocks. They extort businesses, run rackets,
// and fight rival gangs for territory. Players can join, fight,
// or take over gangs.
package gang

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// System returns the gang system.
func System() sim.System {
	return sim.System{
		Name: "gang",
		Doc:  "gang territory, rackets, and turf wars",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	// Gangs generate income from their territory.
	// Turf wars happen when rival gangs border each other.
	// For now, this is a placeholder that marks the system as active.
	// Full implementation needs gang entities in the model.
	_ = v
	_ = w
}

// Racket is a criminal enterprise.
type Racket string

const (
	RacketExtortion Racket = "extortion"
	RacketDrugs     Racket = "drugs"
	RacketGambling  Racket = "gambling"
	RacketChopShop  Racket = "chop_shop"
)

// Gang represents a street gang.
type Gang struct {
	ID         int
	Name       string
	TurfBlocks int     // Number of city blocks controlled
	Members    float64 // Gang members
	Income     float64 // Daily income from rackets
	Heat       float64 // Police attention (0-100)
}

// DailyIncome calculates a gang's income from rackets.
func (g *Gang) DailyIncome() float64 {
	base := float64(g.TurfBlocks) * 100
	return base * (1 + g.Members/100)
}

// AddHeat increases police attention.
func AddHeat(w *sim.WriteSet, gangID int, amount float64) {
	// TODO: wire to actual gang storage when model supports it.
	_ = w
	_ = gangID
	_ = amount
	_ = model.KindTown // placeholder to keep import
}
