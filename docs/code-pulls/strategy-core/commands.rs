use super::city::{
    CITY_MAX_LEVEL, City, CityEconomyEffects, FACILITY_MAX_LEVEL, FacilityKind, ResourceCost,
    city_core_upgrade_cost, facility_kind_name, facility_upgrade_cost,
    project_city_monthly_change_with_effects,
};
use super::events::*;
use super::history_db::{HistoricalCatalog, LifeEventKind};
use super::ids::{CityId, FactionId, OfficerId, WILD_FACTION_ID};
use super::incidents::trigger_dynamic_incidents;
use super::model::*;
use super::officer::{
    Officer, OfficerStats, OfficerStatus, OfficialPostEffect, OfficialRank, official_post_spec,
    official_rank_loyalty_bonus, official_rank_order, official_rank_salary_bonus,
};
use super::personnel::{
    LifecycleConfig, OfficerGenerationProvider, RuleBasedChildGenerator,
    apply_annual_lifecycle_with_config, normalize_personnel_state,
};
use super::technology::*;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
struct CommandReservations {
    city_ids: BTreeSet<CityId>,
    officer_ids: BTreeSet<OfficerId>,
}

const WOUNDED_PERCENT: u32 = 60;
const DEFENDER_MONTHLY_LOSS_PERCENT: u32 = 22;
const ATTACKER_MONTHLY_LOSS_PERCENT: u32 = 18;
const OFFICER_RECRUITMENT_SUCCESS_PROGRESS: u8 = 100;
const WILD_OFFICER_MOVE_CHANCE_PERCENT: u32 = 35;

pub fn expedition_monthly_supply_for_troops(troops: TroopPool) -> u32 {
    troops.total().div_ceil(500).max(1)
}

pub fn queue_player_command(state: &mut GameState, command: Command) -> Result<(), CommandError> {
    ensure_faction_technology_states(state);
    if state.status != GameStatus::Running {
        return Err(CommandError::Invalid("游戏已经结束".to_string()));
    }
    if command.issuer_faction_id != state.player_faction_id {
        return Err(CommandError::Invalid("玩家只能提交己方命令".to_string()));
    }

    let mut reservations = CommandReservations::default();
    reserve_officer_recruitments(state, &mut reservations);
    for pending in &state.pending_commands {
        reserve_command(state, pending, &mut reservations)?;
    }
    validate_command(state, &command, &mut reservations)?;
    state.pending_commands.push(command);
    Ok(())
}

pub fn queue_player_diplomacy(
    state: &mut GameState,
    mut order: DiplomacyOrder,
) -> Result<(), CommandError> {
    ensure_faction_technology_states(state);
    if state.status != GameStatus::Running {
        return Err(CommandError::Invalid("游戏已经结束".to_string()));
    }
    if order.issuer_faction_id != state.player_faction_id {
        return Err(CommandError::Invalid("玩家只能提交己方外交".to_string()));
    }
    order.submitted_turn = state.turn;
    validate_diplomacy_order(state, &order)?;
    state.pending_diplomacy.push(order);
    Ok(())
}

pub fn resolve_command_batch(state: &mut GameState, commands: Vec<Command>) -> TurnReport {
    resolve_command_batch_inner(state, commands, None, &RuleBasedChildGenerator)
}

pub fn resolve_command_batch_with_generation(
    state: &mut GameState,
    commands: Vec<Command>,
    generator: &dyn OfficerGenerationProvider,
) -> TurnReport {
    resolve_command_batch_inner(state, commands, None, generator)
}

pub fn resolve_command_batch_with_history<C: HistoricalCatalog>(
    state: &mut GameState,
    commands: Vec<Command>,
    catalog: &C,
) -> TurnReport {
    resolve_command_batch_inner(
        state,
        commands,
        Some(catalog as &dyn HistoricalCatalog),
        &RuleBasedChildGenerator,
    )
}

pub fn resolve_command_batch_with_history_and_generation<C: HistoricalCatalog>(
    state: &mut GameState,
    commands: Vec<Command>,
    catalog: &C,
    generator: &dyn OfficerGenerationProvider,
) -> TurnReport {
    resolve_command_batch_inner(
        state,
        commands,
        Some(catalog as &dyn HistoricalCatalog),
        generator,
    )
}

fn resolve_command_batch_inner(
    state: &mut GameState,
    commands: Vec<Command>,
    catalog: Option<&dyn HistoricalCatalog>,
    generator: &dyn OfficerGenerationProvider,
) -> TurnReport {
    normalize_personnel_state(state);
    ensure_faction_technology_states(state);
    begin_ai_research(state);
    expire_due_event_decisions(state);
    let previous_status = state.status.clone();
    let alive_before = alive_faction_ids(state);
    let mut report = TurnReport::new(state);
    let mut reservations = CommandReservations::default();
    reserve_officer_recruitments(state, &mut reservations);
    resolve_diplomacy_orders(state, &mut report);
    let command_count = commands.len();
    let mut executed_commands = 0;
    let mut rejected_commands = 0;

    for command in commands {
        match validate_command(state, &command, &mut reservations) {
            Ok(()) => {
                executed_commands += 1;
                apply_command(state, &command, &mut report);
            }
            Err(error) => {
                rejected_commands += 1;
                report.warning(format!("命令被拒绝: {} ({error})", command.summary()));
            }
        }
    }
    report.info(format!(
        "本月处理军令 {command_count} 条，执行 {executed_commands} 条，拒绝 {rejected_commands} 条"
    ));

    resolve_due_army_movements(state, &mut report);
    apply_monthly_income(state, &mut report);
    advance_research_and_report(state, &mut report);
    record_destroyed_factions(state, &alive_before);
    state.pending_commands.clear();
    state.refresh_status();
    record_status_change(state, &previous_status);
    if state.status == GameStatus::Running {
        state.advance_month();
        if let Some(catalog) = catalog {
            apply_due_life_events(state, catalog, &mut report);
            state.refresh_status();
        }
        advance_officer_recruitments(state, &mut report);
        move_wild_officers(state, &mut report);
        apply_annual_lifecycle_with_config(
            state,
            &mut report,
            generator,
            LifecycleConfig::default(),
        );
        if let Some(catalog) = catalog {
            trigger_dynamic_incidents(state, catalog, &mut report);
        }
    }
    append_turn_summary(state, &mut report);
    state.reports.push(report.clone());
    report
}

fn begin_ai_research(state: &mut GameState) {
    let faction_ids: Vec<FactionId> = state
        .factions
        .values()
        .filter(|faction| {
            faction.controlled_by == Controller::RuleAi && state.faction_alive(&faction.id)
        })
        .map(|faction| faction.id.clone())
        .collect();

    for faction_id in faction_ids {
        let Some(technology_id) = choose_ai_research(state, &faction_id) else {
            continue;
        };
        let _ = start_research(state, &faction_id, &technology_id);
    }
}

fn advance_research_and_report(state: &mut GameState, report: &mut TurnReport) {
    for completed in advance_active_research(state) {
        let faction_name = state
            .factions
            .get(&completed.faction_id)
            .map(|faction| faction.name.as_str())
            .unwrap_or(completed.faction_id.as_str());
        let Some(spec) = state.technology_catalog.spec(&completed.technology_id) else {
            report.warning(format!(
                "{faction_name} 完成未知太学研习：{}",
                completed.technology_id
            ));
            continue;
        };
        report.info(format!("{faction_name} 完成太学研习：{}", spec.name));
        if completed.faction_id == state.player_faction_id {
            record_game_event(
                state,
                GameEventDraft {
                    kind: GameEventKind::TechnologyCompleted,
                    severity: GameEventSeverity::Important,
                    scope: GameEventScope::Player,
                    title: "太学研习完成".to_string(),
                    summary: format!("{faction_name} 完成太学研习：{}", spec.name),
                    detail: format!("{} 已完成太学研习。{}", spec.name, spec.effect),
                    city_id: None,
                    faction_id: Some(completed.faction_id.clone()),
                    officer_id: None,
                    resolution: EventResolution::NoneRequired,
                },
            );
        }
    }
}

pub fn validate_command_for_state(
    state: &GameState,
    command: &Command,
) -> Result<(), CommandError> {
    let mut reservations = CommandReservations::default();
    reserve_officer_recruitments(state, &mut reservations);
    validate_command(state, command, &mut reservations)
}

pub fn validate_diplomacy_order(
    state: &GameState,
    order: &DiplomacyOrder,
) -> Result<(), CommandError> {
    validate_diplomacy_order_base(state, order)?;
    if state.pending_diplomacy.iter().any(|pending| {
        pending.issuer_faction_id == order.issuer_faction_id
            && pending.target_faction_id == order.target_faction_id
    }) {
        return Err(CommandError::Invalid(
            "本月已向该势力提交外交提案".to_string(),
        ));
    }
    Ok(())
}

pub fn diplomacy_net_value(order: &DiplomacyOrder) -> i32 {
    order.offer.value() - order.request.value()
}

pub fn diplomacy_acceptance_score(state: &GameState, order: &DiplomacyOrder) -> i32 {
    let relation_score = state
        .relation(&order.issuer_faction_id, &order.target_faction_id)
        .map(|relation| i32::from(relation.score))
        .unwrap_or_default();
    relation_score + diplomacy_net_value(order) / 100
}

pub fn diplomacy_order_would_succeed(
    state: &GameState,
    order: &DiplomacyOrder,
) -> Result<bool, CommandError> {
    validate_diplomacy_order_base(state, order)?;
    Ok(match order.kind {
        DiplomacyActionKind::ImproveRelations | DiplomacyActionKind::DeclareWar => true,
        DiplomacyActionKind::ResourceExchange => diplomacy_acceptance_score(state, order) >= 0,
        DiplomacyActionKind::Truce => diplomacy_acceptance_score(state, order) >= -40,
        DiplomacyActionKind::RequestPeace => diplomacy_acceptance_score(state, order) >= -20,
        DiplomacyActionKind::PassageRight => diplomacy_acceptance_score(state, order) >= 10,
    })
}

fn validate_diplomacy_order_base(
    state: &GameState,
    order: &DiplomacyOrder,
) -> Result<(), CommandError> {
    if !state.factions.contains_key(&order.issuer_faction_id) {
        return Err(CommandError::Invalid("发起势力不存在".to_string()));
    }
    if order.target_faction_id == order.issuer_faction_id {
        return Err(CommandError::Invalid("不能对自己外交".to_string()));
    }
    if !state.factions.contains_key(&order.target_faction_id) {
        return Err(CommandError::Invalid("目标势力不存在".to_string()));
    }
    if !state.faction_alive(&order.issuer_faction_id) {
        return Err(CommandError::Invalid("发起势力已无城池".to_string()));
    }
    if !state.faction_alive(&order.target_faction_id) {
        return Err(CommandError::Invalid("目标势力已灭亡".to_string()));
    }
    validate_resource_bundle(&order.offer, "给出资源")?;
    validate_resource_bundle(&order.request, "要求资源")?;
    if order.kind == DiplomacyActionKind::ImproveRelations && !order.request.is_empty() {
        return Err(CommandError::Invalid("修好不能要求对方资源".to_string()));
    }
    if order.kind == DiplomacyActionKind::DeclareWar
        && (!order.offer.is_empty() || !order.request.is_empty())
    {
        return Err(CommandError::Invalid("宣战不能附带资源条款".to_string()));
    }
    let source = state
        .cities
        .get(&order.source_city_id)
        .ok_or_else(|| CommandError::Invalid(format!("交付城 {} 不存在", order.source_city_id)))?;
    if source.faction_id != order.issuer_faction_id {
        return Err(CommandError::Invalid(format!(
            "{} 不是己方交付城",
            source.name
        )));
    }
    let receive = state
        .cities
        .get(&order.receive_city_id)
        .ok_or_else(|| CommandError::Invalid(format!("接收城 {} 不存在", order.receive_city_id)))?;
    if receive.faction_id != order.issuer_faction_id {
        return Err(CommandError::Invalid(format!(
            "{} 不是己方接收城",
            receive.name
        )));
    }
    ensure_city_can_pay_bundle(source, &order.offer, "外交给出资源")?;
    if !faction_can_pay_bundle(state, &order.target_faction_id, &order.request) {
        return Err(CommandError::Invalid("目标势力资源不足".to_string()));
    }
    Ok(())
}

fn validate_resource_bundle(bundle: &ResourceBundle, label: &str) -> Result<(), CommandError> {
    if bundle.gold < 0 || bundle.food < 0 || bundle.materials < 0 {
        return Err(CommandError::Invalid(format!("{label}不能为负")));
    }
    Ok(())
}

fn ensure_city_can_pay_bundle(
    city: &City,
    bundle: &ResourceBundle,
    action: &str,
) -> Result<(), CommandError> {
    if city.gold < bundle.gold || city.food < bundle.food || city.materials < bundle.materials {
        return Err(CommandError::Invalid(format!(
            "{action}需要 {} 金、{} 粮、{} 建材",
            bundle.gold, bundle.food, bundle.materials
        )));
    }
    Ok(())
}

fn faction_can_pay_bundle(state: &GameState, faction_id: &str, bundle: &ResourceBundle) -> bool {
    faction_resource_total(state, faction_id, DiplomacyResource::Gold) >= bundle.gold
        && faction_resource_total(state, faction_id, DiplomacyResource::Food) >= bundle.food
        && faction_resource_total(state, faction_id, DiplomacyResource::Materials)
            >= bundle.materials
}

pub fn appoint_official_post(
    state: &mut GameState,
    faction_id: &str,
    officer_id: &str,
    office_id: &str,
) -> Result<(), CommandError> {
    let new_spec = official_post_spec(office_id)
        .ok_or_else(|| CommandError::Invalid(format!("官职 {office_id} 不存在")))?;
    let officer = state
        .officers
        .get(officer_id)
        .ok_or_else(|| CommandError::Invalid(format!("武将 {officer_id} 不存在")))?;
    if officer.faction_id != faction_id {
        return Err(CommandError::Invalid(format!(
            "{} 不是己方武将",
            officer.name
        )));
    }
    if !officer.is_active() {
        return Err(CommandError::Invalid(format!(
            "{} 当前不可授官",
            officer.name
        )));
    }

    for other in state.officers.values_mut() {
        if other.faction_id == faction_id
            && other.id != officer_id
            && other.office_id.as_deref() == Some(office_id)
        {
            apply_loyalty_delta(
                &mut other.loyalty,
                -i16::from(official_rank_loyalty_bonus(new_spec.rank)),
            );
            other.office_id = None;
        }
    }
    let officer = state
        .officers
        .get_mut(officer_id)
        .ok_or_else(|| CommandError::Invalid(format!("武将 {officer_id} 不存在")))?;
    let old_rank = officer
        .office_id
        .as_deref()
        .and_then(official_post_spec)
        .map(|spec| spec.rank);
    let loyalty_delta = appointment_loyalty_delta(old_rank, new_spec.rank);
    apply_loyalty_delta(&mut officer.loyalty, loyalty_delta);
    officer.office_id = Some(office_id.to_string());
    Ok(())
}

pub fn dismiss_official_post(
    state: &mut GameState,
    faction_id: &str,
    officer_id: &str,
) -> Result<(), CommandError> {
    let officer = state
        .officers
        .get_mut(officer_id)
        .ok_or_else(|| CommandError::Invalid(format!("武将 {officer_id} 不存在")))?;
    if officer.faction_id != faction_id {
        return Err(CommandError::Invalid(format!(
            "{} 不是己方武将",
            officer.name
        )));
    }
    if let Some(spec) = officer.office_id.as_deref().and_then(official_post_spec) {
        apply_loyalty_delta(
            &mut officer.loyalty,
            -i16::from(official_rank_loyalty_bonus(spec.rank)),
        );
    }
    officer.office_id = None;
    Ok(())
}

pub fn start_officer_recruitment(
    state: &mut GameState,
    issuer_faction_id: &str,
    source_city_id: &str,
    recruiter_officer_id: &str,
    target_officer_id: &str,
) -> Result<OfficerRecruitmentTask, CommandError> {
    validate_officer_recruitment(
        state,
        issuer_faction_id,
        source_city_id,
        recruiter_officer_id,
        target_officer_id,
    )?;
    state.next_officer_recruitment_sequence += 1;
    let task = OfficerRecruitmentTask {
        id: format!(
            "officer-recruitment-{}",
            state.next_officer_recruitment_sequence
        ),
        issuer_faction_id: issuer_faction_id.to_string(),
        source_city_id: source_city_id.to_string(),
        recruiter_officer_id: recruiter_officer_id.to_string(),
        target_officer_id: target_officer_id.to_string(),
        progress: 0,
        attempt_months: 0,
        started_turn: state.turn,
    };
    state.officer_recruitments.push(task.clone());
    Ok(task)
}

pub fn cancel_officer_recruitment(
    state: &mut GameState,
    task_id: &str,
) -> Result<OfficerRecruitmentTask, CommandError> {
    let index = state
        .officer_recruitments
        .iter()
        .position(|task| task.id == task_id)
        .ok_or_else(|| CommandError::Invalid(format!("登用任务 {task_id} 不存在")))?;
    Ok(state.officer_recruitments.remove(index))
}

pub fn officer_recruitment_progress_gain(
    state: &GameState,
    task: &OfficerRecruitmentTask,
) -> Option<u8> {
    let recruiter = state.officers.get(&task.recruiter_officer_id)?;
    let target = state.officers.get(&task.target_officer_id)?;
    Some(recruitment_progress_gain(
        state,
        &task.source_city_id,
        recruiter,
        target,
    ))
}

fn appointment_loyalty_delta(old_rank: Option<OfficialRank>, new_rank: OfficialRank) -> i16 {
    let new_bonus = i16::from(official_rank_loyalty_bonus(new_rank));
    let Some(old_rank) = old_rank else {
        return new_bonus;
    };
    (official_rank_order(new_rank) - official_rank_order(old_rank)) * 2
}

fn apply_loyalty_delta(loyalty: &mut u8, delta: i16) {
    *loyalty = (i16::from(*loyalty) + delta).clamp(0, 100) as u8;
}

fn validate_officer_recruitment(
    state: &GameState,
    issuer_faction_id: &str,
    source_city_id: &str,
    recruiter_officer_id: &str,
    target_officer_id: &str,
) -> Result<(), CommandError> {
    if !state.factions.contains_key(issuer_faction_id) {
        return Err(CommandError::Invalid("发起势力不存在".to_string()));
    }
    let city = state
        .cities
        .get(source_city_id)
        .ok_or_else(|| CommandError::Invalid(format!("城池 {source_city_id} 不存在")))?;
    if city.faction_id != issuer_faction_id {
        return Err(CommandError::Invalid(format!("{} 不是己方城池", city.name)));
    }
    validate_officer_in_city(
        state,
        recruiter_officer_id,
        source_city_id,
        issuer_faction_id,
    )?;
    if state.pending_officer_ids().contains(recruiter_officer_id) {
        return Err(CommandError::Invalid(format!(
            "武将 {recruiter_officer_id} 本月已经行动"
        )));
    }
    if state.officer_recruitments.iter().any(|task| {
        task.recruiter_officer_id == recruiter_officer_id
            || task.target_officer_id == target_officer_id
    }) {
        return Err(CommandError::Invalid("登用相关武将已有任务".to_string()));
    }
    let target = state
        .officers
        .get(target_officer_id)
        .ok_or_else(|| CommandError::Invalid(format!("武将 {target_officer_id} 不存在")))?;
    if target.status != OfficerStatus::Wild || target.faction_id != WILD_FACTION_ID {
        return Err(CommandError::Invalid(format!(
            "{} 不是在野武将",
            target.name
        )));
    }
    if !target.is_adult_at(state.year) {
        return Err(CommandError::Invalid(format!("{} 尚未成年", target.name)));
    }
    if target.city_id.is_none() {
        return Err(CommandError::Invalid(format!(
            "{} 行踪不明，无法登用",
            target.name
        )));
    }
    Ok(())
}

fn validate_command(
    state: &GameState,
    command: &Command,
    reservations: &mut CommandReservations,
) -> Result<(), CommandError> {
    let city = state
        .cities
        .get(&command.city_id)
        .ok_or_else(|| CommandError::Invalid(format!("城池 {} 不存在", command.city_id)))?;
    if city.faction_id != command.issuer_faction_id {
        return Err(CommandError::Invalid(format!("{} 不是己方城池", city.name)));
    }
    if reservations.city_ids.contains(&command.city_id) {
        return Err(CommandError::Invalid(format!(
            "{} 本月已经有命令",
            city.name
        )));
    }

    let mut used_officers = BTreeSet::new();
    let officer_id = command
        .officer_id
        .as_ref()
        .ok_or_else(|| CommandError::Invalid("命令必须选择执行武将".to_string()))?;
    validate_officer_in_city(
        state,
        officer_id,
        &command.city_id,
        &command.issuer_faction_id,
    )?;
    used_officers.insert(officer_id.clone());

    match &command.kind {
        CommandKind::Develop { .. } => {
            if city.gold < 80 {
                return Err(CommandError::Invalid("开发需要至少 80 金".to_string()));
            }
        }
        CommandKind::UpgradeCityCore => {
            if city.level >= CITY_MAX_LEVEL {
                return Err(CommandError::Invalid("城镇核心已达最高等级".to_string()));
            }
            if city.order < 45 {
                return Err(CommandError::Invalid(
                    "治安低于 45，不能升级城镇核心".to_string(),
                ));
            }
            let cost = city_core_upgrade_cost(city.level + 1);
            ensure_city_can_pay(city, cost, "升级城镇核心")?;
        }
        CommandKind::BuildFacility { kind } => {
            let target_level = next_facility_level(city, *kind)?;
            let cost = facility_upgrade_cost(*kind, target_level);
            ensure_city_can_pay(city, cost, "建设设施")?;
        }
        CommandKind::Recruit { kind, amount } => {
            if *amount == 0 || *amount > 5000 {
                return Err(CommandError::Invalid(
                    "征兵数量必须在 1-5000 之间".to_string(),
                ));
            }
            let cost =
                recruit_cost_for_faction_kind(state, &command.issuer_faction_id, *kind, *amount);
            if city.gold < cost.gold || city.food < cost.food {
                return Err(CommandError::Invalid(format!(
                    "征兵需要 {} 金和 {} 粮",
                    cost.gold, cost.food
                )));
            }
            if city.population < amount.saturating_mul(2) {
                return Err(CommandError::Invalid("人口不足以征兵".to_string()));
            }
        }
        CommandKind::Train => {
            if city.troops.is_empty() {
                return Err(CommandError::Invalid("没有士兵可训练".to_string()));
            }
            if city.gold < 40 {
                return Err(CommandError::Invalid("训练需要至少 40 金".to_string()));
            }
        }
        CommandKind::AppointGovernor { target_officer_id } => {
            validate_officer_in_city(
                state,
                target_officer_id,
                &command.city_id,
                &command.issuer_faction_id,
            )?;
            used_officers.insert(target_officer_id.clone());
        }
        CommandKind::Transfer {
            target_city_id,
            troops,
            officer_ids,
        } => {
            let target = state.cities.get(target_city_id).ok_or_else(|| {
                CommandError::Invalid(format!("目标城池 {target_city_id} 不存在"))
            })?;
            if target_city_id == &command.city_id {
                return Err(CommandError::Invalid("不能调动到同一座城".to_string()));
            }
            if target.faction_id != command.issuer_faction_id {
                return Err(CommandError::Invalid("只能向己方城池调动".to_string()));
            }
            if route_distance_li_for_faction(
                state,
                &command.issuer_faction_id,
                &command.city_id,
                target_city_id,
                false,
            )
            .is_none()
            {
                return Err(CommandError::Invalid(
                    "调动目标必须有可通行路线".to_string(),
                ));
            }
            if troops.is_empty() && officer_ids.is_empty() {
                return Err(CommandError::Invalid("调动必须包含兵力或武将".to_string()));
            }
            if city.troops.checked_sub_pool(*troops).is_none() {
                return Err(CommandError::Invalid("调动兵力超过城池驻军".to_string()));
            }
            for transfer_officer_id in officer_ids {
                validate_officer_in_city(
                    state,
                    transfer_officer_id,
                    &command.city_id,
                    &command.issuer_faction_id,
                )?;
                used_officers.insert(transfer_officer_id.clone());
            }
        }
        CommandKind::Expedition {
            target_city_id,
            assignments,
            food_supply,
        } => {
            if besieging_faction_id(state, &command.city_id).is_some() {
                return Err(CommandError::Invalid(format!(
                    "{} 正被围攻，不能出征",
                    city.name
                )));
            }
            validate_expedition_assignments(state, command, city, assignments, &mut used_officers)?;
            if *food_supply == 0 {
                return Err(CommandError::Invalid("出征必须携带粮草".to_string()));
            }
            if city.food < i32::try_from(*food_supply).unwrap_or(i32::MAX) {
                return Err(CommandError::Invalid("出征粮草超过城池存粮".to_string()));
            }
            let target = state.cities.get(target_city_id).ok_or_else(|| {
                CommandError::Invalid(format!("目标城池 {target_city_id} 不存在"))
            })?;
            if target.faction_id == command.issuer_faction_id {
                return Err(CommandError::Invalid("不能攻击己方城池".to_string()));
            }
            if let Some(siege_faction_id) = besieging_faction_id(state, target_city_id)
                && siege_faction_id != command.issuer_faction_id
            {
                return Err(CommandError::Invalid(format!(
                    "{} 已被其他势力围攻",
                    target.name
                )));
            }
            if route_distance_li_for_faction(
                state,
                &command.issuer_faction_id,
                &command.city_id,
                target_city_id,
                true,
            )
            .is_none()
            {
                return Err(CommandError::Invalid(
                    "出征目标必须有可通行路线".to_string(),
                ));
            }
            if state
                .relation(&command.issuer_faction_id, &target.faction_id)
                .is_some_and(|relation| relation.has_active_truce(state.turn))
                && !has_pending_declaration(state, &command.issuer_faction_id, &target.faction_id)
            {
                return Err(CommandError::Invalid("停战期内不能出征".to_string()));
            }
        }
        CommandKind::Diplomacy {
            target_faction_id, ..
        } => {
            if target_faction_id == &command.issuer_faction_id {
                return Err(CommandError::Invalid("不能对自己外交".to_string()));
            }
            if !state.factions.contains_key(target_faction_id) {
                return Err(CommandError::Invalid("目标势力不存在".to_string()));
            }
        }
    }

    for used_officer in used_officers {
        if reservations.officer_ids.contains(&used_officer) {
            return Err(CommandError::Invalid(format!(
                "武将 {used_officer} 本月已经行动"
            )));
        }
        reservations.officer_ids.insert(used_officer);
    }
    reservations.city_ids.insert(command.city_id.clone());
    Ok(())
}

fn has_pending_declaration(
    state: &GameState,
    issuer_faction_id: &str,
    target_faction_id: &str,
) -> bool {
    state.pending_diplomacy.iter().any(|order| {
        order.issuer_faction_id == issuer_faction_id
            && order.target_faction_id == target_faction_id
            && order.kind == DiplomacyActionKind::DeclareWar
    })
}

fn reserve_command(
    state: &GameState,
    command: &Command,
    reservations: &mut CommandReservations,
) -> Result<(), CommandError> {
    validate_command(state, command, reservations)
}

fn reserve_officer_recruitments(state: &GameState, reservations: &mut CommandReservations) {
    for task in &state.officer_recruitments {
        reservations
            .officer_ids
            .insert(task.recruiter_officer_id.clone());
    }
}

fn validate_officer_in_city(
    state: &GameState,
    officer_id: &str,
    city_id: &str,
    faction_id: &str,
) -> Result<(), CommandError> {
    let officer = state
        .officers
        .get(officer_id)
        .ok_or_else(|| CommandError::Invalid(format!("武将 {officer_id} 不存在")))?;
    if officer.faction_id != faction_id {
        return Err(CommandError::Invalid(format!(
            "{} 不是己方武将",
            officer.name
        )));
    }
    if officer.city_id.as_deref() != Some(city_id) {
        return Err(CommandError::Invalid(format!(
            "{} 不在命令城池",
            officer.name
        )));
    }
    if !officer.is_active() {
        return Err(CommandError::Invalid(format!(
            "{} 当前不可行动",
            officer.name
        )));
    }
    Ok(())
}

fn validate_expedition_assignments(
    state: &GameState,
    command: &Command,
    city: &City,
    assignments: &[ExpeditionAssignment],
    used_officers: &mut BTreeSet<OfficerId>,
) -> Result<(), CommandError> {
    if assignments.is_empty() {
        return Err(CommandError::Invalid("出征必须至少选择主将".to_string()));
    }
    if assignments.len() > 3 {
        return Err(CommandError::Invalid("出征最多选择三名武将".to_string()));
    }

    let command_officer_id = command
        .officer_id
        .as_deref()
        .ok_or_else(|| CommandError::Invalid("命令必须选择执行武将".to_string()))?;
    let mut commander_count = 0;
    let mut assignment_officers = BTreeSet::new();
    let mut troops = TroopPool::default();

    for assignment in assignments {
        if assignment.troops == 0 {
            return Err(CommandError::Invalid("出征兵力必须大于 0".to_string()));
        }
        if !assignment_officers.insert(assignment.officer_id.clone()) {
            return Err(CommandError::Invalid("出征武将不能重复".to_string()));
        }
        validate_officer_in_city(
            state,
            &assignment.officer_id,
            &command.city_id,
            &command.issuer_faction_id,
        )?;
        let officer = state.officers.get(&assignment.officer_id).unwrap();
        let capacity = command_capacity_for_officer(officer);
        if assignment.troops > capacity {
            return Err(CommandError::Invalid(format!(
                "{} 统兵超过官阶上限 {}",
                officer.name, capacity
            )));
        }
        if assignment.role == ExpeditionRole::Commander {
            commander_count += 1;
            if assignment.officer_id != command_officer_id {
                return Err(CommandError::Invalid(
                    "出征主将必须与命令执行武将一致".to_string(),
                ));
            }
        }
        troops.add(assignment.troop_kind, assignment.troops);
    }

    if commander_count != 1 {
        return Err(CommandError::Invalid(
            "出征必须且只能有一名主将".to_string(),
        ));
    }
    if city.troops.checked_sub_pool(troops).is_none() {
        return Err(CommandError::Invalid("出征兵力超过城池驻军".to_string()));
    }
    used_officers.extend(assignment_officers);
    Ok(())
}

fn troop_pool_for_assignments(assignments: &[ExpeditionAssignment]) -> TroopPool {
    let mut troops = TroopPool::default();
    for assignment in assignments {
        troops.add(assignment.troop_kind, assignment.troops);
    }
    troops
}

pub fn command_capacity_for_officer(officer: &Officer) -> u32 {
    let rank_order = officer
        .office_id
        .as_deref()
        .and_then(official_post_spec)
        .map(|spec| official_rank_order(spec.rank))
        .unwrap_or(1)
        .max(1) as u32;
    2_000 + rank_order * 1_300
}

fn ensure_city_can_pay(city: &City, cost: ResourceCost, action: &str) -> Result<(), CommandError> {
    if city.gold < cost.gold || city.food < cost.food || city.materials < cost.materials {
        return Err(CommandError::Invalid(format!(
            "{action}需要 {} 金、{} 粮、{} 建材",
            cost.gold, cost.food, cost.materials
        )));
    }
    Ok(())
}

fn next_facility_level(city: &City, kind: FacilityKind) -> Result<u8, CommandError> {
    if let Some(facility) = city.facility(kind) {
        if facility.level >= FACILITY_MAX_LEVEL {
            return Err(CommandError::Invalid("设施已达最高等级".to_string()));
        }
        let target_level = facility.level + 1;
        if target_level > city.level {
            return Err(CommandError::Invalid(
                "设施等级不能超过城镇核心等级".to_string(),
            ));
        }
        return Ok(target_level);
    }

    if city.facilities.len() >= city.facility_slots() {
        return Err(CommandError::Invalid("城镇设施槽位已满".to_string()));
    }
    Ok(1)
}

fn apply_command(state: &mut GameState, command: &Command, report: &mut TurnReport) {
    match &command.kind {
        CommandKind::Develop { focus } => apply_develop(state, command, focus, report),
        CommandKind::UpgradeCityCore => apply_upgrade_city_core(state, command, report),
        CommandKind::BuildFacility { kind } => apply_build_facility(state, command, *kind, report),
        CommandKind::Recruit { kind, amount } => {
            apply_recruit(state, command, *kind, *amount, report)
        }
        CommandKind::Train => apply_train(state, command, report),
        CommandKind::AppointGovernor { target_officer_id } => {
            apply_appoint_governor(state, command, target_officer_id, report)
        }
        CommandKind::Transfer {
            target_city_id,
            troops,
            officer_ids,
        } => apply_transfer(state, command, target_city_id, *troops, officer_ids, report),
        CommandKind::Expedition {
            target_city_id,
            assignments,
            food_supply,
        } => apply_expedition(
            state,
            command,
            target_city_id,
            assignments,
            *food_supply,
            report,
        ),
        CommandKind::Diplomacy {
            target_faction_id,
            proposal,
        } => apply_diplomacy(state, command, target_faction_id, proposal, report),
    }
}

fn apply_develop(
    state: &mut GameState,
    command: &Command,
    focus: &DevelopmentFocus,
    report: &mut TurnReport,
) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let bonuses = faction_technology_bonuses(state, &command.issuer_faction_id);
    let gain = 8
        + u16::from(officer.stats.politics) / 5
        + bonuses.development_bonus
        + match focus {
            DevelopmentFocus::Agriculture => bonuses.agriculture_development_bonus,
            DevelopmentFocus::Commerce => bonuses.commerce_development_bonus,
            DevelopmentFocus::Defense => 0,
            DevelopmentFocus::Order => 0,
        };
    let city = state.cities.get_mut(&command.city_id).unwrap();
    city.gold -= 80;
    match focus {
        DevelopmentFocus::Agriculture => city.agriculture += gain,
        DevelopmentFocus::Commerce => city.commerce += gain,
        DevelopmentFocus::Defense => city.defense += gain,
        DevelopmentFocus::Order => {
            city.order = city.order.saturating_add(
                (4 + officer.stats.charm / 15 + bonuses.order_development_bonus).min(12),
            );
        }
    }
    city.clamp_fields();
    report.info(format!("{} 执行开发，{} 有所提升", officer.name, city.name));
}

fn apply_upgrade_city_core(state: &mut GameState, command: &Command, report: &mut TurnReport) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let officer_name = officer.name.clone();
    let city = state.cities.get_mut(&command.city_id).unwrap();
    let next_level = city.level + 1;
    let cost = city_core_upgrade_cost(next_level);
    city.gold -= cost.gold;
    city.food -= cost.food;
    city.materials -= cost.materials;
    city.level = next_level.min(CITY_MAX_LEVEL);
    city.order = city.order.saturating_sub(2);
    city.clamp_fields();
    let city_name = city.name.clone();
    let city_level = city.level;
    report.info(format!(
        "{} 主持扩建，{} 城镇核心升至 {} 级",
        officer_name, city_name, city_level
    ));
    if command.issuer_faction_id == state.player_faction_id {
        record_game_event(
            state,
            GameEventDraft {
                kind: GameEventKind::CityDevelopment,
                severity: GameEventSeverity::Info,
                scope: GameEventScope::Player,
                title: "城镇升级".to_string(),
                summary: format!("{city_name} 城镇核心升至 {city_level} 级"),
                detail: format!(
                    "{officer_name} 主持扩建，{city_name} 的城镇核心升至 {city_level} 级。"
                ),
                city_id: Some(command.city_id.clone()),
                faction_id: Some(command.issuer_faction_id.clone()),
                officer_id: command.officer_id.clone(),
                resolution: EventResolution::NoneRequired,
            },
        );
    }
}

fn apply_build_facility(
    state: &mut GameState,
    command: &Command,
    kind: FacilityKind,
    report: &mut TurnReport,
) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let officer_name = officer.name.clone();
    let city = state.cities.get_mut(&command.city_id).unwrap();
    let target_level = next_facility_level(city, kind).unwrap();
    let cost = facility_upgrade_cost(kind, target_level);
    city.gold -= cost.gold;
    city.food -= cost.food;
    city.materials -= cost.materials;
    if let Some(facility) = city
        .facilities
        .iter_mut()
        .find(|facility| facility.kind == kind)
    {
        facility.level = target_level;
    } else {
        city.facilities.push(super::city::CityFacility {
            kind,
            level: target_level,
        });
    }
    city.order = city.order.saturating_sub(1);
    city.clamp_fields();
    let city_name = city.name.clone();
    let facility_name = facility_kind_name(kind);
    report.info(format!(
        "{officer_name} 主持建设，{city_name} 的 {facility_name} 达到 {target_level} 级"
    ));
    if command.issuer_faction_id == state.player_faction_id {
        record_game_event(
            state,
            GameEventDraft {
                kind: GameEventKind::CityDevelopment,
                severity: GameEventSeverity::Info,
                scope: GameEventScope::Player,
                title: "设施建设".to_string(),
                summary: format!("{city_name} 的 {facility_name} 达到 {target_level} 级"),
                detail: format!(
                    "{officer_name} 主持建设，{city_name} 的 {facility_name} 达到 {target_level} 级。"
                ),
                city_id: Some(command.city_id.clone()),
                faction_id: Some(command.issuer_faction_id.clone()),
                officer_id: command.officer_id.clone(),
                resolution: EventResolution::NoneRequired,
            },
        );
    }
}

fn apply_recruit(
    state: &mut GameState,
    command: &Command,
    kind: TroopKind,
    amount: u32,
    report: &mut TurnReport,
) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let cost = recruit_cost_for_faction_kind(state, &command.issuer_faction_id, kind, amount);
    let city = state.cities.get_mut(&command.city_id).unwrap();
    city.gold -= cost.gold;
    city.food -= cost.food;
    city.population = city.population.saturating_sub(amount * 2);
    city.troops.add(kind, amount);
    city.order = city.order.saturating_sub(2);
    city.clamp_fields();
    report.info(format!(
        "{} 在 {} 征募 {} {}",
        officer.name,
        city.name,
        kind.label(),
        amount
    ));
}

fn apply_train(state: &mut GameState, command: &Command, report: &mut TurnReport) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let bonus =
        faction_technology_bonuses(state, &command.issuer_faction_id).training_command_bonus;
    let city = state.cities.get_mut(&command.city_id).unwrap();
    city.gold -= 40;
    city.training = city
        .training
        .saturating_add((6 + officer.stats.leadership / 12).min(15) + bonus);
    city.clamp_fields();
    report.info(format!("{} 训练 {} 驻军", officer.name, city.name));
}

fn apply_appoint_governor(
    state: &mut GameState,
    command: &Command,
    target_officer_id: &str,
    report: &mut TurnReport,
) {
    let officer_name = state
        .officers
        .get(target_officer_id)
        .map(|officer| officer.name.clone())
        .unwrap_or_else(|| target_officer_id.to_string());
    let city = state.cities.get_mut(&command.city_id).unwrap();
    city.governor_id = Some(target_officer_id.to_string());
    report.info(format!("{} 被任命为 {} 太守", officer_name, city.name));
}

fn apply_transfer(
    state: &mut GameState,
    command: &Command,
    target_city_id: &str,
    troops: TroopPool,
    officer_ids: &[OfficerId],
    report: &mut TurnReport,
) {
    let source_name = state.cities[&command.city_id].name.clone();
    let target_name = state.cities[target_city_id].name.clone();
    let distance_li = route_distance_li_for_faction(
        state,
        &command.issuer_faction_id,
        &command.city_id,
        target_city_id,
        false,
    )
    .unwrap_or_default();
    let travel_months = travel_months_for_faction(state, &command.issuer_faction_id, distance_li);
    let source_training = state.cities[&command.city_id].training;
    let moving_officers = movement_officer_ids(command.officer_id.as_ref().unwrap(), officer_ids);
    let moving_officer_count = moving_officers.len();
    {
        let source = state.cities.get_mut(&command.city_id).unwrap();
        source.troops.saturating_sub_pool(troops);
    }
    for officer_id in &moving_officers {
        if let Some(officer) = state.officers.get_mut(officer_id) {
            officer.city_id = None;
        }
    }
    state.army_movements.push(ArmyMovement {
        kind: ArmyMovementKind::Transfer,
        issuer_faction_id: command.issuer_faction_id.clone(),
        source_city_id: command.city_id.clone(),
        target_city_id: target_city_id.to_string(),
        commander_id: command.officer_id.clone().unwrap(),
        officer_ids: moving_officers,
        troops,
        food_supply: 0,
        wounded_troops: TroopPool::default(),
        assignments: Vec::new(),
        siege_started_turn: None,
        training: source_training,
        distance_li,
        departure_turn: state.turn,
        arrival_turn: state.turn + travel_months,
    });
    report.info(format!(
        "{} 向 {} 调动出发：{} 兵、{} 名武将，距离 {} 里，预计行军 {} 月",
        source_name,
        target_name,
        troops.total(),
        moving_officer_count,
        distance_li,
        travel_months
    ));
}

fn apply_expedition(
    state: &mut GameState,
    command: &Command,
    target_city_id: &str,
    assignments: &[ExpeditionAssignment],
    food_supply: u32,
    report: &mut TurnReport,
) {
    let troops = troop_pool_for_assignments(assignments);
    let attacker = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let attacker_name = attacker.name.clone();
    let source_city = state.cities[&command.city_id].clone();
    let target_city = state.cities[target_city_id].clone();
    let distance_li = route_distance_li_for_faction(
        state,
        &command.issuer_faction_id,
        &command.city_id,
        target_city_id,
        true,
    )
    .unwrap_or_default();
    let travel_months = travel_months_for_faction(state, &command.issuer_faction_id, distance_li);
    mark_factions_hostile(state, &command.issuer_faction_id, &target_city.faction_id);
    {
        let source = state.cities.get_mut(&command.city_id).unwrap();
        source.troops.saturating_sub_pool(troops);
        source.food = source
            .food
            .saturating_sub(i32::try_from(food_supply).unwrap_or(i32::MAX));
    }
    for assignment in assignments {
        if let Some(officer) = state.officers.get_mut(&assignment.officer_id) {
            officer.city_id = None;
        }
    }
    let officer_ids: Vec<_> = assignments
        .iter()
        .map(|assignment| assignment.officer_id.clone())
        .collect();
    state.army_movements.push(ArmyMovement {
        kind: ArmyMovementKind::Expedition,
        issuer_faction_id: command.issuer_faction_id.clone(),
        source_city_id: command.city_id.clone(),
        target_city_id: target_city_id.to_string(),
        commander_id: command.officer_id.clone().unwrap(),
        officer_ids,
        troops,
        food_supply,
        wounded_troops: TroopPool::default(),
        assignments: assignments.to_vec(),
        siege_started_turn: None,
        training: source_city.training,
        distance_li,
        departure_turn: state.turn,
        arrival_turn: state.turn + travel_months,
    });
    report.info(format!(
        "{} 率兵从 {} 出征 {}：{} 兵，携粮 {}，距离 {} 里，预计行军 {} 月",
        attacker_name,
        source_city.name,
        target_city.name,
        troops.total(),
        food_supply,
        distance_li,
        travel_months
    ));
}

fn movement_officer_ids(commander_id: &str, officer_ids: &[OfficerId]) -> Vec<OfficerId> {
    let mut moving = vec![commander_id.to_string()];
    for officer_id in officer_ids {
        if !moving.iter().any(|moving_id| moving_id == officer_id) {
            moving.push(officer_id.clone());
        }
    }
    moving
}

fn besieging_faction_id<'a>(state: &'a GameState, city_id: &str) -> Option<&'a str> {
    besieging_faction_id_in_movements(state.army_movements.iter(), city_id)
}

fn besieging_faction_id_in_movements<'a>(
    movements: impl IntoIterator<Item = &'a ArmyMovement>,
    city_id: &str,
) -> Option<&'a str> {
    movements.into_iter().find_map(|movement| {
        (movement.kind == ArmyMovementKind::Expedition
            && movement.siege_started_turn.is_some()
            && movement.target_city_id == city_id)
            .then_some(movement.issuer_faction_id.as_str())
    })
}

fn active_siege_claims<'a>(
    movements: impl IntoIterator<Item = &'a ArmyMovement>,
) -> BTreeMap<CityId, FactionId> {
    let mut claims = BTreeMap::new();
    for movement in movements {
        if movement.kind == ArmyMovementKind::Expedition && movement.siege_started_turn.is_some() {
            claims
                .entry(movement.target_city_id.clone())
                .or_insert_with(|| movement.issuer_faction_id.clone());
        }
    }
    claims
}

fn mark_factions_hostile(state: &mut GameState, faction_a: &str, faction_b: &str) {
    state
        .relation_mut(faction_a, faction_b)
        .mark_hostile(faction_a, faction_b);
}

fn resolve_due_army_movements(state: &mut GameState, report: &mut TurnReport) {
    let movements = std::mem::take(&mut state.army_movements);
    let mut siege_claims = active_siege_claims(movements.iter());
    let mut pending = Vec::new();
    for movement in movements {
        match movement.kind {
            ArmyMovementKind::Transfer => {
                if movement.arrival_turn <= state.turn {
                    resolve_transfer_arrival(state, movement, report);
                } else {
                    pending.push(movement);
                }
            }
            ArmyMovementKind::Expedition => {
                if let Some(movement) =
                    resolve_expedition_month(state, movement, &siege_claims, report)
                {
                    if movement.kind == ArmyMovementKind::Expedition
                        && movement.siege_started_turn.is_some()
                    {
                        siege_claims
                            .entry(movement.target_city_id.clone())
                            .or_insert_with(|| movement.issuer_faction_id.clone());
                    }
                    pending.push(movement);
                }
            }
        }
    }
    state.army_movements = pending;
}

fn resolve_expedition_month(
    state: &mut GameState,
    mut movement: ArmyMovement,
    siege_claims: &BTreeMap<CityId, FactionId>,
    report: &mut TurnReport,
) -> Option<ArmyMovement> {
    if movement.departure_turn >= state.turn {
        return Some(movement);
    }
    if movement.troops.is_empty() {
        return_expedition_to_friendly_city(
            state,
            &movement,
            "出征队已无可战兵".to_string(),
            report,
        );
        return None;
    }

    let monthly_supply = expedition_monthly_supply_for_troops(movement.troops);
    if movement.food_supply < monthly_supply {
        return_expedition_to_friendly_city(state, &movement, "粮草耗尽".to_string(), report);
        return None;
    }
    movement.food_supply -= monthly_supply;

    if movement.arrival_turn > state.turn {
        report.info(format!(
            "出征队行军消耗粮草 {monthly_supply}，剩余 {}",
            movement.food_supply
        ));
        return Some(movement);
    }

    resolve_expedition_arrival(state, movement, siege_claims, report)
}

fn resolve_transfer_arrival(
    state: &mut GameState,
    movement: ArmyMovement,
    report: &mut TurnReport,
) {
    let target_name = city_name(state, &movement.target_city_id);
    let target_owned = state
        .cities
        .get(&movement.target_city_id)
        .is_some_and(|city| city.faction_id == movement.issuer_faction_id);
    if target_owned {
        place_movement_at_city(state, &movement, &movement.target_city_id, movement.troops);
        report.info(format!(
            "调动队抵达 {}：{} 兵、{} 名武将入城",
            target_name,
            movement.troops.total(),
            movement.officer_ids.len()
        ));
        return;
    }

    return_movement_to_friendly_city(
        state,
        &movement,
        movement.troops,
        format!("调动目标 {target_name} 已不属己方"),
        report,
    );
}

fn resolve_expedition_arrival(
    state: &mut GameState,
    mut movement: ArmyMovement,
    siege_claims: &BTreeMap<CityId, FactionId>,
    report: &mut TurnReport,
) -> Option<ArmyMovement> {
    let Some(target_city) = state.cities.get(&movement.target_city_id).cloned() else {
        return_expedition_to_friendly_city(
            state,
            &movement,
            format!("出征目标 {} 不存在", movement.target_city_id),
            report,
        );
        return None;
    };

    if target_city.faction_id == movement.issuer_faction_id {
        place_movement_at_city(state, &movement, &movement.target_city_id, movement.troops);
        place_wounded_at_city(state, &movement.target_city_id, movement.wounded_troops);
        report.info(format!(
            "出征队抵达 {}，目标已属己方，{} 兵、{} 伤兵入城",
            target_city.name,
            movement.troops.total(),
            movement.wounded_troops.total()
        ));
        return None;
    }

    if state
        .relation(&movement.issuer_faction_id, &target_city.faction_id)
        .is_some_and(|relation| relation.has_active_truce(state.turn))
    {
        return_expedition_to_friendly_city(
            state,
            &movement,
            format!("{} 已处于停战期，出征队撤回", target_city.name),
            report,
        );
        return None;
    }

    if let Some(siege_faction_id) = siege_claims.get(&movement.target_city_id)
        && siege_faction_id != &movement.issuer_faction_id
    {
        return_expedition_to_friendly_city(
            state,
            &movement,
            format!("{} 已被其他势力围攻，出征队撤回", target_city.name),
            report,
        );
        return None;
    }

    let Some(attacker) = state.officers.get(&movement.commander_id) else {
        return_expedition_to_friendly_city(
            state,
            &movement,
            format!("主将 {} 不存在，出征队撤回", movement.commander_id),
            report,
        );
        return None;
    };
    if !attacker.is_active() {
        return_expedition_to_friendly_city(
            state,
            &movement,
            format!("主将 {} 当前不可行动，出征队撤回", attacker.name),
            report,
        );
        return None;
    }
    let attacker_name = attacker.name.clone();

    mark_factions_hostile(state, &movement.issuer_faction_id, &target_city.faction_id);

    if movement.siege_started_turn.is_none() {
        movement.siege_started_turn = Some(state.turn);
        report.info(format!(
            "{} 抵达 {}，开始围攻，剩余粮草 {}",
            attacker_name, target_city.name, movement.food_supply
        ));
    }

    resolve_expedition_siege_round(state, movement, &target_city, report)
}

fn resolve_expedition_siege_round(
    state: &mut GameState,
    mut movement: ArmyMovement,
    target_city: &City,
    report: &mut TurnReport,
) -> Option<ArmyMovement> {
    let attacker = state.officers[&movement.commander_id].clone();
    let defender_governor = target_city
        .governor_id
        .as_ref()
        .and_then(|id| state.officers.get(id));
    let attacker_bonuses = faction_technology_bonuses(state, &movement.issuer_faction_id);
    let defender_bonuses = faction_technology_bonuses(state, &target_city.faction_id);

    let base_attack_score = expedition_attack_score(state, &movement, target_city);
    let attack_percent = attacker_bonuses.attack_percent + attacker_bonuses.siege_attack_percent;
    let attack_score = apply_percent_bonus(base_attack_score, attack_percent);
    let base_defense_score = city_defense_score(target_city, defender_governor, movement.troops);
    let defense_score = apply_percent_bonus(base_defense_score, defender_bonuses.defense_percent);
    let total_score = attack_score.saturating_add(defense_score);

    if target_city.troops.is_empty() {
        capture_city_after_siege(state, &movement, target_city, report);
        return None;
    }
    if total_score == 0 {
        return_expedition_to_friendly_city(state, &movement, "攻守皆无战力".to_string(), report);
        return None;
    }

    let defender_loss = monthly_loss(
        target_city.troops.total(),
        DEFENDER_MONTHLY_LOSS_PERCENT,
        attack_score,
        total_score,
    );
    let attacker_loss = apply_loss_reduction(
        monthly_loss(
            movement.troops.total(),
            ATTACKER_MONTHLY_LOSS_PERCENT,
            defense_score,
            total_score,
        ),
        attacker_bonuses.battle_loss_reduction_percent,
    );

    let attacker_loss_pool = movement.troops.loss_pool(attacker_loss);
    let attacker_wounded = wounded_pool_from_loss_with_bonus(
        attacker_loss_pool,
        attacker_bonuses.retreat_survival_percent,
    );
    movement.troops.saturating_sub_pool(attacker_loss_pool);
    movement.wounded_troops.add_pool(attacker_wounded);
    reduce_assignments_by_loss(&mut movement.assignments, attacker_loss_pool);

    let defender_loss_pool = target_city.troops.loss_pool(defender_loss);
    let defender_wounded = wounded_pool_from_loss(defender_loss_pool);
    {
        let target = state.cities.get_mut(&movement.target_city_id).unwrap();
        target.troops.saturating_sub_pool(defender_loss_pool);
        target.wounded_troops.add_pool(defender_wounded);
        target.training = target.training.saturating_sub(1);
    }

    let defender_remaining = state.cities[&movement.target_city_id].troops.total();
    report.info(format!(
        "{} 围攻 {}：攻方损失 {}（伤兵 {}），守方损失 {}（伤兵 {}），守军剩余 {}，粮草 {}",
        attacker.name,
        target_city.name,
        attacker_loss_pool.total(),
        attacker_wounded.total(),
        defender_loss_pool.total(),
        defender_wounded.total(),
        defender_remaining,
        movement.food_supply
    ));
    record_battle_event(
        state,
        BattleEventDraft {
            severity: GameEventSeverity::Warning,
            attacker_faction_id: movement.issuer_faction_id.clone(),
            defender_faction_id: target_city.faction_id.clone(),
            target_city_id: movement.target_city_id.clone(),
            title: "围攻战报".to_string(),
            summary: format!(
                "{} 围攻 {}，守军剩余 {}",
                attacker.name, target_city.name, defender_remaining
            ),
            detail: format!(
                "本月攻方损失 {}、伤兵 {}；守方损失 {}、伤兵 {}；攻方粮草剩余 {}。",
                attacker_loss_pool.total(),
                attacker_wounded.total(),
                defender_loss_pool.total(),
                defender_wounded.total(),
                movement.food_supply
            ),
        },
    );

    if movement.troops.is_empty() {
        return_expedition_to_friendly_city(state, &movement, "攻方已无可战兵".to_string(), report);
        None
    } else if defender_remaining == 0 {
        let target = state.cities[&movement.target_city_id].clone();
        capture_city_after_siege(state, &movement, &target, report);
        None
    } else {
        Some(movement)
    }
}

fn expedition_attack_score(state: &GameState, movement: &ArmyMovement, target_city: &City) -> u32 {
    let mut score = 0u32;
    let assignments = if movement.assignments.is_empty() {
        vec![ExpeditionAssignment::commander(
            movement.commander_id.clone(),
            TroopKind::Infantry,
            movement.troops.total(),
        )]
    } else {
        movement.assignments.clone()
    };

    for assignment in assignments {
        if assignment.troops == 0 {
            continue;
        }
        let Some(officer) = state.officers.get(&assignment.officer_id) else {
            continue;
        };
        let troop_score = assignment.troops * (60 + u32::from(movement.training)) / 100;
        let matchup_score =
            troop_score * troop_matchup_percent(assignment.troop_kind, target_city.troops) / 100;
        let role_score = if assignment.role == ExpeditionRole::Commander {
            matchup_score * 110 / 100
                + u32::from(officer.stats.leadership) * 18
                + u32::from(officer.stats.strength) * 10
        } else {
            matchup_score
                + u32::from(officer.stats.leadership) * 12
                + u32::from(officer.stats.strength) * 6
        };
        score = score.saturating_add(role_score);
    }
    score
}

fn city_defense_score(city: &City, governor: Option<&Officer>, attacking_troops: TroopPool) -> u32 {
    let mut troop_score = 0u32;
    for kind in TroopKind::ALL {
        let count = city.troops.get(kind);
        let trained = count * (55 + u32::from(city.training)) / 100;
        troop_score = troop_score
            .saturating_add(trained * troop_matchup_percent(kind, attacking_troops) / 100);
    }
    let leadership = governor
        .map(|officer| u32::from(officer.stats.leadership))
        .unwrap_or(45);
    let strength = governor
        .map(|officer| u32::from(officer.stats.strength))
        .unwrap_or(45);
    troop_score
        + u32::from(city.defense) * 12
        + leadership * 15
        + strength * 6
        + u32::from(city.order) * 5
}

fn troop_matchup_percent(kind: TroopKind, opponent: TroopPool) -> u32 {
    let total = opponent.total();
    if total == 0 {
        return 100;
    }
    let advantaged = opponent.get(kind.counters()) * 20 / total;
    let countered = opponent.get(kind.countered_by()) * 20 / total;
    (100 + advantaged).saturating_sub(countered).clamp(75, 125)
}

fn monthly_loss(units: u32, loss_percent: u32, pressure_score: u32, total_score: u32) -> u32 {
    if units == 0 || pressure_score == 0 || total_score == 0 {
        return 0;
    }
    let loss = u64::from(units)
        .saturating_mul(u64::from(loss_percent))
        .saturating_mul(u64::from(pressure_score))
        / u64::from(total_score)
        / 100;
    (loss as u32).clamp(1, units)
}

fn apply_loss_reduction(loss: u32, reduction_percent: i32) -> u32 {
    if loss == 0 {
        return 0;
    }
    let reduction = reduction_percent.clamp(0, 95) as u32;
    loss.saturating_mul(100 - reduction).div_ceil(100).max(1)
}

fn wounded_pool_from_loss(loss_pool: TroopPool) -> TroopPool {
    wounded_pool_from_loss_with_bonus(loss_pool, 0)
}

fn wounded_pool_from_loss_with_bonus(loss_pool: TroopPool, bonus_percent: i32) -> TroopPool {
    let wounded_percent = (WOUNDED_PERCENT as i32 + bonus_percent).clamp(0, 95) as u32;
    let wounded_total = loss_pool
        .total()
        .saturating_mul(wounded_percent)
        .saturating_add(50)
        / 100;
    loss_pool.loss_pool(wounded_total)
}

fn reduce_assignments_by_loss(assignments: &mut [ExpeditionAssignment], loss_pool: TroopPool) {
    for kind in TroopKind::ALL {
        let kind_loss = loss_pool.get(kind);
        if kind_loss == 0 {
            continue;
        }
        let total_for_kind: u32 = assignments
            .iter()
            .filter(|assignment| assignment.troop_kind == kind)
            .map(|assignment| assignment.troops)
            .sum();
        if total_for_kind == 0 {
            continue;
        }

        let mut remaining = kind_loss;
        for assignment in assignments
            .iter_mut()
            .filter(|assignment| assignment.troop_kind == kind)
        {
            if remaining == 0 {
                break;
            }
            let share = u64::from(kind_loss).saturating_mul(u64::from(assignment.troops))
                / u64::from(total_for_kind);
            let removed = (share as u32).min(assignment.troops).min(remaining);
            assignment.troops -= removed;
            remaining -= removed;
        }

        while remaining > 0 {
            let Some(assignment) = assignments
                .iter_mut()
                .find(|assignment| assignment.troop_kind == kind && assignment.troops > 0)
            else {
                break;
            };
            assignment.troops -= 1;
            remaining -= 1;
        }
    }
}

fn place_movement_at_city(
    state: &mut GameState,
    movement: &ArmyMovement,
    city_id: &str,
    troops: TroopPool,
) {
    if let Some(city) = state.cities.get_mut(city_id) {
        city.troops.add_pool(troops);
    }
    place_movement_officers_at_city(state, movement, city_id);
}

fn place_wounded_at_city(state: &mut GameState, city_id: &str, wounded_troops: TroopPool) {
    if let Some(city) = state.cities.get_mut(city_id) {
        city.wounded_troops.add_pool(wounded_troops);
    }
}

fn apply_percent_bonus(value: u32, percent: i32) -> u32 {
    if percent >= 0 {
        value.saturating_add(value.saturating_mul(percent as u32) / 100)
    } else {
        value.saturating_sub(value.saturating_mul(percent.unsigned_abs()) / 100)
    }
}

fn place_movement_officers_at_city(state: &mut GameState, movement: &ArmyMovement, city_id: &str) {
    for officer_id in &movement.officer_ids {
        if let Some(officer) = state.officers.get_mut(officer_id)
            && officer.is_active()
        {
            officer.city_id = Some(city_id.to_string());
        }
    }
}

fn return_movement_to_friendly_city(
    state: &mut GameState,
    movement: &ArmyMovement,
    troops: TroopPool,
    reason: String,
    report: &mut TurnReport,
) {
    return_movement_to_friendly_city_with_wounded(
        state,
        movement,
        troops,
        TroopPool::default(),
        reason,
        report,
    );
}

fn return_expedition_to_friendly_city(
    state: &mut GameState,
    movement: &ArmyMovement,
    reason: String,
    report: &mut TurnReport,
) {
    return_movement_to_friendly_city_with_wounded(
        state,
        movement,
        movement.troops,
        movement.wounded_troops,
        reason,
        report,
    );
}

fn return_movement_to_friendly_city_with_wounded(
    state: &mut GameState,
    movement: &ArmyMovement,
    troops: TroopPool,
    wounded_troops: TroopPool,
    reason: String,
    report: &mut TurnReport,
) {
    let fallback_city_id = state
        .cities
        .get(&movement.source_city_id)
        .filter(|city| city.faction_id == movement.issuer_faction_id)
        .map(|city| city.id.clone())
        .or_else(|| {
            state
                .cities
                .values()
                .find(|city| city.faction_id == movement.issuer_faction_id)
                .map(|city| city.id.clone())
        });

    if let Some(city_id) = fallback_city_id {
        let city_name = city_name(state, &city_id);
        place_movement_at_city(state, movement, &city_id, troops);
        place_wounded_at_city(state, &city_id, wounded_troops);
        report.warning(format!(
            "{reason}，队伍退回 {city_name}，保全 {} 兵、{} 伤兵",
            troops.total(),
            wounded_troops.total()
        ));
    } else {
        for officer_id in &movement.officer_ids {
            if let Some(officer) = state.officers.get_mut(officer_id)
                && officer.is_active()
            {
                officer.faction_id = WILD_FACTION_ID.to_string();
                officer.city_id = None;
                officer.office_id = None;
                officer.status = OfficerStatus::Wild;
            }
        }
        report.warning(format!(
            "{reason}，无己方城池可退，{} 兵、{} 伤兵溃散",
            troops.total(),
            wounded_troops.total()
        ));
    }
}

fn capture_city_after_siege(
    state: &mut GameState,
    movement: &ArmyMovement,
    target_city: &City,
    report: &mut TurnReport,
) {
    let attacker = state.officers[&movement.commander_id].clone();
    let old_faction = target_city.faction_id.clone();
    let old_faction_name = faction_name(state, &old_faction);
    let attacker_faction_name = faction_name(state, &movement.issuer_faction_id);
    let defender_wounded = target_city.wounded_troops;
    {
        let target = state.cities.get_mut(&movement.target_city_id).unwrap();
        target.faction_id = movement.issuer_faction_id.clone();
        target.troops = movement.troops;
        target.wounded_troops = movement.wounded_troops;
        target.training = movement.training.saturating_div(2).max(20);
        target.governor_id = Some(movement.commander_id.clone());
        target.order = target.order.saturating_sub(12);
        target.clamp_fields();
    }
    place_movement_officers_at_city(state, movement, &movement.target_city_id);
    retreat_defenders(
        state,
        &movement.target_city_id,
        &old_faction,
        defender_wounded,
    );
    report.info(format!(
        "{} 攻下 {}，剩余兵力 {}，伤兵 {}",
        attacker.name,
        target_city.name,
        movement.troops.total(),
        movement.wounded_troops.total()
    ));
    record_battle_event(
        state,
        BattleEventDraft {
            severity: GameEventSeverity::Important,
            attacker_faction_id: movement.issuer_faction_id.clone(),
            defender_faction_id: old_faction.clone(),
            target_city_id: movement.target_city_id.clone(),
            title: "攻城胜利".to_string(),
            summary: format!(
                "{} 攻下 {}，剩余兵力 {}",
                attacker.name,
                target_city.name,
                movement.troops.total()
            ),
            detail: format!(
                "{attacker_faction_name} 自 {} 出征，击败 {old_faction_name}，夺取 {}；{} 伤兵入城。",
                city_name(state, &movement.source_city_id),
                target_city.name,
                movement.wounded_troops.total()
            ),
        },
    );
    record_game_event(
        state,
        GameEventDraft {
            kind: GameEventKind::CityCaptured,
            severity: GameEventSeverity::Critical,
            scope: GameEventScope::World,
            title: "城池易主".to_string(),
            summary: format!(
                "{} 由 {old_faction_name} 转归 {attacker_faction_name}",
                target_city.name
            ),
            detail: format!(
                "{} 被 {} 攻下，原属 {old_faction_name}，现属 {attacker_faction_name}，守城秩序下降。",
                target_city.name, attacker.name
            ),
            city_id: Some(movement.target_city_id.clone()),
            faction_id: Some(movement.issuer_faction_id.clone()),
            officer_id: Some(movement.commander_id.clone()),
            resolution: EventResolution::NoneRequired,
        },
    );
}

struct BattleEventDraft {
    severity: GameEventSeverity,
    attacker_faction_id: FactionId,
    defender_faction_id: FactionId,
    target_city_id: CityId,
    title: String,
    summary: String,
    detail: String,
}

fn record_battle_event(state: &mut GameState, draft: BattleEventDraft) {
    if draft.attacker_faction_id != state.player_faction_id
        && draft.defender_faction_id != state.player_faction_id
    {
        return;
    }
    let faction_id = if draft.attacker_faction_id == state.player_faction_id {
        draft.attacker_faction_id
    } else {
        draft.defender_faction_id
    };
    record_game_event(
        state,
        GameEventDraft {
            kind: GameEventKind::Battle,
            severity: draft.severity,
            scope: GameEventScope::Player,
            title: draft.title,
            summary: draft.summary,
            detail: draft.detail,
            city_id: Some(draft.target_city_id),
            faction_id: Some(faction_id),
            officer_id: None,
            resolution: EventResolution::NoneRequired,
        },
    );
}

fn city_name(state: &GameState, city_id: &str) -> String {
    state
        .cities
        .get(city_id)
        .map(|city| city.name.clone())
        .unwrap_or_else(|| city_id.to_string())
}

fn faction_name(state: &GameState, faction_id: &str) -> String {
    state
        .factions
        .get(faction_id)
        .map(|faction| faction.name.clone())
        .unwrap_or_else(|| faction_id.to_string())
}

fn resolve_diplomacy_orders(state: &mut GameState, report: &mut TurnReport) {
    let orders = std::mem::take(&mut state.pending_diplomacy);
    if orders.is_empty() {
        return;
    }

    let mut seen_targets = BTreeSet::new();
    let order_count = orders.len();
    let mut accepted = 0;
    let mut rejected = 0;
    for order in orders {
        let key = (
            order.issuer_faction_id.clone(),
            order.target_faction_id.clone(),
        );
        if !seen_targets.insert(key) {
            rejected += 1;
            report.warning(format!("外交被拒绝: {} (本月重复提案)", order.summary()));
            continue;
        }
        match validate_diplomacy_order_base(state, &order) {
            Ok(()) => {
                if apply_diplomacy_order(state, &order, report) {
                    accepted += 1;
                } else {
                    rejected += 1;
                }
            }
            Err(error) => {
                rejected += 1;
                report.warning(format!("外交被拒绝: {} ({error})", order.summary()));
            }
        }
    }
    report.info(format!(
        "本月处理外交提案 {order_count} 条，接受 {accepted} 条，拒绝 {rejected} 条"
    ));
}

fn apply_diplomacy_order(
    state: &mut GameState,
    order: &DiplomacyOrder,
    report: &mut TurnReport,
) -> bool {
    let issuer_name = faction_name(state, &order.issuer_faction_id);
    let target_name = faction_name(state, &order.target_faction_id);
    let acceptance_score = diplomacy_acceptance_score(state, order);
    let accepted = match order.kind {
        DiplomacyActionKind::ImproveRelations | DiplomacyActionKind::DeclareWar => true,
        DiplomacyActionKind::ResourceExchange => acceptance_score >= 0,
        DiplomacyActionKind::Truce => acceptance_score >= -40,
        DiplomacyActionKind::RequestPeace => acceptance_score >= -20,
        DiplomacyActionKind::PassageRight => acceptance_score >= 10,
    };

    if !accepted {
        if order.kind != DiplomacyActionKind::ResourceExchange {
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.score = (relation.score - 2).clamp(-100, 100);
        }
        report.warning(format!(
            "{target_name} 拒绝 {issuer_name} 的{}提案",
            order.kind.label()
        ));
        return false;
    }

    match order.kind {
        DiplomacyActionKind::DeclareWar => {
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.mark_hostile(&order.issuer_faction_id, &order.target_faction_id);
            report.info(format!("{issuer_name} 向 {target_name} 宣战"));
        }
        DiplomacyActionKind::ImproveRelations => {
            transfer_diplomacy_resources(state, order);
            let score_delta = 8 + order.offer.value() / 200;
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.score = (i32::from(relation.score) + score_delta).clamp(-100, 100) as i16;
            report.info(format!(
                "{issuer_name} 与 {target_name} 修好，关系提升 {score_delta}"
            ));
        }
        DiplomacyActionKind::ResourceExchange => {
            transfer_diplomacy_resources(state, order);
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.score = (relation.score + 1).clamp(-100, 100);
            report.info(format!("{issuer_name} 与 {target_name} 完成互市"));
        }
        DiplomacyActionKind::Truce => {
            transfer_diplomacy_resources(state, order);
            let turn = state.turn;
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.truce_until_turn = Some(turn + 6);
            relation.score = (relation.score + 5).clamp(-100, 100);
            report.info(format!("{issuer_name} 与 {target_name} 达成 6 个月停战"));
        }
        DiplomacyActionKind::RequestPeace => {
            transfer_diplomacy_resources(state, order);
            let turn = state.turn;
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation.truce_until_turn = Some(turn + 12);
            relation.score = relation.score.max(0);
            report.info(format!(
                "{issuer_name} 与 {target_name} 求和成功，停战 12 个月"
            ));
        }
        DiplomacyActionKind::PassageRight => {
            transfer_diplomacy_resources(state, order);
            let turn = state.turn;
            let relation = state.relation_mut(&order.issuer_faction_id, &order.target_faction_id);
            relation
                .passage_rights
                .insert(order.issuer_faction_id.clone(), turn + 12);
            relation.score = (relation.score + 3).clamp(-100, 100);
            report.info(format!("{target_name} 准许 {issuer_name} 借道 12 个月"));
        }
    }
    true
}

fn transfer_diplomacy_resources(state: &mut GameState, order: &DiplomacyOrder) {
    if !order.offer.is_empty() {
        deduct_city_bundle(state, &order.source_city_id, &order.offer);
        if let Some(target_city_id) =
            diplomacy_receiving_city_for_faction(state, &order.target_faction_id)
        {
            add_city_bundle(state, &target_city_id, &order.offer);
        }
    }
    if !order.request.is_empty() {
        deduct_faction_bundle(state, &order.target_faction_id, &order.request);
        add_city_bundle(state, &order.receive_city_id, &order.request);
    }
}

fn diplomacy_receiving_city_for_faction(state: &GameState, faction_id: &str) -> Option<CityId> {
    state
        .factions
        .get(faction_id)
        .and_then(|faction| state.officers.get(&faction.ruler_id))
        .and_then(|ruler| ruler.city_id.as_deref())
        .and_then(|city_id| state.cities.get(city_id))
        .filter(|city| city.faction_id == faction_id)
        .map(|city| city.id.clone())
        .or_else(|| {
            state
                .cities
                .values()
                .find(|city| city.faction_id == faction_id)
                .map(|city| city.id.clone())
        })
}

fn deduct_city_bundle(state: &mut GameState, city_id: &str, bundle: &ResourceBundle) {
    let Some(city) = state.cities.get_mut(city_id) else {
        return;
    };
    city.gold -= bundle.gold;
    city.food -= bundle.food;
    city.materials -= bundle.materials;
}

fn add_city_bundle(state: &mut GameState, city_id: &str, bundle: &ResourceBundle) {
    let Some(city) = state.cities.get_mut(city_id) else {
        return;
    };
    city.gold += bundle.gold;
    city.food += bundle.food;
    city.materials += bundle.materials;
}

fn deduct_faction_bundle(state: &mut GameState, faction_id: &str, bundle: &ResourceBundle) {
    deduct_faction_resource(state, faction_id, DiplomacyResource::Gold, bundle.gold);
    deduct_faction_resource(state, faction_id, DiplomacyResource::Food, bundle.food);
    deduct_faction_resource(
        state,
        faction_id,
        DiplomacyResource::Materials,
        bundle.materials,
    );
}

#[derive(Clone, Copy)]
enum DiplomacyResource {
    Gold,
    Food,
    Materials,
}

fn faction_resource_total(state: &GameState, faction_id: &str, resource: DiplomacyResource) -> i32 {
    state
        .cities
        .values()
        .filter(|city| city.faction_id == faction_id)
        .map(|city| city_resource(city, resource).max(0))
        .sum()
}

fn deduct_faction_resource(
    state: &mut GameState,
    faction_id: &str,
    resource: DiplomacyResource,
    mut amount: i32,
) {
    if amount <= 0 {
        return;
    }
    let mut city_ids: Vec<_> = state
        .cities
        .values()
        .filter(|city| city.faction_id == faction_id && city_resource(city, resource) > 0)
        .map(|city| (city.id.clone(), city_resource(city, resource)))
        .collect();
    city_ids.sort_by(|(left_id, left_amount), (right_id, right_amount)| {
        right_amount
            .cmp(left_amount)
            .then_with(|| left_id.cmp(right_id))
    });
    for (city_id, _) in city_ids {
        if amount <= 0 {
            break;
        }
        let Some(city) = state.cities.get_mut(&city_id) else {
            continue;
        };
        let paid = city_resource(city, resource).min(amount);
        set_city_resource(city, resource, city_resource(city, resource) - paid);
        amount -= paid;
    }
}

fn city_resource(city: &City, resource: DiplomacyResource) -> i32 {
    match resource {
        DiplomacyResource::Gold => city.gold,
        DiplomacyResource::Food => city.food,
        DiplomacyResource::Materials => city.materials,
    }
}

fn set_city_resource(city: &mut City, resource: DiplomacyResource, amount: i32) {
    match resource {
        DiplomacyResource::Gold => city.gold = amount,
        DiplomacyResource::Food => city.food = amount,
        DiplomacyResource::Materials => city.materials = amount,
    }
}

fn apply_diplomacy(
    state: &mut GameState,
    command: &Command,
    target_faction_id: &str,
    proposal: &DiplomacyProposal,
    report: &mut TurnReport,
) {
    let officer = state
        .officers
        .get(command.officer_id.as_ref().unwrap())
        .unwrap();
    let officer_name = officer.name.clone();
    let score_delta =
        8 + (i16::from(officer.stats.politics) + i16::from(officer.stats.intelligence)) / 18;
    let turn = state.turn;
    let relation = state.relation_mut(&command.issuer_faction_id, target_faction_id);
    match proposal {
        DiplomacyProposal::ImproveRelations => {
            relation.score = (relation.score + score_delta).clamp(-100, 100);
            report.info(format!("{officer_name} 改善外交，关系提升 {score_delta}"));
        }
        DiplomacyProposal::Truce => {
            if relation.score >= -40 {
                relation.truce_until_turn = Some(turn + 6);
                relation.score = (relation.score + 5).clamp(-100, 100);
                report.info(format!("{officer_name} 达成 6 个月停战"));
            } else {
                relation.score = (relation.score + 3).clamp(-100, 100);
                report.warning(format!("{officer_name} 提议停战失败"));
            }
        }
        DiplomacyProposal::DeclareWar => {
            relation.mark_hostile(&command.issuer_faction_id, target_faction_id);
            report.info(format!("{officer_name} 宣战"));
        }
    }
}

fn retreat_defenders(
    state: &mut GameState,
    captured_city_id: &str,
    old_faction_id: &str,
    wounded_troops: TroopPool,
) {
    let fallback_city = state
        .cities
        .values()
        .find(|city| city.faction_id == old_faction_id && city.id != captured_city_id)
        .map(|city| city.id.clone());
    if let Some(city_id) = &fallback_city
        && let Some(city) = state.cities.get_mut(city_id)
    {
        city.wounded_troops.add_pool(wounded_troops);
    }
    for officer in state.officers.values_mut() {
        if officer.faction_id == old_faction_id
            && officer.city_id.as_deref() == Some(captured_city_id)
        {
            officer.city_id = fallback_city.clone();
        }
    }
}

pub fn officer_monthly_salary(officer: &Officer) -> i32 {
    let mut salary = officer_base_monthly_salary(officer);
    if let Some(spec) = officer.office_id.as_deref().and_then(official_post_spec) {
        salary += official_rank_salary_bonus(spec.rank);
    }
    salary
}

pub fn officer_base_monthly_salary(officer: &Officer) -> i32 {
    let stats = officer.stats;
    10 + (i32::from(stats.leadership)
        + i32::from(stats.strength)
        + i32::from(stats.intelligence)
        + i32::from(stats.politics)
        + i32::from(stats.charm))
        / 50
}

pub fn city_official_effects(state: &GameState, city_id: &str) -> CityEconomyEffects {
    let Some(city) = state.cities.get(city_id) else {
        return CityEconomyEffects::default();
    };
    let mut effects = CityEconomyEffects::default();
    for officer in state.officers.values().filter(|officer| {
        officer.is_active()
            && officer.city_id.as_deref() == Some(city_id)
            && officer.faction_id == city.faction_id
    }) {
        let Some(spec) = officer.office_id.as_deref().and_then(official_post_spec) else {
            continue;
        };
        effects.add(official_effect_to_city_effect(spec.effect));
    }
    effects
}

pub fn city_combined_effects(state: &GameState, city_id: &str) -> CityEconomyEffects {
    let mut effects = city_official_effects(state, city_id);
    if let Some(city) = state.cities.get(city_id) {
        effects.add(faction_technology_city_effects(state, &city.faction_id));
    }
    effects
}

fn official_effect_to_city_effect(effect: OfficialPostEffect) -> CityEconomyEffects {
    CityEconomyEffects {
        gold_income: effect.gold_income,
        food_income: effect.food_income,
        materials_income: effect.materials_income,
        gold_percent: effect.gold_percent,
        food_percent: effect.food_percent,
        materials_percent: effect.materials_percent,
        population_growth: effect.population_growth,
        troop_recovery: effect.troop_recovery,
        order: effect.order,
        training: effect.training,
        defense: effect.defense,
        ..CityEconomyEffects::default()
    }
}

fn apply_monthly_income(state: &mut GameState, report: &mut TurnReport) {
    let player_faction_id = state.player_faction_id.clone();
    let besieged_city_ids: BTreeSet<CityId> = state
        .army_movements
        .iter()
        .filter(|movement| {
            movement.kind == ArmyMovementKind::Expedition && movement.arrival_turn <= state.turn
        })
        .map(|movement| movement.target_city_id.clone())
        .collect();
    let salaries = city_salary_totals(state);
    let official_effects = city_official_effect_totals(state);
    let technology_effects = city_technology_effect_totals(state);
    let mut total_gold_delta = 0;
    let mut total_food_delta = 0;
    let mut total_materials_delta = 0;
    let mut total_population_delta = 0;
    let mut total_troop_delta = 0;
    let mut total_wounded_recovered = 0;
    let mut total_salary = 0;
    let mut player_gold_delta = 0;
    let mut player_food_delta = 0;
    let mut player_materials_delta = 0;
    let mut player_population_delta = 0;
    let mut player_troop_delta = 0;
    let mut player_wounded_recovered = 0;
    let mut player_salary = 0;
    let mut player_city_count = 0;

    for city in state.cities.values_mut() {
        let salary = salaries.get(&city.id).copied().unwrap_or_default();
        let mut extra_effects = official_effects.get(&city.id).copied().unwrap_or_default();
        extra_effects.add(
            technology_effects
                .get(&city.id)
                .copied()
                .unwrap_or_default(),
        );
        let projection = project_city_monthly_change_with_effects(city, salary, extra_effects);
        let besieged = besieged_city_ids.contains(&city.id);
        let troop_delta = if besieged { 0 } else { projection.troop_delta };
        city.gold += projection.net_gold;
        city.food += projection.net_food;
        city.materials += projection.net_materials;
        city.population = apply_i32_to_u32(city.population, projection.population_delta);
        apply_i32_to_troop_pool(&mut city.troops, troop_delta);
        let wounded_recovered = if besieged {
            0
        } else {
            recover_wounded_troops(city, projection.wounded_recovery as u32)
        };
        city.order = apply_i32_to_u8(city.order, projection.order_delta, 0, 100);
        city.training = apply_i32_to_u8(city.training, projection.training_delta, 0, 100);
        city.defense = apply_i32_to_u16(city.defense, projection.defense_delta, 0, 999);
        city.clamp_fields();

        total_gold_delta += projection.net_gold;
        total_food_delta += projection.net_food;
        total_materials_delta += projection.net_materials;
        total_population_delta += projection.population_delta;
        total_troop_delta += troop_delta + wounded_recovered as i32;
        total_wounded_recovered += wounded_recovered;
        total_salary += salary;
        if city.faction_id == player_faction_id {
            player_city_count += 1;
            player_gold_delta += projection.net_gold;
            player_food_delta += projection.net_food;
            player_materials_delta += projection.net_materials;
            player_population_delta += projection.population_delta;
            player_troop_delta += troop_delta + wounded_recovered as i32;
            player_wounded_recovered += wounded_recovered;
            player_salary += salary;
        }
    }
    report.info(format!(
        "各城完成月度经济结算：全图金 {total_gold_delta:+}、粮 {total_food_delta:+}、建材 {total_materials_delta:+}、人口 {total_population_delta:+}、兵 {total_troop_delta:+}、伤兵恢复 {total_wounded_recovered}、俸禄 -{total_salary}；玩家 {player_city_count} 城金 {player_gold_delta:+}、粮 {player_food_delta:+}、建材 {player_materials_delta:+}、人口 {player_population_delta:+}、兵 {player_troop_delta:+}、伤兵恢复 {player_wounded_recovered}、俸禄 -{player_salary}"
    ));
}

fn city_salary_totals(state: &GameState) -> BTreeMap<CityId, i32> {
    let mut salaries = BTreeMap::new();
    for officer in state
        .officers
        .values()
        .filter(|officer| officer.is_active())
    {
        let Some(city_id) = &officer.city_id else {
            continue;
        };
        let Some(city) = state.cities.get(city_id) else {
            continue;
        };
        if city.faction_id != officer.faction_id {
            continue;
        }
        *salaries.entry(city_id.clone()).or_insert(0) += officer_monthly_salary(officer);
    }
    salaries
}

fn city_official_effect_totals(state: &GameState) -> BTreeMap<CityId, CityEconomyEffects> {
    let mut effects_by_city = BTreeMap::new();
    for officer in state
        .officers
        .values()
        .filter(|officer| officer.is_active())
    {
        let Some(city_id) = &officer.city_id else {
            continue;
        };
        let Some(city) = state.cities.get(city_id) else {
            continue;
        };
        if city.faction_id != officer.faction_id {
            continue;
        }
        let Some(spec) = officer.office_id.as_deref().and_then(official_post_spec) else {
            continue;
        };
        effects_by_city
            .entry(city_id.clone())
            .or_insert_with(CityEconomyEffects::default)
            .add(official_effect_to_city_effect(spec.effect));
    }
    effects_by_city
}

fn city_technology_effect_totals(state: &GameState) -> BTreeMap<CityId, CityEconomyEffects> {
    state
        .cities
        .values()
        .map(|city| {
            (
                city.id.clone(),
                faction_technology_city_effects(state, &city.faction_id),
            )
        })
        .collect()
}

fn apply_i32_to_u32(value: u32, delta: i32) -> u32 {
    if delta >= 0 {
        value.saturating_add(delta as u32)
    } else {
        value.saturating_sub(delta.unsigned_abs())
    }
}

fn apply_i32_to_troop_pool(troops: &mut TroopPool, delta: i32) {
    if delta >= 0 {
        troops.add_total_preserving_ratio(delta as u32);
    } else {
        *troops = troops.surviving_after_loss(delta.unsigned_abs());
    }
}

fn recover_wounded_troops(city: &mut City, amount: u32) -> u32 {
    if amount == 0 || city.wounded_troops.is_empty() {
        return 0;
    }
    let recovered = city
        .wounded_troops
        .loss_pool(amount.min(city.wounded_troops.total()));
    city.wounded_troops.saturating_sub_pool(recovered);
    city.troops.add_pool(recovered);
    recovered.total()
}

fn apply_i32_to_u8(value: u8, delta: i32, min: u8, max: u8) -> u8 {
    (i32::from(value) + delta).clamp(i32::from(min), i32::from(max)) as u8
}

fn apply_i32_to_u16(value: u16, delta: i32, min: u16, max: u16) -> u16 {
    (i32::from(value) + delta).clamp(i32::from(min), i32::from(max)) as u16
}

fn append_turn_summary(state: &GameState, report: &mut TurnReport) {
    let mut player_city_count = 0;
    let mut player_troops = 0;
    let mut player_wounded = 0;
    let mut player_gold = 0;
    let mut player_food = 0;
    let mut player_materials = 0;

    for city in state
        .cities
        .values()
        .filter(|city| city.faction_id == state.player_faction_id)
    {
        player_city_count += 1;
        player_troops += city.troops.total();
        player_wounded += city.wounded_troops.total();
        player_gold += city.gold;
        player_food += city.food;
        player_materials += city.materials;
    }

    let alive_factions = state
        .factions
        .keys()
        .filter(|faction_id| state.faction_alive(faction_id))
        .count();

    report.info(format!(
        "进入 {}年{}月，存续势力 {} 个；玩家控制 {} 城，兵力 {}，伤兵 {}，金 {}，粮 {}，建材 {}",
        state.year,
        state.month,
        alive_factions,
        player_city_count,
        player_troops,
        player_wounded,
        player_gold,
        player_food,
        player_materials
    ));

    match &state.status {
        GameStatus::Running => {}
        GameStatus::Victory { reason } => report.info(format!("胜利：{reason}")),
        GameStatus::Defeat { reason } => report.warning(format!("失败：{reason}")),
    }
}

fn alive_faction_ids(state: &GameState) -> BTreeSet<FactionId> {
    state
        .factions
        .keys()
        .filter(|faction_id| state.faction_alive(faction_id))
        .cloned()
        .collect()
}

fn record_destroyed_factions(state: &mut GameState, alive_before: &BTreeSet<FactionId>) {
    for faction_id in alive_before {
        if state.faction_alive(faction_id) {
            continue;
        }
        let already_recorded = state.events.iter().any(|event| {
            event.kind == GameEventKind::FactionDestroyed
                && event.faction_id.as_deref() == Some(faction_id.as_str())
        });
        if already_recorded {
            continue;
        }
        let faction_name = faction_name(state, faction_id);
        record_game_event(
            state,
            GameEventDraft {
                kind: GameEventKind::FactionDestroyed,
                severity: GameEventSeverity::Critical,
                scope: GameEventScope::World,
                title: "势力覆灭".to_string(),
                summary: format!("{faction_name} 失去全部城池"),
                detail: format!("{faction_name} 已失去全部城池，退出当前争霸局势。"),
                city_id: None,
                faction_id: Some(faction_id.clone()),
                officer_id: None,
                resolution: EventResolution::NoneRequired,
            },
        );
    }
}

fn record_status_change(state: &mut GameState, previous_status: &GameStatus) {
    if previous_status != &GameStatus::Running || state.status == GameStatus::Running {
        return;
    }
    let (title, severity, summary, detail) = match &state.status {
        GameStatus::Victory { reason } => (
            "胜利",
            GameEventSeverity::Critical,
            format!("胜利：{reason}"),
            format!("玩家势力达成胜利条件：{reason}。"),
        ),
        GameStatus::Defeat { reason } => (
            "失败",
            GameEventSeverity::Critical,
            format!("失败：{reason}"),
            format!("玩家势力触发失败条件：{reason}。"),
        ),
        GameStatus::Running => return,
    };
    record_game_event(
        state,
        GameEventDraft {
            kind: GameEventKind::GameStatus,
            severity,
            scope: GameEventScope::Player,
            title: title.to_string(),
            summary,
            detail,
            city_id: None,
            faction_id: Some(state.player_faction_id.clone()),
            officer_id: None,
            resolution: EventResolution::NoneRequired,
        },
    );
}

fn deterministic_index(state: &GameState, turn: u32, key: &str, salt: &str, len: usize) -> usize {
    deterministic_index_seed(&format!("{}:{turn}", state.scenario_id), key, salt, len)
}

fn deterministic_percent(state: &GameState, turn: u32, key: &str, salt: &str) -> u32 {
    deterministic_percent_seed(&format!("{}:{turn}", state.scenario_id), key, salt)
}

fn advance_officer_recruitments(state: &mut GameState, report: &mut TurnReport) {
    let tasks = std::mem::take(&mut state.officer_recruitments);
    let mut pending = Vec::new();

    for mut task in tasks {
        let Some(recruiter) = state.officers.get(&task.recruiter_officer_id).cloned() else {
            report.warning(format!("登用任务 {} 因执行武将不存在而取消", task.id));
            continue;
        };
        let Some(target) = state.officers.get(&task.target_officer_id).cloned() else {
            report.warning(format!("登用任务 {} 因目标武将不存在而取消", task.id));
            continue;
        };
        if !recruiter.is_active() || recruiter.faction_id != task.issuer_faction_id {
            report.warning(format!("{} 无法继续执行登用任务", recruiter.name));
            continue;
        }
        if target.status != OfficerStatus::Wild || target.faction_id != WILD_FACTION_ID {
            report.info(format!("{} 已不在野，登用任务结束", target.name));
            continue;
        }

        task.attempt_months += 1;
        let gain = recruitment_progress_gain(state, &task.source_city_id, &recruiter, &target);
        task.progress = task
            .progress
            .saturating_add(gain)
            .min(OFFICER_RECRUITMENT_SUCCESS_PROGRESS);

        if task.progress >= OFFICER_RECRUITMENT_SUCCESS_PROGRESS {
            complete_officer_recruitment(state, &task, &recruiter, &target, report);
            continue;
        }

        if task.attempt_months >= 2
            && deterministic_percent(
                state,
                state.turn,
                &task.target_officer_id,
                &format!("recruitment-refusal-{}", task.id),
            ) < recruitment_refusal_chance(&recruiter, &target, task.attempt_months)
        {
            report.warning(format!("{} 拒绝了 {} 的登用", target.name, recruiter.name));
            record_recruitment_event(
                state,
                GameEventSeverity::Warning,
                format!("{} 拒绝登用", target.name),
                format!("{} 拒绝了 {} 的登用，仍在野。", target.name, recruiter.name),
                &task,
                Some(task.target_officer_id.clone()),
            );
            continue;
        }

        report.info(format!(
            "{} 继续登用 {}，进度 {}%",
            recruiter.name, target.name, task.progress
        ));
        pending.push(task);
    }

    state.officer_recruitments = pending;
}

fn complete_officer_recruitment(
    state: &mut GameState,
    task: &OfficerRecruitmentTask,
    recruiter: &Officer,
    target: &Officer,
    report: &mut TurnReport,
) {
    let loyalty = (70 + recruiter.stats.charm / 4).clamp(70, 95);
    if let Some(target) = state.officers.get_mut(&task.target_officer_id) {
        target.faction_id = task.issuer_faction_id.clone();
        target.city_id = Some(task.source_city_id.clone());
        target.status = OfficerStatus::Active;
        target.loyalty = loyalty;
    }
    report.info(format!("{} 登用 {} 成功", recruiter.name, target.name));
    record_recruitment_event(
        state,
        GameEventSeverity::Important,
        format!("{} 加入麾下", target.name),
        format!(
            "{} 说服 {} 加入麾下，{} 现驻于 {}。",
            recruiter.name,
            target.name,
            target.name,
            city_name(state, &task.source_city_id)
        ),
        task,
        Some(task.target_officer_id.clone()),
    );
}

fn recruitment_progress_gain(
    state: &GameState,
    source_city_id: &str,
    recruiter: &Officer,
    target: &Officer,
) -> u8 {
    let ability = (u16::from(recruiter.stats.charm) + u16::from(recruiter.stats.politics)) / 2;
    let target_resistance = u16::from(target.stats.charm) / 6;
    let distance_penalty = target
        .city_id
        .as_deref()
        .and_then(|target_city_id| state.road_distance_li(source_city_id, target_city_id))
        .map(|distance| (distance / 250).min(8) as u16)
        .unwrap_or(10);
    (18 + ability / 6)
        .saturating_sub(target_resistance + distance_penalty)
        .clamp(8, 45) as u8
}

fn recruitment_refusal_chance(recruiter: &Officer, target: &Officer, attempt_months: u32) -> u32 {
    let resistance = u32::from(target.stats.charm / 12);
    let persuasion = u32::from((recruiter.stats.charm + recruiter.stats.politics) / 30);
    (4 + attempt_months.saturating_sub(1) * 2 + resistance)
        .saturating_sub(persuasion)
        .clamp(2, 22)
}

fn record_recruitment_event(
    state: &mut GameState,
    severity: GameEventSeverity,
    summary: String,
    detail: String,
    task: &OfficerRecruitmentTask,
    officer_id: Option<OfficerId>,
) {
    let scope = if task.issuer_faction_id == state.player_faction_id {
        GameEventScope::Player
    } else {
        GameEventScope::World
    };
    record_game_event(
        state,
        GameEventDraft {
            kind: GameEventKind::OfficerLifecycle,
            severity,
            scope,
            title: "武将登用".to_string(),
            summary,
            detail,
            city_id: Some(task.source_city_id.clone()),
            faction_id: Some(task.issuer_faction_id.clone()),
            officer_id,
            resolution: EventResolution::NoneRequired,
        },
    );
}

fn move_wild_officers(state: &mut GameState, report: &mut TurnReport) {
    let recruited_targets = state
        .officer_recruitments
        .iter()
        .map(|task| task.target_officer_id.as_str())
        .collect::<BTreeSet<_>>();
    let ids = state
        .officers
        .values()
        .filter(|officer| {
            officer.status == OfficerStatus::Wild
                && officer.faction_id == WILD_FACTION_ID
                && officer.is_adult_at(state.year)
                && !recruited_targets.contains(officer.id.as_str())
        })
        .map(|officer| officer.id.clone())
        .collect::<Vec<_>>();

    for officer_id in ids {
        let Some(target_city_id) = next_wild_officer_city(state, &officer_id) else {
            continue;
        };
        let current_city_id = state
            .officers
            .get(&officer_id)
            .and_then(|officer| officer.city_id.clone());
        if current_city_id.as_deref() == Some(target_city_id.as_str()) {
            continue;
        }
        let old_city = current_city_id
            .as_deref()
            .map(|city_id| city_name(state, city_id))
            .unwrap_or_else(|| "野外".to_string());
        let new_city = city_name(state, &target_city_id);
        let Some(officer) = state.officers.get_mut(&officer_id) else {
            continue;
        };
        officer.city_id = Some(target_city_id);
        report.info(format!(
            "在野武将 {} 从 {} 移动到 {}",
            officer.name, old_city, new_city
        ));
    }
}

fn next_wild_officer_city(state: &GameState, officer_id: &str) -> Option<CityId> {
    let officer = state.officers.get(officer_id)?;
    if officer.city_id.is_none() {
        return deterministic_city_id(state, officer_id, "wild-placement");
    }
    if deterministic_percent(state, state.turn, officer_id, "wild-move")
        >= WILD_OFFICER_MOVE_CHANCE_PERCENT
    {
        return officer.city_id.clone();
    }
    let city_id = officer.city_id.as_deref()?;
    let mut neighbors = state
        .roads
        .iter()
        .filter_map(|road| {
            if road.from == city_id && state.cities.contains_key(&road.to) {
                Some(road.to.clone())
            } else if road.to == city_id && state.cities.contains_key(&road.from) {
                Some(road.from.clone())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    neighbors.sort();
    neighbors.dedup();
    if neighbors.is_empty() {
        return officer.city_id.clone();
    }
    let index = deterministic_index(
        state,
        state.turn,
        officer_id,
        "wild-neighbor",
        neighbors.len(),
    );
    neighbors.get(index).cloned()
}

fn deterministic_city_id(state: &GameState, key: &str, salt: &str) -> Option<CityId> {
    if state.cities.is_empty() {
        return None;
    }
    let index = deterministic_index(state, state.turn, key, salt, state.cities.len());
    state.cities.keys().nth(index).cloned()
}

fn apply_due_life_events(
    state: &mut GameState,
    catalog: &dyn HistoricalCatalog,
    report: &mut TurnReport,
) {
    let Ok(events) = catalog.life_events_until(state.year, state.month) else {
        report.warning("读取武将履历事件失败");
        return;
    };

    for event in events {
        if state.applied_event_ids.contains(&event.id) {
            continue;
        }
        let officer_profile = match catalog.officer_profile(&event.officer_id) {
            Ok(profile) => profile,
            Err(_) => {
                report.warning(format!("读取武将 {} 资料失败", event.officer_id));
                continue;
            }
        };
        let officer_name = officer_profile
            .as_ref()
            .map(|profile| profile.name.clone())
            .unwrap_or_else(|| event.officer_id.clone());

        match event.kind {
            LifeEventKind::Appear | LifeEventKind::ServeFaction | LifeEventKind::MoveToCity => {
                let previous_faction_id = state
                    .officers
                    .get(&event.officer_id)
                    .map(|officer| officer.faction_id.clone());
                let (target_faction_id, city_id, status) = resolve_life_event_assignment(
                    state,
                    &event.officer_id,
                    &event.id,
                    event.faction_id.as_deref(),
                    event.city_id.as_deref(),
                );
                let requested_player_scope = event.faction_id.as_deref()
                    == Some(state.player_faction_id.as_str())
                    || event.city_id.as_deref().is_some_and(|city_id| {
                        state
                            .cities
                            .get(city_id)
                            .is_some_and(|city| city.faction_id == state.player_faction_id)
                    });
                let visible_to_player = previous_faction_id.as_deref()
                    == Some(state.player_faction_id.as_str())
                    || target_faction_id == state.player_faction_id
                    || requested_player_scope;
                let stats = officer_profile
                    .as_ref()
                    .map(|profile| profile.stats)
                    .unwrap_or(OfficerStats {
                        leadership: 50,
                        strength: 50,
                        intelligence: 50,
                        politics: 50,
                        charm: 50,
                    });

                state
                    .officers
                    .entry(event.officer_id.clone())
                    .and_modify(|officer| {
                        officer.faction_id = target_faction_id.clone();
                        officer.city_id = city_id.clone();
                        officer.status = status.clone();
                        officer.birth_year = officer_profile
                            .as_ref()
                            .and_then(|profile| profile.birth_year)
                            .unwrap_or(event.year - 18);
                        if let Some(loyalty) = event.loyalty {
                            officer.loyalty = loyalty;
                        }
                        officer.gender = officer_profile
                            .as_ref()
                            .map(|profile| profile.gender.clone())
                            .unwrap_or_default();
                        officer.profile = officer_profile.clone();
                    })
                    .or_insert(Officer {
                        id: event.officer_id.clone(),
                        name: officer_name.clone(),
                        faction_id: target_faction_id.clone(),
                        city_id: city_id.clone(),
                        office_id: None,
                        stats,
                        loyalty: event.loyalty.unwrap_or(75),
                        birth_year: officer_profile
                            .as_ref()
                            .and_then(|profile| profile.birth_year)
                            .unwrap_or(event.year - 18),
                        gender: officer_profile
                            .as_ref()
                            .map(|profile| profile.gender.clone())
                            .unwrap_or_default(),
                        status: status.clone(),
                        profile: officer_profile.clone(),
                    });

                report.info(format!(
                    "{} 于 {}年{}月进入局势",
                    officer_name, event.year, event.month
                ));
                if visible_to_player {
                    let location = city_id
                        .as_deref()
                        .map(|id| city_name(state, id))
                        .unwrap_or_else(|| "野外".to_string());
                    record_game_event(
                        state,
                        GameEventDraft {
                            kind: GameEventKind::HistoricalLife,
                            severity: GameEventSeverity::Info,
                            scope: GameEventScope::Player,
                            title: "武将履历".to_string(),
                            summary: format!("{officer_name} 进入局势"),
                            detail: format!(
                                "{officer_name} 于 {}年{}月进入局势，当前在 {location}。",
                                event.year, event.month
                            ),
                            city_id,
                            faction_id: Some(target_faction_id),
                            officer_id: Some(event.officer_id.clone()),
                            resolution: EventResolution::NoneRequired,
                        },
                    );
                }
            }
            LifeEventKind::BecomeUnavailable => {
                if let Some(officer) = state.officers.get_mut(&event.officer_id) {
                    let visible_to_player = officer.faction_id == state.player_faction_id;
                    let officer_faction_id = officer.faction_id.clone();
                    let old_city_id = officer.city_id.clone();
                    let officer_name = officer.name.clone();
                    officer.city_id = None;
                    officer.office_id = None;
                    officer.status = OfficerStatus::Unavailable;
                    for city in state.cities.values_mut() {
                        if city.governor_id.as_deref() == Some(&event.officer_id) {
                            city.governor_id = None;
                        }
                    }
                    report.info(format!("{} 离开当前局势", officer.name));
                    if visible_to_player {
                        record_game_event(
                            state,
                            GameEventDraft {
                                kind: GameEventKind::HistoricalLife,
                                severity: GameEventSeverity::Warning,
                                scope: GameEventScope::Player,
                                title: "武将履历".to_string(),
                                summary: format!("{officer_name} 离开当前局势"),
                                detail: format!("{officer_name} 于履历事件中离开当前局势。"),
                                city_id: old_city_id,
                                faction_id: Some(officer_faction_id),
                                officer_id: Some(event.officer_id.clone()),
                                resolution: EventResolution::NoneRequired,
                            },
                        );
                    }
                }
            }
            LifeEventKind::Die => {
                if state.officers.contains_key(&event.officer_id) {
                    report.info(format!(
                        "{} 的历史卒年已记录为资料，不再强制离场",
                        officer_name
                    ));
                }
            }
        }

        state.applied_event_ids.insert(event.id);
    }
}

pub fn resolve_life_event_assignment(
    state: &GameState,
    officer_id: &str,
    _event_id: &str,
    requested_faction_id: Option<&str>,
    requested_city_id: Option<&str>,
) -> (String, Option<String>, OfficerStatus) {
    let target_faction_id = requested_faction_id
        .map(str::to_string)
        .or_else(|| {
            requested_city_id
                .and_then(|city_id| state.cities.get(city_id))
                .map(|city| city.faction_id.clone())
        })
        .unwrap_or_else(|| WILD_FACTION_ID.to_string());

    if target_faction_id == WILD_FACTION_ID || !state.faction_alive(&target_faction_id) {
        return (
            WILD_FACTION_ID.to_string(),
            requested_city_id
                .and_then(|city_id| state.cities.get(city_id))
                .map(|city| city.id.clone())
                .or_else(|| deterministic_city_id(state, officer_id, "life-event-wild")),
            OfficerStatus::Wild,
        );
    }

    let city_id = requested_city_id
        .and_then(|city_id| state.cities.get(city_id))
        .filter(|city| city.faction_id == target_faction_id)
        .map(|city| city.id.clone())
        .or_else(|| {
            state
                .cities
                .values()
                .find(|city| city.faction_id == target_faction_id)
                .map(|city| city.id.clone())
        });

    match city_id {
        Some(city_id) => (target_faction_id, Some(city_id), OfficerStatus::Active),
        None => (
            WILD_FACTION_ID.to_string(),
            deterministic_city_id(state, officer_id, "life-event-wild"),
            OfficerStatus::Wild,
        ),
    }
}

pub fn recruit_cost(amount: u32) -> ResourceCost {
    recruit_cost_for_kind(TroopKind::Infantry, amount)
}

pub fn recruit_cost_for_kind(kind: TroopKind, amount: u32) -> ResourceCost {
    let multiplier = match kind {
        TroopKind::Infantry => 100,
        TroopKind::Archers => 120,
        TroopKind::Cavalry => 150,
    };
    ResourceCost {
        gold: (((amount / 10) as i32 + 30) * multiplier) / 100,
        food: (((amount / 4) as i32 + 80) * multiplier) / 100,
        materials: 0,
    }
}

pub fn recruit_cost_for_faction(state: &GameState, faction_id: &str, amount: u32) -> ResourceCost {
    recruit_cost_for_faction_kind(state, faction_id, TroopKind::Infantry, amount)
}

pub fn recruit_cost_for_faction_kind(
    state: &GameState,
    faction_id: &str,
    kind: TroopKind,
    amount: u32,
) -> ResourceCost {
    let mut cost = recruit_cost_for_kind(kind, amount);
    let discount = faction_technology_bonuses(state, faction_id)
        .recruit_gold_discount_percent
        .clamp(0, 80);
    cost.gold = cost.gold * (100 - discount) / 100;
    cost
}

pub fn travel_months_for_faction(state: &GameState, faction_id: &str, distance_li: u32) -> u32 {
    let reduction = faction_technology_bonuses(state, faction_id).travel_month_reduction;
    travel_months_for_distance(distance_li)
        .saturating_sub(reduction)
        .max(1)
}

pub fn route_distance_li_for_faction(
    state: &GameState,
    faction_id: &str,
    source_city_id: &str,
    target_city_id: &str,
    target_may_be_hostile: bool,
) -> Option<u32> {
    if !state.cities.contains_key(source_city_id) || !state.cities.contains_key(target_city_id) {
        return None;
    }
    if source_city_id == target_city_id {
        return Some(0);
    }

    let mut distances = BTreeMap::from([(source_city_id.to_string(), 0_u32)]);
    let mut visited = BTreeSet::new();

    loop {
        let Some((current_id, current_distance)) = distances
            .iter()
            .filter(|(city_id, _)| !visited.contains(city_id.as_str()))
            .min_by_key(|(city_id, distance)| (*distance, city_id.as_str()))
            .map(|(city_id, distance)| (city_id.clone(), *distance))
        else {
            return None;
        };
        if current_id == target_city_id {
            return Some(current_distance);
        }
        visited.insert(current_id.clone());

        for road in state
            .roads
            .iter()
            .filter(|road| road.from == current_id || road.to == current_id)
        {
            let next_id = if road.from == current_id {
                road.to.as_str()
            } else {
                road.from.as_str()
            };
            if visited.contains(next_id) {
                continue;
            }
            if !(target_may_be_hostile && next_id == target_city_id)
                && !city_passable_for_faction(state, faction_id, next_id)
            {
                continue;
            }
            let Some(edge_distance) = direct_road_distance_li(state, &current_id, next_id) else {
                continue;
            };
            let next_distance = current_distance.saturating_add(edge_distance);
            let entry = distances.entry(next_id.to_string()).or_insert(u32::MAX);
            if next_distance < *entry {
                *entry = next_distance;
            }
        }
    }
}

fn direct_road_distance_li(state: &GameState, from: &str, to: &str) -> Option<u32> {
    let from_city = state.cities.get(from)?;
    let to_city = state.cities.get(to)?;
    Some(map_distance_li(from_city.position, to_city.position))
}

fn city_passable_for_faction(state: &GameState, faction_id: &str, city_id: &str) -> bool {
    let Some(city) = state.cities.get(city_id) else {
        return false;
    };
    city.faction_id == faction_id
        || state
            .relation(faction_id, &city.faction_id)
            .is_some_and(|relation| relation.has_passage_right(faction_id, state.turn))
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Invalid(String),
}
