use super::city::CityEconomyEffects;
use super::ids::{FactionId, TechnologyId};
use super::model::GameState;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TechnologyBranch {
    Military,
    Domestic,
}

impl TechnologyBranch {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "Military" => Some(Self::Military),
            "Domestic" => Some(Self::Domestic),
            _ => None,
        }
    }

    pub const fn as_db(self) -> &'static str {
        match self {
            Self::Military => "Military",
            Self::Domestic => "Domestic",
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FactionTechnologyState {
    #[serde(default)]
    pub active: Option<TechnologyId>,
    #[serde(default)]
    pub progress: BTreeMap<TechnologyId, u8>,
    #[serde(default)]
    pub funded: BTreeSet<TechnologyId>,
    #[serde(default)]
    pub completed: BTreeSet<TechnologyId>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TechnologyEffectKind {
    CityGoldIncome,
    CityFoodIncome,
    CityMaterialsIncome,
    CityGoldPercent,
    CityFoodPercent,
    CityMaterialsPercent,
    CityPopulationGrowth,
    CityTroopRecovery,
    CityOrder,
    CityTraining,
    CityDefense,
    CityUpkeepReductionPercent,
    CityFoodUpkeepReductionPercent,
    TrainingCommandBonus,
    DevelopmentBonus,
    AgricultureDevelopmentBonus,
    CommerceDevelopmentBonus,
    OrderDevelopmentBonus,
    RecruitGoldDiscountPercent,
    TravelMonthReduction,
    AttackPercent,
    DefensePercent,
    SiegeAttackPercent,
    BattleLossReductionPercent,
    RetreatSurvivalPercent,
    ResearchCostReductionPercent,
}

impl TechnologyEffectKind {
    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "city_gold_income" => Some(Self::CityGoldIncome),
            "city_food_income" => Some(Self::CityFoodIncome),
            "city_materials_income" => Some(Self::CityMaterialsIncome),
            "city_gold_percent" => Some(Self::CityGoldPercent),
            "city_food_percent" => Some(Self::CityFoodPercent),
            "city_materials_percent" => Some(Self::CityMaterialsPercent),
            "city_population_growth" => Some(Self::CityPopulationGrowth),
            "city_troop_recovery" => Some(Self::CityTroopRecovery),
            "city_order" => Some(Self::CityOrder),
            "city_training" => Some(Self::CityTraining),
            "city_defense" => Some(Self::CityDefense),
            "city_upkeep_reduction_percent" => Some(Self::CityUpkeepReductionPercent),
            "city_food_upkeep_reduction_percent" => Some(Self::CityFoodUpkeepReductionPercent),
            "training_command_bonus" => Some(Self::TrainingCommandBonus),
            "development_bonus" => Some(Self::DevelopmentBonus),
            "agriculture_development_bonus" => Some(Self::AgricultureDevelopmentBonus),
            "commerce_development_bonus" => Some(Self::CommerceDevelopmentBonus),
            "order_development_bonus" => Some(Self::OrderDevelopmentBonus),
            "recruit_gold_discount_percent" => Some(Self::RecruitGoldDiscountPercent),
            "travel_month_reduction" => Some(Self::TravelMonthReduction),
            "attack_percent" => Some(Self::AttackPercent),
            "defense_percent" => Some(Self::DefensePercent),
            "siege_attack_percent" => Some(Self::SiegeAttackPercent),
            "battle_loss_reduction_percent" => Some(Self::BattleLossReductionPercent),
            "retreat_survival_percent" => Some(Self::RetreatSurvivalPercent),
            "research_cost_reduction_percent" => Some(Self::ResearchCostReductionPercent),
            _ => None,
        }
    }

    pub const fn as_db(self) -> &'static str {
        match self {
            Self::CityGoldIncome => "city_gold_income",
            Self::CityFoodIncome => "city_food_income",
            Self::CityMaterialsIncome => "city_materials_income",
            Self::CityGoldPercent => "city_gold_percent",
            Self::CityFoodPercent => "city_food_percent",
            Self::CityMaterialsPercent => "city_materials_percent",
            Self::CityPopulationGrowth => "city_population_growth",
            Self::CityTroopRecovery => "city_troop_recovery",
            Self::CityOrder => "city_order",
            Self::CityTraining => "city_training",
            Self::CityDefense => "city_defense",
            Self::CityUpkeepReductionPercent => "city_upkeep_reduction_percent",
            Self::CityFoodUpkeepReductionPercent => "city_food_upkeep_reduction_percent",
            Self::TrainingCommandBonus => "training_command_bonus",
            Self::DevelopmentBonus => "development_bonus",
            Self::AgricultureDevelopmentBonus => "agriculture_development_bonus",
            Self::CommerceDevelopmentBonus => "commerce_development_bonus",
            Self::OrderDevelopmentBonus => "order_development_bonus",
            Self::RecruitGoldDiscountPercent => "recruit_gold_discount_percent",
            Self::TravelMonthReduction => "travel_month_reduction",
            Self::AttackPercent => "attack_percent",
            Self::DefensePercent => "defense_percent",
            Self::SiegeAttackPercent => "siege_attack_percent",
            Self::BattleLossReductionPercent => "battle_loss_reduction_percent",
            Self::RetreatSurvivalPercent => "retreat_survival_percent",
            Self::ResearchCostReductionPercent => "research_cost_reduction_percent",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TechnologyEffect {
    pub kind: TechnologyEffectKind,
    pub amount: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TechnologySpec {
    pub id: TechnologyId,
    pub branch: TechnologyBranch,
    pub name: String,
    pub turns: u8,
    pub gold_cost: i32,
    pub prerequisites: Vec<TechnologyId>,
    pub effect: String,
    pub icon_id: String,
    pub sort_order: i32,
    pub ai_priority: i32,
    pub effects: Vec<TechnologyEffect>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TechnologyCatalog {
    specs: BTreeMap<TechnologyId, TechnologySpec>,
    sort_order: Vec<TechnologyId>,
    ai_order: Vec<TechnologyId>,
}

impl TechnologyCatalog {
    pub fn new(specs: Vec<TechnologySpec>) -> Self {
        let specs = specs
            .into_iter()
            .map(|spec| (spec.id.clone(), spec))
            .collect::<BTreeMap<_, _>>();
        let mut sort_order = specs.keys().cloned().collect::<Vec<_>>();
        sort_order.sort_by(|left, right| {
            let left_spec = &specs[left];
            let right_spec = &specs[right];
            left_spec
                .sort_order
                .cmp(&right_spec.sort_order)
                .then_with(|| left.cmp(right))
        });
        let mut ai_order = specs.keys().cloned().collect::<Vec<_>>();
        ai_order.sort_by(|left, right| {
            let left_spec = &specs[left];
            let right_spec = &specs[right];
            left_spec
                .ai_priority
                .cmp(&right_spec.ai_priority)
                .then_with(|| left.cmp(right))
        });
        Self {
            specs,
            sort_order,
            ai_order,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.specs.is_empty()
    }

    pub fn len(&self) -> usize {
        self.specs.len()
    }

    pub fn spec(&self, id: &str) -> Option<&TechnologySpec> {
        self.specs.get(id)
    }

    pub fn specs(&self) -> impl Iterator<Item = &TechnologySpec> {
        self.sort_order.iter().filter_map(|id| self.specs.get(id))
    }

    pub fn specs_for_branch(
        &self,
        branch: TechnologyBranch,
    ) -> impl Iterator<Item = &TechnologySpec> {
        self.specs().filter(move |spec| spec.branch == branch)
    }

    pub fn ai_research_specs(&self) -> impl Iterator<Item = &TechnologySpec> {
        self.ai_order.iter().filter_map(|id| self.specs.get(id))
    }

    pub fn first_id_for_branch(&self, branch: TechnologyBranch) -> Option<&TechnologyId> {
        self.specs_for_branch(branch).next().map(|spec| &spec.id)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TechnologyBonuses {
    pub city_effects: CityEconomyEffects,
    pub training_command_bonus: u8,
    pub development_bonus: u16,
    pub agriculture_development_bonus: u16,
    pub commerce_development_bonus: u16,
    pub order_development_bonus: u8,
    pub recruit_gold_discount_percent: i32,
    pub travel_month_reduction: u32,
    pub attack_percent: i32,
    pub defense_percent: i32,
    pub siege_attack_percent: i32,
    pub battle_loss_reduction_percent: i32,
    pub retreat_survival_percent: i32,
    pub research_cost_reduction_percent: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompletedTechnology {
    pub faction_id: FactionId,
    pub technology_id: TechnologyId,
}

pub fn ensure_faction_technology_states(state: &mut GameState) {
    for faction_id in state.factions.keys() {
        state.technologies.entry(faction_id.clone()).or_default();
    }
}

pub fn faction_technology_state<'a>(
    state: &'a GameState,
    faction_id: &str,
) -> Option<&'a FactionTechnologyState> {
    state.technologies.get(faction_id)
}

pub fn faction_technology_state_mut<'a>(
    state: &'a mut GameState,
    faction_id: &str,
) -> &'a mut FactionTechnologyState {
    state
        .technologies
        .entry(faction_id.to_string())
        .or_default()
}

pub fn faction_total_gold(state: &GameState, faction_id: &str) -> i32 {
    state
        .cities
        .values()
        .filter(|city| city.faction_id == faction_id)
        .map(|city| city.gold.max(0))
        .sum()
}

pub fn effective_technology_cost(
    state: &GameState,
    faction_id: &str,
    id: &str,
) -> Result<i32, TechnologyError> {
    let spec = state
        .technology_catalog
        .spec(id)
        .ok_or_else(|| TechnologyError::UnknownTechnology(id.to_string()))?;
    let reduction = faction_technology_bonuses(state, faction_id)
        .research_cost_reduction_percent
        .clamp(0, 80);
    Ok(spec.gold_cost * (100 - reduction) / 100)
}

pub fn can_research(state: &GameState, faction_id: &str, id: &str) -> Result<(), TechnologyError> {
    let spec = state
        .technology_catalog
        .spec(id)
        .ok_or_else(|| TechnologyError::UnknownTechnology(id.to_string()))?;
    let faction_state = state.technologies.get(faction_id);
    if faction_state.is_some_and(|state| state.completed.contains(id)) {
        return Err(TechnologyError::Completed(spec.name.clone()));
    }
    if let Some(missing) = spec.prerequisites.iter().find(|prerequisite| {
        !faction_state.is_some_and(|state| state.completed.contains(prerequisite.as_str()))
    }) {
        let missing_name = state
            .technology_catalog
            .spec(missing)
            .map(|spec| spec.name.clone())
            .unwrap_or_else(|| missing.clone());
        return Err(TechnologyError::MissingPrerequisite(missing_name));
    }
    Ok(())
}

pub fn start_research(
    state: &mut GameState,
    faction_id: &str,
    id: &str,
) -> Result<ResearchStartOutcome, TechnologyError> {
    can_research(state, faction_id, id)?;
    let already_funded = state
        .technologies
        .get(faction_id)
        .is_some_and(|faction_state| faction_state.funded.contains(id));

    if !already_funded {
        let cost = effective_technology_cost(state, faction_id, id)?;
        let available = faction_total_gold(state, faction_id);
        if available < cost {
            return Err(TechnologyError::InsufficientGold {
                required: cost,
                available,
            });
        }
        deduct_faction_gold(state, faction_id, cost);
        let faction_state = faction_technology_state_mut(state, faction_id);
        let technology_id = id.to_string();
        faction_state.funded.insert(technology_id.clone());
        faction_state
            .progress
            .entry(technology_id.clone())
            .or_insert(0);
        faction_state.active = Some(technology_id);
        return Ok(ResearchStartOutcome {
            cost_paid: cost,
            resumed: false,
        });
    }

    faction_technology_state_mut(state, faction_id).active = Some(id.to_string());
    Ok(ResearchStartOutcome {
        cost_paid: 0,
        resumed: true,
    })
}

pub fn advance_active_research(state: &mut GameState) -> Vec<CompletedTechnology> {
    let faction_ids: Vec<FactionId> = state
        .factions
        .keys()
        .filter(|faction_id| state.faction_alive(faction_id))
        .cloned()
        .collect();
    let mut completed = Vec::new();

    for faction_id in faction_ids {
        let Some(active_id) = state
            .technologies
            .get(&faction_id)
            .and_then(|faction_state| faction_state.active.clone())
        else {
            continue;
        };
        let Some(turns) = state
            .technology_catalog
            .spec(&active_id)
            .map(|spec| spec.turns)
        else {
            continue;
        };
        let faction_state = faction_technology_state_mut(state, &faction_id);
        if !faction_state.funded.contains(&active_id)
            || faction_state.completed.contains(&active_id)
        {
            continue;
        }
        let progress = faction_state.progress.entry(active_id.clone()).or_insert(0);
        *progress = progress.saturating_add(1).min(turns);
        if *progress >= turns {
            faction_state.completed.insert(active_id.clone());
            faction_state.active = None;
            completed.push(CompletedTechnology {
                faction_id: faction_id.clone(),
                technology_id: active_id,
            });
        }
    }

    completed
}

pub fn choose_ai_research(state: &GameState, faction_id: &str) -> Option<TechnologyId> {
    let faction_state = state.technologies.get(faction_id);
    if faction_state.is_some_and(|state| state.active.is_some()) {
        return None;
    }
    state
        .technology_catalog
        .ai_research_specs()
        .find(|spec| {
            can_research(state, faction_id, &spec.id).is_ok()
                && (faction_state.is_some_and(|state| state.funded.contains(&spec.id))
                    || effective_technology_cost(state, faction_id, &spec.id)
                        .is_ok_and(|cost| faction_total_gold(state, faction_id) >= cost))
        })
        .map(|spec| spec.id.clone())
}

pub fn faction_technology_bonuses(state: &GameState, faction_id: &str) -> TechnologyBonuses {
    let Some(faction_state) = state.technologies.get(faction_id) else {
        return TechnologyBonuses::default();
    };
    let mut bonuses = TechnologyBonuses::default();
    for technology_id in &faction_state.completed {
        if let Some(spec) = state.technology_catalog.spec(technology_id) {
            for effect in &spec.effects {
                apply_technology_effect(&mut bonuses, *effect);
            }
        }
    }
    bonuses
}

pub fn faction_technology_city_effects(state: &GameState, faction_id: &str) -> CityEconomyEffects {
    faction_technology_bonuses(state, faction_id).city_effects
}

pub fn technology_progress(state: &FactionTechnologyState, id: &str) -> u8 {
    state.progress.get(id).copied().unwrap_or_default()
}

pub fn missing_prerequisite_names(
    state: Option<&FactionTechnologyState>,
    catalog: &TechnologyCatalog,
    id: &str,
) -> Result<Vec<String>, TechnologyError> {
    let spec = catalog
        .spec(id)
        .ok_or_else(|| TechnologyError::UnknownTechnology(id.to_string()))?;
    Ok(spec
        .prerequisites
        .iter()
        .filter(|prerequisite| {
            !state.is_some_and(|state| state.completed.contains(prerequisite.as_str()))
        })
        .map(|prerequisite| {
            catalog
                .spec(prerequisite)
                .map(|spec| spec.name.clone())
                .unwrap_or_else(|| prerequisite.clone())
        })
        .collect())
}

fn deduct_faction_gold(state: &mut GameState, faction_id: &str, mut amount: i32) {
    let mut city_ids: Vec<_> = state
        .cities
        .values()
        .filter(|city| city.faction_id == faction_id && city.gold > 0)
        .map(|city| (city.id.clone(), city.gold))
        .collect();
    city_ids.sort_by(|(left_id, left_gold), (right_id, right_gold)| {
        right_gold
            .cmp(left_gold)
            .then_with(|| left_id.cmp(right_id))
    });

    for (city_id, _) in city_ids {
        if amount <= 0 {
            break;
        }
        let Some(city) = state.cities.get_mut(&city_id) else {
            continue;
        };
        let paid = city.gold.min(amount);
        city.gold -= paid;
        amount -= paid;
    }
}

fn apply_technology_effect(bonuses: &mut TechnologyBonuses, effect: TechnologyEffect) {
    match effect.kind {
        TechnologyEffectKind::CityGoldIncome => bonuses.city_effects.gold_income += effect.amount,
        TechnologyEffectKind::CityFoodIncome => bonuses.city_effects.food_income += effect.amount,
        TechnologyEffectKind::CityMaterialsIncome => {
            bonuses.city_effects.materials_income += effect.amount;
        }
        TechnologyEffectKind::CityGoldPercent => bonuses.city_effects.gold_percent += effect.amount,
        TechnologyEffectKind::CityFoodPercent => bonuses.city_effects.food_percent += effect.amount,
        TechnologyEffectKind::CityMaterialsPercent => {
            bonuses.city_effects.materials_percent += effect.amount;
        }
        TechnologyEffectKind::CityPopulationGrowth => {
            bonuses.city_effects.population_growth += effect.amount;
        }
        TechnologyEffectKind::CityTroopRecovery => {
            bonuses.city_effects.troop_recovery += effect.amount;
        }
        TechnologyEffectKind::CityOrder => bonuses.city_effects.order += effect.amount,
        TechnologyEffectKind::CityTraining => bonuses.city_effects.training += effect.amount,
        TechnologyEffectKind::CityDefense => bonuses.city_effects.defense += effect.amount,
        TechnologyEffectKind::CityUpkeepReductionPercent => {
            bonuses.city_effects.upkeep_reduction_percent += effect.amount;
        }
        TechnologyEffectKind::CityFoodUpkeepReductionPercent => {
            bonuses.city_effects.food_upkeep_reduction_percent += effect.amount;
        }
        TechnologyEffectKind::TrainingCommandBonus => {
            add_u8_bonus(&mut bonuses.training_command_bonus, effect.amount);
        }
        TechnologyEffectKind::DevelopmentBonus => {
            add_u16_bonus(&mut bonuses.development_bonus, effect.amount);
        }
        TechnologyEffectKind::AgricultureDevelopmentBonus => {
            add_u16_bonus(&mut bonuses.agriculture_development_bonus, effect.amount);
        }
        TechnologyEffectKind::CommerceDevelopmentBonus => {
            add_u16_bonus(&mut bonuses.commerce_development_bonus, effect.amount);
        }
        TechnologyEffectKind::OrderDevelopmentBonus => {
            add_u8_bonus(&mut bonuses.order_development_bonus, effect.amount);
        }
        TechnologyEffectKind::RecruitGoldDiscountPercent => {
            bonuses.recruit_gold_discount_percent += effect.amount;
        }
        TechnologyEffectKind::TravelMonthReduction => {
            add_u32_bonus(&mut bonuses.travel_month_reduction, effect.amount);
        }
        TechnologyEffectKind::AttackPercent => bonuses.attack_percent += effect.amount,
        TechnologyEffectKind::DefensePercent => bonuses.defense_percent += effect.amount,
        TechnologyEffectKind::SiegeAttackPercent => bonuses.siege_attack_percent += effect.amount,
        TechnologyEffectKind::BattleLossReductionPercent => {
            bonuses.battle_loss_reduction_percent += effect.amount;
        }
        TechnologyEffectKind::RetreatSurvivalPercent => {
            bonuses.retreat_survival_percent += effect.amount;
        }
        TechnologyEffectKind::ResearchCostReductionPercent => {
            bonuses.research_cost_reduction_percent += effect.amount;
        }
    }
}

fn add_u8_bonus(value: &mut u8, amount: i32) {
    if amount >= 0 {
        *value = value.saturating_add(amount.min(i32::from(u8::MAX)) as u8);
    } else {
        *value = value.saturating_sub(amount.unsigned_abs().min(u32::from(u8::MAX)) as u8);
    }
}

fn add_u16_bonus(value: &mut u16, amount: i32) {
    if amount >= 0 {
        *value = value.saturating_add(amount.min(i32::from(u16::MAX)) as u16);
    } else {
        *value = value.saturating_sub(amount.unsigned_abs().min(u32::from(u16::MAX)) as u16);
    }
}

fn add_u32_bonus(value: &mut u32, amount: i32) {
    if amount >= 0 {
        *value = value.saturating_add(amount as u32);
    } else {
        *value = value.saturating_sub(amount.unsigned_abs());
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ResearchStartOutcome {
    pub cost_paid: i32,
    pub resumed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TechnologyError {
    #[error("未知太学研习: {0}")]
    UnknownTechnology(String),
    #[error("{0} 已完成")]
    Completed(String),
    #[error("需要先完成 {0}")]
    MissingPrerequisite(String),
    #[error("金钱不足，太学研习立项需要 {required} 金，当前 {available} 金")]
    InsufficientGold { required: i32, available: i32 },
}
