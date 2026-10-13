# city-sim — NOTES (design reference only)

Source: `codersusu/game-city-skylines` ("SEABRIGHT", Unity C# city
builder). **No license detected — code is NOT copied here.** These
are my own notes on the architecture. Reimplement, don't copy.

## CitySimulation.cs — the tile economy sim

- **Tile grid:** 48×48 tiles, 10 m cells. Each `CityTile` holds
  X/Z, kind (residential/office/road/etc.), level, residents, jobs,
  growth, land value, pollution.
- **Zoning with capacity math:** `ResidentCapacity()` scales with
  tile level (e.g. high-residential: 32 + 32×level). Buildings level
  up; capacity follows. Simple, legible progression.
- **Economy:** money, income, expenses, tax rate (default 11%),
  happiness, traffic flow, power use vs capacity. `Tick(days)`
  advances the economy; `Recalculate()` refreshes aggregates.
- **Roads:** `BuildRoad(x0,z0,x1,z1)` lays road tiles;
  `RoadTraffic(x,z)` returns per-tile load clamped 0–1
  (load/35). Roads are first-class sim data, not decoration.
- **Unlocks by population milestones:** office at 150, high-res at
  350, stadium at 600 — progression gated on `PeakPopulation`.
- **Save format:** versioned `SaveData` (version, map size, day,
  peak population). Version field first — migrations are possible.

## Presentation split (the part worth stealing)

Sim and presentation are separate classes:

- `CityTraffic` — cars as `List<Car>` with route (list of road
  tiles), segment index, kind; rendered with **instanced meshes**
  (`carMatrices` per model). Traffic is data; rendering is instancing.
- `CityPedestrians` — `Walker` agents with segment + outfit index,
  same instanced rendering approach.

This is exactly the architecture our towns need: the Go sim owns
traffic/pedestrian *data* (routes, positions), the client renders
them as instanced meshes. No per-agent scene-graph nodes.

## Relevance to bannerlord-clone

Town scenes need ambient life: traffic on roads, pedestrians on
sidewalks, an economy behind the shop UI. SEABRIGHT shows the
minimal complete version — tile economy + instanced crowds — and
its milestone unlocks are a ready-made progression template for
town tiers.
