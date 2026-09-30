// Package starvation turns an empty larder into deaths, lost workers, and anger.
//
// Reads food_stock, food_days, and population, and writes population, recent
// deaths, unrest pressure, loyalty loss, and sanitation loss. It is the last
// link of chains 1, 2, and 3: whatever emptied the larder, this system turns
// into people dying.
package starvation

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the starvation system.
func System() sim.System {
	return sim.System{
		Name: "starvation",
		Doc:  "an empty larder becomes deaths, lost workers, dirtier streets, and anger",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t.Population <= 0 {
			continue
		}

		// A town is starving when the larder is empty and the days of buffer
		// have run out. The grace period is what makes neglect take weeks:
		// a town can run its buffer down over several days without anyone
		// dying, and that buffer is real time for the player to react.
		starving := false
		if t.FoodDays <= 0 && t.FoodStock <= c.Food.StockFloor+0.001 {
			starving = true
		}
		starveDays := t.StarveDays
		if starving {
			starveDays++
		} else {
			// Recovery requires the buffer to be rebuilt, not merely the larder
			// to be non-empty, so a town on one day of food does not flicker
			// in and out of famine. A flickering famine flag would make the
			// cause log unreadable and the death rate arbitrary.
			if t.FoodDays >= c.Starve.RecoveryFoodDays {
				starveDays = 0
			} else if starveDays > 0 {
				starveDays--
			}
		}

		// Severity ramps over days rather than switching on at full strength, so
		// a collapse is a slope and the cause log shows a progression.
		severity := shared.Clamp01(starveDays / c.Starve.SeverityAtDeath)
		if !starving {
			severity = 0
		}

		read := shared.ReadString(
			shared.PairF("food_stock", t.FoodStock),
			shared.Pair("food_days", t.FoodDays),
			shared.PairF("population", t.Population),
			shared.PairF("starve_days", starveDays),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"food_stock", "food_demand", "food_production", "food_imports", "is_starving"}, 5)

		w.Set(model.KindTown, id, "starve_days", starveDays, read, causes, "")
		w.Set(model.KindTown, id, "starve_severity", severity, read, causes, "")
		w.Set(model.KindTown, id, "is_starving", b2f(starving), read, causes, "")

		if !starving {
			continue
		}

		// Deaths. The rate scales with severity, so the first starving days
		// kill few and a prolonged famine kills many. Without medicine, which
		// is what makes a robbed medicine caravan lethal.
		deaths := t.Population * c.Starve.DeathRate * severity
		// Crowding makes starvation worse: more people per room, weaker
		// bodies, more people competing for what little food arrived.
		deaths *= 1 + c.Starve.CrowdingDeathWeight*shared.Clamp01(t.Crowding/c.Migrate.CrowdingCap)
		// Sanitation contributes weakly: a filthy town starves slightly
		// harder, because disease is killing the same people.
		deaths *= 1 + c.Starve.SanitationDeathWeight*(1-shared.Clamp01(t.Sanitation))
		if deaths > t.Population {
			deaths = t.Population
		}
		if deaths < 1 && t.Population > c.Starve.TinyTownPopulation {
			// Below one death a day the integer field would round to zero and
			// a slow famine would look like no famine at all. Rounding to one
			// death keeps the arithmetic honest at the cost of a very small
			// overcount in a very large town.
			deaths = 1
		}

		// Workers are lost as well as people: the weak cannot work even while
		// alive, which is how famine lowers production before it empties a town.
		workerLoss := t.Workers * c.Starve.WorkerLossRate * severity

		// Deaths are remembered for a while and keep provoking anger, per
		// CAUSE_EFFECT.md section 3: unrest reads "deaths recently".
		readDeath := read + ", " + shared.PairF("deaths_today", deaths)
		causesDeath := append(append([]int{}, causes...),
			v.Log.RecentFor(model.KindTown, id, []string{"food_stock"}, 2)...)

		w.Add(model.KindTown, id, "population", -deaths, readDeath, causesDeath, "starvation")
		w.Add(model.KindTown, id, "workers", -workerLoss, readDeath, causesDeath, "starvation")
		w.Add(model.KindTown, id, "deaths_today", deaths, readDeath, causesDeath, "starvation deaths today")
		w.Add(model.KindTown, id, "lost_deaths_total", deaths, readDeath, causesDeath, "")

		// Anger. This is the direct route from famine to the council vote of
		// chain 1: an empty larder makes people angry, and anger erodes
		// loyalty, and low loyalty plus anger is what a no-confidence vote
		// requires.
		w.Add(model.KindTown, id, "pressure", c.Starve.UnrestPerDay*severity, readDeath, causesDeath, "starvation")
		// Loyalty falls directly too, so a famine is not a two-step process.
		w.Add(model.KindTown, id, "loyalty", -c.Starve.LoyaltyLossPerDay*severity, readDeath, causesDeath, "starvation")

		// Weakened people keep a town dirtier, which feeds the disease system.
		// This is a real mechanism, not a hand-wave: malnutrition and poor
		// hygiene reinforce each other.
		w.Add(model.KindTown, id, "sanitation", -c.Starve.SanitationLossPerDay*severity, readDeath, causesDeath, "starvation")

		// A hungry garrison is a mutinous garrison.
		if t.Garrison > 0 {
			w.Add(model.KindTown, id, "garrison_morale", -c.Starve.MoraleHit*severity, readDeath, causesDeath, "hungry garrison")
		}
	}
}

func b2f(b bool) float64 {
	if b {
		return 1
	}
	return 0
}
