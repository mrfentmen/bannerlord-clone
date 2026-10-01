package config

import "fmt"

// validate rejects constants that are individually present but nonsensical.
// A balance file with a negative death rate is a data error, and CONSTITUTION.md
// section 1.3 says errors are handled rather than discovered three years later
// as strange logs.
func (c *Config) validate(path string) error {
	type bound struct {
		name  string
		value float64
		lo    float64
		hi    float64
	}
	bounds := []bound{
		{"food.person_days_per_person_day", c.Food.PersonDaysPerPersonDay, 0.1, 10},
		{"food.base_yield_per_worker", c.Food.BaseYieldPerWorker, 0.001, 100},
		{"food.trade_out_rate", c.Food.TradeOutRate, 0, 1},
		{"food.trade_in_rate", c.Food.TradeInRate, 0, 1},
		{"starvation.grace_days", c.Starve.GraceDays, 1, 60},
		{"starvation.severity_at_death", c.Starve.SeverityAtDeath, 1, 60},
		{"disease.base_contact_rate", c.Disease.BaseContactRate, 0, 1},
		{"disease.recovery_rate", c.Disease.RecoveryRate, 0, 1},
		{"labor.healthy_worker_share", c.Labor.HealthyWorkerShare, 0.01, 1},
		{"labor.max_worker_share", c.Labor.MaxWorkerShare, 0.01, 1},
		{"market.price_elasticity", c.Market.PriceElasticity, 0, 20},
		{"market.price_floor", c.Market.PriceFloor, 0.001, 100},
		{"market.price_cap", c.Market.PriceCap, 1, 10000},
		{"market.price_inertia", c.Market.PriceInertia, 0, 1},
		{"market.base_price", c.Market.BasePrice, 0.001, 1000},
		{"market.stock_target_days", c.Market.StockTargetDays, 0, 365},
		{"currency.tax_max_rate", c.Currency.TaxMaxRate, 0, 1},
		{"currency.tax_default_rate", c.Currency.TaxDefaultRate, 0, 1},
		{"currency.interest_rate", c.Currency.InterestRate, 0, 0.5},
		{"unrest.unrest_cap", c.Unrest.UnrestCap, 0.1, 1},
		{"unrest.decay", c.Unrest.Decay, 0, 1},
		{"loyalty.loyalty_cap", c.Unrest.UnrestCap, 0.1, 1},
		{"loyalty.recover_rate", c.Loyalty.RecoverRate, 0, 1},
		{"council.vote_threshold", c.Council.VoteThreshold, 0, 1},
		{"council.days_below_threshold", c.Council.DaysBelowThreshold, 1, 365},
		{"election.term_years", c.Election.TermYears, 2, 8},
		{"election.max_terms", c.Election.MaxTerms, 1, 4},
		{"election.assassination_base_rate", c.Election.AssassinationBaseRate, 0, 0.001},
		{"election.travel_risk_multiplier", c.Election.TravelRiskMultiplier, 1, 50},
		{"election.unrest_risk_scale", c.Election.UnrestRiskScale, 0, 0.01},
		{"migration.flee_threshold", c.Migrate.FleeThreshold, 0, 1},
		{"migration.max_flee_share", c.Migrate.MaxFleeShare, 0, 1},
		{"migration.crowding_base", c.Migrate.CrowdingBase, 0, 1},
		{"migration.crowding_cap", c.Migrate.CrowdingCap, 0.01, 10},
		{"security.base_road_safety", c.Security.BaseRoadSafety, 0, 1},
		{"logistics.speed_per_day", c.Logistic.SpeedPerDay, 0.01, 1000},
		{"march.speed_per_day", c.March.SpeedPerDay, 0.01, 1000},
		{"march.size_reference", c.March.SizeReference, 1, 1000000},
		{"siege.max_days", c.Siege.MaxDays, 1, 3650},
		{"siege.gate_open_food_days", c.Siege.GateOpenFoodDays, 0, 365},
		{"cause.min_absolute", c.Cause.MinAbsolute, 0, 100},
		{"cause.min_relative", c.Cause.MinRelative, 0, 1},
		{"cause.max_chain_links", c.Cause.MaxChainLinks, 1, 1000},
		{"cause.min_chain_links", c.Cause.MinChainLinks, 1, 100},
		{"audit.chain_min_fraction", c.Audit.ChainMinFraction, 0, 1},
		{"audit.dominance_max_fraction", c.Audit.DominanceMaxFraction, 0, 1},
		{"world.years", c.World.Years, 0.1, 100},
		{"world.min_towns", c.World.MinTowns, 1, 100000},
		{"world.max_towns", c.World.MaxTowns, 1, 100000},
		{"world.min_rulers", c.World.MinRulers, 1, 100000},
		{"world.max_rulers", c.World.MaxRulers, 1, 100000},
	}

	for _, b := range bounds {
		if b.value < b.lo || b.value > b.hi {
			return fmt.Errorf("config: %s: %s = %g is outside its valid range [%g, %g]",
				path, b.name, b.value, b.lo, b.hi)
		}
	}
	if c.World.MinTowns > c.World.MaxTowns {
		return fmt.Errorf("config: %s: world.min_towns (%g) exceeds world.max_towns (%g)",
			path, c.World.MinTowns, c.World.MaxTowns)
	}
	if c.World.MinRulers > c.World.MaxRulers {
		return fmt.Errorf("config: %s: world.min_rulers (%g) exceeds world.max_rulers (%g)",
			path, c.World.MinRulers, c.World.MaxRulers)
	}
	if c.Labor.MinWorkerShare > c.Labor.MaxWorkerShare {
		return fmt.Errorf("config: %s: labor.min_worker_share exceeds labor.max_worker_share", path)
	}
	if c.Market.PriceFloor >= c.Market.PriceCap {
		return fmt.Errorf("config: %s: market.price_floor must be below market.price_cap", path)
	}
	if c.Food.FarmlandMin > c.Food.FarmlandMax {
		return fmt.Errorf("config: %s: food.farmland_min exceeds food.farmland_max", path)
	}
	if c.Migrate.CrowdingBase > c.Migrate.CrowdingCap {
		return fmt.Errorf("config: %s: migration.crowding_base exceeds migration.crowding_cap", path)
	}
	if c.Cause.MinChainLinks > c.Cause.MaxChainLinks {
		return fmt.Errorf("config: %s: cause.min_chain_links exceeds cause.max_chain_links", path)
	}
	return nil
}
