package battle

import (
	"testing"

	"mbclone/simulation/internal/config"
)

func testSessionConfig(t *testing.T) *config.Config {
	t.Helper()
	path, err := findBalanceFile()
	if err != nil {
		t.Skipf("no balance config available: %v", err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("balance file did not load from %s: %v", path, err)
	}
	// Private copy semantics: the loader returns a fresh config each call,
	// so mutating StalemateTicks here touches only this test.
	return cfg
}

func testSession(t *testing.T) *Session {
	t.Helper()
	cfg := testSessionConfig(t)
	// Small stalemate timeout so the timeout test runs fast.
	cfg.Battle.StalemateTicks = 50
	s, err := NewSession(cfg, "test-battle",
		PartyRef{ID: "a", Name: "attackers"},
		PartyRef{ID: "d", Name: "defenders"},
		1234, 5678)
	if err != nil {
		t.Fatal(err)
	}
	aUnits, err := GenerateForce(cfg, 5678, SideA, Roster{Units: 20, TroopsPerUnit: 1})
	if err != nil {
		t.Fatal(err)
	}
	bUnits, err := GenerateForce(cfg, 5678, SideB, Roster{Units: 20, TroopsPerUnit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Deploy(aUnits, bUnits, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.BeginFighting(); err != nil {
		t.Fatal(err)
	}
	return s
}

// Pause refuses Advance; Step still moves one tick.
func TestPauseAndStep(t *testing.T) {
	s := testSession(t)
	if err := s.Pause(); err != nil {
		t.Fatal(err)
	}
	if !s.Paused() {
		t.Fatal("session not paused after Pause")
	}
	if err := s.Advance(10); err == nil {
		t.Fatal("Advance on a paused session succeeded; want refusal")
	}
	tickBefore := s.Tick()
	if err := s.Step(); err != nil {
		t.Fatal(err)
	}
	if s.Tick() != tickBefore+1 {
		t.Fatalf("Step moved %d ticks, want exactly 1", s.Tick()-tickBefore)
	}
	if err := s.Resume(); err != nil {
		t.Fatal(err)
	}
	if s.Paused() {
		t.Fatal("session still paused after Resume")
	}
	if err := s.Advance(10); err != nil {
		t.Fatal(err)
	}
}

// Stepping one tick advances exactly one tick of simulation.
func TestStepIsExactlyOneTick(t *testing.T) {
	s := testSession(t)
	for i := 0; i < 5; i++ {
		before := s.Tick()
		if err := s.Step(); err != nil {
			t.Fatal(err)
		}
		if s.Tick() != before+1 {
			t.Fatalf("step %d: tick %d -> %d, want +1", i, before, s.Tick())
		}
	}
}

// A battle with no casualties for StalemateTicks resolves as a draw.
// Two tiny forces far apart never meet; the timeout must end it.
func TestStalemateTimeout(t *testing.T) {
	s := testSession(t)
	// Advance well past the 50-tick stalemate timeout.
	if err := s.Advance(500); err != nil {
		t.Fatal(err)
	}
	if s.Phase() != PhaseResolved {
		t.Fatalf("phase %s after 500 quiet ticks, want resolved", s.Phase())
	}
	if !s.Decided() {
		t.Fatal("session not decided after stalemate timeout")
	}
	if s.Outcome().Kind != ResultDraw {
		t.Fatalf("stalemate outcome %s, want draw", s.Outcome().Kind)
	}
}

// The fixed-timestep clock: elapsed simulated time is ticks * tick_seconds,
// exact, never measured.
func TestClockIsExact(t *testing.T) {
	s := testSession(t)
	if err := s.Advance(40); err != nil {
		t.Fatal(err)
	}
	want := float64(s.Tick()) * s.battle.c.TickSeconds
	if s.ElapsedSeconds() != want {
		t.Fatalf("elapsed %.4f, want %.4f", s.ElapsedSeconds(), want)
	}
}
