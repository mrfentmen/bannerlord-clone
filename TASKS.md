# TASKS.md

Granular checklist matching PHASES.md. Check items off when done and log each completion in CHANGELOG.md.

---

## PHASE 0: World Data Pipeline
- [ ] Choose the V1 region and record the decision in CHANGELOG.md
- [ ] Download road and settlement data for the region (OpenStreetMap extract)
- [ ] Download boundary data (Natural Earth or geoBoundaries)
- [ ] Download population data (GeoNames or SimpleMaps)
- [ ] Download elevation data (public DEM)
- [ ] Write import script for settlements
- [ ] Write import script for road and rail lines, build the route graph
- [ ] Write classification logic (city, town, village) from real population thresholds
- [ ] Write seed-value logic for starting fields, constants in the config file
- [ ] Create Postgres schema and load all records
- [ ] Import data for all 50 states plus D.C. and assign each to one of the six sections (FACTIONS.md)
- [ ] Compute state profiles from real data: population, farmland, mining output, economic output, area, ports
- [ ] Verify section rating profiles against FACTIONS.md section 3 (adjust data mapping, never hardcode ratings)
- [ ] Define the first playable slice (a few states across more than one side)
- [ ] Spot-check at least 10 settlements against real figures

## PHASE 1: Headless Simulation
- [ ] Create the balance config file with commented constants
- [ ] Implement Food system
- [ ] Implement Starvation system
- [ ] Implement Disease system
- [ ] Implement Labor system
- [ ] Implement Market system
- [ ] Implement Unrest system
- [ ] Implement Loyalty system
- [ ] Implement Council vote system
- [ ] Implement Migration system
- [ ] Implement Security system
- [ ] Implement Logistics system (caravans on routes)
- [ ] Implement Military upkeep system
- [ ] Implement Faction AI system (basic)
- [ ] Add money, gold, metal, influence, and renown fields and the Currency system
- [ ] Implement March system (time, terrain, size, fatigue)
- [ ] Implement Supply system and Attrition system
- [ ] Implement Siege system
- [ ] Implement Ruler decision system and Relation system
- [ ] Implement Influence system
- [ ] Implement ruler generation with traits and ambitions (RULERS.md)
- [ ] Implement cause log writes for every tracked field change
- [ ] Implement the "why" query that walks the cause chain
- [ ] Build the tick runner with documented system order and snapshot reads
- [ ] Run multi-year headless simulations and save logs
- [ ] Verify each of the ten example chains in CAUSE_EFFECT.md sections 5 and 10
- [ ] Run many seeds and confirm no side dominates every run

## PHASE 2: Campaign Map Client
- [ ] Lock visual direction (references, palette, typography, tone)
- [ ] Set up Babylon.js project and build pipeline
- [ ] Render 3D terrain from elevation data
- [ ] Render roads and routes
- [ ] Render towns as clickable 3D clusters
- [ ] Party movement along roads in real time
- [ ] Town panel
- [ ] Market panel (buy and sell)
- [ ] Party panel
- [ ] Why panel rendering the cause chain
- [ ] Go REST API for state reads and writes
- [ ] WebSocket channel for tick updates
- [ ] Skeleton loading states across all panels
- [ ] Side, state, and role selection screen with ratings, pros, cons, and biggest danger
- [ ] March planner with time and cost preview
- [ ] Daily ledger and resource warnings
- [ ] Ruler roster and ruler card
- [ ] End-to-end test: trade goods, watch prices and unrest change over time

## PHASE 3: Crowd Rendering Proof of Concept
- [ ] Create asset manifest and manifest check in the build
- [ ] Source and process one troop model per ASSETS.md
- [ ] Rig to shared skeleton and bake animation textures
- [ ] Thin-instanced troop scene
- [ ] GPU skinning for instanced animation
- [ ] Close, mid, and far LOD tiers
- [ ] Tune LOD distances by testing
- [ ] Benchmark on mid-range hardware
- [ ] Confirm 300 units at 60 fps and 1,000 units at 30 fps

## PHASE 4: Battle Scene
- [ ] Battle terrain generation from real elevation and land type
- [ ] Formation movement AI
- [ ] Engagement and combat resolution logic
- [ ] Morale and rout logic
- [ ] Ranged combat with real ammo consumption
- [ ] Player character movement and combat controls
- [ ] Formation commands (hold, advance, charge, fall back, follow)
- [ ] Snapshot loader
- [ ] Result write-back with cause log entries
- [ ] Controlled test: quality, supply, and terrain differences bias outcomes correctly

## PHASE 5: Integration
- [ ] Party contact detection on the campaign map
- [ ] Load battle scene with correct snapshot
- [ ] Post-battle write-back to parties, towns, factions, reputation
- [ ] Siege and town capture flow
- [ ] Army gathering with influence cost
- [ ] Captives: release, ransom, hold, recruit, execute, with consequences
- [ ] War declaration, peace terms, tribute, and vassalage
- [ ] End-to-end test: trade, recruit, fight, capture, and watch consequences ripple

## PHASE 6: Governance and Depth
- [ ] Council vote UI with visible conditions
- [ ] Tax and building management UI
- [ ] Garrison and patrol orders
- [ ] Outbreak events and response options (quarantine, medicine orders, sanitation)
- [ ] Companions: recruit, assign to govern, caravan, or detachment
- [ ] Character skills, perks, and troop trees
- [ ] Faction AI improvements (diplomacy, war, alliances)
- [ ] Lord defection, marriage, heirs, and succession fights
- [ ] Leader challenge and replacement by vote
- [ ] Verify: lose a town by vote, lose one to plague, save one from each

## PHASE 7: Content and Polish
- [ ] LLM prompting pipeline for town descriptions
- [ ] LLM prompting pipeline for character bios
- [ ] LLM prompting pipeline for event text
- [ ] Generation caching, band-based regeneration, token spend logging
- [ ] Credits screen generated from the asset manifest
- [ ] Audio pass
- [ ] Visual polish pass against CONSTITUTION.md section 3
- [ ] Performance pass
- [ ] Full playtest across a meaningful slice of the map

---

## FEATURE BACKLOG (from FEATURES.md)

### V1 additions
- [ ] Character creation with backgrounds, six attributes, and 18 skills
- [ ] Insignia and flag editor
- [ ] Party roles (Quartermaster, Scout, Surgeon, Engineer)
- [ ] Troop trees per side with era-tier equipment sets
- [ ] Vehicle system (one or two types) with fuel, repair, and cargo
- [ ] Ballistics model (weapon versus armor, range, rate of fire)
- [ ] Fire team and formation commands (spread, suppress, cover, flank)
- [ ] Notables in towns and villages, with quest giving and recruits
- [ ] Ten starter quest types
- [ ] Bandit types by region
- [ ] Map encounter menus (attack, flee, talk, bribe) — battle API endpoints pushed (encounters/battles), encounter auto-resolve + battle sim logic pushed; UI pending
- [ ] Time controls (pause, normal, fast)
- [x] Save, load, autosave (SaveManager in clients/campaign/src/data/saves.ts — IndexedDB named slots, autosave, export/import; UI pending)
- [ ] Town menu (market, town hall, bar, motor pool, clinic)
- [ ] Era system: start year and tech unlock tiers

### V2 additions
- [ ] Gunsmithing and vehicle mechanics crafting
- [ ] Tournaments and arena, duels, firing range
- [ ] Bandit compound infiltration missions
- [ ] Kingdom policies voted by rulers
- [ ] Founding your own faction
- [ ] Family, marriage, heirs
- [ ] Persuasion dialogue checks
- [ ] Random map events
- [ ] Encyclopedia
- [ ] Weather, seasons, day and night
- [ ] Media and public opinion system
- [ ] Infrastructure system (power, water, rail, bridges, dams)
- [ ] Full siege system (defender weapons, sallies, breach phases)
- [ ] Main story campaign goal
