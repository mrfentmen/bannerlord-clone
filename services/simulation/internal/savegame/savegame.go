// Package savegame implements save/load for the simulation state.
//
// A save file is JSON with a version header. The state is serialized
// directly; map keys that aren't JSON-native (like model.Pair) get
// custom encoding.
package savegame

import (
	"encoding/json"
	"fmt"
	"os"

	"mbclone/simulation/internal/model"
)

const SaveVersion = 1

// SaveFile is the on-disk format.
type SaveFile struct {
	Version int             `json:"version"`
	Tick    int             `json:"tick"`
	Year    float64         `json:"year"`
	State   json.RawMessage `json:"state"`
}

// Save writes the state to a file.
func Save(s *model.State, path string) error {
	stateJSON, err := marshalState(s)
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	sf := SaveFile{
		Version: SaveVersion,
		Tick:    s.Tick,
		Year:    s.Year,
		State:   stateJSON,
	}
	data, err := json.MarshalIndent(sf, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal save file: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write save file: %w", err)
	}
	return nil
}

// Load reads a save file and returns the state.
func Load(path string) (*model.State, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read save file: %w", err)
	}
	var sf SaveFile
	if err := json.Unmarshal(data, &sf); err != nil {
		return nil, fmt.Errorf("unmarshal save file: %w", err)
	}
	if sf.Version != SaveVersion {
		return nil, fmt.Errorf("unsupported save version %d (want %d)", sf.Version, SaveVersion)
	}
	s, err := unmarshalState(sf.State)
	if err != nil {
		return nil, fmt.Errorf("unmarshal state: %w", err)
	}
	return s, nil
}

// stateJSON is the serializable form of model.State.
// Pair keys are encoded as "a:b" strings.
type stateJSON struct {
	Year          float64                     `json:"year"`
	Tick          int                         `json:"tick"`
	Season        float64                     `json:"season"`
	Towns         map[int]*model.Town         `json:"towns"`
	Villages      map[int]*model.Village      `json:"villages"`
	Parties       map[int]*model.Party        `json:"parties"`
	Leaders       map[int]*model.Leader       `json:"leaders"`
	Sides         map[int]*model.Side         `json:"sides"`
	Routes        map[int]*model.Route        `json:"routes"`
	Sieges        map[int]*model.Siege        `json:"sieges"`
	Wars          map[int]*model.War          `json:"wars"`
	Organizations map[int]*model.Organization `json:"organizations"`
	Workshops     map[int]*model.Workshop     `json:"workshops"`
	Notables      map[int]*model.Notable      `json:"notables"`
	Issues        map[int]*model.Issue        `json:"issues"`
	NextID        map[int]int                 `json:"nextID"`
	Relations     map[string]float64          `json:"relations"`
	SideRelations map[string]float64          `json:"sideRelations"`
}

func pairKey(p model.Pair) string {
	return fmt.Sprintf("%d:%d", p.A, p.B)
}

func parsePairKey(s string) (model.Pair, error) {
	var a, b int
	if _, err := fmt.Sscanf(s, "%d:%d", &a, &b); err != nil {
		return model.Pair{}, err
	}
	return model.Pair{A: a, B: b}, nil
}

func marshalState(s *model.State) (json.RawMessage, error) {
	sj := stateJSON{
		Year:          s.Year,
		Tick:          s.Tick,
		Season:        s.Season,
		Towns:         s.Towns,
		Villages:      s.Villages,
		Parties:       s.Parties,
		Leaders:       s.Leaders,
		Sides:         s.Sides,
		Routes:        s.Routes,
		Sieges:        s.Sieges,
		Wars:          s.Wars,
		Organizations: s.Organizations,
		Workshops:     s.Workshops,
		Notables:      s.Notables,
		Issues:        s.Issues,
		NextID:        s.NextID,
		Relations:     make(map[string]float64),
		SideRelations: make(map[string]float64),
	}
	for p, v := range s.Relations {
		sj.Relations[pairKey(p)] = v
	}
	for p, v := range s.SideRelations {
		sj.SideRelations[pairKey(p)] = v
	}
	return json.Marshal(sj)
}

func unmarshalState(data json.RawMessage) (*model.State, error) {
	var sj stateJSON
	if err := json.Unmarshal(data, &sj); err != nil {
		return nil, err
	}
	s := &model.State{
		Year:          sj.Year,
		Tick:          sj.Tick,
		Season:        sj.Season,
		Towns:         sj.Towns,
		Villages:      sj.Villages,
		Parties:       sj.Parties,
		Leaders:       sj.Leaders,
		Sides:         sj.Sides,
		Routes:        sj.Routes,
		Sieges:        sj.Sieges,
		Wars:          sj.Wars,
		Organizations: sj.Organizations,
		Workshops:     sj.Workshops,
		Notables:      sj.Notables,
		Issues:        sj.Issues,
		NextID:        sj.NextID,
		Relations:     make(map[model.Pair]float64),
		SideRelations: make(map[model.Pair]float64),
	}
	// Ensure non-nil maps.
	if s.Towns == nil {
		s.Towns = make(map[int]*model.Town)
	}
	if s.Parties == nil {
		s.Parties = make(map[int]*model.Party)
	}
	if s.Leaders == nil {
		s.Leaders = make(map[int]*model.Leader)
	}
	if s.NextID == nil {
		s.NextID = make(map[int]int)
	}
	for k, v := range sj.Relations {
		p, err := parsePairKey(k)
		if err != nil {
			return nil, fmt.Errorf("bad relation key %q: %w", k, err)
		}
		s.Relations[p] = v
	}
	for k, v := range sj.SideRelations {
		p, err := parsePairKey(k)
		if err != nil {
			return nil, fmt.Errorf("bad side relation key %q: %w", k, err)
		}
		s.SideRelations[p] = v
	}
	return s, nil
}
