// Package demography aggregates the per-tick death and birth accumulators that
// other systems leave in shared state, and maintains the memory of recent
// deaths that the unrest system reads.
//
// It exists because several systems can kill people on the same day. The
// starvation system adds to deaths_today, the disease system adds to it, and
// neither knows or needs to know about the other. Demography is the only
// writer of population changes, recent_deaths, and death_memory, which is what
// keeps CONSTITUTION.md section 2.1 intact while still allowing two independent
// causes of death in one tick.
package demography

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the demography system.
func System() sim.System {
	return sim.System{
		Name: "demography",
		Doc:  "aggregates deaths and births from every cause, and keeps the memory of recent deaths",
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

		deaths := t.DeathsToday

		// Births. A town with people of childbearing age and food to spare
		// grows; a starving or diseased town shrinks. This is the only source
		// of population growth, so a neglected region genuinely empties.
		// Fertility is driven by health and food buffer, both of which are
		// shared state this system reads without asking anyone.
		healthTerm := (1 - shared.Clamp01(t.Infected)) * (1 - 0.8*shared.Clamp01(t.StarveSeverity))
		foodTerm := shared.Clamp01(t.FoodDays / c.World.FullFoodDays)
		if t.FoodStock > 0 && t.FoodDays <= 0 {
			// A town living hand to mouth still has children, just fewer.
			foodTerm = c.World.StarvingBirthFloor
		}
		birthRate := c.World.BirthRate * healthTerm * foodTerm
		births := t.Population * birthRate
		// Migration's arrivals and departures are staged by the migration
		// system into net_migration, so the two systems stay decoupled while
		// still summing into one population.
		netMove := t.NetMigration

		popDelta := births - deaths + netMove
		read := shared.ReadString(
			shared.PairF("deaths_today", deaths),
			shared.PairF("births", births),
			shared.PairF("net_migration", netMove),
			shared.Pair("infected", t.Infected),
			shared.Pair("food_days", t.FoodDays),
		)
		causes := append(
			v.Log.RecentFor(model.KindTown, id, []string{"population", "infected", "food_days", "unrest"}, 4),
			v.Log.RecentFor(model.KindTown, id, []string{"deaths_today"}, 3)...,
		)

		w.Add(model.KindTown, id, "population", popDelta, read, causes, "natural change and migration")
		w.Set(model.KindTown, id, "recent_deaths", deaths, read, causes, "deaths today from all causes")
		// The accumulator is cleared for tomorrow. An absolute write here is
		// safe because demography is the only system that writes it, which the
		// engine enforces rather than assumes.
		w.Set(model.KindTown, id, "deaths_today", 0, read, causes, "")

		// Death memory: a town remembers its dead for a while and stays angry,
		// which is CAUSE_EFFECT.md section 3's "deaths recently".
		memory := t.DeathMemory
		if deaths > 0 {
			memory = c.Unrest.DeathMemoryDays
		} else if memory > 0 {
			memory--
		}
		w.Set(model.KindTown, id, "death_memory", memory, read, causes, "")
	}
}
