package events

import (
	"math/rand"
	"testing"
)

func TestSystemTickFiresEvents(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	s := New(rng)
	total := 0
	for day := 1; day <= 100; day++ {
		total += len(s.Tick(day, []int{1, 2, 3, 4, 5}))
	}
	if total == 0 {
		t.Error("expected at least one event over 100 days")
	}
}

func TestAllEventTypes(t *testing.T) {
	rng := rand.New(rand.NewSource(123))
	s := New(rng)
	seen := make(map[EventType]bool)
	for day := 1; day <= 2000; day++ {
		for _, e := range s.Tick(day, []int{1, 2, 3}) {
			seen[e.Type] = true
		}
	}
	all := []EventType{
		BanditAmbush, MerchantCaravan, RefugeeGroup, Deserters, WeatherStorm,
		Plague, Festival, Tournament, BountyHunt, EscortMission,
		DeliveryMission, RescueMission, SpyMission, DefendVillage, RaidVillage,
	}
	for _, typ := range all {
		if !seen[typ] {
			t.Errorf("event type %s never fired over 2000 days", typ)
		}
	}
}

func TestResolve(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	s := New(rng)
	fired := s.Tick(1, []int{1})
	if len(fired) == 0 {
		t.Skip("no event fired")
	}
	e := fired[0]
	s.Resolve(e, nil)
	if !e.Resolved {
		t.Error("event should be marked resolved")
	}
	if len(s.Pending()) != len(fired)-1 {
		t.Error("pending count should decrease after resolve")
	}
}

// Task 496: cooldown prevents immediate refire at same settlement.
func TestCooldown(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	s := New(rng)
	// Fire many ticks on day 1 at settlement 1
	day1 := s.Tick(1, []int{1})
	if len(day1) == 0 {
		t.Skip("no event fired on day 1")
	}
	typ := day1[0].Type
	// Same type should not fire again at same settlement on day 2
	for _, e := range s.Tick(2, []int{1}) {
		if e.Type == typ {
			t.Errorf("event %s fired during cooldown", typ)
		}
	}
}

// Task 495: event log records triggers and resolutions.
func TestEventLog(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	s := New(rng)
	fired := s.Tick(1, []int{1, 2, 3})
	if len(fired) == 0 {
		t.Skip("no event fired")
	}
	if len(s.Log()) == 0 {
		t.Error("log should have entries after tick")
	}
	s.Resolve(fired[0], nil)
	found := false
	for _, entry := range s.Log() {
		if entry.Message == "resolved" {
			found = true
			break
		}
	}
	if !found {
		t.Error("log should record resolution")
	}
}

// Task 493: skill check.
func TestSkillCheck(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	// High skill, low difficulty: should usually succeed
	sc := SkillCheck{Skill: "roguery", SkillValue: 90, Difficulty: 0.1}
	wins := 0
	for i := 0; i < 100; i++ {
		if sc.Check(rng) {
			wins++
		}
	}
	if wins < 70 {
		t.Errorf("expected high success rate, got %d/100", wins)
	}
	// Low skill, high difficulty: should usually fail
	sc2 := SkillCheck{Skill: "roguery", SkillValue: 10, Difficulty: 0.9}
	wins = 0
	for i := 0; i < 100; i++ {
		if sc2.Check(rng) {
			wins++
		}
	}
	if wins > 40 {
		t.Errorf("expected low success rate, got %d/100", wins)
	}
}

// Task 494: outcome application.
func TestOutcome(t *testing.T) {
	e := &Event{Type: BountyHunt, Data: map[string]float64{"reward": 1000}}
	out := OutcomeFor(e, true)
	if out.Gold != 1000 {
		t.Errorf("expected 1000 gold, got %v", out.Gold)
	}
	ApplyOutcome(e, out)
	if e.Data["reward_gold"] != 1000 {
		t.Error("reward not applied to event data")
	}
	fail := OutcomeFor(e, false)
	if fail.Gold != 0 {
		t.Error("failure should give no gold")
	}
}
