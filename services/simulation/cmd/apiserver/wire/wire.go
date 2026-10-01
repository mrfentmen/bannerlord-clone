// Package wire holds the JSON shapes the campaign client decodes.
//
// Every type here is a transcription of an interface in
// `clients/campaign/src/data/types.ts`. That file is the contract: if a field is
// not in it, the client does not read it; if a field is in it and this package
// omits it, the client renders `undefined` in a place the player can see. The
// field names and the JSON tags therefore match the TypeScript exactly, including
// the spellings that look wrong, such as the space in the difficulty string
// "Easy to Medium".
//
// Two conventions are worth stating once, because they recur:
//
//   - A field the TypeScript types as `T | null` is a Go pointer here with no
//     `omitempty`. That serialises to `null` rather than disappearing, which is
//     what the client's type says it will find. A field marked optional in the
//     TypeScript does use `omitempty`.
//   - Maps are `map[string]T` and never nil, so they serialise to `{}`. The
//     client's snapshot validator checks that `markets` and `causeLog` are
//     objects rather than arrays.
package wire

// ResourceID is one of the five resources ECONOMY.md section 1 names, plus
// medicine.
type ResourceID string

// The five resource ids, spelled as the client's union.
const (
	ResMoney    ResourceID = "money"
	ResGold     ResourceID = "gold"
	ResFood     ResourceID = "food"
	ResMetal    ResourceID = "metal"
	ResMedicine ResourceID = "medicine"
)

// Resources is a set of five balances. Negative means a debt against that
// resource.
type Resources struct {
	Money    float64 `json:"money"`
	Gold     float64 `json:"gold"`
	Food     float64 `json:"food"`
	Metal    float64 `json:"metal"`
	Medicine float64 `json:"medicine"`
}

// LedgerLine is one income or expense, with its signed daily change so the UI
// can show direction without another request.
type LedgerLine struct {
	ID       string     `json:"id"`
	Label    string     `json:"label"`
	Resource ResourceID `json:"resource"`
	Amount   float64    `json:"amount"`
	PerDay   float64    `json:"perDay"`
	// CausedBy is the cause-log id of the write that produced this line, when
	// there is one, so the ledger opens into the Why panel like anything else.
	CausedBy string `json:"causedBy,omitempty"`
}

// Ledger is the running book for the player.
type Ledger struct {
	Day       int               `json:"day"`
	Income    []LedgerLine      `json:"income"`
	Expenses  []LedgerLine      `json:"expenses"`
	NetPerDay map[string]float64 `json:"netPerDay"`
}

// ResourceWarning is a resource that will run out, projected from the rate it is
// actually being consumed at.
type ResourceWarning struct {
	ID       string     `json:"id"`
	Resource ResourceID `json:"resource"`
	Severity string     `json:"severity"`
	Headline string     `json:"headline"`
	Detail   string     `json:"detail"`
	// DaysRemaining is nil when the resource is already exhausted, which the
	// client renders differently from a number of days.
	DaysRemaining *float64 `json:"daysRemaining"`
	// EntityID and Field are what the Why panel should open on.
	EntityID string `json:"entityId"`
	Field    string `json:"field"`
}

// BuildingInfo is one settlement project: its current tier and the price of the
// next one.
type BuildingInfo struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Bannerlord string  `json:"bannerlord"`
	Level      int     `json:"level"`
	MaxLevel   int     `json:"maxLevel"`
	Blurb      string  `json:"blurb"`
	NextCost   float64 `json:"nextCost"`
	NextDays   float64 `json:"nextDays"`
}

// ConstructionResult is the answer to a construction order.
type ConstructionResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

// RecruitableUnit is one kind of soldier a town can raise, as the simulation
// describes it.
type RecruitableUnit struct {
	UnitID string `json:"unitId"`
	Name   string `json:"name"`
	// Quality is 0 to 5, on the same scale as TroopStack.Quality.
	Quality float64 `json:"quality"`
	// Wage is money per day per soldier, added to the wage bill on hire. It is
	// exactly the rate the upkeep system charges, so the figure shown to the
	// player is the figure the simulation takes.
	Wage float64 `json:"wage"`
	// HireCost is the one-time bonus per soldier. Zero, because this
	// simulation has no levy fee; a soldier's cost is his wage.
	HireCost float64 `json:"hireCost"`
	// Available is how many are willing to sign on here right now.
	Available int `json:"available"`
	Blurb     string `json:"blurb"`
}

// NotableType is one of the four notable roles the client renders.
type NotableType string

// The four notable types, as the client's union.
const (
	NotableMerchant        NotableType = "merchant"
	NotableGangLeader      NotableType = "gang-leader"
	NotableVeteran         NotableType = "veteran"
	NotableCommunityLeader NotableType = "community-leader"
)

// Notable is a named NPC in a settlement.
type Notable struct {
	ID           string      `json:"id"`
	SettlementID string      `json:"settlementId"`
	Name         string      `json:"name"`
	Type         NotableType `json:"type"`
	// Power is 1 to 100. Higher power unlocks more and better recruits.
	Power int `json:"power"`
	// Relation is -100 to +100, raised by gifts and favours.
	Relation float64 `json:"relation"`
	Blurb    string  `json:"blurb"`
}

// NotableAction is one thing the player can do when talking to a notable.
type NotableAction struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Detail    string `json:"detail"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// TownState is one settlement.
type TownState struct {
	ID           string `json:"id"`
	SettlementID string `json:"settlementId"`
	Name         string `json:"name"`
	// Klass is one of the client's townClass keys: "city", "town", "village".
	Klass string `json:"klass"`
	// HolderID is nil when nobody holds the settlement.
	HolderID   *string `json:"holderId"`
	HolderName string  `json:"holderName"`

	// Population is nil for a settlement the simulation is not running, which
	// the client renders as unknown rather than as zero people.
	Population     *float64 `json:"population"`
	Workers        float64  `json:"workers"`
	FoodStock      float64  `json:"foodStock"`
	FoodProduction float64  `json:"foodProduction"`
	FoodDemand     float64  `json:"foodDemand"`
	MedicineStock  float64  `json:"medicineStock"`
	Sanitation     float64  `json:"sanitation"`
	Infected       float64  `json:"infected"`
	Crowding       float64  `json:"crowding"`
	Unrest         float64  `json:"unrest"`
	Loyalty        float64  `json:"loyalty"`
	// Security is 0 to 1: Bannerlord's Security stat, which the simulation
	// derives from garrison strength, road safety, and unrest.
	Security float64 `json:"security"`
	// Culture and HolderCulture are empty, because model.Town has no culture
	// field. Loyalty is computed from the simulation's own inputs regardless,
	// so an empty culture costs the player nothing but the label.
	Culture       string `json:"culture"`
	HolderCulture string `json:"holderCulture"`
	// Rebellious is true when loyalty collapsed below a quarter and the town
	// has stopped paying taxes.
	Rebellious bool  `json:"rebellious"`
	UnderSiege *bool `json:"underSiege,omitempty"`
	Prosperity float64 `json:"prosperity"`
	TaxRate    float64 `json:"taxRate"`
	StateTaxRate float64 `json:"stateTaxRate"`
	State        string  `json:"state"`

	// Buildings is all ten projects with their current tiers, because the
	// simulation is the authority on levels and costs.
	Buildings []BuildingInfo `json:"buildings"`
	// ConstructionBuilding is nil when no project is running.
	ConstructionBuilding *string `json:"constructionBuilding"`
	ConstructionDaysLeft float64 `json:"constructionDaysLeft"`
	Garrison            float64 `json:"garrison"`
	GarrisonConduct     float64 `json:"garrisonConduct"`
	RoadSafety          float64 `json:"roadSafety"`
	// InformationTrust has no source in model.Town, so it is always zero.
	InformationTrust float64 `json:"informationTrust"`

	Money float64 `json:"money"`
	Gold  float64 `json:"gold"`
	Metal float64 `json:"metal"`

	// UpdatedTick is the tick this settlement last changed, so the UI can show
	// staleness honestly rather than implying live data.
	UpdatedTick int               `json:"updatedTick"`
	Recruitable []RecruitableUnit `json:"recruitable"`
	Notables    []Notable         `json:"notables"`
}

// PricePoint is one entry of a price history series, oldest first.
type PricePoint struct {
	Day   int     `json:"day"`
	Price float64 `json:"price"`
}

// MarketGood is one good in a town's market.
type MarketGood struct {
	GoodID string  `json:"goodId"`
	Name   string  `json:"name"`
	Price  float64 `json:"price"`
	// PreviousPrice is nil before the town has been priced twice.
	PreviousPrice *float64     `json:"previousPrice"`
	History       []PricePoint `json:"history"`
	Stock         float64      `json:"stock"`
	Demand        float64      `json:"demand"`
}

// MarketState is a town's whole market.
type MarketState struct {
	TownID string      `json:"townId"`
	Goods  []MarketGood `json:"goods"`
}
