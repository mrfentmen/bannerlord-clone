package wire

// TradeRequest is a player's order to buy or sell in a town market.
//
// ExpectedDay is the day the player was looking at. The server refuses the order
// if the world has moved on, so a player cannot buy against a price they never
// saw.
type TradeRequest struct {
	PartyID     string  `json:"partyId"`
	TownID      string  `json:"townId"`
	GoodID      string  `json:"goodId"`
	Side        string  `json:"side"`
	Quantity    float64 `json:"quantity"`
	ExpectedDay int     `json:"expectedDay"`
}

// TradeResult is the answer to a trade. Accepted false with a Reason is a
// refusal the player can read, not a transport failure, so it arrives as 200.
type TradeResult struct {
	Accepted bool   `json:"accepted"`
	Side     string `json:"side"`
	GoodName string `json:"goodName,omitempty"`
	UnitPrice float64 `json:"unitPrice"`
	Quantity  float64 `json:"quantity"`
	Total     float64 `json:"total"`
	// PartyQuantity is what the party holds after the trade.
	PartyQuantity float64 `json:"partyQuantity"`
	// MarketPriceAfter is the price read back from state after the tick that
	// applied the trade, so it is the real post-trade price.
	MarketPriceAfter float64 `json:"marketPriceAfter"`
	Reason           string  `json:"reason,omitempty"`
	CausedBy         string  `json:"causedBy"`
}

// RecruitRequest is a player's order to hire troops in a town.
type RecruitRequest struct {
	PartyID     string  `json:"partyId"`
	TownID      string  `json:"townId"`
	UnitID      string  `json:"unitId"`
	Quantity    float64 `json:"quantity"`
	ExpectedDay int     `json:"expectedDay"`
}

// RecruitResult is the answer to a hire.
type RecruitResult struct {
	Accepted  bool   `json:"accepted"`
	UnitName  string `json:"unitName"`
	Quantity  float64 `json:"quantity"`
	TotalCost float64 `json:"totalCost"`
	// NewCount is how many of this unit the party holds after the hire.
	NewCount float64 `json:"newCount"`
	Reason   string  `json:"reason,omitempty"`
	CausedBy string  `json:"causedBy"`
	// WagePerDay is what the hire added to the daily wage bill, which is the
	// real cost of the soldiers: this simulation has no levy fee.
	WagePerDay float64 `json:"wagePerDay"`
}

// TalkRequest asks a notable what they will do for the player.
type TalkRequest struct {
	SettlementID string `json:"settlementId"`
	NotableID    string `json:"notableId"`
}

// TalkToNotableResult is a notable's dialogue and the actions open to the player.
type TalkToNotableResult struct {
	NotableID string         `json:"notableId"`
	Name      string         `json:"name"`
	Dialogue  []string       `json:"dialogue"`
	Actions   []NotableAction `json:"actions"`
}

// ImproveRelationRequest is a gift or a favour.
type ImproveRelationRequest struct {
	NotableID string  `json:"notableId"`
	Action    string  `json:"action"`
	Amount    float64 `json:"amount,omitempty"`
}

// ImproveRelationResult is the answer to a gesture.
type ImproveRelationResult struct {
	Accepted       bool    `json:"accepted"`
	NotableID      string  `json:"notableId"`
	Name           string  `json:"name"`
	RelationBefore float64 `json:"relationBefore"`
	RelationAfter  float64 `json:"relationAfter"`
	Summary        string  `json:"summary"`
	Reason         string  `json:"reason,omitempty"`
	CausedBy       string  `json:"causedBy"`
}

// BattleXpInput is the aftermath of a battle. Losers learn too, at half rate.
type BattleXpInput struct {
	Won            bool     `json:"won"`
	EnemyStrength  float64  `json:"enemyStrength"`
	StackIDs       []string `json:"stackIds,omitempty"`
}

// BattleXpAward is XP banked into one stack.
type BattleXpAward struct {
	StackID string  `json:"stackId"`
	XP      float64 `json:"xp"`
}

// UpgradeTroopsRequest promotes one stack a tier.
type UpgradeTroopsRequest struct {
	StackID string `json:"stackId"`
}

// UpgradeTroopsResult is the answer to a promotion.
type UpgradeTroopsResult struct {
	Upgraded  bool    `json:"upgraded"`
	StackID   string  `json:"stackId"`
	FromTier  int     `json:"fromTier"`
	ToTier    int     `json:"toTier"`
	XPSpent   float64 `json:"xpSpent"`
	GoldSpent float64 `json:"goldSpent"`
	Reason    string  `json:"reason,omitempty"`
	CausedBy  string  `json:"causedBy"`
}

// MarchRequest is a march order, or the same order asked about as a plan.
type MarchRequest struct {
	PartyID               string `json:"partyId"`
	DestinationSettlementID string `json:"destinationSettlementId"`
	// Departure is "now" or "hold".
	Departure string `json:"departure"`
}

// MarchPlan is the planner's preview. Days is an estimate; see the contract's
// section 9 for exactly which constants it uses and why the march system, not
// this, is the authority.
type MarchPlan struct {
	PartyID                string `json:"partyId"`
	DestinationSettlementID string `json:"destinationSettlementId"`
	DestinationName        string `json:"destinationName"`
	// Route is the path through surveyed roads, for drawing on the map.
	Route []Point `json:"route"`
	// DistanceKm converts the model's leagues.
	DistanceKm float64 `json:"distanceKm"`
	Days       float64 `json:"days"`
	ArrivalDay int     `json:"arrivalDay"`
	Cost       struct {
		Food  float64 `json:"food"`
		Money float64 `json:"money"`
		Metal float64 `json:"metal"`
	} `json:"cost"`
	// DaysOfFoodOnArrival is nil when the plan runs out before it gets there.
	DaysOfFoodOnArrival *float64 `json:"daysOfFoodOnArrival"`
	// RoadDanger is 0 safe to 1 lethal.
	RoadDanger float64  `json:"roadDanger"`
	Warnings   []string `json:"warnings"`
	// Unmapped is true when the planner has no surveyed road for a leg.
	Unmapped bool `json:"unmapped"`
}

// TimeScaleRequest sets the clock. Zero pauses.
type TimeScaleRequest struct {
	DaysPerRealSecond float64 `json:"daysPerRealSecond"`
}

// ClockState is the clock as it stands.
type ClockState struct {
	DaysPerRealSecond float64 `json:"daysPerRealSecond"`
	Paused            bool    `json:"paused"`
	Tick              int     `json:"tick"`
	Day               int     `json:"day"`
	Year              float64 `json:"year"`
	// TicksPerSnapshot is how often a periodic snapshot is written.
	TicksPerSnapshot int `json:"ticksPerSnapshot"`
}

// Accepted is the reply to an order whose result the client discards. The
// client's POST helper parses every reply as JSON, so this is never empty.
type Accepted struct {
	Accepted bool `json:"accepted"`
}

// SkipToArrivalResult is how far the clock ran.
type SkipToArrivalResult struct {
	DaysAdvanced int `json:"daysAdvanced"`
	// Arrived is false when the cap stopped the run before the party arrived.
	Arrived bool `json:"arrived"`
}

// TaxRequest sets a town's own tax rate.
type TaxRequest struct {
	TownID string  `json:"townId"`
	Rate   float64 `json:"rate"`
}

// StateTaxRequest sets the state-level rate for every town in a US state.
type StateTaxRequest struct {
	State string  `json:"state"`
	Rate  float64 `json:"rate"`
}

// ConstructRequest queues a settlement project.
type ConstructRequest struct {
	TownID    string `json:"townId"`
	BuildingID string `json:"buildingId"`
}

// EthnicityRequest sets the player's culture.
type EthnicityRequest struct {
	EthnicityID string `json:"ethnicityId"`
}

// PlayerCharacter is the whole sheet from the character maker, posted verbatim.
type PlayerCharacter struct {
	FirstName         string            `json:"firstName"`
	LastName          string            `json:"lastName"`
	Gender            string            `json:"gender"`
	AppearanceID      string            `json:"appearanceId"`
	EthnicityID       string            `json:"ethnicityId"`
	Age               float64           `json:"age"`
	StartCity         string            `json:"startCity"`
	Difficulty        string            `json:"difficulty"`
	BackgroundChoices map[string]string `json:"backgroundChoices"`
	// Attributes is the six-attribute sheet the character maker allocates, and
	// SkillFocus the focus points it spends on individual skills. Both are the
	// CHARACTER.md record; they are kept as maps rather than validated against the
	// catalog here because the catalog is world data the simulation does not read,
	// and a character the client may legitimately change the shape of should not be
	// rejected over a skill id the simulation has no opinion about.
	Attributes map[string]float64 `json:"attributes,omitempty"`
	SkillFocus map[string]float64 `json:"skillFocus,omitempty"`
	// BonusPoints is the character maker's pre-attribute focus pool, kept so an
	// older client still posts a sheet this accepts.
	BonusPoints    map[string]float64 `json:"bonusPoints,omitempty"`
	StartingSkills map[string]float64 `json:"startingSkills"`
	StartingCash   float64            `json:"startingCash"`
	Biography      string             `json:"biography"`
}

// BattleResultInput is the legacy battle outcome (casualties as a single number).
type BattleResultInput struct {
	Won               bool     `json:"won"`
	PlayerLosses      float64  `json:"playerLosses"`
	Loot              float64  `json:"loot"`
	EnemyStrength     float64  `json:"enemyStrength"`
	PrisonersCaptured []PrisonerInput `json:"prisonersCaptured,omitempty"`
}

// PrisonerInput is a captured enemy troop type.
type PrisonerInput struct {
	TroopID string  `json:"troopId"`
	Name    string  `json:"name"`
	Count   float64 `json:"count"`
	Tier    float64 `json:"tier"`
}

// BattleParticipantResult is one side's authoritative outcome.
type BattleParticipantResult struct {
	PartyID         string  `json:"partyId"`
	Name            string  `json:"name"`
	IsPlayer        bool    `json:"isPlayer"`
	InitialTroops   float64 `json:"initialTroops"`
	SurvivingTroops float64 `json:"survivingTroops"`
	Killed          float64 `json:"killed"`
	Wounded         float64 `json:"wounded"`
	PrisonersTaken  float64 `json:"prisonersTaken"`
	PrisonersLost   float64 `json:"prisonersLost"`
	Retreated       bool    `json:"retreated"`
}

// BattleResult is the authoritative battle outcome.
type BattleResult struct {
	BattleID string                  `json:"battleId"`
	Winner   string                  `json:"winner"`
	Attacker BattleParticipantResult `json:"attacker"`
	Defender BattleParticipantResult `json:"defender"`
	Loot     float64                 `json:"loot"`
	Ticks    float64                 `json:"ticks"`
}

// BattleResultOutcome is what the campaign returns after applying a battle.
type BattleResultOutcome struct {
	TroopsRemaining float64          `json:"troopsRemaining"`
	Money           float64          `json:"money"`
	XPAwards        []BattleXpAward  `json:"xpAwards"`
	Prisoners       []PrisonerState  `json:"prisoners"`
}

// PrisonerState is a held prisoner type.
type PrisonerState struct {
	TroopID string  `json:"troopId"`
	Name    string  `json:"name"`
	Count   float64 `json:"count"`
	Tier    float64 `json:"tier"`
}

// NearbyParty is an NPC party within encounter range.
//
// The client's NpcParty interface has position as a required field, and the
// encounter flow reads it: it draws the force on the map and works out which
// way to run. A route that left position off would have the client computing a
// direction out of undefined, which is a NaN carried into the flee order rather
// than an error the player could see. So it is here, and always.
//
// Destination and SpeedKmPerDay are declared as null/absent rather than zero,
// because a stationary party and a party whose route has not been worked out are
// different facts and the client's type says so.
type NearbyParty struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	TroopCount float64 `json:"troopCount"`
	Hostile    bool    `json:"hostile"`
	DistanceKm float64 `json:"distanceKm"`
	// Position is where the party is now, in the same map units as the
	// player's own position.
	Position Point `json:"position"`
}
