// Package tournament handles arena fights.
//
// Tournaments are held in towns. Winners gain gold, renown, and
// sometimes prizes. It's a way to make money and build reputation
// without starting a war.
package tournament

// Tournament is an arena event.
type Tournament struct {
	ID        int
	TownID    int
	Day       int
	PrizeGold float64
	PrizeItem string
	Entrants  int
}

// EntryFee returns the cost to enter.
func EntryFee() float64 {
	return 100
}

// Winnings calculates prize for a placement (1st, 2nd, 3rd).
func Winnings(t *Tournament, place int) float64 {
	switch place {
	case 1:
		return t.PrizeGold
	case 2:
		return t.PrizeGold * 0.3
	case 3:
		return t.PrizeGold * 0.1
	default:
		return 0
	}
}

// RenownGain returns renown for tournament performance.
func RenownGain(place, entrants int) float64 {
	if place == 1 {
		return 5 + float64(entrants)/10
	}
	if place <= 3 {
		return 2
	}
	return 0.5 // Participation
}
