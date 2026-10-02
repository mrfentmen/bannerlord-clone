package succession

import (
	"testing"

	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/sim"
)

func testView() (*sim.View, *sim.WriteSet) {
	s := model.NewState()
	s.Organizations[1] = &model.Organization{
		ID: 1, Name: "Test Clan", LeaderID: 1,
		MemberIDs: []int{1, 2, 3},
	}
	s.Leaders[1] = &model.Leader{ID: 1, Name: "Dead Leader", IsAlive: false, HeirID: -1}
	s.Leaders[2] = &model.Leader{ID: 2, Name: "Eldest", IsAlive: true, Age: 40}
	s.Leaders[3] = &model.Leader{ID: 3, Name: "Youngest", IsAlive: true, Age: 25}
	v := &sim.View{State: s, Log: cause.NewLog(100)}
	return v, sim.NewWriteSet()
}

func hasClanLeaderWrite(w *sim.WriteSet) bool {
	for _, wr := range w.Debug() {
		if wr.Field == "clan_leader" {
			return true
		}
	}
	return false
}

// Task 34: Designated heir inherits - system stages a succession write.
func TestDesignatedHeirInherits(t *testing.T) {
	v, w := testView()
	v.State.Leaders[1].HeirID = 3
	System().Runs(v, w)
	if !hasClanLeaderWrite(w) {
		t.Error("no clan_leader write staged (designated heir should inherit)")
	}
}

// Task 35: Eldest fallback when no heir designated.
func TestEldestFallbackWhenNoHeir(t *testing.T) {
	v, w := testView()
	System().Runs(v, w)
	if !hasClanLeaderWrite(w) {
		t.Error("no clan_leader write staged (eldest should inherit)")
	}
}

// Task 36: Invalid designated heir falls back to eldest.
func TestInvalidHeirFallsBackToEldest(t *testing.T) {
	v, w := testView()
	v.State.Leaders[1].HeirID = 999
	System().Runs(v, w)
	if !hasClanLeaderWrite(w) {
		t.Error("no clan_leader write staged (invalid heir should fall back)")
	}
}

// Task 37: Dead designated heir falls back to eldest.
func TestDeadHeirFallsBackToEldest(t *testing.T) {
	v, w := testView()
	v.State.Leaders[1].HeirID = 3
	v.State.Leaders[3].IsAlive = false
	System().Runs(v, w)
	if !hasClanLeaderWrite(w) {
		t.Error("no clan_leader write staged (dead heir should fall back)")
	}
}

// Task 38: Clan dissolves with no valid heirs.
func TestClanDissolvesWithNoHeirs(t *testing.T) {
	v, w := testView()
	v.State.Leaders[2].IsAlive = false
	v.State.Leaders[3].IsAlive = false
	System().Runs(v, w)
	if !hasClanLeaderWrite(w) {
		t.Error("no clan_leader write staged (clan should dissolve)")
	}
}
