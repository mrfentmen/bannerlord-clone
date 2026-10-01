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
	PartyID int    `json:"partyId"`
	Name    string `json:"name"`
	Troops  int    `json:"troops"`
	Power   float64 `json:"power"`
}

// EncounterResolution is the auto-resolve outcome.
type EncounterResolution struct {
	WinnerPartyID int `json:"winnerPartyId"`
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
	PartyID int    `json:"partyId"`
	Name    string `json:"name"`
	Troops  int    `json:"troops"`
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
