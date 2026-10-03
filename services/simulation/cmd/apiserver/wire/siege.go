package wire

// SiegeRequest starts a siege of a town by an attacker party.
//
// It takes the town's and the party's own simulation ids, which is the shape the
// simulation's own tooling uses. The client's `startSiege` sends references instead,
// in TownSiegeRequest, because it names the town in the path and holds ids the rest of
// the campaign wrote as `town-41` and `party-7`.
type SiegeRequest struct {
	AttackerPartyID int `json:"attackerPartyId"`
	TownID          int `json:"townId"`
}

// TownSiegeRequest lays a siege on the town named in the path.
//
// It is the shape the client's `startSiege` speaks, and the reason it exists is that
// the provider method was fully implemented, fully tested against the fixture, and
// still had no route to call: every siege the player laid would have answered "that
// path is not part of the campaign API".
type TownSiegeRequest struct {
	// AttackerPartyIDs is the force doing the besieging, by id or name slug. The
	// client's fixture lets an army's parties lay a siege together; this server's
	// siege model names one attacking party, so the first entry is the besieger and
	// the rest are accepted and not read. An empty list is refused: a siege with
	// nobody laying it is not a siege.
	AttackerPartyIDs []string `json:"attackerPartyIds"`
	// ArmyID names the army the force belongs to. Accepted for compatibility and not
	// read, for the same reason FleeRequest's NewPosition is: this server has no army
	// to record it against, and a siege is the same siege whichever army laid it.
	ArmyID string `json:"armyId,omitempty"`
}

// TownSiegeResult is the answer to a laid siege: the id the assault and lift routes
// take. It is deliberately not the whole Siege — the client asks for the siege and
// then reads its state off GET /v1/sieges/{id}, which is the route that answers
// questions about a siege.
type TownSiegeResult struct {
	SiegeID string `json:"siegeId"`
}

// Siege is the public view of an active or resolved siege.
type Siege struct {
	ID              string `json:"id"`
	TownID          int    `json:"townId"`
	AttackerPartyID int    `json:"attackerPartyId"`
	DefenderRulerID int    `json:"defenderRulerId"`
	// Phase: preparing | bombarding | breached | assaulting | resolved
	Phase string `json:"phase"`
	// Outcome when resolved: ongoing | breached | gates_opened | lifted | starved | assault_won | assault_lost
	Outcome string  `json:"outcome"`
	Days    int     `json:"days"`
	WallHP  float64 `json:"wallHp"`
	// Food days of supply remaining for the garrison.
	Food float64 `json:"food"`
	// Attacker troop count at last tick.
	AttackerTroops int `json:"attackerTroops"`
	// Defender garrison estimate.
	DefenderTroops int `json:"defenderTroops"`
	// Equipment accumulated by the attacker.
	Equipment float64 `json:"equipment"`
	// Garrison morale 0..100.
	Morale float64 `json:"morale"`
	// GateRisk is surrender pressure 0..1.
	GateRisk float64 `json:"gateRisk"`
	// Breach progress 0..1 (legacy compatibility).
	Breach float64 `json:"breach"`
}

// SiegeAssaultRequest launches an assault on the besieged town.
type SiegeAssaultRequest struct {
	// Empty; reserved for future options (focus, etc.).
}

// SiegeLiftRequest lifts (abandons) the siege.
type SiegeLiftRequest struct {
	// Empty; reserved.
}
