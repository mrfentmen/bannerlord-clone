# Battle Terrain Data Contract

**Version:** 1  
**Date:** 2026-10-01  
**Author:** Hana (world-data lane)  
**Reviewers:** Rowan (client lane), milo (sim lane) — review required before data flows.

This document defines the data contract for battle-map terrain. The world-data
lane produces per-settlement battle patches; the client renders them and the
sim uses them for tactical combat.

## Overview

Each settlement gets a **battle patch**: a square terrain tile centered on the
settlement, used for tactical battles. The patch is derived from real data
(elevation tiles, NLCD land cover, building footprints) and exported in the
client wire format.

## Patch Geometry

- **Size:** 2 km × 2 km square, centered on the settlement centroid.
- **Resolution:** 64 × 64 heightfield samples (31.25 m per sample).
- **Coordinate system:** Local ENU (east-north-up) in metres, origin at patch
  centre. The client converts to world coordinates using the settlement's
  lat/lon.

## Data Schema

Each patch is a JSON object with the following fields:

### heightfield

- **Type:** Array of 4,096 floats (64×64, row-major, north-to-south).
- **Units:** Metres above sea level.
- **Source:** SRTM elevation tiles, bilinearly resampled to 31.25 m.
- **Null handling:** Voids filled by nearest-neighbour; never null in output.

### biome

- **Type:** String, one of 10 values.
- **Values:** `city`, `forest`, `plains`, `snow`, `river`, `desert`, `hills`,
  `swamp`, `coastal`, `industrial`.
- **Source:** Classifier in `services/world-data/src/worlddata/battle_terrain.py`
  (Tier 2A-43). Each settlement gets exactly one biome from real data
  (NLCD land cover, elevation, latitude, place boundaries).

### cover_objects

- **Type:** Array of objects.
- **Schema per object:**
  - `type`: string — one of `wall`, `building`, `tree`, `rock`, `vehicle`.
  - `x`, `y`: float — position in patch-local metres (east, north of centre).
  - `height_m`: float — obstacle height in metres.
  - `radius_m`: float — footprint radius in metres (for collision).
  - `rotation_deg`: float — facing, 0 = north, clockwise.
- **Source:** By biome template (Tier 2A-44 to 53). City uses building
  footprints; forest uses tree density; etc.
- **Count:** 0–500 per patch (byte budget enforced, Tier 2A-56).

### spawn_zones

- **Type:** Object with three zones.
- **Schema:**
  - `attacker`: `{x, y, width_m, height_m}` — rectangle in patch-local metres.
  - `defender`: `{x, y, width_m, height_m}` — rectangle in patch-local metres.
  - `reinforcement_edge`: string — one of `north`, `south`, `east`, `west`.
- **Rules:** Attacker and defender zones do not overlap. They are placed on
  opposite edges of the patch, with the reinforcement edge adjacent to the
  attacker's zone.

### water_mask

- **Type:** Array of 4,096 booleans (64×64, row-major, matching heightfield).
- **Meaning:** `true` where the sample is water (river, lake, ocean).
- **Source:** NLCD open-water class + place boundary water polygons.
- **Effect:** Water cells are impassable to ground units; they affect movement
  and line-of-sight in the sim.

## Wire Format

- **Path:** `dist/wire/battle/<settlement_id>.json`
- **Format:** JSON, UTF-8, no pretty-printing (byte budget).
- **Naming:** `<settlement_id>` is the TIGER settlement ID (e.g. `36-51000`).

## Byte Budget

- **Max:** 256 KB per patch (Tier 2A-56).
- **Enforcement:** CI asserts `os.path.getsize(patch) <= 262144`.
- **Typical:** ~50 KB (heightfield as quantized int16 deltas + sparse cover).

## Versioning

- **Contract version:** 1.
- **Bump rule:** Any schema change (new field, renamed field, changed units)
  bumps the version and requires re-review by client + sim lanes.
- **Location:** Version is in the patch JSON as `"contract_version": 1`.

## Review Sign-off

- [ ] Rowan (client): The schema has everything the renderer needs.
- [ ] milo (sim): The schema has everything the battle sim needs.
- [ ] Hana (world-data): The schema is producible from real data.

Data does not flow until all three sign off.
