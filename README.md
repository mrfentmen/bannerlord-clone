# README.md
## What this is
A browser-based, full 3D (x, y, z) game in the spirit of Mount & Blade II: Bannerlord, set in the modern day on real-world geography. You start as a nobody, build a party, fight real-time battles with crowds of units, take over towns and cities, and try to keep them alive.
## The one premise
**Everything affects everything.** One change ripples into ten others, and the player can trace the chain afterward.
You pick a side, pick a state, and play a Bannerlord-style campaign across America: build a party, march armies (which costs time, food, and money), take towns from hundreds of rulers, and keep what you take alive.
- Take a city, fail to feed it, and the council votes you out.
- A sick town with no cure delivered loses its whole population.
- Bandits rob a medicine caravan, a clinic runs dry, an outbreak spreads, workers die, farms go unharvested, food runs short, and unrest rises until the town turns on you.
No chain is scripted. Each one emerges from independent systems reading and writing shared state. See `CAUSE_EFFECT.md`.
## Read these in order
1. `README.md`: this file.
2. `CONSTITUTION.md`: non-negotiable build rules. Wins any conflict.
3. `DESIGN.md`: the game itself, from the player's point of view.
4. `FEATURES.md`: every Bannerlord feature mapped to a 1950s to 2000s equivalent, with status and scope tier.
5. `FACTIONS.md`: America split into six playable sides, with pros, cons, and starting state choice.
6. `ECONOMY.md`: money, gold, food, metal, income, upkeep, and trade.
7. `MARCH_AND_WAR.md`: marching (time and cost), supply, armies, sieges, war and peace, renown and influence.
8. `RULERS.md`: hundreds of rulers with traits, ambitions, relations, capture, and succession.
9. `CAUSE_EFFECT.md`: the web of systems, the heart of the game.
10. `SPEC.md`: architecture, data model, rendering, backend.
11. `ASSETS.md`: how free 3D models are sourced, licensed, and processed.
12. `PHASES.md`: build order with exit criteria.
13. `TASKS.md`: granular checklist matching the phases (frozen — `docs/MASTER_PLAN.md` is the live task plan).
14. `CHANGELOG.md`: logs everything built, decided, and unresolved.
Then, as needed:
15. `AI.md`: how non-player rulers, armies, parties, and battle units decide.
16. `CHARACTER.md`: the player character and how every character is built.
17. `COMBAT.md`: how the battle layer fights (depends on the era decision).
18. `ERA.md`: the 1950s to 2000s setting as a game system.
19. `VEHICLES_AND_FUEL.md`: vehicles and fuel as a fifth resource.
20. `QUESTS_AND_NOTABLES.md`: notables and quests generated from world state.
21. `INFRASTRUCTURE_AND_MEDIA.md`: power, water, roads, comms; news and public opinion.
22. `UI_UX.md`: screens, flows, and interface rules.
23. `ART_AND_AUDIO.md`: visual and audio direction.
24. `GLOSSARY.md`: shared vocabulary across all docs.
25. `RISKS.md`: known risks and how to handle them.
26. `TESTING_AND_BALANCE.md`: how the project proves it works and how balance is tuned.
27. `docs/MASTER_PLAN.md`: the live crew task plan (boss orders, tiers, task counts).
Agent and ops notes live in `agents/README.md`, `.agent-specs/`, `BUFFY.md`, and `FREEBUFF_API_GUIDE.md`.
## Tech stack (locked, see CONSTITUTION.md)
- Rendering: Babylon.js
- Backend: Go
- Database: none — world saves live in the player's browser (IndexedDB); Postgres was dropped 2026-10-02
- Deployment: built locally, deployed via Cloudflare — Pages (client), one Worker (single domain), Containers (Go sim), Durable Objects (persistence)
- 3D assets: free models from Sketchfab, CGTrader, and Free3D, tracked per ASSETS.md
- World data: real geography and population data, never hand-typed
## Current status (as of 2026-10-02)
Design docs rewritten; real code now exists and is under active development:
- **World data** (`services/world-data`, `data/cities`): real geography and city data pipelines.
- **Simulation** (`services/simulation`, Go): headless battle simulation (morale, rout) with a balance config and tests.
- **Campaign client** (`clients/campaign`, Babylon.js + TypeScript): 3D campaign map, settings and achievements panels, gamepad and touch input, minimap, weather and time-of-day rendering — test suite in the hundreds.
- **Assets** (`tools/`, `assets/`): fetch and process pipeline, processed 3D models, composed music and SFX, per-asset license tracking.
- **Edge** (`workers/router`): Cloudflare worker deployed.
Open items and the full build log: `CHANGELOG.md`. Build order and exit criteria: `PHASES.md`.
