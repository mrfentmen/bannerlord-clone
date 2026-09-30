package config

import (
	"fmt"
	"math"
)

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
		// --- battle ---
		// The size bound is checked here so a balance file that would make the
		// battle engine refuse to start fails at load, not mid-fight.
		{"battle.max_units_per_side", c.Battle.MaxUnitsPerSide, 1, 1000000},
		{"battle.tick_seconds", c.Battle.TickSeconds, 0.001, 100},
		{"battle.max_ticks", c.Battle.MaxTicks, 1, 10000000},
		{"battle.grid_cell_size", c.Battle.GridCellSize, 0.1, 10000},
		{"battle.ranged_grid_cell_size", c.Battle.RangedGridCellSize, 0.1, 100000},
		{"battle.roster_hp_base", c.Battle.RosterHPBase, 0.001, 100000},
		{"battle.roster_speed_base", c.Battle.RosterSpeedBase, 0.001, 1000},
		{"battle.roster_ranged_share", c.Battle.RosterRangedShare, 0, 1},
		{"battle.roster_morale_start", c.Battle.RosterMoraleStart, 0, 1},
		{"battle.roster_troops_per_unit", c.Battle.RosterTroopsPerUnit, 0.001, 100000},
		{"battle.melee_range", c.Battle.MeleeRange, 0.01, 1000},
		{"battle.melee_swing_seconds", c.Battle.MeleeSwingSeconds, 0.001, 1000},
		{"battle.ranged_range", c.Battle.RangedRange, 0, 100000},
		{"battle.ranged_fire_interval", c.Battle.RangedFireInterval, 0.001, 1000},
		{"battle.suppression_cap", c.Battle.SuppressionCap, 0.001, 100},
		{"battle.morale_break_threshold", c.Battle.MoraleBreakThreshold, 0, 1},
		{"battle.morale_rout_threshold", c.Battle.MoraleRoutThreshold, 0, 1},
		{"battle.morale_ratio_neutral", c.Battle.MoraleRatioNeutral, 0.001, 0.999},
		{"battle.rally_chance", c.Battle.RallyChance, 0, 1},
		{"battle.rally_routed_chance", c.Battle.RallyRoutedChance, 0, 1},
		{"battle.melee_max_targets", c.Battle.MeleeMaxTargets, 0, 1000},
		{"battle.max_attackers_per_target", c.Battle.MaxAttackersPerTarget, 0, 100000},
		{"battle.ranged_max_targets", c.Battle.RangedMaxTargets, 0, 1000},
		{"battle.fatal_hp_fraction", c.Battle.FatalHPFraction, 0, 1},
		{"battle.dead_share", c.Battle.DeadShare, 0, 1},
		{"battle.surrender_strength_fraction", c.Battle.SurrenderStrengthFraction, 0, 1},
		{"battle.rout_strength_fraction", c.Battle.RoutStrengthFraction, 0, 1},
		{"battle.surrender_chance", c.Battle.SurrenderChance, 0, 1},
		// --- formation ---
		// The bounds are the ones the [formation] section's own comments in
		// balance.toml state, copied rather than re-derived, so the file and
		// this table cannot disagree about what a designer may type.
		{"formation.front_spacing", c.Formation.FrontSpacing, 0.3, 10},
		{"formation.rank_spacing", c.Formation.RankSpacing, 0.3, 50},
		{"formation.line_front_width", c.Formation.LineFrontWidth, 1, 60},
		{"formation.column_front_width", c.Formation.ColumnFrontWidth, 1, 30},
		{"formation.wedge_tip_units", c.Formation.WedgeTipUnits, 1, 9},
		{"formation.wedge_row_growth", c.Formation.WedgeRowGrowth, 1, 12},
		{"formation.loose_spacing", c.Formation.LooseSpacing, 1, 60},
		{"formation.loose_jitter_fraction", c.Formation.LooseJitterFraction, 0, 0.45},
		{"formation.min_separation", c.Formation.MinSeparation, 0.1, 20},
		{"formation.separation_iterations", c.Formation.SeparationIterations, 0, 8},
		{"formation.separation_push_fraction", c.Formation.SeparationPushFraction, 0, 0.5},
		{"formation.separation_push_max", c.Formation.SeparationPushMax, 0.01, 5},
		{"formation.hold_speed", c.Formation.HoldSpeed, 0.05, 8},
		{"formation.advance_speed", c.Formation.AdvanceSpeed, 0.05, 8},
		{"formation.charge_speed", c.Formation.ChargeSpeed, 0.05, 12},
		{"formation.flank_speed", c.Formation.FlankSpeed, 0.05, 10},
		{"formation.retreat_speed", c.Formation.RetreatSpeed, 0.05, 10},
		{"formation.turn_rate", c.Formation.TurnRate, 0.05, 12},
		{"formation.face_turn_rate_scale", c.Formation.FaceTurnRateScale, 0.05, 6},
		{"formation.face_enemy_weight", c.Formation.FaceEnemyWeight, 0, 1},
		{"formation.advance_standoff", c.Formation.AdvanceStandoff, 0, 2000},
		{"formation.charge_standoff", c.Formation.ChargeStandoff, 0, 500},
		{"formation.retreat_distance", c.Formation.RetreatDistance, 0, 5000},
		{"formation.flank_standoff", c.Formation.FlankStandoff, 0, 2000},
		{"formation.flank_sweep_deg", c.Formation.FlankSweepDeg, 1, 180},
		{"formation.flank_sweep_rate_deg", c.Formation.FlankSweepRateDeg, 0.1, 90},
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
	if err := validateBattleRelations(path, &c.Battle); err != nil {
		return err
	}
	if err := validateFormationRelations(path, &c.Formation); err != nil {
		return err
	}
	return nil
}

// validateBattleRelations checks the battle constants that are only wrong in
// combination with each other. A spatial hash cell narrower than a melee swing
// would make every melee query scan cells it could have stepped over, and a
// rout threshold above the break threshold would mean units route before they
// break, which is the wrong order and would make the morale report lie.
func validateBattleRelations(path string, b *Battle) error {
	if b.GridCellSize < b.MeleeRange {
		return fmt.Errorf("config: %s: battle.grid_cell_size (%g) is below battle.melee_range (%g); "+
			"a melee query would scan cells it could step over",
			path, b.GridCellSize, b.MeleeRange)
	}
	if b.MoraleRoutThreshold >= b.MoraleBreakThreshold {
		return fmt.Errorf("config: %s: battle.morale_rout_threshold (%g) is not below "+
			"battle.morale_break_threshold (%g); units must break before they run",
			path, b.MoraleRoutThreshold, b.MoraleBreakThreshold)
	}
	if b.MoraleFloor > b.MoraleRoutThreshold {
		return fmt.Errorf("config: %s: battle.morale_floor (%g) is above battle.morale_rout_threshold (%g); "+
			"a unit could never rout",
			path, b.MoraleFloor, b.MoraleRoutThreshold)
	}
	if b.RangedMinRange >= b.RangedRange {
		return fmt.Errorf("config: %s: battle.ranged_min_range (%g) is not below battle.ranged_range (%g); "+
			"a ranged unit could never fire",
			path, b.RangedMinRange, b.RangedRange)
	}
	if b.MaxTicks < 1 {
		return fmt.Errorf("config: %s: battle.max_ticks must be at least 1", path)
	}
	return nil
}

// validateFormationRelations checks the formation constants that are only
// wrong in combination with each other, and the one that has no range at all.
//
// Two of them. First, min_separation is the gap the spacing pass defends, so a
// value wider than the tightest gap any shape produces means the pass would
// spend every tick shoving men off the slot they are trying to reach and the
// formation would never form up. The tightest gap is the smaller of the abreast
// spacing and the rank spacing, or in loose order the lattice spacing less the
// scatter from both sides.
//
// Second, loose_seed has no range because any integer is a legal seed and
// clamping one would be inventing a rule. It is still checked for being a
// finite number, because a non-finite seed converted to an integer is a
// nonsense scatter rather than a different scatter.
func validateFormationRelations(path string, f *Formation) error {
	tightest := math.Min(f.FrontSpacing, f.RankSpacing)
	tightest = math.Min(tightest, f.LooseSpacing*(1-2*f.LooseJitterFraction))
	if f.MinSeparation > tightest {
		return fmt.Errorf("config: %s: formation.min_separation (%g) is wider than the tightest gap any shape produces (%g); "+
			"the spacing pass would fight the shape itself",
			path, f.MinSeparation, tightest)
	}
	if math.IsNaN(f.LooseSeed) || math.IsInf(f.LooseSeed, 0) {
		return fmt.Errorf("config: %s: formation.loose_seed is %v, which is not a finite number", path, f.LooseSeed)
	}
	return nil
}
