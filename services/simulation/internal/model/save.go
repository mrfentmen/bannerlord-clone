package model

// Authoritative save/load for model.State.
//
// The apiserver's periodic snapshot is an inspection record, not a save game:
// it carries a wire read model (towns, roster, cause rows) and cannot restore
// the world. These methods serialize the FULL State — every entity map, the ID
// allocators, both relation matrices, and the oath table — so a server restart
// can restore the exact world. See task 121 spec (SAVE-FORMAT-SPEC.md).
//
// Format: JSON object with a format tag and version. Relation maps use "A:B"
// string keys because encoding/json cannot marshal struct map keys. The two
// unexported pair caches are excluded; SortedPairs rebuilds them lazily.

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// saveFormatVersion is the current on-disk version. Bump it whenever the
// saveState shape changes; UnmarshalJSON refuses versions it does not know.
const saveFormatVersion = 1

// saveState is the JSON shape of a State on disk. It mirrors State field for
// field except the relation maps, which use string keys, and the unexported
// caches, which are omitted.
type saveState struct {
	Format        string             `json:"format"`
	Version       int                `json:"version"`
	Year          float64            `json:"year"`
	Tick          int                `json:"tick"`
	Season        float64            `json:"season"`
	Towns         map[int]*Town      `json:"towns"`
	Villages      map[int]*Village   `json:"villages"`
	Parties       map[int]*Party     `json:"parties"`
	Rulers        map[int]*Ruler     `json:"rulers"`
	Sides         map[int]*Side      `json:"sides"`
	Routes        map[int]*Route     `json:"routes"`
	Sieges        map[int]*Siege     `json:"sieges"`
	Wars          map[int]*War       `json:"wars"`
	NextID        map[int]int        `json:"nextID"`
	Relations     map[string]float64 `json:"relations"`
	SideRelations map[string]float64 `json:"sideRelations"`
	Oaths         map[int]Oath       `json:"oaths"`
}

// pairKey encodes a normalized Pair as "A:B".
func pairKey(p Pair) string {
	return strconv.Itoa(p.A) + ":" + strconv.Itoa(p.B)
}

// parsePairKey decodes an "A:B" key, rejecting malformed or denormalized pairs.
func parsePairKey(k string) (Pair, error) {
	parts := strings.Split(k, ":")
	if len(parts) != 2 {
		return Pair{}, fmt.Errorf("save: bad pair key %q", k)
	}
	a, err := strconv.Atoi(parts[0])
	if err != nil {
		return Pair{}, fmt.Errorf("save: bad pair key %q: %v", k, err)
	}
	b, err := strconv.Atoi(parts[1])
	if err != nil {
		return Pair{}, fmt.Errorf("save: bad pair key %q: %v", k, err)
	}
	if a > b {
		return Pair{}, fmt.Errorf("save: denormalized pair key %q", k)
	}
	return Pair{A: a, B: b}, nil
}

func encodePairs(m map[Pair]float64) map[string]float64 {
	out := make(map[string]float64, len(m))
	for k, v := range m {
		out[pairKey(k)] = v
	}
	return out
}

func decodePairs(m map[string]float64) (map[Pair]float64, error) {
	out := make(map[Pair]float64, len(m))
	for k, v := range m {
		p, err := parsePairKey(k)
		if err != nil {
			return nil, err
		}
		out[p] = v
	}
	return out, nil
}

// MarshalJSON serializes the full State. Nil maps become empty objects, never
// null, so a restored State is always usable without nil checks.
func (s State) MarshalJSON() ([]byte, error) {
	ss := saveState{
		Format:        "mbclone-save",
		Version:       saveFormatVersion,
		Year:          s.Year,
		Tick:          s.Tick,
		Season:        s.Season,
		Towns:         nonNilTowns(s.Towns),
		Villages:      nonNilVillages(s.Villages),
		Parties:       nonNilParties(s.Parties),
		Rulers:        nonNilRulers(s.Rulers),
		Sides:         nonNilSides(s.Sides),
		Routes:        nonNilRoutes(s.Routes),
		Sieges:        nonNilSieges(s.Sieges),
		Wars:          nonNilWars(s.Wars),
		NextID:        nonNilNextID(s.NextID),
		Relations:     encodePairs(s.Relations),
		SideRelations: encodePairs(s.SideRelations),
		Oaths:         nonNilOaths(s.Oaths),
	}
	return json.Marshal(ss)
}

// UnmarshalJSON restores a State. Unknown versions and malformed pair keys are
// hard errors: a save that cannot be trusted must not boot a world.
func (s *State) UnmarshalJSON(data []byte) error {
	var ss saveState
	if err := json.Unmarshal(data, &ss); err != nil {
		return err
	}
	if ss.Format != "mbclone-save" {
		return fmt.Errorf("save: not a save file (format %q)", ss.Format)
	}
	if ss.Version != saveFormatVersion {
		return fmt.Errorf("save: version %d not supported (this build reads %d)",
			ss.Version, saveFormatVersion)
	}
	rel, err := decodePairs(ss.Relations)
	if err != nil {
		return err
	}
	srel, err := decodePairs(ss.SideRelations)
	if err != nil {
		return err
	}
	*s = State{
		Year:          ss.Year,
		Tick:          ss.Tick,
		Season:        ss.Season,
		Towns:         nonNilTowns(ss.Towns),
		Villages:      nonNilVillages(ss.Villages),
		Parties:       nonNilParties(ss.Parties),
		Rulers:        nonNilRulers(ss.Rulers),
		Sides:         nonNilSides(ss.Sides),
		Routes:        nonNilRoutes(ss.Routes),
		Sieges:        nonNilSieges(ss.Sieges),
		Wars:          nonNilWars(ss.Wars),
		NextID:        nonNilNextID(ss.NextID),
		Relations:     rel,
		SideRelations: srel,
		Oaths:         nonNilOaths(ss.Oaths),
		// rulerPairs / sidePairs stay nil: SortedPairs rebuilds them lazily.
	}
	return nil
}

func nonNilTowns(m map[int]*Town) map[int]*Town {
	if m == nil {
		return map[int]*Town{}
	}
	return m
}

func nonNilVillages(m map[int]*Village) map[int]*Village {
	if m == nil {
		return map[int]*Village{}
	}
	return m
}

func nonNilParties(m map[int]*Party) map[int]*Party {
	if m == nil {
		return map[int]*Party{}
	}
	return m
}

func nonNilRulers(m map[int]*Ruler) map[int]*Ruler {
	if m == nil {
		return map[int]*Ruler{}
	}
	return m
}

func nonNilSides(m map[int]*Side) map[int]*Side {
	if m == nil {
		return map[int]*Side{}
	}
	return m
}

func nonNilRoutes(m map[int]*Route) map[int]*Route {
	if m == nil {
		return map[int]*Route{}
	}
	return m
}

func nonNilSieges(m map[int]*Siege) map[int]*Siege {
	if m == nil {
		return map[int]*Siege{}
	}
	return m
}

func nonNilWars(m map[int]*War) map[int]*War {
	if m == nil {
		return map[int]*War{}
	}
	return m
}

func nonNilNextID(m map[int]int) map[int]int {
	if m == nil {
		return map[int]int{}
	}
	return m
}

func nonNilOaths(m map[int]Oath) map[int]Oath {
	if m == nil {
		return map[int]Oath{}
	}
	return m
}
