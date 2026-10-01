# Wire Format Changelog

**Purpose:** Record every wire format shape change with version + date.  
**Policy:** N and N-1 supported; older rejected with clear error (Tier 2C-73).

## Version 2 (2026-10-01)

### Changes from v1
- `network.json`: Added `travelEdges` array (Tier 1A-10). Each edge has
  `from`, `to`, `length_km`, `road_class`, `kind`, `minutes`, `method`.
- `settlements.json`: No shape change.
- `region.json`: No shape change.

### Compatibility
- v2 clients read v1 and v2.
- v1 clients ignore `travelEdges` (additive change).

## Version 1 (2026-09-30)

### Initial wire format
- `region.json`: Elevation tile list, bbox, metadata.
- `settlements.json`: Array of settlement objects with `osmId`, `name`,
  `place`, `lat`, `lon`, `population`, `populationSource`, etc.
- `network.json`: Road/rail geometry as GeoJSON-like segments.
- `notables.json`: Quest-giver data (added 2026-10-01, Tier 3A).

## Battle patches (separate versioning)

Battle patches use `contract_version` (see `docs/BATTLE_TERRAIN.md`).
- v1 (2026-10-01): Initial contract.

## Metro wires

Metro wires (`dist/wire/<metro>/`) use `version` field in each file.
- v1 (2026-10-01): Initial per-metro deploy (Tier 2B-66).

## Deprecation policy (Tier 2C-73)

- The client supports wire versions N and N-1.
- Older versions are rejected with: `"Wire version X not supported (min: Y)"`.
- Wire deploys are namespaced by version: `public/world/v2/...` (Tier 2C-74).
- A version is deprecated 30 days after N+1 ships.
