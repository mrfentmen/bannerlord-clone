// Package migration moves people, and the infection they carry, between towns.
//
// Reads unrest, food buffer, infection, and the attractiveness of other towns,
// and writes net_migration, crowding, and the infection arriving with the
// refugees. It is chain 2's trigger: people flee a collapsing town, arrive
// somewhere crowded, crowd the destination, and the crowding is what lets the
// outbreak spread. Nobody decides that outcome; it falls out of two towns'
// numbers.
//
// The system runs in three explicit passes over the towns: decide who leaves,
// decide where they go, then commit. Splitting it is what keeps the result
// independent of the order towns happen to be visited in, which a single fused
// pass would not be: if A is processed before B, A's departures would be
// available to B but B's would not yet exist to A. The passes make the movement
// symmetric, so no town gets a systematic advantage from its id.
package migration

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the migration system.
func System() sim.System {
	return sim.System{
		Name: "migration",
		Doc:  "moves people out of suffering towns and into attractive ones, carrying infection with them",
		Runs: run,
	}
}

// flows is the movement decided for one tick.
type flows struct {
	// leaving is how many people depart each town.
	leaving map[int]float64
	// arriving is how many people reach each town.
	arriving map[int]float64
	// infected is the share of infection the departing people carry, which the
	// destination adds to its own.
	infected map[int]float64
	// attract is each town's computed pull, cached because the pair-weight
	// loop needs it for every source.
	attract map[int]float64
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	f := decide(v)

	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		out := f.leaving[id]
		in := f.arriving[id]

		read := shared.ReadString(
			shared.PairF("departures", out),
			shared.PairF("arrivals", in),
			shared.Pair("unrest", t.Unrest),
			shared.Pair("food_days", t.FoodDays),
			shared.Pair("infected", t.Infected),
			shared.Pair("crowding", t.Crowding),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"unrest", "food_stock", "food_days", "infected", "crowding", "population"}, 5)

		// The pull this town exerts, published for the report and so a
		// why-query on a town that just absorbed refugees can name it.
		w.Set(model.KindTown, id, "attractiveness", f.attract[id], read, causes, "how strongly this town pulls people")

		// Crowding rises with arrivals, because they are the people with no
		// housing. The disease system relaxes it again once arrivals stop,
		// which is what lets an outbreak burn out on its own.
		if in > 0 {
			w.Add(model.KindTown, id, "crowding", c.Migrate.CrowdingPerArrival*in, read, causes, "arrivals with nowhere to live")
		}
		if out > 0 {
			// People leaving relieve the pressure a little.
			w.Add(model.KindTown, id, "crowding", -c.Migrate.CrowdingPerArrival*out*0.5, read, causes, "people leaving")
		}

		// Movement is published to demography, which owns population. The
		// migration system never writes population itself.
		if in != out {
			w.Add(model.KindTown, id, "net_migration", in-out, read, causes, "people arriving and leaving")
		}

		// The infection the arrivals bring. This is the mechanism by which a
		// plague reaches a town that had none, and it is chain 2's second link.
		carried := f.infected[id]
		if carried > 0 && in > 0 {
			// Scaled by the arrival's share of the destination's population, so
			// a small influx into a large town moves the infection rate less
			// than a mass arrival into a village. That is the crowding
			// relationship the disease system then amplifies.
			share := shared.Clamp01(in / shared.SafeDiv(t.Population+in, 1))
			w.Add(model.KindTown, id, "infected", carried*share, read, causes, "infection carried by arrivals")
		}

		// New arrivals bring new hands with them, which is a real and immediate
		// effect: a town absorbing refugees gains a little labour even as its
		// crowding worsens. This is why chain 5's recovery is possible at all.
		if in > 0 {
			w.Add(model.KindTown, id, "workers", in*c.Migrate.WorkerGainPerImmigrant, read, causes, "new arrivals")
		}
	}
}

// decide computes the whole tick's movement before anything is written.
func decide(v *sim.View) *flows {
	c := v.Cfg
	f := &flows{
		leaving:  map[int]float64{},
		arriving: map[int]float64{},
		infected: map[int]float64{},
		attract:  map[int]float64{},
	}
	ids := v.State.TownIDs()

	// --- pass one: who leaves, and how desperate they are ---
	for _, id := range ids {
		t := v.State.Towns[id]
		// Attractiveness is computed for every town, not only those people are
		// leaving, because it is also the pull used to divide arrivals.
		f.attract[id] = attractiveness(v, id)

		if t.Population <= 1 {
			continue
		}
		// People leave for three reasons, each read from shared state, and they
		// compound: a town that is angry, hungry, and diseased empties faster
		// than one with any single problem.
		pressure := 0.0
		if t.Unrest > c.Migrate.FleeThreshold {
			pressure += shared.Clamp01((t.Unrest - c.Migrate.FleeThreshold) / (1 - c.Migrate.FleeThreshold))
		}
		if t.FoodDays < c.Migrate.FleeStarvationDays {
			pressure += shared.Clamp01((c.Migrate.FleeStarvationDays - t.FoodDays) / c.Migrate.FleeStarvationDays)
		}
		if t.Infected > c.Migrate.FleeInfected {
			pressure += shared.Clamp01((t.Infected - c.Migrate.FleeInfected) / c.Migrate.FleeInfected)
		}
		if pressure <= 0 {
			continue
		}
		// The cap is what makes a town empty over weeks instead of instantly. A
		// town that empties in a day would produce a famine nobody could watch
		// happen, and TESTING_AND_BALANCE.md section 4 wants weeks.
		leaving := t.Population * c.Migrate.MaxFleeShare * shared.Clamp01(pressure)
		if leaving < 1 && t.Population >= 1000 {
			leaving = 1
		}
		if leaving > t.Population-1 {
			leaving = t.Population - 1
		}
		if leaving <= 0 {
			continue
		}
		f.leaving[id] = leaving
		// Refugees bring their illness with them.
		f.infected[id] = t.Infected * c.Migrate.InfectionCarried
	}

	// --- pass two: where they go ---
	// For each source, the share of its departures that choose a given
	// destination is that pair's weight over the sum of all its options. The
	// sum makes the shares add to one, so every departing person arrives
	// somewhere; nothing is created or lost in transit.
	for _, src := range ids {
		leaving, ok := f.leaving[src]
		if !ok || leaving <= 0 {
			continue
		}
		totalWeight := 0.0
		weights := make(map[int]float64, len(ids))
		for _, dst := range ids {
			if dst == src {
				continue
			}
			w8 := pairWeight(v, src, dst, f)
			weights[dst] = w8
			totalWeight += w8
		}
		if totalWeight <= 0 {
			// Nowhere reachable is attractive, so nobody moves. The people stay
			// and suffer, which is the honest outcome: a region with no good
			// neighbour nearby has nowhere to flee to.
			continue
		}
		for _, dst := range ids {
			w8 := weights[dst]
			if w8 <= 0 {
				continue
			}
			incoming := leaving * shared.SafeDiv(w8, totalWeight)
			f.arriving[dst] += incoming
		}
	}

	// Arrival caps, applied after every source has contributed so no single
	// source is favoured by being processed first. Without this, a plague
	// cascading across a region would move millions of people in one tick and
	// the population totals would stop meaning anything.
	for _, dst := range ids {
		t := v.State.Towns[dst]
		if t.Population <= 0 {
			continue
		}
		cap := t.Population * c.Migrate.ImmigrantsPerDayCap
		if f.arriving[dst] > cap {
			// Scaling down preserves the relative mix of sources, so the
			// infection carried in stays representative.
			f.arriving[dst] = cap
		}
	}
	return f
}

// attractiveness scores how much a town pulls people, relative to a neutral
// zero. Every term is read from shared state.
func attractiveness(v *sim.View, id int) float64 {
	c := v.Cfg
	t := v.State.Towns[id]
	if t.Population <= 0 {
		return 0
	}
	attract := 0.0
	// Calm, fed, healthy, and rich attracts.
	attract += (1 - shared.Clamp01(t.Unrest)) * c.Migrate.AttractionShare * 2
	attract += shared.Clamp01(t.FoodDays/c.World.FullFoodDays) * c.Migrate.AttractionShare * 2
	attract -= shared.Clamp01(t.Infected*c.Migrate.InfectionRepulsion) * c.Migrate.AttractionShare
	attract += (shared.Clamp01(t.Prosperity) - 0.5) * c.Migrate.AttractionShare
	// A town already packed past its capacity is not attractive. This is the
	// natural brake on a cascading plague: a town empties into its
	// neighbours, and if the neighbours are also full the movement stalls
	// rather than compounding without bound.
	room := 1 - shared.Clamp01((t.Crowding-c.Migrate.FleeToCapacityShare)/c.Migrate.FleeToCapacityShare)
	attract *= shared.Clamp(room, 0, 1)
	return attract
}

// pairWeight scores the flow from one town to another.
func pairWeight(v *sim.View, src, dst int, f *flows) float64 {
	c := v.Cfg
	d := v.State.DistanceBetweenTowns(src, dst)
	if d > c.Migrate.MaxMoveLeagues {
		return 0
	}
	// People go somewhere reachable, not to the best place on the map.
	weight := f.attract[dst] * shared.Clamp01(1-d/c.Migrate.MaxMoveLeagues)
	if weight < 0 {
		weight = 0
	}
	// A desperate source sends people regardless of how good the destination
	// is, because the alternative is worse. This is what makes flight during a
	// famine spread the disease it was fleeing from.
	s := v.State.Towns[src]
	desperation := 0.0
	if s.FoodDays < c.Migrate.FleeStarvationDays {
		desperation = c.Migrate.DesperationWeight * shared.Clamp01(
			(c.Migrate.FleeStarvationDays-s.FoodDays)/c.Migrate.FleeStarvationDays)
	}
	if s.Infected > c.Migrate.FleeInfected {
		desperation += c.Migrate.DesperationWeight * shared.Clamp01(
			(s.Infected-c.Migrate.FleeInfected)/c.Migrate.FleeInfected)
	}
	return weight + desperation
}
