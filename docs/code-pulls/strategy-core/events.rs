use super::ids::{CityId, FactionId, OfficerId};
use super::model::{GameState, TroopPool};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GameEvent {
    pub id: String,
    pub sequence: u64,
    pub year: i32,
    pub month: u8,
    pub turn: u32,
    pub kind: GameEventKind,
    pub severity: GameEventSeverity,
    pub scope: GameEventScope,
    pub title: String,
    pub summary: String,
    pub detail: String,
    #[serde(default)]
    pub city_id: Option<CityId>,
    #[serde(default)]
    pub faction_id: Option<FactionId>,
    #[serde(default)]
    pub related_faction_id: Option<FactionId>,
    #[serde(default)]
    pub officer_id: Option<OfficerId>,
    #[serde(default)]
    pub template_id: Option<String>,
    #[serde(default)]
    pub viewed: bool,
    #[serde(default = "default_popup_pending")]
    pub popup_pending: bool,
    pub resolution: EventResolution,
}

fn default_popup_pending() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GameEventKind {
    CityDevelopment,
    Battle,
    CityCaptured,
    FactionDestroyed,
    TechnologyCompleted,
    HistoricalLife,
    OfficerLifecycle,
    Succession,
    Famine,
    NaturalDisaster,
    PublicOrder,
    Economy,
    Military,
    Diplomacy,
    Opportunity,
    GameStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GameEventSeverity {
    Info,
    Important,
    Warning,
    Critical,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GameEventScope {
    Player,
    World,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum EventResolution {
    NoneRequired,
    PendingDecision {
        deadline_turn: u32,
        default_choice_id: String,
        choices: Vec<EventChoice>,
    },
    Resolved {
        choice_id: Option<String>,
        label: String,
        turn: u32,
    },
    Expired {
        choice_id: String,
        label: String,
        turn: u32,
    },
    Cancelled {
        reason: String,
        turn: u32,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    #[serde(default)]
    pub requirements: EventChoiceRequirements,
    pub effects: EventChoiceEffects,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct EventChoiceRequirements {
    #[serde(default)]
    pub city_gold: i32,
    #[serde(default)]
    pub city_food: i32,
    #[serde(default)]
    pub city_materials: i32,
    #[serde(default)]
    pub dynamic: Vec<DynamicEventRequirement>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct EventChoiceEffects {
    #[serde(default)]
    pub city_gold: i32,
    #[serde(default)]
    pub city_food: i32,
    #[serde(default)]
    pub city_materials: i32,
    #[serde(default)]
    pub city_order: i32,
    #[serde(default)]
    pub city_population: i32,
    #[serde(default)]
    pub dynamic: Vec<DynamicEventEffect>,
    #[serde(default)]
    pub set_faction_ruler_id: Option<super::ids::OfficerId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DynamicEventRequirement {
    pub kind: DynamicEventRequirementKind,
    pub amount: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DynamicEventRequirementKind {
    CityGold,
    CityFood,
    CityMaterials,
    CityTroops,
    CityOrder,
    CityPopulation,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DynamicEventEffect {
    pub kind: DynamicEventEffectKind,
    pub amount: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DynamicEventEffectKind {
    CityGold,
    CityFood,
    CityMaterials,
    CityOrder,
    CityPopulation,
    CityPopulationPercent,
    CityTraining,
    CityAgriculture,
    CityCommerce,
    CityDefense,
    CityTroops,
    CityTroopsPercent,
    CityWoundedTroops,
    DiplomaticScore,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DynamicEventTemplate {
    pub id: String,
    pub kind: GameEventKind,
    pub severity: GameEventSeverity,
    pub scope: GameEventScope,
    pub target_scope: DynamicEventTargetScope,
    pub base_weight: u32,
    pub target_cooldown_turns: u32,
    pub deadline_turns: u32,
    pub enabled: bool,
    pub title: String,
    pub summary: String,
    pub detail: String,
    pub conditions: Vec<DynamicEventCondition>,
    pub weight_modifiers: Vec<DynamicEventWeightModifier>,
    pub choices: Vec<DynamicEventChoice>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DynamicEventTargetScope {
    PlayerCity,
    AiCity,
    AnyCity,
    BorderCity,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DynamicEventCondition {
    pub kind: DynamicEventConditionKind,
    pub min_value: Option<i32>,
    pub max_value: Option<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DynamicEventConditionKind {
    CityFoodBelowPopulationThreshold,
    CityFoodAtLeast,
    CityOrderAtMost,
    CityOrderAtLeast,
    CityPopulationAtLeast,
    CityTroopsAtLeast,
    CityDefenseAtLeast,
    CityTrainingAtMost,
    CityAgricultureAtLeast,
    CityCommerceAtLeast,
    MonthRange,
    AdjacentEnemy,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DynamicEventWeightModifier {
    pub kind: DynamicEventConditionKind,
    pub min_value: Option<i32>,
    pub max_value: Option<i32>,
    pub multiplier_percent: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DynamicEventChoice {
    pub id: String,
    pub label: String,
    pub description: String,
    pub is_default: bool,
    pub requirements: EventChoiceRequirements,
    pub effects: EventChoiceEffects,
}

#[derive(Clone, Debug)]
pub struct GameEventDraft {
    pub kind: GameEventKind,
    pub severity: GameEventSeverity,
    pub scope: GameEventScope,
    pub title: String,
    pub summary: String,
    pub detail: String,
    pub city_id: Option<CityId>,
    pub faction_id: Option<FactionId>,
    pub officer_id: Option<OfficerId>,
    pub resolution: EventResolution,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum EventError {
    #[error("事件 {0} 不存在")]
    NotFound(String),
    #[error("事件 {0} 不需要决策")]
    NoDecisionRequired(String),
    #[error("事件 {event_id} 没有选项 {choice_id}")]
    InvalidChoice { event_id: String, choice_id: String },
    #[error("{0}")]
    RequirementsNotMet(String),
}

pub fn record_game_event(state: &mut GameState, draft: GameEventDraft) -> String {
    record_game_event_with_metadata(state, draft, None, None)
}

pub fn record_game_event_with_metadata(
    state: &mut GameState,
    draft: GameEventDraft,
    template_id: Option<String>,
    related_faction_id: Option<FactionId>,
) -> String {
    state.next_event_sequence += 1;
    let sequence = state.next_event_sequence;
    let id = format!("event-{sequence}");
    state.events.push(GameEvent {
        id: id.clone(),
        sequence,
        year: state.year,
        month: state.month,
        turn: state.turn,
        kind: draft.kind,
        severity: draft.severity,
        scope: draft.scope,
        title: draft.title,
        summary: draft.summary,
        detail: draft.detail,
        city_id: draft.city_id,
        faction_id: draft.faction_id,
        related_faction_id,
        officer_id: draft.officer_id,
        template_id,
        viewed: false,
        popup_pending: true,
        resolution: draft.resolution,
    });
    id
}

pub fn dismiss_event_popup(state: &mut GameState, event_id: &str) -> Result<(), EventError> {
    let event = event_mut(state, event_id)?;
    event.popup_pending = false;
    event.viewed = true;
    Ok(())
}

pub fn mark_event_viewed(state: &mut GameState, event_id: &str) -> Result<(), EventError> {
    event_mut(state, event_id)?.viewed = true;
    Ok(())
}

pub fn resolve_event_decision(
    state: &mut GameState,
    event_id: &str,
    choice_id: &str,
) -> Result<(), EventError> {
    let event_index = event_index(state, event_id)?;
    let choice = pending_choice(&state.events[event_index], choice_id)?;
    apply_choice_effects(state, event_index, &choice, DecisionOutcome::Resolved)
}

pub fn expire_due_event_decisions(state: &mut GameState) {
    let now_turn = state.turn;
    let due: Vec<(usize, String)> = state
        .events
        .iter()
        .enumerate()
        .filter_map(|(index, event)| match &event.resolution {
            EventResolution::PendingDecision {
                deadline_turn,
                default_choice_id,
                ..
            } if *deadline_turn <= now_turn => Some((index, default_choice_id.clone())),
            _ => None,
        })
        .collect();

    for (event_index, default_choice_id) in due {
        let choice = match pending_choice(&state.events[event_index], &default_choice_id) {
            Ok(choice) => choice,
            Err(_) => {
                state.events[event_index].resolution = EventResolution::Cancelled {
                    reason: "默认选项不可用".to_string(),
                    turn: now_turn,
                };
                continue;
            }
        };
        let _ = apply_choice_effects(state, event_index, &choice, DecisionOutcome::Expired);
    }
}

pub fn pending_event_count(state: &GameState) -> usize {
    state
        .events
        .iter()
        .filter(|event| matches!(event.resolution, EventResolution::PendingDecision { .. }))
        .count()
}

pub fn unread_event_count(state: &GameState) -> usize {
    state.events.iter().filter(|event| !event.viewed).count()
}

pub fn popup_event_id(state: &GameState) -> Option<&str> {
    state
        .events
        .iter()
        .filter(|event| event.popup_pending)
        .min_by_key(|event| event.sequence)
        .map(|event| event.id.as_str())
}

pub fn has_pending_famine_for_city(state: &GameState, city_id: &str) -> bool {
    state.events.iter().any(|event| {
        event.kind == GameEventKind::Famine
            && event.city_id.as_deref() == Some(city_id)
            && matches!(event.resolution, EventResolution::PendingDecision { .. })
    })
}

pub fn has_pending_dynamic_event_for_city(
    state: &GameState,
    template_id: &str,
    city_id: &str,
) -> bool {
    state.events.iter().any(|event| {
        event.template_id.as_deref() == Some(template_id)
            && event.city_id.as_deref() == Some(city_id)
            && matches!(event.resolution, EventResolution::PendingDecision { .. })
    })
}

pub fn has_pending_player_dynamic_event(state: &GameState) -> bool {
    state.events.iter().any(|event| {
        event.template_id.is_some()
            && event.scope == GameEventScope::Player
            && matches!(event.resolution, EventResolution::PendingDecision { .. })
    })
}

fn event_mut<'a>(
    state: &'a mut GameState,
    event_id: &str,
) -> Result<&'a mut GameEvent, EventError> {
    state
        .events
        .iter_mut()
        .find(|event| event.id == event_id)
        .ok_or_else(|| EventError::NotFound(event_id.to_string()))
}

fn event_index(state: &GameState, event_id: &str) -> Result<usize, EventError> {
    state
        .events
        .iter()
        .position(|event| event.id == event_id)
        .ok_or_else(|| EventError::NotFound(event_id.to_string()))
}

fn pending_choice(event: &GameEvent, choice_id: &str) -> Result<EventChoice, EventError> {
    let EventResolution::PendingDecision { choices, .. } = &event.resolution else {
        return Err(EventError::NoDecisionRequired(event.id.clone()));
    };
    choices
        .iter()
        .find(|choice| choice.id == choice_id)
        .cloned()
        .ok_or_else(|| EventError::InvalidChoice {
            event_id: event.id.clone(),
            choice_id: choice_id.to_string(),
        })
}

#[derive(Clone, Copy)]
enum DecisionOutcome {
    Resolved,
    Expired,
}

fn apply_choice_effects(
    state: &mut GameState,
    event_index: usize,
    choice: &EventChoice,
    outcome: DecisionOutcome,
) -> Result<(), EventError> {
    if choice.effects.set_faction_ruler_id.is_some() {
        return apply_succession_choice_effects(state, event_index, choice, outcome);
    }

    let event_id = state.events[event_index].id.clone();
    let Some(city_id) = state.events[event_index].city_id.clone() else {
        set_cancelled(state, event_index, "事件缺少目标城池");
        return Ok(());
    };
    let expected_faction_id = state.events[event_index]
        .faction_id
        .clone()
        .unwrap_or_else(|| state.player_faction_id.clone());

    {
        let Some(city) = state.cities.get(&city_id) else {
            set_cancelled(state, event_index, "目标城池已不存在");
            return Ok(());
        };
        if city.faction_id != expected_faction_id {
            set_cancelled(state, event_index, "目标城池已不属事件势力");
            return Ok(());
        }
        if !city_meets_choice_requirements(city, &choice.requirements) {
            return Err(EventError::RequirementsNotMet(format!(
                "{} 资源不足，无法执行 {}",
                city.name, choice.label
            )));
        }
    }

    let diplomatic_delta: i32 = choice
        .effects
        .dynamic
        .iter()
        .filter(|effect| effect.kind == DynamicEventEffectKind::DiplomaticScore)
        .map(|effect| effect.amount)
        .sum();
    let related_faction_id = if diplomatic_delta != 0 {
        let Some(related_faction_id) = state.events[event_index].related_faction_id.clone() else {
            set_cancelled(state, event_index, "事件缺少相关势力");
            return Ok(());
        };
        Some(related_faction_id)
    } else {
        None
    };

    let city = state.cities.get_mut(&city_id).ok_or_else(|| {
        EventError::RequirementsNotMet(format!("事件 {event_id} 的目标城池已不存在"))
    })?;
    city.gold += choice.effects.city_gold;
    city.food += choice.effects.city_food;
    city.materials += choice.effects.city_materials;
    city.order = apply_i32_to_u8(city.order, choice.effects.city_order, 0, 100);
    city.population = apply_i32_to_u32(city.population, choice.effects.city_population);
    apply_dynamic_city_effects(
        city,
        choice
            .effects
            .dynamic
            .iter()
            .filter(|effect| effect.kind != DynamicEventEffectKind::DiplomaticScore),
    );
    city.clamp_fields();

    if let Some(related_faction_id) = related_faction_id {
        let relation = state.relation_mut(&expected_faction_id, &related_faction_id);
        relation.score = (i32::from(relation.score) + diplomatic_delta).clamp(-100, 100) as i16;
    }

    let turn = state.turn;
    let label = choice.label.clone();
    state.events[event_index].viewed = true;
    state.events[event_index].popup_pending = false;
    state.events[event_index].resolution = match outcome {
        DecisionOutcome::Resolved => EventResolution::Resolved {
            choice_id: Some(choice.id.clone()),
            label,
            turn,
        },
        DecisionOutcome::Expired => EventResolution::Expired {
            choice_id: choice.id.clone(),
            label,
            turn,
        },
    };
    Ok(())
}

fn apply_succession_choice_effects(
    state: &mut GameState,
    event_index: usize,
    choice: &EventChoice,
    outcome: DecisionOutcome,
) -> Result<(), EventError> {
    let Some(faction_id) = state.events[event_index].faction_id.clone() else {
        set_cancelled(state, event_index, "事件缺少目标势力");
        return Ok(());
    };
    let Some(new_ruler_id) = choice.effects.set_faction_ruler_id.clone() else {
        set_cancelled(state, event_index, "事件缺少继承人");
        return Ok(());
    };

    {
        let Some(officer) = state.officers.get(&new_ruler_id) else {
            set_cancelled(state, event_index, "继承人已不存在");
            return Ok(());
        };
        if officer.faction_id != faction_id
            || !officer.is_active()
            || !officer.is_adult_at(state.year)
        {
            set_cancelled(state, event_index, "继承人当前不可继位");
            return Ok(());
        }
    }

    let Some(faction) = state.factions.get_mut(&faction_id) else {
        set_cancelled(state, event_index, "目标势力已不存在");
        return Ok(());
    };
    faction.ruler_id = new_ruler_id.clone();
    faction.heir_id = Some(new_ruler_id);

    let turn = state.turn;
    let label = choice.label.clone();
    state.events[event_index].viewed = true;
    state.events[event_index].popup_pending = false;
    state.events[event_index].resolution = match outcome {
        DecisionOutcome::Resolved => EventResolution::Resolved {
            choice_id: Some(choice.id.clone()),
            label,
            turn,
        },
        DecisionOutcome::Expired => EventResolution::Expired {
            choice_id: choice.id.clone(),
            label,
            turn,
        },
    };
    Ok(())
}

fn set_cancelled(state: &mut GameState, event_index: usize, reason: &str) {
    state.events[event_index].viewed = true;
    state.events[event_index].popup_pending = false;
    state.events[event_index].resolution = EventResolution::Cancelled {
        reason: reason.to_string(),
        turn: state.turn,
    };
}

fn apply_i32_to_u8(value: u8, delta: i32, min: u8, max: u8) -> u8 {
    (i32::from(value) + delta).clamp(i32::from(min), i32::from(max)) as u8
}

fn apply_i32_to_u32(value: u32, delta: i32) -> u32 {
    if delta >= 0 {
        value.saturating_add(delta as u32)
    } else {
        value.saturating_sub(delta.unsigned_abs())
    }
}

fn city_meets_choice_requirements(
    city: &super::city::City,
    requirements: &EventChoiceRequirements,
) -> bool {
    if city.gold < requirements.city_gold
        || city.food < requirements.city_food
        || city.materials < requirements.city_materials
    {
        return false;
    }

    requirements
        .dynamic
        .iter()
        .all(|requirement| match requirement.kind {
            DynamicEventRequirementKind::CityGold => city.gold >= requirement.amount,
            DynamicEventRequirementKind::CityFood => city.food >= requirement.amount,
            DynamicEventRequirementKind::CityMaterials => city.materials >= requirement.amount,
            DynamicEventRequirementKind::CityTroops => {
                city.troops.total() >= requirement.amount.max(0) as u32
            }
            DynamicEventRequirementKind::CityOrder => i32::from(city.order) >= requirement.amount,
            DynamicEventRequirementKind::CityPopulation => {
                city.population >= requirement.amount.max(0) as u32
            }
        })
}

fn apply_dynamic_city_effects<'a>(
    city: &mut super::city::City,
    effects: impl Iterator<Item = &'a DynamicEventEffect>,
) {
    for effect in effects {
        match effect.kind {
            DynamicEventEffectKind::CityGold => city.gold += effect.amount,
            DynamicEventEffectKind::CityFood => city.food += effect.amount,
            DynamicEventEffectKind::CityMaterials => city.materials += effect.amount,
            DynamicEventEffectKind::CityOrder => {
                city.order = apply_i32_to_u8(city.order, effect.amount, 0, 100);
            }
            DynamicEventEffectKind::CityPopulation => {
                city.population = apply_i32_to_u32(city.population, effect.amount);
            }
            DynamicEventEffectKind::CityPopulationPercent => {
                let delta = percent_delta(city.population, effect.amount);
                city.population = apply_i32_to_u32(city.population, delta);
            }
            DynamicEventEffectKind::CityTraining => {
                city.training = apply_i32_to_u8(city.training, effect.amount, 0, 100);
            }
            DynamicEventEffectKind::CityAgriculture => {
                city.agriculture = apply_i32_to_u16(city.agriculture, effect.amount, 0, 999);
            }
            DynamicEventEffectKind::CityCommerce => {
                city.commerce = apply_i32_to_u16(city.commerce, effect.amount, 0, 999);
            }
            DynamicEventEffectKind::CityDefense => {
                city.defense = apply_i32_to_u16(city.defense, effect.amount, 0, 999);
            }
            DynamicEventEffectKind::CityTroops => {
                apply_i32_to_troop_pool(&mut city.troops, effect.amount);
            }
            DynamicEventEffectKind::CityTroopsPercent => {
                let delta = percent_delta(city.troops.total(), effect.amount);
                apply_i32_to_troop_pool(&mut city.troops, delta);
            }
            DynamicEventEffectKind::CityWoundedTroops => {
                apply_i32_to_troop_pool(&mut city.wounded_troops, effect.amount);
            }
            DynamicEventEffectKind::DiplomaticScore => {}
        }
    }
}

fn apply_i32_to_u16(value: u16, delta: i32, min: u16, max: u16) -> u16 {
    (i32::from(value) + delta).clamp(i32::from(min), i32::from(max)) as u16
}

fn apply_i32_to_troop_pool(pool: &mut TroopPool, delta: i32) {
    if delta >= 0 {
        pool.add_total_preserving_ratio(delta as u32);
    } else {
        pool.saturating_sub_pool(pool.loss_pool(delta.unsigned_abs()));
    }
}

fn percent_delta(value: u32, percent: i32) -> i32 {
    let magnitude = (i64::from(value) * i64::from(percent.unsigned_abs()) / 100)
        .min(i64::from(i32::MAX)) as i32;
    if percent >= 0 { magnitude } else { -magnitude }
}
