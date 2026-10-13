use super::city::SourceConfidence;
use super::ids::CityId;
use super::model::MapPosition;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub const MAP_BOUNDARY_ASSET_PATH: &str = "assets/data/map_boundaries.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MapBoundaryCatalog {
    pub version: u32,
    #[serde(default)]
    pub notes: String,
    pub boundaries: Vec<MapBoundary>,
}

impl MapBoundaryCatalog {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, MapBoundaryError> {
        let input = fs::read_to_string(path).map_err(MapBoundaryError::Io)?;
        Self::from_json_str(&input)
    }

    pub fn from_json_str(input: &str) -> Result<Self, MapBoundaryError> {
        let catalog: Self = serde_json::from_str(input).map_err(MapBoundaryError::Parse)?;
        catalog.validate()?;
        Ok(catalog)
    }

    pub fn boundaries_for_year(&self, year: i32) -> impl Iterator<Item = &MapBoundary> {
        self.boundaries
            .iter()
            .filter(move |boundary| boundary.includes_year(year))
    }

    pub fn territory_cells_for_year(&self, year: i32) -> Vec<TerritoryCell> {
        let commanderies: Vec<_> = self
            .boundaries_for_year(year)
            .filter(|boundary| boundary.level == MapBoundaryLevel::Commandery)
            .collect();
        let Some(outer_polygon) = self.outer_partition_polygon(year) else {
            return Vec::new();
        };
        let seeds: Vec<_> = commanderies
            .iter()
            .map(|boundary| polygon_centroid(&boundary.points))
            .collect();

        commanderies
            .iter()
            .enumerate()
            .filter_map(|(index, boundary)| {
                let mut points = outer_polygon.clone();
                for (other_index, other_seed) in seeds.iter().copied().enumerate() {
                    if index == other_index {
                        continue;
                    }
                    points = clip_polygon_to_nearest_seed(&points, seeds[index], other_seed);
                    if points.len() < 3 {
                        return None;
                    }
                }

                Some(TerritoryCell {
                    boundary_id: boundary.id.clone(),
                    name: boundary.name.clone(),
                    parent_id: boundary.parent_id.clone(),
                    city_ids: boundary.city_ids.clone(),
                    seed: seeds[index],
                    points,
                })
            })
            .collect()
    }

    fn outer_partition_polygon(&self, year: i32) -> Option<Vec<MapPosition>> {
        let mut points: Vec<_> = self
            .boundaries_for_year(year)
            .filter(|boundary| boundary.level == MapBoundaryLevel::Province)
            .flat_map(|boundary| boundary.points.iter().copied())
            .collect();
        if points.len() < 3 {
            points = self
                .boundaries_for_year(year)
                .flat_map(|boundary| boundary.points.iter().copied())
                .collect();
        }
        let hull = convex_hull(points);
        (hull.len() >= 3).then(|| expand_polygon(&hull, 1.04, 28.0))
    }

    pub fn validate(&self) -> Result<(), MapBoundaryError> {
        let mut ids = BTreeSet::new();
        let mut levels = BTreeMap::new();

        for boundary in &self.boundaries {
            if boundary.id.trim().is_empty() {
                return Err(MapBoundaryError::Invalid("边界 id 不能为空".to_string()));
            }
            if !ids.insert(boundary.id.as_str()) {
                return Err(MapBoundaryError::Invalid(format!(
                    "边界 id {} 重复",
                    boundary.id
                )));
            }
            if boundary.points.len() < 3 {
                return Err(MapBoundaryError::Invalid(format!(
                    "边界 {} 至少需要 3 个点",
                    boundary.id
                )));
            }
            if let (Some(from), Some(to)) = (boundary.valid_from_year, boundary.valid_to_year)
                && from > to
            {
                return Err(MapBoundaryError::Invalid(format!(
                    "边界 {} 年份范围无效",
                    boundary.id
                )));
            }
            if boundary
                .points
                .iter()
                .any(|point| !point.x.is_finite() || !point.y.is_finite())
            {
                return Err(MapBoundaryError::Invalid(format!(
                    "边界 {} 包含无效坐标",
                    boundary.id
                )));
            }
            if boundary.level == MapBoundaryLevel::Commandery && boundary.parent_id.is_none() {
                return Err(MapBoundaryError::Invalid(format!(
                    "郡域边界 {} 缺少父级州",
                    boundary.id
                )));
            }
            levels.insert(boundary.id.as_str(), boundary.level);
        }

        for boundary in &self.boundaries {
            if let Some(parent_id) = &boundary.parent_id {
                match levels.get(parent_id.as_str()) {
                    Some(MapBoundaryLevel::Province) => {}
                    Some(MapBoundaryLevel::Commandery) => {
                        return Err(MapBoundaryError::Invalid(format!(
                            "边界 {} 的父级 {} 不是州界",
                            boundary.id, parent_id
                        )));
                    }
                    None => {
                        return Err(MapBoundaryError::Invalid(format!(
                            "边界 {} 引用了不存在的父级 {}",
                            boundary.id, parent_id
                        )));
                    }
                }
            }
        }

        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum MapBoundaryLevel {
    Province,
    Commandery,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MapBoundary {
    pub id: String,
    pub name: String,
    pub level: MapBoundaryLevel,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub valid_from_year: Option<i32>,
    #[serde(default)]
    pub valid_to_year: Option<i32>,
    pub confidence: SourceConfidence,
    pub source: String,
    #[serde(default)]
    pub city_ids: Vec<CityId>,
    #[serde(deserialize_with = "deserialize_boundary_points")]
    pub points: Vec<MapPosition>,
}

impl MapBoundary {
    pub fn includes_year(&self, year: i32) -> bool {
        self.valid_from_year.is_none_or(|from| year >= from)
            && self.valid_to_year.is_none_or(|to| year <= to)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct TerritoryCell {
    pub boundary_id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub city_ids: Vec<CityId>,
    pub seed: MapPosition,
    pub points: Vec<MapPosition>,
}

#[derive(Debug, thiserror::Error)]
pub enum MapBoundaryError {
    #[error("读取地图边界失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("解析地图边界失败: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("地图边界数据无效: {0}")]
    Invalid(String),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum BoundaryPointSeed {
    Named { x: f32, y: f32 },
    Tuple([f32; 2]),
}

fn deserialize_boundary_points<'de, D>(deserializer: D) -> Result<Vec<MapPosition>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let points = Vec::<BoundaryPointSeed>::deserialize(deserializer)?;
    Ok(points
        .into_iter()
        .map(|point| match point {
            BoundaryPointSeed::Named { x, y } => MapPosition { x, y },
            BoundaryPointSeed::Tuple([x, y]) => MapPosition { x, y },
        })
        .collect())
}

fn polygon_centroid(points: &[MapPosition]) -> MapPosition {
    let mut x = 0.0;
    let mut y = 0.0;
    for point in points {
        x += point.x;
        y += point.y;
    }
    let count = points.len().max(1) as f32;
    MapPosition {
        x: x / count,
        y: y / count,
    }
}

fn expand_polygon(points: &[MapPosition], scale: f32, padding: f32) -> Vec<MapPosition> {
    let center = polygon_centroid(points);
    points
        .iter()
        .map(|point| {
            let dx = point.x - center.x;
            let dy = point.y - center.y;
            let length = (dx * dx + dy * dy).sqrt();
            let padding_scale = if length <= f32::EPSILON {
                0.0
            } else {
                padding / length
            };
            MapPosition {
                x: center.x + dx * (scale + padding_scale),
                y: center.y + dy * (scale + padding_scale),
            }
        })
        .collect()
}

fn convex_hull(mut points: Vec<MapPosition>) -> Vec<MapPosition> {
    points.sort_by(|a, b| a.x.total_cmp(&b.x).then(a.y.total_cmp(&b.y)));
    points.dedup_by(|a, b| (a.x - b.x).abs() < 0.001 && (a.y - b.y).abs() < 0.001);
    if points.len() <= 3 {
        return points;
    }

    let mut lower = Vec::new();
    for point in &points {
        while lower.len() >= 2
            && cross(lower[lower.len() - 2], lower[lower.len() - 1], *point) <= 0.0
        {
            lower.pop();
        }
        lower.push(*point);
    }

    let mut upper = Vec::new();
    for point in points.iter().rev() {
        while upper.len() >= 2
            && cross(upper[upper.len() - 2], upper[upper.len() - 1], *point) <= 0.0
        {
            upper.pop();
        }
        upper.push(*point);
    }

    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

fn cross(a: MapPosition, b: MapPosition, c: MapPosition) -> f32 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

fn clip_polygon_to_nearest_seed(
    polygon: &[MapPosition],
    seed: MapPosition,
    other_seed: MapPosition,
) -> Vec<MapPosition> {
    if polygon.is_empty() {
        return Vec::new();
    }

    let mut clipped = Vec::new();
    for index in 0..polygon.len() {
        let current = polygon[index];
        let next = polygon[(index + 1) % polygon.len()];
        let current_inside = seed_side(current, seed, other_seed) >= -0.001;
        let next_inside = seed_side(next, seed, other_seed) >= -0.001;

        match (current_inside, next_inside) {
            (true, true) => clipped.push(next),
            (true, false) => {
                clipped.push(seed_bisector_intersection(current, next, seed, other_seed))
            }
            (false, true) => {
                clipped.push(seed_bisector_intersection(current, next, seed, other_seed));
                clipped.push(next);
            }
            (false, false) => {}
        }
    }

    clipped
}

fn seed_side(point: MapPosition, seed: MapPosition, other_seed: MapPosition) -> f32 {
    let dx = other_seed.x - seed.x;
    let dy = other_seed.y - seed.y;
    let rhs = (other_seed.x * other_seed.x + other_seed.y * other_seed.y
        - seed.x * seed.x
        - seed.y * seed.y)
        * 0.5;
    rhs - (point.x * dx + point.y * dy)
}

fn seed_bisector_intersection(
    start: MapPosition,
    end: MapPosition,
    seed: MapPosition,
    other_seed: MapPosition,
) -> MapPosition {
    let start_side = seed_side(start, seed, other_seed);
    let end_side = seed_side(end, seed, other_seed);
    let denominator = start_side - end_side;
    if denominator.abs() <= f32::EPSILON {
        return start;
    }
    let t = (start_side / denominator).clamp(0.0, 1.0);
    MapPosition {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_JSON: &str = r#"
    {
      "version": 1,
      "boundaries": [
        {
          "id": "province_si",
          "name": "司隶",
          "level": "province",
          "valid_from_year": 184,
          "valid_to_year": 220,
          "confidence": "Medium",
          "source": "test",
          "points": [
            { "x": -10.0, "y": -10.0 },
            { "x": 10.0, "y": -10.0 },
            { "x": 10.0, "y": 10.0 },
            { "x": -10.0, "y": 10.0 }
          ]
        },
        {
          "id": "commandery_henan",
          "name": "河南尹",
          "level": "commandery",
          "parent_id": "province_si",
          "valid_from_year": 184,
          "valid_to_year": 220,
          "confidence": "Medium",
          "source": "test",
          "city_ids": ["luoyang"],
          "points": [
            { "x": -5.0, "y": -5.0 },
            { "x": 5.0, "y": -5.0 },
            { "x": 5.0, "y": 5.0 }
          ]
        }
      ]
    }
    "#;

    #[test]
    fn valid_catalog_loads_and_filters_by_year() {
        let catalog = MapBoundaryCatalog::from_json_str(VALID_JSON).unwrap();
        assert_eq!(catalog.boundaries.len(), 2);
        assert_eq!(catalog.boundaries_for_year(190).count(), 2);
        assert_eq!(catalog.boundaries_for_year(230).count(), 0);
    }

    #[test]
    fn invalid_catalog_rejects_short_polygons() {
        let input = VALID_JSON.replace(
            r#",
            { "x": 5.0, "y": 5.0 }"#,
            "",
        );

        let error = MapBoundaryCatalog::from_json_str(&input).unwrap_err();
        assert!(error.to_string().contains("至少需要 3 个点"));
    }

    #[test]
    fn invalid_catalog_rejects_bad_year_range() {
        let input = VALID_JSON.replace(
            r#""valid_from_year": 184,
          "valid_to_year": 220"#,
            r#""valid_from_year": 221,
          "valid_to_year": 220"#,
        );

        let error = MapBoundaryCatalog::from_json_str(&input).unwrap_err();
        assert!(error.to_string().contains("年份范围无效"));
    }

    #[test]
    fn invalid_catalog_rejects_commandery_without_parent() {
        let input = VALID_JSON.replace(
            r#""parent_id": "province_si",
          "#,
            "",
        );

        let error = MapBoundaryCatalog::from_json_str(&input).unwrap_err();
        assert!(error.to_string().contains("缺少父级州"));
    }

    #[test]
    fn territory_cells_partition_active_commanderies() {
        let catalog = MapBoundaryCatalog::from_json_str(VALID_JSON).unwrap();
        let cells = catalog.territory_cells_for_year(190);

        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0].boundary_id, "commandery_henan");
        assert!(cells[0].points.len() >= 3);
    }
}
