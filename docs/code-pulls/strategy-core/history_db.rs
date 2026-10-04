use super::city::{
    City, CityCatalog, CityFacility, CityProfile, CityScale, FacilityKind, SourceConfidence,
    city_facility_slots,
};
use super::events::{
    DynamicEventChoice, DynamicEventCondition, DynamicEventConditionKind, DynamicEventEffect,
    DynamicEventEffectKind, DynamicEventRequirement, DynamicEventRequirementKind,
    DynamicEventTargetScope, DynamicEventTemplate, DynamicEventWeightModifier, EventChoiceEffects,
    EventChoiceRequirements, GameEventKind, GameEventScope, GameEventSeverity,
};
use super::ids::{CityId, FactionId, OfficerId, ScenarioId, WILD_FACTION_ID};
use super::model::{
    Controller, DiplomaticRelation, Faction, GameState, GameStatus, MapPosition, Road,
    SAVE_VERSION, TroopPool, deterministic_index_seed, diplomacy_key, scenario_full_name,
};
use super::officer::{
    Officer, OfficerCatalog, OfficerGender, OfficerProfile, OfficerProfileUpdate,
    OfficerRelationship, OfficerRelationshipKind, OfficerStats, OfficerStatus, OfficerTagCategory,
    OfficerTagDefinition,
};
use super::personnel::normalize_personnel_state;
use super::technology::{
    FactionTechnologyState, TechnologyBranch, TechnologyCatalog, TechnologyEffect,
    TechnologyEffectKind, TechnologySpec,
};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions, SqliteRow};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};

const HISTORY_DB_FILE_NAME: &str = "database.sqlite";
static HISTORY_DB_MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
const REQUIRED_HISTORY_TABLES: &[&str] = &[
    "cities",
    "factions",
    "officers",
    "officer_tag_definitions",
    "officer_tag_aliases",
    "officer_tags",
    "officer_external_ids",
    "officer_relationships",
    "roads",
    "scenarios",
    "scenario_faction_states",
    "scenario_city_states",
    "officer_life_events",
    "scenario_diplomacy",
    "dynamic_event_templates",
    "dynamic_event_conditions",
    "dynamic_event_weight_modifiers",
    "dynamic_event_choices",
    "dynamic_event_choice_requirements",
    "dynamic_event_choice_effects",
    "technologies",
    "technology_prerequisites",
    "technology_effects",
];
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoricalScenario {
    pub id: ScenarioId,
    pub name: String,
    pub era_name: String,
    pub year: i32,
    pub month: u8,
}

impl HistoricalScenario {
    pub fn full_name(&self) -> String {
        scenario_full_name(&self.era_name, &self.name)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct LifeEvent {
    pub id: String,
    pub officer_id: OfficerId,
    pub year: i32,
    pub month: u8,
    pub kind: LifeEventKind,
    pub faction_id: Option<FactionId>,
    pub city_id: Option<CityId>,
    pub loyalty: Option<u8>,
    pub notes: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum LifeEventKind {
    Appear,
    ServeFaction,
    MoveToCity,
    BecomeUnavailable,
    Die,
}

pub trait HistoricalCatalog:
    CityCatalog<Error = HistoryDbError> + OfficerCatalog<Error = HistoryDbError>
{
    fn scenarios(&self) -> Result<Vec<HistoricalScenario>, HistoryDbError>;
    fn selectable_factions(&self, scenario_id: &str) -> Result<Vec<Faction>, HistoryDbError>;
    fn build_game(
        &self,
        scenario_id: &str,
        player_faction_id: &str,
    ) -> Result<GameState, HistoryDbError>;
    fn technology_catalog(&self) -> Result<TechnologyCatalog, HistoryDbError>;
    fn life_events_until(&self, year: i32, month: u8) -> Result<Vec<LifeEvent>, HistoryDbError>;
    fn dynamic_event_templates(&self) -> Result<Vec<DynamicEventTemplate>, HistoryDbError>;
}

pub struct SqliteHistoricalCatalog {
    pool: SqlitePool,
    runtime: tokio::runtime::Runtime,
}

impl SqliteHistoricalCatalog {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, HistoryDbError> {
        let runtime = history_db_runtime()?;
        let pool = runtime.block_on(async {
            let pool = open_history_pool(path.as_ref(), false).await?;
            validate_history_database(&pool).await?;
            Ok::<_, HistoryDbError>(pool)
        })?;
        Ok(Self { pool, runtime })
    }

    pub fn open_or_create(path: impl AsRef<Path>) -> Result<Self, HistoryDbError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(HistoryDbError::Io)?;
        }
        let runtime = history_db_runtime()?;
        let pool = runtime.block_on(async {
            let pool = open_history_pool(path, true).await?;
            run_history_migrations(&pool).await?;
            validate_history_database(&pool).await?;
            Ok::<_, HistoryDbError>(pool)
        })?;
        Ok(Self { pool, runtime })
    }

    pub fn open_default() -> Result<Self, HistoryDbError> {
        Self::open_or_create(Self::default_path())
    }

    pub fn open_asset() -> Result<Self, HistoryDbError> {
        Self::open_default()
    }

    pub fn default_path() -> PathBuf {
        Self::database_path_in(Self::default_data_dir())
    }

    pub fn default_data_dir() -> PathBuf {
        ProjectDirs::from("", "", "Shogun")
            .map(|dirs| dirs.data_local_dir().to_path_buf())
            .unwrap_or_else(Self::fallback_data_dir)
    }

    pub fn fallback_data_dir() -> PathBuf {
        PathBuf::from(".shogun_data")
    }

    pub fn database_path_in(data_dir: impl AsRef<Path>) -> PathBuf {
        data_dir.as_ref().join(HISTORY_DB_FILE_NAME)
    }

    pub fn in_memory_from_seed() -> Result<Self, HistoryDbError> {
        let runtime = history_db_runtime()?;
        let pool = runtime.block_on(async {
            let pool = open_memory_history_pool().await?;
            run_history_migrations(&pool).await?;
            validate_history_database(&pool).await?;
            Ok::<_, HistoryDbError>(pool)
        })?;
        Ok(Self { pool, runtime })
    }

    fn block_on<F: Future>(&self, future: F) -> F::Output {
        self.runtime.block_on(future)
    }

    pub fn officer_relationships(
        &self,
        officer_id: &str,
    ) -> Result<Vec<OfficerRelationship>, HistoryDbError> {
        self.block_on(async { officer_relationships(&self.pool, officer_id).await })
    }

    pub fn update_officer_profile(
        &self,
        officer_id: &str,
        update: &OfficerProfileUpdate,
    ) -> Result<OfficerProfile, HistoryDbError> {
        validate_officer_profile_update(update)?;
        let name = update.name.trim();
        let courtesy_name = trimmed_optional(&update.courtesy_name);
        let native_place = trimmed_optional(&update.native_place);
        let biography = update.biography.trim();
        let notes = update.notes.trim();
        let tag_ids =
            self.block_on(async { normalize_officer_tag_ids(&self.pool, &update.tags).await })?;
        let rows_affected = self.block_on(async {
            let mut tx = self.pool.begin().await.map_err(HistoryDbError::Sqlx)?;
            let rows_affected = sqlx::query(
                "UPDATE officers
                 SET name = ?1,
                     courtesy_name = ?2,
                     native_place = ?3,
                     birth_year = ?4,
                     death_year = ?5,
                     gender = ?6,
                     leadership = ?7,
                     strength = ?8,
                     intelligence = ?9,
                     politics = ?10,
                     charm = ?11,
                     confidence = ?12,
                     biography = ?13,
                     notes = ?14
                 WHERE id = ?15",
            )
            .bind(name)
            .bind(courtesy_name.as_deref())
            .bind(native_place.as_deref())
            .bind(update.birth_year)
            .bind(update.death_year)
            .bind(gender_value(&update.gender))
            .bind(i64::from(update.stats.leadership))
            .bind(i64::from(update.stats.strength))
            .bind(i64::from(update.stats.intelligence))
            .bind(i64::from(update.stats.politics))
            .bind(i64::from(update.stats.charm))
            .bind(confidence_value(&update.confidence))
            .bind(biography)
            .bind(notes)
            .bind(officer_id)
            .execute(&mut *tx)
            .await
            .map(|result| result.rows_affected())
            .map_err(HistoryDbError::Sqlx)?;
            if rows_affected == 0 {
                tx.rollback().await.map_err(HistoryDbError::Sqlx)?;
                return Ok::<u64, HistoryDbError>(0);
            }
            sqlx::query("DELETE FROM officer_tags WHERE officer_id = ?1")
                .bind(officer_id)
                .execute(&mut *tx)
                .await
                .map_err(HistoryDbError::Sqlx)?;
            for tag_id in &tag_ids {
                sqlx::query(
                    "INSERT INTO officer_tags (officer_id, tag_id)
                     VALUES (?1, ?2)",
                )
                .bind(officer_id)
                .bind(tag_id)
                .execute(&mut *tx)
                .await
                .map_err(HistoryDbError::Sqlx)?;
            }
            tx.commit().await.map_err(HistoryDbError::Sqlx)?;
            Ok(rows_affected)
        })?;
        if rows_affected == 0 {
            return Err(HistoryDbError::Invalid(format!("武将 {officer_id} 不存在")));
        }
        self.officer_profile(officer_id)?
            .ok_or_else(|| HistoryDbError::Invalid(format!("武将 {officer_id} 不存在")))
    }
}

pub fn build_history_database(path: impl AsRef<Path>) -> Result<(), HistoryDbError> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(HistoryDbError::Io)?;
    }
    if path.exists() {
        fs::remove_file(path).map_err(HistoryDbError::Io)?;
    }

    let runtime = history_db_runtime()?;
    runtime.block_on(async {
        let pool = open_history_pool(path, true).await?;
        run_history_migrations(&pool).await?;
        validate_history_database(&pool).await?;
        pool.close().await;
        Ok(())
    })
}

fn history_db_runtime() -> Result<tokio::runtime::Runtime, HistoryDbError> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(HistoryDbError::Runtime)
}

async fn open_history_pool(
    path: &Path,
    create_if_missing: bool,
) -> Result<SqlitePool, HistoryDbError> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(create_if_missing)
        .foreign_keys(true);
    open_pool_with_options(options).await
}

async fn open_memory_history_pool() -> Result<SqlitePool, HistoryDbError> {
    let options = SqliteConnectOptions::new()
        .in_memory(true)
        .shared_cache(true)
        .foreign_keys(true);
    open_pool_with_options(options).await
}

async fn open_pool_with_options(
    options: SqliteConnectOptions,
) -> Result<SqlitePool, HistoryDbError> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(HistoryDbError::Sqlx)
}

async fn run_history_migrations(pool: &SqlitePool) -> Result<(), HistoryDbError> {
    HISTORY_DB_MIGRATOR
        .run(pool)
        .await
        .map_err(HistoryDbError::Migrate)
}

async fn validate_history_database(pool: &SqlitePool) -> Result<(), HistoryDbError> {
    validate_required_tables(pool).await?;
    validate_foreign_keys(pool).await?;
    validate_officer_tags(pool).await
}

async fn validate_required_tables(pool: &SqlitePool) -> Result<(), HistoryDbError> {
    validate_tables(pool, REQUIRED_HISTORY_TABLES).await
}

async fn validate_tables(
    pool: &SqlitePool,
    required_tables: &[&str],
) -> Result<(), HistoryDbError> {
    let tables = history_table_names(pool).await?;
    let missing = required_tables
        .iter()
        .copied()
        .filter(|table| !tables.contains(*table))
        .collect::<Vec<_>>();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(HistoryDbError::Invalid(format!(
            "历史资料库缺少表: {}",
            missing.join(", ")
        )))
    }
}

async fn history_table_names(pool: &SqlitePool) -> Result<BTreeSet<String>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    Ok(rows.into_iter().map(|row| row.get("name")).collect())
}

async fn validate_foreign_keys(pool: &SqlitePool) -> Result<(), HistoryDbError> {
    let rows = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(pool)
        .await
        .map_err(HistoryDbError::Sqlx)?;
    if rows.is_empty() {
        Ok(())
    } else {
        Err(HistoryDbError::Invalid(
            "历史资料库外键校验失败".to_string(),
        ))
    }
}

async fn validate_officer_tags(pool: &SqlitePool) -> Result<(), HistoryDbError> {
    let orphan_count = sqlx::query(
        "SELECT count(*) AS count
         FROM officer_tags t
         LEFT JOIN officers o ON o.id = t.officer_id
         LEFT JOIN officer_tag_definitions d ON d.id = t.tag_id
         WHERE o.id IS NULL OR d.id IS NULL",
    )
    .fetch_one(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?
    .get::<i64, _>("count");
    if orphan_count == 0 {
        Ok(())
    } else {
        Err(HistoryDbError::Invalid(
            "历史资料库武将标签存在孤儿引用".to_string(),
        ))
    }
}

impl CityCatalog for SqliteHistoricalCatalog {
    type Error = HistoryDbError;

    fn city_profiles(&self) -> Result<Vec<CityProfile>, Self::Error> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT id, name, province, commandery, x, y, scale, strategic_rank,
                        agriculture_base, commerce_base, defense_base, population_min,
                        population_max, confidence, notes
                 FROM cities
                 ORDER BY province, commandery, name",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            rows.into_iter().map(city_profile_from_row).collect()
        })
    }

    fn city_profile(&self, city_id: &str) -> Result<Option<CityProfile>, Self::Error> {
        self.block_on(async {
            let row = sqlx::query(
                "SELECT id, name, province, commandery, x, y, scale, strategic_rank,
                        agriculture_base, commerce_base, defense_base, population_min,
                        population_max, confidence, notes
                 FROM cities
                 WHERE id = ?1",
            )
            .bind(city_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            row.map(city_profile_from_row).transpose()
        })
    }
}

impl OfficerCatalog for SqliteHistoricalCatalog {
    type Error = HistoryDbError;

    fn officer_profiles(&self) -> Result<Vec<OfficerProfile>, Self::Error> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT id, name, courtesy_name, native_place, birth_year, death_year,
                        gender, leadership, strength, intelligence, politics, charm,
                        confidence, biography, notes
                 FROM officers
                 ORDER BY id",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            let mut profiles = rows
                .into_iter()
                .map(officer_profile_from_row)
                .collect::<Result<Vec<_>, _>>()?;
            let mut tags_by_officer = officer_tag_ids_by_officer(&self.pool).await?;
            let mut relationships_by_officer = officer_relationships_by_officer(&self.pool).await?;
            for profile in &mut profiles {
                profile.tags = tags_by_officer.remove(&profile.id).unwrap_or_default();
                profile.relationships = relationships_by_officer
                    .remove(&profile.id)
                    .unwrap_or_default();
            }
            Ok(profiles)
        })
    }

    fn officer_profile(&self, officer_id: &str) -> Result<Option<OfficerProfile>, Self::Error> {
        self.block_on(async {
            let row = sqlx::query(
                "SELECT id, name, courtesy_name, native_place, birth_year, death_year,
                        gender, leadership, strength, intelligence, politics, charm,
                        confidence, biography, notes
                 FROM officers
                 WHERE id = ?1",
            )
            .bind(officer_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            let Some(row) = row else {
                return Ok(None);
            };
            let mut profile = officer_profile_from_row(row)?;
            profile.tags = officer_tag_ids(&self.pool, &profile.id).await?;
            profile.relationships = officer_relationships(&self.pool, &profile.id).await?;
            Ok(Some(profile))
        })
    }

    fn officer_tag_definitions(&self) -> Result<Vec<OfficerTagDefinition>, Self::Error> {
        self.block_on(async { officer_tag_definitions(&self.pool).await })
    }

    fn officer_tag_aliases(&self) -> Result<Vec<(String, String)>, Self::Error> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT alias, tag_id
                 FROM officer_tag_aliases
                 ORDER BY alias",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            Ok(rows
                .into_iter()
                .map(|row| (row.get("alias"), row.get("tag_id")))
                .collect())
        })
    }
}

impl HistoricalCatalog for SqliteHistoricalCatalog {
    fn scenarios(&self) -> Result<Vec<HistoricalScenario>, HistoryDbError> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT id, name, era_name, year, month FROM scenarios ORDER BY year, month",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            Ok(rows
                .into_iter()
                .map(|row| HistoricalScenario {
                    id: row.get("id"),
                    name: row.get("name"),
                    era_name: row.get("era_name"),
                    year: row.get("year"),
                    month: row.get::<i64, _>("month") as u8,
                })
                .collect())
        })
    }

    fn selectable_factions(&self, scenario_id: &str) -> Result<Vec<Faction>, HistoryDbError> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT f.id, f.name, s.ruler_id, f.color_r, f.color_g, f.color_b, s.selectable
                 FROM scenario_faction_states s
                 JOIN factions f ON f.id = s.faction_id
                 WHERE s.scenario_id = ?1 AND s.exists_in_scenario = 1
                 ORDER BY f.id",
            )
            .bind(scenario_id)
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            Ok(rows
                .into_iter()
                .map(|row| Faction {
                    id: row.get("id"),
                    name: row.get("name"),
                    ruler_id: row.get("ruler_id"),
                    heir_id: None,
                    color: [row.get("color_r"), row.get("color_g"), row.get("color_b")],
                    selectable: row.get::<bool, _>("selectable"),
                    controlled_by: Controller::RuleAi,
                })
                .collect())
        })
    }

    fn technology_catalog(&self) -> Result<TechnologyCatalog, HistoryDbError> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT id, branch, name, turns, gold_cost, effect_summary, icon_id, sort_order, ai_priority
                 FROM technologies
                 ORDER BY sort_order",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;

            let mut specs = BTreeMap::new();
            for row in rows {
                let id: String = row.get("id");
                let branch_value: String = row.get("branch");
                let branch = TechnologyBranch::from_db(&branch_value).ok_or_else(|| {
                    HistoryDbError::Invalid(format!(
                        "科技 {id} 使用未知分支 {branch_value}"
                    ))
                })?;
                specs.insert(
                    id.clone(),
                    TechnologySpec {
                        id,
                        branch,
                        name: row.get("name"),
                        turns: row.get::<i64, _>("turns") as u8,
                        gold_cost: row.get::<i64, _>("gold_cost") as i32,
                        prerequisites: Vec::new(),
                        effect: row.get("effect_summary"),
                        icon_id: row.get("icon_id"),
                        sort_order: row.get::<i64, _>("sort_order") as i32,
                        ai_priority: row.get::<i64, _>("ai_priority") as i32,
                        effects: Vec::new(),
                    },
                );
            }

            let prerequisite_rows = sqlx::query(
                "SELECT technology_id, prerequisite_id
                 FROM technology_prerequisites
                 ORDER BY technology_id, sort_order",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in prerequisite_rows {
                let technology_id: String = row.get("technology_id");
                let prerequisite_id: String = row.get("prerequisite_id");
                let Some(spec) = specs.get_mut(&technology_id) else {
                    return Err(HistoryDbError::Invalid(format!(
                        "科技前置引用未知科技 {technology_id}"
                    )));
                };
                spec.prerequisites.push(prerequisite_id);
            }

            let effect_rows = sqlx::query(
                "SELECT technology_id, effect_kind, amount
                 FROM technology_effects
                 ORDER BY technology_id, sort_order",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in effect_rows {
                let technology_id: String = row.get("technology_id");
                let effect_kind_value: String = row.get("effect_kind");
                let kind = TechnologyEffectKind::from_db(&effect_kind_value).ok_or_else(|| {
                    HistoryDbError::Invalid(format!(
                        "科技 {technology_id} 使用未知效果 {effect_kind_value}"
                    ))
                })?;
                let Some(spec) = specs.get_mut(&technology_id) else {
                    return Err(HistoryDbError::Invalid(format!(
                        "科技效果引用未知科技 {technology_id}"
                    )));
                };
                spec.effects.push(TechnologyEffect {
                    kind,
                    amount: row.get::<i64, _>("amount") as i32,
                });
            }

            Ok(TechnologyCatalog::new(specs.into_values().collect()))
        })
    }

    fn build_game(
        &self,
        scenario_id: &str,
        player_faction_id: &str,
    ) -> Result<GameState, HistoryDbError> {
        let scenario = self
            .scenarios()?
            .into_iter()
            .find(|scenario| scenario.id == scenario_id)
            .ok_or_else(|| HistoryDbError::Invalid(format!("剧本 {scenario_id} 不存在")))?;

        let mut factions = BTreeMap::new();
        for mut faction in self.selectable_factions(scenario_id)? {
            faction.controlled_by = if faction.id == player_faction_id {
                Controller::Player
            } else {
                Controller::RuleAi
            };
            factions.insert(faction.id.clone(), faction);
        }
        if !factions
            .get(player_faction_id)
            .is_some_and(|faction| faction.selectable)
        {
            return Err(HistoryDbError::Invalid(format!(
                "势力 {player_faction_id} 不可选"
            )));
        }

        let mut cities = BTreeMap::new();
        let city_rows = self.block_on(async {
            sqlx::query(
                "SELECT c.id, c.name, c.province, c.commandery, c.x, c.y, c.scale,
                        c.strategic_rank, c.agriculture_base, c.commerce_base,
                        c.defense_base, c.population_min, c.population_max, c.confidence,
                        c.notes, s.faction_id, s.population, s.gold, s.food, s.troops,
                        s.training, s.agriculture, s.commerce, s.defense, s.city_order,
                        s.governor_id
                 FROM scenario_city_states s
                 JOIN cities c ON c.id = s.city_id
                 WHERE s.scenario_id = ?1",
            )
            .bind(scenario_id)
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)
        })?;
        for row in city_rows {
            let profile = CityProfile {
                id: row.get("id"),
                name: row.get("name"),
                province: row.get("province"),
                commandery: row.get("commandery"),
                position: MapPosition {
                    x: row.get("x"),
                    y: row.get("y"),
                },
                scale: parse_city_scale(row.get::<String, _>("scale").as_str()),
                strategic_rank: row.get::<i64, _>("strategic_rank") as u8,
                agriculture_base: row.get::<i64, _>("agriculture_base") as u16,
                commerce_base: row.get::<i64, _>("commerce_base") as u16,
                defense_base: row.get::<i64, _>("defense_base") as u16,
                population_min: row.get::<i64, _>("population_min") as u32,
                population_max: row.get::<i64, _>("population_max") as u32,
                confidence: parse_confidence(row.get::<String, _>("confidence").as_str()),
                notes: row.get("notes"),
            };
            let mut city = City {
                id: profile.id.clone(),
                name: profile.name.clone(),
                faction_id: row.get("faction_id"),
                position: profile.position,
                level: derive_city_level(&profile),
                population: row.get::<i64, _>("population") as u32,
                gold: row.get::<i64, _>("gold") as i32,
                food: row.get::<i64, _>("food") as i32,
                materials: derive_city_materials(&profile),
                troops: TroopPool::from_total(row.get::<i64, _>("troops") as u32),
                wounded_troops: TroopPool::default(),
                training: row.get::<i64, _>("training") as u8,
                agriculture: row.get::<i64, _>("agriculture") as u16,
                commerce: row.get::<i64, _>("commerce") as u16,
                defense: row.get::<i64, _>("defense") as u16,
                order: row.get::<i64, _>("city_order") as u8,
                facilities: derive_city_facilities(&profile),
                governor_id: row.get("governor_id"),
                profile: Some(profile),
            };
            city.clamp_fields();
            cities.insert(city.id.clone(), city);
        }

        let mut roads = Vec::new();
        let road_rows = self.block_on(async {
            sqlx::query(
                "SELECT from_city_id, to_city_id FROM roads ORDER BY from_city_id, to_city_id",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)
        })?;
        for row in road_rows {
            let road = Road {
                from: row.get("from_city_id"),
                to: row.get("to_city_id"),
            };
            if cities.contains_key(&road.from) && cities.contains_key(&road.to) {
                roads.push(road);
            }
        }

        let mut diplomacy = BTreeMap::new();
        let dip_rows = self.block_on(async {
            sqlx::query(
                "SELECT faction_a, faction_b, score, truce_until_turn
                 FROM scenario_diplomacy
                 WHERE scenario_id = ?1",
            )
            .bind(scenario_id)
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)
        })?;
        for row in dip_rows {
            let relation = DiplomaticRelation {
                faction_a: row.get("faction_a"),
                faction_b: row.get("faction_b"),
                score: row.get::<i64, _>("score") as i16,
                truce_until_turn: row
                    .get::<Option<i64>, _>("truce_until_turn")
                    .map(|value| value as u32),
                passage_rights: BTreeMap::new(),
            };
            diplomacy.insert(
                diplomacy_key(&relation.faction_a, &relation.faction_b),
                relation,
            );
        }

        let cutoff_events = self.life_events_until(scenario.year, scenario.month)?;
        let mut applied_event_ids = BTreeSet::new();
        let mut officer_states: BTreeMap<OfficerId, Officer> = BTreeMap::new();
        for event in cutoff_events {
            applied_event_ids.insert(event.id.clone());
            let Some(profile) = self.officer_profile(&event.officer_id)? else {
                continue;
            };
            apply_initial_life_event(
                &mut officer_states,
                &scenario.id,
                &cities,
                &factions,
                &profile,
                &event,
            );
        }
        clean_invalid_governors(&mut cities, &officer_states);
        let technologies = factions
            .keys()
            .map(|faction_id| (faction_id.clone(), FactionTechnologyState::default()))
            .collect();
        let technology_catalog = self.technology_catalog()?;

        let mut state = GameState {
            version: SAVE_VERSION,
            scenario_id: scenario.id,
            scenario_name: scenario.name,
            scenario_era_name: scenario.era_name,
            year: scenario.year,
            month: scenario.month,
            turn: 1,
            player_faction_id: player_faction_id.to_string(),
            factions,
            cities,
            officers: officer_states,
            officer_tag_definitions: self.officer_tag_definitions()?,
            officer_tag_aliases: self
                .officer_tag_aliases()?
                .into_iter()
                .collect::<BTreeMap<_, _>>(),
            roads,
            diplomacy,
            pending_diplomacy: Vec::new(),
            pending_commands: Vec::new(),
            army_movements: Vec::new(),
            technologies,
            technology_catalog,
            events: Vec::new(),
            next_event_sequence: 0,
            dynamic_event_cooldowns: BTreeMap::new(),
            marriages: Vec::new(),
            family_relationships: Vec::new(),
            next_generated_officer_sequence: 0,
            last_lifecycle_year: None,
            officer_recruitments: Vec::new(),
            next_officer_recruitment_sequence: 0,
            applied_event_ids,
            reports: Vec::new(),
            status: GameStatus::Running,
        };
        normalize_personnel_state(&mut state);
        Ok(state)
    }

    fn life_events_until(&self, year: i32, month: u8) -> Result<Vec<LifeEvent>, HistoryDbError> {
        self.block_on(async {
            let rows = sqlx::query(
                "SELECT id, officer_id, event_year, event_month, event_kind,
                        faction_id, city_id, loyalty, notes
                 FROM officer_life_events
                 WHERE event_year < ?1 OR (event_year = ?1 AND event_month <= ?2)
                 ORDER BY event_year, event_month, id",
            )
            .bind(year)
            .bind(month)
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            rows.into_iter().map(life_event_from_row).collect()
        })
    }

    fn dynamic_event_templates(&self) -> Result<Vec<DynamicEventTemplate>, HistoryDbError> {
        self.block_on(async {
            let template_rows = sqlx::query(
                "SELECT id, event_kind, severity, event_scope, target_scope, base_weight,
                        target_cooldown_turns, deadline_turns, enabled, title, summary, detail
                 FROM dynamic_event_templates
                 ORDER BY id",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            let mut templates = BTreeMap::new();
            for row in template_rows {
                let id: String = row.get("id");
                templates.insert(
                    id.clone(),
                    DynamicEventTemplate {
                        id,
                        kind: parse_game_event_kind(row.get::<String, _>("event_kind").as_str())?,
                        severity: parse_game_event_severity(
                            row.get::<String, _>("severity").as_str(),
                        )?,
                        scope: parse_game_event_scope(
                            row.get::<String, _>("event_scope").as_str(),
                        )?,
                        target_scope: parse_dynamic_event_target_scope(
                            row.get::<String, _>("target_scope").as_str(),
                        )?,
                        base_weight: row.get::<i64, _>("base_weight") as u32,
                        target_cooldown_turns: row.get::<i64, _>("target_cooldown_turns") as u32,
                        deadline_turns: row.get::<i64, _>("deadline_turns") as u32,
                        enabled: row.get::<bool, _>("enabled"),
                        title: row.get("title"),
                        summary: row.get("summary"),
                        detail: row.get("detail"),
                        conditions: Vec::new(),
                        weight_modifiers: Vec::new(),
                        choices: Vec::new(),
                    },
                );
            }

            let condition_rows = sqlx::query(
                "SELECT template_id, condition_kind, min_value, max_value
                 FROM dynamic_event_conditions
                 ORDER BY template_id, sort_order, condition_kind",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in condition_rows {
                let template_id: String = row.get("template_id");
                if let Some(template) = templates.get_mut(&template_id) {
                    template.conditions.push(DynamicEventCondition {
                        kind: parse_dynamic_event_condition_kind(
                            row.get::<String, _>("condition_kind").as_str(),
                        )?,
                        min_value: row.get("min_value"),
                        max_value: row.get("max_value"),
                    });
                }
            }

            let modifier_rows = sqlx::query(
                "SELECT template_id, condition_kind, min_value, max_value, multiplier_percent
                 FROM dynamic_event_weight_modifiers
                 ORDER BY template_id, sort_order, condition_kind",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in modifier_rows {
                let template_id: String = row.get("template_id");
                if let Some(template) = templates.get_mut(&template_id) {
                    template.weight_modifiers.push(DynamicEventWeightModifier {
                        kind: parse_dynamic_event_condition_kind(
                            row.get::<String, _>("condition_kind").as_str(),
                        )?,
                        min_value: row.get("min_value"),
                        max_value: row.get("max_value"),
                        multiplier_percent: row.get::<i64, _>("multiplier_percent") as u32,
                    });
                }
            }

            let mut choices_by_template: BTreeMap<String, Vec<DynamicEventChoice>> =
                BTreeMap::new();
            let choice_rows = sqlx::query(
                "SELECT template_id, choice_id, label, description, is_default
                 FROM dynamic_event_choices
                 ORDER BY template_id, sort_order, choice_id",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in choice_rows {
                choices_by_template
                    .entry(row.get("template_id"))
                    .or_default()
                    .push(DynamicEventChoice {
                        id: row.get("choice_id"),
                        label: row.get("label"),
                        description: row.get("description"),
                        is_default: row.get::<bool, _>("is_default"),
                        requirements: EventChoiceRequirements::default(),
                        effects: EventChoiceEffects::default(),
                    });
            }

            let requirement_rows = sqlx::query(
                "SELECT template_id, choice_id, requirement_kind, amount
                 FROM dynamic_event_choice_requirements
                 ORDER BY template_id, choice_id, sort_order, requirement_kind",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in requirement_rows {
                let template_id: String = row.get("template_id");
                let choice_id: String = row.get("choice_id");
                if let Some(choice) = choice_mut(&mut choices_by_template, &template_id, &choice_id)
                {
                    push_dynamic_requirement(
                        &mut choice.requirements,
                        parse_dynamic_requirement_kind(
                            row.get::<String, _>("requirement_kind").as_str(),
                        )?,
                        row.get::<i64, _>("amount") as i32,
                    );
                }
            }

            let effect_rows = sqlx::query(
                "SELECT template_id, choice_id, effect_kind, amount
                 FROM dynamic_event_choice_effects
                 ORDER BY template_id, choice_id, sort_order, effect_kind",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(HistoryDbError::Sqlx)?;
            for row in effect_rows {
                let template_id: String = row.get("template_id");
                let choice_id: String = row.get("choice_id");
                if let Some(choice) = choice_mut(&mut choices_by_template, &template_id, &choice_id)
                {
                    push_dynamic_effect(
                        &mut choice.effects,
                        parse_dynamic_effect_kind(row.get::<String, _>("effect_kind").as_str())?,
                        row.get::<i64, _>("amount") as i32,
                    );
                }
            }

            for (template_id, choices) in choices_by_template {
                if let Some(template) = templates.get_mut(&template_id) {
                    template.choices = choices;
                }
            }

            Ok(templates.into_values().collect())
        })
    }
}

fn apply_initial_life_event(
    officers: &mut BTreeMap<OfficerId, Officer>,
    scenario_id: &str,
    cities: &BTreeMap<CityId, City>,
    factions: &BTreeMap<FactionId, Faction>,
    profile: &OfficerProfile,
    event: &LifeEvent,
) {
    match event.kind {
        LifeEventKind::Appear | LifeEventKind::ServeFaction | LifeEventKind::MoveToCity => {
            let faction_id = event
                .faction_id
                .clone()
                .or_else(|| {
                    event
                        .city_id
                        .as_ref()
                        .and_then(|city_id| cities.get(city_id))
                        .map(|city| city.faction_id.clone())
                })
                .unwrap_or_else(|| WILD_FACTION_ID.to_string());
            let city_id = event
                .city_id
                .as_ref()
                .and_then(|city_id| cities.get(city_id))
                .filter(|city| city.faction_id == faction_id)
                .map(|city| city.id.clone())
                .or_else(|| {
                    cities
                        .values()
                        .find(|city| city.faction_id == faction_id)
                        .map(|city| city.id.clone())
                });
            let enter_service = factions.contains_key(&faction_id) && city_id.is_some();
            if enter_service {
                officers.insert(
                    profile.id.clone(),
                    Officer {
                        id: profile.id.clone(),
                        name: profile.name.clone(),
                        faction_id,
                        city_id,
                        office_id: None,
                        stats: profile.stats,
                        loyalty: event.loyalty.unwrap_or(80),
                        birth_year: profile.birth_year.unwrap_or(event.year - 18),
                        gender: profile.gender.clone(),
                        status: OfficerStatus::Active,
                        profile: Some(profile.clone()),
                    },
                );
            } else {
                let city_id = city_id
                    .or_else(|| {
                        event
                            .city_id
                            .as_ref()
                            .and_then(|city_id| cities.get(city_id))
                            .map(|city| city.id.clone())
                    })
                    .or_else(|| deterministic_initial_city_id(cities, scenario_id, &profile.id));
                officers.insert(
                    profile.id.clone(),
                    Officer {
                        id: profile.id.clone(),
                        name: profile.name.clone(),
                        faction_id: WILD_FACTION_ID.to_string(),
                        city_id,
                        office_id: None,
                        stats: profile.stats,
                        loyalty: event.loyalty.unwrap_or(75),
                        birth_year: profile.birth_year.unwrap_or(event.year - 18),
                        gender: profile.gender.clone(),
                        status: OfficerStatus::Wild,
                        profile: Some(profile.clone()),
                    },
                );
            }
        }
        LifeEventKind::BecomeUnavailable | LifeEventKind::Die => {
            officers.remove(&profile.id);
        }
    }
}

fn clean_invalid_governors(
    cities: &mut BTreeMap<CityId, City>,
    officers: &BTreeMap<OfficerId, Officer>,
) {
    for city in cities.values_mut() {
        let governor_valid = city.governor_id.as_ref().is_some_and(|governor_id| {
            officers.get(governor_id).is_some_and(|officer| {
                officer.is_active()
                    && officer.faction_id == city.faction_id
                    && officer.city_id.as_deref() == Some(city.id.as_str())
            })
        });
        if !governor_valid {
            city.governor_id = None;
        }
    }
}

fn deterministic_initial_city_id(
    cities: &BTreeMap<CityId, City>,
    scenario_id: &str,
    officer_id: &str,
) -> Option<CityId> {
    if cities.is_empty() {
        return None;
    }
    let index =
        deterministic_index_seed(scenario_id, officer_id, "initial-wild-city", cities.len());
    cities.keys().nth(index).cloned()
}

async fn officer_relationships(
    pool: &SqlitePool,
    officer_id: &str,
) -> Result<Vec<OfficerRelationship>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT r.target_officer_id, target.name AS target_name, r.relationship_kind,
                r.confidence, r.notes, r.source
         FROM officer_relationships r
         JOIN officers target ON target.id = r.target_officer_id
         WHERE r.source_officer_id = ?1
         ORDER BY r.relationship_kind, target.name",
    )
    .bind(officer_id)
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    rows.into_iter().map(relationship_from_row).collect()
}

async fn officer_relationships_by_officer(
    pool: &SqlitePool,
) -> Result<BTreeMap<OfficerId, Vec<OfficerRelationship>>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT r.source_officer_id, r.target_officer_id, target.name AS target_name,
                r.relationship_kind, r.confidence, r.notes, r.source
         FROM officer_relationships r
         JOIN officers target ON target.id = r.target_officer_id
         ORDER BY r.source_officer_id, r.relationship_kind, target.name",
    )
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    let mut relationships_by_officer = BTreeMap::new();
    for row in rows {
        let source_officer_id = row.get("source_officer_id");
        relationships_by_officer
            .entry(source_officer_id)
            .or_insert_with(Vec::new)
            .push(relationship_from_row(row)?);
    }
    Ok(relationships_by_officer)
}

async fn officer_tag_ids(
    pool: &SqlitePool,
    officer_id: &str,
) -> Result<Vec<String>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT t.tag_id
         FROM officer_tags t
         JOIN officer_tag_definitions d ON d.id = t.tag_id
         WHERE t.officer_id = ?1
         ORDER BY d.category, d.sort_order, d.id",
    )
    .bind(officer_id)
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    Ok(rows.into_iter().map(|row| row.get("tag_id")).collect())
}

async fn officer_tag_ids_by_officer(
    pool: &SqlitePool,
) -> Result<BTreeMap<OfficerId, Vec<String>>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT t.officer_id, t.tag_id
         FROM officer_tags t
         JOIN officer_tag_definitions d ON d.id = t.tag_id
         ORDER BY t.officer_id, d.category, d.sort_order, d.id",
    )
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    let mut tags_by_officer = BTreeMap::new();
    for row in rows {
        let officer_id = row.get("officer_id");
        tags_by_officer
            .entry(officer_id)
            .or_insert_with(Vec::new)
            .push(row.get("tag_id"));
    }
    Ok(tags_by_officer)
}

async fn officer_tag_definitions(
    pool: &SqlitePool,
) -> Result<Vec<OfficerTagDefinition>, HistoryDbError> {
    let rows = sqlx::query(
        "SELECT id, category, label_zh, label_en, description, sort_order
         FROM officer_tag_definitions
         ORDER BY category, sort_order, id",
    )
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?;
    rows.into_iter()
        .map(officer_tag_definition_from_row)
        .collect()
}

async fn normalize_officer_tag_ids(
    pool: &SqlitePool,
    tags: &[String],
) -> Result<Vec<String>, HistoryDbError> {
    let aliases = sqlx::query(
        "SELECT alias, tag_id
         FROM officer_tag_aliases",
    )
    .fetch_all(pool)
    .await
    .map_err(HistoryDbError::Sqlx)?
    .into_iter()
    .map(|row| {
        (
            row.get::<String, _>("alias"),
            row.get::<String, _>("tag_id"),
        )
    })
    .collect::<BTreeMap<_, _>>();
    let definitions = sqlx::query("SELECT id FROM officer_tag_definitions")
        .fetch_all(pool)
        .await
        .map_err(HistoryDbError::Sqlx)?
        .into_iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<BTreeSet<_>>();
    let mut normalized = BTreeSet::new();
    for tag in tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
    {
        if tag == "female" {
            continue;
        }
        let tag_id = if definitions.contains(tag) {
            tag.to_string()
        } else if let Some(tag_id) = aliases.get(tag) {
            tag_id.clone()
        } else {
            return Err(HistoryDbError::Invalid(format!("未知武将标签: {tag}")));
        };
        normalized.insert(tag_id);
    }
    Ok(normalized.into_iter().collect())
}

fn derive_city_level(profile: &CityProfile) -> u8 {
    let scale_base = match profile.scale {
        CityScale::County => 2,
        CityScale::Commandery => 4,
        CityScale::RegionalCapital => 6,
        CityScale::ImperialCapital => 8,
    };
    (scale_base + profile.strategic_rank / 4).clamp(1, 10)
}

fn derive_city_materials(profile: &CityProfile) -> i32 {
    let level = i32::from(derive_city_level(profile));
    220 + level * 90 + i32::from(profile.strategic_rank) * 25
}

fn derive_city_facilities(profile: &CityProfile) -> Vec<CityFacility> {
    let level = derive_city_level(profile);
    let mut kinds = Vec::new();
    if profile.agriculture_base >= profile.commerce_base {
        kinds.push(FacilityKind::Farmland);
        kinds.push(FacilityKind::Granary);
    } else {
        kinds.push(FacilityKind::Market);
        kinds.push(FacilityKind::TradeDepot);
    }
    if profile.defense_base >= profile.agriculture_base.max(profile.commerce_base) {
        kinds.push(FacilityKind::Walls);
    }
    if profile.strategic_rank >= 6 {
        kinds.push(FacilityKind::Barracks);
    }
    if profile.commerce_base >= 220 {
        kinds.push(FacilityKind::Workshop);
    } else if profile.defense_base >= 180 {
        kinds.push(FacilityKind::Quarry);
    }
    if matches!(
        profile.scale,
        CityScale::RegionalCapital | CityScale::ImperialCapital
    ) {
        kinds.push(FacilityKind::Administration);
        kinds.push(FacilityKind::RelayStation);
    }
    if kinds.len() < 2 {
        kinds.push(FacilityKind::Irrigation);
    }

    let target_count =
        (2 + usize::from(profile.strategic_rank / 4)).min(city_facility_slots(level));
    kinds.sort();
    kinds.dedup();
    kinds
        .into_iter()
        .take(target_count.max(2).min(city_facility_slots(level)))
        .map(|kind| CityFacility {
            kind,
            level: ((level + 1) / 3).clamp(1, 5),
        })
        .collect()
}

fn city_profile_from_row(row: SqliteRow) -> Result<CityProfile, HistoryDbError> {
    Ok(CityProfile {
        id: row.get("id"),
        name: row.get("name"),
        province: row.get("province"),
        commandery: row.get("commandery"),
        position: MapPosition {
            x: row.get("x"),
            y: row.get("y"),
        },
        scale: parse_city_scale(row.get::<String, _>("scale").as_str()),
        strategic_rank: row.get::<i64, _>("strategic_rank") as u8,
        agriculture_base: row.get::<i64, _>("agriculture_base") as u16,
        commerce_base: row.get::<i64, _>("commerce_base") as u16,
        defense_base: row.get::<i64, _>("defense_base") as u16,
        population_min: row.get::<i64, _>("population_min") as u32,
        population_max: row.get::<i64, _>("population_max") as u32,
        confidence: parse_confidence(row.get::<String, _>("confidence").as_str()),
        notes: row.get("notes"),
    })
}

fn officer_profile_from_row(row: SqliteRow) -> Result<OfficerProfile, HistoryDbError> {
    Ok(OfficerProfile {
        id: row.get("id"),
        name: row.get("name"),
        courtesy_name: row.get("courtesy_name"),
        native_place: row.get("native_place"),
        birth_year: row.get("birth_year"),
        death_year: row.get("death_year"),
        gender: parse_gender(row.get::<String, _>("gender").as_str()),
        stats: OfficerStats {
            leadership: row.get::<i64, _>("leadership") as u8,
            strength: row.get::<i64, _>("strength") as u8,
            intelligence: row.get::<i64, _>("intelligence") as u8,
            politics: row.get::<i64, _>("politics") as u8,
            charm: row.get::<i64, _>("charm") as u8,
        },
        tags: Vec::new(),
        confidence: parse_confidence(row.get::<String, _>("confidence").as_str()),
        biography: row.get("biography"),
        relationships: Vec::new(),
        notes: row.get("notes"),
    })
}

fn relationship_from_row(row: SqliteRow) -> Result<OfficerRelationship, HistoryDbError> {
    Ok(OfficerRelationship {
        target_id: row.get("target_officer_id"),
        target_name: row.get("target_name"),
        kind: parse_relationship_kind(row.get::<String, _>("relationship_kind").as_str()),
        confidence: parse_confidence(row.get::<String, _>("confidence").as_str()),
        notes: row.get("notes"),
        source: row.get("source"),
    })
}

fn officer_tag_definition_from_row(row: SqliteRow) -> Result<OfficerTagDefinition, HistoryDbError> {
    Ok(OfficerTagDefinition {
        id: row.get("id"),
        category: parse_officer_tag_category(row.get::<String, _>("category").as_str()),
        label_zh: row.get("label_zh"),
        label_en: row.get("label_en"),
        description: row.get("description"),
        sort_order: row.get::<i64, _>("sort_order") as i32,
    })
}

fn life_event_from_row(row: SqliteRow) -> Result<LifeEvent, HistoryDbError> {
    Ok(LifeEvent {
        id: row.get("id"),
        officer_id: row.get("officer_id"),
        year: row.get("event_year"),
        month: row.get::<i64, _>("event_month") as u8,
        kind: parse_life_event_kind(row.get::<String, _>("event_kind").as_str()),
        faction_id: row.get("faction_id"),
        city_id: row.get("city_id"),
        loyalty: row
            .get::<Option<i64>, _>("loyalty")
            .map(|value| value as u8),
        notes: row.get("notes"),
    })
}

fn parse_city_scale(value: &str) -> CityScale {
    match value {
        "County" => CityScale::County,
        "RegionalCapital" => CityScale::RegionalCapital,
        "ImperialCapital" => CityScale::ImperialCapital,
        _ => CityScale::Commandery,
    }
}

fn parse_confidence(value: &str) -> SourceConfidence {
    match value {
        "High" => SourceConfidence::High,
        "Low" => SourceConfidence::Low,
        _ => SourceConfidence::Medium,
    }
}

fn confidence_value(confidence: &SourceConfidence) -> &'static str {
    match confidence {
        SourceConfidence::High => "High",
        SourceConfidence::Medium => "Medium",
        SourceConfidence::Low => "Low",
    }
}

fn parse_gender(value: &str) -> OfficerGender {
    match value {
        "Female" => OfficerGender::Female,
        _ => OfficerGender::Male,
    }
}

fn parse_officer_tag_category(value: &str) -> OfficerTagCategory {
    match value {
        "Affiliation" => OfficerTagCategory::Affiliation,
        "Source" => OfficerTagCategory::Source,
        "Batch" => OfficerTagCategory::Batch,
        "Basis" => OfficerTagCategory::Basis,
        "Region" => OfficerTagCategory::Region,
        "Context" => OfficerTagCategory::Context,
        _ => OfficerTagCategory::Role,
    }
}

fn gender_value(gender: &OfficerGender) -> &'static str {
    match gender {
        OfficerGender::Male => "Male",
        OfficerGender::Female => "Female",
    }
}

fn trimmed_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn validate_officer_profile_update(update: &OfficerProfileUpdate) -> Result<(), HistoryDbError> {
    if update.name.trim().is_empty() {
        return Err(HistoryDbError::Invalid("武将姓名不能为空".to_string()));
    }
    for (label, value) in [
        ("统率", update.stats.leadership),
        ("武力", update.stats.strength),
        ("智力", update.stats.intelligence),
        ("政治", update.stats.politics),
        ("魅力", update.stats.charm),
    ] {
        if !(1..=100).contains(&value) {
            return Err(HistoryDbError::Invalid(format!(
                "{label} 必须在 1 到 100 之间"
            )));
        }
    }
    Ok(())
}

fn parse_relationship_kind(value: &str) -> OfficerRelationshipKind {
    match value {
        "RulerSubject" => OfficerRelationshipKind::RulerSubject,
        "ParentChild" => OfficerRelationshipKind::ParentChild,
        "AdoptiveParentChild" => OfficerRelationshipKind::AdoptiveParentChild,
        "Spouse" => OfficerRelationshipKind::Spouse,
        "Sibling" => OfficerRelationshipKind::Sibling,
        "SwornSibling" => OfficerRelationshipKind::SwornSibling,
        "Enemy" => OfficerRelationshipKind::Enemy,
        _ => OfficerRelationshipKind::RulerSubject,
    }
}

fn parse_life_event_kind(value: &str) -> LifeEventKind {
    match value {
        "Appear" => LifeEventKind::Appear,
        "ServeFaction" => LifeEventKind::ServeFaction,
        "MoveToCity" => LifeEventKind::MoveToCity,
        "BecomeUnavailable" => LifeEventKind::BecomeUnavailable,
        "Die" => LifeEventKind::Die,
        _ => LifeEventKind::Appear,
    }
}

fn choice_mut<'a>(
    choices_by_template: &'a mut BTreeMap<String, Vec<DynamicEventChoice>>,
    template_id: &str,
    choice_id: &str,
) -> Option<&'a mut DynamicEventChoice> {
    choices_by_template
        .get_mut(template_id)?
        .iter_mut()
        .find(|choice| choice.id == choice_id)
}

fn push_dynamic_requirement(
    requirements: &mut EventChoiceRequirements,
    kind: DynamicEventRequirementKind,
    amount: i32,
) {
    requirements
        .dynamic
        .push(DynamicEventRequirement { kind, amount });
}

fn push_dynamic_effect(
    effects: &mut EventChoiceEffects,
    kind: DynamicEventEffectKind,
    amount: i32,
) {
    effects.dynamic.push(DynamicEventEffect { kind, amount });
}

fn parse_game_event_kind(value: &str) -> Result<GameEventKind, HistoryDbError> {
    Ok(match value {
        "CityDevelopment" => GameEventKind::CityDevelopment,
        "Battle" => GameEventKind::Battle,
        "CityCaptured" => GameEventKind::CityCaptured,
        "FactionDestroyed" => GameEventKind::FactionDestroyed,
        "TechnologyCompleted" => GameEventKind::TechnologyCompleted,
        "HistoricalLife" => GameEventKind::HistoricalLife,
        "OfficerLifecycle" => GameEventKind::OfficerLifecycle,
        "Succession" => GameEventKind::Succession,
        "Famine" => GameEventKind::Famine,
        "NaturalDisaster" => GameEventKind::NaturalDisaster,
        "PublicOrder" => GameEventKind::PublicOrder,
        "Economy" => GameEventKind::Economy,
        "Military" => GameEventKind::Military,
        "Diplomacy" => GameEventKind::Diplomacy,
        "Opportunity" => GameEventKind::Opportunity,
        "GameStatus" => GameEventKind::GameStatus,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件类型 {value} 不存在"
            )));
        }
    })
}

fn parse_game_event_severity(value: &str) -> Result<GameEventSeverity, HistoryDbError> {
    Ok(match value {
        "Info" => GameEventSeverity::Info,
        "Important" => GameEventSeverity::Important,
        "Warning" => GameEventSeverity::Warning,
        "Critical" => GameEventSeverity::Critical,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件严重度 {value} 不存在"
            )));
        }
    })
}

fn parse_game_event_scope(value: &str) -> Result<GameEventScope, HistoryDbError> {
    Ok(match value {
        "Player" => GameEventScope::Player,
        "World" => GameEventScope::World,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件范围 {value} 不存在"
            )));
        }
    })
}

fn parse_dynamic_event_target_scope(
    value: &str,
) -> Result<DynamicEventTargetScope, HistoryDbError> {
    Ok(match value {
        "PlayerCity" => DynamicEventTargetScope::PlayerCity,
        "AiCity" => DynamicEventTargetScope::AiCity,
        "AnyCity" => DynamicEventTargetScope::AnyCity,
        "BorderCity" => DynamicEventTargetScope::BorderCity,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件目标范围 {value} 不存在"
            )));
        }
    })
}

fn parse_dynamic_event_condition_kind(
    value: &str,
) -> Result<DynamicEventConditionKind, HistoryDbError> {
    Ok(match value {
        "CityFoodBelowPopulationThreshold" => {
            DynamicEventConditionKind::CityFoodBelowPopulationThreshold
        }
        "CityFoodAtLeast" => DynamicEventConditionKind::CityFoodAtLeast,
        "CityOrderAtMost" => DynamicEventConditionKind::CityOrderAtMost,
        "CityOrderAtLeast" => DynamicEventConditionKind::CityOrderAtLeast,
        "CityPopulationAtLeast" => DynamicEventConditionKind::CityPopulationAtLeast,
        "CityTroopsAtLeast" => DynamicEventConditionKind::CityTroopsAtLeast,
        "CityDefenseAtLeast" => DynamicEventConditionKind::CityDefenseAtLeast,
        "CityTrainingAtMost" => DynamicEventConditionKind::CityTrainingAtMost,
        "CityAgricultureAtLeast" => DynamicEventConditionKind::CityAgricultureAtLeast,
        "CityCommerceAtLeast" => DynamicEventConditionKind::CityCommerceAtLeast,
        "MonthRange" => DynamicEventConditionKind::MonthRange,
        "AdjacentEnemy" => DynamicEventConditionKind::AdjacentEnemy,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件条件 {value} 不存在"
            )));
        }
    })
}

fn parse_dynamic_requirement_kind(
    value: &str,
) -> Result<DynamicEventRequirementKind, HistoryDbError> {
    Ok(match value {
        "CityGold" => DynamicEventRequirementKind::CityGold,
        "CityFood" => DynamicEventRequirementKind::CityFood,
        "CityMaterials" => DynamicEventRequirementKind::CityMaterials,
        "CityTroops" => DynamicEventRequirementKind::CityTroops,
        "CityOrder" => DynamicEventRequirementKind::CityOrder,
        "CityPopulation" => DynamicEventRequirementKind::CityPopulation,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件需求 {value} 不存在"
            )));
        }
    })
}

fn parse_dynamic_effect_kind(value: &str) -> Result<DynamicEventEffectKind, HistoryDbError> {
    Ok(match value {
        "CityGold" => DynamicEventEffectKind::CityGold,
        "CityFood" => DynamicEventEffectKind::CityFood,
        "CityMaterials" => DynamicEventEffectKind::CityMaterials,
        "CityOrder" => DynamicEventEffectKind::CityOrder,
        "CityPopulation" => DynamicEventEffectKind::CityPopulation,
        "CityPopulationPercent" => DynamicEventEffectKind::CityPopulationPercent,
        "CityTraining" => DynamicEventEffectKind::CityTraining,
        "CityAgriculture" => DynamicEventEffectKind::CityAgriculture,
        "CityCommerce" => DynamicEventEffectKind::CityCommerce,
        "CityDefense" => DynamicEventEffectKind::CityDefense,
        "CityTroops" => DynamicEventEffectKind::CityTroops,
        "CityTroopsPercent" => DynamicEventEffectKind::CityTroopsPercent,
        "CityWoundedTroops" => DynamicEventEffectKind::CityWoundedTroops,
        "DiplomaticScore" => DynamicEventEffectKind::DiplomaticScore,
        _ => {
            return Err(HistoryDbError::Invalid(format!(
                "动态事件效果 {value} 不存在"
            )));
        }
    })
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryDbError {
    #[error("历史资料库 IO 失败: {0}")]
    Io(#[source] std::io::Error),
    #[error("历史资料库运行时初始化失败: {0}")]
    Runtime(#[source] std::io::Error),
    #[error("历史资料库 SQLx 失败: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("历史资料库迁移失败: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("历史资料库数据无效: {0}")]
    Invalid(String),
}
