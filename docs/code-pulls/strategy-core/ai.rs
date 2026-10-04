use super::city::{
    CITY_MAX_LEVEL, City, FacilityKind, city_core_upgrade_cost, facility_upgrade_cost,
};
use super::commands::{
    command_capacity_for_officer, expedition_monthly_supply_for_troops, resolve_command_batch,
    resolve_command_batch_with_generation, resolve_command_batch_with_history,
    resolve_command_batch_with_history_and_generation, validate_command_for_state,
};
use super::history_db::HistoricalCatalog;
use super::ids::{CityId, FactionId};
use super::model::*;
use super::officer::Officer;
use super::personnel::OfficerGenerationProvider;
use super::technology::ensure_faction_technology_states;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub trait AiProvider {
    fn decide(&self, request: AiDecisionRequest) -> AiDecisionResponse;
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct AiDecisionRequest {
    pub turn: u32,
    pub year: i32,
    pub month: u8,
    pub faction_id: FactionId,
    pub cities: Vec<City>,
    pub officers: Vec<Officer>,
    pub roads: Vec<Road>,
    pub army_movements: Vec<ArmyMovement>,
    pub diplomacy: Vec<DiplomaticRelation>,
}

impl AiDecisionRequest {
    pub fn from_state(state: &GameState, faction_id: &str) -> Self {
        Self {
            turn: state.turn,
            year: state.year,
            month: state.month,
            faction_id: faction_id.to_string(),
            cities: state.cities.values().cloned().collect(),
            officers: state.officers.values().cloned().collect(),
            roads: state.roads.clone(),
            army_movements: state.army_movements.clone(),
            diplomacy: state.diplomacy.values().cloned().collect(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiDecisionResponse {
    pub commands: Vec<Command>,
    pub diagnostics: Vec<String>,
}

impl AiDecisionResponse {
    pub fn empty(message: impl Into<String>) -> Self {
        Self {
            commands: Vec::new(),
            diagnostics: vec![message.into()],
        }
    }

    pub fn from_json_str(input: &str) -> Self {
        match serde_json::from_str(input) {
            Ok(response) => response,
            Err(error) => Self::empty(format!("AI JSON 解析失败: {error}")),
        }
    }
}

#[derive(Default)]
pub struct MockAiProvider {
    pub scripted: BTreeMap<FactionId, String>,
}

impl AiProvider for MockAiProvider {
    fn decide(&self, request: AiDecisionRequest) -> AiDecisionResponse {
        self.scripted
            .get(&request.faction_id)
            .map(|json| AiDecisionResponse::from_json_str(json))
            .unwrap_or_else(|| AiDecisionResponse::empty("Mock AI 无命令"))
    }
}

#[derive(Default)]
pub struct RuleBasedAiProvider;

impl AiProvider for RuleBasedAiProvider {
    fn decide(&self, request: AiDecisionRequest) -> AiDecisionResponse {
        let mut used_officers = BTreeSet::new();
        let mut commands = Vec::new();
        let mut diagnostics = Vec::new();

        for city in request
            .cities
            .iter()
            .filter(|city| city.faction_id == request.faction_id)
        {
            let officers: Vec<&Officer> = request
                .officers
                .iter()
                .filter(|officer| {
                    officer.faction_id == request.faction_id
                        && officer.is_active()
                        && officer.city_id.as_deref() == Some(city.id.as_str())
                        && !used_officers.contains(&officer.id)
                })
                .collect();
            if officers.is_empty() {
                diagnostics.push(format!("{} 无可行动武将", city.name));
                continue;
            }

            if let Some(target_id) = best_attack_target(&request, city) {
                let officer = best_leader(&officers);
                let troop_kind = dominant_troop_kind(city.troops);
                let assigned_troops = (city.troops.total() * 45 / 100)
                    .max(300)
                    .min(command_capacity_for_officer(officer))
                    .min(city.troops.get(troop_kind));
                let food_supply = ai_expedition_food_supply(
                    &request,
                    city,
                    &target_id,
                    troop_kind,
                    assigned_troops,
                );
                let Some(food_supply) = food_supply else {
                    diagnostics.push(format!("{} 存粮不足，暂缓出征", city.name));
                    continue;
                };
                used_officers.insert(officer.id.clone());
                commands.push(Command {
                    issuer_faction_id: request.faction_id.clone(),
                    city_id: city.id.clone(),
                    officer_id: Some(officer.id.clone()),
                    kind: CommandKind::Expedition {
                        target_city_id: target_id,
                        assignments: vec![ExpeditionAssignment::commander(
                            officer.id.clone(),
                            troop_kind,
                            assigned_troops,
                        )],
                        food_supply,
                    },
                });
                continue;
            }

            if let Some(kind) = best_construction_command(city) {
                let officer = best_politician(&officers);
                used_officers.insert(officer.id.clone());
                commands.push(Command {
                    issuer_faction_id: request.faction_id.clone(),
                    city_id: city.id.clone(),
                    officer_id: Some(officer.id.clone()),
                    kind,
                });
                continue;
            }

            if city.training < 55 && !city.troops.is_empty() && city.gold >= 40 {
                let officer = best_leader(&officers);
                used_officers.insert(officer.id.clone());
                commands.push(Command {
                    issuer_faction_id: request.faction_id.clone(),
                    city_id: city.id.clone(),
                    officer_id: Some(officer.id.clone()),
                    kind: CommandKind::Train,
                });
                continue;
            }

            if city.gold >= 80 && city.food >= 250 && city.population > 10_000 {
                let officer = best_politician(&officers);
                used_officers.insert(officer.id.clone());
                commands.push(Command {
                    issuer_faction_id: request.faction_id.clone(),
                    city_id: city.id.clone(),
                    officer_id: Some(officer.id.clone()),
                    kind: CommandKind::Recruit {
                        kind: TroopKind::Infantry,
                        amount: 800,
                    },
                });
                continue;
            }

            let officer = best_politician(&officers);
            used_officers.insert(officer.id.clone());
            commands.push(Command {
                issuer_faction_id: request.faction_id.clone(),
                city_id: city.id.clone(),
                officer_id: Some(officer.id.clone()),
                kind: CommandKind::Develop {
                    focus: if city.agriculture <= city.commerce {
                        DevelopmentFocus::Agriculture
                    } else {
                        DevelopmentFocus::Commerce
                    },
                },
            });
        }

        AiDecisionResponse {
            commands,
            diagnostics,
        }
    }
}

pub fn finish_turn_with_ai<P: AiProvider>(state: &mut GameState, provider: &P) -> TurnReport {
    ensure_faction_technology_states(state);
    let commands = pending_and_ai_commands(state, provider);
    resolve_command_batch(state, commands)
}

pub fn finish_turn_with_ai_with_generation<P: AiProvider>(
    state: &mut GameState,
    provider: &P,
    generator: &dyn OfficerGenerationProvider,
) -> TurnReport {
    ensure_faction_technology_states(state);
    let commands = pending_and_ai_commands(state, provider);
    resolve_command_batch_with_generation(state, commands, generator)
}

pub fn finish_turn_with_ai_with_history<P: AiProvider, C: HistoricalCatalog>(
    state: &mut GameState,
    provider: &P,
    catalog: &C,
) -> TurnReport {
    ensure_faction_technology_states(state);
    let commands = pending_and_ai_commands(state, provider);
    resolve_command_batch_with_history(state, commands, catalog)
}

pub fn finish_turn_with_ai_with_history_and_generation<P: AiProvider, C: HistoricalCatalog>(
    state: &mut GameState,
    provider: &P,
    catalog: &C,
    generator: &dyn OfficerGenerationProvider,
) -> TurnReport {
    ensure_faction_technology_states(state);
    let commands = pending_and_ai_commands(state, provider);
    resolve_command_batch_with_history_and_generation(state, commands, catalog, generator)
}

fn pending_and_ai_commands<P: AiProvider>(state: &GameState, provider: &P) -> Vec<Command> {
    let mut commands = state.pending_commands.clone();
    let ai_factions: Vec<FactionId> = state
        .factions
        .values()
        .filter(|faction| {
            faction.controlled_by == Controller::RuleAi && state.faction_alive(&faction.id)
        })
        .map(|faction| faction.id.clone())
        .collect();

    for faction_id in ai_factions {
        let request = AiDecisionRequest::from_state(state, &faction_id);
        let response = provider.decide(request);
        commands.extend(
            response
                .commands
                .into_iter()
                .filter(|command| command.issuer_faction_id == faction_id),
        );
    }
    commands
}

pub fn legal_ai_commands(state: &GameState, response: &AiDecisionResponse) -> Vec<Command> {
    response
        .commands
        .iter()
        .filter(|command| validate_command_for_state(state, command).is_ok())
        .cloned()
        .collect()
}

fn best_attack_target(request: &AiDecisionRequest, city: &City) -> Option<CityId> {
    if city.troops.total() < 1_200 || city.training < 45 {
        return None;
    }

    let adjacent = request.roads.iter().filter_map(|road| {
        if road.from == city.id {
            Some(road.to.as_str())
        } else if road.to == city.id {
            Some(road.from.as_str())
        } else {
            None
        }
    });

    adjacent
        .filter_map(|city_id| {
            request
                .cities
                .iter()
                .find(|candidate| candidate.id == city_id)
        })
        .filter(|target| target.faction_id != city.faction_id)
        .filter(|target| !has_incoming_expedition(request, &city.faction_id, &target.id))
        .filter(|target| !has_truce(request, &city.faction_id, &target.faction_id))
        .min_by_key(|target| target.troops.total() + u32::from(target.defense) * 8)
        .map(|target| target.id.clone())
}

fn ai_expedition_food_supply(
    request: &AiDecisionRequest,
    city: &City,
    target_id: &str,
    troop_kind: TroopKind,
    assigned_troops: u32,
) -> Option<u32> {
    if assigned_troops == 0 {
        return None;
    }
    let target = request
        .cities
        .iter()
        .find(|candidate| candidate.id == target_id)?;
    let distance_li = request.roads.iter().find_map(|road| {
        if road.from == city.id && road.to == target.id
            || road.from == target.id && road.to == city.id
        {
            Some(map_distance_li(city.position, target.position))
        } else {
            None
        }
    })?;
    let mut troops = TroopPool::default();
    troops.add(troop_kind, assigned_troops);
    let monthly_supply = expedition_monthly_supply_for_troops(troops);
    let travel_months = travel_months_for_distance(distance_li);
    let supply = monthly_supply.saturating_mul(travel_months.saturating_add(4));
    (city.food >= i32::try_from(supply).unwrap_or(i32::MAX)).then_some(supply)
}

fn dominant_troop_kind(troops: TroopPool) -> TroopKind {
    TroopKind::ALL
        .into_iter()
        .max_by_key(|kind| troops.get(*kind))
        .unwrap_or(TroopKind::Infantry)
}

fn has_incoming_expedition(request: &AiDecisionRequest, faction_id: &str, city_id: &str) -> bool {
    request.army_movements.iter().any(|movement| {
        movement.kind == ArmyMovementKind::Expedition
            && movement.issuer_faction_id == faction_id
            && movement.target_city_id == city_id
    })
}

fn best_construction_command(city: &City) -> Option<CommandKind> {
    if city.order >= 45 && city.level < CITY_MAX_LEVEL {
        let cost = city_core_upgrade_cost(city.level + 1);
        if city.facilities.len() >= city.facility_slots() && can_pay(city, cost) {
            return Some(CommandKind::UpgradeCityCore);
        }
    }

    for kind in preferred_new_facilities(city) {
        if city.has_facility(kind) || city.facilities.len() >= city.facility_slots() {
            continue;
        }
        let cost = facility_upgrade_cost(kind, 1);
        if can_pay(city, cost) {
            return Some(CommandKind::BuildFacility { kind });
        }
    }

    for kind in [
        FacilityKind::Farmland,
        FacilityKind::Market,
        FacilityKind::Workshop,
        FacilityKind::Barracks,
        FacilityKind::Walls,
        FacilityKind::Administration,
        FacilityKind::Granary,
        FacilityKind::Medical,
        FacilityKind::RelayStation,
    ] {
        let Some(facility) = city.facility(kind) else {
            continue;
        };
        if facility.level >= 5 || facility.level >= city.level {
            continue;
        }
        let target_level = facility.level + 1;
        let cost = facility_upgrade_cost(kind, target_level);
        if can_pay(city, cost) {
            return Some(CommandKind::BuildFacility { kind });
        }
    }

    if city.order >= 45 && city.level < CITY_MAX_LEVEL {
        let cost = city_core_upgrade_cost(city.level + 1);
        if can_pay(city, cost) {
            return Some(CommandKind::UpgradeCityCore);
        }
    }
    None
}

fn preferred_new_facilities(city: &City) -> Vec<FacilityKind> {
    let mut kinds = Vec::new();
    if city.food < city.population as i32 / 80 || city.agriculture <= city.commerce {
        kinds.push(FacilityKind::Farmland);
        kinds.push(FacilityKind::Irrigation);
        kinds.push(FacilityKind::Granary);
    }
    if city.materials < 300 {
        kinds.push(FacilityKind::Workshop);
        kinds.push(FacilityKind::Quarry);
    }
    if city.troops.total() >= 3_000 {
        kinds.push(FacilityKind::Barracks);
        kinds.push(FacilityKind::DrillGround);
    }
    if city.wounded_troops.total() >= 500 || city.troops.total() >= 5_000 {
        kinds.push(FacilityKind::Medical);
    }
    if city.defense < 180 {
        kinds.push(FacilityKind::Walls);
    }
    kinds.extend([
        FacilityKind::Market,
        FacilityKind::Administration,
        FacilityKind::TradeDepot,
        FacilityKind::RelayStation,
    ]);
    kinds
}

fn can_pay(city: &City, cost: super::city::ResourceCost) -> bool {
    city.gold >= cost.gold && city.food >= cost.food && city.materials >= cost.materials
}

fn has_truce(request: &AiDecisionRequest, a: &str, b: &str) -> bool {
    request
        .diplomacy
        .iter()
        .find(|relation| {
            (relation.faction_a == a && relation.faction_b == b)
                || (relation.faction_a == b && relation.faction_b == a)
        })
        .is_some_and(|relation| relation.has_active_truce(request.turn))
}

fn best_leader<'a>(officers: &'a [&Officer]) -> &'a Officer {
    officers
        .iter()
        .copied()
        .max_by_key(|officer| officer.stats.leadership)
        .unwrap()
}

fn best_politician<'a>(officers: &'a [&Officer]) -> &'a Officer {
    officers
        .iter()
        .copied()
        .max_by_key(|officer| officer.stats.politics)
        .unwrap()
}
