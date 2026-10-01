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
		{"template.min_troops_for_template", c.Template.MinTroopsForTemplate, 1, 100000},
		{"template.refit_days", c.Template.RefitDays, 0, 365},
		{"template.refit_metal_per_troop", c.Template.RefitMetalPerTroop, 0, 1000},
		{"template.refit_morale_hit", c.Template.RefitMoraleHit, 0, 1},
		{"template.refit_metal_per_day", c.Template.RefitMetalPerDay, 0, 10000},
		{"template.fit_switch_threshold", c.Template.FitSwitchThreshold, 0, 1},
		{"template.fit_relax_per_day", c.Template.FitRelaxPerDay, 0, 1},
		{"formation.split_min_troops", c.Formation.SplitMinTroops, 1, 100000},
		{"formation.split_min_parent_troops", c.Formation.SplitMinParentTroops, 1, 100000},
		{"formation.split_max_share", c.Formation.SplitMaxShare, 0.01, 1},
		{"formation.split_food_days_per_troop", c.Formation.SplitFoodSharePerTroop, 0, 100},
		{"formation.split_morale_hit", c.Formation.SplitMoraleHit, 0, 1},
		{"formation.merge_max_range_leagues", c.Formation.MergeMaxRangeLeagues, 0.1, 10000},
		{"formation.merge_min_troops", c.Formation.MergeMinTroops, 1, 100000},
		{"formation.merge_min_parent_share", c.Formation.MergeMinParentTroops, 0.01, 1},
		{"formation.merge_morale_hit", c.Formation.MergeMoraleHit, 0, 1},
		{"formation.auto_merge_chance", c.Formation.AutoMergeChance, 0, 1},
		{"formation.auto_merge_troops", c.Formation.AutoMergeTroops, 0, 100000},
	}
	// A template whose shares are all zero describes a party with no troops,
	// and a party with no troops cannot march or fight, so a run would be
	// meaningless rather than merely unbalanced. The same applies to a culture
	// row: it is what unaffiliated parties read, so an empty one would blank
	// every raider band on the map.
	for ti := range c.Template.TemplateShare {
		if rowSum(c.Template.TemplateShare[ti][:]) <= 0 {
			return fmt.Errorf("config: %s: template.share_%s_* are all zero: template %d has no composition",
				path, templateLabels[ti], ti)
		}
	}
	for ci := range c.Template.CultureShare {
		if rowSum(c.Template.CultureShare[ci][:]) <= 0 {
			return fmt.Errorf("config: %s: template.culture_%d_* are all zero: culture %d has no composition",
				path, ci, ci)
		}
	}
	for mi := range c.Template.MissionFit {
		best, bestV := -1, 0.0
		for pi, v := range c.Template.MissionFit[mi] {
			if v > bestV {
				best, bestV = pi, v
			}
		}
		if best < 0 {
			return fmt.Errorf("config: %s: template.mission_fit_%s_* are all zero: mission %d has no good template",
				path, missionLabels[mi], mi)
		}
	}
	for ti := range c.Template.TerrainFit {
		best, bestV := -1, 0.0
		for pi, v := range c.Template.TerrainFit[ti] {
			if v > bestV {
				best, bestV = pi, v
			}
		}
		if best < 0 {
			return fmt.Errorf("config: %s: template.terrain_fit_%s_* are all zero: terrain %d has no good template",
				path, terrainLabels[ti], ti)
		}
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

// rowSum totals a table row. Used by the template validation, which needs to
// know whether a composition is empty rather than merely lopsided.
func rowSum(row []float64) float64 {
	t := 0.0
	for _, v := range row {
		t += v
	}
	return t
}
