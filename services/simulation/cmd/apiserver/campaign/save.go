package campaign

// Authoritative save/load for a running campaign.
//
// The apiserver's periodic snapshot is an inspection record for the client,
// not a save game: it cannot restore the world. Save captures everything that
// makes this campaign this campaign:
//
//   - the full model.State (every entity, ID allocator, relation matrix, oath)
//   - the engine's RNG stream position, so the future stays deterministic
//   - the cause log, so the why-view keeps its history
//   - the bandit runtime, the only simulation state outside model.State
//   - the player's identity, character sheet, roster, market history, and
//     notifications
//   - open encounters and battles
//
// A save is refused while orders sit queued: an order references the live
// tick, and restoring under it would either drop the order or apply it to a
// world it was never meant for. The caller retries after the next tick.

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/cause"
	"mbclone/simulation/internal/model"
	"mbclone/simulation/internal/systems/bandit"
)

// saveFileVersion is the on-disk version. Bump it when saveFile changes;
// Load refuses versions it does not understand.
const saveFileVersion = 1

// characterSave mirrors character's unexported fields for JSON.
type characterSave struct {
	Set          bool               `json:"set"`
	FirstName    string             `json:"firstName"`
	LastName     string             `json:"lastName"`
	Gender       string             `json:"gender"`
	AppearanceID string             `json:"appearanceID"`
	EthnicityID  string             `json:"ethnicityID"`
	Age          float64            `json:"age"`
	StartCity    string             `json:"startCity"`
	Difficulty   string             `json:"difficulty"`
	Backgrounds  map[string]string  `json:"backgrounds"`
	Bonus        map[string]float64 `json:"bonus"`
	Skills       map[string]float64 `json:"skills"`
	StartingCash float64            `json:"startingCash"`
	Biography    string             `json:"biography"`
}

func (c character) save() characterSave {
	return characterSave{
		Set: c.set, FirstName: c.firstName, LastName: c.lastName,
		Gender: c.gender, AppearanceID: c.appearanceID, EthnicityID: c.ethnicityID,
		Age: c.age, StartCity: c.startCity, Difficulty: c.difficulty,
		Backgrounds: c.backgrounds, Bonus: c.bonus, Skills: c.skills,
		StartingCash: c.startingCash, Biography: c.biography,
	}
}

func (s characterSave) load() character {
	return character{
		set: s.Set, firstName: s.FirstName, lastName: s.LastName,
		gender: s.Gender, appearanceID: s.AppearanceID, ethnicityID: s.EthnicityID,
		age: s.Age, startCity: s.StartCity, difficulty: s.Difficulty,
		backgrounds: s.Backgrounds, bonus: s.Bonus, skills: s.Skills,
		startingCash: s.StartingCash, biography: s.Biography,
	}
}

// rosterSave mirrors the roster's unexported shape. stack and goodHold have
// exported fields, so they serialize directly.
type rosterSave struct {
	Stacks     []*stack             `json:"stacks"`
	Goods      map[string]*goodHold `json:"goods"`
	MarchStart int                  `json:"marchStart"`
}

// priceSeriesSave mirrors priceSeries for JSON.
type priceSeriesSave struct {
	Last     float64           `json:"last"`
	Previous float64           `json:"previous"`
	Seen     int               `json:"seen"`
	Points   []wire.PricePoint `json:"points"`
	Limit    int               `json:"limit"`
}

func marketKeyString(k marketKey) string {
	return strconv.Itoa(k.town) + ":" + k.good
}

func parseMarketKey(s string) (marketKey, error) {
	i := strings.Index(s, ":")
	if i < 0 {
		return marketKey{}, fmt.Errorf("save: bad market key %q", s)
	}
	town, err := strconv.Atoi(s[:i])
	if err != nil {
		return marketKey{}, fmt.Errorf("save: bad market key %q: %v", s, err)
	}
	return marketKey{town: town, good: s[i+1:]}, nil
}

// campaignSave is the runner-side half of a save file: everything the
// Campaign owns that model.State does not already carry.
type campaignSave struct {
	Scale       float64 `json:"scale"`
	Acc         float64 `json:"acc"`
	TicksRun    int     `json:"ticksRun"`
	SnapshotAt  int     `json:"snapshotAt"`
	PlayerRuler int     `json:"playerRuler"`
	HomeTown    int     `json:"homeTown"`
	Party       int     `json:"party"`

	Character   characterSave              `json:"character"`
	Roster      rosterSave                 `json:"roster"`
	History     map[string]priceSeriesSave `json:"history"`
	Notifs      []wire.Notification        `json:"notifs"`
	NotifSeq    int                        `json:"notifSeq"`
	SeenRow     map[int]bool               `json:"seenRow"`
	SkippedDays int                        `json:"skippedDays"`
}

// encounterSave carries the open encounters and battles. wire types are
// JSON-ready.
type encounterSave struct {
	Encounters map[string]*wire.Encounter `json:"encounters"`
	Battles    map[string]*wire.Battle    `json:"battles"`
	NextID     int                        `json:"nextID"`
}

// prisonerSave mirrors prisonerState for JSON. Prisoner has exported fields,
// so it serializes directly.
type prisonerSave struct {
	ByID      map[string]*Prisoner `json:"byID"`
	Order     []string             `json:"order"`
	NextID    int                  `json:"nextID"`
	LastMercy bool                 `json:"lastMercy"`
	Fear      float64              `json:"fear"`
}

// companionSave mirrors companionState for JSON. Companion has exported
// fields, so it serializes directly.
type companionSave struct {
	ByID        map[string]*Companion `json:"byID"`
	Hired       []string              `json:"hired"`
	BattlesWon  int                   `json:"battlesWon"`
	TavernCache map[int][]string      `json:"tavernCache"`
}

func snapshotPrisoners(c *Campaign) *prisonerSave {
	prisonerStatesMu.Lock()
	defer prisonerStatesMu.Unlock()
	out := &prisonerSave{ByID: map[string]*Prisoner{}}
	ps, ok := prisonerStates[c]
	if !ok {
		return out
	}
	out.Order = append([]string(nil), ps.order...)
	out.NextID = ps.nextID
	out.LastMercy = ps.lastMercy
	out.Fear = ps.fear
	for id, p := range ps.byID {
		cp := *p
		out.ByID[id] = &cp
	}
	return out
}

func restorePrisoners(c *Campaign, s *prisonerSave) {
	if s == nil {
		return
	}
	ps := newPrisonerState()
	ps.order = append([]string(nil), s.Order...)
	ps.nextID = s.NextID
	ps.lastMercy = s.LastMercy
	ps.fear = s.Fear
	for id, p := range s.ByID {
		cp := *p
		ps.byID[id] = &cp
	}
	prisonerStatesMu.Lock()
	defer prisonerStatesMu.Unlock()
	prisonerStates[c] = ps
}

func snapshotCompanions(c *Campaign) *companionSave {
	companionStatesMu.Lock()
	defer companionStatesMu.Unlock()
	out := &companionSave{
		ByID:        map[string]*Companion{},
		TavernCache: map[int][]string{},
	}
	cs, ok := companionStates[c]
	if !ok {
		return out
	}
	out.Hired = append([]string(nil), cs.hired...)
	out.BattlesWon = cs.battlesWon
	for id, cp := range cs.byID {
		dup := *cp
		dup.Traits = append([]string(nil), cp.Traits...)
		dup.Skills = copyIntMap(cp.Skills)
		out.ByID[id] = &dup
	}
	for t, ids := range cs.tavernCache {
		out.TavernCache[t] = append([]string(nil), ids...)
	}
	return out
}

func restoreCompanions(c *Campaign, s *companionSave) {
	if s == nil {
		return
	}
	cs := &companionState{
		byID:        make(map[string]*Companion, len(s.ByID)),
		hired:       append([]string(nil), s.Hired...),
		battlesWon:  s.BattlesWon,
		tavernCache: make(map[int][]string, len(s.TavernCache)),
	}
	for id, cp := range s.ByID {
		dup := *cp
		dup.Traits = append([]string(nil), cp.Traits...)
		dup.Skills = copyIntMap(cp.Skills)
		cs.byID[id] = &dup
	}
	for t, ids := range s.TavernCache {
		cs.tavernCache[t] = append([]string(nil), ids...)
	}
	companionStatesMu.Lock()
	defer companionStatesMu.Unlock()
	companionStates[c] = cs
}

func copyIntMap(m map[string]int) map[string]int {
	if m == nil {
		return nil
	}
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// saveFile is the whole save on disk.
type saveFile struct {
	Format     string                  `json:"format"`
	Version    int                     `json:"version"`
	Seed       uint64                  `json:"seed"`
	RNGState   uint64                  `json:"rngState"`
	World      json.RawMessage         `json:"world"`
	Cause      cause.LogData           `json:"cause"`
	Bandits    *bandit.RuntimeSnapshot `json:"bandits"`
	Prisoners  *prisonerSave           `json:"prisoners"`
	Companions *companionSave          `json:"companions"`
	Campaign   campaignSave            `json:"campaign"`
	Encounters encounterSave           `json:"encounters"`
}

// errSaveBusy is returned when a save or load is attempted with orders queued.
var errSaveBusy = errors.New("save refused: orders are still queued; wait for the next tick and retry")

// Save serializes the whole campaign. It takes the read lock, so it is safe
// to call while the clock is running; the world it captures is tick-atomic.
func (c *Campaign) Save() ([]byte, error) {
	if n := len(c.pending); n > 0 {
		return nil, fmt.Errorf("%w (%d queued)", errSaveBusy, n)
	}
	c.mu.RLock()
	defer c.mu.RUnlock()

	world, err := json.Marshal(c.state)
	if err != nil {
		return nil, fmt.Errorf("save: world: %w", err)
	}

	history := make(map[string]priceSeriesSave, len(c.history))
	for k, ps := range c.history {
		history[marketKeyString(k)] = priceSeriesSave{
			Last: ps.last, Previous: ps.previous, Seen: ps.seen,
			Points: append([]wire.PricePoint(nil), ps.points...), Limit: ps.limit,
		}
	}

	ro := rosterSave{MarchStart: -1}
	if c.ro != nil {
		ro = rosterSave{
			Stacks:     append([]*stack(nil), c.ro.stacks...),
			Goods:      make(map[string]*goodHold, len(c.ro.goods)),
			MarchStart: c.ro.marchStart,
		}
		for g, h := range c.ro.goods {
			cp := *h
			ro.Goods[g] = &cp
		}
	}

	st := storeFor(c)
	st.mu.Lock()
	enc := encounterSave{
		Encounters: make(map[string]*wire.Encounter, len(st.encounters)),
		Battles:    make(map[string]*wire.Battle, len(st.battles)),
		NextID:     st.nextID,
	}
	for id, e := range st.encounters {
		cp := *e
		enc.Encounters[id] = &cp
	}
	for id, b := range st.battles {
		cp := *b
		enc.Battles[id] = &cp
	}
	st.mu.Unlock()

	sf := saveFile{
		Format:     "mbclone-save",
		Version:    saveFileVersion,
		Seed:       c.opts.Seed,
		RNGState:   c.eng.RNGState(),
		World:      world,
		Cause:      c.log.Export(),
		Bandits:    bandit.SnapshotRuntime(),
		Prisoners:  snapshotPrisoners(c),
		Companions: snapshotCompanions(c),
		Campaign: campaignSave{
			Scale: c.scale, Acc: c.acc, TicksRun: c.ticksRun,
			SnapshotAt:  c.snapshotAt,
			PlayerRuler: c.playerRuler, HomeTown: c.homeTown, Party: c.party,
			Character: c.character.save(), Roster: ro, History: history,
			Notifs:      append([]wire.Notification(nil), c.notifs...),
			NotifSeq:    c.notifSeq,
			SeenRow:     copySeenRow(c.seenRow),
			SkippedDays: c.skippedDays,
		},
		Encounters: enc,
	}
	return json.Marshal(sf)
}

func copySeenRow(m map[int]bool) map[int]bool {
	out := make(map[int]bool, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// Load restores a campaign from bytes previously produced by Save. It takes
// the write lock, so the tick loop pauses while the world is swapped; the
// swap itself is atomic from the tick's point of view.
func (c *Campaign) Load(data []byte) error {
	if n := len(c.pending); n > 0 {
		return fmt.Errorf("%w (%d queued)", errSaveBusy, n)
	}
	var sf saveFile
	if err := json.Unmarshal(data, &sf); err != nil {
		return fmt.Errorf("load: %w", err)
	}
	if sf.Format != "mbclone-save" {
		return fmt.Errorf("load: not a save file (format %q)", sf.Format)
	}
	if sf.Version != saveFileVersion {
		return fmt.Errorf("load: version %d not supported (this build reads %d)",
			sf.Version, saveFileVersion)
	}

	world, err := unmarshalWorld(sf.World)
	if err != nil {
		return err
	}
	history := make(map[marketKey]*priceSeries, len(sf.Campaign.History))
	for ks, ps := range sf.Campaign.History {
		k, err := parseMarketKey(ks)
		if err != nil {
			return err
		}
		history[k] = &priceSeries{
			last: ps.Last, previous: ps.Previous, seen: ps.Seen,
			points: append([]wire.PricePoint(nil), ps.Points...), limit: ps.Limit,
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.state = world
	c.eng.RestoreRNGState(sf.RNGState)
	c.log.Import(sf.Cause)
	bandit.RestoreRuntime(sf.Bandits)
	restorePrisoners(c, sf.Prisoners)
	restoreCompanions(c, sf.Companions)

	cs := sf.Campaign
	c.scale, c.acc, c.ticksRun = cs.Scale, cs.Acc, cs.TicksRun
	c.snapshotAt = cs.SnapshotAt
	c.playerRuler, c.homeTown, c.party = cs.PlayerRuler, cs.HomeTown, cs.Party
	c.character = cs.Character.load()
	c.ro = &roster{
		stacks:     append([]*stack(nil), cs.Roster.Stacks...),
		goods:      make(map[string]*goodHold, len(cs.Roster.Goods)),
		marchStart: cs.Roster.MarchStart,
	}
	for g, h := range cs.Roster.Goods {
		cp := *h
		c.ro.goods[g] = &cp
	}
	c.history = history
	c.notifs = append([]wire.Notification(nil), cs.Notifs...)
	c.notifSeq = cs.NotifSeq
	c.seenRow = copySeenRow(cs.SeenRow)
	c.skippedDays = cs.SkippedDays
	// A load is a fresh start for error state: the saved world was good when
	// it was captured.
	c.lastErr = nil

	st := storeFor(c)
	st.mu.Lock()
	st.encounters = make(map[string]*wire.Encounter, len(sf.Encounters.Encounters))
	st.battles = make(map[string]*wire.Battle, len(sf.Encounters.Battles))
	for id, e := range sf.Encounters.Encounters {
		cp := *e
		st.encounters[id] = &cp
	}
	for id, b := range sf.Encounters.Battles {
		cp := *b
		st.battles[id] = &cp
	}
	st.nextID = sf.Encounters.NextID
	st.mu.Unlock()

	return nil
}

// unmarshalWorld restores a model.State from its save JSON.
func unmarshalWorld(data []byte) (*model.State, error) {
	var s model.State
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("load: world: %w", err)
	}
	return &s, nil
}
