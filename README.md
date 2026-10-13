# Bannerlord Clone — Modern America, Divided

A browser-based, full 3D Mount & Blade-style campaign game set in modern-day
America on real geography. Start as a nobody. Build a party. Fight real-time
battles with hundreds of units. Take towns. Keep them alive.

**The one premise:** *Everything affects everything.* One change ripples into
ten others, and you can trace the chain afterward.

- Take a city, fail to feed it, and the council votes you out.
- A sick town with no medicine loses its population.
- Bandits rob a caravan → clinic runs dry → outbreak spreads → workers die →
  farms go unharvested → food runs short → unrest rises → the town turns on you.

No chain is scripted. Each emerges from independent systems reading and writing
shared state. See `CAUSE_EFFECT.md` and `lore.md`.

---

## The World

America didn't fall. It thinned. The federal government dried up, states made
their own deals, and six sections accumulated — never declared, just obeyed:

- **Pacific Compact** (CA, OR, WA, HI, AK) — Rich ports, hungry cities. Marksmen and engineers.
- **Mountain Alliance** (MT, ID, WY, UT, CO, NV, AZ, NM) — Gold mines, empty country. Snipers and high ground.
- **Great Lakes Union** (ND–OH, MO) — The breadbasket. Feeds the continent. Heavy infantry and mass.
- **Southern Compact** (KY–FL, NC, SC) — First to mobilize. Fast armies, thin treasury. Light infantry and speed.
- **Lone Star Frontier** (TX, OK) — Energy independent. Answers to no one. Mounted riflemen and long reach.
- **Atlantic Corridor** (ME–VA, WV, DC) — Old money, deep ledgers. Professional soldiers and intelligence.

Full canon: `lore.md` (1,178 lines — cities, legends, mercenaries, battles,
trade goods, beliefs, quest seeds, five endings as quest chains, faction
leaders, family trees).

---

## How to Play

### The Core Loop

1. **Start** — Pick a faction, pick a state, create your character. Or start as
   the Wanderer: no faction, no bonuses, no one coming.
2. **Build** — Recruit troops, buy equipment, manage your party. Food, wages,
   and morale are real — neglect them and your army melts.
3. **March** — Move across the real American map. Marching costs time, food,
   and money. Supply lines matter. Winter kills.
4. **Fight** — Real-time battles with formation orders, flanking, morale, and
   rout. Command with right-click move, attack-move, charge, formations,
   stances, and fire modes (F6/F7).
5. **Take** — Capture towns and cities. Each has a garrison, loyalty, food
   stock, and a council that will vote you out if you fail them.
6. **Rule** — Manage taxes, construction projects, garrisons, and diplomacy.
   Keep the food flowing or watch it all burn.
7. **Win** — Five endings: Unifier (hold 26+ states), Kingmaker (own the debts),
   Breadlord (control the food), Ghost (mercenary legend), Survivor (keep one
   town alive 20 years).

### Controls

- **Camera:** WASD/arrows to pan, mouse wheel to zoom, right-drag to rotate.
  Gamepad and touch supported.
- **Orders:** Right-click to move, A+click for attack-move, C to charge,
  S to spread out, Shift+G to form up. F6 fire-at-will, F7 hold fire.
- **UI:** Click settlements to open town panels. Market for trading, Party
  for troops, March Planner for routes, Diplomacy for deals.

---

## Current Status

**As of 2026-10-02:** CI green on main (`5aef26f`). 292 test files, 2,465
tests passing.

### What's Built

- **Campaign client** (`clients/campaign`, Babylon.js 8 + TypeScript + Vite):
  3D campaign map on real terrain, 20+ UI panels (Market, Party, Diplomacy,
  Quests, Character Maker, Town, Ledger, etc.), save/load to IndexedDB,
  gamepad + touch input, photo mode, achievements, full audio (109 original
  tracks/SFX by Hana — menu, battle, ambient, UI, weapons, footsteps).
- **Battle system** (`clients/campaign/src/battleflow`, `src/command`):
  Pre-battle → live orders → after-action flow. Full command UI (175 tests).
  Currently uses local fallback sim; milo's real battle sim integration in
  progress.
- **Go simulation** (`services/simulation`): 20+ systems — market, march,
  bandits, construction, diplomacy, elections, disease, food, loyalty, and
  more. Headless battle sim with determinism proofs.
- **World data**: Real geography pipelines. Ohio River Valley data ready
  (487 settlements, 439 roads, 4,653 rail segments) — integration in progress.
- **Lore** (`lore.md`): 1,178 lines of canon — the Fracture, six sections,
  8 cities, 6 legends, 5 mercenary companies, daily life, 4 famous battles,
  trade goods, beliefs, 8 quest seeds, 5 endings as quest chains, faction
  leaders, family trees.

### What's In Progress

- Agent 1: Playtesting the core loop, fixing breaks, trading UI polish
- Agent 2: Swapping Ohio world data into the client
- Agent 3: Wiring milo's battle sim into the client battle flow
- Babylon 9.29 eval: Typecheck clean, 291/292 test files pass. Safe upgrade,
  ready to merge. Branch: `eval/babylon-9.29`

### What's Next

- Implement the 5 endings as playable quest chains
- Deploy live URL via Cloudflare (Worker config exists)
- Balance pass (economy, battle difficulty, progression)
- Performance test with 1,000+ units

---

## Tech Stack (Locked)

Per `CONSTITUTION.md`:

- **Rendering:** Babylon.js 8 (9.29 eval complete, safe to upgrade)
- **Client:** TypeScript + Vite + Vitest (292 test files)
- **Backend:** Go (simulation, API server)
- **Saves:** IndexedDB in the browser. No server-side world storage.
- **Deploy:** Cloudflare — Pages (client), one Worker (single domain, no
  subdomains), Containers (Go sim), Durable Objects
- **World data:** Real geography, never hand-typed
- **Assets:** Free models (Quaternius/Poly Pizza, CC0) + original procedural
  audio (109 tracks, synthesized in-repo)

---

## Project Structure

```
├── clients/campaign/       # Babylon.js web client (the game)
│   ├── src/
│   │   ├── audio/          # AudioManager + 109 original tracks/SFX
│   │   ├── battleflow/     # Battle UI: pre-battle → orders → after-action
│   │   ├── command/        # Battle command UI (formations, stances, fire modes)
│   │   ├── scene/          # 3D campaign map, battle scenes
│   │   ├── ui/panels/      # 20+ panels: Market, Party, Diplomacy, etc.
│   │   ├── saves/          # IndexedDB save/load
│   │   └── world/          # World data loading
│   └── public/audio/       # 109 audio files
├── services/simulation/    # Go simulation (20+ systems)
│   ├── cmd/apiserver/      # HTTP API + WebSocket
│   └── internal/systems/   # market, march, bandit, diplomacy, etc.
├── workers/router/         # Cloudflare Worker (single domain)
├── assets/                 # 3D models, audio manifest, licenses
├── lore.md                 # World bible (1,178 lines)
└── docs/                   # Design docs (see reading order below)
```

---

## Reading Order

1. `README.md` — this file
2. `CONSTITUTION.md` — non-negotiable build rules. Wins any conflict.
3. `lore.md` — the world bible. Read this before you write a quest.
4. `DESIGN.md` — the game from the player's point of view
5. `FEATURES.md` — every Bannerlord feature mapped to modern equivalents
6. `FACTIONS.md` — the six sections as game systems
7. `ECONOMY.md` — money, gold, food, metal, trade
8. `MARCH_AND_WAR.md` — marching, supply, sieges, war and peace
9. `RULERS.md` — hundreds of rulers, traits, ambitions, succession
10. `CAUSE_EFFECT.md` — the web of systems. The heart of the game.
11. `SPEC.md` — architecture, data model, rendering, backend
12. `docs/MASTER_PLAN.md` — the live crew task plan

Then as needed: `AI.md`, `CHARACTER.md`, `COMBAT.md`, `ERA.md`,
`QUESTS_AND_NOTABLES.md`, `UI_UX.md`, `ART_AND_AUDIO.md`, `GLOSSARY.md`,
`RISKS.md`, `TESTING_AND_BALANCE.md`.

---

## Development

```bash
# Client
cd clients/campaign
npm install
npm run dev          # Vite dev server
npm test             # Vitest (292 files)
npm run typecheck    # TypeScript
npm run build        # Production build

# Simulation
cd services/simulation
go test ./...        # Go tests
go run ./cmd/apiserver
```

CI runs on every push: client vitest + typecheck + Vite build + world-data
pytest + manifest integrity. Green required.

---

## The Crew

Built by a crew of AI agents on the muse-relay bus, led by Pax:

- **Rowan** (`del`) — Campaign client / gameplay
- **milo** — Battle simulation + voice/audio
- **Hana** (`mute`) — World data / map
- **Pax** — Animations, models, audio, repo QA
- **Buffy** — Battle command UI, task batches via GitHub API

Direct-to-main pushes. No PRs. You break it, you fix it.

---

## License

Original code and procedural audio: created for this project.
3D models: CC0 (Quaternius/Poly Pizza) — see `assets/` for per-asset licenses.
Real geography: public data sources, see world-data pipelines.
