package campaign

import (
	"context"
	"fmt"
	"sync"

	"mbclone/simulation/cmd/apiserver/wire"
)

// Battle-session lifecycle (stub).
//
// The full battle simulation is not yet implemented. These methods define
// the campaign-level contract the API handlers call; they currently return
// CodeUnimplemented so the client gets a structured error instead of a
// panic. The encounter/battle state machine will live here once the
// battle sim lands.
//
// Encounter flow:
//  1. CreateEncounter: two parties meet, encounter is pending.
//  2. ResolveEncounter: auto-resolve, encounter becomes resolved.
//     -- or --
//  2. StartBattle: escalate to real-time, encounter becomes escalated,
//     battle becomes active.
//  3. SubmitBattleOrders / GetBattle: live battle ticks.
//  4. EndBattle: battle ends, results written back to the campaign.

var errBattleUnimplemented = &Fault{
	Code:    CodeUnimplemented,
	Message: "battle sessions are not yet implemented",
	Reason:  "The battle system is still being built. Try auto-resolving for now.",
}

// CodeUnimplemented is the fault code for not-yet-built features.
const CodeUnimplemented = "unimplemented"

// encounterStore holds encounters and battles in memory. The campaign
// is single-process and in-memory already; this matches that model.
type encounterStore struct {
	mu         sync.Mutex
	encounters map[string]*wire.Encounter
	battles    map[string]*wire.Battle
	nextID     int
}

func newEncounterStore() *encounterStore {
	return &encounterStore{
		encounters: make(map[string]*wire.Encounter),
		battles:    make(map[string]*wire.Battle),
	}
}

func (st *encounterStore) nextEncounterID() string {
	st.nextID++
	return fmt.Sprintf("enc-%d", st.nextID)
}

func (st *encounterStore) nextBattleID() string {
	st.nextID++
	return fmt.Sprintf("battle-%d", st.nextID)
}

// CreateEncounter starts a pending encounter between two parties.
func (c *Campaign) CreateEncounter(ctx context.Context, attackerID, defenderID int) (*wire.Encounter, error) {
	return nil, errBattleUnimplemented
}

// GetEncounter returns an encounter by id.
func (c *Campaign) GetEncounter(ctx context.Context, id string) (*wire.Encounter, error) {
	return nil, errBattleUnimplemented
}

// ResolveEncounter auto-resolves a pending encounter.
func (c *Campaign) ResolveEncounter(ctx context.Context, id string) (*wire.Encounter, error) {
	return nil, errBattleUnimplemented
}

// StartBattle escalates a pending encounter into a live battle session.
func (c *Campaign) StartBattle(ctx context.Context, encounterID string) (*wire.Battle, error) {
	return nil, errBattleUnimplemented
}

// GetBattle returns the live state of a battle session.
func (c *Campaign) GetBattle(ctx context.Context, id string) (*wire.Battle, error) {
	return nil, errBattleUnimplemented
}

// SubmitBattleOrders applies the player's orders to a live battle.
func (c *Campaign) SubmitBattleOrders(ctx context.Context, id string, orders wire.BattleOrders) (*wire.Battle, error) {
	return nil, errBattleUnimplemented
}

// EndBattle ends a battle session and writes the result to the campaign.
func (c *Campaign) EndBattle(ctx context.Context, id string, reason string) (*wire.Battle, error) {
	return nil, errBattleUnimplemented
}
