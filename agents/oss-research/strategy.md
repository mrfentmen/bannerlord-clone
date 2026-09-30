# OSS Strategy Games — Code-Reuse Catalog

**Project:** Browser 3D Mount & Blade-style campaign game, modern America (Babylon.js 8 client, Go sim server, Python world-data, Cloudflare hosting)
**Date:** 2026-09-30
**Rule:** Clean-room open-source CODE only. No ripped game assets — those are a license trap. GPL/AGPL projects are **reference only** (study the design, do not copy code into our repo).

---

## Battle engines (large-scale RTS — the battle-size-knob problem)

| Project | URL | License | Language/engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **Spring RTS engine** | https://github.com/spring/spring | GPL-2.0 | C++ | 3D RTS engine, up to 5,000 units per battle, deterministic synchronized sim, Lua scripting of AI/GUI/pathfinding, LOS/radar sensors, projectile ballistics, deformable terrain | Deterministic battle-sim architecture; synced/unsynced sim boundary design; hierarchical movement classes; sensor/LOS system design | **Reference only** — GPL + native C++, can't run in browser, but the deterministic-sim design is the textbook for our battle-size knob |
| **0 A.D. (Pyrogenesis)** | https://gitea.wildfiregames.com/0ad/0ad | GPL-2.0-or-later | C++/JS | Full RTS: formation controller, UnitAI, UnitMotion, long/short pathfinding, obstruction rasterization, range/visibility | Formation-controller entity design; how formations interact with pathfinder + obstruction + visibility components | **Reference only** — study `Formation`/`UnitAI`/`Pathfinder` interaction for our troop AI |
| **OpenRA** | https://github.com/OpenRA/OpenRA | GPL-3.0 | C# | Deterministic tick simulation, command streams, replays through the same order pipeline, state-sync hashes, out-of-sync diagnostics, deterministic A* tie-breaking, fog/shroud | Deterministic command-pipeline architecture (UI, AI, replays all submit to the same sim); replay system design | **Reference only** — the clearest end-to-end deterministic-sim reference in existence |

## Browser-based strategy (closest to our stack)

| Project | URL | License | Language/engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **OpenFrontIO** | https://github.com/openfrontio/OpenFrontIO | **AGPL-3.0** | TypeScript (browser + server) | Browser RTS, 100+ players per match, ~200k daily players, deterministic lockstep, territory expansion on real-world geography, alliances, WebSocket transport | Lockstep netcode patterns; territory-expansion mechanics; real-geography map rendering in browser; client/server split | **Worth pulling (study)** — the single closest thing to our game that exists. AGPL: read and reimplement, do NOT paste code into our repo without a license decision |
| **open-historia** | https://github.com/sarthak-fleet/open-historia | Unverified — check before use | TS/React + Hono on **Cloudflare Workers** + MapLibre GL | Browser grand-strategy, AI-driven nations, WebGL map with hierarchical LOD, dual-mode saves (cloud/local) | **Cloudflare Workers game-serving architecture** — directly matches our decided hosting; MapLibre web-map rendering patterns | **Worth pulling** — verify license first, then mine the Workers + map code |
| **OpenFrontIO-MaxEdit** (fork) | https://github.com/juice-de-orange/openfrontio-maxedit | Inherits AGPL (unverified) | TypeScript + **Go** | Persistent-world fork of OpenFrontIO: **Go map generator**, WebSocket scaffolding, water pathfinding, pathfinding primitives, HOI4-essentials economy | Go map-generation code — same language as our sim server; pathfinding primitives | **Worth pulling (study)** — Go code is the most directly portable to our sim |

## Grand-strategy sims (campaign layer)

| Project | URL | License | Language/engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **untitled-grand-strategy** | https://github.com/polarorb/untitled-grand-strategy | Unverified — check before use | Rust + Bevy | HOI4-scale Cold War GS: 4,594-province map, **deterministic sim core (`ugs-sim`) strictly separated from presentation** — sim never depends on rendering; RON scenario data files | Sim/app separation architecture — mirrors our Go-sim + Babylon-client split exactly; province graph + pathfinding; deterministic core discipline | **Worth studying closely** — best architectural role model for our codebase |
| **Archon-Engine** | https://github.com/parhelia512/archon-engine | Unverified — check before use | C# / Unity | Deterministic GS engine: fixed-point arithmetic, data-oriented design, GPU map rendering from plain bitmaps/PNG, loads EU4 map data, AI/diplomacy/military/economy pillars | Fixed-point determinism patterns; beautiful-maps-from-bitmaps technique (cheap, fits our real-geography map) | **Reference** — Unity-specific, but the bitmap-map and fixed-point ideas transfer |
| **WarStrategyGame** | https://github.com/youfes98/warstrategygame | Unverified — check before use | Godot 4.6 (GDScript) + Python pipeline | Modern-2026 GS: 4,584 real provinces (Natural Earth), GPU shader map, AI where 194 countries make monthly decisions (military/infra/diplomacy/trade/war), JSON save system, multi-rate tick (hour→year) | AI decision-loop structure; JSON save/load; multi-rate tick design; Natural Earth → game-data pipeline (overlaps our Python world-data work) | **Reference** — modern-era setting is the closest thematic match |
| **Laissez-faire** | https://github.com/thamil33/laissez-faire | Unverified — check before use | Unknown (engine) | EU-inspired "0-to-infinite player" simulation engine — runs headless with zero humans, or with many AI actors; emergent behavior focus | Headless backend-sim patterns; "everything affects everything" is literally its design thesis | **Reference** |
| **grandstrategygame** (martinianolopez) | https://github.com/martinianolopez/grandstrategygame | Unverified — check before use | Unknown (2D) | 2D EU4-inspired: territorial control, diplomacy, economy, warfare, AI nations; clean-architecture focus | Lean GS core loop design | **Reference** |
| **euv-cli** | https://github.com/jaakkolipp/euv-cli | Unverified — check before use | **Pure Python stdlib** (curses) | Terminal EU/Victoria-like: provinces, alliances, claims, coalitions, wars, scoring | Diplomacy/claim/coalition game logic in pure Python — directly readable by our Python world-data lane | **Reference** — small, readable, Python |
| **Triumph & Tragedy** (Confoederatio) | https://github.com/Confoederatio/RP5.2 | Unverified — check before use | Gamechanger node-based engine, JSON DSL modding | Open-source multiplayer grand strategy, fully automated | Multiplayer GS patterns; JSON-DSL modding approach | **Reference** |
| **Epochs of Ascendancy** | https://github.com/mmf62208/epochs-of-ascendancy | Unverified — check before use | Godot 4.6 | HOI4-inspired: division/tank/plane/ship designer, focus trees, tech trees, 1918/1936/2026 starts | Unit designer + focus-tree data models | **Reference** |

## Bannerlord-specific

| Project | URL | License | Language/engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **BannerlordCoop** | https://github.com/bannerlord-coop-team/bannerlordcoop | Unverified — check before use | C# (Bannerlord mod) | Shared persistent Bannerlord campaign, up to 8 players, dedicated server; replicates towns, parties, battles, diplomacy; siege/battle mission sync | Host-authoritative campaign-sync architecture; how they replicate settlements/parties/battles between host and clients | **Reference only** — requires owning Bannerlord; C# mod code doesn't port to browser, but the sync design is instructive |
| **cRPG** | https://github.com/crpg2/crpg | GPL-3.0 | C# (Bannerlord mod) | Persistence (xp, gold, items, stats) for Bannerlord multiplayer | Persistence-layer patterns | **Skip** — GPL + Bannerlord-dependent, nothing portable |

## Not found (do not chase)

- **No open-source Ultimate General: Civil War clone exists.** Search returned only pirated copies of the commercial game — avoid entirely.
- **No complete open-source CK3/EU4/HOI4 clone.** The Paradox-likes above are engines and partial games, not finished CK3/EU4/HOI4 replacements. Closest architectural matches are untitled-grand-strategy and Archon-Engine.
- **M2TWEOP** (Medieval 2: Total War Engine Overhaul) is a modding/injection tool for the commercial game, not reusable code.

## License summary for pulling

- **Safe to pull from (after verifying the repo's LICENSE file):** anything MIT / Apache-2.0 / BSD / CC0 / public domain.
- **Reference only, do not copy:** Spring (GPL-2.0), 0 A.D. (GPL-2.0+), OpenRA (GPL-3.0), OpenFrontIO (AGPL-3.0), cRPG (GPL-3.0). Study the design, reimplement cleanly.
- **Verify before touching:** every row marked "Unverified" — open the repo, read LICENSE, then decide.

## Recommended pull order

1. **open-historia** — Cloudflare Workers serving pattern (our hosting is decided; this is the how).
2. **OpenFrontIO-MaxEdit** — Go map generator (same language as our sim).
3. **untitled-grand-strategy** — sim/app separation discipline (the architecture we want).
4. **OpenFrontIO** — lockstep + territory mechanics (study, AGPL, reimplement don't copy).
5. **Spring engine docs/code** — deterministic battle sim at 5,000 units (the battle-size knob made real).
