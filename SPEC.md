# SPEC.md

Technical specification. Read DESIGN.md and CAUSE_EFFECT.md first, and CONSTITUTION.md for rules this spec must obey.

---

## 1. ARCHITECTURE OVERVIEW

Three layers over a persistent simulation:

1. **Simulation layer.** Runs all systems from CAUSE_EFFECT.md on a fixed tick against every entity. Headless. Can run with no client attached.
2. **Campaign layer.** A 3D world map the player moves across in real time. Parties, caravans, towns, roads. Cheap to render.
3. **Battle layer.** A full 3D scene instantiated when forces clash. Instanced crowds, formations, player-controlled character. Expensive to render, short-lived.

```
[Client: Campaign + Battle (Babylon.js)] <-> [Go API / WebSocket] <-> [Postgres: world state]
                                                   |
                                          [Tick loop: all systems]
```

## 2. WORLD DATA

- Real geography and settlements imported from public datasets (OpenStreetMap extracts for roads and buildings, Natural Earth or geoBoundaries for boundaries, GeoNames or SimpleMaps for populations). Not hand-drawn, not hand-typed.
- Elevation from a public DEM (SRTM or similar) for terrain height on the campaign map and battle maps.
- Settlements above a population threshold become towns or cities with full simulation. Smaller ones become villages that produce food or goods for a nearby town.
- Roads and rail from imported line data, used for travel speed, caravan routes, and road_safety segments.
- Starting region: one region for V1 (decision in PHASES.md Phase 0). The pipeline must work for any region so the map can grow.

## 3. ENTITY MODEL

Entities: Town, Village, Party, Caravan, Character, Faction, Route, Building, Item.

Town fields are listed in CAUSE_EFFECT.md section 2. Additional core tables:

- `characters`: id, name, faction_id, role, skills jsonb, traits jsonb, location, party_id
- `parties`: id, leader_id, position x/y/z, food, ammo, medicine, morale, wages_owed, troops jsonb
- `factions`: id, name, leader_id, treasury, stance jsonb
- `routes`: id, from_id, to_id, distance, road_safety, geometry
- `goods` and `market_prices`: per town, per good, updated by the Market system
- `event_log`: gameplay events, feeds LLM recap text later
- `cause_log`: the why-chain rows defined in CAUSE_EFFECT.md section 4
- `battle_log`: participants, outcome, casualties, terrain

### 3B. Additional tables for sides, resources, and rulers

- `sections`: id, name, leader_id, member states, relations to other sections
- `state_profiles`: computed from real data (population, farmland, mining output, economic output, area, ports), never hand-typed
- `rulers`: id, tier, faction_id, traits jsonb, ambitions jsonb, holdings, wealth (money, gold, food, metal), loyalty_to_leader, influence, renown
- `relations`: ruler pair or side pair to score, with reasons
- `armies`: id, leader_id, member parties, position, destination, supply (food, money, metal, medicine), morale, fatigue
- `sieges`: attacker army, target town, start tick, defender and attacker food, disease state
- `exchange_rate`: gold-to-money rate per side over time
- `wars`: sides, start tick, reason, status, terms

Data sources for state profiles: census population, agricultural cropland data, geological survey mineral data, economic output data, geographic area and ports. All loaded at Phase 0.

## 4. TICK MODEL

- Fixed tick, for example one in-game hour per tick, with the campaign clock running at a configurable real-time ratio.
- Systems run in a fixed documented order per tick, reading a snapshot of the previous state and writing to the next, so results never depend on which system ran first within the same tick. Document this in code and CHANGELOG.
- Player actions are queued and applied at tick boundaries.

## 5. BATTLE LAYER

### 5.1 Crowd rendering

- Babylon.js Thin Instances for each troop mesh type. Target a handful of draw calls regardless of unit count.
- Animation via GPU vertex-texture skinning (baked animation textures). No per-instance CPU bone skinning past a few dozen units.
- Three-tier LOD: close (full skeletal mesh), mid (simplified mesh), far (billboard impostor). Distance thresholds tuned by testing, not assumed.
- Target: 300 units at 60 fps and 1,000 units at 30 fps on mid-range consumer hardware for Phase 3. Raise later as tests allow.

### 5.2 Battle AI

- Formation-level movement and engagement, individual units offset inside the formation.
- Morale from local friendly-to-enemy ratio, casualties, leader status, and supply state (hungry or unpaid units break sooner).
- Ranged units with limited ammo taken from the party's actual ammo stock.
- Player character controlled directly (movement, attack directions, block, ranged, mount or vehicle if included), plus simple formation commands (hold, advance, charge, fall back, follow).

### 5.3 Battle setup and write-back

- The snapshot passed in: both sides' troops (count, quality, gear), morale, supply state, terrain type and map, time of day, weather.
- Results written back: casualties, wounded, loot, ammo used, territory change, reputation changes, and cause_log entries so aftermath ripples through the simulation.

## 6. CAMPAIGN LAYER

- 3D terrain from the DEM with roads overlaid. Parties and caravans move over real elapsed time along roads or off-road at slower speed.
- Towns shown as 3D clusters with distinct silhouettes by size and type. Full interior exploration is out of scope for V1.
- UI panels: party, inventory, town, market, troops, companions, diplomacy, and the **Why panel** that renders the cause log as a readable chain.
- Skeleton loading states for anything reading from the backend.

## 7. UI AND ART DIRECTION

- Visual direction is locked in PHASES.md Phase 2 before panels are built: references, palette, typography, tone (grounded and gritty, modern, not neon).
- A shared color grade and a single texture-resolution budget are applied to all imported models so mixed-source assets look cohesive. See ASSETS.md.

## 8. CONTENT GENERATION

- Optional LLM-generated flavor text (town descriptions, character bios, event blurbs), grounded in real simulation state and real data.
- Generate once, cache, and regenerate only when a state crosses a defined band, not on every tick change.
- Batch at world creation, log token spend per run in CHANGELOG.md.
- Prompts include specific real data (place names, populations, neighbors, current state) so output differs by place without asking the model to be more creative.

## 9. HOSTING DECISION (needs to be made)

Go does not run natively on Cloudflare Pages or Workers. Options:

1. **Simulation runs in the browser** (a Web Worker in TypeScript, or the Go simulation compiled to WASM), saves to IndexedDB, no server cost. Best fit for a near-zero budget and single-player. Postgres would only be used for optional cloud saves.
2. **Go server on a small VPS or container** with Postgres, fronted by Cloudflare. Needed if the world should keep running when the player is offline or if multiplayer is planned later.
3. **Hybrid:** browser sim for V1, same Go code reused server-side later.

The constitution locks Go and Postgres, so option 2 or 3 fits as written. Option 1 in TypeScript would need a constitution update first.

## 10. PERFORMANCE BUDGETS

- Campaign map: 60 fps with the full V1 region loaded on mid-range hardware.
- Battle: budgets in section 5.1.
- Initial load: skeleton UI immediately, streamed assets afterward.
- Model budgets per ASSETS.md.

## 11. OUT OF SCOPE FOR V1

- Multiplayer, naval combat, building interiors, full global map, deep dialogue trees.
