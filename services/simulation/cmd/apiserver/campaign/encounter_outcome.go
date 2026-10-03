package campaign

// Leaving an encounter without winning it: running away, and losing.
//
// These are the two ways a fight ends that are not a fight. The client reports
// both, because the battle view is what knows the fight is over, and the
// campaign decides what they cost.
//
// Three things are decided here rather than accepted from the client, and the
// reasons are worth stating because each one is a case where taking the
// client's number would let the client rewrite the world:
//
//   - Where the party ends up. The client used to send the escape point it had
//     worked out, and FleeRequest still carries the field, but it is not read.
//     A client that may name its own position may put its party anywhere on the
//     map. The retreat is worked out here, from the two parties' real
//     positions.
//   - How much the loser is left with. LootTaken and PrisonersTaken arrive as
//     ceilings, and the campaign takes what the loser actually has, up to them.
//   - What the winner gains. Loot and prisoners are moved to the victor's
//     books rather than deleted. ResolveEncounter credits the winner; money that
//     vanishes would put the economy out of balance by the size of every defeat.
//
// The third thing, closing the encounter, is what stops the bug this file exists
// to prevent. The client polls GET /v1/encounters and keeps every encounter
// whose status is "pending", so a party that ran away and left the encounter
// pending would have the poller raise the same fight again on the next tick, for
// as long as the player kept running.
//
// These write committed state directly under the campaign's write lock, the way
// ResolveEncounter and EndBattle beside them do, rather than staging through the
// WriteSet. That is a deliberate match to the surrounding encounter lifecycle
// and not an oversight: an outcome is the world reporting what happened, not an
// order the player chose, and the alternatives were worse. A staged absolute
// write to position_x would be merged with the march system's additive move on
// the same field and summed, because the engine only rejects two absolute writes
// to one field, not one absolute and one additive.

import (
	"context"
	"math"
	"sort"
	"strings"

	"mbclone/simulation/cmd/apiserver/wire"
	"mbclone/simulation/internal/model"
)

// escapeRange is how far a party that breaks off an encounter is put from the
// force it left behind.
//
// It is twice encounterRange, which is the whole point of the number: the retreat
// has to finish outside the distance at which the auto-trigger raises an
// encounter, or a player who flees is met by the same force on the next tick and
// learns that running does not work.
const escapeRange = 2 * encounterRange

// fleeMoraleHit is what breaking off costs the party's morale, on the 0..100
// scale model.Party.Morale uses. It matches the 0.05 the client's own fixture
// provider takes, which is 5 on this scale, and it is smaller than the defeat
// hit because running is a lesser disaster than being beaten.
const fleeMoraleHit = 5.0

// defeatMoraleHit is what losing costs. It is the same 10 ResolveEncounter
// charges a losing side, so a battle resolved two ways costs the same morale.
const defeatMoraleHit = 10.0

// defeatLootShare is the share of the loser's money the winner takes. It is the
// tenth ResolveEncounter takes from whichever side lost, so the two ways of
// ending a fight cannot disagree about what a defeat is worth.
const defeatLootShare = 0.10

// FleeFromEncounter breaks off an encounter without fighting it.
//
// The party is put out of the enemy's reach, loses some morale, and any pending
// encounter with that force is closed. Nothing is taken: a party that gets away
// keeps its money and its soldiers, which is what makes flight worth choosing
// over a hopeless fight.
func (c *Campaign) FleeFromEncounter(ctx context.Context, req wire.FleeRequest) (any, error) {
	player, enemy, err := c.outcomePartiesLocked(req.NpcPartyID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	out := wire.EncounterOutcomeResult{
		Outcome:        "fled",
		EnemyName:      enemy.Name,
		LootTaken:      0,
		PrisonersTaken: 0,
	}
	// Clamped so a party already at zero cannot be pushed below it.
	player.Morale = clampMorale(player.Morale - fleeMoraleHit)
	out.PlayerMorale = round2(player.Morale)
	out.EncounterIDs = c.retreatFromLocked(player, enemy)
	return out, nil
}

// ApplyPlayerDefeat records the consequences of losing an encounter.
//
// The winner takes money and prisoners, both capped by what the loser actually
// has rather than by what the client asked for. The losers' soldiers are moved
// to the victor's ranks rather than struck off, because a prisoner is not a
// corpse. The party is then put out of reach and loses more morale than a
// flight costs.
func (c *Campaign) ApplyPlayerDefeat(ctx context.Context, req wire.PlayerDefeatRequest) (any, error) {
	if req.LootTaken < 0 {
		return nil, unprocessablef(
			"A victor takes money. It does not pay any out.",
			"lootTaken cannot be negative, got %d", req.LootTaken)
	}
	if req.PrisonersTaken < 0 {
		return nil, unprocessablef(
			"A victor takes soldiers. It does not return any.",
			"prisonersTaken cannot be negative, got %d", req.PrisonersTaken)
	}

	player, enemy, err := c.outcomePartiesLocked(req.NpcPartyID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Loot: the tenth of the purse a defeat costs, bounded by the ceiling the
	// client sent and by the money that is actually there.
	loot := player.Money * defeatLootShare
	if cap := float64(req.LootTaken); loot > cap {
		loot = cap
	}
	if loot < 0 {
		loot = 0
	}
	if loot > player.Money {
		loot = player.Money
	}
	player.Money -= loot
	enemy.Money += loot

	// Prisoners: wounded first, because they cannot run, then the healthy. The
	// count is what the loser actually has on the rolls, so a client asking for
	// fifty does not take fifty from a party of twelve.
	wanted := float64(req.PrisonersTaken)
	fromWounded := math.Min(player.Wounded, wanted)
	player.Wounded -= fromWounded
	wanted -= fromWounded
	fromHealthy := math.Min(player.Troops, wanted)
	player.Troops -= fromHealthy
	taken := int(fromWounded + fromHealthy)
	enemy.Troops += float64(taken)

	player.Morale = clampMorale(player.Morale - defeatMoraleHit)

	out := wire.EncounterOutcomeResult{
		Outcome:        "defeated",
		EnemyName:      enemy.Name,
		LootTaken:      int(loot),
		PrisonersTaken: taken,
		PlayerMorale:   round2(player.Morale),
	}
	out.EncounterIDs = c.retreatFromLocked(player, enemy)
	return out, nil
}

// outcomePartiesLocked resolves the two sides of an outcome: the player's party
// and the force being fled from or defeated.
//
// The enemy arrives as a name, because GET /v1/parties/nearby sends party names
// as ids, and partyByRef reads a name or an entity id either way.
func (c *Campaign) outcomePartiesLocked(ref string) (*model.Party, *model.Party, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, nil, badRequestf("the order names no force to run from: npcPartyId is required")
	}
	enemy, ok := c.partyByRef(ref)
	if !ok {
		return nil, nil, notFoundf("no party %q", ref)
	}
	player := c.state.Parties[c.party]
	if player == nil {
		return nil, nil, notFoundf("the player's party %d is not in this world", c.party)
	}
	if player.ID == enemy.ID {
		return nil, nil, unprocessablef("That is your own party.",
			"npcPartyId %q names the player's own party %d", ref, enemy.ID)
	}
	return player, enemy, nil
}

// retreatFromLocked puts a party out of reach of the force it just left, and
// closes the encounters that were pending between them.
//
// The caller holds the write lock. This is the shared tail of both outcomes:
// fleeing and losing leave the player in the same place relative to the enemy,
// apart from what was taken on the way.
func (c *Campaign) retreatFromLocked(player, enemy *model.Party) []string {
	// The escape vector points from the enemy to the party, so moving along it
	// increases the distance. Two parties standing on the same spot have no
	// vector, and the direction is fixed rather than random so that the same
	// world always retreats the same way: a retreat that landed somewhere
	// different on each attempt would make the same flee order unrepeatable.
	dx := player.X - enemy.X
	dy := player.Y - enemy.Y
	if dist := math.Hypot(dx, dy); dist < 1e-9 {
		dx, dy = 1, 0
	} else {
		dx, dy = dx/dist, dy/dist
	}
	player.X = enemy.X + dx*escapeRange
	player.Y = enemy.Y + dy*escapeRange
	// A party that breaks off is no longer on the road to wherever it was
	// going: leaving its intent set would have the march system walk it back
	// towards the force it just ran from.
	player.DestX, player.DestY = player.X, player.Y
	player.DaysOut = 0
	return c.closePendingEncountersWith(player.ID, enemy.ID)
}

// closePendingEncountersWith marks every pending encounter between two parties
// as resolved and returns their ids, oldest first.
//
// Sorted so the reply is the same set in the same order every time, which is
// what makes it readable in a log line and comparable in a test.
func (c *Campaign) closePendingEncountersWith(aID, bID int) []string {
	st := storeFor(c)
	st.mu.Lock()
	defer st.mu.Unlock()

	var ids []string
	for id, enc := range st.encounters {
		if enc == nil || enc.Status != "pending" {
			continue
		}
		aMatch := enc.Attacker.PartyID == aID || enc.Defender.PartyID == aID
		bMatch := enc.Attacker.PartyID == bID || enc.Defender.PartyID == bID
		if !aMatch || !bMatch {
			continue
		}
		enc.Status = "resolved"
		// Resolution is left nil: the client shows it for a fight that was
		// actually fought, and inventing a winner for a party that ran away
		// would be a battle that never happened.
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// clampMorale keeps morale inside 0..100, which is the range partyPower assumes
// and the range the client's morale bar reads.
func clampMorale(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
