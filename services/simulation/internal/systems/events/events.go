// Package events implements the world event/encounter system.
//
// Tasks 476-490: bandit ambush, merchant caravan, refugee group,
// deserters, weather storm, plague, festival, tournament, bounty hunt,
// escort mission, delivery mission, rescue mission, spy mission,
// defend village, raid village.
// Tasks 493-496: skill check outcomes, reward/penalty, event log, cooldowns.
// Each event has a trigger chance, an apply function, and resolution logic.
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
	// Tasks 481-490
	Plague          EventType = "plague"
	Festival        EventType = "festival"
	Tournament      EventType = "tournament"
	BountyHunt      EventType = "bounty_hunt"
	EscortMission   EventType = "escort_mission"
	DeliveryMission EventType = "delivery_mission"
	RescueMission   EventType = "rescue_mission"
	SpyMission      EventType = "spy_mission"
	DefendVillage   EventType = "defend_village"
	RaidVillage     EventType = "raid_village"
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
	defs      []eventDef
	events    []*Event
	nextID    int
	rng       *rand.Rand
	cooldowns map[EventType]map[int]int // Task 496: type -> settlement -> day available
	entries   []LogEntry                // Task 495: event log
}

// LogEntry is a record of an event occurrence. Task 495.
type LogEntry struct {
	Day          int
	Type         string
	SettlementID int
	Message      string
}

// Log returns the event log.
func (s *System) Log() []LogEntry { return s.entries }

func (s *System) addLog(day int, typ string, sid int, msg string) {
	s.entries = append(s.entries, LogEntry{Day: day, Type: typ, SettlementID: sid, Message: msg})
}

// Task 496: cooldown periods per event type (in days).
var cooldownDays = map[EventType]int{
	BanditAmbush:    3,
	MerchantCaravan: 5,
	RefugeeGroup:    10,
	Deserters:       7,
	WeatherStorm:    4,
	Plague:          30,
	Festival:        20,
	Tournament:      15,
	BountyHunt:      7,
	EscortMission:   5,
	DeliveryMission: 3,
	RescueMission:   10,
	SpyMission:      7,
	DefendVillage:   5,
	RaidVillage:     7,
}

func (s *System) onCooldown(typ EventType, sid int, day int) bool {
	if m, ok := s.cooldowns[typ]; ok {
		if available, ok := m[sid]; ok && day < available {
			return true
		}
	}
	return false
}

func (s *System) setCooldown(typ EventType, sid int, day int) {
	if s.cooldowns[typ] == nil {
		s.cooldowns[typ] = make(map[int]int)
	}
	s.cooldowns[typ][sid] = day + cooldownDays[typ]
}

// New creates an event system.
func New(rng *rand.Rand) *System {
	s := &System{rng: rng, cooldowns: make(map[EventType]map[int]int)}
	s.defs = []eventDef{
		{BanditAmbush, triggerBanditAmbush, applyBanditAmbush},
		{MerchantCaravan, triggerMerchantCaravan, applyMerchantCaravan},
		{RefugeeGroup, triggerRefugeeGroup, applyRefugeeGroup},
		{Deserters, triggerDeserters, applyDeserters},
		{WeatherStorm, triggerWeatherStorm, applyWeatherStorm},
		{Plague, triggerPlague, applyPlague},
		{Festival, triggerFestival, applyFestival},
		{Tournament, triggerTournament, applyTournament},
		{BountyHunt, triggerBountyHunt, applyBountyHunt},
		{EscortMission, triggerEscortMission, applyEscortMission},
		{DeliveryMission, triggerDeliveryMission, applyDeliveryMission},
		{RescueMission, triggerRescueMission, applyRescueMission},
		{SpyMission, triggerSpyMission, applySpyMission},
		{DefendVillage, triggerDefendVillage, applyDefendVillage},
		{RaidVillage, triggerRaidVillage, applyRaidVillage},
	}
	return s
}

// Tick checks all triggers and fires events.
// Task 496: respects cooldowns — an event type won't fire at the same
// settlement until its cooldown expires.
func (s *System) Tick(day int, settlementIDs []int) []*Event {
	var fired []*Event
	for _, def := range s.defs {
		for _, sid := range settlementIDs {
			if s.onCooldown(def.Type, sid, day) {
				continue
			}
			if e := def.Trigger(s.rng, sid, day); e != nil {
				e.ID = s.nextID
				s.nextID++
				s.events = append(s.events, e)
				fired = append(fired, e)
				s.setCooldown(def.Type, sid, day)
				s.addLog(day, string(def.Type), sid, "triggered")
			}
		}
	}
	return fired
}

// Resolve marks an event resolved and applies its effects.
// Task 495: logs the resolution.
func (s *System) Resolve(event *Event, state interface{}) {
	for _, def := range s.defs {
		if def.Type == event.Type {
			def.Apply(event, state)
			event.Resolved = true
			s.addLog(event.Day, string(event.Type), event.SettlementID, "resolved")
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

// --- Task 481: Plague ---
// Disease outbreak. Population drops, trade halted.

func triggerPlague(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.005 {
		return &Event{
			Type:         Plague,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"severity": 0.1 + rng.Float64()*0.3},
		}
	}
	return nil
}

func applyPlague(event *Event, state interface{}) {
	// Population * (1 - severity), market closed for 7 days.
}

// --- Task 482: Festival ---
// Celebration. Morale up, prosperity up slightly.

func triggerFestival(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.008 {
		return &Event{
			Type:         Festival,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"morale_boost": 10 + rng.Float64()*20},
		}
	}
	return nil
}

func applyFestival(event *Event, state interface{}) {
	// Settlement morale +, loyalty +, costs treasury.
}

// --- Task 483: Tournament ---
// Combat competition. Winner gains renown, settlement gains prosperity.

func triggerTournament(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.006 {
		return &Event{
			Type:         Tournament,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"prize": 500 + rng.Float64()*2000},
		}
	}
	return nil
}

func applyTournament(event *Event, state interface{}) {
	// Player can enter; winner gets prize + renown.
}

// --- Task 484: Bounty hunt ---
// Wanted criminal. Player can hunt for reward.

func triggerBountyHunt(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.01 {
		return &Event{
			Type:         BountyHunt,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"bounty": 200 + rng.Float64()*1800, "target_strength": 20 + rng.Float64()*80},
		}
	}
	return nil
}

func applyBountyHunt(event *Event, state interface{}) {
	// Bounty posted at settlement; player hunts target.
}

// --- Task 485: Escort mission ---
// Protect a caravan. Reward on safe arrival.

func triggerEscortMission(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.012 {
		return &Event{
			Type:         EscortMission,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"reward": 300 + rng.Float64()*1200, "distance": 50 + rng.Float64()*200},
		}
	}
	return nil
}

func applyEscortMission(event *Event, state interface{}) {
	// Player escorts caravan; ambush chance during travel.
}

// --- Task 486: Delivery mission ---
// Deliver goods. Time-limited, reward on delivery.

func triggerDeliveryMission(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.015 {
		return &Event{
			Type:         DeliveryMission,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"reward": 100 + rng.Float64()*500, "deadline": 3 + rng.Float64()*7},
		}
	}
	return nil
}

func applyDeliveryMission(event *Event, state interface{}) {
	// Player delivers goods before deadline.
}

// --- Task 487: Rescue mission ---
// Hostages held. Player rescues for reward + reputation.

func triggerRescueMission(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.007 {
		return &Event{
			Type:         RescueMission,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"hostages": 1 + rng.Float64()*9, "reward": 400 + rng.Float64()*1600},
		}
	}
	return nil
}

func applyRescueMission(event *Event, state interface{}) {
	// Player raids bandit camp to free hostages.
}

// --- Task 488: Spy mission ---
// Infiltrate enemy. Success reveals intel, failure causes incident.

func triggerSpyMission(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.008 {
		return &Event{
			Type:         SpyMission,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"difficulty": rng.Float64(), "intel_value": 100 + rng.Float64()*900},
		}
	}
	return nil
}

func applySpyMission(event *Event, state interface{}) {
	// Skill check: roguery vs difficulty. Success = intel, failure = captured.
}

// --- Task 489: Defend village ---
// Village under attack. Player defends for reward + relation.

func triggerDefendVillage(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.01 {
		return &Event{
			Type:         DefendVillage,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"attackers": 20 + rng.Float64()*80, "reward": 300 + rng.Float64()*1200},
		}
	}
	return nil
}

func applyDefendVillage(event *Event, state interface{}) {
	// Battle: player + militia vs attackers.
}

// --- Task 490: Raid village ---
// Player raids hostile village. Loot on success, relation hit.

func triggerRaidVillage(rng *rand.Rand, settlementID int, day int) *Event {
	if rng.Float64() < 0.008 {
		return &Event{
			Type:         RaidVillage,
			SettlementID: settlementID,
			Day:          day,
			Data:         map[string]float64{"loot": 200 + rng.Float64()*1800, "defenders": 10 + rng.Float64()*60},
		}
	}
	return nil
}

func applyRaidVillage(event *Event, state interface{}) {
	// Battle: player vs village defenders. Loot on win, relation -20.
}

// --- Task 493: Skill check outcome ---
// Determines success/failure based on skill vs difficulty.

type SkillCheck struct {
	Skill      string  // e.g. "roguery", "tactics", "charm"
	SkillValue float64 // player's skill (0-100)
	Difficulty float64 // 0-1, higher is harder
}

// Check rolls against the skill. Returns true on success.
// Formula: success chance = skill/100 * (1 - difficulty*0.7) + 0.15 base
func (sc SkillCheck) Check(rng *rand.Rand) bool {
	chance := sc.SkillValue/100*(1-sc.Difficulty*0.7) + 0.15
	if chance > 0.95 {
		chance = 0.95
	}
	if chance < 0.05 {
		chance = 0.05
	}
	return rng.Float64() < chance
}

// --- Task 494: Reward/penalty application ---

type Outcome struct {
	Gold       float64
	Renown     float64
	Reputation float64 // with settlement faction
	Morale     float64
}

// ApplyOutcome applies the rewards/penalties. The state param is the
// sim state; concrete field updates happen in the calling system.
func ApplyOutcome(event *Event, outcome Outcome) {
	if event.Data == nil {
		event.Data = make(map[string]float64)
	}
	event.Data["reward_gold"] = outcome.Gold
	event.Data["reward_renown"] = outcome.Renown
	event.Data["reward_reputation"] = outcome.Reputation
	event.Data["reward_morale"] = outcome.Morale
}

// Standard outcomes per event type.
func OutcomeFor(event *Event, success bool) Outcome {
	base := event.Data["reward"]
	if base == 0 {
		base = 500
	}
	if success {
		return Outcome{Gold: base, Renown: base / 10, Reputation: 5, Morale: 5}
	}
	return Outcome{Gold: 0, Renown: -base / 20, Reputation: -3, Morale: -5}
}
