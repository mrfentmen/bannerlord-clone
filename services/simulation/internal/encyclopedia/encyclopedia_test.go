package encyclopedia

import (
	"strings"
	"testing"

	"mbclone/simulation/internal/model"
)

func testState() *model.State {
	s := model.NewState()
	s.Sides[1] = &model.Side{ID: 1, Name: "Test Faction", LeaderID: 1, Treasury: 5000}
	s.Organizations[1] = &model.Organization{
		ID: 1, Name: "Test Clan", LeaderID: 1, Tier: 3, Renown: 400,
		MemberIDs: []int{1, 2}, FiefIDs: []int{1},
	}
	s.Towns[1] = &model.Town{
		ID: 1, Name: "Test Town", IsPort: true,
		Holder: 1, HolderSide: 1,
		Population: 5000, Prosperity: 0.7, Loyalty: 0.8,
		Garrison: 100, Militia: 50,
	}
	s.Leaders[1] = &model.Leader{
		ID: 1, Name: "Lord Test", SideID: 1, OrganizationID: 1, Tier: 2,
		TownID: 1, Renown: 200, Influence: 50, Age: 35, IsAlive: true,
	}
	s.Leaders[2] = &model.Leader{
		ID: 2, Name: "Lady Sample", SideID: 1, OrganizationID: 1, Tier: 3,
		TownID: -1, PartyID: 5, Renown: 100, Influence: 30, Age: 28, IsAlive: true,
	}
	return s
}

func TestTownEntry(t *testing.T) {
	s := testState()
	e := TownEntry(s, 1)
	if e == nil {
		t.Fatal("expected entry, got nil")
	}
	if e.Kind != "town" || e.Title != "Test Town" {
		t.Errorf("wrong kind/title: %s/%s", e.Kind, e.Title)
	}
	if !strings.Contains(e.Body, "Lord Test") {
		t.Error("body should name the holder")
	}
	if !strings.Contains(e.Body, "port") {
		t.Error("body should note it is a port")
	}
}

func TestTownEntryMissing(t *testing.T) {
	s := testState()
	if TownEntry(s, 999) != nil {
		t.Error("expected nil for missing town")
	}
}

func TestRulerEntry(t *testing.T) {
	s := testState()
	e := RulerEntry(s, 1)
	if e == nil {
		t.Fatal("expected entry, got nil")
	}
	if !strings.Contains(e.Body, "Lord") {
		t.Error("body should give the rank")
	}
	if !strings.Contains(e.Body, "Test Clan") {
		t.Error("body should name the clan")
	}
	if !strings.Contains(e.Body, "Test Faction") {
		t.Error("body should name the faction")
	}
}

func TestRulerEntryDeceased(t *testing.T) {
	s := testState()
	s.Leaders[1].IsAlive = false
	e := RulerEntry(s, 1)
	if !strings.Contains(e.Body, "deceased") {
		t.Error("body should note deceased")
	}
}

func TestRulerEntryPrisoner(t *testing.T) {
	s := testState()
	s.Leaders[2].CapturedBy = 1
	e := RulerEntry(s, 2)
	if !strings.Contains(e.Body, "Prisoner") {
		t.Error("body should note prisoner status")
	}
}

func TestClanEntry(t *testing.T) {
	s := testState()
	e := ClanEntry(s, 1)
	if e == nil {
		t.Fatal("expected entry, got nil")
	}
	if !strings.Contains(e.Body, "Lord Test") {
		t.Error("body should name the leader")
	}
	if !strings.Contains(e.Body, "Lady Sample") {
		t.Error("body should list members")
	}
	if !strings.Contains(e.Body, "Test Town") {
		t.Error("body should list fiefs")
	}
}

func TestSideEntry(t *testing.T) {
	s := testState()
	e := SideEntry(s, 1)
	if e == nil {
		t.Fatal("expected entry, got nil")
	}
	if !strings.Contains(e.Body, "1 towns") {
		t.Error("body should count held towns")
	}
}

func TestSearch(t *testing.T) {
	s := testState()
	results := Search(s, "test")
	if len(results) < 4 {
		t.Errorf("expected at least 4 results for 'test', got %d", len(results))
	}
	results = Search(s, "nonexistent")
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}
