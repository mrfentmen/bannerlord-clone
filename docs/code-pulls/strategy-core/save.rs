use super::history_db::{HistoricalCatalog, SqliteHistoricalCatalog};
use super::ids::FactionId;
use super::model::*;
use super::officer::OfficerCatalog;
use super::personnel::normalize_personnel_state;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const AUTOSAVE_SLOT_ID: &str = "autosave";
const AUTOSAVE_DISPLAY_NAME: &str = "自动存档";

#[derive(Clone, Debug)]
pub struct SaveManager {
    base_dir: PathBuf,
}

impl SaveManager {
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }

    pub fn default_dir() -> PathBuf {
        ProjectDirs::from("", "", "Shogun")
            .map(|dirs| dirs.data_local_dir().join("saves"))
            .unwrap_or_else(|| PathBuf::from(".shogun_saves"))
    }

    pub fn with_default_dir() -> Self {
        Self::new(Self::default_dir())
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub fn list_slots(&self) -> Result<Vec<SaveSlotMeta>, SaveError> {
        let mut slots = self.read_manifest()?.slots;
        slots.sort_by_key(|slot| std::cmp::Reverse(slot.saved_at_unix));
        Ok(slots)
    }

    pub fn save_slot(
        &self,
        slot_id: &str,
        display_name: &str,
        state: &GameState,
    ) -> Result<SaveSlotMeta, SaveError> {
        validate_slot_id(slot_id)?;
        fs::create_dir_all(self.slots_dir()).map_err(SaveError::Io)?;
        let meta = save_meta(slot_id, display_name, state);
        self.write_save_file(self.slot_path(slot_id), meta.clone(), state)?;

        let mut manifest = self.read_manifest()?;
        manifest.slots.retain(|slot| slot.slot_id != slot_id);
        manifest.slots.push(meta.clone());
        self.write_manifest(&manifest)?;
        Ok(meta)
    }

    pub fn load_slot(&self, slot_id: &str) -> Result<GameState, SaveError> {
        validate_slot_id(slot_id)?;
        self.load_save_file(self.slot_path(slot_id))
    }

    pub fn delete_slot(&self, slot_id: &str) -> Result<(), SaveError> {
        validate_slot_id(slot_id)?;
        let path = self.slot_path(slot_id);
        if path.exists() {
            fs::remove_file(path).map_err(SaveError::Io)?;
        }
        let mut manifest = self.read_manifest()?;
        manifest.slots.retain(|slot| slot.slot_id != slot_id);
        self.write_manifest(&manifest)
    }

    pub fn save_autosave(&self, state: &GameState) -> Result<SaveSlotMeta, SaveError> {
        fs::create_dir_all(self.autosave_dir()).map_err(SaveError::Io)?;
        let meta = save_meta(AUTOSAVE_SLOT_ID, AUTOSAVE_DISPLAY_NAME, state);
        self.write_save_file(self.autosave_path(), meta.clone(), state)?;
        Ok(meta)
    }

    pub fn load_autosave(&self) -> Result<GameState, SaveError> {
        self.load_save_file(self.autosave_path())
    }

    pub fn autosave_meta(&self) -> Result<Option<SaveSlotMeta>, SaveError> {
        let path = self.autosave_path();
        if !path.exists() {
            return Ok(None);
        }
        let envelope = self.read_save_envelope(path)?;
        if envelope.version != SAVE_VERSION {
            return Err(SaveError::Version {
                expected: SAVE_VERSION,
                found: envelope.version,
            });
        }
        Ok(Some(envelope.meta))
    }

    pub fn delete_autosave(&self) -> Result<(), SaveError> {
        let path = self.autosave_path();
        if path.exists() {
            fs::remove_file(path).map_err(SaveError::Io)?;
        }
        Ok(())
    }

    fn read_manifest(&self) -> Result<SaveSlotManifest, SaveError> {
        let path = self.manifest_path();
        if !path.exists() {
            return Ok(SaveSlotManifest::default());
        }
        let body = fs::read_to_string(path).map_err(SaveError::Io)?;
        serde_json::from_str(&body).map_err(SaveError::Json)
    }

    fn write_manifest(&self, manifest: &SaveSlotManifest) -> Result<(), SaveError> {
        fs::create_dir_all(&self.base_dir).map_err(SaveError::Io)?;
        let body = serde_json::to_string_pretty(manifest).map_err(SaveError::Json)?;
        fs::write(self.manifest_path(), body).map_err(SaveError::Io)
    }

    fn write_save_file(
        &self,
        path: PathBuf,
        meta: SaveSlotMeta,
        state: &GameState,
    ) -> Result<(), SaveError> {
        let envelope = SaveEnvelope {
            version: SAVE_VERSION,
            meta,
            state: state.clone(),
        };
        let body = serde_json::to_string_pretty(&envelope).map_err(SaveError::Json)?;
        fs::write(path, body).map_err(SaveError::Io)
    }

    fn load_save_file(&self, path: PathBuf) -> Result<GameState, SaveError> {
        let envelope = self.read_save_envelope(path)?;
        if envelope.version != SAVE_VERSION {
            return Err(SaveError::Version {
                expected: SAVE_VERSION,
                found: envelope.version,
            });
        }
        let mut state = envelope.state;
        hydrate_officer_tag_metadata(&mut state);
        hydrate_technology_catalog(&mut state);
        normalize_personnel_state(&mut state);
        Ok(state)
    }

    fn read_save_envelope(&self, path: PathBuf) -> Result<SaveEnvelope, SaveError> {
        let body = fs::read_to_string(path).map_err(SaveError::Io)?;
        serde_json::from_str(&body).map_err(SaveError::Json)
    }

    fn manifest_path(&self) -> PathBuf {
        self.base_dir.join("manifest.json")
    }

    fn slots_dir(&self) -> PathBuf {
        self.base_dir.join("slots")
    }

    fn slot_path(&self, slot_id: &str) -> PathBuf {
        self.slots_dir().join(format!("{slot_id}.json"))
    }

    fn autosave_dir(&self) -> PathBuf {
        self.base_dir.join("autosave")
    }

    fn autosave_path(&self) -> PathBuf {
        self.autosave_dir().join("latest.json")
    }
}

fn save_meta(slot_id: &str, display_name: &str, state: &GameState) -> SaveSlotMeta {
    SaveSlotMeta {
        slot_id: slot_id.to_string(),
        display_name: display_name.to_string(),
        scenario_id: state.scenario_id.clone(),
        scenario_name: state.scenario_name.clone(),
        scenario_era_name: state.scenario_era_name.clone(),
        player_faction_id: state.player_faction_id.clone(),
        turn: state.turn,
        year: state.year,
        month: state.month,
        saved_at_unix: now_unix(),
    }
}

fn hydrate_officer_tag_metadata(state: &mut GameState) {
    if !state.officer_tag_definitions.is_empty() && !state.officer_tag_aliases.is_empty() {
        return;
    }
    let Ok(catalog) = SqliteHistoricalCatalog::open_default() else {
        return;
    };
    if state.officer_tag_definitions.is_empty()
        && let Ok(definitions) = catalog.officer_tag_definitions()
    {
        state.officer_tag_definitions = definitions;
    }
    if state.officer_tag_aliases.is_empty()
        && let Ok(aliases) = catalog.officer_tag_aliases()
    {
        state.officer_tag_aliases = aliases.into_iter().collect();
    }
}

fn hydrate_technology_catalog(state: &mut GameState) {
    if !state.technology_catalog.is_empty() {
        return;
    }
    let Ok(catalog) = SqliteHistoricalCatalog::open_default() else {
        return;
    };
    if let Ok(technology_catalog) = catalog.technology_catalog() {
        state.technology_catalog = technology_catalog;
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaveSlotManifest {
    pub slots: Vec<SaveSlotMeta>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaveSlotMeta {
    pub slot_id: String,
    pub display_name: String,
    pub scenario_id: String,
    pub scenario_name: String,
    #[serde(default)]
    pub scenario_era_name: String,
    pub player_faction_id: FactionId,
    pub turn: u32,
    pub year: i32,
    pub month: u8,
    pub saved_at_unix: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
struct SaveEnvelope {
    version: u32,
    meta: SaveSlotMeta,
    state: GameState,
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("存档 IO 失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("存档 JSON 失败: {0}")]
    Json(#[from] serde_json::Error),
    #[error("非法存档槽位: {0}")]
    InvalidSlotId(String),
    #[error("存档版本不匹配: 需要 {expected}, 实际 {found}")]
    Version { expected: u32, found: u32 },
}

fn validate_slot_id(slot_id: &str) -> Result<(), SaveError> {
    let valid = !slot_id.is_empty()
        && slot_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    if valid {
        Ok(())
    } else {
        Err(SaveError::InvalidSlotId(slot_id.to_string()))
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
