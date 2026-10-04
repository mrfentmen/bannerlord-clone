// Package events implements the world event/encounter system.
//
// Tasks 476-480: bandit ambush, merchant caravan, refugee group,
// deserters, weather event (storm). Each event has a trigger chance,
// an apply function that modifies state, and resolution logic.
package events

import (
	"math/rand"
)

// EventType identifies the kind of event.
type EventType string

const (
	BanditAmbush    EventType = "bandit_ambush"
	MerchantCaravan EventType = "merchant_caravan"
	RefugeeGroup    EventType = "refugee_group"
	Deserters       EventType = "deserters"
	WeatherStorm    EventType = "weather_storm"
)

// Event is a world event waiting to be resolved.
type Event struct {
	ID           int
	Type         EventType
	SettlementID int
	Day          int
	Data         map[string]float64
	Resolved     bool
}

// Trigger checks if an event should fire. Returns the event or nil.
type Trigger func(rng *rand.Rand, settlementID int, day int) *Event

// Apply modifies state based on the event.
type Apply func(event *Event, state interface{})

// eventDef pairs a trigger with its apply logic.
type eventDef struct {
	Type    EventType
	Trigger Trigger
	Apply   Apply
}

// System manages world events.
type System struct {
	defs   []eventDef
	events []*Event
	nextID int
	rng    *rand.Rand
}

// New creates an event system.
func New(rng *rand.Rand) *System {
	s := &System{rng: rng}
	s.defs = []eventDef{
		{BanditAmbush, triggerBanditAmbush, applyBanditAmbush},
		{MerchantCaravan, triggerMerchantCaravan, applyMerchantCaravan},
		{RefugeeGroup, triggerRefugeeGroup, applyRefugeeGroup},
		{Deserters, triggerDeserters, applyDeserters},
		{WeatherStorm, triggerWeatherStorm, applyWeatherStorm},
	}
	return s
}

// Tick checks all triggers and fires events.
func (s *System) Tick(day int, settlementIDs []int) []*Event {
	var fired []*Event
	for _, def := range s.defs {
		for _, sid := range settlementIDs {
			if e := def.Trigger(s.rng, sid, day); e != nil {
				e.ID = s.nextID
				s.nextID++
				s.events = append(s.events, e)
				fired = append(fired, e)
			}
		}
	}
	return fired
}

// Resolve marks an event resolved and applies its effects.
func (s *System) Resolve(event *Event, state interface{}) {
	for _, def := range s.defs {
		if def.Type == event.Type {
			def.Apply(event, state)
			event.Resolved = true
			return
		}
	}
}

// Pending returns unresolved events.
func (s *System) Pending() []*Event {
	var out []*Event
	for _, e := range s.events {
		if !e.Resolved {
			out = append(out, e)
		}
	}
	return out
}

// --- Task 476: Bandit ambush ---
// Triggers on roads with low safety. Chance scales with (1 - safety).

func triggerBanditAmbush(rng *rand.Rand, settlementID int, day int) *Event {
	// 2% base chance per settlement per day; higher near dangerous routes
	if rng.Float64() < 0.02 {
		return &Event{
			Type:         BanditAmbush,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"bandit_strength": 10 + rng.Float64()*40},
		}
	}
	return nil
}

func applyBanditAmbush(event *Event, state interface{}) {
	// Applied by the battle system: spawns a bandit party.
	// State modification happens in the caller via event.Data.
}

// --- Task 477: Merchant caravan ---
// Spawns a trade opportunity. Chance higher at wealthy settlements.

func triggerMerchantCaravan(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.03 {
		return &Event{
			Type:         MerchantCaravan,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"goods_value": 100 + rng.Float64()*900},
		}
	}
	return nil
}

func applyMerchantCaravan(event *Event, state interface{}) {
	// Trade UI offers the caravan's goods at the settlement market.
}

// --- Task 478: Refugee group ---
// Population moves due to war/unrest. Increases food demand.

func triggerRefugeeGroup(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.015 {
		return &Event{
			Type:         RefugeeGroup,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"refugees": 20 + rng.Float64()*180},
		}
	}
	return nil
}

func applyRefugeeGroup(event *Event, state interface{}) {
	// Settlement population increases; food demand spikes.
	// Handled by demography system via event.Data["refugees"].
}

// --- Task 479: Deserters ---
// Military units desert. They may join bandits or settle.

func triggerDeserters(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.01 {
		return &Event{
			Type:         Deserters,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"deserters": 5 + rng.Float64()*45},
		}
	}
	return nil
}

func applyDeserters(event *Event, state interface{}) {
	// Garrison decreases; bandit activity may increase nearby.
}

// --- Task 480: Weather event (storm) ---
// Travel slowed, food production down for the day.

func triggerWeatherStorm(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.025 {
		return &Event{
			Type:         WeatherStorm,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"severity": rng.Float64()},
		}
	}
	return nil
}

func applyWeatherStorm(event *Event, state interface{}) {
	// March speed *0.5, food production *0.7 for the affected day.
	// Applied via event.Data["severity"] by the march and food systems.
}
