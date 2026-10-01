package player

import (
	"path/filepath"
	"runtime"
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

// The player system is the only place a queued order becomes a change in shared
// state, so these tests assert on the state a tick commits rather than on the
// writes the system stages. sim.WriteSet.Debug reports field names but not
// values, and reports nothing at all for relation writes, so the only way to
// check that an order actually moved a number is to let the engine apply it.

// testCfg loads the shipped balance file so an assertion about a configurable
// constant checks the wiring rather than a copy of the number in this file.
// config.LoadDefault cannot be used because it resolves config/balance.toml
// against the working directory, and a test runs in its own package directory.
func testCfg(t *testing.T) *config.Config {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate the test source file")
	}
	// services/simulation/internal/systems/player -> services/simulation/config.
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "config", "balance.toml")
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("load balance.toml: %v", err)
	}
	return cfg
}

// tick applies the queued orders through the engine with the player system and
// nothing else, so a number in the result can only have come from the order.
func tick(t *testing.T, s *model.State, orders ...sim.Order) {
	t.Helper()
	e := sim.NewEngine(testCfg(t), cause.NewLog(1000), 42, []sim.System{System()})
	e.SetOrders(orders)
	if err := e.Tick(s); err != nil {
		// A write to a field the model cannot read or write is a programming
		// error and aborts the whole tick before anything commits, so there is
		// no state left to assert on.
		t.Fatalf("tick: %v", err)
	}
}

func TestSystemName(t *testing.T) {
	if System().Name != "player" {
		t.Errorf("expected player, got %s", System().Name)
	}
}

// A recruit is a purchase: the troops arrive in the leader's party and the gold
// leaves the ruler's purse. Both halves matter, because a recruit that added
// troops for free would make every army in the campaign costless.
func TestOrderRecruitTroopsAddsTroopsAndSpendsGold(t *testing.T) {
	s := model.NewState()
	// Prosperity 5 offers 100 volunteers (prosperity * 20), so the 30 ordered
	// are not clipped by what the town can supply.
	s.Towns[1] = &model.Town{ID: 1, Prosperity: 5}
	s.Leaders[1] = &model.Leader{ID: 1, SideID: 1, Gold: 1000}
	s.Parties[1] = &model.Party{ID: 1, SideID: 1, LeaderID: 1, Troops: 50}

	tick(t, s, sim.Order{
		Kind:     sim.OrderRecruitTroops,
		TownID:   1,
		LeaderID: 1,
		Amount:   30,
	})

	if got := s.Parties[1].Troops; got != 80 {
		t.Errorf("party troops = %v, want 80 (50 existing + 30 recruits)", got)
	}
	if got := s.Leaders[1].Gold; got != 700 {
		t.Errorf("leader gold = %v, want 700 (1000 - 30 recruits at 10 gold each)", got)
	}
}

// A release is the honorable outcome and the primary tool for building goodwill:
// the prisoner walks free and the captor is better regarded by them. The
// prisoner must survive it, which is what separates a release from an
// execution sharing the same captor and target.
func TestOrderReleasePrisonerClearsCaptorAndGrantsRelation(t *testing.T) {
	cfg := testCfg(t)
	s := model.NewState()
	s.Leaders[1] = &model.Leader{ID: 1, SideID: 1, Gold: 100, IsAlive: true}
	s.Leaders[2] = &model.Leader{ID: 2, SideID: 2, Gold: 100, IsAlive: true, CapturedBy: 1}

	tick(t, s, sim.Order{
		Kind:     sim.OrderReleasePrisoner,
		LeaderID: 1,
		Target:   2,
	})

	if got := s.Leaders[2].CapturedBy; got != -1 {
		t.Errorf("prisoner captured_by = %v, want -1 (no captor)", got)
	}
	if !s.Leaders[2].IsAlive {
		t.Error("prisoner is dead after a release; a release is not an execution")
	}
	want := cfg.RulerAI.PrisonerReleaseRelation
	if got := s.Relation(1, 2); got != want {
		t.Errorf("relation(captor, prisoner) = %v, want %v (prisoner_release_relation)", got, want)
	}
}
