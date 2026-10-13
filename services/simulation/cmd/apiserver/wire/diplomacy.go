package wire

// The diplomacy shapes, transcribed from `War` in
// `clients/campaign/src/data/types.ts` and from the three acts a player can
// perform on a war.
//
// The translation here is not mechanical and is worth stating once. The client's
// War is written from the player's point of view: it names an attacker and a
// defender and it counts a 0-100 exhaustion and two war scores. The model's War
// is symmetric — a pair of side ids, an intensity, a battle count and an end
// tick — and it belongs to the faction AI, which declares most of the wars in
// this world rather than the player. So this file decides, once, which of the
// two sides is "the attacker" for the client's purposes, and every field the
// client reads is derived from a real model field rather than invented to fill
// the client's shape.

// War is one war, as the client sees it.
//
// The player's side is the defender when the model has no side to blame, so a
// war the AI started against the player reads as "defender: you", which is the
// only reading a player can act on.
type War struct {
	ID                string `json:"id"`
	AttackerFactionID string `json:"attackerFactionId"`
	DefenderFactionID string `json:"defenderFactionId"`
	StartDay          int    `json:"startDay"`
	// Exhaustion is the 0-100 war weariness of the two sides averaged, because
	// the client shows one bar and a war is exhausted when both sides are. The
	// model's weariness is a 0-1 fraction per side; the client's is 0-100.
	Exhaustion float64 `json:"exhaustion"`
	// AttackerScore and DefenderScore are the war's battle counts apportioned to
	// each side: the model's War.Battles is one number for the war, so each side
	// is credited with its share of the battles it fought in. They are not
	// invented scores; they are the same battles counted from two ends.
	AttackerScore int `json:"attackerScore"`
	DefenderScore int `json:"defenderScore"`
	// Active is false once the war has an end tick. The client's War has no such
	// field, because the client deletes a war from its list when peace lands;
	// this server keeps ended wars so the journal can say when one finished.
	Active bool `json:"active"`
	// Reason is the model's WarReason as a sentence: why this war started. It is
	// the player's first question about a war they did not start.
	Reason string `json:"reason"`
	// ReasonCode is the same reason as the model's enum value, so a client can
	// branch on it without parsing prose.
	ReasonCode int `json:"reasonCode"`
	// EndDay is the day the war ended, or -1 while it is running.
	EndDay int `json:"endDay"`
	// PlayerIsAttacker says which side of the war the player is on. The client
	// needs it because the client's War is not symmetric and the player has to
	// know which of the two ids is theirs.
	PlayerIsAttacker bool `json:"playerIsAttacker"`
}

// WarListResult answers GET /v1/wars.
//
// Active and Ended are separate for the same reason quests separate offers from
// jobs: a client asking "what am I fighting" and a client asking "what has
// happened to me" are asking different things.
type WarListResult struct {
	Active []War `json:"active"`
	Ended  []War `json:"ended"`
	// AtWarWith is every other faction's id, for the faction list the diplomacy
	// panel draws. It is the whole list rather than the wars, because a faction
	// you are at peace with is still a faction you can declare on.
	AtWarWith []string `json:"atWarWith"`
	// AlliedWith is the factions standing in a formal alliance with the player.
	AlliedWith []string `json:"alliedWith"`
	// PlayerFactionID is the player's own side, because the client builds
	// faction keys from its own list and needs to know which one is the player.
	PlayerFactionID string `json:"playerFactionId"`
}

// DeclareWarRequest is POST /v1/wars. The target is named by the client's own
// faction id, which is the settlement-slug-plus-side form its faction list uses.
type DeclareWarRequest struct {
	TargetFactionID string `json:"targetFactionId"`
}

// DeclareWarResult answers POST /v1/wars.
type DeclareWarResult struct {
	WarID   string `json:"warId"`
	War     War    `json:"war"`
	Summary string `json:"summary"`
	// Accepted is false when the declaration was refused. Declaring war on your
	// own faction, or on one you are already fighting, is a decision the
	// simulation made against a well-formed order rather than a failure, so it
	// is a 200 with accepted false and a sentence. That is the same shape the
	// trade and recruit orders already use.
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

// SuePeaceResult answers POST /v1/wars/{id}/peace.
type SuePeaceResult struct {
	WarID    string `json:"warId"`
	War      War    `json:"war"`
	Summary  string `json:"summary"`
	Accepted bool   `json:"accepted"`
	Reason   string `json:"reason,omitempty"`
}

// PayTributeRequest is POST /v1/diplomacy/tribute.
type PayTributeRequest struct {
	TargetFactionID string `json:"targetFactionId"`
}

// PayTributeResult answers POST /v1/diplomacy/tribute.
//
// Amount is the tribute demanded and Paid is what was actually transferred. They
// differ when the treasury moved between the quote and the payment, which is why
// both are reported rather than one being reported as the other. WarID and EndDay
// are the war the payment stood down, and -1 when there was none: a tribute paid
// into a peace is money gone for nothing, and a client should be able to see that.
type PayTributeResult struct {
	TargetFactionID   string  `json:"targetFactionId"`
	TargetFactionName string  `json:"targetFactionName"`
	Amount            float64 `json:"amount"`
	Paid              float64 `json:"paid"`
	WarID             string  `json:"warId"`
	EndDay            int     `json:"endDay"`
	Summary           string  `json:"summary"`
	Accepted          bool    `json:"accepted"`
	Reason            string  `json:"reason,omitempty"`
}

// FormAllianceRequest is POST /v1/diplomacy/alliance.
type FormAllianceRequest struct {
	TargetFactionID string `json:"targetFactionId"`
}

// FormAllianceResult answers POST /v1/diplomacy/alliance.
type FormAllianceResult struct {
	TargetFactionID   string  `json:"targetFactionId"`
	TargetFactionName string  `json:"targetFactionName"`
	Cost              float64 `json:"cost"`
	// RelationBefore and RelationAfter are the two sides' opinion on the
	// model's -1..1 scale scaled to -100..100, which is the scale every other
	// relation this client reads uses.
	RelationBefore float64 `json:"relationBefore"`
	RelationAfter  float64 `json:"relationAfter"`
	Summary        string  `json:"summary"`
	Accepted       bool    `json:"accepted"`
	Reason         string  `json:"reason,omitempty"`
}
