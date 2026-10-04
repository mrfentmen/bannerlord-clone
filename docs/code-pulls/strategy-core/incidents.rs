use super::city::City;
use super::events::{
    DynamicEventChoice, DynamicEventCondition, DynamicEventConditionKind, DynamicEventTargetScope,
    DynamicEventTemplate, EventChoice, EventResolution, GameEventDraft, GameEventScope,
    GameEventSeverity, has_pending_dynamic_event_for_city, has_pending_player_dynamic_event,
    record_game_event_with_metadata, resolve_event_decision,
};
use super::history_db::HistoricalCatalog;
use super::ids::{CityId, FactionId};
use super::model::{
    GameState, TurnReport, deterministic_hash_seed, deterministic_index_seed,
    deterministic_percent_seed,
};

const PLAYER_GLOBAL_COOLDOWN_KEY: &str = "dynamic:player:global";
const AI_GLOBAL_COOLDOWN_KEY: &str = "dynamic:ai:global";
const PLAYER_COOLDOWN_MIN_TURNS: u32 = 4;
const PLAYER_COOLDOWN_SPAN: usize = 3;
const AI_INCIDENT_CHANCE_PERCENT: u32 = 25;

#[derive(Clone)]
struct IncidentCandidate {
    template: DynamicEventTemplate,
    city_id: CityId,
    faction_id: FactionId,
    related_faction_id: Option<FactionId>,
    weight: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum IncidentAudience {
    Player,
    Ai,
}

pub fn trigger_dynamic_incidents(
    state: &mut GameState,
    catalog: &dyn HistoricalCatalog,
    report: &mut TurnReport,
) {
    clear_expired_cooldowns(state);
    let templates = match catalog.dynamic_event_templates() {
        Ok(templates) => templates,
        Err(error) => {
            report.warning(format!("读取动态事件失败: {error}"));
            return;
        }
    };

    if !has_pending_player_dynamic_event(state)
        && !cooldown_active(state, PLAYER_GLOBAL_COOLDOWN_KEY)
        && let Some(candidate) =
            select_incident_candidate(state, &templates, IncidentAudience::Player)
    {
        record_player_incident(state, candidate, report);
        return;
    }

    if cooldown_active(state, AI_GLOBAL_COOLDOWN_KEY)
        || deterministic_percent_seed(
            &state.scenario_id,
            &state.turn.to_string(),
            "dynamic-ai-incident",
        ) >= AI_INCIDENT_CHANCE_PERCENT
    {
        return;
    }

    if let Some(candidate) = select_incident_candidate(state, &templates, IncidentAudience::Ai) {
        record_ai_incident(state, candidate, report);
    }
}

fn select_incident_candidate(
    state: &GameState,
    templates: &[DynamicEventTemplate],
    audience: IncidentAudience,
) -> Option<IncidentCandidate> {
    let mut candidates = Vec::new();
    for template in templates.iter().filter(|template| template.enabled) {
        if audience == IncidentAudience::Ai && !records_ai_world_event(template) {
            continue;
        }
        if default_choice(template).is_none() {
            continue;
        }
        for city in state.cities.values() {
            if !city_matches_audience(state, city, &template.target_scope, audience) {
                continue;
            }
            let related_faction_id = related_faction_for_template(state, city, template);
            if matches!(template.target_scope, DynamicEventTargetScope::BorderCity)
                && related_faction_id.is_none()
            {
                continue;
            }
            if cooldown_active(state, &target_cooldown_key(&template.id, &city.id))
                || has_pending_dynamic_event_for_city(state, &template.id, &city.id)
                || !template.conditions.iter().all(|condition| {
                    condition_matches(state, city, related_faction_id.as_deref(), condition)
                })
            {
                continue;
            }

            let weight = adjusted_weight(state, city, related_faction_id.as_deref(), template);
            if weight == 0 {
                continue;
            }
            candidates.push(IncidentCandidate {
                template: template.clone(),
                city_id: city.id.clone(),
                faction_id: city.faction_id.clone(),
                related_faction_id,
                weight,
            });
        }
    }

    select_weighted_candidate(state, candidates, audience)
}

fn record_player_incident(
    state: &mut GameState,
    candidate: IncidentCandidate,
    report: &mut TurnReport,
) {
    let Some(default_choice) = default_choice(&candidate.template) else {
        return;
    };
    let event_id = record_incident_event(
        state,
        &candidate,
        GameEventScope::Player,
        EventResolution::PendingDecision {
            deadline_turn: state.turn + candidate.template.deadline_turns,
            default_choice_id: default_choice.id.clone(),
            choices: event_choices(&candidate.template),
        },
    );
    set_player_cooldown(state);
    set_target_cooldown(state, &candidate);
    report.info(format!(
        "触发动态事件 {}: {}",
        event_id,
        render_template_text(state, &candidate, &candidate.template.summary)
    ));
}

fn record_ai_incident(
    state: &mut GameState,
    candidate: IncidentCandidate,
    report: &mut TurnReport,
) {
    let Some(default_choice) = default_choice(&candidate.template) else {
        return;
    };
    let event_id = record_incident_event(
        state,
        &candidate,
        candidate.template.scope.clone(),
        EventResolution::PendingDecision {
            deadline_turn: state.turn,
            default_choice_id: default_choice.id.clone(),
            choices: event_choices(&candidate.template),
        },
    );
    if let Err(error) = resolve_event_decision(state, &event_id, &default_choice.id) {
        report.warning(format!("AI 动态事件 {event_id} 默认处理失败: {error}"));
    }
    set_cooldown(state, AI_GLOBAL_COOLDOWN_KEY.to_string(), 4);
    set_target_cooldown(state, &candidate);
}

fn record_incident_event(
    state: &mut GameState,
    candidate: &IncidentCandidate,
    scope: GameEventScope,
    resolution: EventResolution,
) -> String {
    record_game_event_with_metadata(
        state,
        GameEventDraft {
            kind: candidate.template.kind.clone(),
            severity: candidate.template.severity.clone(),
            scope,
            title: render_template_text(state, candidate, &candidate.template.title),
            summary: render_template_text(state, candidate, &candidate.template.summary),
            detail: render_template_text(state, candidate, &candidate.template.detail),
            city_id: Some(candidate.city_id.clone()),
            faction_id: Some(candidate.faction_id.clone()),
            officer_id: None,
            resolution,
        },
        Some(candidate.template.id.clone()),
        candidate.related_faction_id.clone(),
    )
}

fn event_choices(template: &DynamicEventTemplate) -> Vec<EventChoice> {
    template
        .choices
        .iter()
        .map(|choice| EventChoice {
            id: choice.id.clone(),
            label: choice.label.clone(),
            description: choice.description.clone(),
            requirements: choice.requirements.clone(),
            effects: choice.effects.clone(),
        })
        .collect()
}

fn default_choice(template: &DynamicEventTemplate) -> Option<&DynamicEventChoice> {
    template.choices.iter().find(|choice| choice.is_default)
}

fn records_ai_world_event(template: &DynamicEventTemplate) -> bool {
    template.scope == GameEventScope::World
        && matches!(
            template.severity,
            GameEventSeverity::Important | GameEventSeverity::Critical
        )
}

fn city_matches_audience(
    state: &GameState,
    city: &City,
    target_scope: &DynamicEventTargetScope,
    audience: IncidentAudience,
) -> bool {
    let player_owned = city.faction_id == state.player_faction_id;
    match audience {
        IncidentAudience::Player => {
            player_owned
                && matches!(
                    target_scope,
                    DynamicEventTargetScope::PlayerCity
                        | DynamicEventTargetScope::AnyCity
                        | DynamicEventTargetScope::BorderCity
                )
        }
        IncidentAudience::Ai => {
            !player_owned
                && matches!(
                    target_scope,
                    DynamicEventTargetScope::AiCity
                        | DynamicEventTargetScope::AnyCity
                        | DynamicEventTargetScope::BorderCity
                )
        }
    }
}

fn related_faction_for_template(
    state: &GameState,
    city: &City,
    template: &DynamicEventTemplate,
) -> Option<FactionId> {
    if !matches!(template.target_scope, DynamicEventTargetScope::BorderCity)
        && !template
            .conditions
            .iter()
            .any(|condition| condition.kind == DynamicEventConditionKind::AdjacentEnemy)
    {
        return None;
    }
    let mut related = state
        .roads
        .iter()
        .filter_map(|road| {
            let neighbor_id = if road.from == city.id {
                Some(road.to.as_str())
            } else if road.to == city.id {
                Some(road.from.as_str())
            } else {
                None
            }?;
            let neighbor = state.cities.get(neighbor_id)?;
            (neighbor.faction_id != city.faction_id).then_some(neighbor.faction_id.clone())
        })
        .collect::<Vec<_>>();
    related.sort();
    related.dedup();
    if related.is_empty() {
        return None;
    }
    let index = deterministic_index_seed(
        &format!("{}:{}", state.scenario_id, state.turn),
        &city.id,
        &template.id,
        related.len(),
    );
    related.into_iter().nth(index)
}

fn adjusted_weight(
    state: &GameState,
    city: &City,
    related_faction_id: Option<&str>,
    template: &DynamicEventTemplate,
) -> u32 {
    let mut weight = u64::from(template.base_weight);
    for modifier in &template.weight_modifiers {
        if condition_matches(
            state,
            city,
            related_faction_id,
            &DynamicEventCondition {
                kind: modifier.kind.clone(),
                min_value: modifier.min_value,
                max_value: modifier.max_value,
            },
        ) {
            weight = weight.saturating_mul(u64::from(modifier.multiplier_percent)) / 100;
        }
    }
    weight.min(u64::from(u32::MAX)).max(1) as u32
}

fn select_weighted_candidate(
    state: &GameState,
    candidates: Vec<IncidentCandidate>,
    audience: IncidentAudience,
) -> Option<IncidentCandidate> {
    let total_weight = candidates
        .iter()
        .map(|candidate| u64::from(candidate.weight))
        .sum::<u64>();
    if total_weight == 0 {
        return None;
    }

    let salt = match audience {
        IncidentAudience::Player => "dynamic-player-candidate",
        IncidentAudience::Ai => "dynamic-ai-candidate",
    };
    let mut roll =
        deterministic_hash_seed(&state.scenario_id, &state.turn.to_string(), salt) % total_weight;
    for candidate in candidates {
        let weight = u64::from(candidate.weight);
        if roll < weight {
            return Some(candidate);
        }
        roll -= weight;
    }
    None
}

fn condition_matches(
    state: &GameState,
    city: &City,
    related_faction_id: Option<&str>,
    condition: &DynamicEventCondition,
) -> bool {
    match condition.kind {
        DynamicEventConditionKind::CityFoodBelowPopulationThreshold => {
            city.food < famine_food_threshold(city.population)
        }
        DynamicEventConditionKind::CityFoodAtLeast => {
            city.food >= condition.min_value.unwrap_or_default()
        }
        DynamicEventConditionKind::CityOrderAtMost => {
            i32::from(city.order) <= condition.max_value.unwrap_or(i32::MAX)
        }
        DynamicEventConditionKind::CityOrderAtLeast => {
            i32::from(city.order) >= condition.min_value.unwrap_or_default()
        }
        DynamicEventConditionKind::CityPopulationAtLeast => {
            city.population >= condition.min_value.unwrap_or_default().max(0) as u32
        }
        DynamicEventConditionKind::CityTroopsAtLeast => {
            city.troops.total() >= condition.min_value.unwrap_or_default().max(0) as u32
        }
        DynamicEventConditionKind::CityDefenseAtLeast => {
            i32::from(city.defense) >= condition.min_value.unwrap_or_default()
        }
        DynamicEventConditionKind::CityTrainingAtMost => {
            i32::from(city.training) <= condition.max_value.unwrap_or(i32::MAX)
        }
        DynamicEventConditionKind::CityAgricultureAtLeast => {
            i32::from(city.agriculture) >= condition.min_value.unwrap_or_default()
        }
        DynamicEventConditionKind::CityCommerceAtLeast => {
            i32::from(city.commerce) >= condition.min_value.unwrap_or_default()
        }
        DynamicEventConditionKind::MonthRange => {
            let month = i32::from(state.month);
            month >= condition.min_value.unwrap_or(1) && month <= condition.max_value.unwrap_or(12)
        }
        DynamicEventConditionKind::AdjacentEnemy => related_faction_id.is_some(),
    }
}

fn famine_food_threshold(population: u32) -> i32 {
    (population / 200).min(i32::MAX as u32) as i32
}

fn render_template_text(
    state: &GameState,
    candidate: &IncidentCandidate,
    template_text: &str,
) -> String {
    let city_name = state
        .cities
        .get(&candidate.city_id)
        .map(|city| city.name.as_str())
        .unwrap_or(candidate.city_id.as_str());
    let faction_name = state
        .factions
        .get(&candidate.faction_id)
        .map(|faction| faction.name.as_str())
        .unwrap_or(candidate.faction_id.as_str());
    let related_faction_name = candidate
        .related_faction_id
        .as_deref()
        .and_then(|faction_id| state.factions.get(faction_id))
        .map(|faction| faction.name.as_str())
        .or(candidate.related_faction_id.as_deref())
        .unwrap_or("邻近势力");

    template_text
        .replace("{city}", city_name)
        .replace("{faction}", faction_name)
        .replace("{related_faction}", related_faction_name)
}

fn set_player_cooldown(state: &mut GameState) {
    let cooldown = PLAYER_COOLDOWN_MIN_TURNS
        + deterministic_index_seed(
            &state.scenario_id,
            &state.turn.to_string(),
            PLAYER_GLOBAL_COOLDOWN_KEY,
            PLAYER_COOLDOWN_SPAN,
        ) as u32;
    set_cooldown(state, PLAYER_GLOBAL_COOLDOWN_KEY.to_string(), cooldown);
}

fn set_target_cooldown(state: &mut GameState, candidate: &IncidentCandidate) {
    set_cooldown(
        state,
        target_cooldown_key(&candidate.template.id, &candidate.city_id),
        candidate.template.target_cooldown_turns,
    );
}

fn set_cooldown(state: &mut GameState, key: String, duration_turns: u32) {
    if duration_turns == 0 {
        return;
    }
    state
        .dynamic_event_cooldowns
        .insert(key, state.turn.saturating_add(duration_turns));
}

fn cooldown_active(state: &GameState, key: &str) -> bool {
    state
        .dynamic_event_cooldowns
        .get(key)
        .is_some_and(|until_turn| *until_turn >= state.turn)
}

fn clear_expired_cooldowns(state: &mut GameState) {
    let turn = state.turn;
    state
        .dynamic_event_cooldowns
        .retain(|_, until_turn| *until_turn >= turn);
}

fn target_cooldown_key(template_id: &str, city_id: &str) -> String {
    format!("dynamic:target:{template_id}:{city_id}")
}
