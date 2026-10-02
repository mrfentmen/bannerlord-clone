package access

import (
	"testing"

	"mbclone/simulation/internal/model"
)

func testState() *model.State {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "A"}
	s.Sides[2] = &model.Side{ID: 2, Name: "B"}
	s.Sides[3] = &model.Side{ID: 3, Name: "C"}
	// A and B at war; A and C merely dislike each other.
	s.Wars[1] = &model.War{ID: 1, SideA: 1, SideB: 2, EndTick: -1}
	s.SetSideRelation(1, 3, -0.7)
	s.SetSideRelation(1, 2, 0.0)
	return s
}

func TestOwnTerritoryAllowed(t *testing.T) {
	s := testState()
	st, _ := TownAccess(s, 1, 1)
	if st != Allowed {
		t.Errorf("own town: got %v, want Allowed", st)
	}
}

func TestWarDenied(t *testing.T) {
	s := testState()
	st, reason := TownAccess(s, 2, 1)
	if st != Denied {
		t.Errorf("at war: got %v, want Denied", st)
	}
	if reason == "" {
		t.Error("denied without a reason")
	}
}

func TestPoorRelationsDenied(t *testing.T) {
	s := testState()
	st, _ := TownAccess(s, 3, 1)
	if st != Denied {
		t.Errorf("relations -0.7: got %v, want Denied", st)
	}
}

func TestNeutralAllowed(t *testing.T) {
	s := testState()
	// B is at war with A, but C is neutral to B.
	st, _ := TownAccess(s, 3, 2)
	if st != Allowed {
		t.Errorf("neutral: got %v, want Allowed", st)
	}
}
