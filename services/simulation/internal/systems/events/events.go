// Package events implements the world's discrete events and encounters: the
// things that happen to a settlement or to a column on a given day, rather than
// accumulating a little every day as a rate-based system would model them.
//
// Tasks 476-480 of BUFFY_1000_TASKS.md:
//
//	476 BanditAmbush    a raider band falls on traffic on an unsafe road
//	477 MerchantCaravan a town with a surplus finds a trader for its goods
//	478 RefugeeGroup    people flee into a town, and the town must feed them
//	479 Deserters       troops break and leave, some of them to the bandits
//	480 WeatherStorm    days of bad weather that grind travel and harvests
//
// Every event type is a Rule with the same three steps. Trigger reports how
// likely the event is today, Apply stages a day of its consequences, and
// Resolve closes it out. An event lasts one or more days: a storm that arrives
// on Monday is still Tuesday's problem, so days_left in the event's data drives
// the lifecycle and the storm exercises the multi-day path.
//
// Two rules of the house shape every write in this package.
//
// The first is that all effects go through sim.WriteSet and never touch
// model.State, so every change is clamped, cause-logged, and independent of the
// order the systems run in.
//
// The second follows from the first. The engine rejects two absolute writes to
// one field in a tick, and it folds an absolute write and a delta into a single
// sum whose result depends on which system staged first: the accumulator takes
// its isSet flag from whichever contribution arrived first, so a delta staged
// before an absolute write is added to the old value *and* the new one. This
// package therefore only ever calls Add, on fields no other system writes
// absolutely. That constraint is why a storm reaches the harvest through
// sanitation and lost_food_total rather than through food_production, and why
// an ambush takes a column's provisions rather than its cargo: those fields
// belong outright to the systems that own them. Every such choice is commented
// at the write that it constrains.
package events

import (
	"fmt"
	"math"

	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
	"mbclone/simulation/internal/systems/shared"
)

// EventType identifies the kind of event.
type EventType string

// The five event types, one per task.
const (
	BanditAmbush    EventType = "bandit_ambush"
	MerchantCaravan EventType = "merchant_caravan"
	RefugeeGroup    EventType = "refugee_group"
	Deserters       EventType = "deserters"
	WeatherStorm    EventType = "weather_storm"
)

// Keys into Event.Data. Data is a flat map of floats because an event is a
// record that outlives the tick that created it and is read by the API and by
// tests; five typed payloads would need a type switch to read one field out of
// any of them.
const (
	keyRoute      = "route"
	keyParty      = "party"
	keyBanditSize = "bandit_strength"
	keyLoot       = "loot"
	keyCasualties = "casualties"
	keyGoods      = "goods_value"
	keyRefugees   = "refugees"
	keyArmed      = "armed"
	keyDeserted   = "deserted"
	keyToBandits  = "deserted_to_bandits"
	keySeverity   = "severity"
	keyDaysLeft   = "days_left"
)

// Event is a world event waiting to be resolved.
//
// SettlementID is the subject the event happened to: a town for a caravan, a
// refugee group or a storm, and a route for an ambush, because an ambush is
// something that happens to a road rather than to a place. Day is the day of
// the year the event started, 0-364.
type Event struct {
	ID           int
	Type         EventType
	SettlementID int
	Day          int
	Data         map[string]float64
	Resolved     bool
}

// Days reports how many days of effect the event has left. A storm that has
// been running for two days of three still slows travel today.
func (e *Event) Days() float64 { return e.Data[keyDaysLeft] }

// Rule is the behaviour of one kind of event.
type Rule interface {
	// Type identifies the events this rule produces.
	Type() EventType
	// Subjects lists what the event can happen to today, in the deterministic
	// order the state hands out. A rule that can fire nowhere lists nothing,
	// which is how a season or a famine closes an event off without the rule
	// needing to know why.
	Subjects(v *sim.View) []int
	// Trigger returns the chance, in [0,1], that the event starts today
	// against the given subject. Zero means it cannot start.
	Trigger(v *sim.View, subject int) float64
	// New builds the event record for a subject, including how long it lasts.
	New(v *sim.View, subject, day int) *Event
	// Apply stages one day of the event's consequences.
	Apply(v *sim.View, w *sim.WriteSet, e *Event)
	// Resolve closes the event out on the day after its last effect.
	Resolve(v *sim.View, w *sim.WriteSet, e *Event)
}

// rules is the roll order. A slice, not a map, because the order events are
// rolled in is part of the simulation's determinism.
var rules = []Rule{ambush{}, caravan{}, refugee{}, deserter{}, storm{}}

func ruleFor(t EventType) Rule {
	for _, r := range rules {
		if r.Type() == t {
			return r
		}
	}
	return nil
}

// Runtime holds the events in flight and the ones already resolved. Events
// outlive the tick that created them, and model.State has no home for them, so
// they live here, the same way the bandit system's camps and bounties do.
type Runtime struct {
	active  []*Event
	history []*Event
	counts  map[EventType]int
	nextID  int
}

func newRuntime() *Runtime {
	return &Runtime{counts: make(map[EventType]int), nextID: 1}
}

var rt = newRuntime()

// Reset clears the runtime. Tests call it so that one test's events cannot fire
// in the next.
func Reset() { rt = newRuntime() }

// Active returns the unresolved events, oldest first.
func Active() []*Event { return append([]*Event{}, rt.active...) }

// History returns every event this runtime has seen, resolved or not.
func History() []*Event { return append([]*Event{}, rt.history...) }

// Counts returns how many events of each type have ever fired.
func Counts() map[EventType]int {
	out := make(map[EventType]int, len(rt.counts))
	for k, v := range rt.counts {
		out[k] = v
	}
	return out
}

// System returns the world events system.
func System() sim.System {
	return sim.System{
		Name: "events",
		Doc:  "rolls ambushes, caravans, refugee groups, desertions and storms, and applies each over the days it lasts",
		Runs: run,
	}
}

// run drives the lifecycle. Events that have run their course are closed out
// first, then the longer events apply their next day, and only then are today's
// events rolled, so an event created this tick applies on the tick it was
// rolled and never twice on the same day.
func run(v *sim.View, w *sim.WriteSet) {
	closeOut(v, w)
	applyActive(v, w)
	fireNew(v, w)
}

// closeOut resolves every event whose last day was yesterday.
func closeOut(v *sim.View, w *sim.WriteSet) {
	kept := rt.active[:0]
	for _, e := range rt.active {
		if e.Data[keyDaysLeft] > 1 {
			kept = append(kept, e)
			continue
		}
		if r := ruleFor(e.Type); r != nil {
			r.Resolve(v, w, e)
		}
		// The event was recorded in the history when it fired, so closing it
		// out only flips the flag; appending it again would list one storm
		// twice.
		e.Resolved = true
	}
	// Reusing the backing array is safe here: kept never grows past the read
	// index, so no element is overwritten before it has been read.
	rt.active = kept
}

// applyActive stages the second and later days of an event that lasts longer
// than one day.
func applyActive(v *sim.View, w *sim.WriteSet) {
	for _, e := range rt.active {
		r := ruleFor(e.Type)
		if r == nil {
			continue
		}
		r.Apply(v, w, e)
		e.Data[keyDaysLeft]--
	}
}

// fireNew rolls every rule against every subject it offers today.
func fireNew(v *sim.View, w *sim.WriteSet) {
	for _, r := range rules {
		// A named substream per rule, so adding a roll to one event type does
		// not shift the sequence another type sees.
		rng := v.Rng.Derive("events." + string(r.Type()))
		for _, subject := range r.Subjects(v) {
			chance := r.Trigger(v, subject)
			if chance <= 0 || !rng.Chance(chance) {
				continue
			}
			e := r.New(v, subject, v.Day)
			e.ID = rt.nextID
			rt.nextID++
			rt.counts[e.Type]++
			rt.active = append(rt.active, e)
			rt.history = append(rt.history, e)
			r.Apply(v, w, e)
		}
	}
}

// cfgOr returns value when it is set and fallback when it is not. Systems are
// tested with a mostly empty config.Config, so a zero here is a missing tuning
// constant rather than a deliberate zero.
func cfgOr(value, fallback float64) float64 {
	if value > 0 {
		return value
	}
	return fallback
}

// --- Task 476: bandit ambush ---

// Bandit ambush tuning. The chance itself comes from the security config,
// because an ambush and a routine robbery are the same event seen from two
// systems and the road's own safety decides both.
const (
	// ambushMinSize and ambushMaxSize bound the band that appears.
	ambushMinSize = 4.0
	ambushMaxSize = 22.0
	// ambushLootShare is the share of a column's provisions the band takes.
	ambushLootShare = 0.45
	// ambushRaiderGain and ambushPressureGain are what one band of troops adds
	// to the road's raiders and to the pressure on the towns at either end.
	ambushRaiderGain   = 0.04
	ambushPressureGain = 0.012
	// ambushTrafficLoss is the share of the road's traffic that stops using it
	// for a day after an ambush.
	ambushTrafficLoss = 0.5
	// ambushRiskDeath is the share of a column's guards cut down, used when
	// the logistic config does not say.
	ambushRiskDeath = 0.05
	// ambushBandName is what a spawned band is called.
	ambushBandName = "Bandits"
)

// ambush is a raider band falling on traffic on an unsafe road.
type ambush struct{}

func (ambush) Type() EventType { return BanditAmbush }

// Subjects are the roads with something on them. An empty road cannot be
// ambushed, which is why this offers routes by traffic rather than all routes:
// the bandit system's job is to put raiders on roads, and this system's job is
// to see what they catch.
func (ambush) Subjects(v *sim.View) []int {
	var out []int
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil || r.Blocked || r.Traffic <= 0 {
			continue
		}
		out = append(out, rid)
	}
	return out
}

// Trigger is the robbery chance security and logistics already use, because
// there is no sense in a second, different robbery chance. The band-size factor
// is what makes suppressing raiders actually suppress ambushes: a patrolled,
// bandit-free road is not merely safer, it has nobody to do the ambushing.
func (ambush) Trigger(v *sim.View, subject int) float64 {
	r := v.State.Routes[subject]
	if r == nil {
		return 0
	}
	c := v.Cfg.Security
	safety := shared.Clamp01(r.Safety)
	chance := c.RobChanceBase * (1 - safety*c.RobChanceSafetyWeight)
	chance *= 0.35 + 0.65*shared.Clamp01(r.Raiders)
	return shared.Clamp01(chance)
}

func (ambush) New(v *sim.View, subject, day int) *Event {
	rng := v.Rng.Derive(fmt.Sprintf("events.ambush.%d", subject))
	size := ambushMinSize + rng.Float64()*(ambushMaxSize-ambushMinSize)
	return &Event{
		Type:         BanditAmbush,
		SettlementID: subject,
		Day:          day,
		// An ambush is a fight, not a condition. It happens today and its
		// consequences are in the state today.
		Data: map[string]float64{
			keyRoute:      float64(subject),
			keyBanditSize: size,
			keyLoot:       0,
			keyCasualties: 0,
			keyDaysLeft:   1,
		},
	}
}

func (ambush) Apply(v *sim.View, w *sim.WriteSet, e *Event) {
	rid := int(e.Data[keyRoute])
	route := v.State.Routes[rid]
	if route == nil {
		return
	}
	size := e.Data[keyBanditSize]
	read := shared.ReadString(
		shared.Pair("route_safety", route.Safety),
		shared.Pair("route_raiders", route.Raiders),
		shared.PairF("route_traffic", route.Traffic))
	routeCauses := v.Log.RecentFor(model.KindRoute, rid,
		[]string{"route_safety", "route_raiders"}, 3)

	// The band that ambushed is a band that exists afterwards, and a road that
	// feeds one grows more of them. This is the feedback that makes a road
	// worth suppressing rather than merely inconvenient.
	w.Add(model.KindRoute, rid, "route_raiders", size*ambushRaiderGain,
		read, routeCauses, "band fed by the ambush")

	// Traffic stops using a road where it is being robbed. route_traffic is
	// what the caravan system's dispatch cap counts, so this is the trade cost
	// of the ambush expressed in the field the trade system already reads.
	w.Add(model.KindRoute, rid, "route_traffic", -route.Traffic*ambushTrafficLoss,
		read, routeCauses, "road avoided after an ambush")

	// Both ends of the road hear about it.
	for _, tid := range []int{route.TownA, route.TownB} {
		t := v.State.Towns[tid]
		if t == nil {
			continue
		}
		w.Add(model.KindTown, tid, "raider_pressure", size*ambushPressureGain,
			shared.ReadString(shared.Pair("road_safety", t.RoadSafety), shared.Pair("raider_pressure", t.RaiderPressure)),
			v.Log.RecentFor(model.KindTown, tid, []string{"raider_pressure", "road_safety"}, 2),
			"ambush on the road at "+t.Name)
	}

	victim := ambushVictim(v, route)
	if victim == nil {
		// Nothing on the road to catch, but the band still exists and still
		// takes to the road. An ambush that costs nobody is still pressure on
		// the towns at either end.
		return
	}

	// The column pays in provisions and blood. Both fields are additive here:
	// a party's cargo is written absolutely by the systems that load and clear
	// it, so an ambush that deducted from it would have to know whether the
	// caravan system had already robbed this caravan today. party_food and
	// wounded are only ever added to, so the cost lands the same way whatever
	// order the systems ran in.
	stock := victim.CargoFood + victim.CargoMedicine + victim.CargoMetal
	loot := (victim.Food + stock*ambushLootShare) * 0.5
	if loot > victim.Food {
		loot = victim.Food
	}
	casualties := math.Round(victim.Troops * cfgOr(v.Cfg.Logistic.CaravanRiskDeath, ambushRiskDeath))
	victimRead := shared.ReadString(
		shared.PairF("troops", victim.Troops),
		shared.Pair("party_food", victim.Food),
		shared.PairF("cargo", stock))
	if loot > 0 {
		w.Add(model.KindParty, victim.ID, "party_food", -loot,
			victimRead, nil, "provisions taken in the ambush")
	}
	if casualties > 0 {
		w.Add(model.KindParty, victim.ID, "wounded", casualties,
			victimRead, nil, "guards cut down in the ambush")
	}
	e.Data[keyLoot] = loot
	e.Data[keyCasualties] = casualties
	e.Data[keyParty] = float64(victim.ID)

	// The band leaves with what it took, as a real party on the map, so the
	// bandit system has something to feed and the API has something to show.
	// The side and ruler are -1 as they are for a generated raider band: a
	// bandit belongs to nobody.
	midX, midY := routeMidpoint(v, route)
	w.SpawnParty(&model.Party{
		Name:     ambushBandName,
		SideID:   -1,
		RulerID:  -1,
		X:        midX,
		Y:        midY,
		Troops:   size,
		IsRaider: true,
		Activity: model.ActIdle,
		Morale:   0.7,
		// The provisions the column lost are the provisions the band now has,
		// so the loot is moved rather than created.
		CargoFood: loot,
	})
}

// Resolve does nothing: an ambush is over the moment it happens, and what
// happens to the band afterwards belongs to the bandit system, which owns
// raider parties.
func (ambush) Resolve(v *sim.View, w *sim.WriteSet, e *Event) {}

// ambushVictim picks the column a band would realistically fall on: the
// weakest non-raider party actually travelling from one end of the road to the
// other. The weakest is chosen because that is the one a band picks.
func ambushVictim(v *sim.View, r *model.Route) *model.Party {
	var best *model.Party
	bestPower := 0.0
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.IsRaider || p.Troops <= 0 {
			continue
		}
		near := v.State.TownOf(p)
		if (near != r.TownA || p.DestTown != r.TownB) && (near != r.TownB || p.DestTown != r.TownA) {
			continue
		}
		if p.Activity != model.ActMarching && p.Activity != model.ActTrading {
			continue
		}
		power := p.Troops + p.CargoFood + p.CargoMedicine + p.CargoMetal*0.5
		if best == nil || power < bestPower {
			best, bestPower = p, power
		}
	}
	return best
}

// --- Task 477: merchant caravan ---

// Merchant caravan tuning.
const (
	// caravanBaseChance is a prosperous, well-supplied town's daily chance of
	// finding a trader.
	caravanBaseChance = 0.05
	// caravanMinProsperityShare is how much of a town's prosperity is needed
	// before merchants bother. Reputation is the whole point of this event: the
	// logistics system already dispatches on surplus and demand, so what this
	// adds is a town that draws trade it did not have a surplus for.
	caravanMinProsperityShare = 0.35
	// caravanTrafficShare is how much of the road's cap this event will use,
	// leaving the rest for the logistics system's own caravans.
	caravanTrafficShare = 0.5
	// caravanLoadShare is the share of a town's surplus loaded onto one caravan.
	caravanLoadShare = 0.35
)

type caravan struct{}

func (caravan) Type() EventType { return MerchantCaravan }

// Subjects are towns with a connected road that has room on it.
func (caravan) Subjects(v *sim.View) []int {
	c := v.Cfg.Logistic
	cap := cfgOr(c.MaxCaravansPerRoute, 5)
	var out []int
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.IsBesieged || t.Blockade >= 1 {
			continue
		}
		if caravanDestination(v, t, cap) < 0 {
			continue
		}
		out = append(out, t.ID)
	}
	return out
}

// Trigger rises with the town's prosperity and with the safety of the roads out
// of it. A merchant's day is a bad road, not a hungry town.
func (caravan) Trigger(v *sim.View, subject int) float64 {
	t := v.State.Towns[subject]
	if t == nil {
		return 0
	}
	c := v.Cfg.Logistic
	cap := cfgOr(c.MaxCaravansPerRoute, 5)
	dest := caravanDestination(v, t, cap)
	if dest < 0 {
		return 0
	}
	route := caravanRoute(v, t, dest)
	if route == nil {
		return 0
	}
	prosperity := shared.Clamp01(t.Prosperity)
	if prosperity < caravanMinProsperityShare {
		return 0
	}
	chance := caravanBaseChance * (prosperity / caravanMinProsperityShare)
	chance *= 0.25 + 0.75*shared.Clamp01(route.Safety)
	chance *= 0.25 + 0.75*shared.Clamp01(t.RoadSafety)
	return shared.Clamp01(chance)
}

func (caravan) New(v *sim.View, subject, day int) *Event {
	return &Event{
		Type:         MerchantCaravan,
		SettlementID: subject,
		Day:          day,
		// The caravan is dispatched and is a party from this moment; the march
		// and logistics systems own it from here, so the event itself is done
		// the day it starts.
		Data: map[string]float64{
			keyGoods:    0,
			keyDaysLeft: 1,
		},
	}
}

func (caravan) Apply(v *sim.View, w *sim.WriteSet, e *Event) {
	tid := e.SettlementID
	t := v.State.Towns[tid]
	if t == nil {
		return
	}
	c := v.Cfg.Logistic
	cap := cfgOr(c.MaxCaravansPerRoute, 5)
	dest := caravanDestination(v, t, cap)
	if dest < 0 {
		return
	}
	target := v.State.Towns[dest]
	route := caravanRoute(v, t, dest)

	// The load is the price gap between the two towns, taken as far as one
	// caravan can carry and as far as the origin can spare without going under
	// the buffer it keeps for itself.
	buffer := t.FoodDemand * cfgOr(v.Cfg.Market.StockTargetDays, 32) * 0.5
	spare := t.FoodStock - buffer
	gap := target.FoodStock - target.FoodDemand*cfgOr(v.Cfg.Market.StockTargetDays, 32)*0.5 + buffer
	amount := math.Min(spare, gap) * caravanLoadShare
	if capacity := cfgOr(c.CaravanCapacity, 2600); amount > capacity {
		amount = capacity
	}
	if amount <= 0 {
		return
	}
	e.Data[keyGoods] = amount

	guards := cfgOr(c.CaravanGuards, 14)
	food := cfgOr(c.CaravanFoodNeed, 1) * cfgOr(c.CaravanFoodDays, 3)
	read := shared.ReadString(
		shared.PairF("food_stock", t.FoodStock),
		shared.Pair("prosperity", t.Prosperity),
		shared.Pair("road_safety", t.RoadSafety))
	causes := v.Log.RecentFor(model.KindTown, tid, []string{"food_stock", "prosperity", "road_safety"}, 3)

	// The goods leave the town now and arrive whenever the march system gets
	// the caravan there. food_stock is added to by five systems already and
	// this is one more of them, which is the same shape as a logistics
	// dispatch.
	w.Add(model.KindTown, tid, "food_stock", -amount, read, causes, "goods sold to a passing trader")

	medicine := amount * cfgOr(c.MedicineShare, 0.2)
	metal := amount * cfgOr(c.MetalShare, 0.3)
	w.SpawnParty(&model.Party{
		Name:          "Trader from " + t.Name,
		SideID:        t.HolderSide,
		RulerID:       -1,
		X:             t.X,
		Y:             t.Y,
		HomeTown:      t.ID,
		DestTown:      target.ID,
		DestTownParty: -1,
		Troops:        guards,
		Food:          food,
		IsCaravan:     true,
		Activity:      model.ActTrading,
		Morale:        0.8,
		Distance:      routeDistance(v, route),
		CargoFood:     amount - medicine - metal,
		CargoMedicine: medicine,
		CargoMetal:    metal,
	})
	if route != nil {
		w.Add(model.KindRoute, route.ID, "route_traffic", 1,
			read, causes, "trader on the road")
	}
}

// Resolve does nothing: the caravan is a party now, and where it goes and when
// it arrives is the march system's business.
func (caravan) Resolve(v *sim.View, w *sim.WriteSet, e *Event) {}

// caravanDestination is the town a trader from t would head for: the nearest
// connected town whose road has room left. -1 when there is nowhere to trade.
func caravanDestination(v *sim.View, t *model.Town, cap float64) int {
	best, bestDist := -1, 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil || r.Blocked || r.Traffic >= cap*caravanTrafficShare {
			continue
		}
		other := -1
		switch {
		case r.TownA == t.ID:
			other = r.TownB
		case r.TownB == t.ID:
			other = r.TownA
		default:
			continue
		}
		// Trade runs between towns that want different things. A trader who
		// loads up with grain and drives to a town that already has grain has
		// wasted the trip.
		dest := v.State.Towns[other]
		if dest == nil || dest.IsBesieged || dest.Blockade >= 1 {
			continue
		}
		if dest.FoodStock >= t.FoodStock {
			continue
		}
		if best < 0 || r.Length < bestDist {
			best, bestDist = other, r.Length
		}
	}
	return best
}

// caravanRoute is the road between two towns, or nil if they share none.
func caravanRoute(v *sim.View, a *model.Town, b int) *model.Route {
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil {
			continue
		}
		if (r.TownA == a.ID && r.TownB == b) || (r.TownB == a.ID && r.TownA == b) {
			return r
		}
	}
	return nil
}

func routeDistance(v *sim.View, r *model.Route) float64 {
	if r == nil {
		return 0
	}
	return r.Length
}

// --- Task 478: refugee group ---

// Refugee group tuning.
const (
	// refugeeBaseChance is a town at full surrounding distress and none of its
	// own.
	refugeeBaseChance = 0.09
	// refugeeDistressUnrest, refugeeDistressStarving and refugeeDistressBesieged
	// weigh the three ways a place drives its people out.
	refugeeDistressUnrest   = 0.4
	refugeeDistressStarving = 0.35
	refugeeDistressBesieged = 0.6
	// refugeeRefugeesMax is the largest group one day brings in.
	refugeeRefugeesMax = 220
	// refugeePerDistress is how many people per unit of surrounding distress.
	refugeePerDistress = 400
	// refugeeSanitationPerHead is the hygiene cost of each arrival. Refuse
	// arrives with nowhere to wash: this is the field that carries the refugees
	// into the disease system.
	refugeeSanitationPerHead = 0.004
	// refugeeMilitiaShare is the share of arrivals who are armed and are put to
	// the town's defence rather than its fields.
	refugeeMilitiaShare = 0.06
)

type refugee struct{}

func (refugee) Type() EventType { return RefugeeGroup }

// Subjects are towns that are not themselves collapsing. People do not flee into
// a burning city.
func (refugee) Subjects(v *sim.View) []int {
	var out []int
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil || t.IsBesieged {
			continue
		}
		out = append(out, t.ID)
	}
	return out
}

// Trigger is the distress around a town, discounted by the distress inside it.
// A town with a starving, rioting neighbour gets people coming; the same town
// with its own problems gets people leaving, which is the migration system's
// job and not this one's.
func (refugee) Trigger(v *sim.View, subject int) float64 {
	t := v.State.Towns[subject]
	if t == nil {
		return 0
	}
	own := townDistress(t)
	if own > 0.9 {
		return 0
	}
	around := neighbourDistress(v, t)
	if around <= 0 {
		return 0
	}
	return shared.Clamp01(refugeeBaseChance * around * (1 - own))
}

func (refugee) New(v *sim.View, subject, day int) *Event {
	t := v.State.Towns[subject]
	distress := neighbourDistress(v, t)
	count := refugeePerDistress * distress
	// The migration system already bounds inward movement at a share of the
	// destination's population per day. A refugee wave is inward movement, so
	// it is bounded the same way: otherwise a famine next door would empty
	// itself into one town in a single day.
	if cap := t.Population * v.Cfg.Migrate.ImmigrantsPerDayCap; cap > 0 && count > cap {
		count = cap
	}
	if count > refugeeRefugeesMax {
		count = refugeeRefugeesMax
	}
	if count < 1 {
		count = 1
	}
	return &Event{
		Type:         RefugeeGroup,
		SettlementID: subject,
		Day:          day,
		// A group arrives and is absorbed the same day; there is no second
		// phase to a group of people on the road.
		Data: map[string]float64{
			keyRefugees: math.Round(count),
			keyArmed:    0,
			keyDaysLeft: 1,
		},
	}
}

func (refugee) Apply(v *sim.View, w *sim.WriteSet, e *Event) {
	tid := e.SettlementID
	t := v.State.Towns[tid]
	if t == nil {
		return
	}
	heads := e.Data[keyRefugees]
	if heads <= 0 {
		return
	}
	read := shared.ReadString(
		shared.Pair("unrest", t.Unrest),
		shared.PairB("is_starving", t.IsStarving),
		shared.PairB("is_besieged", t.IsBesieged),
		shared.PairF("population", t.Population))
	causes := v.Log.RecentFor(model.KindTown, tid, []string{"unrest", "population", "crowding"}, 3)

	// Population itself belongs to the demography system, which alone writes it
	// from births, deaths and net migration. Staging net_migration is how a
	// refugee group becomes people, and it is why food demand rises without
	// this system touching food demand: the food system derives demand from
	// population every day, so arrivals show up as demand on their own.
	w.Add(model.KindTown, tid, "net_migration", heads, read, causes, "refugees arriving")

	// They arrive with no housing and no water, which is what actually makes a
	// refugee wave dangerous: sanitation is what the disease system reads, so
	// this is the honest cost rather than a flat unrest penalty.
	if loss := heads * refugeeSanitationPerHead; loss > 0 {
		w.Add(model.KindTown, tid, "sanitation", -loss,
			read, causes, "refugees with nowhere to wash")
	}

	// A few of them are armed and are useful: this is a war's effect on a
	// neighbour's defences, and it is why a war is felt in towns it never
	// reaches.
	if militia := math.Round(heads * refugeeMilitiaShare); militia > 0 {
		w.Add(model.KindTown, tid, "militia", militia,
			read, causes, "armed refugees pressed into the militia")
		e.Data[keyArmed] = militia
	}
}

// Resolve does nothing: from the moment net_migration is staged the demography
// system owns these people, and the town is feeding them through the ordinary
// food system from the next tick.
func (refugee) Resolve(v *sim.View, w *sim.WriteSet, e *Event) {}

// townDistress is how badly a town is driving its own people out, in [0,1].
func townDistress(t *model.Town) float64 {
	d := 0.0
	if v := shared.Clamp01(t.Unrest) * refugeeDistressUnrest; v > d {
		d = v
	}
	if t.IsStarving {
		if v := refugeeDistressStarving; v > d {
			d = v
		}
	}
	if t.IsBesieged {
		d += refugeeDistressBesieged
	}
	return shared.Clamp01(d)
}

// neighbourDistress is the worst distress among the towns sharing a road with t,
// ignoring t itself.
func neighbourDistress(v *sim.View, t *model.Town) float64 {
	worst := 0.0
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil {
			continue
		}
		var other int
		switch {
		case r.TownA == t.ID:
			other = r.TownB
		case r.TownB == t.ID:
			other = r.TownA
		default:
			continue
		}
		n := v.State.Towns[other]
		if n == nil {
			continue
		}
		if d := townDistress(n); d > worst {
			worst = d
		}
	}
	return worst
}

// --- Task 479: deserters ---

// Deserter tuning.
const (
	// deserterBaseChance is the chance that a broken army sheds a body of men
	// today, at full severity.
	deserterBaseChance = 0.35
	// deserterMoraleFallback is the morale below which troops start to leave,
	// used when the upkeep config does not say.
	deserterMoraleFallback = 0.28
	// deserterEventMultiple is how much bigger a day's desertion is on a day the
	// Deserters event fires than the upkeep system's background trickle of the
	// same cause. The two together are the total desertion rate: upkeep takes
	// the steady one-a-day attrition an unhappy army always suffers, and this
	// event is the day it becomes a body of men walking off. Without a multiple
	// the event would be indistinguishable from the trickle in the state, and
	// the split between bandits and settlers is not worth an event log for two
	// men.
	deserterEventMultiple = 4.0
	// deserterMilitiaShare is the share of settled deserters who are armed and
	// are put to the nearest town's defence rather than its fields.
	deserterMilitiaShare = 0.06
)

type deserter struct{}

func (deserter) Type() EventType { return Deserters }

// Subjects are the field armies whose morale has broken.
//
// Raider parties are excluded, and not only because a bandit is not an army: the
// bandit system writes a raider party's troops absolutely when it disbands an
// idle band or destroys a camp, and this system needs to write troops as a
// delta. Keeping the two apart is what lets both write the same field without
// the engine's order dependence coming into it.
func (deserter) Subjects(v *sim.View) []int {
	threshold := cfgOr(v.Cfg.Upkeep.DesertionMoraleThreshold, deserterMoraleFallback)
	var out []int
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.IsRaider || p.Troops <= 0 {
			continue
		}
		if p.Morale >= threshold {
			continue
		}
		out = append(out, p.ID)
	}
	return out
}

// Trigger rises as morale falls below the threshold the upkeep system already
// uses, and as the army grows: a bigger broken army has more men to lose. The
// upkeep system trickles troops away every day regardless; this is the day it
// becomes visible.
func (deserter) Trigger(v *sim.View, subject int) float64 {
	p := v.State.Parties[subject]
	if p == nil || p.Troops <= 0 {
		return 0
	}
	threshold := cfgOr(v.Cfg.Upkeep.DesertionMoraleThreshold, deserterMoraleFallback)
	severity := shared.Clamp01((threshold - p.Morale) / threshold)
	if severity <= 0 {
		return 0
	}
	return shared.Clamp01(deserterBaseChance * severity)
}

func (deserter) New(v *sim.View, subject, day int) *Event {
	return &Event{
		Type:         Deserters,
		SettlementID: subject,
		Day:          day,
		// The men leave today. There is no second phase.
		Data: map[string]float64{
			keyDeserted:  0,
			keyToBandits: 0,
			keyDaysLeft:  1,
		},
	}
}

func (deserter) Apply(v *sim.View, w *sim.WriteSet, e *Event) {
	pid := e.SettlementID
	p := v.State.Parties[pid]
	if p == nil || p.Troops <= 0 {
		return
	}
	c := v.Cfg.Upkeep
	threshold := cfgOr(c.DesertionMoraleThreshold, deserterMoraleFallback)
	severity := shared.Clamp01((threshold - p.Morale) / threshold)
	if severity <= 0 {
		return
	}

	// How many leave is the upkeep system's own rate, so the two cannot drift
	// apart: upkeep trickles, this makes the trickle a body of men at once.
	leave := p.Troops * cfgOr(c.DesertionRate, 0.045) * severity * deserterEventMultiple
	if cap := p.Troops * cfgOr(c.DesertionMaxShare, 0.02) * deserterEventMultiple; leave > cap {
		leave = cap
	}
	leave = math.Min(leave, p.Troops)
	if leave <= 0 {
		return
	}
	leave = math.Round(leave)

	read := shared.ReadString(
		shared.Pair("morale", p.Morale),
		shared.PairF("troops", p.Troops),
		shared.PairB("is_starving", p.IsStarving))
	causes := v.Log.RecentFor(model.KindParty, pid, []string{"morale", "party_money", "wages_owed"}, 3)

	w.Add(model.KindParty, pid, "troops", -leave, read, causes, "desertion")
	if p.RulerID >= 0 {
		w.Add(model.KindRuler, p.RulerID, "influence", -cfgOr(c.DesertionInfluenceLoss, 0.02)*leave,
			read, causes, "troops deserted")
	}
	e.Data[keyDeserted] = leave

	// Where they go is the security config's deserter share, which is what that
	// constant has always been for.
	toBandits := leave * shared.Clamp01(cfgOr(v.Cfg.Security.DeserterShare, 0.4))
	e.Data[keyToBandits] = toBandits

	nearest := nearestTownID(v, p.X, p.Y)
	// The ones who join the bandits make the country around here worse: the
	// pressure on the nearest town and the raiders on the road out of it are
	// exactly how the security system measures a growing band, so this needs no
	// field of its own to be believed.
	if toBandits > 0 && nearest >= 0 {
		w.Add(model.KindTown, nearest, "raider_pressure", toBandits*0.01,
			shared.ReadString(shared.PairF("deserted", toBandits), shared.Pair("morale", p.Morale)),
			v.Log.RecentFor(model.KindTown, nearest, []string{"raider_pressure"}, 2),
			"deserters turned to raiding")
		if r := nearestRoute(v, nearest); r != nil {
			w.Add(model.KindRoute, r.ID, "route_raiders", toBandits*0.004,
				shared.ReadString(shared.PairF("deserted", toBandits)),
				v.Log.RecentFor(model.KindRoute, r.ID, []string{"route_raiders"}, 2),
				"deserters turned to raiding")
		}
	}

	// The ones who do not go to the bandits take shelter in the nearest town,
	// where the demography system turns them into population and this system's
	// refugee logic turns the armed ones into militia.
	settle := leave - toBandits
	if settle > 0 && nearest >= 0 {
		settle = math.Round(settle)
		w.Add(model.KindTown, nearest, "net_migration", settle,
			shared.ReadString(shared.PairF("settled", settle)),
			v.Log.RecentFor(model.KindTown, nearest, []string{"population"}, 2),
			"deserters settling")
		if armed := math.Round(settle * deserterMilitiaShare); armed > 0 {
			w.Add(model.KindTown, nearest, "militia", armed,
				shared.ReadString(shared.PairF("settled", armed)), nil,
				"deserters pressed into the militia")
		}
	}

	// An army left with too few men to be one dissolves, which is the upkeep
	// system's rule and is worth applying here too: a party of four is a
	// desertion away from not existing.
	if min := cfgOr(c.MinTroopsToPersist, 6); p.Troops-leave < min {
		w.DeleteEntity(model.KindParty, pid)
	}
}

// Resolve does nothing: the men are gone, and both destinations have been told.
func (deserter) Resolve(v *sim.View, w *sim.WriteSet, e *Event) {}

// --- Task 480: weather event (storm) ---

// Storm tuning.
const (
	// stormBaseChance is a town's daily chance of a storm at the season's peak.
	stormBaseChance = 0.012
	// stormSeasonal is how much worse the worst season is than the best. The
	// same season boundaries the march system uses, so winter is hard for
	// everybody at once.
	stormSeasonal = 1.0
	// stormMinDays and stormDaysRange are how long a storm runs.
	stormMinDays   = 1
	stormDaysRange = 3
	// stormReachLeagues is how far the weather reaches from the town it broke
	// over.
	stormReachLeagues = 60.0
	// stormSanitationLoss is the hygiene damage at full severity. The food
	// system reads sanitation into its production health factor, so this is how
	// a storm reaches the harvest: mud, flooded wells and spoiled stores. It
	// does not write food_production, which food owns outright.
	stormSanitationLoss = 0.05
	// stormSpoilageShare is the share of a town's food the storm ruins.
	stormSpoilageShare = 0.02
	// stormFatigue is the fatigue at full severity for a column caught out.
	// The march system reads fatigue straight back into speed, so this is the
	// storm costing a column its day's march.
	stormFatigue = 0.12
)

type storm struct{}

func (storm) Type() EventType { return WeatherStorm }

// Subjects are every town: weather does not need a reason to happen somewhere.
func (storm) Subjects(v *sim.View) []int {
	var out []int
	for _, tid := range v.State.TownIDs() {
		if v.State.Towns[tid] == nil {
			continue
		}
		out = append(out, tid)
	}
	return out
}

// Trigger is a small daily chance, higher in the seasons that have weather.
// This is the scripted event the config's weather_swing comment explicitly is
// not: a swing is a random nudge to every column's speed, while a storm is a
// thing that happens to a place and lasts days.
func (storm) Trigger(v *sim.View, subject int) float64 {
	t := v.State.Towns[subject]
	if t == nil {
		return 0
	}
	return shared.Clamp01(stormBaseChance * seasonSeverity(v.Day))
}

// New gives the storm a severity and a length. Both are rolled here, once, so
// that every day of the same storm is the same storm: a severity redrawn each
// morning would be three unrelated weathers sharing a name.
func (storm) New(v *sim.View, subject, day int) *Event {
	rng := v.Rng.Derive(fmt.Sprintf("events.storm.%d", subject))
	severity := 0.35 + rng.Float64()*0.65
	days := float64(stormMinDays + rng.Intn(stormDaysRange))
	return &Event{
		Type:         WeatherStorm,
		SettlementID: subject,
		Day:          day,
		Data: map[string]float64{
			keySeverity: severity,
			keyDaysLeft: days,
		},
	}
}

func (storm) Apply(v *sim.View, w *sim.WriteSet, e *Event) {
	tid := e.SettlementID
	t := v.State.Towns[tid]
	if t == nil {
		return
	}
	severity := shared.Clamp01(e.Data[keySeverity])
	read := shared.ReadString(
		shared.Pair("severity", severity),
		shared.Pair("season", seasonSeverity(v.Day)),
		shared.PairF("food_stock", t.FoodStock))
	causes := v.Log.RecentFor(model.KindTown, tid, []string{"food_stock", "food_production"}, 2)

	if loss := severity * stormSanitationLoss; loss > 0 {
		w.Add(model.KindTown, tid, "sanitation", -loss,
			read, causes, "storm damage")
	}
	// Food the storm ruins is recorded against lost_food_total rather than
	// taken out of the stock directly, so the loss is counted once and shows up
	// as a total the town carries rather than as an unexplained gap.
	if spoil := t.FoodStock * severity * stormSpoilageShare; spoil > 0 {
		w.Add(model.KindTown, tid, "lost_food_total", spoil,
			read, causes, "food spoiled by the storm")
	}

	// Travel. A column caught out walks through it and is worn down by it: the
	// march system turns fatigue into a slower column, so this is where the
	// storm costs distance. speed is not written here because the march system
	// owns it outright and already draws its own daily weather.
	for _, pid := range v.State.PartyIDs() {
		p := v.State.Parties[pid]
		if p == nil || p.Troops <= 0 {
			continue
		}
		if p.Activity != model.ActMarching && p.Activity != model.ActTrading && p.Activity != model.ActRaiding {
			continue
		}
		if v.State.DistanceTo(p, tid) > stormReachLeagues {
			continue
		}
		w.Add(model.KindParty, pid, "fatigue", severity*stormFatigue,
			shared.ReadString(shared.Pair("severity", severity), shared.Pair("fatigue", p.Fatigue)),
			v.Log.RecentFor(model.KindParty, pid, []string{"fatigue", "speed"}, 2),
			"fighting through the storm")
	}
}

// Resolve is the storm clearing. The rain stops and the streets dry, so the
// sanitation damage of the last day is partly recovered: the town is left
// dirtier than before the storm and no worse than during it.
func (storm) Resolve(v *sim.View, w *sim.WriteSet, e *Event) {
	tid := e.SettlementID
	t := v.State.Towns[tid]
	if t == nil {
		return
	}
	severity := shared.Clamp01(e.Data[keySeverity])
	recovery := severity * stormSanitationLoss * 0.4
	if recovery <= 0 {
		return
	}
	w.Add(model.KindTown, tid, "sanitation", recovery,
		shared.ReadString(shared.Pair("severity", severity), shared.Pair("sanitation", t.Sanitation)),
		v.Log.RecentFor(model.KindTown, tid, []string{"sanitation"}, 2),
		"weather clearing")
}

// seasonSeverity is how much worse the weather is in the worst season, using
// the same season boundaries as the march system so that winter is hard for
// everybody at once.
func seasonSeverity(day int) float64 {
	switch {
	case day < 60 || day >= 330:
		return 1 + stormSeasonal
	case day < 150, day < 240:
		return 1
	default:
		return 1 + stormSeasonal*0.5
	}
}

// routeMidpoint is the middle of a road, worked out through the two towns it
// joins, because a route carries no position of its own.
func routeMidpoint(v *sim.View, r *model.Route) (float64, float64) {
	a := v.State.Towns[r.TownA]
	b := v.State.Towns[r.TownB]
	switch {
	case a == nil && b == nil:
		return 0, 0
	case a == nil:
		return b.X, b.Y
	case b == nil:
		return a.X, a.Y
	}
	return (a.X + b.X) / 2, (a.Y + b.Y) / 2
}

// nearestTownID is the id of the town closest to a point, or -1 if the state has
// no towns at all.
func nearestTownID(v *sim.View, x, y float64) int {
	best, bestDist := -1, 0.0
	for _, tid := range v.State.TownIDs() {
		t := v.State.Towns[tid]
		if t == nil {
			continue
		}
		d := (t.X-x)*(t.X-x) + (t.Y-y)*(t.Y-y)
		if best < 0 || d < bestDist {
			best, bestDist = tid, d
		}
	}
	return best
}

// nearestRoute is any road touching a town, or nil. Used where a town has only
// one road to blame and which of them does not matter.
func nearestRoute(v *sim.View, tid int) *model.Route {
	for _, rid := range v.State.RouteIDs() {
		r := v.State.Routes[rid]
		if r == nil {
			continue
		}
		if r.TownA == tid || r.TownB == tid {
			return r
		}
	}
	return nil
}
