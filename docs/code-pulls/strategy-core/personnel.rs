use super::events::{
    EventChoice, EventChoiceEffects, EventChoiceRequirements, EventResolution, GameEventDraft,
    GameEventKind, GameEventScope, GameEventSeverity, record_game_event,
};
use super::ids::{CityId, FactionId, OfficerId, WILD_FACTION_ID};
use super::model::{
    FamilyRelationship, GameState, Marriage, TurnReport, deterministic_index_seed,
    deterministic_percent_seed,
};
use super::officer::{
    Officer, OfficerGender, OfficerRelationshipKind, OfficerStats, OfficerStatus,
};
use std::collections::BTreeSet;

pub const ADULT_AGE: u32 = 18;
const BIRTH_WIFE_MIN_AGE: u32 = 18;
const BIRTH_WIFE_MAX_AGE: u32 = 45;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LifecycleConfig {
    pub birth_chance_percent: u32,
    pub death_chance_60s: u32,
    pub death_chance_70s: u32,
    pub death_chance_80s: u32,
    pub death_chance_90_plus: u32,
    pub death_year_bonus_percent: u32,
    pub max_death_chance_percent: u32,
}

impl Default for LifecycleConfig {
    fn default() -> Self {
        Self {
            birth_chance_percent: 15,
            death_chance_60s: 1,
            death_chance_70s: 4,
            death_chance_80s: 10,
            death_chance_90_plus: 25,
            death_year_bonus_percent: 5,
            max_death_chance_percent: 35,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeneratedOfficer {
    pub name: String,
    pub gender: OfficerGender,
    pub stats: OfficerStats,
}

pub struct ChildGenerationContext<'a> {
    pub state: &'a GameState,
    pub father: &'a Officer,
    pub mother: &'a Officer,
    pub sequence: u64,
}

pub trait OfficerGenerationProvider {
    fn generate_child(&self, context: ChildGenerationContext<'_>) -> GeneratedOfficer;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct RuleBasedChildGenerator;

impl OfficerGenerationProvider for RuleBasedChildGenerator {
    fn generate_child(&self, context: ChildGenerationContext<'_>) -> GeneratedOfficer {
        let gender = if deterministic_percent(
            context.state,
            context.state.year,
            &context.father.id,
            &format!("child-gender-{}", context.sequence),
        ) < 50
        {
            OfficerGender::Male
        } else {
            OfficerGender::Female
        };
        let given_names = match gender {
            OfficerGender::Male => ["安", "承", "弘", "靖", "朗", "宁", "昭", "远"],
            OfficerGender::Female => ["婉", "宁", "昭", "仪", "华", "兰", "瑾", "月"],
        };
        let index = deterministic_index(
            context.state,
            context.state.year,
            &context.mother.id,
            &format!("child-name-{}", context.sequence),
            given_names.len(),
        );
        let name = format!(
            "{}{}",
            family_name(&context.father.name),
            given_names[index]
        );
        let stats = OfficerStats {
            leadership: child_stat(&context, "leadership", |stats| stats.leadership),
            strength: child_stat(&context, "strength", |stats| stats.strength),
            intelligence: child_stat(&context, "intelligence", |stats| stats.intelligence),
            politics: child_stat(&context, "politics", |stats| stats.politics),
            charm: child_stat(&context, "charm", |stats| stats.charm),
        };
        GeneratedOfficer {
            name,
            gender,
            stats,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum PersonnelError {
    #[error("势力 {0} 不存在")]
    FactionNotFound(String),
    #[error("武将 {0} 不存在")]
    OfficerNotFound(String),
    #[error("{0}")]
    Invalid(String),
}

pub fn normalize_personnel_state(state: &mut GameState) {
    for officer in state.officers.values_mut() {
        if officer.birth_year == 0 {
            officer.birth_year = officer
                .profile
                .as_ref()
                .and_then(|profile| profile.birth_year)
                .unwrap_or(state.year - 30);
        }
    }
}

pub fn marry_officers(
    state: &mut GameState,
    faction_id: &str,
    first_id: &str,
    second_id: &str,
) -> Result<Marriage, PersonnelError> {
    if faction_id != state.player_faction_id {
        return Err(PersonnelError::Invalid(
            "首版只能管理玩家势力婚配".to_string(),
        ));
    }
    if first_id == second_id {
        return Err(PersonnelError::Invalid("不能与自己婚配".to_string()));
    }
    let first = officer_for_personnel(state, first_id)?;
    let second = officer_for_personnel(state, second_id)?;
    validate_marriage_officer(state, faction_id, first)?;
    validate_marriage_officer(state, faction_id, second)?;
    if first.gender == second.gender {
        return Err(PersonnelError::Invalid(
            "婚配双方必须为男女武将".to_string(),
        ));
    }
    if are_direct_relatives(state, first_id, second_id) {
        return Err(PersonnelError::Invalid(
            "直系亲属或兄弟姐妹不能婚配".to_string(),
        ));
    }
    let (husband_id, wife_id) = if first.gender == OfficerGender::Male {
        (first.id.clone(), second.id.clone())
    } else {
        (second.id.clone(), first.id.clone())
    };
    if state
        .marriages
        .iter()
        .any(|marriage| marriage.husband_id == husband_id && marriage.wife_id == wife_id)
    {
        return Err(PersonnelError::Invalid("这对武将已经婚配".to_string()));
    }

    let marriage = Marriage::new(husband_id, wife_id, state.year, state.month);
    state.marriages.push(marriage.clone());
    Ok(marriage)
}

pub fn divorce_officers(
    state: &mut GameState,
    faction_id: &str,
    first_id: &str,
    second_id: &str,
) -> Result<(), PersonnelError> {
    if faction_id != state.player_faction_id {
        return Err(PersonnelError::Invalid(
            "首版只能管理玩家势力婚姻".to_string(),
        ));
    }
    if first_id == second_id {
        return Err(PersonnelError::Invalid("不能解除自己的婚姻".to_string()));
    }
    officer_for_personnel(state, first_id)?;
    officer_for_personnel(state, second_id)?;

    let dynamic_before = state.marriages.len();
    state
        .marriages
        .retain(|marriage| !(marriage.involves(first_id) && marriage.involves(second_id)));
    let removed_dynamic = dynamic_before != state.marriages.len();
    let removed_first_static = remove_static_spouse_relationship(state, first_id, second_id);
    let removed_second_static = remove_static_spouse_relationship(state, second_id, first_id);
    let removed_static = removed_first_static || removed_second_static;

    if !removed_dynamic && !removed_static {
        return Err(PersonnelError::Invalid("这对武将没有婚姻关系".to_string()));
    }

    Ok(())
}

pub fn set_default_heir(
    state: &mut GameState,
    faction_id: &str,
    officer_id: &str,
) -> Result<(), PersonnelError> {
    validate_heir_candidate(state, faction_id, officer_id)?;
    let faction = state
        .factions
        .get_mut(faction_id)
        .ok_or_else(|| PersonnelError::FactionNotFound(faction_id.to_string()))?;
    faction.heir_id = Some(officer_id.to_string());
    Ok(())
}

pub fn abdicate_ruler(
    state: &mut GameState,
    faction_id: &str,
    successor_id: &str,
) -> Result<(), PersonnelError> {
    if faction_id != state.player_faction_id {
        return Err(PersonnelError::Invalid(
            "首版只能管理玩家势力退位".to_string(),
        ));
    }
    let current_ruler_id = state
        .factions
        .get(faction_id)
        .ok_or_else(|| PersonnelError::FactionNotFound(faction_id.to_string()))?
        .ruler_id
        .clone();
    if current_ruler_id == successor_id {
        return Err(PersonnelError::Invalid(
            "当前主君不能退位给自己".to_string(),
        ));
    }
    validate_heir_candidate(state, faction_id, successor_id)?;

    let faction = state
        .factions
        .get_mut(faction_id)
        .ok_or_else(|| PersonnelError::FactionNotFound(faction_id.to_string()))?;
    faction.ruler_id = successor_id.to_string();
    faction.heir_id = Some(successor_id.to_string());
    Ok(())
}

pub fn succession_candidate_ids(
    state: &GameState,
    faction_id: &str,
    exclude_officer_id: Option<&str>,
) -> Vec<OfficerId> {
    let Some(faction) = state.factions.get(faction_id) else {
        return Vec::new();
    };
    let child_candidates =
        adult_child_heir_candidate_ids(state, faction_id, &faction.ruler_id, exclude_officer_id);
    let mut candidates = if child_candidates.is_empty() {
        state
            .officers
            .values()
            .filter(|officer| {
                officer.faction_id == faction_id
                    && Some(officer.id.as_str()) != exclude_officer_id
                    && officer.is_active()
                    && officer.is_adult_at(state.year)
            })
            .map(|officer| officer.id.clone())
            .collect::<Vec<_>>()
    } else {
        child_candidates
    };
    candidates.sort_by(|a, b| {
        let a_default = faction.heir_id.as_deref() == Some(a.as_str());
        let b_default = faction.heir_id.as_deref() == Some(b.as_str());
        b_default.cmp(&a_default).then_with(|| a.cmp(b))
    });
    candidates
}

pub fn child_ids_for_parent(state: &GameState, parent_id: &str) -> Vec<OfficerId> {
    let mut ids = BTreeSet::new();
    for relationship in &state.family_relationships {
        if relationship.parent_id == parent_id {
            ids.insert(relationship.child_id.clone());
        }
    }
    for officer in state.officers.values() {
        if is_historical_child_of(state, &officer.id, parent_id) {
            ids.insert(officer.id.clone());
        }
    }
    ids.into_iter().collect()
}

pub fn spouse_ids_for_officer(state: &GameState, officer_id: &str) -> Vec<OfficerId> {
    let mut ids = BTreeSet::new();
    for marriage in &state.marriages {
        if marriage.husband_id == officer_id {
            ids.insert(marriage.wife_id.clone());
        } else if marriage.wife_id == officer_id {
            ids.insert(marriage.husband_id.clone());
        }
    }
    ids.into_iter().collect()
}

pub fn apply_annual_lifecycle(state: &mut GameState, report: &mut TurnReport) {
    apply_annual_lifecycle_with_config(
        state,
        report,
        &RuleBasedChildGenerator,
        LifecycleConfig::default(),
    );
}

pub fn apply_annual_lifecycle_with_config(
    state: &mut GameState,
    report: &mut TurnReport,
    generator: &dyn OfficerGenerationProvider,
    config: LifecycleConfig,
) {
    if state.month != 1 || state.last_lifecycle_year == Some(state.year) {
        return;
    }
    normalize_personnel_state(state);
    mature_minors(state, report);
    apply_lifecycle_deaths(state, report, config);
    apply_births(state, report, generator, config);
    state.last_lifecycle_year = Some(state.year);
}

pub fn mark_officer_dead(
    state: &mut GameState,
    officer_id: &str,
    report: &mut TurnReport,
    reason: &str,
) -> Result<(), PersonnelError> {
    if !state.officers.contains_key(officer_id) {
        return Err(PersonnelError::OfficerNotFound(officer_id.to_string()));
    }
    let ruler_faction_id = state
        .factions
        .values()
        .find(|faction| faction.ruler_id == officer_id)
        .map(|faction| faction.id.clone());
    if let Some(faction_id) = ruler_faction_id {
        let candidates = succession_candidate_ids(state, &faction_id, Some(officer_id));
        if candidates.is_empty() {
            return Err(PersonnelError::Invalid(
                "没有可用继承人，主君死亡事件被跳过".to_string(),
            ));
        }
        apply_ruler_succession(state, &faction_id, officer_id, &candidates, report);
    }
    apply_officer_death_state(state, officer_id);
    let officer_name = officer_name(state, officer_id);
    report.warning(format!("{officer_name} 去世"));
    record_lifecycle_event(
        state,
        GameEventSeverity::Warning,
        "武将去世",
        format!("{officer_name} 去世"),
        format!("{officer_name} 因{reason}离开当前局势。"),
        state
            .officers
            .get(officer_id)
            .map(|officer| officer.faction_id.clone()),
        Some(officer_id.to_string()),
    );
    Ok(())
}

fn mature_minors(state: &mut GameState, report: &mut TurnReport) {
    let ids = state
        .officers
        .values()
        .filter(|officer| officer.status == OfficerStatus::Minor && officer.is_adult_at(state.year))
        .map(|officer| officer.id.clone())
        .collect::<Vec<_>>();
    for officer_id in ids {
        let Some((current_faction_id, current_city_id)) = state
            .officers
            .get(&officer_id)
            .map(|officer| (officer.faction_id.clone(), officer.city_id.clone()))
        else {
            continue;
        };
        let (faction_id, city_id, status) =
            mature_officer_assignment(state, &current_faction_id, current_city_id.as_deref());
        let Some(officer) = state.officers.get_mut(&officer_id) else {
            continue;
        };
        officer.faction_id = faction_id;
        officer.city_id = city_id;
        officer.status = status;
        let officer_name = officer.name.clone();
        let faction_id = officer.faction_id.clone();
        let status = officer.status.clone();
        report.info(match status {
            OfficerStatus::Active => format!("{officer_name} 成年出仕"),
            OfficerStatus::Wild => format!("{officer_name} 成年后成为在野武将"),
            _ => format!("{officer_name} 成年"),
        });
        if faction_id == state.player_faction_id && status == OfficerStatus::Active {
            record_lifecycle_event(
                state,
                GameEventSeverity::Info,
                "子嗣成年",
                format!("{officer_name} 成年出仕"),
                format!("{officer_name} 已满 {ADULT_AGE} 岁，加入可用武将序列。"),
                Some(faction_id),
                Some(officer_id),
            );
        }
    }
}

fn mature_officer_assignment(
    state: &GameState,
    requested_faction_id: &str,
    requested_city_id: Option<&str>,
) -> (FactionId, Option<CityId>, OfficerStatus) {
    if requested_faction_id != WILD_FACTION_ID && state.faction_alive(requested_faction_id) {
        let city_id = requested_city_id
            .and_then(|city_id| state.cities.get(city_id))
            .filter(|city| city.faction_id == requested_faction_id)
            .map(|city| city.id.clone())
            .or_else(|| {
                state
                    .cities
                    .values()
                    .find(|city| city.faction_id == requested_faction_id)
                    .map(|city| city.id.clone())
            });
        if city_id.is_some() {
            return (
                requested_faction_id.to_string(),
                city_id,
                OfficerStatus::Active,
            );
        }
    }

    let city_id = requested_city_id
        .and_then(|city_id| state.cities.get(city_id))
        .map(|city| city.id.clone())
        .or_else(|| state.cities.keys().next().cloned());
    (WILD_FACTION_ID.to_string(), city_id, OfficerStatus::Wild)
}

fn apply_lifecycle_deaths(state: &mut GameState, report: &mut TurnReport, config: LifecycleConfig) {
    let moving_officers = moving_officer_ids(state);
    let ids = state
        .officers
        .values()
        .filter(|officer| {
            officer.is_active()
                && officer.is_adult_at(state.year)
                && !moving_officers.contains(officer.id.as_str())
        })
        .map(|officer| officer.id.clone())
        .collect::<Vec<_>>();
    for officer_id in ids {
        let Some(officer) = state.officers.get(&officer_id) else {
            continue;
        };
        let chance = mortality_chance(officer, state.year, config);
        if chance == 0 {
            continue;
        }
        let roll = deterministic_percent(state, state.year, &officer_id, "death");
        if roll >= chance {
            continue;
        }
        if let Err(error) = mark_officer_dead(state, &officer_id, report, "年老体衰") {
            report.warning(error.to_string());
        }
    }
}

fn apply_births(
    state: &mut GameState,
    report: &mut TurnReport,
    generator: &dyn OfficerGenerationProvider,
    config: LifecycleConfig,
) {
    let marriages = state.marriages.clone();
    let mut mothers_with_birth = BTreeSet::new();
    for marriage in marriages {
        if mothers_with_birth.contains(&marriage.wife_id) {
            continue;
        }
        let Some(father) = state.officers.get(&marriage.husband_id).cloned() else {
            continue;
        };
        let Some(mother) = state.officers.get(&marriage.wife_id).cloned() else {
            continue;
        };
        if father.faction_id != state.player_faction_id
            || mother.faction_id != state.player_faction_id
            || !father.is_active()
            || !mother.is_active()
        {
            continue;
        }
        let mother_age = mother.age_at(state.year);
        if !(BIRTH_WIFE_MIN_AGE..=BIRTH_WIFE_MAX_AGE).contains(&mother_age) {
            continue;
        }
        let roll = deterministic_percent(
            state,
            state.year,
            &format!("{}:{}", father.id, mother.id),
            "birth",
        );
        if roll >= config.birth_chance_percent.min(100) {
            continue;
        }

        state.next_generated_officer_sequence += 1;
        let sequence = state.next_generated_officer_sequence;
        let generated = generator.generate_child(ChildGenerationContext {
            state,
            father: &father,
            mother: &mother,
            sequence,
        });
        let child_id = unique_generated_officer_id(state, state.year, sequence);
        let child = Officer {
            id: child_id.clone(),
            name: generated.name.clone(),
            faction_id: father.faction_id.clone(),
            city_id: father.city_id.clone().or_else(|| mother.city_id.clone()),
            office_id: None,
            stats: generated.stats,
            loyalty: 100,
            birth_year: state.year,
            gender: generated.gender,
            status: OfficerStatus::Minor,
            profile: None,
        };
        state.officers.insert(child_id.clone(), child);
        state.family_relationships.push(FamilyRelationship {
            parent_id: father.id.clone(),
            child_id: child_id.clone(),
        });
        state.family_relationships.push(FamilyRelationship {
            parent_id: mother.id.clone(),
            child_id: child_id.clone(),
        });
        mothers_with_birth.insert(mother.id.clone());
        report.info(format!(
            "{} 与 {} 诞下子嗣 {}",
            father.name, mother.name, generated.name
        ));
        record_lifecycle_event(
            state,
            GameEventSeverity::Info,
            "子嗣诞生",
            format!("{} 诞生", generated.name),
            format!(
                "{} 与 {} 诞下子嗣 {}。成年后可加入武将序列。",
                father.name, mother.name, generated.name
            ),
            Some(father.faction_id),
            Some(child_id),
        );
    }
}

fn validate_marriage_officer(
    state: &GameState,
    faction_id: &str,
    officer: &Officer,
) -> Result<(), PersonnelError> {
    if officer.faction_id != faction_id {
        return Err(PersonnelError::Invalid(format!(
            "{} 不是本势力武将",
            officer.name
        )));
    }
    if !officer.is_active() {
        return Err(PersonnelError::Invalid(format!(
            "{} 当前不可婚配",
            officer.name
        )));
    }
    if !officer.is_adult_at(state.year) {
        return Err(PersonnelError::Invalid(format!(
            "{} 尚未成年",
            officer.name
        )));
    }
    Ok(())
}

fn remove_static_spouse_relationship(
    state: &mut GameState,
    source_id: &str,
    target_id: &str,
) -> bool {
    let Some(profile) = state
        .officers
        .get_mut(source_id)
        .and_then(|officer| officer.profile.as_mut())
    else {
        return false;
    };
    let before = profile.relationships.len();
    profile.relationships.retain(|relationship| {
        !(relationship.target_id == target_id
            && relationship.kind == OfficerRelationshipKind::Spouse)
    });
    before != profile.relationships.len()
}

fn validate_heir_candidate(
    state: &GameState,
    faction_id: &str,
    officer_id: &str,
) -> Result<(), PersonnelError> {
    let officer = officer_for_personnel(state, officer_id)?;
    if officer.faction_id != faction_id {
        return Err(PersonnelError::Invalid(format!(
            "{} 不是本势力武将",
            officer.name
        )));
    }
    if !officer.is_active() || !officer.is_adult_at(state.year) {
        return Err(PersonnelError::Invalid(format!(
            "{} 当前不可设为继承人",
            officer.name
        )));
    }
    Ok(())
}

fn officer_for_personnel<'a>(
    state: &'a GameState,
    officer_id: &str,
) -> Result<&'a Officer, PersonnelError> {
    state
        .officers
        .get(officer_id)
        .ok_or_else(|| PersonnelError::OfficerNotFound(officer_id.to_string()))
}

fn adult_child_heir_candidate_ids(
    state: &GameState,
    faction_id: &str,
    parent_id: &str,
    exclude_officer_id: Option<&str>,
) -> Vec<OfficerId> {
    child_ids_for_parent(state, parent_id)
        .into_iter()
        .filter(|child_id| Some(child_id.as_str()) != exclude_officer_id)
        .filter(|child_id| {
            state.officers.get(child_id).is_some_and(|officer| {
                officer.faction_id == faction_id
                    && officer.is_active()
                    && officer.is_adult_at(state.year)
            })
        })
        .collect()
}

fn are_direct_relatives(state: &GameState, first_id: &str, second_id: &str) -> bool {
    state.family_relationships.iter().any(|relationship| {
        (relationship.parent_id == first_id && relationship.child_id == second_id)
            || (relationship.parent_id == second_id && relationship.child_id == first_id)
    }) || dynamic_siblings(state, first_id, second_id)
        || is_historical_parent_child(state, first_id, second_id)
        || is_historical_sibling(state, first_id, second_id)
}

fn dynamic_siblings(state: &GameState, first_id: &str, second_id: &str) -> bool {
    if first_id == second_id {
        return false;
    }
    let first_parents = state
        .family_relationships
        .iter()
        .filter(|relationship| relationship.child_id == first_id)
        .map(|relationship| relationship.parent_id.as_str())
        .collect::<BTreeSet<_>>();
    state.family_relationships.iter().any(|relationship| {
        relationship.child_id == second_id
            && first_parents.contains(relationship.parent_id.as_str())
    })
}

fn is_historical_child_of(state: &GameState, child_id: &str, parent_id: &str) -> bool {
    let Some(child) = state.officers.get(child_id) else {
        return false;
    };
    let Some(parent) = state.officers.get(parent_id) else {
        return false;
    };
    child.age_at(state.year) < parent.age_at(state.year)
        && relationship_kind_between(
            state,
            child_id,
            parent_id,
            OfficerRelationshipKind::ParentChild,
        )
}

fn is_historical_parent_child(state: &GameState, first_id: &str, second_id: &str) -> bool {
    relationship_kind_between(
        state,
        first_id,
        second_id,
        OfficerRelationshipKind::ParentChild,
    )
}

fn is_historical_sibling(state: &GameState, first_id: &str, second_id: &str) -> bool {
    relationship_kind_between(state, first_id, second_id, OfficerRelationshipKind::Sibling)
}

fn relationship_kind_between(
    state: &GameState,
    first_id: &str,
    second_id: &str,
    kind: OfficerRelationshipKind,
) -> bool {
    state
        .officers
        .get(first_id)
        .and_then(|officer| officer.profile.as_ref())
        .is_some_and(|profile| {
            profile.relationships.iter().any(|relationship| {
                relationship.target_id == second_id && relationship.kind == kind
            })
        })
        || state
            .officers
            .get(second_id)
            .and_then(|officer| officer.profile.as_ref())
            .is_some_and(|profile| {
                profile.relationships.iter().any(|relationship| {
                    relationship.target_id == first_id && relationship.kind == kind
                })
            })
}

fn mortality_chance(officer: &Officer, year: i32, config: LifecycleConfig) -> u32 {
    let age = officer.age_at(year);
    let base = match age {
        0..=59 => 0,
        60..=69 => config.death_chance_60s,
        70..=79 => config.death_chance_70s,
        80..=89 => config.death_chance_80s,
        _ => config.death_chance_90_plus,
    };
    let historical_bonus = if officer
        .profile
        .as_ref()
        .and_then(|profile| profile.death_year)
        .is_some_and(|death_year| year >= death_year)
    {
        config.death_year_bonus_percent
    } else {
        0
    };
    base.saturating_add(historical_bonus)
        .min(config.max_death_chance_percent)
}

fn moving_officer_ids(state: &GameState) -> BTreeSet<&str> {
    let mut ids = BTreeSet::new();
    for movement in &state.army_movements {
        ids.insert(movement.commander_id.as_str());
        for officer_id in &movement.officer_ids {
            ids.insert(officer_id.as_str());
        }
    }
    ids
}

fn apply_ruler_succession(
    state: &mut GameState,
    faction_id: &str,
    dead_ruler_id: &str,
    candidates: &[OfficerId],
    report: &mut TurnReport,
) {
    let default_id = state
        .factions
        .get(faction_id)
        .and_then(|faction| faction.heir_id.clone())
        .filter(|heir_id| candidates.iter().any(|candidate| candidate == heir_id))
        .unwrap_or_else(|| candidates[0].clone());
    if let Some(faction) = state.factions.get_mut(faction_id) {
        faction.ruler_id = default_id.clone();
        faction.heir_id = Some(default_id.clone());
    }
    let dead_name = officer_name(state, dead_ruler_id);
    let successor_name = officer_name(state, &default_id);
    report.warning(format!("{dead_name} 去世，{successor_name} 暂代继承"));
    if faction_id == state.player_faction_id {
        record_succession_event(state, faction_id, dead_ruler_id, candidates, &default_id);
    }
}

fn record_succession_event(
    state: &mut GameState,
    faction_id: &str,
    dead_ruler_id: &str,
    candidates: &[OfficerId],
    default_id: &str,
) {
    let dead_name = officer_name(state, dead_ruler_id);
    let default_name = officer_name(state, default_id);
    let minor_children = child_ids_for_parent(state, dead_ruler_id)
        .into_iter()
        .filter_map(|child_id| state.officers.get(&child_id))
        .filter(|officer| officer.status == OfficerStatus::Minor)
        .map(|officer| format!("{}（{}岁）", officer.name, officer.age_at(state.year)))
        .collect::<Vec<_>>();
    let mut detail = format!("{dead_name} 去世，{default_name} 暂代主君。请选择正式继承人。");
    if !minor_children.is_empty() {
        detail.push_str(&format!(" 未成年子嗣：{}。", minor_children.join("、")));
    }
    let choices = candidates
        .iter()
        .filter_map(|officer_id| state.officers.get(officer_id))
        .map(|officer| EventChoice {
            id: officer.id.clone(),
            label: officer.name.clone(),
            description: format!(
                "{}岁，忠诚 {}，统{} 武{} 智{} 政{} 魅{}",
                officer.age_at(state.year),
                officer.loyalty,
                officer.stats.leadership,
                officer.stats.strength,
                officer.stats.intelligence,
                officer.stats.politics,
                officer.stats.charm
            ),
            requirements: EventChoiceRequirements::default(),
            effects: EventChoiceEffects {
                set_faction_ruler_id: Some(officer.id.clone()),
                ..EventChoiceEffects::default()
            },
        })
        .collect::<Vec<_>>();
    record_game_event(
        state,
        GameEventDraft {
            kind: GameEventKind::Succession,
            severity: GameEventSeverity::Critical,
            scope: GameEventScope::Player,
            title: "主君继承".to_string(),
            summary: format!("{dead_name} 去世，需指定继承人"),
            detail,
            city_id: None,
            faction_id: Some(faction_id.to_string()),
            officer_id: Some(dead_ruler_id.to_string()),
            resolution: EventResolution::PendingDecision {
                deadline_turn: state.turn + 1,
                default_choice_id: default_id.to_string(),
                choices,
            },
        },
    );
}

fn apply_officer_death_state(state: &mut GameState, officer_id: &str) {
    if let Some(officer) = state.officers.get_mut(officer_id) {
        officer.status = OfficerStatus::Dead;
        officer.city_id = None;
        officer.office_id = None;
    }
    for city in state.cities.values_mut() {
        if city.governor_id.as_deref() == Some(officer_id) {
            city.governor_id = None;
        }
    }
    for faction in state.factions.values_mut() {
        if faction.heir_id.as_deref() == Some(officer_id) {
            faction.heir_id = None;
        }
    }
}

fn record_lifecycle_event(
    state: &mut GameState,
    severity: GameEventSeverity,
    title: &str,
    summary: String,
    detail: String,
    faction_id: Option<FactionId>,
    officer_id: Option<OfficerId>,
) {
    let scope = if faction_id.as_deref() == Some(state.player_faction_id.as_str()) {
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
            title: title.to_string(),
            summary,
            detail,
            city_id: None,
            faction_id,
            officer_id,
            resolution: EventResolution::NoneRequired,
        },
    );
}

fn unique_generated_officer_id(state: &GameState, year: i32, sequence: u64) -> OfficerId {
    let mut index = sequence;
    loop {
        let id = format!("child_{year}_{index}");
        if !state.officers.contains_key(&id) {
            return id;
        }
        index += 1;
    }
}

fn child_stat<F>(context: &ChildGenerationContext<'_>, salt: &str, stat: F) -> u8
where
    F: Fn(&OfficerStats) -> u8,
{
    let base =
        (u16::from(stat(&context.father.stats)) + u16::from(stat(&context.mother.stats))) / 2;
    let variation = deterministic_percent(
        context.state,
        context.state.year,
        &context.father.id,
        &format!("{salt}-{}", context.sequence),
    ) as i32
        % 21
        - 10;
    (i32::from(base as u8) + variation).clamp(1, 100) as u8
}

fn family_name(name: &str) -> String {
    name.chars()
        .next()
        .map(|ch| ch.to_string())
        .unwrap_or_else(|| "新".to_string())
}

fn officer_name(state: &GameState, officer_id: &str) -> String {
    state
        .officers
        .get(officer_id)
        .map(|officer| officer.name.clone())
        .unwrap_or_else(|| officer_id.to_string())
}

fn deterministic_index(state: &GameState, year: i32, key: &str, salt: &str, len: usize) -> usize {
    deterministic_index_seed(&format!("{}:{year}", state.scenario_id), key, salt, len)
}

fn deterministic_percent(state: &GameState, year: i32, key: &str, salt: &str) -> u32 {
    deterministic_percent_seed(&format!("{}:{year}", state.scenario_id), key, salt)
}
