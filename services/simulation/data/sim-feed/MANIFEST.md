# Simulation settlement feed (vendored snapshot)

`settlements.json` is a **verbatim copy** of the world-data sim feed, pinned so
the simulation can run against real settlements without checking out another
branch or waiting on a pipeline run.

| | |
|---|---|
| Source | `services/world-data/exports/sim-feed/settlements.json` |
| Branch | `worker/mute/sim-feed` (world-data, Agent 1) |
| Commit | `2bc0e6b8` — "Sim settlement feed: world-data -> worldgen.Settlement JSON (Contract A)" |
| SHA-256 | `ed4a00dfa1833e56e0e20cce2dddc333798aa8bca9ab95fb3fd5a93b5a027eab` |
| Count | 487 V1-region settlements |
| Licence | U.S. Government work, public domain (Title 17 U.S.C. 105). No attribution required. |

## Why this file is a copy

The generator lives in the world-data service and owns that export. This copy
exists so `simrun -settlements` has a stable path to read and so the tests in
`internal/simfeed` test the **shipped** file rather than a hand-written stub —
the same guarantee `internal/config` gets from shipping and testing
`config/balance.toml`.

**The two copies can drift.** When the world-data feed is regenerated, this
snapshot has to be refreshed in the same change:

```sh
git show worker/mute/sim-feed:services/world-data/exports/sim-feed/settlements.json \
  > services/simulation/data/sim-feed/settlements.json
```

`internal/simfeed` has a test that fails when this file's provenance block and
its contents disagree, so a refresh that is not a clean copy is caught rather
than shipped.

## Shape

Each settlement object uses the exact Go field names of `worldgen.Settlement`
(that struct has no `json` tags; Go matches keys case-insensitively):

| Key | Meaning | Source |
|---|---|---|
| `Name` | Display name | Census place name, suffix stripped |
| `State` | State name | Pipeline `settlements.state_name` |
| `SideID` | 1–6 | `section_key` → sim `Sides()` order |
| `Population` | Residents | Census Vintage 2023 sub-county estimates |
| `X`, `Y` | Leagues | Equirectangular around bbox centre, 1 league = 3 statute miles |
| `IsPort` | Blockade-eligible | Within 25 km of a Natural Earth 1:10m port |
| `Terrain` | `route_terrain` enum index | Coast (5) if port; Mountain (3) if elev ≥ 500 m; Hills (2) if elev ≥ 200 m; else Plain (0) |
| `Farmland` | Hinterland multiplier | State cropland share ÷ national mean (USDA ERS Major Land Uses) |
| `IsReal` | Provenance | Always `true` |

## Known gaps (CONSTITUTION.md 1.1)

These are gaps in the real data, carried through to the sim rather than papered
over. Logged here so a balance result that depends on one is traceable.

- **Terrain Forest (1) and Swamp (4) are never emitted.** They cannot be
  derived from the pipeline's tables; affected settlements map to Plain.
- **No ports in the V1 bbox.** The Natural Earth 1:10m ports table has no port
  within 25 km of any V1 settlement (nearest is Cleveland, ~100 km north of the
  bbox). River ports on the Ohio are not in that dataset. All 487 settlements
  have `IsPort: false`, so **the sim's blockade mechanic has nothing to act on
  in V1**. A V1 balance number that depends on blockade is measuring a mechanic
  that cannot fire, not a balance problem.