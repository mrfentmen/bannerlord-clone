package config

import "path/filepath"

// Config is the complete set of tunable simulation constants. Every field is
// populated from the balance file; there are no in-code defaults, so a value
// can only change by editing config/balance.toml and logging the change in
// CHANGELOG.md (CONSTITUTION.md sections 1.2 and 4.2).
//
// Fields are float64 even where the underlying quantity is a count, because
// arithmetic on the derived fields (rates, shares) needs float precision and
// keeping one numeric type avoids per-field conversion noise. Counts are
// rounded at the point of use.
type Config struct {
	// Version identifies the balance file layout. Recorded in run metadata so
	// a log can be matched to the constants that produced it.
	Version string

	World     World
	Food      Food
	Starve    Starvation
	Disease   Disease
	Labor     Labor
	Market    Market
	Currency  Currency
	Unrest    Unrest
	Loyalty   Loyalty
	Council   Council
	Migrate   Migration
	Security  Security
	Logistic  Logistics
	Upkeep    Upkeep
	Influence Influence
	March     March
	Supply    Supply
	Attrition Attrition
	Siege     Siege
	Relation  Relation
	RulerAI   RulerAI
	FactionAI FactionAI
	Cause     Cause
	Audit     Audit
	Campaign  Campaign
	Ruler     Ruler
	Election  Election
}

// World controls world generation.
type World struct {
	// Years is how many in-game years a default run simulates.
	Years float64
	// MinTowns and MaxTowns bound the number of towns generated.
	MinTowns float64
	MaxTowns float64
	// TownsPerState is the average number of towns per state in the world.
	TownsPerState float64
	// VillagesPerTown is how many food-producing villages surround each town.
	VillagesPerTown float64
	// RulersPerTown is the average number of named rulers generated per town,
	// plus the leaders. RULERS.md section 1 targets 300-800 total; the world
	// generator scales to hit that band rather than fixing a per-town count.
	RulersPerTown float64
	// MinRulers and MaxRulers clamp the total roster size to the RULERS.md
	// band of 300 to 800.
	MinRulers float64
	MaxRulers float64
	// FoodDaysTarget is the food_stock a healthy town starts with, in
	// person-days of consumption for its population.
	FoodDaysTarget float64
	// StartMoneyPerCapita and StartMetalPerCapita seed town and ruler wealth
	// from population, so a bigger town is not poorer for no reason.
	StartMoneyPerCapita float64
	StartMetalPerCapita float64
	// TownGoldPerCapita seeds a town's hard reserve from its population. A town
	// is a poor place to keep a war reserve, which is why the reserve that
	// matters is a ruler's or a side's.
	TownGoldPerCapita float64
	// StartGoldPerRuler seeds the hard reserve, which buys mercenaries.
	StartGoldPerRuler float64
	// StartSanitation is the baseline public-health quality of a town before
	// crowding, disease, or siege degrade it.
	StartSanitation float64
	// MedicinePerCapita seeds clinic stock.
	MedicinePerCapita float64
	// GarrisonPerCapita seeds the peacetime garrison, which sets road safety.
	GarrisonPerCapita float64
	// RouteDensity is the average number of connections per town, building a
	// sparse graph of real places rather than a full mesh.
	RouteDensity float64
	// PortFraction is the share of towns that are ports, which decide whether
	// a blockade can starve them (CAUSE_EFFECT.md chain 8).
	PortFraction float64
	// TerrainSpeed is the base travel speed multiplier on a good road.
	TerrainSpeed float64
	// InitialWarChance is the per-pair probability that two sides start at
	// war, so runs differ without a scripted opening war.
	InitialWarChance float64
	// AllyChance is the per-pair probability two sides start allied.
	AllyChance float64
	// PartyTroopsBase and PartyTroopsPerInfluence set army size from ruler
	// influence and renown, per MARCH_AND_WAR.md section 8.
	PartyTroopsBase         float64
	PartyTroopsPerInfluence float64
	// RulerTraitSpread is the standard deviation of generated trait scores.
	RulerTraitSpread float64
	// MercenaryFraction is the share of rulers who are mercenary captains with
	// no land (RULERS.md section 2).
	MercenaryFraction float64
	// WarlordFraction is the share who are local warlords controlling one town.
	WarlordFraction float64
	// BirthRate is the daily birth rate per person in a healthy, well-fed town.
	// A town with no growth at all would shrink only through death, which
	// understates how much a recovered region repopulates.
	BirthRate float64
	// FullFoodDays is the food buffer at which fertility is unimpaired, used to
	// scale births by how well fed a town is.
	FullFoodDays float64
	// StarvingBirthFloor is the share of normal births that continues in a
	// town living hand to mouth. Zero would mean famine stops all births
	// instantly, which is not how populations behave.
	StarvingBirthFloor float64
	// SmallTownPopulation and LargeTownPopulation bound the synthetic size
	// distribution. Both are order-of-magnitude figures for real US
	// settlements, used only when no imported data is supplied.
	SmallTownPopulation float64
	LargeTownPopulation float64
	// SizeExponent shapes the size distribution. Above 1 the distribution is
	// heavy-tailed, so a few places are very large and most are small, which is
	// how real settlement sizes actually fall.
	SizeExponent float64
	// StartUnrestMax is the highest unrest a town starts at. Nonzero, because a
	// world where every town begins perfectly content has no way to show that
	// unrest spreads.
	StartUnrestMax float64
	// PortProsperityBonus is the prosperity a port starts with above an inland
	// town of the same size, because ports trade.
	PortProsperityBonus float64
	// VillagePopShareMin and VillagePopShareMax bound a village's population
	// relative to the town it serves.
	VillagePopShareMin float64
	VillagePopShareMax float64
	// VillageSpread is how far from its town, in leagues, a village sits.
	VillageSpread float64
	// VillageYieldShare is the share of a villager's labour that becomes food
	// for its town. A village near a town is a food source; a village far from
	// one feeds itself.
	VillageYieldShare float64
	// VillageFoodDays is the food buffer a village starts with, in days.
	VillageFoodDays float64
	// RoadLengthOverDistance is how much longer a road is than the straight
	// line it follows, because roads follow ground.
	RoadLengthOverDistance float64
	// RouteExtraRoughness is the chance a road is rougher than either town it
	// joins, because it follows a river or a ridge.
	RouteExtraRoughness float64
	// CoastalPortBoost scales the port chance for coastal places, since the
	// configured fraction is an average over the whole map.
	CoastalPortBoost float64
	// FarmlandNeighbourLeagues is the radius within which a settlement's
	// neighbours compete for its hinterland.
	FarmlandNeighbourLeagues float64
	// FarmlandDensityScale normalises local population density against a
	// settlement's own size when assigning farmland.
	FarmlandDensityScale float64
	// FarmlandCrowdingPenalty is how much local crowding reduces farmland. This
	// is the food geography: an industrial region with large towns and little
	// countryside cannot feed itself.
	FarmlandCrowdingPenalty float64
	// StartPartyFoodDays is the food a party starts with, in days of its own
	// consumption.
	StartPartyFoodDays float64
	// PartyMetalPerTroop and PartyMedicinePerTroop are a starting war party's
	// ammunition and medical load.
	PartyMetalPerTroop    float64
	PartyMedicinePerTroop float64
	// MinPartyTroops is the smallest party worth creating.
	MinPartyTroops float64
	// MinRaiderBands and MaxRaiderBands bound the standing raider population.
	MinRaiderBands float64
	MaxRaiderBands float64
	// GovernorShare and LordShare are the shares of the non-leader roster that
	// are governors and lords, as against warlords and mercenaries.
	GovernorShare float64
	LordShare     float64
	// SideTreasuryBase, SideGoldBase, SideMetalBase, and SideFoodBase scale a
	// side's starting resources by its FACTIONS.md ratings, squared for money
	// and gold so the rich are genuinely much richer.
	SideTreasuryBase float64
	SideGoldBase     float64
	SideMetalBase    float64
	SideFoodBase     float64
	// MapWidthLeagues and MapHeightLeagues are the real extents of the
	// contiguous states, so a march across a section takes a plausible number
	// of days.
	MapWidthLeagues  float64
	MapHeightLeagues float64
}

// Food is the food production and consumption system.
type Food struct {
	// PersonDaysPerPersonDay is how much food one person eats per day.
	PersonDaysPerPersonDay float64
	// WorkerFoodShare is the fraction of population counted as working-age
	// healthy workers in a healthy, uncrowded town.
	WorkerFoodShare float64
	// BaseYieldPerWorker is food produced per worker per day before
	// technology, tax, unrest, and disease effects.
	BaseYieldPerWorker float64
	// FarmlandFactor converts a town's population into a farm hinterland
	// multiplier, so land availability is a real constraint (ECONOMY.md
	// section 3). Low for dense industrial cities, high for rural regions.
	FarmlandFactor float64
	// FarmlandMin and FarmlandMax clamp that multiplier.
	FarmlandMin float64
	FarmlandMax float64
	// SpoilageRate is the fraction of stored food lost per day. Higher in
	// warm, unsealed storage.
	SpoilageRate float64
	// SpoilageModSanitation scales spoilage down with sanitation.
	SpoilageModSanitation float64
	// ShockFraction is the share of production lost in a harvest shock.
	ShockFraction float64
	// ShockChance is the daily probability of a harvest shock, a random event
	// driven by season and not a scripted event (CAUSE_EFFECT.md section 7
	// bans scripted outcomes, not random weather).
	ShockChance float64
	// StockFloor stops negative food and means total loss.
	StockFloor float64
	// TradeInRate is how much of a town's surplus can be sold abroad.
	TradeInRate float64
	// TradeOutRate is how much of a town's demand can be met by imports.
	TradeOutRate float64
	// ImportShortfall is the share of demand met by imports when trade is cut,
	// before starvation begins.
	ImportShortfall float64
	// MaxDailyNetChange clamps the daily food swing so no single day can zero a
	// year's stock.
	MaxDailyNetChange float64
}

// Starvation turns an empty larder into deaths, lost workers, and anger.
type Starvation struct {
	// DeathRate is the share of population dying per day at full starvation.
	DeathRate float64
	// GraceDays is how many days a town survives on an empty larder before
	// deaths begin. TESTING_AND_BALANCE.md section 4 requires neglect to take
	// weeks, not hours, so this is deliberately several days.
	GraceDays float64
	// UnrestPerDay is unrest added per starving day.
	UnrestPerDay float64
	// WorkerLossRate is the share of workers lost per starving day.
	WorkerLossRate float64
	// SanitationLossPerDay is how much a starving population's hygiene
	// degrades, which feeds the disease system.
	SanitationLossPerDay float64
	// LoyaltyLossPerDay is loyalty lost per starving day.
	LoyaltyLossPerDay float64
	// SeverityAtDeath is the starvation severity that produces the full death
	// rate, reached after this many starving days.
	SeverityAtDeath float64
	// MoraleHit is morale lost by a garrison in a starving town.
	MoraleHit float64
	// CrowdingDeathWeight is how much crowding worsens the death rate, since
	// more people per room means weaker bodies and tighter competition.
	CrowdingDeathWeight float64
	// SanitationDeathWeight is the weaker way filthy streets add to deaths,
	// through disease killing the same people the famine is weakening.
	SanitationDeathWeight float64
	// TinyTownPopulation is the size above which a sub-one death rate is
	// rounded up to one, so a slow famine stays visible in whole-person fields.
	TinyTownPopulation float64
	// RecoveryFoodDays is the food buffer that must be rebuilt before the
	// starvation flag clears, so a town cannot flicker in and out of famine.
	RecoveryFoodDays float64
}

// Disease spreads infection and kills.
type Disease struct {
	// BaseContactRate is daily infection transmission at crowding 0.5,
	// sanitation 0.5, with no medicine.
	BaseContactRate float64
	// CrowdingWeight is how strongly crowding raises transmission.
	CrowdingWeight float64
	// SanitationWeight is how strongly poor sanitation raises transmission.
	SanitationWeight float64
	// RecoveryRate is the daily fraction of the infected who recover.
	RecoveryRate float64
	// CaseFatality is the share of infected who die per day untreated.
	CaseFatality float64
	// MedicineEfficacy is the share of new infections a treatment dose stops.
	MedicineEfficacy float64
	// DosesPerInfected is how many doses one infected person needs to cure.
	DosesPerInfected float64
	// WorkerLossPerInfected is the share of workers lost to sickness per day
	// at a given infection rate.
	WorkerLossPerInfected float64
	// UnrestPerDeath is unrest added per disease death.
	UnrestPerDeath float64
	// LoyaltyLossPerDeath is loyalty lost per disease death.
	LoyaltyLossPerDeath float64
	// CrowdingDecay is how fast crowding relaxes when nobody new arrives.
	CrowdingDecay float64
	// UnrestPerInfected is unrest added per day per unit of infection rate.
	UnrestPerInfected float64
	// SanitationLossPerCrowding is how much crowding degrades hygiene.
	SanitationLossPerCrowding float64
	// ImmunityFloor is the infection share below which an outbreak is
	// considered over.
	ImmunityFloor float64
	// MedicineDecayRate is the share of clinic stock that spoils per day.
	MedicineDecayRate float64
}

// Labor converts people into workers and workers into output.
type Labor struct {
	// HealthyWorkerShare is the working-age share of a healthy population.
	HealthyWorkerShare float64
	// MaxWorkerShare caps workers so children and the elderly are never
	// counted as labor.
	MaxWorkerShare float64
	// MinWorkerShare is the floor a devastated town can reach.
	MinWorkerShare float64
	// WorkerRecoveryRate is how fast sick or recovering workers return per day.
	WorkerRecoveryRate float64
	// ProsperityFromWorkers is how strongly labour drives commerce.
	ProsperityFromWorkers float64
	// ProsperityFromSanitation is how strongly public health drives commerce.
	ProsperityFromSanitation float64
	// ProsperityDecay is how fast prosperity falls with no support.
	ProsperityDecay float64
	// ProsperityCap is the ceiling, representing infrastructure and trade that
	// local labour cannot exceed.
	ProsperityCap float64
	// UnrestFromUnemployment is unrest added per day when there are more
	// people than work.
	UnrestFromUnemployment float64
	// UnemploymentThreshold is the worker share above which that applies.
	UnemploymentThreshold float64
	// UnemploymentMax is the worker share above which the penalty is full.
	UnemploymentMax float64
}

// Market sets prices from scarcity and road conditions.
type Market struct {
	// BasePrice is the reference price of food in an ordinary well-supplied
	// town. Prices are relative to this, never absolute.
	BasePrice float64
	// PriceElasticity is how sharply scarcity raises a price.
	PriceElasticity float64
	// PriceFloor and PriceCap bound prices so a runaway loop cannot print
	// infinity or a zero.
	PriceFloor float64
	PriceCap   float64
	// PriceInertia is how slowly a price moves toward its equilibrium, so
	// markets feel like markets and not like instant arithmetic.
	PriceInertia float64
	// RoadSafetyWeight is how much road safety dampens local prices.
	RoadSafetyWeight float64
	// WagesShare is the share of town output paid out as wages, which is what
	// makes a price rise tolerable or not.
	WagesShare float64
	// WageFollowRate is how fast wages track prices. A slow rate is the wage
	// spiral: prices outrun wages and anger builds (chain 1).
	WageFollowRate float64
	// ScarcityForPrice is the stock-to-demand ratio below which scarcity
	// pricing begins.
	ScarcityForPrice float64
	// PriceUnrestWeight is how strongly the food price drives unrest.
	PriceUnrestWeight float64
	// StockTargetDays is the buffer a merchant aims to hold, in days of
	// demand. High taxes push this down, which is chain 1's first link.
	StockTargetDays float64
	// StockTargetTaxDrag is how far a tax rate of 1 pulls that target down.
	StockTargetTaxDrag float64
	// MedicineScarcityWeight and MetalScarcityWeight set how much medical and
	// industrial scarcity raises their prices.
	MedicineScarcityWeight float64
	MetalScarcityWeight    float64
}

// Currency separates everyday money from the gold reserve.
type Currency struct {
	// WagesPerTroop is the daily money cost of one soldier.
	WagesPerTroop float64
	// GarrisonWageShare is the share of a town's wage bill carried by its
	// garrison rather than by workers.
	GarrisonWageShare float64
	// TaxIncomePerCapita is daily tax revenue per head at tax rate 1 and full
	// prosperity, before unrest and prosperity losses.
	TaxIncomePerCapita float64
	// TaxProsperityWeight is how strongly prosperity multiplies tax income.
	TaxProsperityWeight float64
	// TaxUnrestPenalty is the share of income lost at full unrest.
	TaxUnrestPenalty float64
	// TaxLoyaltyPenalty is the share of income lost when the holder is hated.
	TaxLoyaltyPenalty float64
	// TaxMaxRate is the highest tax rate a ruler may set.
	TaxMaxRate float64
	// TaxDefaultRate is the rate a ruler keeps when indifferent.
	TaxDefaultRate float64
	// TaxHarshUnrest is the unrest level above which collection fails.
	TaxHarshUnrest float64
	// BuildingUpkeepPerCapita is daily money spent keeping a town working.
	BuildingUpkeepPerCapita float64
	// MarketFeeRate is the cut of trade the town takes.
	MarketFeeRate float64
	// TradeIncomePerCaravan is daily profit per delivered caravan.
	TradeIncomePerCaravan float64
	// GoldPerMoney is the baseline gold-to-money rate.
	GoldPerMoney float64
	// ConversionCost is the share of money lost converting to gold.
	ConversionCost float64
	// InflationPerDeficit is how far the exchange rate drifts per day of
	// overspending, per unit of deficit relative to income.
	InflationPerDeficit float64
	// InflationCap bounds the exchange rate drift.
	InflationCap float64
	// InflationUnrestWeight is how much inflation feeds unrest.
	InflationUnrestWeight float64
	// BankruptcyDebtFloor is the money balance below which a ruler borrows.
	BankruptcyDebtFloor float64
	// BorrowingPerDeficit is how much debt is taken per day of deficit.
	BorrowingPerDeficit float64
	// InterestRate is the daily interest on outstanding debt.
	InterestRate float64
	// ReserveSpendRate is the largest share of a town gold reserve that can be
	// spent in one day to cover a money shortfall, so a town liquidates its
	// hard reserve over weeks of crisis rather than in a single bad week.
	ReserveSpendRate float64
	// MetalUsePerTroop is the metal a soldier consumes per day for ammunition
	// and repair, per ECONOMY.md section 4.
	MetalUsePerTroop float64
	// MetalMakeRate is the share of baseline industrial output a town at full
	// prosperity produces, before the prosperity scaling in the system.
	MetalMakeRate float64
	// SideDeficitShare is the share of a side's daily deficit that becomes
	// debt rather than an unpaid bill, at the side level.
	SideDeficitShare float64
	// MercenaryGold is the gold up front to hire a mercenary company.
	MercenaryGold float64
	// MercenaryWage is the daily money cost of a hired company.
	MercenaryWage float64
	// MercenaryValue is the renown or value the company brings.
	MercenaryValue float64
	// MercenaryTroopScale scales a company's per-troop wage from the company
	// price, so the two constants stay consistent with each other when tuned.
	MercenaryTroopScale float64
}

// Unrest turns material conditions into anger.
type Unrest struct {
	// Decay is how fast anger settles when conditions are good.
	Decay float64
	// FoodShortageWeight is how sharply a thin larder raises anger.
	FoodShortageWeight float64
	// FoodDaysCritical is the food buffer below which shortage counts fully.
	FoodDaysCritical float64
	// TaxWeight is how sharply taxation raises anger, weighted by the gap
	// between the rate and what prosperity can bear.
	TaxWeight float64
	// TaxComfortRate is the tax rate a comfortable town accepts.
	TaxComfortRate float64
	// GarrisonConductWeight is how sharply abusive soldiers raise anger.
	GarrisonConductWeight float64
	// ConductHarsh is the garrison conduct level above which abuse counts.
	ConductHarsh float64
	// DeathWeight is anger per recent death.
	DeathWeight float64
	// DeathMemoryDays is how long a death keeps provoking anger.
	DeathMemoryDays float64
	// PropagandistWeight lets a high-Influence ruler damp unrest, which is the
	// honest counterweight to a propaganda-heavy side.
	PropagandistWeight float64
	// PropagandistInfluence is the influence at which damping is full.
	PropagandistInfluence float64
	// UnrestCap is the ceiling, since a town at total anger is a special case,
	// not a gradation.
	UnrestCap float64
	// LoyaltyFloorUnrest is the unrest level at which loyalty starts falling.
	LoyaltyFloorUnrest float64
}

// Loyalty tracks attachment to the current holder.
type Loyalty struct {
	// StartLoyaltyMin and StartLoyaltyMax bound a new ruler's loyalty to their
	// leader. Not everyone starts devoted; a minority who do not are the ones
	// who defect first, which is why a side can lose anyone at all.
	StartLoyaltyMin float64
	StartLoyaltyMax float64
	// RecoverRate is how fast loyalty climbs toward its drivers when things
	// are good.
	RecoverRate float64
	// UnrestWeight is how strongly anger erodes loyalty.
	UnrestWeight float64
	// TaxWeight is how strongly a tax rate above comfort erodes loyalty.
	TaxWeight float64
	// BrokenPromiseHit is the loyalty lost when a ruler's pledge is broken,
	// which is chain 9's first link.
	BrokenPromiseHit float64
	// RaidHit is the loyalty lost to raiding or a passing war party.
	RaidHit float64
	// OutsideOfferWeight is how much a better offer elsewhere pulls loyalty
	// down, so a defection is possible when conditions support it.
	OutsideOfferWeight float64
	// OutsideOfferBase is the constant pull of simply being able to leave.
	OutsideOfferBase float64
	// ServiceGain is loyalty gained per day of competent governance, which is
	// chain 5's recovery direction.
	ServiceGain float64
	// DefectionThreshold is the loyalty at which a ruler may consider leaving.
	DefectionThreshold float64
	// DefectionLoyaltyRequired is the loyalty_to_leader a ruler needs before
	// others will take them, so one bad month is not a mass exodus.
	DefectionLoyaltyRequired float64
	// LoyaltyCap is the ceiling.
	LoyaltyCap float64
	// OfferRangeLeagues is how far a better-off neighbouring town can tempt
	// people. Distance is what makes a move costly, so the pull has a radius.
	OfferRangeLeagues float64
	// OfferGap is the loyalty advantage a neighbour needs before it tempts
	// anyone at all.
	OfferGap float64
	// OfferProximityWeight scales the pull for a nearby alternative, so an
	// adjacent prosperous town is a stronger temptation than a distant one.
	OfferProximityWeight float64
}

// Council decides who holds a town.
type Council struct {
	// LoyaltyStartMin and LoyaltyStartMax bound the loyalty a town begins with.
	// Nobody is born disloyal, so the band is high; a world starting with every
	// town near a revolt threshold has no room to show a revolt happening.
	LoyaltyStartMin float64
	LoyaltyStartMax float64
	// VoteThreshold is the loyalty below which a no-confidence vote can pass.
	VoteThreshold float64
	// UnrestRequired is the unrest a vote also requires, so a single bad
	// harvest cannot unseat anyone.
	UnrestRequired float64
	// DaysBelowThreshold is how many days conditions must persist before a
	// vote is allowed, which is what makes the chain take weeks.
	DaysBelowThreshold float64
	// QuorumShare is the share of the council that must be present.
	QuorumShare float64
	// CouncilorUnrestWeight is how each councilor's own anger turns into a
	// vote against the holder.
	CouncilorUnrestWeight float64
	// CouncilorLoyaltyWeight is how councilors defend the status quo.
	CouncilorLoyaltyWeight float64
	// VoteChanceBase is the daily probability of a vote passing once every
	// condition is met.
	VoteChanceBase float64
	// VoteChanceUnrestWeight is how much unrest raises that chance.
	VoteChanceUnrestWeight float64
	// SuccessorPoolSize is how many candidate rulers are considered.
	SuccessorPoolSize float64
	// InstabilityUnrestWeight is how unrest destabilises a side's provinces.
	InstabilityUnrestWeight float64
	// InstabilityThreshold is the unrest above which a side starts losing
	// provinces, which is how a collapse cascades.
	InstabilityThreshold float64
	// InstabilityDailyChance is the per-province daily chance of secession.
	InstabilityDailyChance float64
	// LoyaltyDriftPerDay is the slow daily loyalty change in a quiet town.
	LoyaltyDriftPerDay float64
	// LoyaltyAfterSuccession is the loyalty a town starts at with a new holder.
	// A honeymoon, not a reset to loyalty, because the new holder inherits the
	// town's problems along with its people.
	LoyaltyAfterSuccession float64
	// QuorumRequired is the council support a vote needs before it can pass.
	// Without a quorum a loud minority could unseat a broadly popular holder.
	QuorumRequired float64
	// InflectionLossOnHumiliation is influence a ruler loses for being voted out.
	InflectionLossOnHumiliation float64
	// InfluenceGainOnPromotion is influence a new holder gains for being chosen.
	InfluenceGainOnPromotion float64

	// SuccessorRangeLeagues is how far a candidate ruler can be and still be
	// chosen. Distance limits power as well as marching.
	SuccessorRangeLeagues float64
	// SuccessorDistanceWeight discounts a distant candidate's standing.
	SuccessorDistanceWeight float64
	// SuccessorRelationWeight lets a ruler the incumbent likes succeed them, so
	// a vote can transfer power to an ally rather than an enemy.
	SuccessorRelationWeight float64
	// MercenaryPenalty discounts a landless captain as a holder.
	MercenaryPenalty float64
	// SecessionLoyaltyCutoff is the loyalty_to_leader above which a province
	// will not secede, because its ruler still has the leader's backing.
	SecessionLoyaltyCutoff float64
	// SecessionRangeLeagues is how far a town will look for a better side to
	// join.
	SecessionRangeLeagues float64
}

// Migration moves people, and infection, between towns.
type Migration struct {
	// FleeThreshold is the unrest at which people start leaving.
	FleeThreshold float64
	// FleeStarvationDays is the food buffer below which flight outruns flight
	// from mere anger.
	FleeStarvationDays float64
	// FleeInfected is the infection rate that makes people flee a plague.
	FleeInfected float64
	// MaxFleeShare is the largest share of a population that can leave per
	// day, so towns empty over weeks rather than instantly.
	MaxFleeShare float64
	// FleeToCapacityShare is the share of arrivals a town can absorb before
	// crowding bites hard, which is chain 2's trigger.
	FleeToCapacityShare float64
	// CrowdingPerArrival is how much each arrival adds to crowding.
	CrowdingPerArrival float64
	// CrowdingCap is the crowding level representing a fully packed town.
	CrowdingCap float64
	// CrowdingBase is the crowding of a town at its designed capacity.
	CrowdingBase float64
	// InfectionCarried is the share of a fugitive's condition that carries to
	// the destination, which is how a plague travels.
	InfectionCarried float64
	// AttractionShare is how much of a healthy, rich, calm town pulls people,
	// which is what makes recovery possible.
	AttractionShare float64
	// ImmigrantsPerDayCap bounds inward movement.
	ImmigrantsPerDayCap float64
	// WorkerGainPerImmigrant is the immediate labour gain from an arrival.
	WorkerGainPerImmigrant float64
	// MaxMoveLeagues is how far people will move to a better town. Distance is
	// what makes migration costly, and it bounds how far a plague can travel in
	// one wave.
	MaxMoveLeagues float64
	// DesperationWeight is how much a starving or diseased source pushes its
	// people out regardless of the destination's quality, because the
	// alternative is worse. This is what makes flight during a famine spread
	// the disease it was fleeing.
	DesperationWeight float64
	// InfectionRepulsion is how strongly a known outbreak suppresses a town's
	// attractiveness, as a multiple of its infection rate. People avoid a place
	// they know is sick, which slows an epidemic and is the honest reason
	// diseases spread at borders rather than uniformly.
	InfectionRepulsion float64
}

// Security keeps roads passable.
type Security struct {
	// PatrolCoverage is how many troops per route segment count as adequate
	// patrol, scaled by distance.
	PatrolCoverage float64
	// ConductEffect is how much abusive troops corrupt the roads they guard,
	// so a cruel garrison makes its own area less safe.
	ConductEffect float64
	// BaseRoadSafety is the safety of an undefended but peaceful route.
	BaseRoadSafety float64
	// StartGarrisonConduct is the baseline discipline of a new garrison. It
	// starts slightly below the good-conduct mark, because a soldiery that is
	// perfectly disciplined from day one is not a thing that exists.
	StartGarrisonConduct float64
	// RaiderDecayRate is how fast raiders disperse when a route is held.
	RaiderDecayRate float64
	// RobChanceBase is the base chance a caravan is attacked on a route.
	RobChanceBase float64
	// RobChanceSafetyWeight is how sharply road safety reduces that chance.
	RobChanceSafetyWeight float64
	// GarrisonDetachShare is the share of a garrison that goes with a ruler to
	// war, which is chain 3's cause: pulling troops out rots the roads.
	GarrisonDetachShare float64
	// DeserterShare is the share of deserters that turn to raiding.
	DeserterShare float64
	// MoraleGarrisonEffect is how much a demoralised garrison stops patrolling.
	MoraleGarrisonEffect float64
	// MinGarrisonForIsolated is the garrison an isolated town needs to count as
	// fully covered. Isolated towns have no roads to patrol, so without this
	// they would always read as zero-coverage and therefore unsafe.
	MinGarrisonForIsolated float64
	// GoodConduct is the garrison conduct level above which troops are not
	// actively harmful, used as the reference point for the conduct penalty.
	GoodConduct float64
	// RaiderSpawnRate is how fast a raider band grows on a busy but undefended
	// road, per unit of traffic.
	RaiderSpawnRate float64
	// RaiderGrowthFromSize is how fast a large band grows on its own, so a band
	// that is not suppressed becomes a problem that spreads.
	RaiderGrowthFromSize float64
	// RaiderBandMin is the size below which a band is still a band of criminals
	// rather than a minor army.
	RaiderBandMin float64
	// RaiderTroopPerStrength is how many troops a unit of raider pressure buys.
	RaiderTroopPerStrength float64
	// RaiderSafetyDrag is how sharply raiders cut a route's safety. It is a
	// divisor, so the effect saturates: enough raiders make a road impassable
	// but never worse than impassable.
	RaiderSafetyDrag float64
	// TerrainSafetyDrag is how much rough terrain lowers route safety, at full
	// roughness.
	TerrainSafetyDrag float64
}

// Logistics runs caravans on routes.
type Logistics struct {
	// SpeedPerDay is base travel speed on a safe road in leagues per day.
	SpeedPerDay float64
	// SafetySpeedWeight is how much an unsafe road slows a caravan.
	SafetySpeedWeight float64
	// TerrainSpeedWeight is how much terrain slows a caravan.
	TerrainSpeedWeight float64
	// SpoilagePerDay is what a caravan loses in transit without cold storage.
	SpoilagePerDay float64
	// CaravanCapacity is how much of each good one caravan can carry.
	CaravanCapacity float64
	// CaravanFoodNeed is what a caravan's animals and guards eat per day.
	CaravanFoodNeed float64
	// CaravanRiskDeath is the share of caravan strength lost to raiders.
	CaravanRiskDeath float64
	// FoodShare, MedicineShare, MetalShare are the shares of cargo that are
	// food, medicine, and metal.
	FoodShare     float64
	MedicineShare float64
	MetalShare    float64
	// TradeMargin is the profit per delivered unit before fees.
	TradeMargin float64
	// BlockadeEffect is how completely a blockade stops imports, per the
	// chain-8 requirement that imports stop.
	BlockadeEffect float64
	// CaravanLossUnrest is unrest added to a town starved by lost trade.
	CaravanLossUnrest float64
	// CaravanGuards is how many troops escort a caravan. Enough to deter
	// casual bandits, not enough to stop a raider band.
	CaravanGuards float64
	// CaravanFoodDays is how many days of food a caravan carries for its own
	// animals and guards, so a long road does not starve the escort.
	CaravanFoodDays float64
	// DispatchShare is the share of a town's surplus a dispatched caravan
	// loads, leaving the rest for the town itself.
	DispatchShare float64
	// MinSurplusForCaravan is the smallest load worth the risk and the walk.
	// Below it, merchants stay home, which is why a barely-off surplus town
	// does not solve a neighbour's famine by accident.
	MinSurplusForCaravan float64
	// MinSafetyToDispatch is the road safety below which merchants will not
	// travel at all. Without this an unsafe road would make trade loss-making
	// but still happening; in reality it stops entirely, which is what makes
	// chain 3 so damaging.
	MinSafetyToDispatch float64
	// MaxCaravansPerRoute caps how many caravans a single road carries, so a
	// rich town cannot flood the roads with its own trade.
	MaxCaravansPerRoute float64
}

// Upkeep pays troops, and unpaid troops leave.
type Upkeep struct {
	// MoraleWagesWeight is how unpaid wages hit morale.
	MoraleWagesWeight float64
	// MoraleFoodWeight is how hunger hits morale.
	MoraleFoodWeight float64
	// MoralePerOwedDay is morale lost per day of accumulated unpaid wages.
	MoralePerOwedDay float64
	// WagesGraceDays is how many days of arrears troops tolerate.
	WagesGraceDays float64
	// DesertionRate is the daily rate troops leave once morale breaks.
	DesertionRate float64
	// DesertionMoraleThreshold is the morale below which desertion starts.
	DesertionMoraleThreshold float64
	// DesertionMaxShare is the daily cap on desertion so a collapse is not
	// instantaneous.
	DesertionMaxShare float64
	// MoraleRecoveryRate is how fast morale returns when paid and fed.
	MoraleRecoveryRate float64
	// MoraleCap is the ceiling.
	MoraleCap float64
	// WagesOwedPerDayUnpaid is how debt accumulates per troop per day.
	WagesOwedPerDayUnpaid float64
	// ContractChance is the daily chance an unpaid ruler loses mercenaries.
	ContractChance float64
	// MilitiaCost is the daily money cost of raising local militia.
	MilitiaCost float64
	// MilitiaMax is the largest militia a town can field.
	MilitiaMax float64
	// MilitiaPerUnrest is how much anger adds to militia willingness.
	MilitiaPerUnrest float64
	// DesertionInfluenceLoss is influence lost per deserter, which makes
	// unpaid troops a political problem too.
	DesertionInfluenceLoss float64
	// LeadershipMoraleWeight is how much a commander's generosity and valour
	// steady their troops. RULERS.md section 4 requires traits to have concrete
	// effects, and this is the clearest one.
	LeadershipMoraleWeight float64
	// MinTroopsToPersist is the size below which a party dissolves rather than
	// limping on. A war party of four is not a war party, and leaving it on the
	// map would let a ruler field unlimited trivial forces for free.
	MinTroopsToPersist float64
}

// Influence and renown are political currency.
type Influence struct {
	// ServicePerDay is influence gained per day of governing competently, where
	// competence means low unrest and healthy holdings.
	ServicePerDay float64
	// ServiceUnrestWeight is how unrest reduces that gain.
	ServiceUnrestWeight float64
	// VictoryInfluence is influence from winning a field battle.
	VictoryInfluence float64
	// SiegeInfluence is influence per day of a successful siege.
	SiegeInfluence float64
	// BrokenOathInfluence is influence lost by breaking a pledge, the political
	// half of chain 9.
	BrokenOathInfluence float64
	// DefectionInfluenceLoss is influence lost when a vassal leaves.
	DefectionInfluenceLoss float64
	// InfluenceDecay is how fast unused influence fades.
	InfluenceDecay float64
	// InfluenceCap is the ceiling.
	InfluenceCap float64
	// RenownPerVictory is renown from a victory.
	RenownPerVictory float64
	// RenownPerRaid is renown from a raid.
	RenownPerRaid float64
	// RenownPerBrokenOath is renown lost by an atrocity.
	RenownPerBrokenOath float64
	// RenownDecay and RenownCap bound renown.
	RenownDecay float64
	RenownCap   float64
	// InfluenceDefectThreshold is how much outside appeal a ruler needs before
	// a rival can poach them, which is chain 7's last link.
	InfluenceDefectThreshold float64
	// RelationSpreadShare is how much a ruler's own relations are used when
	// deciding whom to approach.
	RelationSpreadShare float64
	// LeaderInfluence and LeaderRenown are what a side leader starts with.
	// A leader begins with far more of both than any other ruler, because the
	// whole power structure of a side hangs off their standing.
	LeaderInfluence float64
	LeaderRenown    float64
	// LeadershipUpkeep is the daily influence a side leader consumes doing the
	// job. Without it a leader would accumulate power without limit.
	LeadershipUpkeep float64
	// LoyaltyWearinessWeight, LoyaltyTreasuryWeight, and LoyaltyVictoryWeight
	// are how a leader's fortunes move vassal loyalty. A leader who is visibly
	// winning keeps their people; one who is exhausted and broke does not.
	// This is chain 7's political mechanism: a war empties a coalition before
	// it loses a battle.
	LoyaltyWearinessWeight float64
	LoyaltyTreasuryWeight  float64
	LoyaltyVictoryWeight   float64
	// LoyaltyOwnTownWeight is how much a ruler's own collapsing town costs
	// their loyalty to the leader who cannot hold it.
	LoyaltyOwnTownWeight float64
	// LoyaltyOwnTownBonus is the loyalty gained from governing a town well.
	LoyaltyOwnTownBonus float64
}

// March moves parties across real distance.
type March struct {
	// SpeedPerDay is base travel speed in leagues per day on a good road.
	SpeedPerDay float64
	// SafetySpeedWeight is how much a bad road slows a column.
	SafetySpeedWeight float64
	// TerrainSpeedWeight is how much terrain slows a column.
	TerrainSpeedWeight float64
	// FatiguePerDay is fatigue gained per day marching, before modifiers.
	FatiguePerDay float64
	// FatigueDecay is how fast rest recovers fatigue when halted.
	FatigueDecay float64
	// FatigueSpeedWeight is how much fatigue slows a column, which is how a
	// long march grinds itself down.
	FatigueSpeedWeight float64
	// SizeSpeedWeight is how much a larger column moves slower.
	SizeSpeedWeight float64
	// SizeReference is the column size at which the size penalty is neutral.
	SizeReference float64
	// FoodPerTroop is daily food drawn per soldier.
	FoodPerTroop float64
	// MoneyPerTroop is daily wages drawn per soldier.
	MoneyPerTroop float64
	// MetalPerTroop is daily ammunition and repair drawn per soldier.
	MetalPerTroop float64
	// LoadSpeedWeight is how much heavy cargo slows a column.
	LoadSpeedWeight float64
	// MoraleMarchWeight is how much marching itself wears morale.
	MoraleMarchWeight float64
	// ArrivalMoraleBonus is morale regained by reaching an objective, so a
	// successful long march is possible. Without it distance would be a wall
	// rather than a cost.
	ArrivalMoraleBonus float64
	// TerrainFatigueWeight is how much rough ground adds to daily fatigue, per
	// unit of terrain roughness.
	TerrainFatigueWeight float64
	// StationaryFoodRate is the food a soldier consumes per day while not
	// marching, relative to a soldier on the march. Quartering is cheaper than
	// campaigning but not free.
	StationaryFoodRate float64
	// MinSpeed is the floor on a column's daily speed, so a party can never be
	// completely stuck and a bug cannot freeze the simulation.
	MinSpeed float64
	// WinterSeverity is how much slower winter makes a column, at full effect.
	WinterSeverity float64
	// SeasonSeverity is the milder autumn effect, for contrast with winter.
	SeasonSeverity float64
	// WeatherSwing is the range of the daily weather draw around the seasonal
	// factor. A random effect, not a scripted event.
	WeatherSwing float64
	// ExposureWeight is how much exposed ground amplifies bad weather.
	ExposureWeight float64
}

// Supply keeps an army fed from friendly towns.
type Supply struct {
	// ResupplyFraction is the share of a town surplus a passing army can take.
	ResupplyFraction float64
	// ResupplyDistanceWeight is how much distance from the town cuts that.
	ResupplyDistanceWeight float64
	// DaysOfFoodStarved is how long an army goes hungry before morale breaks.
	DaysOfFoodStarved float64
	// StarvingMoraleLoss is morale lost per hungry day.
	StarvingMoraleLoss float64
	// HomeStockReserve is the share of a town's food it will not surrender.
	HomeStockReserve float64
	// BlockedResupply is how completely a blockade stops resupply.
	BlockedResupply float64
	// SupplyMoraleBonus is morale gained by an army that is well supplied.
	SupplyMoraleBonus float64
	// AttritionSpeedWeight is how far from a supply point attrition bites.
	AttritionSpeedWeight float64
	// ResupplyRangeLeagues is how far an army can be from a friendly town and
	// still draw food from it. Beyond this an army is on its own, which is the
	// whole of chain 6's supply problem.
	ResupplyRangeLeagues float64
	// BlockadeBlockSupply is the blockade level above which a town cannot
	// supply an army, because no food is coming in by any route.
	BlockadeBlockSupply float64
}

// Attrition wears an army down on the march and in the field.
type Attrition struct {
	// ExhaustionRate is the daily casualty share from fatigue and hunger.
	ExhaustionRate float64
	// DiseaseRate is the daily casualty share from disease in the column.
	DiseaseRate float64
	// DiseaseFromCrowding is infection growth in a marching column.
	DiseaseFromCrowding float64
	// DiseaseFromSanitation is how poor field hygiene raises it.
	DiseaseFromSanitation float64
	// MedicineEfficacy is how much field medicine reduces disease losses.
	MedicineEfficacy float64
	// FatigueThreshold is the fatigue above which exhaustion starts.
	FatigueThreshold float64
	// CasualtyMoraleHit is morale lost per casualty taken.
	CasualtyMoraleHit float64
	// CasualtyCap is the largest daily casualty share.
	CasualtyCap float64
	// TerrainAttritionWeight is how much rough terrain adds to attrition.
	TerrainAttritionWeight float64
	// WoundedRecoveryRate is how fast wounded return to duty given medicine.
	WoundedRecoveryRate float64
	// WoundedRecoveryMedicineWeight is how much medicine speeds recovery.
	WoundedRecoveryMedicineWeight float64
	// DiseaseRecoveryRate is how fast disease in a column burns out on its own
	// once the source is gone.
	DiseaseRecoveryRate float64
	// CrowdingReferenceTroops is the column size at which crowding stops being
	// the main concern. Bigger columns are more cramped in proportion.
	CrowdingReferenceTroops float64
	// MedicinePerTroop is the field medicine a healthy column should carry per
	// soldier. A column below this fraction is short of medical care.
	MedicinePerTroop float64
	// MedicinePerDeath is the medicine consumed per death from disease.
	MedicinePerDeath float64
	// DeadShare is the share of casualties that die rather than being wounded.
	// A low share makes medicine valuable, because the wounded come back.
	DeadShare float64
	// StarvationExhaustionWeight is how much worse exhaustion bites a starving
	// column. Hunger does not merely add casualties, it makes every other
	// hazard worse.
	StarvationExhaustionWeight float64
	// SupplyRangeReference is the supply distance treated as "no supply at
	// all", for the exhaustion term. It is kept here rather than read from the
	// supply system's config because a system may not import another system's
	// constants; the two are tuned together and any change is logged in
	// CHANGELOG.md with the runs that motivated it.
	SupplyRangeReference float64
	// MinTroopsToPersist is the size below which a party dissolves. Duplicated
	// from the upkeep system's constant for the same reason: no system imports
	// another, so shared limits are stated in each system that enforces them.
	MinTroopsToPersist float64
}

// Siege starves a town into opening its gates.
type Siege struct {
	// FoodBurnPerTroop is the besieger's daily food draw.
	FoodBurnPerTroop float64
	// AttritionPerDay is the attacker's daily casualty share from disease in
	// the besieging camp.
	AttritionPerDay float64
	// DiseasePerDay is how fast disease grows inside a besieged town, which is
	// chain 10's second link.
	DiseasePerDay float64
	// SanitationLossPerDay is how the crowded, unsupplied town degrades.
	SanitationLossPerDay float64
	// LoyaltyLossPerDay is how fast the besieged town stops trusting its ruler.
	LoyaltyLossPerDay float64
	// UnrestLossPerDay is unrest added per day under siege.
	UnrestLossPerDay float64
	// GateOpenFoodDays is the food buffer at which the defenders may capitulate
	// without a fight, which is chain 10's outcome.
	GateOpenFoodDays float64
	// GateOpenLoyalty is the loyalty at which they may capitulate.
	GateOpenLoyalty float64
	// GateOpenUnrest is the unrest at which they may capitulate.
	GateOpenUnrest float64
	// GateOpenChance is the daily chance of capitulation once conditions are
	// met, so gates still open over days rather than instantly.
	GateOpenChance float64
	// MaxDays bounds a siege so a war cannot stall forever.
	MaxDays float64
	// BreachDays is how many days of equipment work breach a town's walls.
	BreachDays float64
	// ReliefRadius is how close a friendly army must be to lift a siege.
	ReliefRadius float64
	// MinTroopsToBesiege is the smallest force that can lay siege to a town. A
	// lone rider cannot besiege anything, and a one-man army should not be
	// able to starve a city.
	MinTroopsToBesiege float64
	// CrowdingPerDay is how much crowding grows daily in a besieged town, from
	// refugees and from the garrison and its dependants shut inside.
	CrowdingPerDay float64
	// EquipmentPerBreachDay is the metal consumed per day of siege work.
	// Reinstated here because the breach calculation needs both the rate and
	// the work it buys.
	EquipmentPerBreachDay float64
	// BreachWorkPerDay is the work one unit of metal buys, in days-equivalent.
	BreachWorkPerDay float64
	// GatePatienceDays is how long defenders last before their patience for
	// dying for a wall runs out. It scales the capitulation chance, so gates
	// open over days rather than the first eligible tick.
	GatePatienceDays float64
	// InfluenceLossOnFall is influence a ruler loses when a town is taken.
	InfluenceLossOnFall float64
	// InfluenceLossOnFailedSiege is influence lost by a ruler who could not
	// take a town, so an expensive failure costs politically as well as
	// materially.
	InfluenceLossOnFailedSiege float64
	// LoyaltyAfterSurrender is the loyalty a town starts at under a conqueror.
	// Low, because a population that surrendered under duress does not love its
	// new master.
	LoyaltyAfterSurrender float64
	// RenownForBloodlessWin scales the renown for taking a town without a
	// battle, which is worth less than winning one.
	RenownForBloodlessWin float64
}

// Ruler configures ruler generation and per-ruler limits.
type Ruler struct {
	// AgeMin and AgeMax bound a generated ruler's age. RULERS.md section 8 has
	// rulers age, have heirs, and die; the age band is what makes succession a
	// real concern rather than a formality.
	AgeMin float64
	AgeMax float64
	// BaseInfluence and InfluencePerTier set a new ruler's standing by rank, so
	// a realm has a power structure rather than fifty equal lords.
	BaseInfluence    float64
	InfluencePerTier float64
	// RenownFromInfluence converts influence into opening renown.
	RenownFromInfluence float64
	// StartMoney is a new ruler's personal treasury.
	StartMoney float64
	// PartyKeepChance is the share of rulers who keep a war party at all. Most
	// do not, because most historical lords were not soldiers, and a map where
	// every ruler is fielded is much more militarised than it should be.
	PartyKeepChance float64
	// MaxPartyTroopsBase and MaxPartyTroopsPerRenown cap a party's size by
	// renown, which is how MARCH_AND_WAR.md section 8's army limit is
	// enforced. Without a cap a high-influence ruler fields an army the size of
	// a side.
	MaxPartyTroopsBase      float64
	MaxPartyTroopsPerRenown float64
	// PartyMoneyShare and PartyGoldShare are the shares of a ruler's wealth
	// committed to their party.
	PartyMoneyShare float64
	PartyGoldShare  float64
	// MercenaryCaravanChance is the share of mercenary captains who also run a
	// supply caravan, which is how they earn between contracts.
	MercenaryCaravanChance float64
}

// Relation tracks how rulers and sides regard each other.
type Relation struct {
	// GiftRelation is the relation gained from a gift or bribe.
	GiftRelation float64
	// GiftGoldToRelation is how much gold buys one point of relation, which
	// lets a rich side buy loyalty, per FACTIONS.md.
	GiftGoldToRelation float64
	// BattleRelation is the relation lost by attacking someone.
	BattleRelation float64
	// RaidRelation is the relation lost by raiding.
	RaidRelation float64
	// BrokenOathRelation is the relation lost by breaking a pledge, and how
	// much it spreads to that ruler's allies, which is chain 9.
	BrokenOathRelation float64
	// BrokenOathSpread is the share of the loss each ally absorbs.
	BrokenOathSpread float64
	// SharedEnemyRelation is the relation gained by fighting a common enemy.
	SharedEnemyRelation float64
	// DefectionRelation is the relation lost by a ruler who switches sides.
	DefectionRelation float64
	// RelationCap and RelationFloor bound a score.
	RelationCap   float64
	RelationFloor float64
	// DriftPerDay is the slow drift toward neutral, so grudges fade.
	DriftPerDay float64
	// CoalitionThreshold is the average relation with a side below which
	// coalition partners agree to fight together, which is chain 9's outcome.
	CoalitionThreshold float64
	// CoalitionSpreadTolerance is how much individual opinion a ruler may
	// differ by and still join a coalition.
	CoalitionSpreadTolerance float64
	// StartRelationMean and StartRelationSpread set the opening opinion
	// between sides. A mean of zero with a real spread means some pairs begin
	// hostile and some indifferent, which is a world rather than a default.
	StartRelationMean   float64
	StartRelationSpread float64
	// StartAllyRelationMin and StartAllyRelationMax bound the opening opinion
	// between rulers of the same side, who share a leader and so start friendly.
	StartAllyRelationMin float64
	StartAllyRelationMax float64
	// AlliedRelationBonus is how much forming an alliance improves the relation
	// between two sides.
	AlliedRelationBonus float64
	// TrustDecayPerBetrayal is how much a broken pledge reduces general
	// trust, making future coalitions easier to form.
	TrustDecayPerBetrayal float64
	// AllyThreshold is the opinion above which two rulers count as allies,
	// which determines whose opinion a betrayal reaches.
	AllyThreshold float64
	// SideDriftShare scales side-level drift against ruler-level, so sides
	// change opinion more slowly than individuals.
	SideDriftShare float64
	// SideInheritRate is how fast a side's opinion moves toward what its
	// rulers collectively believe.
	SideInheritRate float64
	// CoalitionQuorumShare is the share of a side's rulers who must personally
	// agree before the side commits to a coalition.
	CoalitionQuorumShare float64
}

// RulerAI is the utility scoring for an individual ruler's daily choice.
type RulerAI struct {
	// AttackWeight is the attraction of attacking a weak neighbour.
	AttackWeight float64
	// TargetWeaknessWeight is how much a starved, unhappy target attracts.
	TargetWeaknessWeight float64
	// DefendWeight is the attraction of returning to defend home.
	DefendWeight float64
	// RaidWeight is the attraction of raiding.
	RaidWeight float64
	// AidWeight is the attraction of sending food or medicine to a suffering
	// ally, which is what makes chain 5's recovery possible.
	AidWeight float64
	// TradeWeight is the attraction of running trade.
	TradeWeight float64
	// RestWeight is the attraction of doing nothing and recovering.
	RestWeight float64
	// DistancePenalty is how much per league of travel a choice is discounted.
	DistancePenalty float64
	// SupplyCheckFood is the days of food a ruler wants before setting out.
	SupplyCheckFood float64
	// OverextensionMorale is the morale level below which a ruler abandons a
	// campaign and goes home, which is how overlong marches end.
	OverextensionMorale float64
	// TraitAttackWeight and friends are how strongly each trait tilts a
	// choice. RULERS.md section 4 requires traits to have concrete effects.
	TraitAttackWeight      float64
	TraitAidWeight         float64
	TraitTradeWeight       float64
	TraitRestWeight        float64
	TraitRaidWeight        float64
	AmbitionLandWeight     float64
	AmbitionWealthWeight   float64
	AmbitionRevengeWeight  float64
	AmbitionSecurityWeight float64
	// HateWeight is how much a low relation with a target raises the
	// attraction of attacking it, which is how grudges become wars.
	HateWeight float64
	// Randomness is the seeded jitter applied to scores so identical states
	// do not produce identical choices forever, bounded so it never overrides
	// the state, per CAUSE_EFFECT.md section 7.
	Randomness float64
	// TaxRaiseUnrestTolerance is the unrest a ruler will accept to raise
	// taxes, so greedy behaviour emerges from traits rather than a script.
	TaxRaiseUnrestTolerance float64
	// TaxCutLoyaltyGain is the loyalty a ruler trades for lower taxes.
	TaxCutLoyaltyGain float64
	// ExecuteChance is the chance a captured ruler with low Mercy and Honor is
	// executed, which is chain 9's trigger.
	ExecuteChance float64
	// PrisonerRansomGold is gold expected from ransoming a ruler.
	PrisonerRansomGold float64
	// PrisonerRansomRelation is the relation cost of ransoming.
	PrisonerRansomRelation float64
	// DecideEveryDays is how often a ruler makes a decision. Deciding daily
	// would make rulers twitchy; every few days is what makes a campaign feel
	// like a decision rather than a reflex.
	DecideEveryDays float64
	// StarvingArmyPenalty is how much a starving army reduces a ruler's
	// willingness to act offensively. An army that cannot march cannot attack,
	// whatever its opinion of the target.
	StarvingArmyPenalty float64
	// LowSupplyPenalty is how much an army short of food reduces offensive
	// willingness. This is the supply check from MARCH_AND_WAR.md section 1.
	LowSupplyPenalty float64
	// AidBlockedByOwnCrisis scales aid down when the ruler has a crisis at
	// home. Help is not freely given, and that is a real strategic limit.
	AidBlockedByOwnCrisis float64
	// StarvingTargetWeakness is the target weakness above which an attack is
	// attributed to the target's hunger rather than to ambition.
	StarvingTargetWeakness float64
	// GrievanceHateThreshold is how disliked a ruler must be before an attack
	// is attributed to a grievance.
	GrievanceHateThreshold float64
	// AttackBlockedByHomeThreat scales attack down as the ruler's own position
	// worsens, because a ruler does not leave home undefended.
	AttackBlockedByHomeThreat float64
	// DefectWeight is the attraction of leaving one's own side. Deliberately
	// small: a ruler needs low loyalty, a collapsed situation, and a buyer, and
	// all three, because a world where sides collapse constantly fails the
	// balance rule.
	DefectWeight float64
	// DefectLeaderWeariness and DefectLeaderDebt are how much a leader's
	// exhaustion and debts make their own vassals leave.
	DefectLeaderWeariness float64
	DefectLeaderDebt      float64
	// DefectOwnCollapse is how much a ruler's own collapsing town pushes them
	// to look elsewhere.
	DefectOwnCollapse float64
	// PeaceWeight is the attraction of asking for terms when exhausted.
	PeaceWeight float64
	// BlockadeWeight is the attraction of blockading a port instead of
	// assaulting it, which is chain 8's mechanism and is cheaper and slower.
	BlockadeWeight float64
	// AidRangeLeagues is how far a ruler will send aid. Range 30-1000.
	AidRangeLeagues float64
	// AidFoodThreshold is the food buffer below which a town is asking for help.
	AidFoodThreshold float64
	// AttackRangeLeagues is how far a ruler will march to attack. Distance is
	// the single most important limit on what any AI in this game can do.
	AttackRangeLeagues float64
	// TargetFoodDays is the food buffer, in days, at which a target counts as
	// having nothing left.
	TargetFoodDays float64
	// TargetUnrestWeight is how much a target's unrest adds to its apparent
	// weakness.
	TargetUnrestWeight float64
	// TargetMinPopulationScale is the town size at which a target is fully
	// worth attacking. Below it the value falls away, so the AI does not chase
	// the weakest hamlet on the map.
	TargetMinPopulationScale float64
	// IntelligenceBlurMax is the worst-case relative error in a ruler's estimate
	// of a target, at zero intelligence.
	IntelligenceBlurMax float64
	// IntelligenceScale is the influence plus renown at which a ruler's
	// estimates become exact. This is FACTIONS.md's intelligence rating made
	// mechanical, and it is what makes a surprise attack possible.
	IntelligenceScale float64
	// RaidRangeLeagues is how far a ruler will ride to raid. Shorter than the
	// attack range, because raiding is a local activity.
	RaidRangeLeagues float64
	// RaidFoodPerCapita is the food per resident that makes a village worth
	// raiding.
	RaidFoodPerCapita float64
	// RaidMemoryDecayDays is how long a village remembers a raid, and so how
	// long before it is worth raiding again.
	RaidMemoryDecayDays float64
	// TradeRangeLeagues is how far a ruler will trade. Trade follows the roads,
	// so it is shorter than a campaign.
	TradeRangeLeagues float64
	// TradePriceSensitivity is how strongly a price difference becomes a
	// trading margin.
	TradePriceSensitivity float64
	// BlockadeImportDependency is how strongly a port's reliance on food
	// imports makes it worth blockading. A region that feeds itself cannot be
	// starved from the sea.
	BlockadeImportDependency float64
	// BlockadeTargetFoodDays is the food buffer above which a port is less
	// worth blockading.
	BlockadeTargetFoodDays float64
	// TaxCapacityFromProsperity is how much a town's prosperity raises the tax
	// it can bear.
	TaxCapacityFromProsperity float64
	// TaxCapacityFromUnrest is how much a town's anger lowers the tax it can
	// bear. A town that is already furious can bear nothing more, which is why
	// pushing taxes further is self-defeating rather than merely unpopular.
	TaxCapacityFromUnrest float64
	// TaxGenerosityWeight is how much a generous ruler taxes less. This is the
	// single most important line in the tax model, because it is how greed
	// becomes policy without anything being scripted.
	TaxGenerosityWeight float64
	// TaxCalculationWeight is how much a calculating ruler taxes differently,
	// optimising within what the town can bear rather than simply pressing.
	TaxCalculationWeight float64
	// TaxNeedReference is the treasury balance below which a ruler taxes hard
	// whatever their nature, because a ruler who is broke has no choice.
	TaxNeedReference float64
	// TaxNeedPressure is how hard such a ruler taxes.
	TaxNeedPressure float64
	// TaxFearUnrestRate is how fast a fearful ruler pulls the rate back toward
	// what the town can bear.
	TaxFearUnrestRate float64
	// TaxCutLoyaltyThreshold is the loyalty below which a generous ruler cuts
	// taxes deliberately to buy it back.
	TaxCutLoyaltyThreshold float64
	// TaxChangeRate is the largest daily move in the tax rate. A policy, not a
	// switch, so a player can anticipate it.
	TaxChangeRate float64
}

// FactionAI is the strategic layer for whole sides.
type FactionAI struct {
	// DeclareWarWeight is the attraction of going to war.
	DeclareWarWeight float64
	// TargetWeaknessWeight is how much a soft target attracts.
	TargetWeaknessWeight float64
	// ResourceNeedWeight is how much a shortage of food or metal motivates war.
	ResourceNeedWeight float64
	// ExhaustionPeaceWeight is the attraction of making peace when tired.
	ExhaustionPeaceWeight float64
	// TreasuryPeaceWeight is the attraction of making peace when broke.
	TreasuryPeaceWeight float64
	// OfferPeaceThreshold is the exhaustion above which a side sues for peace.
	OfferPeaceThreshold float64
	// WarWearinessPerDay is how fast a war exhausts a side.
	WarWearinessPerDay float64
	// WarWearinessFromBattle is extra weariness per battle fought.
	WarWearinessFromBattle float64
	// TributeShare is the share of a defeated side's treasury demanded.
	TributeShare float64
	// VassalTributeRate is what a vassal side pays daily.
	VassalTributeRate float64
	// RaidThreshold is the relation below which a side starts raiding.
	RaidThreshold float64
	// TradePactBonusPerDay is the daily relation gain from a trade pact.
	TradePactBonusPerDay float64
	// AllyJoinThreshold is the relation at which a side will join an ally's
	// war, which is how a coalition forms.
	AllyJoinThreshold float64
	// DecideEveryDays is how often a side takes a strategic decision. Sides
	// deciding on the same day would produce a synchronised world.
	DecideEveryDays float64
	// OvermatchRatio is how much stronger a rival may be before attacking it
	// stops being considered. Without this the strongest side eats the map.
	OvermatchRatio float64
	// HostileRelationThreshold is the relation below which two sides are
	// hostile enough to go to war over.
	HostileRelationThreshold float64
	// RevengeRelationThreshold is the relation below which a war is attributed
	// to revenge rather than opportunity.
	RevengeRelationThreshold float64
	// FoodNeedWeight and MetalNeedWeight are how much a shortage motivates
	// going to war, which is ECONOMY.md section 9's first example.
	FoodNeedWeight  float64
	MetalNeedWeight float64
	// FoodNeedWarThreshold is the food shortage above which a war is attributed
	// to hunger.
	FoodNeedWarThreshold float64
	// DeclareWarThreshold is the score a side must reach to commit to a war.
	DeclareWarThreshold float64
	// PeaseDecisionThreshold is the peace score above which a side sues for
	// peace. The key name preserves the original spelling from the first draft
	// of this file; renaming it would change a balance key that existing logs
	// were run against, and CHANGELOG.md records that.
	PeaseDecisionThreshold float64
	// PeaceWearinessRelief is the fraction of war weariness that survives
	// peace, so exhaustion fades but does not vanish.
	PeaceWearinessRelief float64
	// PeaceRelationGain is how much two sides come to like each other after
	// making peace.
	PeaceRelationGain float64
	// IntensityPerBattle is how much a battle raises a war's intensity.
	IntensityPerBattle float64
	// VassalStrengthRatio is the strength advantage needed to impose vassalage
	// rather than mere peace.
	VassalStrengthRatio float64
	// VassalStrengthShare is the fraction of a vassal's strength that counts
	// against it, so a vassal is worth having without being a power.
	VassalStrengthShare float64
	// VassalChancePerPeace is the chance a badly beaten side becomes a vassal
	// at the end of a war.
	VassalChancePerPeace float64
	// InfluenceCostOfWar is what declaring a war costs the leader, so war is
	// not free politically even when it is popular.
	InfluenceCostOfWar float64
	// HostileRelationShare scales the hostility term in the war score.
	HostileRelationShare float64
	// ActRelationThreshold is the relation above which two sides are considered
	// to have formal ties.
	ActRelationThreshold float64
	// PactRelationThreshold is the relation above which the trade-pact bonus
	// accrues.
	PactRelationThreshold float64
}

// Campaign turns ruler intentions into movement. It is the seam between the
// ruler AI's decision and the march system's movement, and it also carries the
// player's and scripted profiles' orders, so a headless "dumb player" run
// exercises the same code path a real player would.
type Campaign struct {
	// BreakMorale is the morale at which a party too far from home turns back.
	// This is how chain 6's overlong march actually ends: not in a rout but in
	// a withdrawal, once the men can no longer be persuaded to go on.
	BreakMorale float64
	// BreakAfterDaysOut is how long a party must be away before the morale
	// check applies, so a party that is only briefly unhappy does not turn
	// around on the doorstep.
	BreakAfterDaysOut float64
	// MinDaysFoodToMarch is the food a party must have before setting out. The
	// supply check from MARCH_AND_WAR.md section 1, enforced where the order is
	// issued rather than trusted to the scoring.
	MinDaysFoodToMarch float64
	// MinMetalToBesiege is the metal a party needs to undertake a siege. A
	// party with none camps outside instead, which turns a siege into a
	// starvation contest rather than a breach.
	MinMetalToBesiege float64
	// RaidRangeLeagues is how far a party will ride to raid.
	RaidRangeLeagues float64
	// RaidMemoryDecayDays is how long a village remembers a raid, and so how
	// long before it is worth raiding again. Kept in step with the ruler AI's
	// constant of the same name, because no system may import another, and a
	// mismatch would show up as a party riding to an empty village.
	RaidMemoryDecayDays float64
	// AidRangeLeagues is how far a party will carry aid.
	AidRangeLeagues float64
	// AidFoodThreshold is the food buffer below which a town counts as needing
	// aid.
	AidFoodThreshold float64
	// AidLoadShare is the share of a party's own larder loaded onto an aid
	// run. Aid that were free would be sent to everyone every day, and chain 5's
	// recovery would prove nothing.
	AidLoadShare float64
	// AidMedicineShare is the same for field medicine.
	AidMedicineShare float64
	// TradeRangeLeagues is how far a trade caravan will travel.
	TradeRangeLeagues float64
	// TradeCapitalShare is the share of a party's money committed to a trade
	// run.
	TradeCapitalShare float64
	// AttackRangeLeagues is how far a party will march to attack.
	AttackRangeLeagues float64
	// TargetFoodDays is the food buffer in days at which a target is starving.
	TargetFoodDays float64
	// GarrisonAdvantage is the force ratio above which a target's garrison
	// stops being an obstacle.
	GarrisonAdvantage float64
	// TargetMinPopulationScale is the town size at which a target is worth the
	// march.
	TargetMinPopulationScale float64
	// TaxCutLoyaltyRate is the tax rate the caretaker profile drops to, buying
	// loyalty with the town rather than taking it.
	TaxCutLoyaltyRate float64
	// CaretakerMedicineStock is the medicine buffer, as a multiple of the
	// per-capita stock, the caretaker profile tries to keep.
	CaretakerMedicineStock float64
	// TraderTaxCeiling is the tax rate above which the trader profile cuts,
	// because a tax-struck town is a bad market.
	TraderTaxCeiling float64
	// TradeMinRoadSafety is the road safety below which the trader profile will
	// not send a caravan out at all.
	TradeMinRoadSafety float64
	// AidOrderShare is the share of a party's larder loaded when a player order
	// rather than the AI decides the aid run.
	AidOrderShare float64
	// MedicineUnitPrice is what one dose of medicine costs at a price of one.
	// The actual cost is this times the town's medicine price, so scarcity is
	// priced rather than merely counted.
	MedicineUnitPrice float64
	// FortifyMetalPerLevel is the metal one level of fortification costs.
	FortifyMetalPerLevel float64
	// FortifyMoraleBonus is the morale a town gains from being fortified, which
	// is small and real: walls make a garrison feel safer.
	FortifyMoraleBonus float64
}

// Cause configures the cause log itself.
type Cause struct {
	// MinAbsolute is the smallest absolute change that produces a log row. A
	// row per float operation would be useless, but a chain cannot be
	// explained if a change goes unlogged, so the threshold is small and every
	// threshold crossing is a real event.
	MinAbsolute float64
	// MinRelative is the smallest relative change that produces a row, for
	// large-magnitude fields.
	MinRelative float64
	// MaxChainLinks bounds how deep a why-query walks, to keep the query
	// terminating and the output readable.
	MaxChainLinks float64
	// MinChainLinks is the depth that counts as a full explanatory chain, which
	// PHASES.md Phase 1 sets at five.
	MinChainLinks float64
}

// Audit configures the chain assertions and balance reporting.
type Audit struct {
	// ChainMinFraction is the share of seeds in which a chain must appear to
	// count as emergent, per TESTING_AND_BALANCE.md section 2.
	ChainMinFraction float64
	// DominanceMaxFraction is the highest share of seeds one side may win
	// before a side is called dominant.
	DominanceMaxFraction float64
	// SampleEventsPerRun is how many cause rows to keep per run for review.
	SampleEventsPerRun float64
	// SideSurvivalThreshold is the share of a side's starting towns it must
	// still hold to count as having survived. Measured against its own start,
	// because the six sections start with very different amounts.
	SideSurvivalThreshold float64
	// SideCollapseThreshold is the share below which a side counts as
	// collapsed. The gap between the two is the band of "held, at a cost",
	// which is where a side that fought hard but did not win should land.
	SideCollapseThreshold float64
	// LogRowLimit bounds how many cause rows one run retains, so a multi-year
	// run does not exhaust memory. A run that hits the limit reports how many
	// rows it dropped rather than silently truncating.
	LogRowLimit float64
}

// Load reads and validates a balance file.
func Load(path string) (*Config, error) {
	f, err := parseFile(path)
	if err != nil {
		return nil, err
	}
	l := &loader{path: path, f: f, seen: map[string]bool{}}
	c := &Config{}
	l.load(c)
	if len(l.missing) > 0 {
		sortStrings(l.missing)
		return nil, &MissingError{File: path, Keys: l.missing}
	}
	if err := l.finish(); err != nil {
		return nil, err
	}
	if err := c.validate(path); err != nil {
		return nil, err
	}
	return c, nil
}

// Election controls presidential elections and succession, per the
// modern-America port: every faction elects a president on a fixed cycle,
// with a VP-led line of succession if the president dies in office.
// TermYears is the election cycle length, matching the real 4-year cycle.
// MaxTerms caps re-election at two terms, like the 22nd Amendment.
// AssassinationBaseRate is the daily probability the sitting president is
// assassinated while in the capital. Presidents rarely leave DC; when they
// do, TravelRiskMultiplier scales the risk up.
// UnrestRiskScale adds daily risk scaled by (1 - stability), so unstable
// factions are more dangerous for their leaders.
type Election struct {
	TermYears            float64
	MaxTerms             float64
	AssassinationBaseRate float64
	TravelRiskMultiplier float64
	UnrestRiskScale      float64
}

// LoadDefault reads the balance file that ships with the simulation.
func LoadDefault() (*Config, error) {	abs, err := filepath.Abs(filepath.Join("config", "balance.toml"))
	if err != nil {
		return nil, err
	}
	return Load(abs)
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
