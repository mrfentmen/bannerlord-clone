package campaign

import (
	"context"
	"math"
	"sort"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
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

	// Pairs that already have a pending encounter, read once per pass. Asking
	// the store per pair re-scanned the whole encounter list for every pair —
	// thousands of calls per pass, each looking at a list that only grows. One
	// scan answers every pair, and a pair created below is added here so later
	// pairs in the same pass see it exactly as the old live check did. Pairs are
	// keyed low-id-first so the two orders of the same pair are one entry.
	pending := make(map[[2]int]struct{})
	st.mu.Lock()
	for _, enc := range st.encounters {
		if enc.Status != "pending" {
			continue
		}
		a, b := enc.Attacker.PartyID, enc.Defender.PartyID
		if a > b {
			a, b = b, a
		}
		pending[[2]int{a, b}] = struct{}{}
	}
	st.mu.Unlock()

	// Sweep the parties that can fight in X order, and stop each inner loop once
	// the X gap alone is past the range. The previous version tested every pair —
	// there are hundreds of parties, so that was hundreds of thousands of distance
	// and AtWar checks on every tick, and it held the campaign lock long enough
	// that ordinary HTTP requests timed out behind it. The sweep visits exactly
	// the pairs that can be in range, so it creates the same encounters the full
	// scan would have created.
	parties := make([]*model.Party, 0, len(c.state.Parties))
	for _, id := range c.state.PartyIDs() {
		p := c.state.Parties[id]
		if p == nil || p.Troops <= 0 {
			continue
		}
		parties = append(parties, p)
	}
	sort.Slice(parties, func(i, j int) bool {
		if parties[i].X != parties[j].X {
			return parties[i].X < parties[j].X
		}
		return parties[i].ID < parties[j].ID
	})

	for i := 0; i < len(parties); i++ {
		a := parties[i]
		for j := i + 1; j < len(parties); j++ {
			b := parties[j]
			if b.X-a.X > encounterRange {
				break
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
			pairKey := [2]int{a.ID, b.ID}
			if pairKey[0] > pairKey[1] {
				pairKey[0], pairKey[1] = pairKey[1], pairKey[0]
			}
			if _, seen := pending[pairKey]; seen {
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
			pending[pairKey] = struct{}{}

			// Notify if the player's party is involved.
			// The client polls ListEncountersForParty to discover these.
			_ = enc
		}
	}
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
