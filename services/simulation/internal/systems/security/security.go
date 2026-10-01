// Package security keeps roads passable, and turns weak roads into raiders.
//
// Reads garrison strength, garrison conduct, and ruler movements, and writes
// road safety, raider pressure, and route safety. It is chain 3's mechanism: a
// holder pulls troops to fight elsewhere, the roads stop being patrolled, and
// caravans start getting robbed. It is also chain 4's tail: unpaid troops
// desert, some deserters become raiders, and raiders make the roads worse for
// everyone.
package security

import (
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the security system.
func System() sim.System {
	return sim.System{
		Name: "security",
		Doc:  "keeps roads passable from garrisons and patrols, and grows raiders where law is weak",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg

	// --- town road safety ---
	// A town is safe when it has enough troops to cover the roads around it.
	// Coverage is troops per league, so a big region needs more men than a
	// small one, which is honest about the cost of distance.
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		// The roads this town is responsible for: its own routes out.
		routeCount := 0.0
		roadLength := 0.0
		for _, rid := range v.State.RouteIDs() {
			r := v.State.Routes[rid]
			if r.TownA == id || r.TownB == id {
				routeCount++
				roadLength += r.Length
			}
		}
		if routeCount == 0 {
			// An isolated town is neither patrolled nor raided. Its safety
			// tracks its own garrison being adequate, which is a fair reading:
			// with nowhere to trade, the roads are not its problem.
			coverage := shared.Clamp01(t.Garrison / c.Security.MinGarrisonForIsolated)
			w.Set(model.KindTown, id, "patrol_coverage", coverage, "isolated town", nil, "")
			w.Set(model.KindTown, id, "road_safety", c.Security.BaseRoadSafety*shared.Clamp01(0.4+0.6*coverage), "isolated town", nil, "")
			continue
		}
		// Patrol strength available to the roads, after deducting the troops
		// currently away with a ruler on campaign. Those troops are still the
		// town's soldiers, but they are not on its roads, which is exactly the
		// cost of chain 3.
		away := 0.0
		for _, pid := range v.State.PartyIDs() {
			p := v.State.Parties[pid]
			if p.HomeTown != id {
				continue
			}
			if p.Activity == model.ActMarching || p.Activity == model.ActSieging || p.Activity == model.ActRaiding {
				away += p.Troops
			}
		}
		available := t.Garrison - away
		if available < 0 {
			available = 0
		}
		// Militia count: angry towns raise a local defence, which is a real
		// and often unwelcome substitute for a proper garrison.
		available += t.Militia
		needed := roadLength * c.Security.PatrolCoverage
		coverage := shared.Clamp01(shared.SafeDiv(available, needed))
		// Garrison conduct corrupts the roads it is meant to protect. A cruel
		// garrison is worse than a small one, because soldiers who abuse
		// civilians also rob travellers, and that reads here as unsafe roads.
		conductDrag := 1 - c.Security.ConductEffect*shared.Clamp01((c.Security.GoodConduct-t.GarrisonConduct)/c.Security.GoodConduct)
		if conductDrag < 0 {
			conductDrag = 0
		}
		// Morale matters: a garrison that is not being paid does not patrol.
		moraleTerm := 1 - c.Security.MoraleGarrisonEffect*(1-shared.Clamp01(t.GarrisonMorale))

		safety := c.Security.BaseRoadSafety * coverage * conductDrag * moraleTerm
		// A town at war has more soldiers in the field nearby, which is
		// ambiguous: more troops means safer roads and more billeting. The
		// honest reading is that a war makes roads dangerous through raiders
		// and deserters, which the raider term below already handles.

		read := shared.ReadString(
			shared.PairF("garrison", t.Garrison),
			shared.PairF("troops_away", away),
			shared.PairF("militia", t.Militia),
			shared.Pair("garrison_conduct", t.GarrisonConduct),
			shared.Pair("garrison_morale", t.GarrisonMorale),
			shared.PairF("road_length", roadLength),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"garrison", "garrison_conduct", "garrison_morale", "militia", "morale", "wages_owed"}, 5)

		w.Set(model.KindTown, id, "patrol_coverage", coverage, read, causes, "")
		w.Set(model.KindTown, id, "road_safety", safety, read, causes, "")
	}

	// --- raider bands ---
	// Raiders form where law is weak and disperse where it is strong. The
	// supply of potential raiders includes deserters, which is chain 4's
	// tail: troops who stop being paid stop being soldiers and start being a
	// problem for travellers.
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if !p.IsRaider {
			continue
		}
		// Find the roads this band operates on: it sits at a position, and
		// threatens the routes nearest it.
		near := nearestRoute(v, p.X, p.Y)
		if near < 0 {
			// A raider band with no reachable road has nothing to rob and
			// disperses. This keeps raider counts bounded by the map.
			w.DeleteEntity(model.KindParty, pid)
			continue
		}
		r := v.State.Routes[near]
		// A band grows where it is safe to grow and shrinks where the roads are
		// held.
		pressure := r.Traffic * c.Security.RaiderSpawnRate
		loss := c.Security.RaiderDecayRate * r.Safety
		growth := pressure - loss + p.Troops*c.Security.RaiderGrowthFromSize
		w.Add(model.KindRoute, near, "route_raiders", growth,
			shared.ReadString(
				shared.Pair("route_safety", r.Safety),
				shared.PairF("traffic", r.Traffic),
				shared.PairF("band_strength", p.Troops)),
			v.Log.RecentFor(model.KindRoute, near, []string{"route_safety", "route_traffic"}, 3),
			"raider band growth")
		// A band that gets strong enough becomes a war party in its own right,
		// which is how raiding escalates into a war without a declaration.
		if p.Troops < c.Security.RaiderBandMin && growth > 0 {
			w.Add(model.KindParty, pid, "troops", growth*c.Security.RaiderTroopPerStrength,
				shared.PairF("growth", growth), nil, "band recruiting")
		}
	}

	// --- route safety ---
	// A route is as safe as the patrols on it and as unsafe as the raiders on
	// it. Patrols come from the garrisons of the towns at either end, split
	// between their other duties.
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		a, b := v.State.Towns[r.TownA], v.State.Towns[r.TownB]
		if a == nil || b == nil {
			continue
		}
		// Each end contributes part of its patrol coverage. A route between two
		// well-held towns is safer than one whose ends are both exposed, which
		// is why a region's roads degrade from its edges inward.
		endSafety := (shared.Clamp01(a.RoadSafety) + shared.Clamp01(b.RoadSafety)) / 2
		patrol := (a.PatrolCoverage + b.PatrolCoverage) / 2
		// Raiders on the road subtract directly. The term is generous: a busy
		// raider band makes a route close to impassable, which is what stops
		// caravans and is chain 3's effect on trade.
		raiderDrag := 1 / (1 + r.Raiders*c.Security.RaiderSafetyDrag)
		// Terrain: rough ground is inherently less safe to travel.
		terrainTerm := 1 - c.Security.TerrainSafetyDrag*terrainRoughness(r.Terrain)

		safety := endSafety * (0.35 + 0.65*patrol) * raiderDrag * terrainTerm
		safety = shared.Clamp(safety, 0, 1)

		// The chance a caravan is attacked. Safe roads nearly eliminate it,
		// which is what makes patrolling worth a ruler's money.
		robChance := c.Security.RobChanceBase * (1 - shared.Clamp01(safety)*c.Security.RobChanceSafetyWeight)
		robChance = shared.Clamp01(robChance)

		read := shared.ReadString(
			shared.Pair("end_safety", endSafety),
			shared.Pair("patrol", patrol),
			shared.PairF("raiders", r.Raiders),
			shared.PairF("terrain", float64(r.Terrain)),
		)
		causes := v.Log.RecentFor(model.KindRoute, rid, []string{"route_raiders", "route_safety"}, 3)

		w.Set(model.KindRoute, rid, "route_safety", safety, read, causes, "")
		w.Set(model.KindRoute, rid, "route_patrol", patrol, read, causes, "")
	}

	// --- militia (Tier 2.1) ---
	// Free town defense: +2 base daily, +prosperity/1000, 2.5% daily retire.
	// Costs no upkeep, eats no food, only defends. This is the single reason
	// a town is not trivially captured.
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil {
			continue
		}
		spawn := 2.0 + t.Prosperity/1000.0
		retire := t.Militia * 0.025
		delta := spawn - retire
		if delta != 0 {
			read := shared.ReadString(
				shared.Pair("prosperity", t.Prosperity),
				shared.Pair("militia", t.Militia),
			)
			causes := v.Log.RecentFor(model.KindTown, id, []string{"prosperity"}, 2)
			w.Add(model.KindTown, id, "militia", delta, read, causes,
				"militia muster and retirement")
		}
	}

	// --- rebellion (Tier 2.2) ---
	// Below the loyalty threshold, daily chance the fief flips to rebels.
	// Low-loyalty militia fights at up to +200% strength for the rebels.
	for _, id := range v.State.TownIDs() {
		t := v.State.Towns[id]
		if t == nil || t.Loyalty >= c.Security.RebellionLoyaltyThreshold {
			continue
		}
		if v.Rng.Float64() >= c.Security.RebellionDailyChance {
			continue
		}
		// The town rebels: it becomes independent (side -1) with its militia
		// as the rebel garrison. The former holder loses the fief.
		read := shared.ReadString(
			shared.Pair("loyalty", t.Loyalty),
			shared.PairI("old_side", t.SideID),
			shared.Pair("militia", t.Militia),
		)
		causes := v.Log.RecentFor(model.KindTown, id,
			[]string{"loyalty", "unrest"}, 4)
		w.Set(model.KindTown, id, "holder_side", -1, read, causes,
			"rebellion: town casts off its ruler")
		// Militia swells with rebel fervor: up to +200% at zero loyalty.
		fervor := 1.0 + 2.0*(1.0-t.Loyalty/c.Security.RebellionLoyaltyThreshold)
		w.Set(model.KindTown, id, "militia", t.Militia*fervor, read, causes,
			"rebel militia surge")
	}
}

// nearestRoute returns the route whose midpoint is closest to a position.
func nearestRoute(v *sim.View, x, y float64) int {
	best, bestD := -1, 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		a, b := v.State.Towns[r.TownA], v.State.Towns[r.TownB]
		if a == nil || b == nil {
			continue
		}
		mx := (a.X + b.X) / 2
		my := (a.Y + b.Y) / 2
		d := (mx-x)*(mx-x) + (my-y)*(my-y)
		if best < 0 || d < bestD {
			best, bestD = rid, d
		}
	}
	return best
}

// terrainRoughness returns how much a terrain type hinders travel safety and
// speed, from 0 for plain to 1 for mountains. FACTIONS.md gives the Mountain
// Alliance its defensive character here: attackers march into rough ground and
// suffer for it.
func terrainRoughness(terrain int) float64 {
	switch terrain {
	case model.TerrainPlain:
		return 0
	case model.TerrainForest:
		return 0.3
	case model.TerrainHills:
		return 0.35
	case model.TerrainMountain:
		return 0.8
	case model.TerrainSwamp:
		return 0.6
	case model.TerrainCoast:
		return 0.15
	default:
		return 0.2
	}
}

// TerrainRoughness exposes the terrain penalty to the march, supply, and
// logistics systems. It lives here because terrain is a security-of-travel
// question first and a speed question second, but all three need the same
// number, and duplicating the table would let the two drift apart.
func TerrainRoughness(terrain int) float64 { return terrainRoughness(terrain) }
