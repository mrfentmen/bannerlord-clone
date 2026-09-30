// Package march moves parties across real distance and charges them for it.
//
// Reads position, destination, route safety, terrain, size, fatigue, and
// weather, and writes position, fatigue, and the daily draws on food, money,
// and metal. It is MARCH_AND_WAR.md section 1 made mechanical: a march takes
// time over real distance, and every day of it costs food, wages, and metal.
//
// The food draw is what starts chain 6. An army that marches deeper than its
// supply can reach runs its larder down, and everything downstream of that is
// another system reading the larder.
package march

import (
	"math"

	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/security"
	"mbclone/simulation/internal/systems/shared"
)

// System returns the march system.
func System() sim.System {
	return sim.System{
		Name: "march",
		Doc:  "moves parties over real distance, charging time, fatigue, food, wages, and metal",
		Runs: run,
	}
}

func run(v *sim.View, w *sim.WriteSet) {
	c := v.Cfg
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p.Troops <= 0 {
			continue
		}

		if !underway(p.Activity) {
			// A party that is not going anywhere rests: fatigue recovers, and
			// the standing costs of having troops are still paid. Rest is not
			// the absence of a system, it is the other half of this one, and it
			// is why a ruler cannot hold an army indefinitely for nothing.
			rest(v, w, pid, p, c)
			continue
		}

		// --- speed ---
		// Base speed, then four penalties that all come from shared state: the
		// road, the ground, how tired the column already is, and how big it is.
		// None of them is a fudge: each is a specific thing a player could
		// change, and each is visible in the read record on every write.
		speed := c.March.SpeedPerDay
		route := nearestRouteTo(v, p)
		safety := 1.0
		terrain := 0.0
		if route >= 0 {
			r := v.State.Routes[route]
			safety = r.Safety
			terrain = security.TerrainRoughness(r.Terrain)
		}
		speed *= 1 - c.March.SafetySpeedWeight*(1-shared.Clamp01(safety))
		speed *= 1 - c.March.TerrainSpeedWeight*terrain
		speed *= 1 - c.March.FatigueSpeedWeight*shared.Clamp01(p.Fatigue)
		// A large column is slower than a small one, which is why a ruler with
		// a big army cannot simply move it faster than a smaller one.
		speed *= 1 / (1 + c.March.SizeSpeedWeight*math.Max(0, shared.SafeDiv(p.Troops, c.March.SizeReference)-1))
		// Load: heavy cargo slows a column, so an army that has loaded itself
		// with plunder takes longer to reach anywhere.
		load := shared.SafeDiv(p.Food+p.Metal, c.March.FoodPerTroop*c.March.SizeReference*2)
		speed *= 1 - c.March.LoadSpeedWeight*shared.Clamp01(load)
		// Weather: a random seasonal effect. An army caught out in bad weather
		// loses days it cannot get back, which is a real cost and not a
		// scripted event.
		weather := weatherFactor(v, terrain)
		speed *= weather
		if speed < c.March.MinSpeed {
			speed = c.March.MinSpeed
		}

		// --- movement ---
		dx := p.DestX - p.X
		dy := p.DestY - p.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist <= speed {
			arrive(v, w, pid, p, c)
			continue
		}
		frac := speed / dist
		readMove := shared.ReadString(
			shared.Pair("speed", speed),
			shared.PairF("distance", dist),
			shared.Pair("route_safety", safety),
			shared.PairF("terrain", terrain),
			shared.PairF("troops", p.Troops),
			shared.Pair("fatigue", p.Fatigue),
			shared.Pair("weather", weather),
		)
		causes := v.Log.RecentFor(model.KindParty, pid,
			[]string{"position_x", "position_y", "fatigue", "morale", "party_food", "party_starving"}, 4)

		w.Add(model.KindParty, pid, "position_x", dx*frac,
			readMove, causes, "marching")
		w.Add(model.KindParty, pid, "position_y", dy*frac,
			readMove, causes, "marching")
		w.Set(model.KindParty, pid, "speed", speed, readMove, causes, "march speed")
		w.Add(model.KindParty, pid, "days_out", 1, readMove, causes, "day on the road")

		// --- the daily bill ---
		// Food, wages, metal. Paid whether the column is winning or losing.
		// The upkeep system also charges wages, so between them an army is
		// expensive; that double-count is deliberate, because an army on the
		// march consumes more than one standing in a town, and the difference
		// is exactly the cost of distance that this system exists to charge.
		foodDraw := p.Troops * c.March.FoodPerTroop
		w.Add(model.KindParty, pid, "party_food", -foodDraw,
			readMove, causes, "march food")
		w.Add(model.KindParty, pid, "party_money", -p.Troops*c.March.MoneyPerTroop,
			readMove, causes, "march wages")
		w.Add(model.KindParty, pid, "party_metal", -p.Troops*c.March.MetalPerTroop,
			readMove, causes, "march ammunition and repair")

		// Fatigue. Marching is hard, and the harder the going the harder it is.
		fatigueGain := c.March.FatiguePerDay * (1 + terrain*c.March.TerrainFatigueWeight)
		w.Add(model.KindParty, pid, "fatigue", fatigueGain, readMove, causes, "march fatigue")

		// Morale wears with the miles. An army that arrives is entitled to the
		// relief of arriving, which is what stops a long march from being
		// unwinnable by construction.
		w.Add(model.KindParty, pid, "morale", -c.March.MoraleMarchWeight*(1+terrain),
			readMove, causes, "marching wear")
	}
}

// underway reports whether an activity means the party is moving.
func underway(a model.Activity) bool {
	return a == model.ActMarching || a == model.ActResupplying || a == model.ActReturning
}

// rest lets a halted party recover fatigue, and pays its standing costs. A
// party standing in a town is still fed and still paid, which is why holding an
// army is a decision with a running cost.
func rest(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	// Fatigue recovers, faster where the men are not marching at all.
	recov := c.March.FatigueDecay * (1 - shared.Clamp01(p.Fatigue))
	w.Add(model.KindParty, pid, "fatigue", -recov,
		shared.ReadString(
			shared.Pair("activity", float64(p.Activity)),
			shared.PairF("fatigue", p.Fatigue)),
		v.Log.RecentFor(model.KindParty, pid, []string{"fatigue", "activity"}, 3), "resting")
	// Morale recovers a little when the army is not being worn down by the road.
	w.Add(model.KindParty, pid, "morale", c.Upkeep.MoraleRecoveryRate*0.5,
		shared.Pair("activity", float64(p.Activity)), nil, "resting")
	// A rested army is fed from its own larder even at rest, at a lower rate
	// than on the march.
	w.Add(model.KindParty, pid, "party_food", -p.Troops*c.March.StationaryFoodRate*c.Food.PersonDaysPerPersonDay,
		shared.PairF("troops", p.Troops), nil, "quartering")
}

// arrive handles a party reaching its destination. What happens then depends
// entirely on why it was going there, and this system only records that it has
// arrived and set the party's intention to none, so the systems that read
// arrival (supply for resupply, siege for a besieger) act on shared state
// rather than on being told by this one.
func arrive(v *sim.View, w *sim.WriteSet, pid int, p *model.Party, c *config.Config) {
	read := shared.ReadString(
		shared.Pair("activity", float64(p.Activity)),
		shared.PairF("fatigue", p.Fatigue),
		shared.Pair("morale", p.Morale),
		shared.PairF("troops", p.Troops),
	)
	causes := v.Log.RecentFor(model.KindParty, pid,
		[]string{"position_x", "position_y", "days_out", "fatigue"}, 4)

	// Arriving is a relief, and an army that arrives with an intact morale can
	// go on to do something. Without this a long march would always end in
	// collapse, which would make distance a wall rather than a cost.
	w.Add(model.KindParty, pid, "morale", c.March.ArrivalMoraleBonus, read, causes, "arrived")
	// The party is now at its destination: position and destination coincide,
	// and the movement is over.
	w.Set(model.KindParty, pid, "position_x", p.DestX, read, causes, "arrived")
	w.Set(model.KindParty, pid, "position_y", p.DestY, read, causes, "arrived")
	w.Set(model.KindParty, pid, "days_out", 0, read, causes, "")

	// The activity becomes whatever the arrival means, and the intention is
	// cleared because it has been carried out. Both are shared state that other
	// systems read next tick.
	switch p.Activity {
	case model.ActSieging:
		// A besieger that has arrived at its target begins the siege, which
		// the siege system reads from activity and position.
		w.Set(model.KindParty, pid, "is_sieging", 1, read, causes, "besieging")
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), read, causes, "")
	case model.ActResupplying:
		w.Set(model.KindParty, pid, "activity", float64(model.ActIdle), read, causes, "resupplied")
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), read, causes, "")
	case model.ActRaiding:
		w.Set(model.KindParty, pid, "activity", float64(model.ActIdle), read, causes, "raid complete")
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), read, causes, "")
	default:
		w.Set(model.KindParty, pid, "activity", float64(model.ActIdle), read, causes, "arrived")
		w.Set(model.KindParty, pid, "intended_action", float64(model.IntentNone), read, causes, "")
	}
}

// nearestRouteTo returns the route nearest a party's current position, which is
// the road it is on.
func nearestRouteTo(v *sim.View, p *model.Party) int {
	best, bestD := -1, 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		a, b := v.State.Towns[r.TownA], v.State.Towns[r.TownB]
		if a == nil || b == nil {
			continue
		}
		// Distance from the party to the segment, approximated by its distance
		// to the nearer end. Exact segment distance would not change any
		// decision, and this keeps the tick cheap over hundreds of parties.
		da := dist(a.X, a.Y, p.X, p.Y)
		db := dist(b.X, b.Y, p.X, p.Y)
		d := da
		if db < d {
			d = db
		}
		if best < 0 || d < bestD {
			best, bestD = rid, d
		}
	}
	return best
}

func dist(x1, y1, x2, y2 float64) float64 {
	dx := x1 - x2
	dy := y1 - y2
	return math.Sqrt(dx*dx + dy*dy)
}

// weatherFactor returns a speed multiplier for the day's conditions, in [0.5,
// 1.1]. Winter is harsher, and harsh ground is harsher still, so a column
// crossing mountains in winter is the slowest thing on the map. The draw is
// seeded, so a run is reproducible, and it is a random effect rather than a
// scripted event, which is what CAUSE_EFFECT.md section 7 permits.
func weatherFactor(v *sim.View, terrain float64) float64 {
	c := v.Cfg
	// Season: winter is harder, summer easier, spring and autumn middling.
	day := v.Day
	season := 1.0
	switch {
	case day < 60 || day >= 330:
		season = 1 - c.March.WinterSeverity
	case day < 150:
		season = 1
	case day < 240:
		season = 1 - c.March.SeasonSeverity
	default:
		season = 1
	}
	// A daily draw for the weather proper: rain, snow, or clear.
	draw := v.Rng.Range(-c.March.WeatherSwing, c.March.WeatherSwing)
	// Exposed ground is worse in bad weather.
	factor := (season + draw) * (1 - terrain*c.March.ExposureWeight)
	if factor < 0.4 {
		factor = 0.4
	}
	return factor
}
