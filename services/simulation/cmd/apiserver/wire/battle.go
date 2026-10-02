package wire

// Battle-session lifecycle wire types.
//
// An encounter is the campaign-level event: two forces meet. It can be
// auto-resolved immediately or escalated into a real-time battle session.
// A battle is the real-time session: the player issues orders, the
// simulation ticks, and the result is written back to the campaign.

// -- encounters -----------------------------------------------------------

// EncounterRequest starts an encounter. Either the player attacks a target
// or a target attacks the player; the campaign figures out which from the
// ids.
type EncounterRequest struct {
	// AttackerPartyID is the simulation id of the attacking party.
	AttackerPartyID int `json:"attackerPartyId"`
	// DefenderPartyID is the simulation id of the defending party.
	DefenderPartyID int `json:"defenderPartyId"`
}

// Encounter describes a pending or resolved encounter.
type Encounter struct {
	ID string `json:"id"`
	// Attacker and defender summaries for the pre-battle screen.
	Attacker EncounterSide `json:"attacker"`
	Defender EncounterSide `json:"defender"`
	// Status: "pending", "resolved", "escalated".
	Status string `json:"status"`
	// Resolution, when status is "resolved".
	Resolution *EncounterResolution `json:"resolution,omitempty"`
}

// EncounterSide is one side of an encounter.
type EncounterSide struct {
	PartyID int     `json:"partyId"`
	Name    string  `json:"name"`
	Troops  int     `json:"troops"`
	Power   float64 `json:"power"`
}

// EncounterResolution is the auto-resolve outcome.
type EncounterResolution struct {
	WinnerPartyID  int `json:"winnerPartyId"`
	AttackerLosses int `json:"attackerLosses"`
	DefenderLosses int `json:"defenderLosses"`
	// Loot taken by the winner, in the campaign's currency.
	Loot int `json:"loot"`
}

// ResolveRequest auto-resolves an encounter without a real-time battle.
type ResolveRequest struct {
	// Empty for now; the campaign resolves deterministically from the
	// encounter's forces. Reserved for future resolve options.
}

// -- leaving an encounter --------------------------------------------------

// FleeRequest breaks off an encounter without fighting it.
//
// The client used to send the position it wanted to escape to. It still does,
// and that field is deliberately ignored: where a party ends up after running
// away is a consequence of the world, and a client that may name its own
// position may put itself anywhere on the map. The simulation works the retreat
// out from the two parties' real positions instead.
type FleeRequest struct {
	// NpcPartyID names the force being fled from, as a party id or a name
	// slug, matching every other party reference on the wire.
	NpcPartyID string `json:"npcPartyId"`
	// NewPosition is the client's guess at an escape point. Accepted for
	// compatibility and not read. See the type comment.
	NewPosition *Point `json:"newPosition,omitempty"`
}

// PlayerDefeatRequest records the consequences of losing an encounter.
//
// LootTaken and PrisonersTaken are what the client's battle view asked for.
// They are ceilings, not decisions: the campaign takes what the player
// actually has, up to these figures, because the number a client asks for is
// not a number the world can honour.
type PlayerDefeatRequest struct {
	// NpcPartyID is the victorious force.
	NpcPartyID string `json:"npcPartyId"`
	// LootTaken is the most the winner may take, in the campaign's currency.
	LootTaken int `json:"lootTaken"`
	// PrisonersTaken is the most the winner may take prisoner.
	PrisonersTaken int `json:"prisonersTaken"`
}

// EncounterOutcomeResult is what leaving an encounter by flight or defeat
// actually cost. Every figure is measured after the tick committed, so the
// numbers here are the world's, not a prediction of them.
type EncounterOutcomeResult struct {
	// Outcome is "fled" or "defeated".
	Outcome string `json:"outcome"`
	// EnemyName is the force left behind, for the notification.
	EnemyName string `json:"enemyName"`
	// LootTaken is money the winner took from the player. Zero when fleeing.
	LootTaken int `json:"lootTaken"`
	// PrisonersTaken is how many of the player's soldiers were captured.
	PrisonersTaken int `json:"prisonersTaken"`
	// PlayerMorale is the party's morale after the outcome.
	PlayerMorale float64 `json:"playerMorale"`
	// EncounterIDs are the pending encounters this outcome closed. A party
	// that runs or loses is no longer meeting that force, so leaving them
	// pending would have the encounter poller raise the same fight again.
	EncounterIDs []string `json:"encounterIds"`
}

// -- battles ---------------------------------------------------------------

// BattleRequest escalates an encounter into a real-time battle session.
type BattleRequest struct {
	// EncounterID is the encounter to escalate. Must be pending.
	EncounterID string `json:"encounterId"`
}

// Battle is a live battle session.
type Battle struct {
	ID string `json:"id"`
	// EncounterID is the encounter this battle came from.
	EncounterID string `json:"encounterId"`
	// Status: "active", "ended".
	Status string `json:"status"`
	// Tick is the battle clock (battle ticks, not campaign ticks).
	Tick int `json:"tick"`
	// Sides mirrors the encounter sides with live troop counts.
	Attacker BattleSide `json:"attacker"`
	Defender BattleSide `json:"defender"`
}

// BattleSide is one side's live state in a battle.
type BattleSide struct {
	PartyID int     `json:"partyId"`
	Name    string  `json:"name"`
	Troops  int     `json:"troops"`
	Morale  float64 `json:"morale"`
}

// BattleOrders submits the player's orders for the next battle tick.
// The exact order set is intentionally small: the battle sim interprets
// these; the client does not need the full order language.
type BattleOrders struct {
	// Advance orders this side to push forward (0..1 intensity).
	Advance float64 `json:"advance,omitempty"`
	// Hold orders this side to hold position.
	Hold bool `json:"hold,omitempty"`
	// Retreat orders this side to withdraw. Ends the battle if both
	// sides retreat or one side's morale breaks.
	Retreat bool `json:"retreat,omitempty"`
	// FocusFire concentrates on the enemy's weakest unit group.
	FocusFire bool `json:"focusFire,omitempty"`
}

// BattleEndRequest ends a battle session and writes the result back.
type BattleEndRequest struct {
	// Reason: "victory", "defeat", "retreat", "timeout".
	Reason string `json:"reason"`
}
