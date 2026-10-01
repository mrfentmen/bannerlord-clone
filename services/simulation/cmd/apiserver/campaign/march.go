package campaign

import (
	"context"
	"fmt"
	"math"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/security"
)

// LeagueKM converts leagues to kilometres. A league is three miles and a mile is
// 1.609344 km, so 4.828032. The simulation measures distance in leagues
// throughout and the client's map measures in kilometres, so every distance this
// server sends crosses here exactly once.
const LeagueKM = 3 * 1.609344

// PlanMarch previews a march. It reads state and changes nothing.
//
// The plan is an estimate, and the contract says so in its section 9. It uses the
// same balance.toml constants internal/systems/march uses for its base speed and
// its road-safety and terrain discounts, but the march system additionally charges
// fatigue, load, column size, and daily weather. Actual days can exceed this.
// CommitMarch does not use this number: the march system is the authority.
func (c *Campaign) PlanMarch(ctx context.Context, req wire.MarchRequest) (any, error) {
	if req.Departure != "" && req.Departure != "now" && req.Departure != "hold" {
		return nil, badRequestf("departure must be \"now\" or \"hold\", got %q", req.Departure)
	}
	c.mu.RLock()
	defer c.mu.RUnlock()

	party := c.partyForOrder(req.PartyID)
	if party == nil {
		return nil, notFoundf("no party %q", req.PartyID)
	}
	dest := c.townRef(req.DestinationSettlementID)
	if dest == nil {
		return nil, notFoundf("no settlement %q", req.DestinationSettlementID)
	}
	return c.planLocked(party, dest, req), nil
}

func (c *Campaign) planLocked(party *model.Party, dest *model.Town, req wire.MarchRequest) wire.MarchPlan {
	plan := wire.MarchPlan{
		PartyID:                 EntityID(model.KindParty, party.ID),
		DestinationSettlementID: req.DestinationSettlementID,
		DestinationName:         dest.Name,
		Route:                   []wire.Point{},
		Warnings:                []string{},
	}

	legs, mapped := c.routeBetween(party, dest)
	plan.Route = c.routePoints(party, dest, legs)
	plan.Unmapped = !mapped
	plan.DistanceKm = round2(c.leaguesFor(party, dest, legs) * LeagueKM)
	plan.RoadDanger = c.roadDanger(legs)

	days := c.estimateMarchDays(party, dest, legs, mapped)
	plan.Days = days
	plan.ArrivalDay = c.state.Tick + int(math.Ceil(days))

	troops := party.Troops
	plan.Cost.Food = days * troops * c.cfg.March.FoodPerTroop
	plan.Cost.Money = days * troops * c.cfg.March.MoneyPerTroop
	plan.Cost.Metal = days * troops * c.cfg.March.MetalPerTroop

	// Days of food left on arrival, from the party's real larder and the real
	// consumption rate. Nil when the plan runs out before it gets there, which is
	// a different answer from arriving with nothing and one the player has to be
	// able to tell apart.
	perDay := troops * c.cfg.March.FoodPerTroop
	switch {
	case perDay <= 0:
		left := 0.0
		plan.DaysOfFoodOnArrival = &left
	case party.Food-plan.Cost.Food <= 0:
		plan.DaysOfFoodOnArrival = nil
	default:
		left := (party.Food - plan.Cost.Food) / perDay
		plan.DaysOfFoodOnArrival = &left
	}

	plan.Warnings = c.marchWarnings(party, dest, legs, mapped, plan, req)
	return plan
}

// routeBetween finds a path of surveyed roads from the party's nearest town to the
// destination, by breadth-first search over state.Routes.
//
// It returns the legs in travel order and whether a path was found. No path means
// the planner has no surveyed road, and the caller says so rather than inventing
// one.
func (c *Campaign) routeBetween(party *model.Party, dest *model.Town) ([]*model.Route, bool) {
	start := c.nearestTown(party.X, party.Y)
	if start < 0 || start == dest.ID {
		return nil, false
	}
	// Adjacency, built once per query. The route graph is small: a few hundred
	// routes over a few hundred towns, so rebuilding it per plan is cheaper than
	// caching a structure that would have to be invalidated on every tick.
	adj := map[int][]*model.Route{}
	for _, id := range c.state.RouteIDs() {
		r := c.state.Routes[id]
		if r == nil {
			continue
		}
		adj[r.TownA] = append(adj[r.TownA], r)
		adj[r.TownB] = append(adj[r.TownB], r)
	}

	type step struct {
		town  int
		route *model.Route
	}
	prev := map[int]step{start: {town: -1}}
	queue := []int{start}
	found := false
	for len(queue) > 0 && !found {
		cur := queue[0]
		queue = queue[1:]
		if cur == dest.ID {
			found = true
			break
		}
		for _, r := range adj[cur] {
			nxt := r.TownA
			if nxt == cur {
				nxt = r.TownB
			}
			if _, seen := prev[nxt]; seen {
				continue
			}
			if _, exists := c.state.Towns[nxt]; !exists {
				continue
			}
			prev[nxt] = step{town: cur, route: r}
			queue = append(queue, nxt)
		}
	}
	if !found {
		return nil, false
	}
	// Walk the predecessor chain back, then reverse into travel order.
	var legs []*model.Route
	for cur := dest.ID; cur != start; {
		s, ok := prev[cur]
		if !ok || s.route == nil {
			return nil, false
		}
		legs = append(legs, s.route)
		cur = s.town
	}
	for i, j := 0, len(legs)-1; i < j; i, j = i+1, j-1 {
		legs[i], legs[j] = legs[j], legs[i]
	}
	return legs, true
}

// nearestTown is the town closest to a point, by the simulation's own distance
// measure.
func (c *Campaign) nearestTown(x, y float64) int {
	best := -1
	bestDist := math.Inf(1)
	for _, id := range c.state.TownIDs() {
		t := c.state.Towns[id]
		if t == nil {
			continue
		}
		d := math.Hypot(t.X-x, t.Y-y)
		if d < bestDist {
			bestDist, best = d, id
		}
	}
	return best
}

// routePoints draws the path: where the party is, then every town it passes
// through, then the destination. When there is no surveyed road it is the two
// endpoints and nothing invented between them.
func (c *Campaign) routePoints(party *model.Party, dest *model.Town, legs []*model.Route) []wire.Point {
	pts := []wire.Point{{X: round2(party.X), Z: round2(party.Y)}}
	if len(legs) == 0 {
		return append(pts, wire.Point{X: round2(dest.X), Z: round2(dest.Y)})
	}
	cur := c.nearestTown(party.X, party.Y)
	for _, r := range legs {
		nxt := r.TownA
		if nxt == cur {
			nxt = r.TownB
		}
		if t := c.state.Towns[nxt]; t != nil {
			pts = append(pts, wire.Point{X: round2(t.X), Z: round2(t.Y)})
		}
		cur = nxt
	}
	if cur != dest.ID {
		pts = append(pts, wire.Point{X: round2(dest.X), Z: round2(dest.Y)})
	}
	return pts
}

// leaguesFor is the road distance in leagues, or the straight line when unmapped.
func (c *Campaign) leaguesFor(party *model.Party, dest *model.Town, legs []*model.Route) float64 {
	if len(legs) == 0 {
		return math.Hypot(dest.X-party.X, dest.Y-party.Y)
	}
	total := 0.0
	for _, r := range legs {
		total += r.Length
	}
	return total
}

// roadDanger is 1 minus mean road safety: 0 safe to 1 lethal.
func (c *Campaign) roadDanger(legs []*model.Route) float64 {
	if len(legs) == 0 {
		return 1
	}
	sum := 0.0
	for _, r := range legs {
		sum += r.Safety
	}
	return round3(clamp01(1 - sum/float64(len(legs))))
}

// estimateMarchDays is the planner's day count.
//
// Base speed is march.speed_per_day scaled by world.terrain_speed, which the
// config describes as the base travel-speed multiplier on an average road. On top
// of that: the safety discount march.safety_speed_weight applies against mean road
// safety, and the roughness security.TerrainRoughness reports for the terrain
// index, weighted by march.terrain_speed_weight.
//
// Those are the same constants and the same helper the march system uses. The
// terms the march system adds on top — fatigue, load, column size, daily weather —
// are what make this an estimate rather than a promise.
func (c *Campaign) estimateMarchDays(party *model.Party, dest *model.Town, legs []*model.Route, mapped bool) float64 {
	leagues := c.leaguesFor(party, dest, legs)
	safety := 0.5
	roughness := 0.0
	if mapped && len(legs) > 0 {
		for _, r := range legs {
			safety += r.Safety / float64(len(legs))
			roughness += security.TerrainRoughness(r.Terrain) / float64(len(legs))
		}
		speed := c.cfg.March.SpeedPerDay * c.cfg.World.TerrainSpeed
		speed *= 1 - c.cfg.March.SafetySpeedWeight*(1-clamp01(safety))
		speed *= 1 - c.cfg.March.TerrainSpeedWeight*roughness
		if speed < c.cfg.March.MinSpeed {
			speed = c.cfg.March.MinSpeed
		}
		return ceilTo(days2(leagues/speed))
	}
	// Unmapped: a cross-country column is slower than one on a road, which is why
	// the straight-line fallback is not optimistic.
	speed := c.cfg.March.SpeedPerDay * c.cfg.World.TerrainSpeed * 0.6
	if speed < c.cfg.March.MinSpeed {
		speed = c.cfg.March.MinSpeed
	}
	return ceilTo(days2(leagues / speed))
}

func days2(v float64) float64 {
	if v < 1 {
		return 1
	}
	return math.Round(v*10) / 10
}

func ceilTo(v float64) float64 { return math.Ceil(v) }

// marchWarnings are the real problems with this plan, in the product's voice.
func (c *Campaign) marchWarnings(party *model.Party, dest *model.Town, legs []*model.Route, mapped bool, plan wire.MarchPlan, req wire.MarchRequest) []string {
	var out []string
	troops := party.Troops

	daysFood := 0.0
	if troops > 0 && c.cfg.March.FoodPerTroop > 0 {
		daysFood = party.Food / (troops * c.cfg.March.FoodPerTroop)
	}
	if troops <= 0 {
		out = append(out, "There is nobody to march.")
	} else if daysFood < c.cfg.Campaign.MinDaysFoodToMarch {
		out = append(out, fmt.Sprintf(
			"You have %s days of food, and a column needs %s before it sets out.",
			trimNum(daysFood), trimNum(c.cfg.Campaign.MinDaysFoodToMarch)))
	}

	switch {
	case troops <= 0:
		// Nothing to feed on the road, so there is no food warning to give.
	case plan.DaysOfFoodOnArrival == nil:
		out = append(out, fmt.Sprintf(
			"You run out of food after about %s days. %s is %s days away.",
			trimNum(daysFood), dest.Name, trimNum(plan.Days)))
	case *plan.DaysOfFoodOnArrival < c.cfg.Supply.DaysOfFoodStarved:
		out = append(out, fmt.Sprintf(
			"You arrive with %s days of food, and a column goes hungry at %s.",
			trimNum(*plan.DaysOfFoodOnArrival), trimNum(c.cfg.Supply.DaysOfFoodStarved)))
	}

	if !mapped {
		out = append(out, "No surveyed road for this leg. The column goes cross-country, and arrives later than this says.")
	}
	for _, r := range legs {
		if r.Blocked {
			out = append(out, "Part of the road is closed.")
			break
		}
	}
	if anyLegRaiders(legs) {
		out = append(out, "Raiders are working that stretch of road.")
	}
	if party.SideID >= 0 && dest.HolderSide >= 0 && c.state.AtWar(party.SideID, dest.HolderSide) {
		out = append(out, dest.Name+" holds for your enemies. Marching there means fighting on arrival.")
	}
	if party.Metal < c.cfg.Campaign.MinMetalToBesiege {
		out = append(out, fmt.Sprintf(
			"You carry %s metal. A siege needs %s, so this march cannot end in one.",
			trimNum(party.Metal), trimNum(c.cfg.Campaign.MinMetalToBesiege)))
	}
	if req.Departure == "hold" {
		// The simulation has no defer queue, so holding is recorded here rather
		// than promised. See the contract's section 9.
		out = append(out, "Holding is noted, not scheduled: this simulation has no deferred orders, so commit sends the column out now.")
	}
	return out
}

func anyLegRaiders(legs []*model.Route) bool {
	for _, r := range legs {
		if r.Raiders > 1 {
			return true
		}
	}
	return false
}

// CommitMarch orders the march.
//
// It stages sim.OrderMarchTo, the order internal/systems/player already applies for
// the scripted profiles, so a player's march and an AI's march are governed by
// identical rules. The march system then moves the column day by day under its own
// physics; this route does not compute the journey.
func (c *Campaign) CommitMarch(ctx context.Context, req wire.MarchRequest) (any, error) {
	if req.Departure != "" && req.Departure != "now" && req.Departure != "hold" {
		return nil, badRequestf("departure must be \"now\" or \"hold\", got %q", req.Departure)
	}
	c.mu.RLock()
	ruler := c.playerRuler
	c.mu.RUnlock()

	c.mu.RLock()
	party := c.partyForOrder(req.PartyID)
	c.mu.RUnlock()
	if party == nil {
		return nil, notFoundf("no party %q", req.PartyID)
	}
	dest := c.townRef(req.DestinationSettlementID)
	if dest == nil {
		return nil, notFoundf("no settlement %q", req.DestinationSettlementID)
	}
	if party.Troops <= 0 {
		return nil, unprocessablef("There is nobody to march.", "party %d has no troops", party.ID)
	}

	j := &job{
		name:          "march",
		hasEngineOrder: true,
		engineOrder: sim.Order{
			Kind:    sim.OrderMarchTo,
			RulerID: ruler,
			Target:  dest.ID,
		},
		done: make(chan jobResult, 1),
	}
	// The order is applied by internal/systems/player on the tick. The job still
	// has to exist so the tick runs even at a zero clock rate, and so the caller
	// learns the tick completed rather than returning before anything happened.
	if _, err := c.Submit(ctx, j); err != nil {
		return nil, err
	}
	c.mu.Lock()
	if c.ro.marchStart < 0 {
		c.ro.marchStart = c.state.Tick
	}
	c.mu.Unlock()
	return wire.Accepted{Accepted: true}, nil
}
