// Package unrest turns material conditions into anger.
//
// Reads the pressure accumulator that other systems stage their anger into,
// plus the specific conditions CAUSE_EFFECT.md section 3 names, and writes
// unrest. It is the only writer of unrest, which means a tax rise, a famine, an
// outbreak, and a cruel garrison all add to one number without any of them
// knowing about the others. That is the whole point: the anger that unseats a
// ruler is a sum nobody designed.
package unrest

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the unrest system.
func System() sim.System {
	return sim.System{
		Name: "unrest",
		Doc:  "sums every source of anger in a town into one unrest figure",
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

		// Pressure is the running total other systems stage. Reset it every
		// tick, so it is this tick's anger, not a permanent debt.
		pressure := t.Pressure
		w.Set(model.KindTown, id, "pressure", 0, "reset each tick", nil, "")

		// A thin larder angers people on its own, in addition to whatever the
		// starvation system already staged. Both paths exist because food
		// shortage should show up in unrest before it starts killing: CAUSE_EFFECT
		// section 3 lists food shortage and prices as separate inputs.
		shortage := 0.0
		if t.FoodDays < c.Unrest.FoodDaysCritical {
			shortage = c.Unrest.FoodShortageWeight * (1 - shared.Clamp01(t.FoodDays/c.Unrest.FoodDaysCritical))
		}

		// Price anger. The food price relative to base is what a household
		// feels; wages lagging behind it is the wage spiral of chain 1.
		// Food above the reference price angers, food below it soothes. A
		// discount does not erase other grievances, so this is a signed
		// contribution rather than a floor at zero.
		priceAnger := 0.0
		if t.PriceFood > 0 {
			priceAnger = c.Market.PriceUnrestWeight * (t.PriceFood - 1)
		}

		// Tax anger, weighted by how far the rate sits above what the town
		// considers bearable. This is chain 1's second link: raise taxes and
		// merchants and households both object.
		taxGap := shared.Clamp01(t.TaxRate - c.Unrest.TaxComfortRate)
		taxAnger := c.Unrest.TaxWeight * taxGap

		// An abusive garrison angers the people it is meant to protect. Low
		// conduct means abuse; the weight rises sharply below the harsh line.
		conductAnger := 0.0
		if t.GarrisonConduct < c.Unrest.ConductHarsh {
			conductAnger = c.Unrest.GarrisonConductWeight * (1 - shared.Clamp01(t.GarrisonConduct/c.Unrest.ConductHarsh))
		}

		// Recent deaths keep provoking anger for as long as the town remembers
		// them. death_memory is maintained by demography, so this system never
		// has to know which cause of death it is reacting to.
		deathAnger := c.Unrest.DeathWeight * shared.Clamp01(t.DeathMemory/c.Unrest.DeathMemoryDays)

		// A town with no garrison at all is not safer: with nobody to keep
		// order, crime rises and residents feel abandoned. This is why pulling
		// the garrison to fight elsewhere angers a town as well as making it
		// unsafe, which is chain 3's political cost.
		abandoned := 0.0
		if t.Garrison <= 0 && t.Population > 1000 {
			abandoned = 0.05
		}

		total := pressure + shortage + priceAnger + taxAnger + conductAnger + deathAnger + abandoned

		// Anger settles when nothing is wrong. Decay applies to the standing
		// level, not to the new pressure, so a fresh grievance is felt
		// immediately and then fades if nothing keeps feeding it.
		newUnrest := t.Unrest - c.Unrest.Decay*t.Unrest
		newUnrest += total
		newUnrest = shared.Clamp(newUnrest, 0, c.Unrest.UnrestCap)

		// A propagandist damps anger. FACTIONS.md gives one side the best
		// intelligence in the game, and influence is how that shows up in the
		// simulation: a ruler with real political capital can talk a crowd
		// down. It is a real counterweight, not a free pass, because influence
		// has to be earned first.
		holder := v.State.Rulers[t.Holder]
		damping := 0.0
		if holder != nil {
			damping = c.Unrest.PropagandistWeight * shared.Clamp01(holder.Influence/c.Unrest.PropagandistInfluence)
			if holder.Traits.Mercy > 0.5 {
				// A merciful holder is personally trusted, which is separate
				// from having political weight.
				damping += (holder.Traits.Mercy - 0.5) * 0.08
			}
		}
		if damping > 0 {
			newUnrest -= damping * newUnrest
		}
		newUnrest = shared.Clamp(newUnrest, 0, c.Unrest.UnrestCap)

		read := shared.ReadString(
			shared.Pair("pressure", pressure),
			shared.Pair("food_days", t.FoodDays),
			shared.Pair("price_food", t.PriceFood),
			shared.Pair("tax_rate", t.TaxRate),
			shared.Pair("garrison_conduct", t.GarrisonConduct),
			shared.PairF("death_memory_days", t.DeathMemory),
			shared.PairF("garrison", t.Garrison),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"food_stock", "price_food", "tax_rate", "garrison_conduct", "recent_deaths", "crowding", "infected"}, 6)

		w.Set(model.KindTown, id, "unrest", newUnrest, read, causes, "")
	}
}
