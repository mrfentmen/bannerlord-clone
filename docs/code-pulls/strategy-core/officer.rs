use super::city::SourceConfidence;
use super::ids::{CityId, FactionId, OfficerId, OfficialPostId};
use serde::{Deserialize, Deserializer, Serialize};

pub type OfficerTagId = String;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum OfficerTagCategory {
    Role,
    Affiliation,
    Source,
    Batch,
    Basis,
    Region,
    Context,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficerTagDefinition {
    pub id: OfficerTagId,
    pub category: OfficerTagCategory,
    pub label_zh: String,
    pub label_en: String,
    pub description: String,
    pub sort_order: i32,
}

pub const ALL_OFFICIAL_POST_SPECS: [OfficialPostSpec; 32] = [
    OfficialPostSpec {
        id: "taifu",
        name: "太傅",
        rank: OfficialRank::WanShi,
        effect: OfficialPostEffect {
            gold_percent: 4,
            order: 2,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "da_jiangjun",
        name: "大将军",
        rank: OfficialRank::WanShi,
        effect: OfficialPostEffect {
            training: 3,
            troop_recovery: 120,
            defense: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "taiwei",
        name: "太尉",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            training: 2,
            defense: 6,
            troop_recovery: 80,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "situ",
        name: "司徒",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            food_percent: 3,
            order: 2,
            population_growth: 10,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "sikong",
        name: "司空",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            materials_income: 8,
            materials_percent: 4,
            defense: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "taichang",
        name: "太常",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            order: 2,
            gold_income: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "guangluxun",
        name: "光禄勋",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            training: 1,
            order: 1,
            troop_recovery: 40,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "weiwei",
        name: "卫尉",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            defense: 8,
            training: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "taipu",
        name: "太仆",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            troop_recovery: 60,
            training: 1,
            food_income: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "tingwei",
        name: "廷尉",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            order: 3,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "dahonglu",
        name: "大鸿胪",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            gold_income: 8,
            gold_percent: 1,
            order: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "dasinong",
        name: "大司农",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            food_income: 12,
            food_percent: 3,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "shaofu",
        name: "少府",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            gold_income: 10,
            materials_income: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "zhijinwu",
        name: "执金吾",
        rank: OfficialRank::ZhongErQianShi,
        effect: OfficialPostEffect {
            order: 2,
            defense: 5,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "piaoqi_jiangjun",
        name: "骠骑将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            training: 2,
            troop_recovery: 90,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "cheqi_jiangjun",
        name: "车骑将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            training: 2,
            troop_recovery: 80,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "wei_jiangjun",
        name: "卫将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            defense: 6,
            troop_recovery: 70,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "qian_jiangjun",
        name: "前将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            training: 1,
            troop_recovery: 55,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "zuo_jiangjun",
        name: "左将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            training: 1,
            troop_recovery: 50,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "you_jiangjun",
        name: "右将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            defense: 4,
            troop_recovery: 50,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "hou_jiangjun",
        name: "后将军",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            defense: 5,
            training: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "polu_jiangjun",
        name: "破虏将军",
        rank: OfficialRank::QianShi,
        effect: OfficialPostEffect {
            training: 1,
            troop_recovery: 35,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "xiaowei",
        name: "校尉",
        rank: OfficialRank::LiuBaiShi,
        effect: OfficialPostEffect {
            training: 1,
            troop_recovery: 20,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "duwei",
        name: "都尉",
        rank: OfficialRank::BiLiuBaiShi,
        effect: OfficialPostEffect {
            defense: 3,
            troop_recovery: 18,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "zhoumu",
        name: "州牧",
        rank: OfficialRank::ErQianShi,
        effect: OfficialPostEffect {
            gold_percent: 2,
            food_percent: 2,
            order: 2,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "cishi",
        name: "刺史",
        rank: OfficialRank::LiuBaiShi,
        effect: OfficialPostEffect {
            order: 2,
            gold_income: 4,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "sili_xiaowei",
        name: "司隶校尉",
        rank: OfficialRank::BiErQianShi,
        effect: OfficialPostEffect {
            order: 3,
            defense: 3,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "changshi",
        name: "长史",
        rank: OfficialRank::QianShi,
        effect: OfficialPostEffect {
            gold_income: 5,
            order: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "biejia",
        name: "别驾从事",
        rank: OfficialRank::LiuBaiShi,
        effect: OfficialPostEffect {
            food_income: 6,
            order: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "zhizhong",
        name: "治中从事",
        rank: OfficialRank::LiuBaiShi,
        effect: OfficialPostEffect {
            order: 2,
            materials_income: 2,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "gongcao",
        name: "功曹从事",
        rank: OfficialRank::SanBaiShi,
        effect: OfficialPostEffect {
            gold_income: 3,
            order: 1,
            ..OfficialPostEffect::empty()
        },
    },
    OfficialPostSpec {
        id: "zhubu",
        name: "主簿",
        rank: OfficialRank::ErBaiShi,
        effect: OfficialPostEffect {
            materials_income: 2,
            gold_income: 2,
            ..OfficialPostEffect::empty()
        },
    },
];

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OfficialRank {
    WanShi,
    ZhongErQianShi,
    ErQianShi,
    BiErQianShi,
    QianShi,
    LiuBaiShi,
    BiLiuBaiShi,
    SanBaiShi,
    ErBaiShi,
    BaiShi,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OfficialPostSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub rank: OfficialRank,
    pub effect: OfficialPostEffect,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OfficialPostEffect {
    pub gold_income: i32,
    pub food_income: i32,
    pub materials_income: i32,
    pub gold_percent: i32,
    pub food_percent: i32,
    pub materials_percent: i32,
    pub population_growth: i32,
    pub troop_recovery: i32,
    pub order: i32,
    pub training: i32,
    pub defense: i32,
}

impl OfficialPostEffect {
    pub const fn empty() -> Self {
        Self {
            gold_income: 0,
            food_income: 0,
            materials_income: 0,
            gold_percent: 0,
            food_percent: 0,
            materials_percent: 0,
            population_growth: 0,
            troop_recovery: 0,
            order: 0,
            training: 0,
            defense: 0,
        }
    }
}

pub fn official_post_specs() -> &'static [OfficialPostSpec] {
    &ALL_OFFICIAL_POST_SPECS
}

pub fn official_post_spec(office_id: &str) -> Option<&'static OfficialPostSpec> {
    official_post_specs()
        .iter()
        .find(|spec| spec.id == office_id)
}

pub fn official_rank_salary_bonus(rank: OfficialRank) -> i32 {
    match rank {
        OfficialRank::WanShi => 88,
        OfficialRank::ZhongErQianShi => 45,
        OfficialRank::ErQianShi => 30,
        OfficialRank::BiErQianShi => 25,
        OfficialRank::QianShi => 20,
        OfficialRank::LiuBaiShi => 17,
        OfficialRank::BiLiuBaiShi => 12,
        OfficialRank::SanBaiShi => 10,
        OfficialRank::ErBaiShi => 7,
        OfficialRank::BaiShi => 4,
    }
}

pub fn official_rank_order(rank: OfficialRank) -> i16 {
    match rank {
        OfficialRank::WanShi => 10,
        OfficialRank::ZhongErQianShi => 9,
        OfficialRank::ErQianShi => 8,
        OfficialRank::BiErQianShi => 7,
        OfficialRank::QianShi => 6,
        OfficialRank::LiuBaiShi => 5,
        OfficialRank::BiLiuBaiShi => 4,
        OfficialRank::SanBaiShi => 3,
        OfficialRank::ErBaiShi => 2,
        OfficialRank::BaiShi => 1,
    }
}

pub fn official_rank_loyalty_bonus(rank: OfficialRank) -> u8 {
    match rank {
        OfficialRank::WanShi => 10,
        OfficialRank::ZhongErQianShi => 8,
        OfficialRank::ErQianShi => 7,
        OfficialRank::BiErQianShi => 6,
        OfficialRank::QianShi => 5,
        OfficialRank::LiuBaiShi => 4,
        OfficialRank::BiLiuBaiShi => 3,
        OfficialRank::SanBaiShi => 2,
        OfficialRank::ErBaiShi => 2,
        OfficialRank::BaiShi => 1,
    }
}

pub fn official_rank_label(rank: OfficialRank) -> &'static str {
    match rank {
        OfficialRank::WanShi => "万石",
        OfficialRank::ZhongErQianShi => "中二千石",
        OfficialRank::ErQianShi => "二千石",
        OfficialRank::BiErQianShi => "比二千石",
        OfficialRank::QianShi => "千石",
        OfficialRank::LiuBaiShi => "六百石",
        OfficialRank::BiLiuBaiShi => "比六百石",
        OfficialRank::SanBaiShi => "三百石",
        OfficialRank::ErBaiShi => "二百石",
        OfficialRank::BaiShi => "百石",
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OfficerStatus {
    Active,
    Minor,
    Wild,
    Unavailable,
    Dead,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub enum OfficerGender {
    #[default]
    Male,
    Female,
}

impl<'de> Deserialize<'de> for OfficerGender {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(match value.as_str() {
            "Female" => Self::Female,
            _ => Self::Male,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum OfficerRelationshipKind {
    RulerSubject,
    ParentChild,
    AdoptiveParentChild,
    Spouse,
    Sibling,
    SwornSibling,
    Enemy,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficerRelationship {
    pub target_id: OfficerId,
    pub target_name: String,
    pub kind: OfficerRelationshipKind,
    pub confidence: SourceConfidence,
    pub notes: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OfficerProfile {
    pub id: OfficerId,
    pub name: String,
    pub courtesy_name: Option<String>,
    pub native_place: Option<String>,
    pub birth_year: Option<i32>,
    pub death_year: Option<i32>,
    #[serde(default)]
    pub gender: OfficerGender,
    pub stats: OfficerStats,
    pub tags: Vec<String>,
    pub confidence: SourceConfidence,
    #[serde(default)]
    pub biography: String,
    #[serde(default)]
    pub relationships: Vec<OfficerRelationship>,
    pub notes: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OfficerProfileUpdate {
    pub name: String,
    pub courtesy_name: Option<String>,
    pub native_place: Option<String>,
    pub birth_year: Option<i32>,
    pub death_year: Option<i32>,
    pub gender: OfficerGender,
    pub stats: OfficerStats,
    pub tags: Vec<String>,
    pub confidence: SourceConfidence,
    pub biography: String,
    pub notes: String,
}

impl OfficerProfileUpdate {
    pub fn from_profile(profile: &OfficerProfile) -> Self {
        Self {
            name: profile.name.clone(),
            courtesy_name: profile.courtesy_name.clone(),
            native_place: profile.native_place.clone(),
            birth_year: profile.birth_year,
            death_year: profile.death_year,
            gender: profile.gender.clone(),
            stats: profile.stats,
            tags: profile.tags.clone(),
            confidence: profile.confidence.clone(),
            biography: profile.biography.clone(),
            notes: profile.notes.clone(),
        }
    }
}

pub trait OfficerProfileView {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn courtesy_name(&self) -> Option<&str>;
    fn native_place(&self) -> Option<&str>;
    fn birth_year(&self) -> Option<i32>;
    fn death_year(&self) -> Option<i32>;
    fn gender(&self) -> &OfficerGender;
    fn confidence(&self) -> &SourceConfidence;
}

impl OfficerProfileView for OfficerProfile {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn courtesy_name(&self) -> Option<&str> {
        self.courtesy_name.as_deref()
    }

    fn native_place(&self) -> Option<&str> {
        self.native_place.as_deref()
    }

    fn birth_year(&self) -> Option<i32> {
        self.birth_year
    }

    fn death_year(&self) -> Option<i32> {
        self.death_year
    }

    fn gender(&self) -> &OfficerGender {
        &self.gender
    }

    fn confidence(&self) -> &SourceConfidence {
        &self.confidence
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Officer {
    pub id: OfficerId,
    pub name: String,
    pub faction_id: FactionId,
    pub city_id: Option<CityId>,
    pub office_id: Option<OfficialPostId>,
    pub stats: OfficerStats,
    pub loyalty: u8,
    #[serde(default)]
    pub birth_year: i32,
    #[serde(default)]
    pub gender: OfficerGender,
    pub status: OfficerStatus,
    pub profile: Option<OfficerProfile>,
}

impl Officer {
    pub fn is_active(&self) -> bool {
        self.status == OfficerStatus::Active
    }

    pub fn age_at(&self, year: i32) -> u32 {
        year.saturating_sub(self.birth_year).max(0) as u32
    }

    pub fn is_adult_at(&self, year: i32) -> bool {
        self.age_at(year) >= 18
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OfficerStats {
    pub leadership: u8,
    pub strength: u8,
    pub intelligence: u8,
    pub politics: u8,
    pub charm: u8,
}

pub trait OfficerAbilityView {
    fn leadership(&self) -> u8;
    fn strength(&self) -> u8;
    fn intelligence(&self) -> u8;
    fn politics(&self) -> u8;
    fn charm(&self) -> u8;
}

impl OfficerAbilityView for OfficerStats {
    fn leadership(&self) -> u8 {
        self.leadership
    }

    fn strength(&self) -> u8 {
        self.strength
    }

    fn intelligence(&self) -> u8 {
        self.intelligence
    }

    fn politics(&self) -> u8 {
        self.politics
    }

    fn charm(&self) -> u8 {
        self.charm
    }
}

impl OfficerAbilityView for Officer {
    fn leadership(&self) -> u8 {
        self.stats.leadership
    }

    fn strength(&self) -> u8 {
        self.stats.strength
    }

    fn intelligence(&self) -> u8 {
        self.stats.intelligence
    }

    fn politics(&self) -> u8 {
        self.stats.politics
    }

    fn charm(&self) -> u8 {
        self.stats.charm
    }
}

pub trait OfficerCatalog {
    type Error;

    fn officer_profiles(&self) -> Result<Vec<OfficerProfile>, Self::Error>;
    fn officer_profile(&self, officer_id: &str) -> Result<Option<OfficerProfile>, Self::Error>;
    fn officer_tag_definitions(&self) -> Result<Vec<OfficerTagDefinition>, Self::Error>;
    fn officer_tag_aliases(&self) -> Result<Vec<(String, OfficerTagId)>, Self::Error>;
}
