package events

import (
	"math/rand"
	"testing"
)

func TestSystemTickFiresEvents(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	s := New(rng)
	// With many settlements and days, at least one event should fire
	fired := s.Tick(1, []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10})
	if len(fired) == 0 {
		t.Log("no events fired on day 1 (possible with low probabilities)")
	}
	// Run 100 days, should fire something
	total := len(fired)
	for day := 2; day <= 100; day++ {
		total += len(s.Tick(day, []int{1, 2, 3, 4, 5}))
	}
	if total == 0 {
		t.Error("expected at least one event over 100 days")
	}
}

func TestEventTypes(t *testing.T) {
	rng := rand.New(rand.NewSource(123))
	s := New(rng)
	seen := make(map[EventType]bool)
	for day := 1; day <= 500; day++ {
		for _, e := range s.Tick(day, []int{1, 2, 3}) {
			seen[e.Type] = true
		}
	}
	// All 5 types should fire over 500 days
	for _, typ := range []EventType{BanditAmbush, MerchantCaravan, RefugeeGroup, Deserters, WeatherStorm} {
		if !seen[typ] {
			t.Errorf("event type %s never fired over 500 days", typ)
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

func TestEventData(t *testing.T) {
	rng := rand.New(rand.NewSource(999))
	// Force each trigger directly
	if e := triggerBanditAmbush(rng, 1, 1); e != nil {
		if e.Data["bandit_strength"] <= 0 {
			t.Error("bandit strength should be positive")
		}
	}
	if e := triggerMerchantCaravan(rng, 1, 1); e != nil {
		if e.Data["goods_value"] <= 0 {
			t.Error("goods value should be positive")
		}
	}
}
