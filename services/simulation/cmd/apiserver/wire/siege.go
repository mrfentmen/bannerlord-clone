package wire

// SiegeRequest starts a siege of a town by an attacker party.
type SiegeRequest struct {
	AttackerPartyID int `json:"attackerPartyId"`
	TownID          int `json:"townId"`
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
