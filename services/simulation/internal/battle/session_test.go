package battle

import (
	"testing"
)

// sessionForces builds two small deterministic forces for session tests. The
// same seed always yields the same soldiers, so a session and a direct Run
// over these forces must agree exactly.
func sessionForces(t *testing.T, seed uint64) (a, b []Unit, leaders []Leader) {
	t.Helper()
	cfg := loadConfig(t)
	var err error
	a, err = GenerateForce(cfg, seed, SideA, Roster{Units: 30})
	if err != nil {
		t.Fatalf("GenerateForce A: %v", err)
	}
	b, err = GenerateForce(cfg, seed+1, SideB, Roster{Units: 30})
	if err != nil {
		t.Fatalf("GenerateForce B: %v", err)
	}
	leaders = append(leaders, GenerateLeaders(cfg, seed+2, SideA, 1, 0.7)...)
	leaders = append(leaders, GenerateLeaders(cfg, seed+3, SideB, 1, 0.7)...)
	return a, b, leaders
}

func newTestSession(t *testing.T, seed uint64) (*Session, []Unit, []Unit, []Leader) {
	t.Helper()
	cfg := loadConfig(t)
	a, b, leaders := sessionForces(t, seed)
	s, err := NewSession(cfg, "test-battle-1",
		PartyRef{ID: "party-a", Name: "Warlord's Column"},
		PartyRef{ID: "party-b", Name: "Riverside Militia"},
		0xC0FFEE, seed)
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	return s, a, b, leaders
}

// A session built from two parties, with no client anywhere, must fight to a
// decided outcome through the legal phase sequence.
func TestSessionLifecycle(t *testing.T) {
	s, a, b, leaders := newTestSession(t, 12345)
	if got := s.Phase(); got != PhaseStaging {
		t.Fatalf("new session phase = %s, want staging", got)
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if got := s.Phase(); got != PhaseDeployment {
		t.Fatalf("after Deploy phase = %s, want deployment", got)
	}
	// Rosters are frozen: attacker bodies are recorded and non-zero.
	if bodies := s.Roster(SideA).Bodies; bodies <= 0 {
		t.Fatalf("attacker roster bodies = %v, want positive", bodies)
	}
	if bodies := s.Roster(SideB).Bodies; bodies <= 0 {
		t.Fatalf("defender roster bodies = %v, want positive", bodies)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	// Advance in chunks, the way the API will drive it.
	for i := 0; i < 400 && s.Phase() != PhaseResolved; i++ {
		if err := s.Advance(50); err != nil {
			t.Fatalf("Advance: %v", err)
		}
	}
	if s.Phase() != PhaseResolved {
		t.Fatalf("after 20000 ticks phase = %s, want resolved", s.Phase())
	}
	if !s.Decided() || s.Result() == nil {
		t.Fatal("resolved session has no outcome/result")
	}
	if s.Tick() <= 0 {
		t.Fatalf("resolved session tick = %d, want positive", s.Tick())
	}
	sum := s.Summary()
	if sum[0].Dead+sum[1].Dead == 0 && sum[0].Wounded+sum[1].Wounded == 0 {
		t.Fatal("resolved battle reports zero casualties on both sides")
	}
	t.Logf("outcome=%s reason=%d ticks=%d", s.Outcome().Kind, s.Outcome().Reason, s.Tick())
}

// The session drives the same tick loop as Run, so the same seed and setup
// must produce the identical result digest.
func TestSessionMatchesRun(t *testing.T) {
	cfg := loadConfig(t)
	const seed = 777
	a, b, leaders := sessionForces(t, seed)

	s, err := NewSession(cfg, "parity-1",
		PartyRef{ID: "a", Name: "A"}, PartyRef{ID: "b", Name: "B"}, 0, seed)
	if err != nil {
		t.Fatalf("NewSession: %v", err)
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	for s.Phase() != PhaseResolved {
		if err := s.Advance(200); err != nil {
			t.Fatalf("Advance: %v", err)
		}
	}

	direct, err := Run(cfg, seed, Setup{A: a, B: b, Leaders: leaders, Terrain: TerrainOpen, Label: "parity"})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if s.Result().StateHash != direct.StateHash {
		t.Fatalf("session StateHash %x != Run StateHash %x: the session diverged from the engine it wraps", s.Result().StateHash, direct.StateHash)
	}
}

// Illegal phase jumps are errors, never silent skips.
func TestSessionIllegalTransitions(t *testing.T) {
	s, a, b, leaders := newTestSession(t, 999)

	if err := s.Advance(10); err == nil {
		t.Fatal("Advance before BeginFighting: want error, got nil")
	}
	if err := s.BeginFighting(); err == nil {
		t.Fatal("BeginFighting before Deploy: want error, got nil")
	}
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	if err := s.Deploy(a, b, leaders); err == nil {
		t.Fatal("second Deploy: want error, got nil")
	}
	if err := s.Advance(10); err == nil {
		t.Fatal("Advance before BeginFighting (deployed): want error, got nil")
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatalf("BeginFighting: %v", err)
	}
	if err := s.BeginFighting(); err == nil {
		t.Fatal("second BeginFighting: want error, got nil")
	}
	if err := s.Advance(0); err == nil {
		t.Fatal("Advance(0): want error, got nil")
	}
}

// Constructor validation.
func TestSessionValidation(t *testing.T) {
	cfg := loadConfig(t)
	pa := PartyRef{ID: "a", Name: "A"}
	pb := PartyRef{ID: "b", Name: "B"}

	if _, err := NewSession(cfg, "", pa, pb, 0, 1); err == nil {
		t.Fatal("empty id: want error, got nil")
	}
	if _, err := NewSession(cfg, "x", pa, pa, 0, 1); err == nil {
		t.Fatal("party fighting itself: want error, got nil")
	}
	if _, err := NewSession(cfg, "x", PartyRef{}, pb, 0, 1); err == nil {
		t.Fatal("empty attacker id: want error, got nil")
	}
	if _, err := NewSession(nil, "x", pa, pb, 0, 1); err == nil {
		t.Fatal("nil config: want error, got nil")
	}
}

// Deploy must freeze the rosters: mutating the caller's slices afterwards
// cannot reach the battle.
func TestSessionRosterFrozen(t *testing.T) {
	s, a, b, leaders := newTestSession(t, 31337)
	origHP := a[0].HP
	if err := s.Deploy(a, b, leaders); err != nil {
		t.Fatalf("Deploy: %v", err)
	}
	a[0].HP = -999
	a[0].Troops = 0
	if got := s.Roster(SideA).Units[0].HP; got != origHP {
		t.Fatalf("roster not frozen: HP = %v after caller mutation, want %v", got, origHP)
	}
	if got := s.Roster(SideA).Units[0].Troops; got <= 0 {
		t.Fatal("roster not frozen: Troops mutated through the caller's slice")
	}
	// Wrong-side units are rejected, not reinterpreted.
	c, d, _ := sessionForces(t, 4242)
	for i := range c {
		c[i].Side = SideB
	}
	s2, _, _, leaders2 := newTestSession(t, 5150)
	if err := s2.Deploy(c, d, leaders2); err == nil {
		t.Fatal("attacker roster with side-B units: want error, got nil")
	}
}
