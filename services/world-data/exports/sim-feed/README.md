# Simulation settlement feed

Built with `python -m worlddata sim-feed` (see `src/worlddata/sim_feed.py`).
This is the **Contract A** handoff from world data (Agent 1) to the headless
simulation (Agent 2): the real settlements Milo's `worldgen.Generate` was
designed to consume verbatim (`services/simulation/internal/worldgen/worldgen.go`).

## File

| File | Contents |
|---|---|
| `settlements.json` | **Bare JSON array** of 487 V1-region settlements as `worldgen.Settlement` JSON — decodes directly with `json.Unmarshal(raw, &[]worldgen.Settlement{})` |
| `settlements.meta.json` | Provenance sidecar: source, licence, retrieved date, region, projection, settlement count |

## Shape

Each settlement object uses the **exact Go field names** of `worldgen.Settlement`
(that struct has no `json` tags; Go matches keys case-insensitively):

| Key | Meaning | Source |
|---|---|---|
| `Name` | Display name | Census place name, suffix stripped |
| `State` | State name | Pipeline `settlements.state_name` |
| `SideID` | 1–6 | `section_key` → sim `Sides()` order (1 Pacific Compact … 6 Atlantic Corridor) |
| `Population` | Residents | Census Vintage 2023 sub-county estimates |
| `X`, `Y` | Leagues | Equirectangular around bbox centre, 1 league = 3 statute miles |
| `IsPort` | Blockade-eligible | Within 25 km of a Natural Earth 1:10m port |
| `Terrain` | `route_terrain` enum | Coast (5) if port; Mountain (3) if elev ≥ 500 m; Hills (2) if elev ≥ 200 m; else Plain (0) |
| `Farmland` | Hinterland multiplier | State cropland share ÷ national mean (USDA ERS Major Land Uses); mean state = 1.0 |
| `IsReal` | Provenance | Always `true` |

## Known gaps (CONSTITUTION.md 1.1)

- **Terrain Forest (1) and Swamp (4) are never emitted.** They cannot be
  derived from the pipeline's tables; affected settlements map to Plain.
- **No ports in the V1 bbox.** The Natural Earth 1:10m ports table has no port
  within 25 km of any V1 settlement (nearest is Cleveland, ~100 km north of
  the bbox). River ports on the Ohio are not in that dataset. All 487
  settlements have `IsPort: false`; the sim's blockade mechanic has nothing
  to act on in V1 until port coverage improves.
- **Licence:** U.S. Government work, public domain (Title 17 U.S.C. 105).
  No attribution required.
