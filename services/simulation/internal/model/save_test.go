package model

// Round-trip tests for the authoritative save format (task 122).

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func filledState() *State {
	s := NewState()
	s.Year = 3
	s.Tick = 1042
	s.Season = 0.5
	s.Towns[1] = &Town{ID: 1, Name: "Teston", SideID: 1, State: "town", IsPort: true}
	s.Villages[2] = &Village{ID: 2, Name: "Villageton", SideID: 1, TownID: 1, Population: 120}
	s.Parties[3] = &Party{ID: 3, Name: "Warband", SideID: 1, RulerID: 4, X: 10.5, Y: 20.5}
	s.Rulers[4] = &Ruler{ID: 4, Name: "Ruler", SideID: 1, TownID: 1, PartyID: 3, Age: 40}
	s.Sides[1] = &Side{ID: 1, Name: "Blues", LeaderID: 4, Treasury: 500, Gold: 100, Food: 200}
	s.Routes[5] = &Route{ID: 5, TownA: 1, TownB: 1, Length: 12.5, Safety: 0.8, Raiders: 0.1}
	s.Sieges[6] = &Siege{ID: 6, TownID: 1, AttackerID: 4, DefenderID: 4, Days: 3, Breach: 0.2}
	s.Wars[7] = &War{ID: 7, SideA: 1, SideB: 1}
	s.NextID[IDParty] = 100
	s.Relations[MakePair(1, 2)] = 0.75
	s.Relations[MakePair(2, 9)] = -0.25
	s.SideRelations[MakePair(1, 1)] = 1.0
	s.Oaths[8] = Oath{Promisor: 4, Promisee: 4, Kind: OathAid, MadeTick: 900, Broken: true, BrokenTick: 1000}
	return s
}

func TestSaveRoundTrip(t *testing.T) {
	orig := filledState()
	data, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var restored State
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(orig, &restored) {
		t.Fatalf("round trip changed the state")
	}
	// The pair caches must rebuild lazily after a restore.
	if got := len(restored.SortedPairs(restored.Relations).Pairs); got != 2 {
		t.Fatalf("restored SortedPairs = %d, want 2", got)
	}
}

func TestSaveRoundTripEmpty(t *testing.T) {
	orig := NewState()
	data, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// No null maps on the wire: a save must always be loadable without nil checks.
	if strings.Contains(string(data), ":null") {
		t.Fatalf("save contains null: %s", data)
	}
	var restored State
	if err := json.Unmarshal(data, &restored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !reflect.DeepEqual(orig, &restored) {
		t.Fatalf("empty round trip changed the state")
	}
}

func TestSaveRejectsUnknownVersion(t *testing.T) {
	data, err := json.Marshal(filledState())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	bad := strings.Replace(string(data), `"version":1`, `"version":99`, 1)
	var s State
	if err := json.Unmarshal([]byte(bad), &s); err == nil {
		t.Fatalf("unmarshal accepted version 99")
	}
}

func TestSaveRejectsBadPairKey(t *testing.T) {
	data, err := json.Marshal(filledState())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// Denormalized pair key: A > B.
	bad := strings.Replace(string(data), `"1:2"`, `"2:1"`, 1)
	var s State
	if err := json.Unmarshal([]byte(bad), &s); err == nil {
		t.Fatalf("unmarshal accepted denormalized pair key")
	}
}

func TestSaveRejectsWrongFormat(t *testing.T) {
	var s State
	if err := json.Unmarshal([]byte(`{"format":"nope","version":1}`), &s); err == nil {
		t.Fatalf("unmarshal accepted wrong format tag")
	}
}
