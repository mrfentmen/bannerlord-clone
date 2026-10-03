package events

// Tests for the campaign event framework. Each test builds a minimal state,
// runs the events system in isolation for one or more ticks, and asserts the
// full decision → state change → next decision loop: the event fires, its
// consequences land in committed state, and it never fires twice.

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

func testConfig(t *testing.T) *config.Config {
	t.Helper()
	cfg, err := config.Load("../../../config/balance.toml")
	if err != nil {
		t.Fatalf("loading balance.toml: %v", err)
	}
	return cfg
}

// testWorld builds a minimal two-side world: side 1 holds town 1 via ruler 1,
// side 2 holds town 2 via ruler 2.
func testWorld() *model.State {
	s := model.NewState()
	s.Tick = 1
	s.Sides[1] = &model.Side{ID: 1, Name: "Side One", Stability: 0.8}
	s.Sides[2] = &model.Side{ID: 2, Name: "Side Two", Stability: 0.8}
	s.Towns[1] = &model.Town{ID: 1, Name: "Town One", Holder: 1, HolderSide: 1, Militia: 500, Unrest: 0.1, Loyalty: 0.8}
	s.Towns[2] = &model.Town{ID: 2, Name: "Town Two", Holder: 2, HolderSide: 2, Militia: 500, Unrest: 0.1, Loyalty: 0.8}
	s.Rulers[1] = &model.Ruler{ID: 1, Name: "Ruler One", SideID: 1, TownID: 1, IsAlive: true}
	s.Rulers[2] = &model.Ruler{ID: 2, Name: "Ruler Two", SideID: 2, TownID: 2, IsAlive: true}
	s.SetIDCounter(model.IDParty, 100)
	return s
}

func runEvents(t *testing.T, s *model.State, log *cause.Log, ticks int) *model.State {
	t.Helper()
	cfg := testConfig(t)
	if log == nil {
		log = cause.NewLog(10000)
	}
	e := sim.NewEngine(cfg, log, 99, []sim.System{System()})
	for i := 0; i < ticks; i++ {
		if err := e.Tick(s); err != nil {
			t.Fatalf("tick %d: %v", s.Tick, err)
		}
	}
	return s
}

func countKind(s *model.State, k model.EventKind) int {
	n := 0
	for _, e := range s.Events {
		if e.Kind == k {
			n++
		}
	}
	return n
}

func TestWarDeclaredFires(t *testing.T) {
	s := testWorld()
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 1, EndTick: -1}
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventWarDeclared); n != 1 {
		t.Fatalf("expected 1 war-declared event, got %d", n)
	}
	e := s.Events[0]
	if e.SideA != 1 || e.SideB != 2 {
		t.Fatalf("wrong participants: %+v", e)
	}
	if rel := s.SideRelation(1, 2); rel >= 0 {
		t.Fatalf("expected side relation to drop below 0 after declaration, got %v", rel)
	}
}

func TestWarDeclaredFiresOnce(t *testing.T) {
	s := testWorld()
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 1, EndTick: -1}
	runEvents(t, s, nil, 5)
	if n := countKind(s, model.EventWarDeclared); n != 1 {
		t.Fatalf("war-declared fired %d times over 5 ticks, want exactly 1", n)
	}
}

func TestWarEndedFires(t *testing.T) {
	s := testWorld()
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, StartTick: 1, EndTick: 2, Battles: 7}
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventWarEnded); n != 1 {
		t.Fatalf("expected 1 war-ended event, got %d", n)
	}
	if s.Events[0].Magnitude != 7 {
		t.Fatalf("expected magnitude 7 (battles), got %v", s.Events[0].Magnitude)
	}
}

func TestSettlementCapturedFires(t *testing.T) {
	s := testWorld()
	log := cause.NewLog(10000)
	// The holder row from the previous tick: ruler 2 of side 2 took town 1
	// from ruler 1 of side 1.
	log.Append(cause.Row{Tick: 0, Kind: model.KindTown, Entity: 1, Field: "holder", Old: 1, New: 2})
	s.Towns[1].Holder = 2
	s.Towns[1].HolderSide = 2
	runEvents(t, s, log, 1)
	if n := countKind(s, model.EventSettlementCaptured); n != 1 {
		t.Fatalf("expected 1 capture event, got %d", n)
	}
	e := s.Events[0]
	if e.Actor != 2 || e.Target != 1 || e.SideA != 2 || e.SideB != 1 {
		t.Fatalf("wrong participants: %+v", e)
	}
	if rel := s.Relation(2, 1); rel >= 0 {
		t.Fatalf("expected grudge between captor and deposed, got relation %v", rel)
	}
	if r := s.Rulers[2]; r.Renown <= 0 {
		t.Fatalf("expected captor to gain renown, got %v", r.Renown)
	}
}

func TestSameSideHolderChangeIsNotCapture(t *testing.T) {
	s := testWorld()
	// A third ruler of the same side takes over: internal politics, no event.
	s.Rulers[3] = &model.Ruler{ID: 3, Name: "Ruler Three", SideID: 1, TownID: 1, IsAlive: true}
	log := cause.NewLog(10000)
	log.Append(cause.Row{Tick: 0, Kind: model.KindTown, Entity: 1, Field: "holder", Old: 1, New: 3})
	s.Towns[1].Holder = 3
	runEvents(t, s, log, 1)
	if n := countKind(s, model.EventSettlementCaptured); n != 0 {
		t.Fatalf("same-side holder change produced %d capture events, want 0", n)
	}
}

func TestRulerDiedFires(t *testing.T) {
	s := testWorld()
	s.Rulers[2].IsAlive = false
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventRulerDied); n != 1 {
		t.Fatalf("expected 1 ruler-died event, got %d", n)
	}
	if st := s.Sides[2].Stability; st >= 0.8 {
		t.Fatalf("expected side stability to drop after a ruler's death, got %v", st)
	}
	// A second tick must not re-fire for the same death.
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventRulerDied); n != 1 {
		t.Fatalf("ruler-died fired %d times, want exactly 1", n)
	}
}

func TestRebellionSpawnsRebels(t *testing.T) {
	s := testWorld()
	town := s.Towns[1]
	town.Unrest = 0.9
	town.Loyalty = 0.1
	town.DaysBelowLoyalty = 30
	before := len(s.Parties)
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventRebellion); n != 1 {
		t.Fatalf("expected 1 rebellion event, got %d", n)
	}
	if len(s.Parties) != before+1 {
		t.Fatalf("expected a rebel party to spawn, parties %d -> %d", before, len(s.Parties))
	}
	var rebels *model.Party
	for _, p := range s.Parties {
		if p.SideID == -1 && p.IsRaider && p.HomeTown == 1 {
			rebels = p
		}
	}
	if rebels == nil {
		t.Fatal("no rebel party found for town 1")
	}
	if rebels.Troops <= 0 {
		t.Fatalf("rebel party has no troops: %v", rebels.Troops)
	}
	// The rebels are deserters: the militia shrank by what took the field.
	if s.Towns[1].Militia >= 500 {
		t.Fatalf("militia did not desert: still %v", s.Towns[1].Militia)
	}
}

func TestRebellionFiresOnceWhileOpen(t *testing.T) {
	s := testWorld()
	town := s.Towns[1]
	town.Unrest = 0.9
	town.Loyalty = 0.1
	town.DaysBelowLoyalty = 30
	runEvents(t, s, nil, 4)
	if n := countKind(s, model.EventRebellion); n != 1 {
		t.Fatalf("open rebellion fired %d times over 4 ticks, want exactly 1", n)
	}
}

func TestRebellionQuelledClosesLoop(t *testing.T) {
	s := testWorld()
	town := s.Towns[1]
	town.Unrest = 0.9
	town.Loyalty = 0.1
	town.DaysBelowLoyalty = 30
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventRebellion); n != 1 {
		t.Fatalf("expected rebellion to fire, got %d", n)
	}
	// Order restored.
	town.Unrest = 0.1
	town.Loyalty = 0.8
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventRebellionQuelled); n != 1 {
		t.Fatalf("expected 1 quelled event, got %d", n)
	}
}

func TestFamineBeganAndEnded(t *testing.T) {
	s := testWorld()
	s.Towns[1].IsStarving = true
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventFamineBegan); n != 1 {
		t.Fatalf("expected 1 famine-began, got %d", n)
	}
	runEvents(t, s, nil, 3)
	if n := countKind(s, model.EventFamineBegan); n != 1 {
		t.Fatalf("famine-began fired %d times while starving, want 1", n)
	}
	s.Towns[1].IsStarving = false
	runEvents(t, s, nil, 1)
	if n := countKind(s, model.EventFamineEnded); n != 1 {
		t.Fatalf("expected 1 famine-ended, got %d", n)
	}
}

func TestCalmWorldFiresNothing(t *testing.T) {
	s := testWorld()
	runEvents(t, s, nil, 3)
	if len(s.Events) != 0 {
		t.Fatalf("calm world produced %d events, want 0", len(s.Events))
	}
}
