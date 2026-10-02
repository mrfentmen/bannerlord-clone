package model

// Entity data. Each entity is a plain struct with named fields rather than a
// float map, because the fields are read by name in hundreds of places and a
// compiler error on a typo is worth more than the reflection a map would buy.
//
// The cause log refers to values by field name, and State.Get/State.Set bridge
// from a name to the struct field. A field that is added to an entity struct
// but not to that bridge is caught by the coverage test, which walks every
// struct field and asserts a registry entry exists.

// Traits are a ruler's personality, on a 0-1 scale per RULERS.md section 4.
// They are not cosmetic: the ruler AI's utility scores read them.
type Traits struct {
	Valor       float64
	Mercy       float64
	Honor       float64
	Generosity  float64
	Calculation float64
}

// Ambition is what a ruler wants, which tilts their scoring.
type Ambition int

const (
	AmbitionLand Ambition = iota
	AmbitionWealth
	AmbitionRevenge
	AmbitionSecurity
	AmbitionNone
)

// Town is a settlement under full simulation. Field meanings are fixed by
// CAUSE_EFFECT.md section 2, extended with resources by section 8.
type Town struct {
	ID     int
	Name   string
	SideID int
	State  string
	IsPort bool
	// Terrain is an index into the route_terrain enum.
	Terrain int
	X, Y    float64

	Population      float64
	Workers         float64
	FoodStock       float64
	FoodProduction  float64
	FoodDemand      float64
	MedicineStock   float64
	Sanitation      float64
	Infected        float64
	Crowding        float64
	Unrest          float64
	Loyalty         float64
	Prosperity      float64
	TaxRate         float64
	Garrison        float64
	GarrisonConduct float64
	GarrisonMorale  float64
	// Militia is the free town defense force (Tier 2.1). Spawns daily from
	// prosperity, costs no upkeep, eats no food, only defends the town.
	// It does not march; it is the reason a town is not trivially captured.
	Militia float64
	// Crime is the town's criminality level 0-1 (Tier 5). High crime erodes
	// prosperity and feeds unrest.
	Crime         float64
	RoadSafety    float64
	Money         float64
	Gold          float64
	Metal         float64
	PriceFood     float64
	PriceMedicine float64
	PriceMetal    float64
	Wages         float64
	PriceIndex    float64
	Blockade      float64
	RecentDeaths  float64
	// DeathsToday accumulates deaths from every cause within a tick. The
	// demography system resets it and publishes it as RecentDeaths, so several
	// causes can kill people on the same day without any of them needing to
	// know about the others. That is the same pattern as a systems' pressure
	// accumulator, and it exists for the same reason: no system calls another.
	DeathsToday float64
	// NetMigration is arrivals minus departures staged by the migration
	// system for this tick, read by demography.
	NetMigration     float64
	Debt             float64
	IsStarving       bool
	IsBesieged       bool
	Holder           int
	HolderSide       int
	DaysBelowLoyalty float64
	FoodImports      float64
	FoodExports      float64
	MedicineImports  float64
	// Arriving cargo staged by the logistics system for this tick and consumed
	// by the food and disease systems. A town cannot act on goods that have not
	// landed, so the seam between "on the road" and "in the larder" is a real
	// one, and it is where a robbery stops mattering.
	ArrivingFood     float64
	ArrivingMedicine float64
	ArrivingMetal    float64

	// Untracked bookkeeping.
	FoodDays         float64
	StarveDays       float64
	DeathMemory      float64
	FoodBalance      float64
	StarveSeverity   float64
	ImportCut        float64
	FoodYield        float64
	Employment       float64
	SickWorkers      float64
	Scarcity         float64
	RaiderPressure   float64
	PatrolCoverage   float64
	WagesTarget      float64
	StockTarget      float64
	TaxIncome        float64
	Expenditure      float64
	NetCash          float64
	Attractiveness   float64
	Pressure         float64
	Quorum           float64
	VoteChance       float64
	Desertions       float64
	LostDeathsTotal  float64
	LostFoodTotal    float64
	CollapseScore    float64
	BesiegeDays      float64
	GatePressure     float64
	BlockadeDays     float64
	MilitiaPayroll   float64
	MilitiaReadiness float64

	// --- fog of war (gap 6.5 in docs/missing-vs-bannerlord.md) ---
	//
	// A town is real whether or not anybody is looking at it. These three
	// fields are what separate "exists" from "is known", and the difference is
	// the whole of the feature: a side that has never had a party near a town
	// does not know it is there, and a side that saw one last month remembers
	// it without seeing anything now.
	//
	// SightedSides is a bitmask over side ids, not a count. A boolean per side
	// would be six fields on every town, and a count would throw away exactly
	// the question being asked, which is always "which ones".
	SightedSides float64
	// EverSeenSides is the same mask for every sighting in the run, never
	// cleared. It is what distinguishes a town that has never been found from
	// one that is merely out of sight right now, and it is the difference
	// between fog that can be re-explored and fog that erases.
	EverSeenSides float64
	// LastSeenTick is when a town was last inside any side's sight radius, or
	// -1 if never. It is what ages a sighting out: a town nobody has been near
	// for a while is reported as remembered rather than watched, and the
	// difference is the difference between current intelligence and gossip.
	LastSeenTick float64
}

// Village is a food-producing settlement serving a town, per SPEC.md section 2.
type Village struct {
	ID         int
	Name       string
	SideID     int
	TownID     int
	Population float64
	Food       float64
	Prosperity float64
	X, Y       float64
	RaidMemory float64
	Yield      float64
	Link       int
	// Hearths is the village's hearth tier (Tier 3.1). From Bannerlord:
	// villages have hearth levels that scale production. Higher hearths
	// mean more output per worker, representing better tools, organization,
	// and infrastructure.
	Hearths int
}

// Activity is what a party is doing, matching the activity field enum.
type Activity int

const (
	ActIdle Activity = iota
	ActMarching
	ActRaiding
	ActSieging
	ActTrading
	ActPatrolling
	ActResupplying
	ActReturning
	ActDefending
)

// Intention is what a ruler's AI has decided to do next, matching the
// intended_action field enum. An intention is a write to shared state, not a
// call into another system (AI.md section 1).
type Intention int

const (
	IntentNone Intention = iota
	IntentAttack
	IntentRaid
	IntentAid
	IntentTrade
	IntentAlly
	IntentWait
	IntentDefend
	IntentBlockade
	IntentPeace
)

// Reason is the top explanation attached to a decision, matching the
// decision_reasons enum (AI.md section 7: every decision logs its reasons).
type Reason int

const (
	ReasonNone Reason = iota
	ReasonWeakTarget
	ReasonHoldingsThreatened
	ReasonFoodShortage
	ReasonGreed
	ReasonRevenge
	ReasonAmbition
	ReasonDuty
	ReasonMercy
	ReasonTradeProfit
	ReasonSafeDistance
	ReasonExhausted
	ReasonBroke
	ReasonAllyObligation
	ReasonGrievance
)

// PartyTemplate is a party's formation doctrine, named for Bannerlord's four
// templates (Tier 6.2). A template is not a label: it fixes the share of each
// troop class the party fields, and the class shares decide how fast it
// marches and how it fights, so choosing one is a real decision with a cost.
type PartyTemplate int

const (
	// TplStance is the disciplined line: heavy on close-order foot, slow,
	// steady, and the only formation that holds a siege line.
	TplStance PartyTemplate = iota
	// TplHeavy is the armoured core: slow to move, expensive to feed, and the
	// strongest thing in a field engagement.
	TplHeavy
	// TplLight is the skirmish screen: fast, cheap to supply, weak against a
	// formed line.
	TplLight
	// TplHorse is the mounted wing: the fastest thing on the map, and useless
	// against walls.
	TplHorse
)

// TemplateCount is how many templates exist, and the width of every template
// table. Kept as a constant so a table cannot be indexed with a template the
// model does not have.
const TemplateCount = 4

// TroopClass is one of the four kinds of soldier a party can field. The class
// mix is what a template actually means, and what the march and battle systems
// read.
type TroopClass int

const (
	ClassStance TroopClass = iota
	ClassHeavy
	ClassLight
	ClassHorse
)

// ClassCount is how many troop classes exist.
const ClassCount = 4

// WeaponClass is how a template's men hurt people, which decides what happens
// to the ones who fall. It is not a damage number: a piercer and a cutter kill
// about equally well, and the difference is what they leave behind. A sharp
// weapon finishes the man it opens, so his body is a corpse; a blunt weapon
// beats him down and leaves him breathing, so he is somebody's prisoner. That
// is the whole of Bannerlord's rule that capture is blunt-only, and it is why
// the choice of template is an economic one rather than a cosmetic one
// (docs/missing-vs-bannerlord.md item 2.4).
type WeaponClass int

const (
	// WeaponPiercing is the spear and the lance: it opens a man and leaves him
	// dead.
	WeaponPiercing WeaponClass = iota
	// WeaponCutting is the sword and the axe: same problem, slower.
	WeaponCutting
	// WeaponBlunt is the club, the maul, and the shield boss: a man survives
	// being hit with one, which is what makes him takeable.
	WeaponBlunt
)

// WeaponClassCount is how many weapon classes exist. A template names one of
// them, so this is the width of the range a weapon class must be validated
// against rather than a table anything is indexed by.
const WeaponClassCount = 3

// WeaponNames names the weapon classes, in WeaponClass order. It is what the
// balance file, the cause log, and a party panel all read, so that a weapon
// class is named the same way everywhere it appears.
var WeaponNames = []string{"piercing", "cutting", "blunt"}

// TemplateNames names the templates for the cause log and any report that
// reads a party panel. Index order matches the PartyTemplate constants.
var TemplateNames = []string{"stance", "heavy", "light", "horse"}

// ClassNames names the troop classes, in TroopClass order.
var ClassNames = []string{"stance", "heavy", "light", "horse"}

// CultureCount is how many cultures have template definitions. FACTIONS.md
// gives each of the six sections its own culture and troop style, and an
// unaffiliated party such as a raider band reads culture zero.
const CultureCount = 6

// Party covers war parties, caravans, patrol bands, and raider bands. One
// shape for all of them because MARCH_AND_WAR.md treats them as the same
// object with different duties, and because parties and armies share supplies.
type Party struct {
	ID       int
	Name     string
	SideID   int
	LeaderID int
	X, Y     float64
	DestX    float64
	DestY    float64
	Troops   float64
	Wounded  float64
	Food     float64
	Money    float64
	Gold     float64
	Metal    float64
	Medicine float64
	Morale   float64
	// TroopXP is accumulated combat experience, 0+. Battles grant XP;
	// higher XP improves combat effectiveness (Tier 5.5).
	TroopXP float64
	// Cohesion is party unity, 0-1. Large armies drain it; high cohesion
	// improves combat, zero cohesion causes desertion (Tier 5.6).
	Cohesion       float64
	Fatigue        float64
	WagesOwed      float64
	Activity       Activity
	Intention      Intention
	Reason         Reason
	DecisionScore  float64
	DestTown       int
	DestRuler      int
	HomeTown       int
	DestTownParty  int
	DaysOut        float64
	Speed          float64
	Distance       float64
	DaysFood       float64
	IsStarving     bool
	IsRaider       bool
	IsMercenary    bool
	IsCaravan      bool
	IsSieging      bool
	SupplyDistance float64
	// Caravan fields (Tier 6): mobile trading operations.
	CaravanGold      float64 // gold held by the caravan
	CaravanGuards    float64 // guards protecting the caravan
	CaravanAnimals   float64 // pack animals
	CaravanCargo     float64 // total cargo units
	CaravanCargoType float64 // hashed good type (1=food, 2=medicine, 3=metal)
	CaravanAtTown    int     // town ID where caravan is, -1 if traveling
	CaravanDestTown  int     // destination town ID, -1 if none
	CaravanProgress  float64 // travel progress 0-1
	CargoFood        float64
	CargoMedicine    float64
	CargoMetal       float64
	ArrivingFood     float64
	ArrivingMedicine float64
	ArrivingMetal    float64
	AttritionRate    float64
	ColumnDisease    float64
	RaidTarget       int
	WageDaily        float64

	// Template is the formation doctrine this party fields troops under
	// (Tier 6.2). It is the cause of the class counts below, not a copy of
	// them: the template system reads terrain, mission, and culture, sets
	// this, and then publishes the class counts it implies.
	Template PartyTemplate
	// StanceTroops, HeavyTroops, LightTroops, and HorseTroops are the party's
	// composition by class, in troops. They sum to Troops; the template
	// system republishes all four every tick from Troops and Template, which
	// is why a detachment or a battle casualty shows up in the mix without
	// those systems knowing troop classes exist.
	StanceTroops float64
	HeavyTroops  float64
	LightTroops  float64
	HorseTroops  float64
	// TemplateFit is how well the current template suits the ground and the
	// job, 0-1. The template system recomputes it each tick and the Why panel
	// reads it, so a refit is explainable rather than asserted.
	TemplateFit float64
	// RefitDays counts down the days left before a new template is fully in
	// effect. Refitting takes time and metal, which is what stops a party
	// re-forming itself every day to chase a marginal advantage.
	RefitDays float64
	// IsWing marks a party detached from another, and ParentParty names the
	// one it came from (Tier 6.3). A wing fights and supplies itself but
	// answers to its parent, which is what makes consolidation a decision
	// rather than a bookkeeping fix.
	IsWing      bool
	ParentParty int
	// WingShare is the share of the parent's strength this wing took when it
	// detached, kept so a merge can be judged against what was split.
	WingShare float64
	// Routed records that this army has broken (COMBAT.md section 6). It is
	// derived from Morale rather than latched: the battle system recomputes it
	// every tick from the morale threshold in the balance file, so an army that
	// is fed and rested back above the threshold fights again with nothing
	// having to clear it.
	//
	// A routed army is not merely a flag. The men who ran came off Troops in the
	// same tick, so the number is true, and a routed army is not a candidate for
	// the fight in its town. An army that kept its whole roster and merely
	// declined to fight would make every strength comparison in the simulation a
	// comparison against men who are not on the field.
	Routed bool

	// SplitShare is a pending order to detach a wing carrying this share of
	// the party's troops, 0-1 (Tier 6.3). It is an order rather than a
	// command: the player system writes it and the formation system acts on
	// it, so a scripted profile and a real player reach the same machinery.
	SplitShare float64
	// MergeTarget is a pending order to consolidate into the party with this
	// id, or -1 for none. Same seam as SplitShare, and cleared by the
	// formation system whether or not the merge is possible.
	MergeTarget int
	// Prisoners is the number of captured enemy troops held by the party.
	Prisoners float64
	// PrisonerConformity is 0-1, how willing prisoners are to defect/join.
	PrisonerConformity float64
}

// Ruler is a named character who holds land, leads a party, or sells a company.
type Leader struct {
	ID      int
	Name    string
	SideID  int
	TownID  int
	PartyID int
	Age     float64
	// Tier is the ruler's rank from RULERS.md section 2: 0 side leader,
	// 1 state governor, 2 lord, 3 local warlord, 4 mercenary captain. It sets
	// opening influence and caps party size, so a realm has a power structure
	// rather than fifty equals.
	Tier     int
	Traits   Traits
	Ambition Ambition
	// Money and Gold are the ruler's personal wealth, distinct from a town's.
	// A ruler can be solvent while their capital is broke, and a merchant
	// caravan they finance is paid from here.
	Money           float64
	Gold            float64
	Influence       float64
	Renown          float64
	LoyaltyToLeader float64
	CapturedBy      int
	PrisonerDays    float64
	Victories       float64
	BrokenOaths     float64
	IsMercenary     bool
	IsAlive         bool
	OathMade        bool
	LastDefection   bool
	RelationsWith   int
	Reason          Reason
	Leader          bool
	// Officer marks a ruler with no land of their own, so the council has
	// someone to install who is not already unhappy about ownership.
	Officer bool
	// ServiceQuality is how competently this ruler governs, computed by the
	// influence system from the state of their own holdings.
	ServiceQuality float64
	// OrganizationID is the clan this ruler belongs to. -1 means clanless.
	OrganizationID int

	// --- family (Tier 1.4, 1.6) ---
	//
	// A dynasty is the reason a campaign outlasts its first lord. These
	// fields are what make that real: a ruler has a spouse, a designated
	// heir, and parents, and a child is an ordinary Ruler with its parents
	// set, so it can grow up, marry, and inherit exactly as a generated one
	// does. There is no separate character type for a child, because a
	// system that could tell them apart would need two of every rule.

	// SpouseID is the ruler they are married to, or -1. A marriage is
	// symmetric: both rulers name each other, and the marriage system is
	// the only writer of both.
	SpouseID int
	// PregnancyDays tracks gestation: -1 = not pregnant, 0+ = days pregnant.
	// Only meaningful for one partner (the lower ID in the pair).
	PregnancyDays float64
	// FatherID and MotherID are the rulers who bore this one, or -1 for a
	// ruler who started the world with no recorded parents. Set at birth and
	// never changed, so a family tree can be walked in either direction.
	FatherID int
	MotherID int
	// HeirID is the ruler this one has designated as successor, or -1 for
	// none. A designation is a claim, not an inheritance: it says who
	// should be given the fief when this ruler dies, and the succession
	// system is what acts on it. -1 is a real state, not a placeholder,
	// because a ruler with no heir is how a dynasty dies out.
	HeirID int
	// IsChild marks a ruler too young to hold land, command, or inherit.
	// The family system clears it when the child reaches adulthood, so a
	// newborn cannot be handed a town by a council looking for anyone at
	// all, and cannot inherit a fief from a parent who died a year later.
	IsChild bool
	// IsPregnant and PregnancyTicks are the timed state of a pregnancy
	// (Tier 1.6). The countdown is the whole mechanism: a child is born
	// when it reaches zero, so birth follows from the passage of time
	// rather than from a decision, and a pregnancy interrupted by a death
	// simply never completes.
	IsPregnant     bool
	PregnancyTicks float64

	// Sex is which of the two sexes this ruler belongs to, matching the
	// sex_field enum. It exists because marriage has to pair two people
	// rather than two ids: without it a system would either pair a ruler
	// with themselves' spouse or treat pregnancy as a property of a
	// marriage rather than of a person, and both are wrong in a way a
	// player would notice in the family panel.
	Sex Sex
}

// Sex is a ruler's sex, matching the sex_field enum.
type Sex int

const (
	SexFemale Sex = iota
	SexMale
)

// Side is one of the six playable sections from FACTIONS.md.
type Side struct {
	ID           int
	Name         string
	LeaderID     int
	Treasury     float64
	Gold         float64
	Food         float64
	Metal        float64
	WarWeariness float64
	States       float64
	Towns        float64
	Population   float64
	Affiliate    bool
	ExchangeRate float64
	DebtTotal    float64
	Inflation    float64
	Stability    float64
	Intent       SideIntent
	Ally         int
	Enemy        int
	Target       int
	Trust        float64
	Coalition    int
	AffiliateOf  int
	Income       float64
	Expense      float64
	TargetScore  float64
	PeaceScore   float64
	// Culture is this side's culture index, 0-5, which selects the template
	// definitions its parties field under (Tier 6.2). FACTIONS.md gives each
	// section its own culture and troop style; this is where that identity
	// lives in state, so the template system reads one field rather than
	// re-deriving a culture from a name.
	Culture     int
	TrustDecay  float64
	Mercenaries float64
	AllyCount   float64
	DebtRatio   float64
	// StrengthIndex is the side's fighting strength, recomputed by the
	// faction AI for target selection.
	StrengthIndex float64
	// FoodNeed and MetalNeed are the computed deficits that motivate war.
	FoodNeed  float64
	MetalNeed float64
	// VisibleTowns is how many towns this side has in sight right now, and
	// KnownTowns how many it has ever found. The two are kept apart because
	// they answer different questions and collapse to different numbers: a
	// side that has walked its whole territory knows a great deal and sees very
	// little, and reporting one figure for both would make an exploring realm
	// look like a declining one.
	VisibleTowns float64
	KnownTowns   float64
}

// Clan is a first-class dynasty entity (Tier 1.1). Members share renown and
// holdings; the clan's tier gates what the clan may hold (Tier 1.2/1.3).
// A clan belongs to one side; rulers belong to one clan.
type Organization struct {
	ID   int
	Name string
	// LeaderID is the ruler ID of the clan head.
	LeaderID int
	// SideID is the faction this clan serves.
	SideID int
	// MemberIDs are ruler IDs in this clan, including the leader.
	MemberIDs []int
	// Renown is the clan's shared renown; drives Tier.
	Renown float64
	// Tier is computed from Renown against ClanTierThresholds (Tier 1.2).
	Tier int
	// HouseholdSize counts non-combatant family/retainers; feeds
	// succession and marriage systems (Tier 5).
	HouseholdSize int
	// FoundedTick records when the clan was created.
	FoundedTick int
	// FiefIDs are town IDs held by this clan's members.
	FiefIDs []int
	// WantsKingdom is set by player order or AI ambition when the clan
	// intends to found its own kingdom (Tier 1.9).
	WantsKingdom int
}

// ClanTierThresholds maps clan tier to the renown required.
// From Bannerlord: 0/50/150/350/900/2350/6150.
var ClanTierThresholds = []float64{0, 50, 150, 350, 900, 2350, 6150}

// ClanFiefLimits maps clan tier to max fiefs held. Tier 6 is uncapped (-1).
// This is the anti-overextension mechanism: DESIGN.md section 2 step 7 and
// RISKS.md section 5 name overextension as a risk with no enforcement.
var ClanFiefLimits = []int{1, 2, 3, 4, 6, 8, -1}

// OrganizationTierForRenown returns the highest tier whose threshold is met.
func OrganizationTierForRenown(renown float64) int {
	tier := 0
	for i, th := range ClanTierThresholds {
		if renown >= th {
			tier = i
		}
	}
	return tier
}

// FiefLimit returns the max fiefs for a tier, or -1 for uncapped.
func (c *Organization) FiefLimit() int {
	if c.Tier < len(ClanFiefLimits) {
		return ClanFiefLimits[c.Tier]
	}
	return -1
}

// IsOverextended reports whether the clan holds more fiefs than its tier allows.
func (c *Organization) IsOverextended() bool {
	limit := c.FiefLimit()
	return limit >= 0 && len(c.FiefIDs) > limit
}

// WorkshopType is what a workshop produces. Modern American equivalents
// of Bannerlord's medieval workshops.
type WorkshopType int

const (
	WorkshopMachineShop WorkshopType = iota // was Smithy: metal -> firearms
	WorkshopTannery                         // hides -> leather
	WorkshopTextileMill                     // was Weavery: wool -> cloth
	WorkshopBrewery                         // grain -> beer
	WorkshopCeramics                        // was Pottery: clay -> ceramics
	WorkshopLumberMill                      // was Woodshop: hardwood -> lumber
	WorkshopOilPress                        // was Press: olives -> oil/biofuel
	WorkshopJeweler                         // silver -> jewelry
	WorkshopMeatPacking                     // was Butcher: livestock -> meat
	WorkshopBakery                          // was Baker: grain -> bread
	WorkshopCandleWorks                     // was Chandler: tallow -> candles
)

// Workshop is a clan-owned production building in a town (Tier 3.2).
// It converts raw goods (metal, hides, wool, grain, clay) into finished
// goods (weapons, leather, cloth, beer, pottery), generating income for
// the owning clan. From Bannerlord: workshops are the player's economic
// engine, and here they are the clans' too.
type Workshop struct {
	ID int
	// TownID is where the workshop is built.
	TownID int
	// OwnerOrganizationID is the clan that owns it. -1 for unowned.
	OwnerOrganizationID int
	// Type determines input/output goods.
	Type WorkshopType
	// Level is 1-3, scaling throughput.
	Level int
	// Workers employed.
	Workers float64
	// Stockpile of input goods.
	InputStock float64
	// Stockpile of output goods awaiting sale.
	OutputStock float64
	// Income generated last tick.
	LastIncome float64
}

// SideIntent is a side's strategic posture.
type SideIntent int

const (
	SidePeace SideIntent = iota
	SideWar
	SideRaid
	SideTrade
	SideAlly
	SideDefend
	SideTribute
)

// Route is a road between two towns. Length comes from imported route data in
// production; the generator derives it from real coordinates.
type Route struct {
	ID      int
	TownA   int
	TownB   int
	Length  float64
	Safety  float64
	Raiders float64
	Traffic float64
	Blocked bool
	Patrol  float64
	// Terrain is an index into the route_terrain enum.
	Terrain int
}

// Terrain names, matching the route_terrain enum.
const (
	TerrainPlain = iota
	TerrainForest
	TerrainHills
	TerrainMountain
	TerrainSwamp
	TerrainCoast
)

// TerrainCount is how many terrain types there are. Terrain is an untyped
// constant block rather than a typed enum, so this is the only way a table can
// be sized to cover every ground the world generator can produce without
// restating the list.
const TerrainCount = 6

// Siege is an active siege of a town.
type Siege struct {
	ID           int
	TownID       int
	AttackerID   int
	DefenderID   int
	Days         float64
	Breach       float64
	GatesOpen    bool
	Outcome      SiegeOutcome
	AttackerLoss float64
	Supply       float64
	GateRisk     float64
	AttackerSide int
}

// SiegeOutcome matches the siege_outcome enum.
type SiegeOutcome int

const (
	SiegeOngoing SiegeOutcome = iota
	SiegeBreached
	SiegeGatesOpened
	SiegeLifted
	SiegeStarved
)

// War is an active war between two sides.
type War struct {
	ID              int
	SideA           int
	SideB           int
	Intensity       float64
	Battles         float64
	StartTick       float64
	EndTick         float64
	BattlesThisTick float64
	Reason          WarReason
}

// WarReason matches the war_reason enum.
type WarReason int

const (
	WarBorder WarReason = iota
	WarRevenge
	WarResources
	WarDefence
	WarAlliance
	WarOpportunity
)

// WarOutcome names how a war ended, for the metrics report.
const (
	WarEndPeace        = "peace"
	WarEndExhaustion   = "exhaustion"
	WarEndAffiliateage = "affiliateage"
	WarEndOngoing      = "ongoing"
)

// NotableRole is what a notable does, matching the notable_role enum. It is the
// gate on which issues a person will put their name to: a gang boss asks for a
// hideout cleared and would not ask anyone to haul sacks of grain, and a
// headman asks for exactly that. Encoding the role rather than the issue list
// means the pairing is a rule in one table instead of a cross product.
type NotableRole int

const (
	// RoleMayor is a town's official, who carries the town's own problems.
	RoleMayor NotableRole = iota
	// RoleForeman is an industrial works supervisor.
	RoleForeman
	// RoleMerchant moves goods and fears the road more than anything.
	RoleMerchant
	// RoleShopkeeper is a small trader who hears everything and owns little.
	RoleShopkeeper
	// RoleHeadman runs a village and its harvest.
	RoleHeadman
	// RoleDoctor is a clinic head.
	RoleDoctor
	// RoleGangBoss is a criminal organiser.
	RoleGangBoss
	// RoleMilitiaCaptain commands a town's free defense.
	RoleMilitiaCaptain
)

// NotableRoleCount is how many roles exist, and the width of every role table.
// An untyped count rather than a typed one so a table can be sized to cover
// every role without restating the list.
const NotableRoleCount = 8

// NotableRoleNames names the roles for the cause log and the quest panel. Index
// order matches the NotableRole constants.
var NotableRoleNames = []string{
	"mayor", "foreman", "merchant", "shopkeeper",
	"headman", "doctor", "gang boss", "militia captain",
}

// Notable is a non-ruler person who holds local power, per
// QUESTS_AND_NOTABLES.md section 2.
//
// A notable is not a character with a biography. It is the person who stands
// between a settlement and the player: the one who can notice that Millbrook
// has three days of food left and can therefore ask for help, and the one whose
// opinion of the player moves when that help does or does not arrive. Making
// them a first-class entity rather than a town field is what lets several
// people in one town ask for different things at the same time, and what lets
// an issue outlive the mood of the tick that generated it.
type Notable struct {
	ID   int
	Name string
	// Role is this person's NotableRole, and decides which issues they offer.
	Role NotableRole
	// TownID is the town this notable belongs to, or -1 for a village notable.
	TownID int
	// VillageID is the village this notable belongs to, or -1 for a town
	// notable. Exactly one of the two is set, because a notable is attached to
	// one settlement: a headman does not speak for the market town that the
	// village sells its grain to.
	VillageID int
	// Power is how much this person sways their settlement, 0-1, derived from
	// the settlement's prosperity and population. It is what makes a
	// prosperous town's requests worth more and a bankrupt one's worth less,
	// without a separate rule per role.
	Power float64
	// Relation is this person's opinion of the player, -1 to 1. It rises when
	// an issue they offered is served and falls when it is abandoned, which is
	// the "ignoring has consequences" rule in QUESTS_AND_NOTABLES.md section 5
	// expressed as a number other systems can read.
	Relation float64
	// OpenIssues is how many issues this person currently has outstanding, an
	// offer or accepted alike. It is recomputed from the issue list every tick
	// rather than incremented, so a deleted or resolved issue cannot leave a
	// count that only ever grows.
	OpenIssues float64
	// Grievance is how much this person is aggrieved at the moment, 0-1. It
	// rises while an issue they care about is ignored and is spent when one is
	// served, so a notable who has been ignored repeatedly eventually stops
	// asking.
	Grievance float64
	// CooldownUntil is the tick before which this person offers nothing, set
	// when an issue of theirs resolves. It is the cooldown rule in
	// QUESTS_AND_NOTABLES.md section 7, and it is a real tick rather than a
	// probability so a person cannot spam the player with the same request.
	CooldownUntil int
	// BornTick is when this notable entered the roster, and TenureDays counts
	// their service. A roster that never turns over would fix every requester
	// for the whole run, so people retire and are replaced.
	BornTick   int
	TenureDays float64
	// LastOfferTick is when this person last created an issue, -1 if never.
	LastOfferTick int
	// IsActive is false for a retired notable, who stays in state so their
	// resolved issues still resolve to somebody.
	IsActive bool
}

// IssueKind is what an issue asks for, matching the issue_kind enum. The three
// kinds are deliberately different in kind and not only in scale: one moves
// goods, one fights, one travels. Each therefore has its own trigger to read,
// its own progress measure, and its own effects on the world.
type IssueKind int

const (
	// IssueDeliverGoods moves food to a settlement that is short of it. The
	// trigger is days of food; the objective is the arrival of the sacks; the
	// effect is a town that does not starve on the strength of one delivery.
	IssueDeliverGoods IssueKind = iota
	// IssueClearHideout breaks a criminal network. The trigger is crime; the
	// objective is crime coming down; the effect is prosperity that stops
	// eroding and roads that get safer.
	IssueClearHideout
	// IssueEscort protects a caravan. The trigger is an unsafe road; the
	// objective is the road getting safer; the effect is trade that arrives.
	IssueEscort
)

// IssueKindCount is how many issue kinds exist, and the width of the kind
// tables. An untyped count for the same reason as NotableRoleCount.
const IssueKindCount = 3

// IssueKindNames names the kinds for the cause log and the quest panel. Index
// order matches the IssueKind constants.
var IssueKindNames = []string{"deliver goods", "clear hideout", "escort"}

// IssueState is where an issue is in its life, matching the issue_state enum.
type IssueState int

const (
	// IssueOffered means a notable has asked and nobody has taken it. An offer
	// that is never accepted expires on its own, which is the only way a world
	// with no player still shows the cost of ignoring people.
	IssueOffered IssueState = iota
	// IssueAccepted means a ruler is answerable for it and the deadline runs.
	IssueAccepted
	// IssueSucceeded means the objective was met and the rewards paid.
	IssueSucceeded
	// IssueFailed means the deadline passed, the objective was never met, or
	// the taker abandoned it. The failure effects are applied either way.
	IssueFailed
)

// IssueStateNames names the states for the cause log and the quest panel. Index
// order matches the IssueState constants.
var IssueStateNames = []string{"offered", "accepted", "succeeded", "failed"}

// IssueStep is one recorded moment of an issue's life, the per-issue log
// QUESTS_AND_NOTABLES.md section 3 calls for. The cause log explains a change
// to a field; this explains the change to the request itself, which no field
// records because the request is not a number.
type IssueStep struct {
	Tick int
	// Text is the plain-language step, e.g. "offered" or "delivered 400".
	Text string
	// State is the issue state the step produced.
	State IssueState
}

// Issue is one outstanding request from one notable, and the unit the player
// accepts and completes.
//
// An issue is a first-class entity rather than a counter on a notable because
// the whole design rests on an issue being a fact about the world that outlives
// the tick that produced it. A town asks for food on the day its larder runs
// low; the player may take the request four days later, from a town whose
// situation has since changed, and the offer has to still be there to be
// accepted. Storing that as a field would mean the offer expired the moment it
// was written.
type Issue struct {
	ID int
	// Kind is the IssueKind, and selects the trigger, objective, and effects.
	Kind IssueKind
	// NotableID is who asked. Every effect is written against this person, so
	// an ignored request has an author.
	NotableID int
	// TownID and VillageID locate the settlement asking, matching the notable
	// they belong to. Exactly one is set.
	TownID    int
	VillageID int
	// TargetID is the second entity the objective concerns: the town that
	// wanted the goods, the town whose hideout is to be broken, or the town the
	// caravan sets out from. -1 where the objective has no second settlement.
	TargetID int
	// RouteID is the road an escort protects, or -1 for the kinds that have no
	// road. It is a separate field rather than an overloaded TargetID because
	// an escort needs a route and a town at the same time, and packing two ids
	// into one would make the quest panel a decoding exercise.
	RouteID int
	// State is the IssueState. This is the field the cause log watches, so the
	// moment a request becomes answerable, is taken, or is given up is a dated,
	// explainable event rather than an inference from the other fields.
	State IssueState
	// AcceptorID is the ruler who took the issue, or -1 while it is offered.
	// A resolved issue keeps its acceptor, because who served or who walked
	// away is the fact the rewards and the penalties are about.
	AcceptorID int
	// Amount is the quantity at stake in the issue's own unit: person-days of
	// food to deliver, or troops the objective is scaled against. The reward
	// scales with it, which is the "reward size scales with the real value of
	// what is at stake" rule in QUESTS_AND_NOTABLES.md section 6.
	Amount float64
	// Baseline is the world reading captured when the issue was accepted, and
	// progress is measured against it. A request is not "deliver 400 sacks" in
	// the abstract; it is "the larder stood at 300 and must reach 700", and the
	// second number only means something relative to the first.
	Baseline float64
	// Progress is how far the objective is met, 0-1. It is recomputed from
	// world state every tick rather than advanced by the player declaring
	// progress, so a delivery made by somebody else counts and a claim made
	// without the goods does not.
	Progress float64
	// DeadlineDays is the notice given when the issue was accepted, and
	// DeadlineTick is when it runs out. Both are kept: the first is what the
	// quest panel shows, the second is what the system compares against.
	DeadlineDays float64
	DeadlineTick int
	// StartedTick is when the issue was accepted, -1 while offered.
	StartedTick int
	// RewardMoney, RewardGold, and RewardRenown are what the giver pays, and
	// RewardRelation is how far the notable's opinion of the taker moves. The
	// money comes out of the notable's home settlement, so a bankrupt town
	// cannot promise a fortune it does not have.
	RewardMoney    float64
	RewardGold     float64
	RewardRenown   float64
	RewardRelation float64
	// Steps is the per-issue log of what happened and when.
	Steps []IssueStep
}

// Notification is a user-facing event: a battle won, a siege lifted, a town
// rebelled. Systems append them when something happens that the player should
// know about; the apiserver drains them into the snapshot and tick frames.
// They are facts about the world (like Issues), not staged writes, because a
// notification must survive the tick that created it.
type Notification struct {
	ID int
	// Tick is when it happened; Day is Tick % 365 for the client.
	Tick int
	// Kind is "battle", "siege", or "rebellion".
	Kind string
	// WinnerSide and LoserSide are side IDs (-1 if none/independent).
	WinnerSide int
	LoserSide  int
	// TownID is where it happened (-1 if in the field).
	TownID int
	// Text is the human-readable summary.
	Text string
}
