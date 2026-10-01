package election

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/config"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/rng"
	"mbclone/simulation/internal/sim"
)

// testView builds a minimal world: one side with a president, a VP, and a
// third ruler.
func testView() (*sim.View, *sim.WriteSet) {
	state := &model.State{
		Rulers: map[int]*model.Ruler{
			1: {ID: 1, Name: "President", SideID: 1, IsAlive: true, Leader: true, Influence: 100, Renown: 100},
			2: {ID: 2, Name: "VP", SideID: 1, IsAlive: true, Influence: 80, Renown: 80},
			3: {ID: 3, Name: "Rival", SideID: 1, IsAlive: true, Influence: 90, Renown: 90},
		},
		Sides: map[int]*model.Side{
			1: {ID: 1, Name: "Test Faction", LeaderID: 1, VicePresidentID: 2,
				LastElectionTick: 0, PresidentInDC: true, PresidentTerms: 1, Stability: 0.8},
		},
	}
	cfg := &config.Config{}
	cfg.Election.TermYears = 4
	cfg.Election.MaxTerms = 2
	cfg.Election.AssassinationBaseRate = 0
	cfg.Election.TravelRiskMultiplier = 10
	cfg.Election.UnrestRiskScale = 0
	return &sim.View{
		State: state,
		Log:   cause.NewLog(1000),
		Cfg:   cfg,
		Rng:   rng.New(42),
		Tick:  100,
	}, sim.NewWriteSet()
}

// wroteField reports whether the write set contains a Set for kind/entity/field.
func wroteField(w *sim.WriteSet, kind model.Kind, entity int, field string) bool {
	for _, d := range w.Debug() {
		if d.Kind == kind && d.Entity == entity && d.Field == field {
			return true
		}
	}
	return false
}

func TestPickSuccessorVPFirst(t *testing.T) {
	v, _ := testView()
	if got := pickSuccessor(v, v.State.Sides[1], -1); got == nil || got.ID != 2 {
		t.Errorf("expected VP (ruler 2), got %v", got)
	}
}

func TestPickSuccessorSkipsDeadVP(t *testing.T) {
	v, _ := testView()
	v.State.Rulers[2].IsAlive = false
	// Ruler 3 has the highest influence+renown of the remainder.
	if got := pickSuccessor(v, v.State.Sides[1], -1); got == nil || got.ID != 3 {
		t.Errorf("expected ruler 3, got %v", got)
	}
}

func TestPickSuccessorSkipsCapturedVP(t *testing.T) {
	v, _ := testView()
	v.State.Rulers[2].CapturedBy = 99
	if got := pickSuccessor(v, v.State.Sides[1], -1); got == nil || got.ID != 3 {
		t.Errorf("expected ruler 3, got %v", got)
	}
}

func TestSuccessionInstallsNewPresident(t *testing.T) {
	v, w := testView()
	v.State.Rulers[1].IsAlive = false // president dead

	run(v, w)

	if !wroteField(w, model.KindSide, 1, "side_leader") {
		t.Error("expected side_leader write on succession")
	}
	if !wroteField(w, model.KindSide, 1, "vice_president") {
		t.Error("expected a new VP to be picked on succession")
	}
	if !wroteField(w, model.KindRuler, 2, "leader") {
		t.Error("expected the VP ruler to gain the leader flag")
	}
}

func TestElectionOnSchedule(t *testing.T) {
	v, w := testView()
	v.Tick = 1461 // past the 4-year term
	v.State.Sides[1].LastElectionTick = 0

	run(v, w)

	if !wroteField(w, model.KindSide, 1, "last_election_tick") {
		t.Error("expected an election after a full term")
	}
}

func TestNoElectionBeforeTerm(t *testing.T) {
	v, w := testView()
	v.Tick = 100 // well before 1460
	v.State.Sides[1].LastElectionTick = 0

	run(v, w)

	if wroteField(w, model.KindSide, 1, "last_election_tick") {
		t.Error("election held before term ended")
	}
}

func TestBestCandidateExcludesDeadAndCaptured(t *testing.T) {
	v, _ := testView()
	v.State.Rulers[3].IsAlive = false
	v.State.Rulers[2].CapturedBy = 7
	// Only ruler 1 remains eligible (excluding nobody).
	if got := bestCandidateExcluding(v, 1, -1); got == nil || got.ID != 1 {
		t.Errorf("expected ruler 1, got %v", got)
	}
}
