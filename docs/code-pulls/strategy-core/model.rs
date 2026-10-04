use super::city::{City, FacilityKind, facility_kind_name};
use super::events::GameEvent;
use super::ids::{CityId, FactionId, OfficerId};
use super::officer::{Officer, OfficerTagDefinition};
use super::technology::{FactionTechnologyState, TechnologyCatalog};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const SAVE_VERSION: u32 = 8;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GameState {
    pub version: u32,
    pub scenario_id: String,
    pub scenario_name: String,
    #[serde(default)]
    pub scenario_era_name: String,
    pub year: i32,
    pub month: u8,
    pub turn: u32,
    pub player_faction_id: FactionId,
    pub factions: BTreeMap<FactionId, Faction>,
    pub cities: BTreeMap<CityId, City>,
    pub officers: BTreeMap<OfficerId, Officer>,
    #[serde(default)]
    pub officer_tag_definitions: Vec<OfficerTagDefinition>,
    #[serde(default)]
    pub officer_tag_aliases: BTreeMap<String, String>,
    pub roads: Vec<Road>,
    pub diplomacy: BTreeMap<String, DiplomaticRelation>,
    #[serde(default)]
    pub pending_diplomacy: Vec<DiplomacyOrder>,
    pub pending_commands: Vec<Command>,
    #[serde(default)]
    pub army_movements: Vec<ArmyMovement>,
    #[serde(default)]
    pub technologies: BTreeMap<FactionId, FactionTechnologyState>,
    #[serde(skip, default)]
    pub technology_catalog: TechnologyCatalog,
    #[serde(default)]
    pub events: Vec<GameEvent>,
    #[serde(default)]
    pub next_event_sequence: u64,
    #[serde(default)]
    pub dynamic_event_cooldowns: BTreeMap<String, u32>,
    #[serde(default)]
    pub marriages: Vec<Marriage>,
    #[serde(default)]
    pub family_relationships: Vec<FamilyRelationship>,
    #[serde(default)]
    pub next_generated_officer_sequence: u64,
    #[serde(default)]
    pub last_lifecycle_year: Option<i32>,
    #[serde(default)]
    pub officer_recruitments: Vec<OfficerRecruitmentTask>,
    #[serde(default)]
    pub next_officer_recruitment_sequence: u64,
    pub applied_event_ids: BTreeSet<String>,
    pub reports: Vec<TurnReport>,
    pub status: GameStatus,
}

impl GameState {
    pub fn scenario_title(&self) -> String {
        if self.scenario_era_name.trim().is_empty() {
            scenario_title_from_legacy_name(&self.scenario_name)
        } else {
            self.scenario_name.trim().to_string()
        }
    }

    pub fn scenario_full_name(&self) -> String {
        if self.scenario_era_name.trim().is_empty() {
            self.scenario_name.trim().to_string()
        } else {
            scenario_full_name(&self.scenario_era_name, &self.scenario_name)
        }
    }

    pub fn cities_for_faction(&self, faction_id: &str) -> Vec<&City> {
        self.cities
            .values()
            .filter(|city| city.faction_id == faction_id)
            .collect()
    }

    pub fn officers_in_city(&self, city_id: &str) -> Vec<&Officer> {
        self.officers
            .values()
            .filter(|officer| officer.is_active() && officer.city_id.as_deref() == Some(city_id))
            .collect()
    }

    pub fn faction_alive(&self, faction_id: &str) -> bool {
        self.cities
            .values()
            .any(|city| city.faction_id == faction_id)
    }

    pub fn are_adjacent(&self, a: &str, b: &str) -> bool {
        self.roads
            .iter()
            .any(|road| (road.from == a && road.to == b) || (road.from == b && road.to == a))
    }

    pub fn road_distance_li(&self, a: &str, b: &str) -> Option<u32> {
        if !self.are_adjacent(a, b) {
            return None;
        }
        let from = self.cities.get(a)?;
        let to = self.cities.get(b)?;
        Some(map_distance_li(from.position, to.position))
    }

    pub fn travel_months_between(&self, a: &str, b: &str) -> Option<u32> {
        self.road_distance_li(a, b).map(travel_months_for_distance)
    }

    pub fn relation(&self, a: &str, b: &str) -> Option<&DiplomaticRelation> {
        self.diplomacy.get(&diplomacy_key(a, b))
    }

    pub fn relation_mut(&mut self, a: &str, b: &str) -> &mut DiplomaticRelation {
        let key = diplomacy_key(a, b);
        self.diplomacy
            .entry(key)
            .or_insert_with(|| DiplomaticRelation::new(a.to_string(), b.to_string()))
    }

    pub fn pending_city_ids(&self) -> BTreeSet<&str> {
        self.pending_commands
            .iter()
            .map(|command| command.city_id.as_str())
            .collect()
    }

    pub fn pending_officer_ids(&self) -> BTreeSet<&str> {
        let mut ids = BTreeSet::new();
        for command in &self.pending_commands {
            command.collect_officer_ids(&mut ids);
        }
        for task in &self.officer_recruitments {
            ids.insert(task.recruiter_officer_id.as_str());
        }
        ids
    }

    pub fn advance_month(&mut self) {
        self.turn += 1;
        if self.month == 12 {
            self.month = 1;
            self.year += 1;
        } else {
            self.month += 1;
        }
    }

    pub fn refresh_status(&mut self) {
        if !self.faction_alive(&self.player_faction_id) {
            self.status = GameStatus::Defeat {
                reason: "玩家势力失去全部城池".to_string(),
            };
            return;
        }

        let player_owns_all = self
            .cities
            .values()
            .all(|city| city.faction_id == self.player_faction_id);
        if player_owns_all {
            self.status = GameStatus::Victory {
                reason: "玩家势力统一全部城池".to_string(),
            };
        }
    }
}

pub fn scenario_full_name(era_name: &str, name: &str) -> String {
    let era_name = era_name.trim();
    let name = name.trim();
    if era_name.is_empty() {
        name.to_string()
    } else if name.is_empty() {
        era_name.to_string()
    } else {
        format!("{era_name} {name}")
    }
}

fn scenario_title_from_legacy_name(name: &str) -> String {
    let trimmed = name.trim();
    if let Some((era, title)) = trimmed.split_once(' ') {
        if era.ends_with('年') && !title.trim().is_empty() {
            return title.trim().to_string();
        }
    }
    trimmed.to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GameStatus {
    Running,
    Victory { reason: String },
    Defeat { reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Faction {
    pub id: FactionId,
    pub name: String,
    pub ruler_id: OfficerId,
    #[serde(default)]
    pub heir_id: Option<OfficerId>,
    pub color: [f32; 3],
    pub selectable: bool,
    pub controlled_by: Controller,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Marriage {
    pub husband_id: OfficerId,
    pub wife_id: OfficerId,
    pub year: i32,
    pub month: u8,
}

impl Marriage {
    pub fn new(husband_id: OfficerId, wife_id: OfficerId, year: i32, month: u8) -> Self {
        Self {
            husband_id,
            wife_id,
            year,
            month,
        }
    }

    pub fn involves(&self, officer_id: &str) -> bool {
        self.husband_id == officer_id || self.wife_id == officer_id
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FamilyRelationship {
    pub parent_id: OfficerId,
    pub child_id: OfficerId,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum Controller {
    Player,
    RuleAi,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficerRecruitmentTask {
    pub id: String,
    pub issuer_faction_id: FactionId,
    pub source_city_id: CityId,
    pub recruiter_officer_id: OfficerId,
    pub target_officer_id: OfficerId,
    pub progress: u8,
    pub attempt_months: u32,
    pub started_turn: u32,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct MapPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Road {
    pub from: CityId,
    pub to: CityId,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ArmyMovement {
    pub kind: ArmyMovementKind,
    pub issuer_faction_id: FactionId,
    pub source_city_id: CityId,
    pub target_city_id: CityId,
    pub commander_id: OfficerId,
    pub officer_ids: Vec<OfficerId>,
    pub troops: TroopPool,
    #[serde(default)]
    pub food_supply: u32,
    #[serde(default)]
    pub wounded_troops: TroopPool,
    #[serde(default)]
    pub assignments: Vec<ExpeditionAssignment>,
    #[serde(default)]
    pub siege_started_turn: Option<u32>,
    pub training: u8,
    pub distance_li: u32,
    pub departure_turn: u32,
    pub arrival_turn: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ArmyMovementKind {
    Transfer,
    Expedition,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TroopKind {
    Infantry,
    Cavalry,
    Archers,
}

impl TroopKind {
    pub const ALL: [TroopKind; 3] = [TroopKind::Infantry, TroopKind::Cavalry, TroopKind::Archers];

    pub fn label(self) -> &'static str {
        match self {
            TroopKind::Infantry => "步兵",
            TroopKind::Cavalry => "骑兵",
            TroopKind::Archers => "弓兵",
        }
    }

    pub fn counters(self) -> Self {
        match self {
            TroopKind::Infantry => TroopKind::Cavalry,
            TroopKind::Cavalry => TroopKind::Archers,
            TroopKind::Archers => TroopKind::Infantry,
        }
    }

    pub fn countered_by(self) -> Self {
        match self {
            TroopKind::Infantry => TroopKind::Archers,
            TroopKind::Cavalry => TroopKind::Infantry,
            TroopKind::Archers => TroopKind::Cavalry,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TroopPool {
    pub infantry: u32,
    pub cavalry: u32,
    pub archers: u32,
}

impl TroopPool {
    pub const fn new(infantry: u32, cavalry: u32, archers: u32) -> Self {
        Self {
            infantry,
            cavalry,
            archers,
        }
    }

    pub fn from_total(total: u32) -> Self {
        let infantry = total.saturating_mul(55) / 100;
        let archers = total.saturating_mul(30) / 100;
        let cavalry = total.saturating_sub(infantry).saturating_sub(archers);
        Self {
            infantry,
            cavalry,
            archers,
        }
    }

    pub fn total(self) -> u32 {
        self.infantry
            .saturating_add(self.cavalry)
            .saturating_add(self.archers)
    }

    pub fn is_empty(self) -> bool {
        self.total() == 0
    }

    pub fn get(self, kind: TroopKind) -> u32 {
        match kind {
            TroopKind::Infantry => self.infantry,
            TroopKind::Cavalry => self.cavalry,
            TroopKind::Archers => self.archers,
        }
    }

    pub fn set(&mut self, kind: TroopKind, value: u32) {
        match kind {
            TroopKind::Infantry => self.infantry = value,
            TroopKind::Cavalry => self.cavalry = value,
            TroopKind::Archers => self.archers = value,
        }
    }

    pub fn add(&mut self, kind: TroopKind, value: u32) {
        self.set(kind, self.get(kind).saturating_add(value));
    }

    pub fn add_pool(&mut self, other: Self) {
        self.infantry = self.infantry.saturating_add(other.infantry);
        self.cavalry = self.cavalry.saturating_add(other.cavalry);
        self.archers = self.archers.saturating_add(other.archers);
    }

    pub fn checked_sub_pool(&self, other: Self) -> Option<Self> {
        Some(Self {
            infantry: self.infantry.checked_sub(other.infantry)?,
            cavalry: self.cavalry.checked_sub(other.cavalry)?,
            archers: self.archers.checked_sub(other.archers)?,
        })
    }

    pub fn saturating_sub_pool(&mut self, other: Self) {
        self.infantry = self.infantry.saturating_sub(other.infantry);
        self.cavalry = self.cavalry.saturating_sub(other.cavalry);
        self.archers = self.archers.saturating_sub(other.archers);
    }

    pub fn add_total_preserving_ratio(&mut self, amount: u32) {
        if amount == 0 {
            return;
        }
        if self.is_empty() {
            self.add_pool(Self::from_total(amount));
            return;
        }
        let total = self.total();
        let infantry = amount.saturating_mul(self.infantry) / total;
        let cavalry = amount.saturating_mul(self.cavalry) / total;
        let archers = amount.saturating_sub(infantry).saturating_sub(cavalry);
        self.infantry = self.infantry.saturating_add(infantry);
        self.cavalry = self.cavalry.saturating_add(cavalry);
        self.archers = self.archers.saturating_add(archers);
    }

    pub fn loss_pool(self, loss: u32) -> Self {
        let loss = loss.min(self.total());
        if loss == 0 || self.is_empty() {
            return Self::default();
        }
        let total = self.total();
        let infantry = (self.infantry.saturating_mul(loss) / total).min(self.infantry);
        let cavalry = (self.cavalry.saturating_mul(loss) / total).min(self.cavalry);
        let archers = loss
            .saturating_sub(infantry)
            .saturating_sub(cavalry)
            .min(self.archers);
        let mut allocated = infantry.saturating_add(cavalry).saturating_add(archers);
        let mut pool = Self {
            infantry,
            cavalry,
            archers,
        };
        for kind in TroopKind::ALL {
            if allocated >= loss {
                break;
            }
            let available = self.get(kind).saturating_sub(pool.get(kind));
            let extra = available.min(loss - allocated);
            pool.add(kind, extra);
            allocated += extra;
        }
        pool
    }

    pub fn surviving_after_loss(self, loss: u32) -> Self {
        let mut surviving = self;
        surviving.saturating_sub_pool(self.loss_pool(loss));
        surviving
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ExpeditionRole {
    Commander,
    Deputy,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExpeditionAssignment {
    pub officer_id: OfficerId,
    pub role: ExpeditionRole,
    pub troop_kind: TroopKind,
    pub troops: u32,
}

impl ExpeditionAssignment {
    pub fn commander(officer_id: OfficerId, troop_kind: TroopKind, troops: u32) -> Self {
        Self {
            officer_id,
            role: ExpeditionRole::Commander,
            troop_kind,
            troops,
        }
    }

    pub fn deputy(officer_id: OfficerId, troop_kind: TroopKind, troops: u32) -> Self {
        Self {
            officer_id,
            role: ExpeditionRole::Deputy,
            troop_kind,
            troops,
        }
    }
}

pub const MAP_COORDINATE_LI: f32 = 4.0;
pub const MARCH_LI_PER_MONTH: u32 = 500;
pub const MAX_TRAVEL_MONTHS: u32 = 3;

pub fn map_distance_li(a: MapPosition, b: MapPosition) -> u32 {
    (((a.x - b.x).hypot(a.y - b.y)) * MAP_COORDINATE_LI)
        .round()
        .max(1.0) as u32
}

pub fn travel_months_for_distance(distance_li: u32) -> u32 {
    distance_li
        .div_ceil(MARCH_LI_PER_MONTH)
        .clamp(1, MAX_TRAVEL_MONTHS)
}

pub fn deterministic_index_seed(seed: &str, key: &str, salt: &str, len: usize) -> usize {
    if len == 0 {
        return 0;
    }
    deterministic_hash_seed(seed, key, salt) as usize % len
}

pub fn deterministic_percent_seed(seed: &str, key: &str, salt: &str) -> u32 {
    (deterministic_hash_seed(seed, key, salt) % 100) as u32
}

pub fn deterministic_hash_seed(seed: &str, key: &str, salt: &str) -> u64 {
    let input = format!("{seed}:{key}:{salt}");
    let mut hash = 14_695_981_039_346_656_037_u64;
    for byte in input.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    hash
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiplomaticRelation {
    pub faction_a: FactionId,
    pub faction_b: FactionId,
    pub score: i16,
    pub truce_until_turn: Option<u32>,
    #[serde(default)]
    pub passage_rights: BTreeMap<FactionId, u32>,
}

impl DiplomaticRelation {
    pub fn new(faction_a: FactionId, faction_b: FactionId) -> Self {
        Self {
            faction_a,
            faction_b,
            score: 0,
            truce_until_turn: None,
            passage_rights: BTreeMap::new(),
        }
    }

    pub fn has_active_truce(&self, turn: u32) -> bool {
        self.truce_until_turn.is_some_and(|until| until >= turn)
    }

    pub fn has_passage_right(&self, faction_id: &str, turn: u32) -> bool {
        self.passage_rights
            .get(faction_id)
            .is_some_and(|until| *until >= turn)
    }

    pub fn is_hostile(&self) -> bool {
        self.score <= -80 && self.truce_until_turn.is_none() && self.passage_rights.is_empty()
    }

    pub fn mark_hostile(&mut self, faction_a: &str, faction_b: &str) {
        self.score = -80;
        self.truce_until_turn = None;
        self.passage_rights.remove(faction_a);
        self.passage_rights.remove(faction_b);
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResourceBundle {
    #[serde(default)]
    pub gold: i32,
    #[serde(default)]
    pub food: i32,
    #[serde(default)]
    pub materials: i32,
}

impl ResourceBundle {
    pub fn is_empty(&self) -> bool {
        self.gold <= 0 && self.food <= 0 && self.materials <= 0
    }

    pub fn value(&self) -> i32 {
        self.gold.max(0) + self.food.max(0) / 2 + self.materials.max(0) * 2
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DiplomacyActionKind {
    ImproveRelations,
    RequestPeace,
    Truce,
    DeclareWar,
    PassageRight,
    ResourceExchange,
}

impl DiplomacyActionKind {
    pub const ALL: [Self; 6] = [
        Self::ImproveRelations,
        Self::RequestPeace,
        Self::Truce,
        Self::DeclareWar,
        Self::PassageRight,
        Self::ResourceExchange,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::ImproveRelations => "修好",
            Self::RequestPeace => "求和",
            Self::Truce => "停战",
            Self::DeclareWar => "宣战",
            Self::PassageRight => "借道",
            Self::ResourceExchange => "互市",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiplomacyOrder {
    pub issuer_faction_id: FactionId,
    pub target_faction_id: FactionId,
    pub kind: DiplomacyActionKind,
    pub source_city_id: CityId,
    pub receive_city_id: CityId,
    #[serde(default)]
    pub offer: ResourceBundle,
    #[serde(default)]
    pub request: ResourceBundle,
    pub submitted_turn: u32,
}

impl DiplomacyOrder {
    pub fn summary(&self) -> String {
        format!("合纵 {} {}", self.target_faction_id, self.kind.label())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Command {
    pub issuer_faction_id: FactionId,
    pub city_id: CityId,
    pub officer_id: Option<OfficerId>,
    pub kind: CommandKind,
}

impl Command {
    pub fn summary(&self) -> String {
        match &self.kind {
            CommandKind::Develop { focus } => format!("开发 {}", focus.label()),
            CommandKind::UpgradeCityCore => "升级城镇核心".to_string(),
            CommandKind::BuildFacility { kind } => {
                format!("建设设施 {}", facility_kind_name(*kind))
            }
            CommandKind::Recruit { kind, amount } => format!("征兵 {} {amount}", kind.label()),
            CommandKind::Train => "训练".to_string(),
            CommandKind::AppointGovernor { target_officer_id } => {
                format!("任命太守 {target_officer_id}")
            }
            CommandKind::Transfer {
                target_city_id,
                troops,
                officer_ids,
            } => format!(
                "调动到 {target_city_id}: 兵力 {}, 武将 {}",
                troops.total(),
                officer_ids.len()
            ),
            CommandKind::Expedition {
                target_city_id,
                assignments,
                food_supply,
            } => {
                let troops: u32 = assignments.iter().map(|assignment| assignment.troops).sum();
                format!(
                    "出征 {target_city_id}: {troops}, 粮草 {food_supply}, 武将 {}",
                    assignments.len(),
                )
            }
            CommandKind::Diplomacy {
                target_faction_id,
                proposal,
            } => format!("外交 {target_faction_id} {proposal:?}"),
        }
    }

    pub fn collect_officer_ids<'a>(&'a self, ids: &mut BTreeSet<&'a str>) {
        if let Some(officer_id) = self.officer_id.as_deref() {
            ids.insert(officer_id);
        }
        match &self.kind {
            CommandKind::Transfer { officer_ids, .. } => {
                for officer_id in officer_ids {
                    ids.insert(officer_id);
                }
            }
            CommandKind::Expedition { assignments, .. } => {
                for assignment in assignments {
                    ids.insert(&assignment.officer_id);
                }
            }
            _ => {}
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommandKind {
    Develop {
        focus: DevelopmentFocus,
    },
    UpgradeCityCore,
    BuildFacility {
        kind: FacilityKind,
    },
    Recruit {
        kind: TroopKind,
        amount: u32,
    },
    Train,
    AppointGovernor {
        target_officer_id: OfficerId,
    },
    Transfer {
        target_city_id: CityId,
        troops: TroopPool,
        officer_ids: Vec<OfficerId>,
    },
    Expedition {
        target_city_id: CityId,
        assignments: Vec<ExpeditionAssignment>,
        #[serde(default)]
        food_supply: u32,
    },
    Diplomacy {
        target_faction_id: FactionId,
        proposal: DiplomacyProposal,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DevelopmentFocus {
    Agriculture,
    Commerce,
    Defense,
    Order,
}

impl DevelopmentFocus {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Agriculture => "农业",
            Self::Commerce => "商业",
            Self::Defense => "防御",
            Self::Order => "治安",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DiplomacyProposal {
    ImproveRelations,
    Truce,
    DeclareWar,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TurnReport {
    pub turn: u32,
    pub year: i32,
    pub month: u8,
    pub entries: Vec<ReportEntry>,
}

impl TurnReport {
    pub fn new(state: &GameState) -> Self {
        Self {
            turn: state.turn,
            year: state.year,
            month: state.month,
            entries: Vec::new(),
        }
    }

    pub fn info(&mut self, message: impl Into<String>) {
        self.entries.push(ReportEntry {
            severity: ReportSeverity::Info,
            message: message.into(),
        });
    }

    pub fn warning(&mut self, message: impl Into<String>) {
        self.entries.push(ReportEntry {
            severity: ReportSeverity::Warning,
            message: message.into(),
        });
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReportEntry {
    pub severity: ReportSeverity,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReportSeverity {
    Info,
    Warning,
}

pub fn diplomacy_key(a: &str, b: &str) -> String {
    if a <= b {
        format!("{a}|{b}")
    } else {
        format!("{b}|{a}")
    }
}
