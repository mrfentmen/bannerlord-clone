# Contract A Changelog

The sim feed (`services/world-data/src/worlddata/sim_feed.py`) is Contract A:
the world-data → simulation pipe. The sim documents which version it reads.
Bump `CONTRACT_VERSION` on any schema change and record it here.

## v2 (2026-10-01)

- **routes.json added** (Tier 1B-19): the feed now ships the travel graph,
  not just settlements. `routes.json` is a JSON array of
  `{From, To, LengthKm, RoadClass, Kind, Minutes}` where From/To are indices
  into the sorted `settlements.json` array.
- **Metro bbox slices** (Tier 1B-27): `build_sim_feed` accepts `bbox` and
  `region_name_override` to generate metro-specific feeds (e.g. NYC metro:
  275 settlements, 523 routes).
- `settlements.meta.json` gains `contract_version` and `route_count`.

## v1 (2026-09-30)

- Initial contract: `settlements.json` as a bare JSON array with exact Go
  `worldgen.Settlement` field names
  (Name, State, SideID, Population, X, Y, IsPort, Terrain, Farmland, IsReal).
- Provenance in sidecar `settlements.meta.json`.
