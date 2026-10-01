package campaign

import (
	"context"
	"math"

	"mbclone/simulation/cmd/apiserver/wire"
)

// Encounter auto-trigger.
//
// This runs after each batch of simulation ticks. It scans all party pairs
// for hostile forces in proximity and creates encounters automatically.
// Without this, battles can only start via manual API calls — the game
// would never generate fights on its own.
//
// A pair triggers an encounter when:
//  1. Both parties have troops (> 0)
//  2. They are within encounterRange of each other
//  3. They are hostile: at war (via State.AtWar) or one is a raider
//  4. No pending encounter already exists for this pair
//
// The check runs under the campaign's write lock (called from pass()),
// so it uses the internal createEncounterLocked which skips the lock.

// encounterRange is the distance (in map units) within which hostile
// parties notice each other and an encounter triggers.
const encounterRange = 5.0

// checkEncountersLocked scans for hostile party pairs in proximity and
// creates encounters. The caller must hold c.mu (write lock).
func (c *Campaign) checkEncountersLocked() {
	st := storeFor(c)

	// Collect party IDs in deterministic order for stable encounter creation.
	ids := c.state.PartyIDs()

	for i := 0; i < len(ids); i++ {
		for j := i + 1; j < len(ids); j++ {
			a := c.state.Parties[ids[i]]
			b := c.state.Parties[ids[j]]

			if a == nil || b == nil {
				continue
			}
			if a.Troops <= 0 || b.Troops <= 0 {
				continue
			}

			// Proximity check.
			dx := a.X - b.X
			dy := a.Y - b.Y
			dist := math.Sqrt(dx*dx + dy*dy)
			if dist > encounterRange {
				continue
			}

			// Hostility check: at war, or one side is raiders.
			hostile := c.state.AtWar(a.SideID, b.SideID) || a.IsRaider || b.IsRaider
			if !hostile {
				continue
			}

			// Skip if there's already a pending encounter for this pair.
			if st.hasPendingEncounterFor(a.ID, b.ID) {
				continue
			}

			// Create the encounter. The attacker is the one who initiated
			// by moving (higher speed), or lower ID on tie for determinism.
			attackerID, defenderID := a.ID, b.ID
			if b.Speed > a.Speed || (b.Speed == a.Speed && b.ID < a.ID) {
				attackerID, defenderID = b.ID, a.ID
			}

			st.mu.Lock()
			id := st.nextEncounterID()
			enc := &wire.Encounter{
				ID: id,
				Attacker: wire.EncounterSide{
					PartyID: attackerID,
					Name:    c.state.Parties[attackerID].Name,
					Troops:  int(c.state.Parties[attackerID].Troops),
					Power:   partyPower(c.state.Parties[attackerID].Troops, c.state.Parties[attackerID].Morale),
				},
				Defender: wire.EncounterSide{
					PartyID: defenderID,
					Name:    c.state.Parties[defenderID].Name,
					Troops:  int(c.state.Parties[defenderID].Troops),
					Power:   partyPower(c.state.Parties[defenderID].Troops, c.state.Parties[defenderID].Morale),
				},
				Status: "pending",
			}
			st.encounters[id] = enc
			st.mu.Unlock()

			// Notify if the player's party is involved.
			// The client polls ListEncountersForParty to discover these.
			_ = enc
		}
	}
}

// hasPendingEncounterFor returns true if there's a pending encounter
// involving both party IDs (in either order).
func (st *encounterStore) hasPendingEncounterFor(aID, bID int) bool {
	st.mu.Lock()
	defer st.mu.Unlock()
	for _, enc := range st.encounters {
		if enc.Status != "pending" {
			continue
		}
		aMatch := enc.Attacker.PartyID == aID || enc.Defender.PartyID == aID
		bMatch := enc.Attacker.PartyID == bID || enc.Defender.PartyID == bID
		if aMatch && bMatch {
			return true
		}
	}
	return false
}

// ListEncountersForParty returns all encounters (pending or otherwise)
// involving the given party ID. The client polls this to discover
// auto-triggered encounters.
func (c *Campaign) ListEncountersForParty(ctx context.Context, partyID int) []*wire.Encounter {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	var out []*wire.Encounter
	for _, enc := range st.encounters {
		if enc.Attacker.PartyID == partyID || enc.Defender.PartyID == partyID {
			out = append(out, enc)
		}
	}
	return out
}
