package config

import (
	"fmt"
	"math"
	"strings"
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
		{"election.term_years", c.Election.TermYears, 2, 8},
		{"election.max_terms", c.Election.MaxTerms, 1, 4},
		{"election.assassination_base_rate", c.Election.AssassinationBaseRate, 0, 0.001},
		{"election.travel_risk_multiplier", c.Election.TravelRiskMultiplier, 1, 50},
		{"election.unrest_risk_scale", c.Election.UnrestRiskScale, 0, 0.01},
		{"construction.max_level", c.Construction.MaxLevel, 1, 5},
		{"construction.days_per_cost", c.Construction.DaysPerCost, 0.0001, 1},
		{"construction.auto_build_reserve", c.Construction.AutoBuildReserve, 0, 1000000},
		{"construction.community_loyalty_per_level", c.Construction.CommunityLoyaltyPerLevel, 0, 0.1},
		{"construction.infra_prosperity_per_level", c.Construction.InfraProsperityPerLevel, 0, 0.1},
		{"construction.farms_food_per_level", c.Construction.FarmsFoodPerLevel, 0, 1000},
		{"construction.watch_militia_per_level", c.Construction.WatchMilitiaPerLevel, 0, 100},
		{"construction.commercial_tax_per_level", c.Construction.CommercialTaxPerLevel, 0, 1},
		{"construction.civic_influence_per_level", c.Construction.CivicInfluencePerLevel, 0, 100},
		{"construction.training_morale_per_level", c.Construction.TrainingMoralePerLevel, 0, 1},
		{"construction.warehouse_food_cap_per_level", c.Construction.WarehouseFoodCapPerLevel, 0, 100000},
		{"construction.warehouse_base_cap", c.Construction.WarehouseBaseCap, 0, 1000000},
		{"construction.garrison_base_cap", c.Construction.GarrisonBaseCap, 0, 100000},
		{"taxation.state_tax_max_rate", c.Taxation.StateTaxMaxRate, 0, 0.5},
		{"taxation.state_tax_default", c.Taxation.StateTaxDefault, 0, 0.5},
		{"siege.wall_level_slowdown", c.Siege.WallLevelSlowdown, 0, 2},
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
		// The cell budget's floor is 4, not 1, and the reason is in grid.go: the
		// index adds a one cell margin on each axis, so the smallest grid it can
		// build is 2x2, and a budget it can never satisfy leaves the coarsening
		// loop with nowhere to stop. Its ceiling is memory: 4000000 cells is
		// 16 MiB of counts per index, there are two of them, and they are cleared
		// every tick.
		{"battle.grid_max_cells", c.Battle.GridMaxCells, 4, 4000000},
		// A report that keeps no events reports a battle that did nothing, and a
		// battle can produce tens of thousands of events in a long one, so the
		// ceiling is high; the real bound is memory.
		{"battle.max_report_events", c.Battle.MaxReportEvents, 1, 1000000},
		{"battle.reference_units_per_side", c.Battle.ReferenceUnitsPerSide, 1, 1000000},
		{"battle.roster_hp_base", c.Battle.RosterHPBase, 0.001, 100000},
		{"battle.roster_speed_base", c.Battle.RosterSpeedBase, 0.001, 1000},
		{"battle.roster_ranged_share", c.Battle.RosterRangedShare, 0, 1},
		{"battle.roster_morale_bias_scale", c.Battle.RosterMoraleBiasScale, 0, 1},
		{"battle.roster_morale_start", c.Battle.RosterMoraleStart, 0, 1},
		{"battle.roster_troops_per_unit", c.Battle.RosterTroopsPerUnit, 0.001, 100000},
		{"battle.roster_leaders_per_unit", c.Battle.RosterLeadersPerUnit, 1, 100000},
		{"battle.roster_leader_spread", c.Battle.RosterLeaderSpread, 0.01, 10000},
		// The layout shape of a force of any size. The floor is above zero
		// because a force laid out with no width at all is a column one unit
		// deep, which every other size assumption in the engine then has to
		// make a special case for.
		{"battle.roster_front_aspect", c.Battle.RosterFrontAspect, 0.1, 50},
		{"battle.roster_leader_depth_fraction", c.Battle.RosterLeaderDepthFraction, 0, 1},
		{"battle.roster_leader_jitter_fraction", c.Battle.RosterLeaderJitterFraction, 0, 2},
		{"battle.roster_leader_influence_floor", c.Battle.RosterLeaderInfluenceFloor, 0, 1},
		{"battle.roster_leader_influence_spread", c.Battle.RosterLeaderInfluenceSpread, 0, 1},
		{"battle.melee_range", c.Battle.MeleeRange, 0.01, 1000},
		{"battle.melee_swing_seconds", c.Battle.MeleeSwingSeconds, 0.001, 1000},
		{"battle.melee_ranged_skill_scale", c.Battle.MeleeRangedSkillScale, 0, 1},
		{"battle.ranged_range", c.Battle.RangedRange, 0, 100000},
		{"battle.ranged_fire_interval", c.Battle.RangedFireInterval, 0.001, 1000},
		// The whole skill term of the shooting model, in three numbers. They
		// are bounded as shares because each one is a share of a chance:
		// base is the chance at no skill, weight is the share of a point of
		// skill, and floor is what a shooter with no effectiveness keeps.
		{"battle.ranged_hit_chance_base", c.Battle.RangedHitChanceBase, 0, 1},
		{"battle.ranged_hit_chance_skill_weight", c.Battle.RangedHitChanceSkillWeight, 0, 1},
		{"battle.ranged_hit_effectiveness_floor", c.Battle.RangedHitEffectivenessFloor, 0, 1},
		{"battle.suppression_cap", c.Battle.SuppressionCap, 0.001, 100},
		{"battle.morale_break_threshold", c.Battle.MoraleBreakThreshold, 0, 1},
		{"battle.morale_rout_threshold", c.Battle.MoraleRoutThreshold, 0, 1},
		{"battle.morale_ratio_neutral", c.Battle.MoraleRatioNeutral, 0.001, 0.999},
		{"battle.morale_ratio_deadband", c.Battle.MoraleRatioDeadband, 0, 0.499},
		{"battle.morale_panic_floor", c.Battle.MoralePanicFloor, 0, 1},
		{"battle.morale_recovery_suppression_band", c.Battle.MoraleRecoverySuppressionBand, 0, 1},
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
		// What each shape does in contact. The bounds are the ones the same
		// block's comments in balance.toml state, for the same reason as the
		// bounds above: the file and this table must not be able to disagree
		// about what a designer may type.
		//
		// Two of them are worth a second look because they are the two that
		// could make a shape pointless rather than illegal. A wedge flank arc
		// of 360 is a wedge that cannot be caught from the side, and a
		// skirmish suppression scale of 1 is a skirmish line that breaks
		// exactly as a line does. Neither is a syntax error and both are a
		// shape that does not do what its name says, so they are bounded
		// where a shape can still be worth choosing.
		{"formation.wedge_charge_damage_bonus", c.Formation.WedgeChargeDamageBonus, 0, 3},
		{"formation.wedge_flank_taken_scale", c.Formation.WedgeFlankTakenScale, 0, 3},
		{"formation.wedge_flank_arc_deg", c.Formation.WedgeFlankArcDeg, 30, 359},
		{"formation.square_fast_mover_speed", c.Formation.SquareFastMoverSpeed, 0.1, 25},
		{"formation.square_fast_mover_taken_scale", c.Formation.SquareFastMoverTakenScale, 0, 1},
		{"formation.square_move_speed_scale", c.Formation.SquareMoveSpeedScale, 0.05, 1},
		{"formation.skirmish_suppression_taken_scale", c.Formation.SkirmishSuppressionTakenScale, 0, 0.99},
		{"formation.skirmish_melee_taken_scale", c.Formation.SkirmishMeleeTakenScale, 0.5, 3},
		// --- command ---
		// The bounds are the ones the [command] section's own comments in
		// balance.toml state, copied rather than re-derived, for the same reason
		// the [formation] bounds above are: the file and this table must not be
		// able to disagree about what a designer may type.
		{"command.formations_per_side", c.Command.FormationsPerSide, 2, 12},
		{"command.reserve_share", c.Command.ReserveShare, 0, 0.5},
		{"command.advance_trigger_range", c.Command.AdvanceTriggerRange, 1, 5000},
		{"command.charge_range", c.Command.ChargeRange, 0, 2000},
		{"command.charge_strength_ratio", c.Command.ChargeStrengthRatio, 1, 20},
		{"command.flank_trigger_range", c.Command.FlankTriggerRange, 0, 5000},
		{"command.flank_min_strength_fraction", c.Command.FlankMinStrengthFraction, 0, 1},
		{"command.reserve_commit_strength_fraction", c.Command.ReserveCommitStrengthFraction, 0, 1},
		{"command.withdraw_morale", c.Command.WithdrawMorale, 0, 1},
		{"command.withdraw_broken_share", c.Command.WithdrawBrokenShare, 0, 1},
		{"command.decision_interval_ticks", c.Command.DecisionIntervalTicks, 1, 1000},
		{"command.order_min_ticks", c.Command.OrderMinTicks, 1, 10000},
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
	if err := validateCommandRelations(path, &c.Command, &c.Battle); err != nil {
		return err
	}
	return nil
}

// validateBattleRelations checks the battle constants that are only wrong in
// combination with each other. A spatial hash cell narrower than a melee swing
// would make every melee query scan cells it could have stepped over, and a
// rout threshold above the break threshold would mean units route before they
// break, which is the wrong order and would make the morale report lie.
//
// The size relations are here too, and they are the ones that make the size
// knob honest: a reference run above the limit it exercises, a count that is not
// a whole count, and a pair of shares that add past one each produce a file
// whose numbers are individually legal and jointly a battle that cannot be run
// or a model that cannot be tuned.
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
	// Panic pulls a man's morale down toward the floor, and the floor has to sit
	// strictly below the rout threshold or a contagion could never tip anybody
	// over it: the pull would approach the threshold asymptotically and stop
	// there, so routed troops would stop spreading panic the moment the first
	// one ran. The check is >= and not > for that reason, and a floor set to
	// exactly the threshold is the easy mistake, because it looks deliberate.
	if b.MoralePanicFloor >= b.MoraleRoutThreshold {
		return fmt.Errorf("config: %s: battle.morale_panic_floor (%g) is at or above "+
			"battle.morale_rout_threshold (%g); panic pulls toward the floor and a floor at or above "+
			"the threshold can never take a unit below it, so a rout could not spread",
			path, b.MoralePanicFloor, b.MoraleRoutThreshold)
	}
	// The deadband is the share of the ratio either side of neutral that costs
	// nothing. It has to leave the term able to bite at all: the local ratio
	// runs from 0 (nothing of my own side in sight) to 1 (nothing of the enemy),
	// so a deadband as wide as the nearer of those two distances would mean no
	// local imbalance could ever cost morale and a flanked wing would stand
	// there happily outnumbered three to one.
	if reach := math.Min(b.MoraleRatioNeutral, 1-b.MoraleRatioNeutral); b.MoraleRatioDeadband >= reach {
		return fmt.Errorf("config: %s: battle.morale_ratio_deadband (%g) is not below the distance from "+
			"battle.morale_ratio_neutral (%g) to the nearest extreme (%g); a deadband that wide means no "+
			"local imbalance can cost any morale, so a flank could never fold",
			path, b.MoraleRatioDeadband, b.MoraleRatioNeutral, reach)
	}
	if b.RangedMinRange >= b.RangedRange {
		return fmt.Errorf("config: %s: battle.ranged_min_range (%g) is not below battle.ranged_range (%g); "+
			"a ranged unit could never fire",
			path, b.RangedMinRange, b.RangedRange)
	}
	if b.MaxTicks < 1 {
		return fmt.Errorf("config: %s: battle.max_ticks must be at least 1", path)
	}
	// The skill term of the shooting model must be a chance at both ends of
	// the skill scale. A base plus a weight over one is a shooter who cannot
	// miss at full skill, which is not a difficulty setting.
	if b.RangedHitChanceBase+b.RangedHitChanceSkillWeight > 1 {
		return fmt.Errorf("config: %s: battle.ranged_hit_chance_base (%g) plus "+
			"battle.ranged_hit_chance_skill_weight (%g) is over 1; a perfect shooter would hit "+
			"every shot, so skill would be the only thing that mattered and it could not be tuned",
			path, b.RangedHitChanceBase, b.RangedHitChanceSkillWeight)
	}
	// Morale recovery is gated on suppression being below this band, so a
	// band at or above the cap lets a pinned unit recover and the suppression
	// term stops being able to keep anyone down.
	if b.MoraleRecoverySuppressionBand >= 1 {
		return fmt.Errorf("config: %s: battle.morale_recovery_suppression_band (%g) is 1 or more; "+
			"a unit at full suppression counts as out of contact, so suppression could never keep "+
			"morale from recovering",
			path, b.MoraleRecoverySuppressionBand)
	}
	// The next four are whole-number checks rather than range checks, and they
	// exist because each of these values is converted to an int somewhere and a
	// fractional one becomes a silent truncation: 999.9 cells becomes 999, and
	// 250.5 men per commander becomes 250, and the file that asked for the
	// fraction would report having asked for it.
	for _, n := range []struct {
		name  string
		value float64
	}{
		{"battle.max_units_per_side", b.MaxUnitsPerSide},
		{"battle.grid_max_cells", b.GridMaxCells},
		{"battle.max_report_events", b.MaxReportEvents},
		{"battle.reference_units_per_side", b.ReferenceUnitsPerSide},
		{"battle.roster_leaders_per_unit", b.RosterLeadersPerUnit},
	} {
		if n.value != math.Trunc(n.value) {
			return fmt.Errorf("config: %s: %s (%g) is not a whole number; it counts units, cells, "+
				"or events and a fraction of one is truncated to a different number than the one written",
				path, n.name, n.value)
		}
	}
	// A reference run larger than the limit it is meant to exercise would be
	// refused by the engine, so the size knob would be provable only in the
	// direction that always fails.
	if b.ReferenceUnitsPerSide > b.MaxUnitsPerSide {
		return fmt.Errorf("config: %s: battle.reference_units_per_side (%g) is above "+
			"battle.max_units_per_side (%g); the reference run would be refused by the limit it exists to "+
			"test. Lower the reference size or raise the limit",
			path, b.ReferenceUnitsPerSide, b.MaxUnitsPerSide)
	}
	// The tick bound and the tick length multiply into the longest battle the
	// engine will simulate. There is no value of that product past a few weeks
	// of simulated fighting that is a design, only a typo of one factor, and
	// 2592000 seconds is thirty days: longer than that and the field is not
	// fighting, it is waiting, and a run that reaches it costs real wall clock
	// to discover that.
	if sim := b.TickSeconds * b.MaxTicks; sim > 30*24*3600 {
		return fmt.Errorf("config: %s: battle.tick_seconds (%g) times battle.max_ticks (%g) is %g seconds "+
			"of simulated battle, over the 30 day ceiling; one of the two is a typo",
			path, b.TickSeconds, b.MaxTicks, sim)
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

// validateCommandRelations checks the tactics thresholds that are only wrong in
// combination with each other, or with another section.
//
// Three of them. First, a charge is decided against the enemy inside
// charge_range, so charge_range below advance_trigger_range means the enemy is
// not yet within reach of a charge at the range where the line stops closing, and
// the charge rule is a dead constant. Second, a flank is a move the front has
// already fixed, and the front fixes the enemy by halting on
// advance_trigger_range, so flank_trigger_range below that would send the wing
// round the side while the line is still walking toward a battle. Third, a
// commander who is holding reserves is not one who is sending every formation
// round the enemy's side at once, so flank_min_strength_fraction must not be
// above reserve_commit_strength_fraction. Fourth, a withdrawal ordered after the
// men have already broken is not a withdrawal: it is the engine's own rule
// arriving late, and the constant that sets it would be unreachable as tactics,
// so withdraw_morale must not be above the engine's battle.morale_break_threshold.
//
// The three shapes are checked for emptiness here and resolved by name in
// internal/command, through formation.ParseFormation, which is the only place
// that knows which shapes exist. Checking a spelling here would be a second list
// to keep in step with the first, and a second list is how a file ends up legal
// in one place and refused in the other.
func validateCommandRelations(path string, c *Command, b *Battle) error {
	if c.ChargeRange < c.AdvanceTriggerRange {
		return fmt.Errorf("config: %s: command.charge_range (%g) is below command.advance_trigger_range (%g); "+
			"the enemy is not within reach of a charge where the line stops closing, so the charge is a dead rule",
			path, c.ChargeRange, c.AdvanceTriggerRange)
	}
	if c.FlankTriggerRange < c.AdvanceTriggerRange {
		return fmt.Errorf("config: %s: command.flank_trigger_range (%g) is below command.advance_trigger_range (%g); "+
			"a flank is a move the front has already fixed, and the front fixes the enemy by halting on it",
			path, c.FlankTriggerRange, c.AdvanceTriggerRange)
	}
	if c.FlankMinStrengthFraction > c.ReserveCommitStrengthFraction {
		return fmt.Errorf("config: %s: command.flank_min_strength_fraction (%g) is above "+
			"command.reserve_commit_strength_fraction (%g); a commander cannot be told to send a flank before "+
			"he is willing to spend the reserves",
			path, c.FlankMinStrengthFraction, c.ReserveCommitStrengthFraction)
	}
	if c.WithdrawMorale > b.MoraleBreakThreshold {
		return fmt.Errorf("config: %s: command.withdraw_morale (%g) is above battle.morale_break_threshold (%g); "+
			"the formation would have broken on its own before the commander ever ordered it back",
			path, c.WithdrawMorale, b.MoraleBreakThreshold)
	}
	for _, s := range []struct{ key, value string }{
		{"command.front_shape", c.FrontShape},
		{"command.flank_shape", c.FlankShape},
		{"command.reserve_shape", c.ReserveShape},
	} {
		if strings.TrimSpace(s.value) == "" {
			return fmt.Errorf("config: %s: %s is empty; it must name a shape internal/formation implements "+
				"(line, column, wedge, loose)", path, s.key)
		}
	}
	return nil
}
