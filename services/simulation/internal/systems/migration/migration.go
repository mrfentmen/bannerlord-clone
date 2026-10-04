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
	// requested is how many people each town was sent before the arrival caps
	// were applied, which is the denominator for the fraction it accepted.
	requested map[int]float64
	// shares is each source's share of its departures sent to each destination.
	// Pass three needs it to work out how much of a source's people a
	// destination's cap turned away.
	shares map[int]map[int]float64
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
		//
		// This is an absolute write, and that is load-bearing. net_migration is
		// a flow for one tick, not a running balance, so it has to be replaced
		// every day rather than added to. Adding to it made the field a
		// cumulative total that demography then re-applied to population every
		// day: a town that lost 320 people on one day lost 640 the next, 960
		// the next, and reached zero population inside a fortnight, while its
		// neighbours grew by the same accelerating amounts. A set here is safe
		// because migration is the only writer of the field, and writing it for
		// every town every tick also clears it for towns that did not move
		// anyone, so no stale balance survives anywhere.
		w.Set(model.KindTown, id, "net_migration", in-out, read, causes, "people arriving and leaving")

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
		leaving:   map[int]float64{},
		arriving:  map[int]float64{},
		requested: map[int]float64{},
		shares:    map[int]map[int]float64{},
		infected:  map[int]float64{},
		attract:   map[int]float64{},
	}
	ids := v.State.TownIDs()

	// --- pass one: who leaves, and how desperate they are ---
	for _, id := range ids {
		t := v.State.Towns[id]
		// Attractiveness is computed for every town, not only those people are
		// leaving, because it is also the pull used to divide arrivals.
		f.attract[id] = attractiveness(v, id)

		// The floor is a share of the population the settlement was founded
		// with, so it is the same proportion of a hamlet and of a city and
		// does not itself shrink as people leave. A town whose founding scale
		// is unknown has no opinion here and is left to the rate alone.
		surplus := t.Population - floorOf(v, t)
		if surplus <= 0 {
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
		f.shares[id] = map[int]float64{}
		// Flight is drawn from the surplus above the floor, not from the
		// population. This is the diminishing return the model was missing: the
		// people who walk away are the ones with the means to walk away, and
		// each departure leaves behind a town with proportionally fewer of
		// them, so the daily outflow falls as the town empties instead of
		// staying at a fixed share forever.
		//
		// The outflow per day therefore stays at or below MaxFleeShare of the
		// people still there, which keeps that constant's documented meaning, and
		// it reaches zero at the floor. A town at maximum unrest now decays
		// towards its floor along an exponential with a 1/MaxFleeShare day time
		// constant and never crosses it, rather than decaying to nothing.
		leaving := surplus * c.Migrate.MaxFleeShare * shared.Clamp01(pressure)
		if leaving < 1 && surplus >= c.Starve.TinyTownPopulation {
			// Below one departure a day the integer population field would round
			// to nobody and a slow exodus would look like no exodus at all.
			// Rounding up to one keeps it visible. It can never breach the
			// floor, because the clamp below holds leaving to the surplus.
			leaving = 1
		}
		if leaving > surplus {
			leaving = surplus
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
			//
			// The departure has to be withdrawn here, not merely skipped. Pass
			// one decided how many would leave before any destination was known,
			// and the commit step subtracts the departure from the source. Leaving
			// it standing while declining to distribute it destroyed that many
			// people outright, which in a region where every town is unpleasant
			// — the case flight is built for — emptied every town in it.
			delete(f.leaving, src)
			continue
		}
		for _, dst := range ids {
			w8 := weights[dst]
			if w8 <= 0 {
				continue
			}
			share := shared.SafeDiv(w8, totalWeight)
			incoming := leaving * share
			f.arriving[dst] += incoming
			f.requested[dst] += incoming
			f.shares[src][dst] = share
		}
	}

	// Arrival caps, applied after every source has contributed so no single
	// source is favoured by being processed first. Without this, a plague
	// cascading across a region would move millions of people in one tick and
	// the population totals would stop meaning anything.
	for _, dst := range ids {
		t := v.State.Towns[dst]
		if t.Population <= 0 {
			// A town with nobody in it absorbs nobody. Its arrivals are dropped
			// rather than taken in, which is the turn-away below.
			f.arriving[dst] = 0
			continue
		}
		cap := t.Population * c.Migrate.ImmigrantsPerDayCap
		if f.arriving[dst] > cap {
			// Scaling down preserves the relative mix of sources, so the
			// infection carried in stays representative.
			f.arriving[dst] = cap
		}
	}

	// --- pass three: hand back the people nobody would take ---
	// A town that has no room turns refugees away at the gate, and the turned
	// away never left. The cap above decides how many a destination takes, but
	// the departure has already been recorded against the source, so the
	// rejected share has to be returned to it or the region's people are
	// destroyed by the cap. This is the difference between a town being full
	// and a town being emptied: full stops the flow, it does not delete it.
	//
	// Arrivals are trimmed in proportion across every source that sent to that
	// destination, so the relative mix of who was willing to move where is
	// preserved and no source is favoured by being counted first.
	for _, src := range ids {
		leaving, ok := f.leaving[src]
		if !ok || leaving <= 0 {
			continue
		}
		stayed := 0.0
		for dst, share := range f.shares[src] {
			accepted := 1.0
			if f.requested[dst] > 0 {
				accepted = shared.Clamp01(shared.SafeDiv(f.arriving[dst], f.requested[dst]))
			}
			stayed += leaving * share * (1 - accepted)
		}
		leaving -= stayed
		if leaving <= 0 {
			// Everybody this town offered to send was turned away somewhere, so
			// in the end nobody left it.
			delete(f.leaving, src)
			continue
		}
		f.leaving[src] = leaving
	}
	return f
}

// floorOf is the population below which a settlement stops being a settlement.
//
// It is a share of the population the settlement was founded with rather than a
// head count, because the world's settlements span three orders of magnitude
// and a fixed head count would either stop a hamlet from ever losing anybody or
// be a rounding error for a city. The founding population does not shrink as
// people leave, which is the point: a town's walls, fields and warehouses are
// still standing after most of its residents have gone, so the floor has to be
// anchored to something that has not shrunk.
//
// A settlement whose founding population was never recorded has no scale, so it
// has no floor: it is governed by the outflow rate alone, which is the old
// behaviour and is preferable to inventing a scale for it here.
func floorOf(v *sim.View, t *model.Town) float64 {
	if t.FoundedPopulation <= 0 {
		return 0
	}
	return t.FoundedPopulation * v.Cfg.Migrate.MinSettlementShare
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
