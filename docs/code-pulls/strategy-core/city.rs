use super::ids::{CityId, FactionId, OfficerId};
use super::model::{MapPosition, TroopPool};
use serde::{Deserialize, Serialize};

pub const CITY_MAX_LEVEL: u8 = 10;
pub const FACILITY_MAX_LEVEL: u8 = 5;
pub const ALL_FACILITY_KINDS: [FacilityKind; 13] = [
    FacilityKind::Farmland,
    FacilityKind::Irrigation,
    FacilityKind::Market,
    FacilityKind::TradeDepot,
    FacilityKind::Workshop,
    FacilityKind::Quarry,
    FacilityKind::Barracks,
    FacilityKind::DrillGround,
    FacilityKind::Walls,
    FacilityKind::Administration,
    FacilityKind::Granary,
    FacilityKind::RelayStation,
    FacilityKind::Medical,
];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum CityScale {
    County,
    Commandery,
    RegionalCapital,
    ImperialCapital,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum SourceConfidence {
    High,
    Medium,
    Low,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CityProfile {
    pub id: CityId,
    pub name: String,
    pub province: String,
    pub commandery: String,
    pub position: MapPosition,
    pub scale: CityScale,
    pub strategic_rank: u8,
    pub agriculture_base: u16,
    pub commerce_base: u16,
    pub defense_base: u16,
    pub population_min: u32,
    pub population_max: u32,
    pub confidence: SourceConfidence,
    pub notes: String,
}

pub trait CityProfileView {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn province(&self) -> &str;
    fn commandery(&self) -> &str;
    fn scale(&self) -> &CityScale;
    fn strategic_rank(&self) -> u8;
    fn confidence(&self) -> &SourceConfidence;
}

impl CityProfileView for CityProfile {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn province(&self) -> &str {
        &self.province
    }

    fn commandery(&self) -> &str {
        &self.commandery
    }

    fn scale(&self) -> &CityScale {
        &self.scale
    }

    fn strategic_rank(&self) -> u8 {
        self.strategic_rank
    }

    fn confidence(&self) -> &SourceConfidence {
        &self.confidence
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct City {
    pub id: CityId,
    pub name: String,
    pub faction_id: FactionId,
    pub position: MapPosition,
    pub level: u8,
    pub population: u32,
    pub gold: i32,
    pub food: i32,
    pub materials: i32,
    pub troops: TroopPool,
    #[serde(default)]
    pub wounded_troops: TroopPool,
    pub training: u8,
    pub agriculture: u16,
    pub commerce: u16,
    pub defense: u16,
    pub order: u8,
    pub facilities: Vec<CityFacility>,
    pub governor_id: Option<OfficerId>,
    pub profile: Option<CityProfile>,
}

impl City {
    pub fn clamp_fields(&mut self) {
        self.level = self.level.clamp(1, CITY_MAX_LEVEL);
        self.training = self.training.min(100);
        self.order = self.order.min(100);
        self.agriculture = self.agriculture.min(999);
        self.commerce = self.commerce.min(999);
        self.defense = self.defense.min(999);
        self.gold = self.gold.max(0);
        self.food = self.food.max(0);
        self.materials = self.materials.max(0);
        for facility in &mut self.facilities {
            facility.level = facility.level.clamp(1, FACILITY_MAX_LEVEL).min(self.level);
        }
        self.facilities.sort_by_key(|facility| facility.kind);
        self.facilities.dedup_by_key(|facility| facility.kind);
    }

    pub fn facility_slots(&self) -> usize {
        city_facility_slots(self.level)
    }

    pub fn facility(&self, kind: FacilityKind) -> Option<&CityFacility> {
        self.facilities
            .iter()
            .find(|facility| facility.kind == kind)
    }

    pub fn has_facility(&self, kind: FacilityKind) -> bool {
        self.facility(kind).is_some()
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum FacilityKind {
    Farmland,
    Irrigation,
    Market,
    TradeDepot,
    Workshop,
    Quarry,
    Barracks,
    DrillGround,
    Walls,
    Administration,
    Granary,
    RelayStation,
    Medical,
}

pub fn facility_kind_name(kind: FacilityKind) -> &'static str {
    match kind {
        FacilityKind::Farmland => "农田",
        FacilityKind::Irrigation => "水利",
        FacilityKind::Market => "市场",
        FacilityKind::TradeDepot => "商栈",
        FacilityKind::Workshop => "工坊",
        FacilityKind::Quarry => "采石场",
        FacilityKind::Barracks => "兵营",
        FacilityKind::DrillGround => "校场",
        FacilityKind::Walls => "城墙",
        FacilityKind::Administration => "官署",
        FacilityKind::Granary => "粮仓",
        FacilityKind::RelayStation => "驿站",
        FacilityKind::Medical => "医馆",
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CityFacility {
    pub kind: FacilityKind,
    pub level: u8,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ResourceCost {
    pub gold: i32,
    pub food: i32,
    pub materials: i32,
}

impl ResourceCost {
    pub fn scaled(self, factor: i32) -> Self {
        Self {
            gold: self.gold * factor,
            food: self.food * factor,
            materials: self.materials * factor,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CityEconomyEffects {
    pub gold_income: i32,
    pub food_income: i32,
    pub materials_income: i32,
    pub gold_percent: i32,
    pub food_percent: i32,
    pub materials_percent: i32,
    pub population_growth: i32,
    pub troop_recovery: i32,
    pub wounded_recovery: i32,
    pub order: i32,
    pub training: i32,
    pub defense: i32,
    pub gold_maintenance: i32,
    pub food_maintenance: i32,
    pub materials_maintenance: i32,
    pub upkeep_reduction_percent: i32,
    pub food_upkeep_reduction_percent: i32,
}

impl CityEconomyEffects {
    pub fn scaled(self, factor: i32) -> Self {
        Self {
            gold_income: self.gold_income * factor,
            food_income: self.food_income * factor,
            materials_income: self.materials_income * factor,
            gold_percent: self.gold_percent * factor,
            food_percent: self.food_percent * factor,
            materials_percent: self.materials_percent * factor,
            population_growth: self.population_growth * factor,
            troop_recovery: self.troop_recovery * factor,
            wounded_recovery: self.wounded_recovery * factor,
            order: self.order * factor,
            training: self.training * factor,
            defense: self.defense * factor,
            gold_maintenance: self.gold_maintenance * factor,
            food_maintenance: self.food_maintenance * factor,
            materials_maintenance: self.materials_maintenance * factor,
            upkeep_reduction_percent: self.upkeep_reduction_percent * factor,
            food_upkeep_reduction_percent: self.food_upkeep_reduction_percent * factor,
        }
    }

    pub fn add(&mut self, other: Self) {
        self.gold_income += other.gold_income;
        self.food_income += other.food_income;
        self.materials_income += other.materials_income;
        self.gold_percent += other.gold_percent;
        self.food_percent += other.food_percent;
        self.materials_percent += other.materials_percent;
        self.population_growth += other.population_growth;
        self.troop_recovery += other.troop_recovery;
        self.wounded_recovery += other.wounded_recovery;
        self.order += other.order;
        self.training += other.training;
        self.defense += other.defense;
        self.gold_maintenance += other.gold_maintenance;
        self.food_maintenance += other.food_maintenance;
        self.materials_maintenance += other.materials_maintenance;
        self.upkeep_reduction_percent += other.upkeep_reduction_percent;
        self.food_upkeep_reduction_percent += other.food_upkeep_reduction_percent;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FacilitySpec {
    pub kind: FacilityKind,
    pub base_cost: ResourceCost,
    pub monthly_per_level: CityEconomyEffects,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CityMonthlyProjection {
    pub gross_gold: i32,
    pub gross_food: i32,
    pub gross_materials: i32,
    pub facility_gold_maintenance: i32,
    pub facility_food_maintenance: i32,
    pub facility_materials_maintenance: i32,
    pub troop_food_upkeep: i32,
    pub officer_salary: i32,
    pub net_gold: i32,
    pub net_food: i32,
    pub net_materials: i32,
    pub population_delta: i32,
    pub troop_delta: i32,
    pub wounded_recovery: i32,
    pub order_delta: i32,
    pub training_delta: i32,
    pub defense_delta: i32,
}

pub fn city_facility_slots(level: u8) -> usize {
    match level.clamp(1, CITY_MAX_LEVEL) {
        1..=2 => 2,
        3..=4 => 3,
        5..=6 => 4,
        7..=8 => 5,
        _ => 6,
    }
}

pub fn city_core_upgrade_cost(next_level: u8) -> ResourceCost {
    let level = i32::from(next_level.clamp(2, CITY_MAX_LEVEL));
    ResourceCost {
        gold: 180 * level,
        food: 120 * level,
        materials: 90 * level,
    }
}

pub fn facility_spec(kind: FacilityKind) -> FacilitySpec {
    match kind {
        FacilityKind::Farmland => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 90,
                food: 20,
                materials: 55,
            },
            monthly_per_level: CityEconomyEffects {
                food_income: 18,
                food_percent: 3,
                population_growth: 4,
                gold_maintenance: 3,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Irrigation => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 105,
                food: 35,
                materials: 75,
            },
            monthly_per_level: CityEconomyEffects {
                food_income: 10,
                food_percent: 2,
                population_growth: 8,
                order: 1,
                gold_maintenance: 4,
                materials_maintenance: 1,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Market => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 120,
                food: 10,
                materials: 65,
            },
            monthly_per_level: CityEconomyEffects {
                gold_income: 18,
                gold_percent: 3,
                order: -1,
                gold_maintenance: 2,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::TradeDepot => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 135,
                food: 20,
                materials: 90,
            },
            monthly_per_level: CityEconomyEffects {
                gold_income: 14,
                gold_percent: 5,
                materials_income: 1,
                gold_maintenance: 5,
                food_maintenance: 2,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Workshop => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 130,
                food: 20,
                materials: 80,
            },
            monthly_per_level: CityEconomyEffects {
                gold_income: 8,
                materials_income: 8,
                materials_percent: 2,
                gold_maintenance: 4,
                food_maintenance: 1,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Quarry => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 115,
                food: 25,
                materials: 70,
            },
            monthly_per_level: CityEconomyEffects {
                materials_income: 12,
                defense: 2,
                gold_maintenance: 3,
                food_maintenance: 2,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Barracks => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 160,
                food: 70,
                materials: 120,
            },
            monthly_per_level: CityEconomyEffects {
                troop_recovery: 80,
                training: 1,
                order: -1,
                gold_maintenance: 8,
                food_maintenance: 3,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::DrillGround => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 145,
                food: 45,
                materials: 100,
            },
            monthly_per_level: CityEconomyEffects {
                troop_recovery: 55,
                training: 2,
                gold_maintenance: 7,
                food_maintenance: 2,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Walls => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 150,
                food: 25,
                materials: 130,
            },
            monthly_per_level: CityEconomyEffects {
                defense: 12,
                order: 1,
                gold_maintenance: 6,
                materials_maintenance: 1,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Administration => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 155,
                food: 35,
                materials: 110,
            },
            monthly_per_level: CityEconomyEffects {
                gold_percent: 2,
                order: 2,
                upkeep_reduction_percent: 2,
                gold_maintenance: 5,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Granary => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 110,
                food: 50,
                materials: 85,
            },
            monthly_per_level: CityEconomyEffects {
                food_income: 8,
                food_percent: 2,
                population_growth: 6,
                food_upkeep_reduction_percent: 3,
                gold_maintenance: 3,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::RelayStation => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 125,
                food: 30,
                materials: 95,
            },
            monthly_per_level: CityEconomyEffects {
                gold_income: 4,
                materials_income: 3,
                order: 1,
                upkeep_reduction_percent: 1,
                gold_maintenance: 4,
                food_maintenance: 1,
                ..CityEconomyEffects::default()
            },
        },
        FacilityKind::Medical => FacilitySpec {
            kind,
            base_cost: ResourceCost {
                gold: 140,
                food: 45,
                materials: 95,
            },
            monthly_per_level: CityEconomyEffects {
                wounded_recovery: 150,
                gold_maintenance: 5,
                food_maintenance: 2,
                ..CityEconomyEffects::default()
            },
        },
    }
}

pub fn facility_upgrade_cost(kind: FacilityKind, target_level: u8) -> ResourceCost {
    facility_spec(kind)
        .base_cost
        .scaled(i32::from(target_level.clamp(1, FACILITY_MAX_LEVEL)))
}

pub fn facility_monthly_effect(kind: FacilityKind, level: u8) -> CityEconomyEffects {
    facility_spec(kind)
        .monthly_per_level
        .scaled(i32::from(level.clamp(1, FACILITY_MAX_LEVEL)))
}

pub fn city_facility_effects(city: &City) -> CityEconomyEffects {
    let mut effects = CityEconomyEffects::default();
    for facility in &city.facilities {
        effects.add(facility_monthly_effect(facility.kind, facility.level));
    }
    effects
}

pub fn project_city_monthly_change(city: &City, officer_salary: i32) -> CityMonthlyProjection {
    project_city_monthly_change_with_effects(city, officer_salary, CityEconomyEffects::default())
}

pub fn project_city_monthly_change_with_effects(
    city: &City,
    officer_salary: i32,
    extra_effects: CityEconomyEffects,
) -> CityMonthlyProjection {
    let mut effects = city_facility_effects(city);
    effects.add(extra_effects);
    let level = i32::from(city.level.clamp(1, CITY_MAX_LEVEL));
    let base_gold = i32::from(city.commerce) / 4 + (city.population / 20_000) as i32 + level * 4;
    let base_food = i32::from(city.agriculture) / 3 + (city.population / 18_000) as i32 + level * 3;
    let base_materials = level + i32::from(city.defense) / 80 + level / 3;

    let gross_gold = base_gold + effects.gold_income + base_gold * effects.gold_percent / 100;
    let gross_food = base_food + effects.food_income + base_food * effects.food_percent / 100;
    let gross_materials = base_materials
        + effects.materials_income
        + base_materials * effects.materials_percent / 100;

    let gold_upkeep_reduction = effects.upkeep_reduction_percent.clamp(0, 60);
    let food_upkeep_reduction = effects.food_upkeep_reduction_percent.clamp(0, 60);
    let gold_cost =
        (effects.gold_maintenance + officer_salary).max(0) * (100 - gold_upkeep_reduction) / 100;
    let troop_food_upkeep = (city.troops.total() / 900) as i32;
    let food_cost =
        (effects.food_maintenance + troop_food_upkeep).max(0) * (100 - food_upkeep_reduction) / 100;
    let materials_cost = effects.materials_maintenance.max(0);

    let net_gold = gross_gold - gold_cost;
    let net_food = gross_food - food_cost;
    let net_materials = gross_materials - materials_cost;
    let food_after_income = city.food + net_food;
    let shortage_penalty = if food_after_income < 0 {
        food_after_income.abs() * 4
    } else {
        0
    };
    let population_delta = (i64::from(city.population) * i64::from(i32::from(city.order) - 45)
        / 10_000) as i32
        + effects.population_growth
        + net_food.max(0) / 4
        - shortage_penalty;
    let troop_delta = if effects.troop_recovery > 0
        && !city.troops.is_empty()
        && food_after_income > 0
    {
        effects.troop_recovery + (city.population / 50_000) as i32 + i32::from(city.training) / 50
    } else {
        0
    };
    let wounded_recovery = if !city.wounded_troops.is_empty() && food_after_income > 0 {
        (30 + (city.population / 100_000) as i32 + effects.wounded_recovery).max(0)
    } else {
        0
    };
    let order_delta =
        (1 + effects.order - i32::from(net_food < 0) - i32::from(net_gold < 0)).clamp(-6, 6);

    CityMonthlyProjection {
        gross_gold,
        gross_food,
        gross_materials,
        facility_gold_maintenance: effects.gold_maintenance,
        facility_food_maintenance: effects.food_maintenance,
        facility_materials_maintenance: effects.materials_maintenance,
        troop_food_upkeep,
        officer_salary,
        net_gold,
        net_food,
        net_materials,
        population_delta,
        troop_delta,
        wounded_recovery,
        order_delta,
        training_delta: effects.training,
        defense_delta: effects.defense,
    }
}

pub trait CityStateView {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn faction_id(&self) -> &str;
    fn population(&self) -> u32;
    fn troops(&self) -> u32;
    fn governor_id(&self) -> Option<&str>;
}

impl CityStateView for City {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn faction_id(&self) -> &str {
        &self.faction_id
    }

    fn population(&self) -> u32 {
        self.population
    }

    fn troops(&self) -> u32 {
        self.troops.total()
    }

    fn governor_id(&self) -> Option<&str> {
        self.governor_id.as_deref()
    }
}

pub trait CityCatalog {
    type Error;

    fn city_profiles(&self) -> Result<Vec<CityProfile>, Self::Error>;
    fn city_profile(&self, city_id: &str) -> Result<Option<CityProfile>, Self::Error>;
}
