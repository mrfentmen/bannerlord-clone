package wire

// TroopStack is one unit type in the player's party. The simulation's model
// carries troops as a single count, so the roster of named stacks is the
// campaign runner's own state, which the recruitment route writes and the
// roster route reads.
type TroopStack struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
	// Quality is 0 to 5, per RULERS.md and the troop quality rules in
	// MARCH_AND_WAR.md section 5.
	Quality float64 `json:"quality"`
	// Tier is 1 to 5 and indexes the client's TROOP_TIERS.
	Tier int `json:"tier"`
	// XP is banked toward the next tier, as a stack total. The client's
	// thresholds are per soldier and scale by count.
	XP float64 `json:"xp"`
	// Wage is money per day per soldier.
	Wage float64 `json:"wage"`
	// Morale is 0 to 1.
	Morale float64 `json:"morale"`
}

// PartyGood is one good in the party's hold.
type PartyGood struct {
	GoodID   string  `json:"goodId"`
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	// AvgPaid is the running average price per unit the party has paid for
	// this good, kept from the trades that actually happened.
	AvgPaid float64 `json:"avgPaid"`
}

// Destination is where the party is headed.
type Destination struct {
	SettlementID string `json:"settlementId"`
	Name         string `json:"name"`
}

// Point is a map coordinate. The simulation works in leagues on X and Y; the
// client's map is a flat plane, so Y is the client's Z.
type Point struct {
	X float64 `json:"x"`
	Z float64 `json:"z"`
}

// PartyState is the player's party.
type PartyState struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	LeaderName string `json:"leaderName"`
	FactionID  string `json:"factionId"`
	Position   Point  `json:"position"`
	// Destination is nil when the party is stationary.
	Destination *Destination `json:"destination"`
	Route       []Point      `json:"route"`
	// MarchingSinceDay is nil when stationary.
	MarchingSinceDay *int `json:"marchingSinceDay"`

	Food      float64 `json:"food"`
	Medicine  float64 `json:"medicine"`
	Metal     float64 `json:"metal"`
	Money     float64 `json:"money"`
	Morale    float64 `json:"morale"`
	Fatigue   float64 `json:"fatigue"`
	WagesOwed float64 `json:"wagesOwed"`
	// SpeedKmPerDay converts the model's leagues/day, because the client
	// measures distance in kilometres.
	SpeedKmPerDay float64 `json:"speedKmPerDay"`

	Troops []TroopStack `json:"troops"`
	// Roles is empty: the model has a single Officer flag and no role
	// vocabulary, so there is nothing real to put here.
	Roles map[string]string `json:"roles"`
	Goods []PartyGood       `json:"goods"`
}

// PlayerState is the player's hold, the top bar.
type PlayerState struct {
	PartyID       string             `json:"partyId"`
	CharacterName string             `json:"characterName"`
	EthnicityID   string             `json:"ethnicityId"`
	AppearanceID  string             `json:"appearanceId"`
	Age           float64            `json:"age"`
	Biography     string             `json:"biography"`
	Skills        map[string]float64 `json:"skills"`
	FactionID     string             `json:"factionId"`
	Resources     Resources          `json:"resources"`
	Influence     float64            `json:"influence"`
	Renown        float64            `json:"renown"`
}

// SideRatings are a side's computed totals.
type SideRatings struct {
	Money      float64 `json:"money"`
	Gold       float64 `json:"gold"`
	Food       float64 `json:"food"`
	Metal      float64 `json:"metal"`
	Population float64 `json:"population"`
}

// StateProfile is one US state's standing inside a side, computed from the
// towns the side holds there.
type StateProfile struct {
	Code       string   `json:"code"`
	Name       string   `json:"name"`
	Population *float64 `json:"population"`
	// Ratings are 1 to 5, rescaled against the world mean.
	Money   float64 `json:"money"`
	Gold    float64 `json:"gold"`
	Food    float64 `json:"food"`
	Metal   float64 `json:"metal"`
	Summary string  `json:"summary"`
}

// SideState is one faction. FACTIONS.md section 3 requires its ratings to be
// computed from real data, so nothing here is hand-typed.
type SideState struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Ratings SideRatings `json:"ratings"`
	// Difficulty is derived from the computed ratings against the world mean:
	// a side is hard exactly when it is stronger than the rest of the world.
	// The strings are the client's union verbatim, space in "Easy to Medium"
	// included.
	Difficulty        string         `json:"difficulty"`
	Pros              []string       `json:"pros"`
	Cons              []string       `json:"cons"`
	BiggestDanger     string         `json:"biggestDanger"`
	SignatureMechanic string         `json:"signatureMechanic"`
	MemberStates      []string       `json:"memberStates"`
	States            []StateProfile `json:"states"`
}

// RulerTraits are the five personality traits, each 0 to 1.
type RulerTraits struct {
	Valor       float64 `json:"valor"`
	Mercy       float64 `json:"mercy"`
	Honor       float64 `json:"honor"`
	Generosity  float64 `json:"generosity"`
	Calculation float64 `json:"calculation"`
}

// Holding is one settlement a ruler holds.
type Holding struct {
	SettlementID string `json:"settlementId"`
	Name         string `json:"name"`
}

// RulerEvent is one recorded thing that happened to a ruler.
type RulerEvent struct {
	Day  int    `json:"day"`
	Text string `json:"text"`
	// CausedBy opens the Why panel on this event.
	CausedBy string `json:"causedBy,omitempty"`
}

// RulerState is one named character.
type RulerState struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	FactionID   string `json:"factionId"`
	FactionName string `json:"factionName"`
	// Tier is one of the client's six names, decided from the fields the
	// model actually records rather than from Ruler.Tier alone.
	Tier            string      `json:"tier"`
	Age             float64     `json:"age"`
	Traits          RulerTraits `json:"traits"`
	Ambitions       []string    `json:"ambitions"`
	Holdings        []Holding   `json:"holdings"`
	Garrison        float64     `json:"garrison"`
	Wealth          Resources   `json:"wealth"`
	LoyaltyToLeader float64     `json:"loyaltyToLeader"`
	Influence       float64     `json:"influence"`
	Renown          float64     `json:"renown"`
	// RelationToPlayer is -100 to 100.
	RelationToPlayer float64      `json:"relationToPlayer"`
	RecentEvents     []RulerEvent `json:"recentEvents"`
}

// CauseRow is one row of the cause log, CAUSE_EFFECT.md section 4. CausedBy is
// what makes the Why panel a chain walk rather than a list.
type CauseRow struct {
	ID       string `json:"id"`
	Tick     int    `json:"tick"`
	Day      int    `json:"day"`
	EntityID string `json:"entityId"`
	// EntityName is the readable name, so the panel never shows "entity 4121".
	EntityName string  `json:"entityName"`
	Field      string  `json:"field"`
	Old        float64 `json:"old"`
	New        float64 `json:"new"`
	// System is the system that wrote the row, title-cased for display.
	System string `json:"system"`
	// CausedBy names the prior rows behind this one.
	CausedBy []string `json:"causedBy"`
	// Summary is a plain sentence for the player. The simulation composes it
	// from the row's own read record; the client never writes one.
	Summary string `json:"summary"`
}

// WhyChain is the answer to a why-query: the observable result first, then its
// causes, then theirs.
type WhyChain struct {
	EntityID string     `json:"entityId"`
	Field    string     `json:"field"`
	Rows     []CauseRow `json:"rows"`
	// Related are rows about the same entity that the chain walk did not
	// reach, shown as context rather than as a link.
	Related []CauseRow `json:"related"`
	// TotalDepth is how many rows the simulation holds for this chain, before
	// any truncation.
	TotalDepth int  `json:"totalDepth"`
	Truncated  bool `json:"truncated"`
}

// Notification is something worth telling the player about.
type Notification struct {
	ID       string `json:"id"`
	Day      int    `json:"day"`
	Priority string `json:"priority"`
	Text     string `json:"text"`
	// EntityID and Field are nil when the event is about no one in particular.
	EntityID *string `json:"entityId"`
	Field    *string `json:"field"`
	// CausedBy opens the Why panel straight on this event.
	CausedBy string `json:"causedBy,omitempty"`
}

// TickUpdate is one world-state frame. Every key is sparse: an absent key means
// unchanged, which is what keeps a frame small.
type TickUpdate struct {
	Tick int `json:"tick"`
	Day  int `json:"day"`
	// TownClassName and MarketState are partials keyed by id.
	Towns         map[string]map[string]any `json:"towns,omitempty"`
	Markets       map[string]map[string]any `json:"markets,omitempty"`
	Party         map[string]any            `json:"party,omitempty"`
	Player        map[string]any            `json:"player,omitempty"`
	Ledger        *Ledger                   `json:"ledger,omitempty"`
	Warnings      []ResourceWarning         `json:"warnings,omitempty"`
	Notifications []Notification            `json:"notifications,omitempty"`
	CauseRows     []CauseRow                `json:"causeRows,omitempty"`
}

// SnapshotSchemaVersion is the shape version of wire.SimSnapshot, and the only
// one this server writes. The client reads a range of 1 and refuses anything
// else, so this stays 1 until the snapshot's shape actually changes.
const SnapshotSchemaVersion = 1

// SimSnapshot is the whole world as the client reads it.
type SimSnapshot struct {
	// SchemaVersion is the shape version of this payload. The client refuses a
	// snapshot with no version rather than guessing at an unknown one, so this
	// field is what makes the two ends agree at all: without it every read of
	// /v1/snapshot fails validation and nothing in the client draws.
	//
	// It is a constant on the wire type rather than a per-campaign value because
	// it versions the JSON shape, not the world in it. Bump it when a field is
	// added or removed; a client reads a range and refuses a version outside it
	// with "this world is newer than this version of the game" rather than a
	// field-by-field list of complaints about a payload that is fine.
	SchemaVersion int `json:"schemaVersion"`

	Day   int `json:"day"`
	Year  int `json:"year"`
	// EraTier is 1 to 4, from ERA.md section 3 against the campaign's start
	// year. The client refuses a snapshot whose eraTier is not one of those
	// four integers.
	EraTier int `json:"eraTier"`

	Player        PlayerState            `json:"player"`
	Party         PartyState             `json:"party"`
	Towns         []TownState            `json:"towns"`
	Markets       map[string]MarketState `json:"markets"`
	Sides         []SideState            `json:"sides"`
	Rulers        []RulerState           `json:"rulers"`
	Ledger        Ledger                 `json:"ledger"`
	Warnings      []ResourceWarning      `json:"warnings"`
	Notifications []Notification         `json:"notifications"`
	// CauseLog is every cause row the client may walk, keyed by row id.
	CauseLog map[string]CauseRow `json:"causeLog"`
}
