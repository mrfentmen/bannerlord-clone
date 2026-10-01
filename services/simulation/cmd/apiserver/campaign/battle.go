package campaign

import (
	"context"
	"fmt"
	"sync"

	"mbclone/simulation/cmd/apiserver/wire"
)

// Battle-session lifecycle.
//
// Encounters are campaign-level events: two parties meet. They can be
// auto-resolved deterministically or escalated into a real-time battle
// session where the player issues orders each tick.
//
// The battle sim is intentionally simple and deterministic: power is
// derived from troops and morale, damage is proportional, and the only
// "randomness" comes from hashing the encounter/battle IDs (stable
// across runs with the same inputs).
//
// Encounter flow:
//  1. CreateEncounter: two parties meet, encounter is pending.
//  2. ResolveEncounter: auto-resolve, encounter becomes resolved.
//     -- or --
//  2. StartBattle: escalate to real-time, encounter becomes escalated,
//     battle becomes active.
//  3. SubmitBattleOrders / GetBattle: live battle ticks.
//  4. EndBattle: battle ends, results written back to the campaign state.

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

// lazyStore returns the campaign's encounter store, creating it on first use.
// The Campaign struct owns it; we stash it in a package-level map keyed by
// the campaign pointer because the struct is defined in campaign.go.
var (
	storesMu sync.Mutex
	stores   = make(map[*Campaign]*encounterStore)
)

func storeFor(c *Campaign) *encounterStore {
	storesMu.Lock()
	defer storesMu.Unlock()
	st, ok := stores[c]
	if !ok {
		st = newEncounterStore()
		stores[c] = st
	}
	return st
}

// partyPower computes a deterministic power score for a party.
// Power = troops * (0.5 + morale/200), so morale 0..100 scales 0.5x..1.0x.
func partyPower(troops, morale float64) float64 {
	if troops < 0 {
		troops = 0
	}
	if morale < 0 {
		morale = 0
	}
	if morale > 100 {
		morale = 100
	}
	return troops * (0.5 + morale/200.0)
}

// hashID deterministically hashes a string id to a float in [0,1).
// Used for the small deterministic variance in auto-resolve.
func hashID(id string) float64 {
	h := 0
	for _, c := range id {
		h = h*31 + int(c)
	}
	if h < 0 {
		h = -h
	}
	return float64(h%1000) / 1000.0
}

// CreateEncounter starts a pending encounter between two parties.
func (c *Campaign) CreateEncounter(ctx context.Context, attackerID, defenderID int) (*wire.Encounter, error) {
	c.mu.RLock()
	attacker, okA := c.state.Parties[attackerID]
	defender, okD := c.state.Parties[defenderID]
	c.mu.RUnlock()

	if !okA {
		return nil, &Fault{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("attacker party %d not found", attackerID),
			Reason:  "The attacking party does not exist.",
		}
	}
	if !okD {
		return nil, &Fault{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("defender party %d not found", defenderID),
			Reason:  "The defending party does not exist.",
		}
	}

	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	id := st.nextEncounterID()
	enc := &wire.Encounter{
		ID: id,
		Attacker: wire.EncounterSide{
			PartyID: attacker.ID,
			Name:    attacker.Name,
			Troops:  int(attacker.Troops),
			Power:   partyPower(attacker.Troops, attacker.Morale),
		},
		Defender: wire.EncounterSide{
			PartyID: defender.ID,
			Name:    defender.Name,
			Troops:  int(defender.Troops),
			Power:   partyPower(defender.Troops, defender.Morale),
		},
		Status: "pending",
	}
	st.encounters[id] = enc
	return enc, nil
}

// GetEncounter returns an encounter by id.
func (c *Campaign) GetEncounter(ctx context.Context, id string) (*wire.Encounter, error) {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	enc, ok := st.encounters[id]
	if !ok {
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("encounter %s not found", id),
			Reason:  "That encounter does not exist.",
		}
	}
	return enc, nil
}

// ResolveEncounter auto-resolves a pending encounter deterministically.
func (c *Campaign) ResolveEncounter(ctx context.Context, id string) (*wire.Encounter, error) {
	st := storeFor(c)
	st.mu.Lock()
	enc, ok := st.encounters[id]
	if !ok {
		st.mu.Unlock()
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("encounter %s not found", id),
			Reason:  "That encounter does not exist.",
		}
	}
	if enc.Status != "pending" {
		st.mu.Unlock()
		return nil, &Fault{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("encounter %s is %s, not pending", id, enc.Status),
			Reason:  "That encounter was already resolved.",
		}
	}

	// Deterministic auto-resolve: power ratio with a small hash-based
	// variance (±5%) so identical matchups don't always produce the
	// exact same casualty numbers.
	aPower := enc.Attacker.Power
	dPower := enc.Defender.Power
	variance := 0.95 + hashID(id)*0.10
	aPower *= variance
	dPower *= 2.0 - variance // defender gets the inverse variance

	attackerWins := aPower >= dPower
	totalPower := aPower + dPower
	if totalPower <= 0 {
		totalPower = 1
	}

	// Casualties: loser loses 30-60% of troops, winner loses 10-30%.
	// Scaled by how close the fight was.
	loserRate := 0.30 + 0.30*(1.0-hashID(id+"loser"))
	winnerRate := 0.10 + 0.20*hashID(id+"winner")

	var aLosses, dLosses int
	var winnerID int
	if attackerWins {
		winnerID = enc.Attacker.PartyID
		aLosses = int(float64(enc.Attacker.Troops) * winnerRate)
		dLosses = int(float64(enc.Defender.Troops) * loserRate)
	} else {
		winnerID = enc.Defender.PartyID
		dLosses = int(float64(enc.Defender.Troops) * winnerRate)
		aLosses = int(float64(enc.Attacker.Troops) * loserRate)
	}

	// Loot: 10% of the loser's money, deterministic.
	loot := 0
	c.mu.RLock()
	if attackerWins {
		if p, ok := c.state.Parties[enc.Defender.PartyID]; ok {
			loot = int(p.Money * 0.10)
		}
	} else {
		if p, ok := c.state.Parties[enc.Attacker.PartyID]; ok {
			loot = int(p.Money * 0.10)
		}
	}
	c.mu.RUnlock()

	enc.Status = "resolved"
	enc.Resolution = &wire.EncounterResolution{
		WinnerPartyID:  winnerID,
		AttackerLosses: aLosses,
		DefenderLosses: dLosses,
		Loot:           loot,
	}
	st.mu.Unlock()

	// Write the results back to the campaign state.
	c.mu.Lock()
	if p, ok := c.state.Parties[enc.Attacker.PartyID]; ok {
		p.Troops -= float64(aLosses)
		if p.Troops < 0 {
			p.Troops = 0
		}
		p.Morale -= 10
		if p.Morale < 0 {
			p.Morale = 0
		}
		if attackerWins {
			p.Money += float64(loot)
			p.Morale += 15
			if p.Morale > 100 {
				p.Morale = 100
			}
		}
	}
	if p, ok := c.state.Parties[enc.Defender.PartyID]; ok {
		p.Troops -= float64(dLosses)
		if p.Troops < 0 {
			p.Troops = 0
		}
		p.Morale -= 10
		if p.Morale < 0 {
			p.Morale = 0
		}
		if !attackerWins {
			p.Money += float64(loot)
			p.Morale += 15
			if p.Morale > 100 {
				p.Morale = 100
			}
		}
	}
	c.mu.Unlock()

	return enc, nil
}

// StartBattle escalates a pending encounter into a live battle session.
func (c *Campaign) StartBattle(ctx context.Context, encounterID string) (*wire.Battle, error) {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	enc, ok := st.encounters[encounterID]
	if !ok {
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("encounter %s not found", encounterID),
			Reason:  "That encounter does not exist.",
		}
	}
	if enc.Status != "pending" {
		return nil, &Fault{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("encounter %s is %s, not pending", encounterID, enc.Status),
			Reason:  "Only pending encounters can escalate to battle.",
		}
	}

	// Read current morale for the battle sides.
	c.mu.RLock()
	var aMorale, dMorale float64 = 50, 50
	if p, ok := c.state.Parties[enc.Attacker.PartyID]; ok {
		aMorale = p.Morale
	}
	if p, ok := c.state.Parties[enc.Defender.PartyID]; ok {
		dMorale = p.Morale
	}
	c.mu.RUnlock()

	id := st.nextBattleID()
	battle := &wire.Battle{
		ID:          id,
		EncounterID: encounterID,
		Status:      "active",
		Tick:        0,
		Attacker: wire.BattleSide{
			PartyID: enc.Attacker.PartyID,
			Name:    enc.Attacker.Name,
			Troops:  enc.Attacker.Troops,
			Morale:  aMorale,
		},
		Defender: wire.BattleSide{
			PartyID: enc.Defender.PartyID,
			Name:    enc.Defender.Name,
			Troops:  enc.Defender.Troops,
			Morale:  dMorale,
		},
	}
	st.battles[id] = battle
	enc.Status = "escalated"
	return battle, nil
}

// GetBattle returns the live state of a battle session.
func (c *Campaign) GetBattle(ctx context.Context, id string) (*wire.Battle, error) {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	battle, ok := st.battles[id]
	if !ok {
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("battle %s not found", id),
			Reason:  "That battle does not exist.",
		}
	}
	return battle, nil
}

// SubmitBattleOrders applies the player's orders and ticks the battle once.
// Combat is deterministic: each side deals damage proportional to its
// power, modified by orders. Morale drops as troops fall.
func (c *Campaign) SubmitBattleOrders(ctx context.Context, id string, orders wire.BattleOrders) (*wire.Battle, error) {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	battle, ok := st.battles[id]
	if !ok {
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("battle %s not found", id),
			Reason:  "That battle does not exist.",
		}
	}
	if battle.Status != "active" {
		return nil, &Fault{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("battle %s is %s, not active", id, battle.Status),
			Reason:  "That battle has already ended.",
		}
	}

	// Player orders apply to the attacker (the player's side).
	// The defender uses a simple deterministic AI: advance if stronger,
	// hold if weaker.
	aPower := partyPower(float64(battle.Attacker.Troops), battle.Attacker.Morale)
	dPower := partyPower(float64(battle.Defender.Troops), battle.Defender.Morale)

	// Order modifiers for the attacker.
	aMultiplier := 1.0
	if orders.Advance > 0 {
		aMultiplier += orders.Advance * 0.3 // up to +30% damage when advancing
	}
	if orders.Hold {
		aMultiplier *= 0.7 // holding trades damage for defense
	}
	if orders.FocusFire {
		aMultiplier *= 1.2
	}
	if orders.Retreat {
		// Retreat ends the battle immediately as a defender victory.
		battle.Status = "ended"
		return battle, nil
	}

	// Defender AI.
	dMultiplier := 1.0
	if dPower > aPower {
		dMultiplier = 1.2 // stronger side pushes
	} else {
		dMultiplier = 0.8 // weaker side holds
	}

	// Damage per tick: 2% of the attacker's power as raw troops, scaled.
	// Deterministic; no randomness.
	aDamage := int(aPower * 0.02 * aMultiplier)
	dDamage := int(dPower * 0.02 * dMultiplier)
	if aDamage < 1 && battle.Attacker.Troops > 0 {
		aDamage = 1
	}
	if dDamage < 1 && battle.Defender.Troops > 0 {
		dDamage = 1
	}

	battle.Defender.Troops -= aDamage
	battle.Attacker.Troops -= dDamage
	if battle.Defender.Troops < 0 {
		battle.Defender.Troops = 0
	}
	if battle.Attacker.Troops < 0 {
		battle.Attacker.Troops = 0
	}

	// Morale drops proportionally to casualties.
	battle.Attacker.Morale -= float64(dDamage) / (float64(battle.Attacker.Troops+dDamage) + 1) * 50
	battle.Defender.Morale -= float64(aDamage) / (float64(battle.Defender.Troops+aDamage) + 1) * 50
	if battle.Attacker.Morale < 0 {
		battle.Attacker.Morale = 0
	}
	if battle.Defender.Morale < 0 {
		battle.Defender.Morale = 0
	}

	battle.Tick++

	// Battle ends when one side is wiped or morale breaks.
	if battle.Attacker.Troops == 0 || battle.Attacker.Morale <= 0 ||
		battle.Defender.Troops == 0 || battle.Defender.Morale <= 0 {
		battle.Status = "ended"
	}

	return battle, nil
}

// EndBattle ends a battle session and writes the result to the campaign.
func (c *Campaign) EndBattle(ctx context.Context, id string, reason string) (*wire.Battle, error) {
	st := storeFor(c)
	st.mu.Lock()
	battle, ok := st.battles[id]
	if !ok {
		st.mu.Unlock()
		return nil, &Fault{
			Code:    CodeNotFound,
			Message: fmt.Sprintf("battle %s not found", id),
			Reason:  "That battle does not exist.",
		}
	}
	battle.Status = "ended"

	// Snapshot the results before releasing the store lock.
	aID, dID := battle.Attacker.PartyID, battle.Defender.PartyID
	aTroops, dTroops := battle.Attacker.Troops, battle.Defender.Troops
	aMorale, dMorale := battle.Attacker.Morale, battle.Defender.Morale
	encID := battle.EncounterID
	st.mu.Unlock()

	// Write back to the campaign state: set troop counts and morale,
	// mark the encounter resolved.
	c.mu.Lock()
	if p, ok := c.state.Parties[aID]; ok {
		p.Troops = float64(aTroops)
		p.Morale = aMorale
	}
	if p, ok := c.state.Parties[dID]; ok {
		p.Troops = float64(dTroops)
		p.Morale = dMorale
	}
	c.mu.Unlock()

	st.mu.Lock()
	if enc, ok := st.encounters[encID]; ok && enc.Status == "escalated" {
		enc.Status = "resolved"
		winnerID := aID
		if dTroops > aTroops {
			winnerID = dID
		}
		enc.Resolution = &wire.EncounterResolution{
			WinnerPartyID:  winnerID,
			AttackerLosses: enc.Attacker.Troops - aTroops,
			DefenderLosses: enc.Defender.Troops - dTroops,
			Loot:           0, // real-time battles don't auto-loot
		}
	}
	st.mu.Unlock()

	return battle, nil
}
