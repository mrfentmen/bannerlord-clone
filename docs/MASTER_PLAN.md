# MASTER PLAN — Bannerlord Clone: full modern-day Bannerlord experience

**Status: live.** This is the crew's working task plan. TASKS.md is stale and stays frozen; this file is the authority.
Last assembled: 2026-10-01. Task counts: Pax 43, Rowan 154, Hana 139, milo 160 (496 total). Rowan's lane restored 2026-10-01 (boss order) — crew is 4 again.

## Locked decisions (boss orders)

- **Hosting: Cloudflare, everything on it.** No VPS, no rented virtual computer. Pages serves the client; the Go sim runs in Cloudflare Containers; world persistence via Durable Objects; one Worker routes a single domain (page + `/api/*` + WebSocket). Postgres is dropped — the sim never contained any database code; the 'Go + Postgres' architecture lived only in design docs.
- **One page, one domain.** No subdomains, no sub-pages. The player loads one URL and never leaves it. Client HTTP provider defaults to same-origin `/api`.
- **Saves are local.** World saves live in the player's browser (IndexedDB): slots, autosave, export/import. Zero server-side world storage — no Cloudflare storage bill. Revisited only if multiplayer ever happens.
- **Push directly to main — automatically allowed, no merge needed.** Pax, Hana, and milo (and their agents) are pre-authorized to push straight to `main`. No pull requests, no merge queue, no approval step, no waiting on anyone. 'You break it, you fix it.'
- **Geography: NYC, Los Angeles, Houston, Miami — in that order.** Ohio data is done; do not expand Ohio.
- **Terminology:** faction, neighborhood, turf, boss, president/VP (town stays). Follow Bannerlord mechanics closely; verify claims before calling them accurate.
- **Assets:** gritty, never cute/kid-friendly. Every asset license verified (CC0 preferred). Kenney carryover is UNDECIDED — quarantined as pending-boss-decision, not assumed allowed.
- **All usage goes to this game.** No side quests until the boss lifts it.

## Tiers (what each one means)

- **Tier 0 — Foundation repair.** Sim stability, determinism proof, green test suites. Mostly done 2026-10-01 (12/12 seeds pass; cause-log panic fixed).
- **Tier 1 — The game exists.** API server + client wired to the real sim + local save/load. Until this lands: a map viewer and a headless sim, not a game.
- **Tier 2 — The Bannerlord loop.** Real-time battles, formation orders, sieges you can fight, encounters, march/trade against the live sim. The heart of Bannerlord.
- **Tier 3 — The living world.** NPCs with ambitions, diplomacy, kingdoms, quests from world conditions, character progression, party depth.
- **Tier 4 — Polish & pipelines.** Time/weather/day-night, settlement visuals, audio integration, pipeline hardening, runbooks, perf budgets.

## Critical path (the 5 tasks everything else depends on)

1. Same-seed-twice determinism proven on the Go sim (Pax).
2. Go HTTP+WebSocket API server implementing the 8 contracted routes (Pax) — `/v1/snapshot`, `/v1/trade`, `/v1/recruit`, `/v1/notables/talk`, `/v1/town/construct`, `/v1/march/plan`, `/v1/march/commit`, `/v1/why` — plus `/v1/battle/*` (milo).
3. Client HTTP provider on same-origin `/api` + IndexedDB save/load round-trip (Rowan).
4. Travel-graph connectivity in the 4 priority metros (Hana) — movement needs a real graph.
5. Battle session model + auto-resolve with campaign write-back (milo) — the campaign needs battle resolution while the real-time engine is built.

## Lane map

- **Pax** — Go API server, determinism harness, local-persistence design, repo/QA/infra, docs. Verifies everyone's claims against git.
- **Rowan (del)** — campaign client/gameplay: `clients/campaign` (TS + Babylon.js). Restored 2026-10-01 (boss order).
- **Hana (mute)** — world data + pipelines: `services/world-data`, asset/audio/radio pipelines.
- **milo** — battle simulation (Go) + dialogue/voice/battle audio.

Rules: extend what exists, don't rebuild it. Every task has an acceptance criterion. A task is done when its criterion is verified, not when code is written.

---

## PAX — Sim Server, Determinism, Local Persistence, Repo/QA/Infra (43 tasks)

## Tier 0 — Foundation repair (done / verify)
- Verify 12/12 seeds complete with the cause-log fix on a rebuilt binary (exit 0, no "panic" in logs). DONE 2026-10-01.
- Run same-seed-twice determinism check: identical canonical output bytes for two runs of the same seed (fail = investigate RNG discipline per system).
- Run the 12-seed sweep as a CI job so no future commit can re-break long runs silently.
- Fix the one failing client test (fixture coreLoop unpaid-wages/recruitment) so the suite is 337/337.
- Resolve the `daysPerRealSecond` fixture-marker scanner failure so `npm run build` passes, not just raw Vite.

## Tier 1 — The game exists
- Design the Go HTTP+WebSocket API server: routes, request/response shapes, error envelope (match the client's existing provider contract: /v1/snapshot, /v1/trade, /v1/recruit, /v1/notables/talk, /v1/town/construct, /v1/march/plan, /v1/march/commit, /v1/why).
- Implement `GET /v1/snapshot`: full world state for a campaign (settlements, parties, player, date).
- Implement `POST /v1/trade`: buy/sell with real price math from the sim's market system.
- Implement `POST /v1/recruit`: troop hiring with wage/upkeep consequences.
- Implement `GET /v1/notables/talk`: notable dialogue state.
- Implement `POST /v1/town/construct`: start/advance the 10 building projects.
- Implement `POST /v1/march/plan` + `/v1/march/commit`: path + supply cost preview, then commit.
- Implement `GET /v1/why`: cause-log query backing the Why panel (entity+field -> causal chain).
- Implement tick control endpoints: pause/resume/set-speed (backs the client's time-scale API contract).
- WebSocket channel: push tick updates, event notifications, battle invitations to the client.
- Single-campaign runner: one sim instance per campaign, in-memory + periodic snapshot.
- Dockerfile for the sim server (Cloudflare Containers target).
- Cloudflare Worker front-door routing: `/api/*` + WebSocket upgrades -> Container, everything else -> Pages (one domain, no subdomains).
- Deploy the container + routing to a staging URL; verify end-to-end: page loads, snapshot arrives, trade executes against the real sim.
- Local persistence design (boss decision 2026-10-01: saves live in the BROWSER, not on Cloudflare — zero server storage cost): IndexedDB schema doc (world snapshot, player state, settings, save metadata).
- Client save slots: 3 slots + autosave slot in IndexedDB.
- Autosave every N ticks + on page hide/close.
- Load flow: slot select -> hydrate -> resume ticking; corrupt-save recovery with backup slot.
- Export/import save as file (lets players back up / move machines without any server).
- Versioned save schema + migration functions (old save loads into new build).
- Determinism harness: script that runs seed X twice and diffs canonical snapshots (byte-identical required).
- RNG audit: every system draws from the seeded stream; no math/rand, no map-iteration-order dependence, no time.Now in sim code (add a linter/vet check).
- Fix map-iteration nondeterminism wherever the audit finds it.

## Tier 2 — The Bannerlord loop
- Battle session lifecycle in the server: create battle from encounter -> stream state -> apply orders -> resolve -> write back casualties/XP/loot/prisoners/wounded to campaign.
- Encounter endpoint: when two hostile parties meet, freeze campaign parties and offer battle/auto-resolve/retreat.
- Siege assault endpoint: breach state -> assault battle -> settlement ownership change + garrison assignment.
- Post-battle write-back verification: troop counts, XP, loot, prisoner lists match between battle result and campaign state.
- Load testing: 20-50 parties + 10-20 settlements ticking, measure tick time, set the perf budget.

## Tier 3 — The living world
- NPC/ruler event feed endpoint (defections, marriages, deaths) for the client's event log.
- Diplomacy endpoints: declare war, sue for peace, tribute, alliance, vassalage (state machine in sim, surfaced to client).
- Quest generation endpoint: world-condition -> quest objects with objectives/rewards/expiry.
- Character progression endpoints: XP awards, skill checks, perk unlocks.

## Tier 4 — Polish / repo / QA
- TASKS.md reconciliation: mark what's actually done, delete stale checkboxes, link to MASTER_PLAN.md as the live plan.
- CHANGELOG discipline: every push gets a dated row; no "completed" without a verification note.
- Nightly multi-seed soak: 12 seeds x 5 years, alert on panic or tick-time regression.
- Client+sim contract tests: shared JSON fixtures asserting both sides agree on shapes.
- Docs: update CONSTITUTION.md/SPEC.md hosting section — Cloudflare Containers + Durable Objects, Postgres dropped (no code ever used it), local saves.
- Deploy checklist: build client -> deploy Pages -> deploy container -> smoke test (create character, recruit, trade, march, save, reload).


## Critical path
The 5 tasks everything else depends on: (1) same-seed-twice determinism proven, (2) HTTP API server implementing the 8 contracted routes, (3) WebSocket tick stream, (4) Worker routing on one domain, (5) IndexedDB save/load round-trip. Until those five land, no other lane's work can integrate.

## ROWAN (del) — Campaign Client (154 tasks)

Lane owner: Rowan (del). Client: `clients/campaign` (TypeScript + Babylon.js + Vite + vitest).

Standing constraints:
- One page, one domain, no subdomains. HTTP provider defaults to same-origin `/api`.
- Saves are LOCAL: IndexedDB in the browser. No world-state storage on any server (cost).
- Cloudflare Pages hosting. Production build must contain zero fixture markers
  (`daysPerRealSecond` scanner must pass on `npm run build`).
- Already exists — EXTEND, do not rebuild: CharacterMaker, side-select StartScreen,
  CampaignScene 3D map renderer, TownPanel (taxes + 10 building projects),
  MarchPlanner, PartyPanel, MarketPanel, RulerPanel, WhyPanel, HttpSimulationProvider.

## Tier 1 — "The game exists" (provider swap, connection, local saves)

### 1A. HTTP provider hardening — per endpoint
1. Harden `GET /v1/snapshot` decoding with schema validation (malformed payload throws `SimulationUnavailableError` naming the bad field, never a raw TypeError).
2. Add snapshot schema-version check against the client-supported range (version mismatch shows a "world too new/old" message instead of a corrupt UI).
3. Validate `POST /v1/trade` request/response shapes in provider tests (round-trip against a fixture-shaped payload passes).
4. Validate `POST /v1/recruit` request/response shapes in provider tests (round-trip passes).
5. Validate `POST /v1/notables/talk` response including the dialogue-lines array (empty lines array renders fallback text, never a blank dialog).
6. Validate `POST /v1/notables/relation` response and apply the relation delta to UI state (notable row updates without a full snapshot refetch).
7. Make `setTimeScale` await server acceptance and surface rejection (rejected speed change shows a toast and the clock does not desync from the sim).
8. Validate `POST /v1/skip-to-arrival` returns a numeric `daysAdvanced` (non-numeric value throws a decode error).
9. Validate `POST /v1/troops/battle-xp` returns a per-troop awards array (awards list renders on the battle result screen).
10. Validate `POST /v1/troops/upgrade` response carries the new tier ids (party panel refreshes to the new tiers without reload).
11. Validate `POST /v1/town/tax` handles 409 conflict responses (a ruler-changed-taxes conflict shows "taxes were changed by the ruler" instead of a generic error).
12. Validate `POST /v1/state/tax` response (state tax panel reflects the authoritative rate after the call).
13. Validate `POST /v1/town/construct` response includes the completion tick (project card shows the correct days-remaining countdown).
14. Validate `POST /v1/march/plan` returns a path polyline, ETA, and supply cost (planner draws the route on the campaign map).
15. Make `commitMarch` await acceptance and return the march id (an unaccepted march leaves the party in place with an error toast).
16. Validate `GET /v1/why` truncates chains deeper than 50 edges (truncated chain shows an "older history dropped" note).
17. Add an 8-second per-endpoint timeout with abort (a hung server shows the retry UI, never an infinite spinner).

### 1B. Connection state and retry UI
18. Build a connection-status pill in the HUD showing live / degraded / offline (pill changes within 1s of a socket event).
19. Implement exponential-backoff reconnect for the tick WebSocket (retries at 1s/2s/4s… capped at 30s, attempt count visible).
20. Show an offline banner that blocks writes but allows reads (trade/recruit buttons disable with a tooltip while offline).
21. Add a tick-staleness indicator when no tick arrives for >10s (HUD clock shows a "stale" badge).
22. Queue player actions attempted while offline and replay them on reconnect (a queued march commits on reconnect; queue capped at 20).
23. Add a "retry now" button on every provider error toast (clicking retries the failed call exactly once).

### 1C. Provider config and fixture hygiene
24. Read `VITE_SIMULATION_HTTP_URL` at startup and validate the URL shape (invalid URL falls back to same-origin `/api` with a console warning).
25. Default the HTTP provider to the same-origin `/api` path in production builds (the production bundle contains no `127.0.0.1` references).
26. Gate the fixture provider behind an explicit dev-only flag (constructing it in a production build throws at startup).
27. Remove the `daysPerRealSecond` fixture marker from the production bundle (`npm run build` passes the fixture-marker scanner).

### 1D. Local save/load (IndexedDB — no server storage)
28. Design the IndexedDB schema: stores for snapshots, slot meta, settings, and a version key (schema documented in `docs/_draft/idb-schema.md`).
29. Implement a promise-based idb wrapper with versioned migrations (a v1→v2 migration test runs without data loss).
30. Implement save-slot CRUD: 5 named slots plus quicksave (attempting a 6th save shows an overwrite prompt, never silent loss).
31. Serialize the provider snapshot plus player character plus UI prefs into one save payload (payload round-trips byte-identical through JSON).
32. Implement autosave every 5 in-game days to a dedicated autoslot (autosave fires within 1 tick of the 5-day boundary).
33. Implement autosave on `visibilitychange` / page hide (closing the tab mid-session preserves state up to the last tick).
34. Build the load screen listing slots with timestamp, in-game date, and party size (every slot shows all three fields).
35. Implement crash recovery: on boot detect a dirty-shutdown flag and offer "recover autosave" (recovered state matches the last autosave tick).
36. Implement save export to a JSON file download (the exported file re-imports to an identical state).
37. Implement save import from a JSON file with schema validation (a corrupt file shows an error and never half-loads).
38. Add a payload checksum and refuse to load on mismatch (a tampered file shows "save corrupted").
39. Hydrate the scene from the snapshot on load: settlements, parties, player party position (the loaded map matches the saved tick within visual tolerance).
40. Hydrate all open panels from the snapshot on load (town panel shows saved taxes/projects, party panel shows the saved roster).
41. Add a "New Campaign" flow that clears slots selectively (new campaign asks which slot to overwrite, never wipes all slots silently).
42. Cap total IndexedDB usage and show a storage meter in settings (quota errors show "storage full — export a save" guidance).
43. Write save/load unit tests with fake-indexeddb (all CRUD paths covered; 90%+ branch coverage on the idb module).

---
## Tier 2 — "The Bannerlord loop" (battles, encounters, marches)

## Tier 2 — "The Bannerlord loop" (battles, encounters, marches)

### 2A. Battle scene
44. Build `BattleScene.ts` as a scaffold separate from `CampaignScene` (the battle scene mounts and unmounts without leaking campaign scene resources).
45. Extract the terrain heightmap patch around the battle coordinates from campaign terrain data (the extracted patch matches campaign heights within 0.5m).
46. Generate the battle ground mesh from the heightmap patch with tactical coloring (hills, forest, and water tinted distinctly).
47. Place scatter — trees, rocks, buildings — from a biome template by terrain type (each battle spawns 50–200 scatter objects from the template).
48. Define attacker/defender deployment zones from the encounter context (zones render as colored overlays during deployment).
49. Spawn both armies as instanced meshes from roster data (1,000 units spawn in under 2s on desktop).
50. Add a battle boundary ring with an out-of-bounds warning (crossing the boundary starts a 5s return countdown).
51. Drive battle lighting from the campaign time-of-day (a battle at night renders night lighting).

### 2B. Player combat (third-person)
52. Implement a third-person follow camera with collision (the camera never clips through terrain or buildings).
53. Implement the character controller: WASD move, sprint, crouch (sprint drains the stamina bar; crouch halves move speed).
54. Implement a melee swing with 3 attack directions (each swing plays a distinct animation plus a whoosh SFX hook).
55. Implement block/parry with a timing window (a perfect block within 150ms negates damage and shows spark VFX).
56. Implement hit detection via weapon-arc raycast against enemy capsules (hits register only inside the arc and range; verified in the test scene).
57. Implement hit feedback: flash, knockback, damage numbers (every landed hit shows all three within 100ms).
58. Implement player health and injury states including knockdown (knockdown plays a fall animation with 2s of control loss).
59. Implement weapon switching between melee and ranged slots (the switch completes in under 0.5s with an animation).
60. Implement player death: fall animation plus death cam (death shows a "You fell" overlay with a retreat option).

### 2C. Formation order UI
61. Build the order palette UI — hold / advance / charge / fall back — with hotkeys 1–4 (each hotkey issues its order in under 200ms).
62. Add a face-direction order with a drag-to-aim arrow (the arrow renders on the terrain; the order commits on release).
63. Add a change-formation control: line / column / wedge / circle (visible units reposition within 3s of the change).
64. Add a spacing control: tight / loose (the spacing change is visible in the gaps between units).
65. Add a fire-at-will toggle for ranged troops (the toggle state persists for the whole battle).
66. Add a retreat order with a confirmation dialog (retreat ends the battle as a defeat; the dialog asks "are you sure").
67. Dispatch orders to the sim with optimistic UI (the order shows instantly and rolls back if the server rejects it).
68. Show per-formation status chips: current order, morale, strength (chips update on every tick).

### 2D. Battle HUD
69. Build the top bar: ally/enemy counts, morale bars, battle timer (all values tick from sim data).
70. Build the kill feed showing the last 5 kills with unit names (entries fade after 6s).
71. Build the unit-cards row for the player's formations with click-to-select (clicking a card selects that formation).
72. Add a battle minimap with unit dots (the minimap refreshes every 500ms).

### 2E. Battle result and write-back
73. Build the victory/defeat screen with kills, losses, and duration (every number comes from the sim result payload).
74. Render the casualty list per troop tier (each tier shows killed and wounded counts).
75. Render XP awards per surviving troop (XP numbers match the `awardBattleXp` response).
76. Render the loot panel: captured weapons, gold, prisoners (a loot-claim button calls the provider).
77. Wire "Return to campaign" to write the battle result back via the provider (the campaign map reflects the new party strength after returning).

### 2F. Siege assault UI
78. Build the siege staging UI: attacker camp, equipment built, wall/breach state (breach % comes from the sim).
79. Show bombardment progress with an ETA to breach (the bar advances on sim ticks).
80. Add an "Order assault" button enabled only past the breach threshold (the button stays disabled with a reason tooltip otherwise).
81. Render the assault as a battle scene with a wall gap in the terrain (the gap position matches the breach location).

### 2G. Encounters (party meets party)
82. Detect party proximity on the campaign map and trigger the encounter modal (the modal appears within 1 tick of contact).
83. Build the encounter dialog showing both parties and a relative-strength bar (strength numbers come from the sim).
84. Implement the Talk option routing into the dialogue UI (talk opens a notable-style dialog with the enemy boss).
85. Implement the Trade option opening the market panel in encounter context (the trade completes without a battle).
86. Implement the Attack option transitioning to the battle scene (the battle starts with the correct rosters).
87. Implement the Flee option as a speed check against the enemy with success/fail messaging (a failed flee forces the battle).
88. Implement the Bribe option with a gold-offer slider and sim accept/refuse (the bribe result shows before dismissal).

### 2H. March planner wired to the real sim
89. Wire the MarchPlanner plan display to the `POST /v1/march/plan` response (the route polyline draws on the campaign map).
90. Show the plan breakdown: distance, days, food/wage cost, danger (all four visible before commit).
91. Wire the commit button to `POST /v1/march/commit` with the plan id (commit returns a march id and closes the planner).
92. Render active march progress on the map with an ETA countdown (the marker advances along the route per tick).
93. Handle march-interruption events from ticks — ambush or blocked (an interruption shows an alert plus a new encounter option).
94. Add march cancel with a partial-refund display (cancel shows the refunded supplies).

---
## Tier 3 — "The living world" (characters, parties, diplomacy, quests)

## Tier 3 — "The living world" (characters, parties, diplomacy, quests)

### 3A. Character sheet (extends CharacterMaker output)
95. Persist the CharacterMaker output as a long-lived character record (the record survives save/load round-trips).
96. Build the character sheet panel showing the 6 attributes with values (each attribute shows a modifier tooltip).
97. Build the 18-skill list with XP bars and levels (level-ups animate and offer perk choices).
98. Implement perk selection UI on skill level-up (the chosen perk persists into saves).
99. Show the traits list with effect descriptions (each trait lists its positive and negative effects).
100. Show a renown / influence / relations summary (all numbers match the sim snapshot).

### 3B. Party management (extends PartyPanel)
101. Render the troop roster grouped by tier with counts (counts match the sim).
102. Add upgrade buttons per upgradeable stack calling `/v1/troops/upgrade` (the panel reflects the new tier immediately).
103. Show the daily wage bill with a 30-day treasury projection (the projection covers exactly 30 days).
104. Show morale with a cause tooltip via `/v1/why` (the tooltip lists the top 3 morale causes).
105. Show food stocks with a days-remaining estimate (the estimate turns red under 3 days).
106. List wounded separately with recovery ETAs (wounded troops return to the roster automatically on their recovery tick).
107. List prisoners with recruit / release / ransom actions (recruiting converts a prisoner to a tier-1 troop via the sim).
108. Show party speed with its contributing factors (overweight or slow units are highlighted).
109. Add a party inventory section: medicine, ammo, trade goods (quantities match the sim).

### 3C. Inventory and equipment UI
110. Build the inventory grid UI with item cards (each card shows icon, name, tier, and condition).
111. Implement equipment slots — weapon 1/2, armor, clothing, mount (equipping updates character stats).
112. Implement click-to-equip (the equipped item leaves the inventory and stats update in the same frame).
113. Show an item-stats tooltip on hover (damage, armor, and weight are shown).
114. Add the loot-to-inventory flow from the battle result screen (claimed loot appears in the inventory).

### 3D. NPC / clan / kingdom screens (extends RulerPanel)
115. Build the NPC profile view: age, family, home, faction, traits, relations (every field comes from the sim).
116. Build the clan tree view with members and holdings (the tree renders up to 3 generations).
117. Build the kingdom overview: fiefs, clans, policies, strength (each section links to its detail view).
118. Show the ruler AI's current goal — expanding, defending, etc. — from the sim (the goal updates on ticks).
119. Add "track NPC" pinning to watch movements on the map (a pinned NPC's marker follows them on the campaign map).

### 3E. Diplomacy UI
120. Build the diplomacy screen listing factions with relation bars (bars match sim relations).
121. Implement the declare-war flow with confirmation and a consequences preview (the preview lists affected trade and treaties).
122. Implement propose-peace with a tribute slider (the sim accepts or rejects with a stated reason).
123. Implement the alliance-proposal UI (an alliance lists its shared-war benefits).
124. Implement the defection flow: leave a kingdom, join another (defection updates every relation bar).
125. Show active treaties and truces with expiry (an expired truce shows an "at war risk" warning).

### 3F. Quest log and markers
126. Build the quest log panel with active / completed / failed tabs (the tabs filter correctly).
127. Render quest objectives with progress counters driven by world conditions (counters update on ticks).
128. Place quest markers on the campaign map for objective locations (markers clear on completion).
129. Show the quest rewards preview — gold, XP, relation — before acceptance.
130. Show quest failure and expiry warnings (a 24h warning badge appears on expiring quests).

### 3G. Dialogue and persuasion UI
131. Build the dialogue UI with speaker portraits and branching options (options render from the sim's dialogue graph).
132. Implement the persuasion minigame UI: argument points and a progress bar (success/fail comes from the sim roll).
133. Show the relation change after a dialogue (the delta animates inside the dialog).
134. Add a barter sub-screen inside dialogues for notable deals (barters complete via the provider).

---

## Tier 4 — "Polish" (time, atmosphere, settlements, audio, performance)

## Tier 4 — "Polish" (time, atmosphere, settlements, audio, performance)

### 4A. Time controls
135. Build time controls — pause, 1x, 4x, 16x — wired to `setTimeScale` (a speed change is acknowledged by the sim within 2 ticks).
136. Show the calendar date in the HUD advancing with ticks (the date matches the sim tick).
137. Add a spacebar pause shortcut (space toggles pause without opening any panel).

### 4B. Day/night cycle and weather
138. Implement the day/night cycle driving the scene sun position and color (a full cycle matches one in-game 24h).
139. Add night lighting: settlement lights and party torch glow (lights are visible beyond 200m).
140. Implement weather states from the sim — clear, rain, snow, fog (the scene's fog/particles change within 5s of the state change).
141. Add weather effects on the visibility-range indicator (fog halves the displayed spotting range).

### 4C. Settlement 3D upgrades
142. Upgrade settlement clusters with walls when the town completes the City Walls project (walls appear after construction completes).
143. Add district coloring by prosperity level (the color scale is documented in ART_DIRECTION.md).
144. Add garrison banners in controlling-faction colors (banners swap on ownership change).

### 4D. Town menu screens
145. Build the tavern screen: recruit, rumors, games (each action calls its provider endpoint).
146. Build the arena screen: practice-fight entry and tournament list (entry transitions into the battle scene).
147. Extend the MarketPanel with trade-rumor hints from the sim (rumors show profitable routes).

### 4E. Audio hooks
148. Add SFX hook points: UI clicks, hits, construction-complete (each hook is documented with its event name).
149. Integrate the radio/SFX pipeline outputs from `public/audio` (radio plays on tavern and town screens).
150. Add the battle-ambience hook (crowd noise scales with the live unit count).

### 4F. Performance budgets and mobile
151. Set performance budgets: 60fps campaign map, 30fps for a 1k-unit battle on desktop (budgets are enforced by a CI perf test).
152. Add a quality scaler that auto-drops LOD and shadows under 30fps (the scaler engages within 3s of a sustained drop).
153. Make the HUD and panels responsive down to 390px width (no horizontal scrolling on an iPhone SE viewport).
154. Add touch controls for map pan/zoom and the battle camera (pinch-zoom and two-finger pan work in mobile Safari).

---

## Critical path

The 5 tasks everything else in this lane depends on:
1. Same-origin `/api` provider default (no subdomains, no CORS).
2. Snapshot decode hardening — the client must parse the real sim snapshot without crashing.
3. IndexedDB wrapper with schema migrations (saves are local-only).
4. Scene/panel hydration on load — map, panels, and HUD rebuild from a save.
5. March commit write-back loop — orders sent to the sim come back visible in the world.


## HANA (mute) — World Data, Pipelines, Assets (139 tasks)

## Tier 1 — The game exists (travel graph, sim-feed, reproducibility)

### 1A. Travel graph — make roads actually connect settlements

1. Measure per-metro road-snap rates for NYC, LA, Houston, Miami with the current 20 km rule
   (report: % of primary-road lines snapping at both ends, one end, neither, per metro).
2. Retune the snap radius per road class instead of one global 20 km
   (config table: primary/secondary/local/rail radii, each justified in a comment).
3. Build the settlement connector graph by intersecting road centerlines with Census place-boundary
   polygons, not just centroid distance (connector edges recorded with method=intersection).
4. Deduplicate divided highways / dual carriageways so one physical road is one graph edge
   (spot-check 20 known divided highways: exactly 1 edge each).
5. Preserve route continuity across bridges and tunnels over water
   (all NYC borough crossings present as edges; no dangling ends at shorelines).
6. Tag rail lines as rail-logistics edges, non-traversable by foot parties
   (travel graph carries `traversable_by: [foot, rail]` per edge).
7. Extend the phantom-rail fix to a full rail audit across the 4 metros
   (zero rail lines snapped to settlements >5 km from the real rail corridor).
8. Resolve remaining `-nm-` consolidated governments in the 4 metros the way `028b4b9` did for Ohio
   (no settlement named `*-nm-*` in metro exports).
9. Export the travel graph as nodes + weighted edges, not just geometry
   (`dist/travel-graph.json`: nodes=settlements, edges carry length_km, road_class, terrain, minutes).
10. Add travel edges to the client wire `network.json` v2 alongside geometry
    (client can pathfind without parsing 137k raw segments).
11. Smoke-test A* pathfinding on the travel graph between 100 random settlement pairs per metro
    (100% connected within each metro's largest component; failures listed, not hidden).
12. Publish a connectivity report: largest connected component % per metro + full disconnected list
    (`docs/TRAVEL_GRAPH.md` regenerated per run).
13. Fix or explicitly flag every disconnected settlement: add connector stub or mark `no_road`
    (no settlement silently unreachable; `no_road` ones are islands with ferry/port note).
14. Define travel-time weights as minutes = f(length_km, road_class, terrain) in a config table
    (table in `config/world_data.toml` with a comment citing the source for each speed).
15. Add ferry/water edges between coastal settlements with no road connection
    (Miami barrier islands and NYC water crossings reachable; edges tagged `ferry`).
16. Add a route-quality regression test: golden set of 50 known-good settlement pairs
    (path length within ±5% of recorded baseline; test fails on regression).
17. Detect and tag chokepoints (bridges, fords, passes) on the travel graph
    (`chokepoint: true` on edges whose removal disconnects the component — needed by Tier 2 battles).
18. Export per-metro travel-graph slice files so the client loads only its region
    (`dist/wire/<metro>/travel.json`, byte-budgeted, see Tier 2).

### 1B. Contract A sim-feed — harden the world-data → sim pipe

19. Extend Contract A with route edges: the sim needs a travel graph, not just settlements
    (feed gains `routes.json`: from/to settlement index, length_km, terrain, road_class).
20. Validate every feed field against the Go `worldgen.Settlement` struct field-by-field in CI
    (type mismatches fail the build; add a struct-parity test in `tests/test_sim_feed.py`).
21. Pin the SideID mapping with a test that fails if Milo reorders `Sides()` in `worldgen.go`
    (golden mapping pacific_compact→1 … atlantic_corridor→6, cross-checked against the Go source).
22. Close the Terrain gap: derive Forest/Swamp from NLCD land-cover instead of logging it as a gap
    (no settlement carries `Terrain` unknown; method documented in `sim_feed.py` docstring).
23. Assert Farmland stays in [0.2, 5.0] with mean ≈ 1.0 across the feed
    (validation test; out-of-range values fail loudly, never clamp silently).
24. Add golden-port tests for IsPort proximity mapping
    (10 known port cities true, 10 known landlocked cities false).
25. Make the feed byte-stable: run the feed writer twice on identical inputs, diff the bytes
    (zero diff; deterministic key ordering, no timestamps in output).
26. Add a `contract_version` field to the feed + a `CONTRACT_A_CHANGELOG.md`
    (version bumped on any schema change; sim documents which version it reads).
27. Extend the feed to cover the NYC metro slice as the priority region
    (`dist/sim-feed/` contains nyc settlements + routes, not just the old V1 bbox).
28. Publish a feed validation report per run: row counts, null counts, min/max per field
    (`dist/sim-feed/REPORT.md`, committed with the feed).
29. Add X/Y projection golden tests for 5 known cities
    (league coordinates within 0.01 of hand-computed values).
30. Wire the sim-feed into the pipeline's `publish` stage so it regenerates every run
    (stale feed impossible: feed timestamp ≥ pipeline run timestamp).

### 1C. Reproducibility — same input must mean same output bytes

31. Pin every Python dependency with hashes in `pyproject.toml`
    (`pip install` from a lockfile reproduces the exact environment).
32. Record sha256 of every raw input file in the run record
    (`PIPELINE_RUN.md` gains an input-hash table).
33. Add a byte-identical re-run test: run the full pipeline twice, sha256 every `dist/` output
    (all hashes equal; test runs in CI on a small fixture region).
34. Sort all outputs by a stable key before writing (no dict-order or set-order leakage)
    (re-run diff is empty even across Python versions).
35. Seed every RNG explicitly per stage; record seeds in the run record
    (no `random`/`numpy` unseeded calls anywhere — grep-enforced).
36. Extend stage-cache invalidation: cache key = hash(inputs) + pipeline version + code hash
    (touching a transform invalidates exactly the stages downstream of it; build on `881d8b3`).
37. Document every cache-bypass flag in the runbook
    (`--no-cache`, `--invalidate <stage>` behavior described with examples).
38. Fail the run if any stage writes nondeterministic content (timestamps, PIDs, temp paths)
    (add a `dist/` scanner that greps outputs for ISO timestamps outside declared fields).
39. Version the pipeline (`1.0.0` → semver bumps) and stamp it on every output
    (outputs carry `pipeline_version`; mixed-version datasets are detectable).
40. Publish the run record automatically after every run; never hand-edit it
    (CI check: `PIPELINE_RUN.md` `Generated:` timestamp ≥ last pipeline code commit).

---

## Tier 2 — The Bannerlord loop (battle-map data, metro regions, wire versioning)

### 2A. Battle-map data — tactical terrain per biome

41. Define the battle-terrain data contract first: heightfield patch, biome tag, cover objects,
    spawn zones, water mask (`docs/BATTLE_TERRAIN.md`; client + sim lanes review before data flows).
42. Write the terrain-extraction transform: per-settlement battle patch from elevation tiles
    (2 km × 2 km patch at 10 m grid → 200×200 heightfield; byte budget enforced, see #56).
43. Build the biome classifier assigning each settlement exactly one of the 10 biomes from real data
    (city/urban, forest, plains, snow, river crossing, desert, hills, swamp, coastal, industrial;
    classifier inputs and thresholds documented, no hand labels).
44. City/urban template: building footprints as cover/obstacle objects from NYC building data
    (extend wave-2 Manhattan/Brooklyn footprints; each building carries height_m + footprint).
45. Forest template: tree density + canopy height from NLCD canopy data
    (cover objects generated per hectare, density recorded per patch).
46. Plains template: open-terrain parameters (cover density ≈ 0, line-of-sight max)
    (golden patch: Kansas settlement shows <5 cover objects/km²).
47. Snow template: northern-tier settlements get snow movement modifiers + visual flags
    (modifier table shared with sim lane; data only carries `snow_season_months`).
48. River-crossing template: detect settlements on major rivers, attach bridge/ford records
    (bridges from road/rail graph intersections with waterways; fords flagged where roads cross).
49. Desert template: southwestern settlements from NLCD shrubland/barren classes
    (cover = rocks/arroyos; water mask empty).
50. Hills template: slope-derived from elevation tiles (mean slope > threshold)
    (patch carries slope raster summary; high-slope cells marked slow).
51. Swamp template: wetlands from NLCD woody/herbaceous wetland classes
    (movement penalty zones + water mask in patch).
52. Coastal template: shoreline settlements get beach/water mask from place boundaries
    (water cells marked impassable; docks/piers as cover where ports exist).
53. Industrial template: factory/warehouse zones from land-use + employment data
    (large rectangular cover objects; smokestacks as landmarks).
54. Generate deployment/spawn-zone data per patch: attacker zone, defender zone, reinforcement edge
    (zones as polygons in patch-local coordinates; validated non-overlapping).
55. Build the cover-object catalog schema: walls, buildings, trees, rocks, vehicles with height_m
    (every cover object has a type, height, and footprint; client renders from this alone).
56. Enforce a per-patch byte budget and assert it in CI
    (e.g. ≤ 512 KB gzipped per patch; oversized patches fail the export).
57. Export battle patches in the client wire format (`dist/wire/battle/<settlement_id>.json`)
    (client loads exactly one patch per battle; no full-region download).
58. Add battle-patch golden tests: 10 settlements, one per biome, snapshot-tested
    (biome tag, patch dimensions, and cover counts match recorded values).

### 2B. Region pipeline — the 4 priority metros

59. Define the four metro bounding boxes in `config/world_data.toml`
    (NYC, Los Angeles, Houston, Miami; boxes cited to Census metro definitions).
60. NYC: extend wave 2 to all five boroughs — add Queens, Brooklyn, Staten Island settlements
    (settlement count per borough reported; zero missing incorporated places).
61. NYC: extend buildings/streets coverage to all five boroughs
    (building footprint count per borough in the manifest).
62. NYC: extend elevation tile list to full five-borough z12 coverage
    (tile list diffed against bbox; no gaps).
63. Los Angeles metro: settlements + road network + elevation tiles through the full pipeline
    (LA appears in `PIPELINE_RUN.md` stage outputs with row counts).
64. Houston metro: settlements + road network + elevation tiles through the full pipeline
    (same acceptance as LA).
65. Miami metro: settlements + road network + elevation tiles through the full pipeline
    (same acceptance as LA; coastal template coverage verified).
66. Per-metro wire deploy: versioned `dist/wire/<metro>/region.json|settlements.json|network.json|travel.json`
    (client loads one metro; old Ohio files untouched).
67. Build inter-metro corridor edges (interstate corridors linking the 4 metros at low detail)
    (corridor graph connects all 4 metros; used for long-range travel only).
68. Add metro spot-checks: 5 largest settlements per metro verified against Census figures
    (extend the existing 36-settlement spot-check with 20 metro rows).
69. Publish per-metro DATA_MANIFEST sections (datasets, gaps, row counts per metro)
    (manifest documents exactly what each metro contains and what it lacks).

### 2C. Wire format versioning

70. Add a `wire_version` field to region.json, settlements.json, network.json, travel.json, battle patches
    (every wire file self-identifies its version).
71. Write `docs/WIRE_FORMAT_CHANGELOG.md` recording every shape change with version + date
    (no shape change lands without a changelog entry).
72. Add a CI test validating wire files against `clients/campaign/src/world/types.ts` shapes
    (shape drift fails the build on the data side, not at runtime in the browser).
73. Document the wire deprecation policy: N and N-1 supported, older rejected with a clear error
    (client shows a version-mismatch message naming the expected version).
74. Namespace wire deploys by version (`public/world/v2/...`) so old clients never read new shapes
    (deploy script creates the versioned directory; latest pointer updated atomically).

---

## Tier 3 — The living world (notables, production, garrisons, territory)

### 3A. Notables and quest-giver placement data

75. Derive notable counts per settlement from population tiers (village/town/city bands)
    (counts table in config; every settlement gets ≥1 notable, cities get 20+).
76. Export notable *slots* per settlement: location type + count, not invented names
    (`notables.json` per metro: tavern keepers, merchants, artisans, elders — counts only).
77. Tag tavern/bar locations per settlement from business/POI data where available
    (tagged settlements listed; untagged ones get a default 1-tavern rule, documented).
78. Tag marketplace locations in towns and cities
    (every city has ≥1 market tag; tag source recorded).
79. Tag arena/fight-venue locations in major cities (population > 500k)
    (list of arena cities published; no invented venues).
80. Tag town-hall / civic-center locations for council/quest UI anchoring
    (every city tagged; towns fall back to notable-slot rule).

### 3B. Economic production data per settlement

81. Build per-settlement workshop profiles from County Business Patterns / industry employment data
    (each town+ settlement lists workshop types with employment bands, sourced).
82. Tag factory locations from industrial land-use + large-employer data
    (factories carry industry code + size band; no invented output numbers).
83. Extend the Farmland multiplier into per-good yields: grain, livestock, produce
    (yield indices from USDA county crop data mapped to settlements; documented method).
84. Map USGS MRDS mine/quarry features to nearest settlements as production sites
    (the 304,632 matched features become settlement-attached production; commodity groups kept).
85. Attach port trade capacity from Natural Earth port scale ranks
    (capacity bands 3–8 as published; no invented tonnage — the source has none).
86. Build resource-flow edges: which settlements supply which goods to which neighbors
    (flow graph derived from production + travel graph; feeds the sim's caravan logic).
87. Export production profiles in the sim-feed (`production.json`, Contract A extension)
    (sim reads real production instead of uniform defaults).

### 3C. Garrison and militia baselines

88. Compute baseline garrison size per settlement from population × faction policy factor
    (formula in config; every settlement gets a nonzero baseline).
89. Compute militia pools from adult-population estimates per settlement
    (pool = f(population, age structure); method documented, Census-sourced).
90. Tag police/military installations as garrison anchors from federal facility data where available
    (anchors listed per metro; settlements near anchors get garrison bonus, documented).
91. Export garrison/militia baselines in the sim-feed
    (sim spawns real baselines instead of constants).

### 3D. Clan and faction territory mapping

92. Assign every settlement to one of the 6 sides (already in section_key) and to a sub-faction territory
    (territory = contiguous settlement cluster; assignment rule documented, deterministic).
93. Generate territory polygons per sub-faction from member-settlement boundaries
    (polygons exported for the client map; overlaps resolved by rule, never by hand).
94. Flag border/contested settlements where territories meet
    (contested list published; these are the sim's natural flashpoints).
95. Designate one capital per faction by rule (largest settlement in territory)
    (capitals listed; rule rerunnable, not hand-picked).
96. Export the territory map for the client (`territories.json` per metro: polygons + colors + labels)
    (client renders faction control from this file alone).

---

## Tier 4 — Pipelines & assets (hardening, animation, SFX, radio, runbook)

### 4A. Asset pipeline hardening

97. Require a license record on every 12-field manifest entry: license + source URL + verification date
    (manifest-check fails on any asset missing any of the three).
98. Enforce the license allowlist (CC0, CC-BY, MIT) in `manifest-check.py`
    (non-allowlisted license fails the build with the asset id named).
99. Flag all Kenney-sourced assets as `license_status: pending-boss-decision`
    (Kenney assets quarantined from production builds until the boss confirms; never silently shipped).
100. Make `fetch-assets.py` reproducible: pin URLs + sha256 hashes, retry with backoff, offline cache
    (re-fetch produces byte-identical files; hashes recorded in the manifest).
101. Extend `build-inventory.py` to a full license-summary report
    (report shows counts per license + the pending-decision quarantine list).
102. Add a style lint to `process-assets.py`: flag assets tagged cartoon/cute/kid-friendly
    (gritty style gate: flagged assets need human review before manifest acceptance).
103. Extend scale/poly/texture budgets to vehicles and weapons (currently buildings-only per ASSETS.md s5)
    (budget table gains vehicle + weapon rows; violations exit 2 like the rest).
104. Extend the LOD pipeline (MID ~35% vertex-cluster + FAR billboard) to vehicles and weapons
    (every vehicle/weapon ships NEAR/MID/FAR; manifest-check verifies all three exist).
105. Add texture-budget enforcement for vehicle liveries and weapon skins
    (max texture px per asset class in the budget table).
106. Audit the current `clients/campaign/public/anims/` demos against the license gate
    (Soldier.glb + Xbot.glb are MIT via three.js examples — record that in the manifest explicitly).
107. Write the asset pipeline runbook (`tools/ASSET_RUNBOOK.md`)
    (prereqs → fetch → process → audit → manifest → deploy; anyone can run it).

### 4B. Animation pipeline

108. Extend `tools/anim/validate.py` to new character models beyond the demos
    (every shipped character GLB validates against `skeleton.json` or is rejected).
109. Extract combat clips from source GLBs: attack, block, hit-react, death, knockdown
    (clip catalog lists each with source asset + license).
110. Extend `procedural.py` with procedural run, crouch, and aim-pose fallbacks
    (same guarantee as walk/idle: perfect loops, zero licensing questions).
111. Bake every new clip to RGBA float16 bone textures and decode-verify each
    (extend the 4.88e-04 decode-error bar: no clip ships unverified).
112. Publish the animation clip manifest: name, duration, loop flag, bone count, license, source
    (`tools/anim/CLIPS.md`, regenerated by the pipeline).
113. Finish the Mixamo retarget: Soldier.glb retargeting was marked POSSIBLE — complete and verify it
    (retargeted clips pass validate.py against the shared 24-joint skeleton).
114. Add animation CI: extract → bake → decode-verify runs on every anim change
    (9/9 existing tests keep passing; new clips add tests).

### 4C. SFX pipeline

115. Extend `sfx.py` with melee impacts, shield blocks, and vehicle engine variants
    (new cues listed in the audio manifest with their synthesis parameters).
116. Add a crowd-battle ambience loop (distant fighting, scalable intensity)
    (seamless-loop verified like the existing 5 ambience beds).
117. Loudness-normalize all SFX to −16 LUFS
    (normalization report per file; no clip ships hotter than −14 LUFS).
118. Verify every loop is sample-seamless (extend the existing seamless checks to all new loops)
    (loop click test: cross-correlation at the splice point below threshold).
119. Update `audio-manifest.json` for every new cue and gate it in CI
    (manifest-check equivalent for audio: missing manifest entry fails the build).
120. Document the SFX synthesis recipes so any cue can be regenerated (`assets/audio/SFX_RECIPES.md`)
    (parameters, not just output files — reproducibility for audio too).

### 4D. Radio and music pipeline

121. Land the radio pipeline review: merge `worker/hana/radio@d4a11bc7` after license verification
    (all 11 mp3s confirmed original or licensed; findings recorded before merge).
122. Extend radio to full station packs: one station identity per faction (6 stations)
    (station = jingles + beds + news stingers; all synthesized, manifests updated).
123. Compose adaptive battle-intensity layers from the existing 21 stems
    (layers: calm → tense → combat; crossfade points documented for the client).
124. Add a defeat/victory stinger set per faction flavor
    (6 factions × 2 stingers, synthesized, in the manifest).
125. Verify no sampled third-party material in any music/radio output
    (provenance statement per track: synthesized-from-scratch, signed off in the manifest).
126. Publish the music/radio manifest with durations, loop points, and licenses
    (`assets/audio/MUSIC_MANIFEST.md`, regenerated by the pipeline).

### 4E. Cache invalidation and runbook

127. Extend stage-cache invalidation to the new stages (battle terrain, metro regions, territory)
    (every new stage declares its input hashes; stale cache impossible).
128. Make the cache key = hash(inputs) + pipeline version + code hash, documented in one place
    (single `cache_key()` function; no ad-hoc keys).
129. Add `pipeline.py --invalidate <stage>` and `--explain-cache` (why is this stage cached?)
    (both flags documented with examples in the runbook).
130. Write `services/world-data/PIPELINE_RUNBOOK.md`: anyone can re-run from scratch
    (prereqs, raw-data fetch, full run, verification, wire deploy — copy-paste commands).
131. Add a troubleshooting section: the top 10 failure modes with fixes
    (each entry: symptom → cause → exact command to recover).
132. Add a "new region" checklist: the exact steps to add a 5th metro later
    (config change → tile fetch → pipeline run → spot-check → wire deploy → manifest).
133. Record pipeline wall-clock and peak-memory budgets per stage; alert on 2× regression
    (budgets table in the runbook; CI warns when a stage doubles).
134. Publish run artifacts to a versioned `dist/` layout so old and new outputs coexist
    (`dist/v<ver>/...`; `latest` symlink updated only after verification passes).

---


## Critical path — the 5 tasks everything else depends on

1. **Travel-graph connectivity in the 4 metros (Tier 1A).** Without a connected, weighted,
   client-readable travel graph there is no party movement, no encounters, no battles to reach,
   and no caravan trade — every downstream system consumes this graph.
2. **Contract A sim-feed hardening + route extension (Tier 1B).** The sim reads the world through
   this feed; unvalidated or edge-less feed data means the sim runs on fiction, and every balance
   decision built on it is suspect.
3. **Byte-reproducibility of the pipeline (Tier 1C).** Wire deploys, sim feeds, and battle data are
   only trustworthy if identical inputs produce identical bytes — otherwise no diff, no review,
   no rollback is possible.
4. **Wire-format versioning (Tier 2C).** The client, the sim, and the pipeline all consume the same
   files; one unversioned shape change breaks all three silently. Version before volume.
5. **Per-asset license verification gating the build (Tier 4A).** One unlicensed or
   wrongly-licensed asset poisons the entire shipped game; the gate must exist before the asset
   count grows from dozens to hundreds, and the Kenney quarantine must be resolved by the boss first.

## MILO — Battle Simulation + Audio (160 tasks)

## Tier 1 — The game exists

### Battle session model + fixed-timestep tick
- Define the Battle aggregate struct with id, phase, tick, participants, rosters, terrain seed, and outcome (constructing one from two campaign parties works without a client).
- Implement battle phases: staging, deployment, fighting, rout, resolved, with legal transitions enforced (an illegal phase jump returns an error, never silently proceeds).
- Add a fixed-timestep battle clock at 20 ticks per second decoupled from wall time (1000 ticks produce identical state on any machine).
- Snapshot campaign parties into battle rosters at battle start, freezing troop counts, tiers, equipment, and commander identity (roster totals match the campaign parties exactly).
- Add the battle-size config knob with presets 50/150/400/1000 agents (changing the knob changes only agent count, never rules).
- Implement agent-count degradation: when rosters exceed the knob, merge lowest-tier troops into aggregate counters first (degraded battles still resolve with correct casualty math).
- Add deterministic battle RNG streams: one for combat rolls, one for morale, one for AI decisions (re-seeding one stream does not affect the others).
- Implement battle pause, single-step, and tick-skip controls for debugging (stepping one tick advances exactly one tick of simulation).
- Add battle invariants checked every tick: troop totals conserved, no negative ammo, no agent outside bounds (a violation fails the tick loudly).
- Write tick determinism tests: same seed plus same order script yields byte-identical battle state at tick 500 (test fails on any divergence).
- Add battle timeout rules: a battle with no casualties for N ticks auto-resolves as a draw (no battle can run forever).
- Implement surrender/rout thresholds per side computed from morale, casualties, and commander presence (a side at 0 morale routs within 3 ticks).
- Add battle event stream: every kill, wound, rout, order, and phase change is an event with tick and actor ids (replaying events reconstructs the battle).
- Write a battle smoke test that starts a 50v50, runs to resolution, and asserts an outcome plus non-zero casualties (runs in under 30 seconds).

### Battle API surface
- Implement POST /v1/battle/start accepting attacker party id, defender party id, and options, returning a battle id (starting with invalid party ids returns 400, never a battle).
- Implement GET /v1/battle/state returning phase, tick, both rosters with alive/wounded/routed counts, and recent events (two polls 1 tick apart show tick advancing).
- Implement POST /v1/battle/orders accepting formation orders with validation against the 14-order set (an unknown order name is rejected with a 400 and a list of valid orders).
- Implement WS /v1/battle/stream pushing tick snapshots and events at 10 Hz to subscribed clients (a client that subscribes mid-battle receives current state first, then deltas).
- Implement POST /v1/battle/resolve forcing immediate auto-resolve of a live battle (resolve on a finished battle returns the existing outcome, idempotent).
- Add battle session binding: each battle id is bound to the campaign session that started it (a battle id from another session is rejected).
- Add API versioning under /v1 with a /v1/version endpoint reporting sim build hash (client and server hashes are logged on every battle start).
- Write API contract tests covering start, state, orders, stream, and resolve against the real sim, not fixtures (all five pass in CI).

### Deterministic seed derivation + replay harness
- Derive battle seeds as HMAC(campaign seed, battle counter, attacker id, defender id) so no two battles share a seed (deriving 1000 seeds yields 1000 unique values).
- Record every player order with its tick into the battle replay log (replay log plus seed reproduces the battle exactly).
- Implement the replay CLI: simrun replay --battle <id> re-runs a recorded battle headlessly (replay output matches the original outcome and casualty counts).
- Add golden replay fixtures: three canonical battles checked into the repo, replayed in CI (any sim change that alters a golden outcome fails loudly for review).
- Implement order-script format for scripted test battles: a JSON list of tick-ordered commands (a scripted 10v10 runs identically on every machine).
- Add a determinism fuzz: run the same battle 20 times and assert identical final state (fuzz runs in CI nightly).
- Write docs for the replay format: field meanings, versioning policy, and how to hand-write a script (a new engineer can write a script from the doc alone).

### Auto-resolve from scratch
- Implement base strength calculation from troop count, tier, equipment quality, and commander skill (a 100-tier-3 force outscores a 100-tier-1 force by at least 2x).
- Add terrain modifiers to auto-resolve: attacker penalty uphill, defender bonus in forests and urban tiles, river-crossing penalty (same armies on attacker-favorable vs defender-favorable terrain differ by 15%+ win rate over 200 trials).
- Add tactics modifiers: flanking bonus when attacker outnumbers 2:1, ambush bonus for bandits at night, siege-engine bonus for the besieger (each modifier is a named, logged term, never a magic number).
- Implement tier-weighted casualties: higher-tier troops die less often per round, militia die most (casualty share by tier matches weights within 5% over 500 trials).
- Split casualties into killed vs wounded with per-tier wound rates and medicine-modified survival (wounded count is nonzero in most battles and feeds the campaign wounded pool).
- Implement XP awards per surviving participant scaled by battle size and enemy tier, with promotion rolls for troops at XP thresholds (a battle's XP ledger sums to the campaign's XP ledger exactly).
- Implement loot generation from defeated side: weapons, ammo, medicine, cash scaled by loser tier and battle size (loot manifests list item, quantity, and source troop tier).
- Implement prisoner capture: a fraction of routed survivors become prisoners of the winner (prisoner count never exceeds routed survivors).
- Add named-character risk: commanders, companions, and the player roll on a wound/capture/death table weighted by battle danger (a lost battle can wound the player; a won battle almost never kills a commander).
- Write auto-resolve results back to the campaign: party troop counts, wounded pools, prisoner lists, treasury, and XP deltas applied atomically (applying the same result twice is impossible; results carry the battle id).
- Emit cause-log rows for every campaign state change from a battle: casualties, loot, prisoners, XP, each citing the battle id (the Why panel can explain any post-battle change).
- Add auto-resolve vs real-time parity checks: 100 auto-resolved battles vs 100 real-time battles with the same seeds produce casualty distributions within 10% (parity test runs nightly, not per-commit).

## Tier 2 — The Bannerlord loop

### Soldier agents
- Define the soldier agent struct: position, heading, speed, health, morale, suppression, ammo, weapon, formation slot, state (every field has a documented unit and range).
- Implement agent morale as 0-100 with break thresholds modified by nearby commander, nearby routing allies, and casualties witnessed (an agent seeing 3 allies rout in 10 ticks loses at least 20 morale).
- Implement suppression: incoming near-misses raise suppression, which degrades accuracy and eventually pins the agent (a fully suppressed agent cannot advance).
- Implement per-agent ammo with magazine and reserve, reload times per weapon, and ammo sharing within a formation (an agent at 0 ammo and 0 reserve switches to melee).
- Implement agent perception: vision cone with range modified by weather, night, smoke, and target movement (a stationary target in smoke at 80m is invisible).
- Implement target selection: nearest visible threat weighted by threat level, with a reaction delay per tier (tier-1 reacts slower than tier-5, measurably).
- Implement agent pooling: agents are recycled from a pool sized by the battle knob, never allocated mid-tick (a 1000-agent battle performs zero tick-time allocations).
- Implement agent states: idle, moving, attacking, reloading, suppressed, routing, surrendered, down, dead (every transition is logged as a battle event).
- Add per-agent performance budget: full agent update under 2 microseconds at 1000 agents (benchmark fails the build if exceeded).
- Implement wounded agents: a downed agent can be stabilized by a medic-flagged ally within 60 ticks, else dies (stabilized agents enter the campaign wounded pool, not the dead list).

### Formation solver
- Define formation templates: line, column, wedge, square, skirmish, loose with slot offsets per template (instantiating a 40-agent line yields 40 unique slot positions).
- Implement the formation anchor: position plus facing that the commander or orders move (moving the anchor moves every slot's target).
- Implement slot assignment: agents fill slots by tier and role, shielded troops front, ranged rear (a mixed formation's front rank is always melee).
- Implement flow-field pathfinding on the battle grid: one field per formation goal, agents follow it with local avoidance (100 agents reach a move goal without deadlock in the solver test).
- Add slot re-convergence: after disruption, agents path back to slots instead of milling (a scattered formation reforms within 200 ticks of a Hold order).
- Implement formation cohesion score: fraction of agents within tolerance of their slots, exposed to AI and UI (cohesion below 0.5 blocks Volley Fire).
- Add battle terrain grid generation from the campaign map tile: elevation, forest, water, road, urban masks at 2m cells (generated terrain matches the campaign tile's dominant features).

### Formation orders (14 individual tasks)
- Implement Hold Position: formation stops, faces current heading, agents take cover if available (agents cease movement within 20 ticks).
- Implement Move: formation anchor paths to a map point, slots follow in template (arrival declared when 90% of agents are within tolerance).
- Implement Advance: formation moves toward the nearest enemy at combat pace, ranged agents fire on the move at reduced accuracy (advance speed is half of Move speed).
- Implement Charge: all agents sprint at the nearest enemy, morale shock on impact, formation cohesion ignored (a charging formation's cohesion drops below 0.3).
- Implement Follow: formation trails the player's position at 30m, matching pace (formation stays within 50m of the player while the player moves).
- Implement Fall Back: formation retreats from the nearest enemy toward its deployment zone, rear rank facing the enemy (no agent turns its back while enemies are within 20m).
- Implement Face Direction: formation rotates in place to a compass heading without moving the anchor (rotation completes within 60 ticks).
- Implement Change Formation: formation morphs to a new template, agents re-path to new slots (morph completes with zero agent-agent collisions causing damage).
- Implement Change Spacing: formation toggles tight/loose, adjusting slot offsets (loose spacing doubles slot distances and halves explosive casualties in the test).
- Implement Volley Fire: ranged agents fire synchronized volleys at a target point, gated on cohesion above 0.5 (a volley consumes one magazine round per agent).
- Implement Fire At Will: ranged agents engage targets of opportunity per perception rules until toggled off (toggling off stops all ranged fire within 10 ticks).
- Implement Take Cover: agents move to nearest cover within 40m and crouch, prioritizing ranged agents (cover reduces incoming hit chance by the cover value).
- Implement Flank: formation splits a detached group to path around the enemy's side, rejoining for a rear attack (flanking group arrives at the enemy rear quadrant).
- Implement Retreat: entire side disengages toward the map edge, routing agents are not rallied (a retreating side keeps at least 70% of its remaining agents alive to the edge).

### Melee model
- Implement melee reach, swing time, and recovery per weapon class: knife, baton, rifle-butt, blade, improvised (each class has distinct reach/time/damage in a data table).
- Implement directional blocking: blocking reduces frontal damage by the block value, drains stamina, and can break (a block held for 5 seconds breaks and staggers the blocker).
- Implement knockdown: heavy hits have a knockdown chance vs the target's stance and weight (a knocked-down agent is helpless for 40 ticks).
- Implement friendly fire for melee: wild swings can hit allies, reduced by tier discipline (tier-1 militia cause measurable friendly casualties in a dense melee).
- Implement morale shock on melee impact: the charged side takes an immediate morale hit scaled by charger momentum (a cavalry/vehicle charge breaks militia lines in the shock test).
- Implement weapon durability: melee weapons degrade per hit and can break, forcing fallback to sidearm or fists (a broken weapon is a battle event).

### Modern ranged ballistics
- Implement hitscan-with-travel projectiles: muzzle velocity, gravity drop, and penetration per ammo type (a rifle round at 200m drops a documented amount and penetrates car doors, not engine blocks).
- Implement spread: base spread per weapon plus modifiers for movement, suppression, stance, and shooter skill (a sprinting suppressed shooter cannot hit beyond 30m in the test).
- Implement recoil: per-shot kick with recovery time, full-auto climb (a 30-round mag dump walks fire upward off target without burst control).
- Implement cover system: low/high cover values from terrain and props, destructible cover with hit points (a wooden fence stops 3 rounds before failing).
- Implement suppression effects on accuracy: suppressed shooters lose accuracy and rate of fire (a pinned squad's effective DPS drops by at least 50%).
- Implement ammo types: ball, hollow-point, armor-piercing, less-lethal with distinct damage/penetration profiles (AP defeats light vehicle armor that ball cannot).
- Add ballistics animation/audio hooks: muzzle flash, tracer, impact effect, suppression crack, all emitted as battle events for the client (every shot emits exactly one event bundle).

### Vehicles as modern cavalry
- Define vehicle agents: pickup, SUV, armored van, bus with speed, armor, passenger capacity, and ram damage (each class has a data row; no hardcoded stats).
- Implement vehicle movement with turn radius and terrain penalties: roads fast, off-road slow, forest nearly impassable (a pickup crosses open ground 3x faster than infantry).
- Implement ramming: vehicles damage agents and light cover on contact, with damage to the vehicle scaled by target mass (ramming a barricade damages the pickup's front armor).
- Implement passengers: agents embark/disembark, fire personal weapons from open vehicles at reduced accuracy (a drive-by is possible and modeled).
- Implement vehicle morale shock: a vehicle charge against foot troops causes a morale check on impact (militia break; veterans hold).
- Implement vehicle damage states: intact, damaged, disabled, burning, destroyed, with crew bail-out on disabled+ (a burning vehicle explodes after 100 ticks, damaging nearby agents).

### Battle AI: unit, formation, commander
- Implement unit AI: the per-agent loop of perceive, select target, move/shoot/reload per orders and morale (an AI-only 50v50 completes without player orders).
- Implement formation AI: keeps slots, advances under Fire At Will, falls back when morale drops below the hold threshold (an AI formation never stands still while being shot to pieces).
- Implement commander AI: picks an overall plan from stances (aggressive, balanced, defensive) based on relative strength and terrain (an outnumbered commander picks defensive in the test).
- Implement flanking behavior: commander AI detaches a flanking group when it has a mobility advantage (flank occurs in at least 30% of AI-vs-AI battles with 2:1 odds).
- Implement focus fire: AI concentrates ranged fire on the most dangerous visible formation (focused target takes 2x the casualties of unfocused in the test).
- Implement routing behavior: broken agents flee toward their map edge, may surrender if surrounded (a surrounded routing agent surrenders instead of fighting to death).
- Implement surrender acceptance: a side can offer surrender; the AI accepts when its position is hopeless and rejects when it can still win (surrender terms feed the prisoner system).
- Add the AI difficulty knob: recruit, regular, veteran scaling reaction time, accuracy, morale, and tactics (veteran AI beats recruit AI 80%+ over 100 mirror battles).
- Implement AI order-issuing cadence: commander AI re-evaluates every 100 ticks, not every tick (AI overhead stays under 5% of tick time).

### Playable siege assaults
- Model the breach state from the campaign siege system: intact, breached, gate-destroyed, each mapping to an assault entry point (an assault cannot start on an intact wall without equipment).
- Implement ladders: placement against walls, climbable by one agent at a time, defenders can push ladders (a pushed ladder kills its climbers).
- Implement siege towers: slow approach, drop-bridge deployment, protected climbers (a tower delivers 10 agents onto the wall per 100 ticks).
- Implement rams: gate-targeted, crew-pushed, gate HP based on the campaign fortification level (ramming time scales with wall tier from the construction system).
- Implement street fighting: once inside, the battle switches to urban blocks with defender barricades and ambush points (defenders get cover bonuses in streets).
- Implement defender sallies: the garrison can sortie mid-siege as a field battle outside the gates (a successful sally destroys one random siege engine).
- Implement wall defenders: archers/riflemen on walls get range and cover bonuses, limited by wall capacity (overcrowding the wall reduces its bonus).
- Add siege-engine construction as a pre-battle choice spending campaign resources and days (engines built appear in the assault loadout).
- Emit siege-specific battle events: breach widened, ladder pushed, gate down, wall taken, street cleared (the client can render a siege progress bar from events alone).

### Result write-back
- Apply casualties to campaign parties: dead removed, wounded to the wounded pool with recovery timers (party totals after write-back equal before minus dead minus wounded).
- Apply XP and promotions to surviving troops, including companion XP (no XP is created or lost: battle ledger equals campaign delta).
- Transfer loot into the winner's party inventory and treasury (every loot item appears in exactly one inventory).
- Transfer prisoners to the winner's prisoner list with capture events (prisoner count matches the battle's captured total).
- Update named characters: wounds, capture, or death applied to the campaign character records (a dead commander is dead in the campaign the same tick).
- Update faction relations and war state from battle outcome: winner influence up, loser down, notable battles shift relation scores (a crushing defeat moves relations by the documented amount).
- Emit cause-log rows for all of the above, each citing the battle id as the cause (the Why panel traces any post-battle change to its battle).

## Tier 3 — The living world

### Duels and arena brackets
- Implement one-on-one duel battles: two named characters, no formations, small arena map (a duel starts from a campaign challenge event).
- Implement melee-only and mixed-weapon duel rule sets with configurable rounds (a duel ends when one side is down or yields).
- Implement arena brackets: 8 or 16 entrants, single elimination, scheduled over campaign days (a bracket completes with a recorded champion).
- Implement wagering: the player and NPC notables bet on duel/arena outcomes with odds from relative skill (odds favor the higher-skill fighter measurably).
- Implement crowd reactions: arena audience morale effects that buff or rattle fighters (a home-crowd fighter gets a small morale bonus).
- Write duel tests: bracket completion, odds calibration over 200 simulated duels, and consequence application (all deterministic).

### Bandit ambush encounters
- Trigger ambush battles from the campaign encounter system when a party enters a bandit-flagged tile unaware (an unaware party starts the battle scattered, not formed).
- Implement ambush deployment: attackers placed in concealment around the travel route, defenders in march column (ambushers get a first-volley surprise bonus).
- Implement awareness checks: scout skill and lookouts reduce or negate the ambush (a high-scout party is never fully surprised).
- Implement bandit AI: hit-and-run, targeting pack animals/vehicles and stragglers, breaking off when losses mount (bandits retreat after 25% casualties in the test).
- Implement ransom demands as a pre-battle option: pay, refuse, or stall for time (stalling lets the party form up, reducing the surprise bonus).
- Write ambush tests: surprise bonus magnitude, awareness negation, bandit break-off threshold, and ransom flows (each deterministic).

### Companion bodyguard AI with permadeath
- Assign companions as bodyguards to the player or to formations, with guard radius and intercept behavior (a bodyguard interposes within 5m of a threat to its principal).
- Implement companion combat skill from campaign stats: their battle effectiveness matches their character sheet (a high-melee companion wins duels against tier-3 troops).
- Implement companion wounding: companions enter the downed state and can be stabilized like agents (an unstabilized companion dies after 200 ticks).
- Implement companion permadeath: a dead companion is removed from the campaign roster, their gear looted, and a cause-log row records where and how (their quests fail gracefully with a notification, never a crash).
- Implement companion morale aura: nearby troops get a morale bonus scaled by the companion's leadership (removing the companion drops nearby morale measurably).
- Implement companion capture: a downed companion can be captured instead of killed, enabling ransom events (a captured companion appears in the captor's prisoner list).
- Write bodyguard tests: intercept behavior, wound stabilization, permadeath cascade, and capture flow (each deterministic).

## Tier 4 — Audio

### Dialogue voice pipeline
- Define the voice-line asset contract: 48kHz WAV masters, compressed OGG/MP3 delivery, per-line metadata (character, emotion, context tags) in a sidecar JSON (every line in the repo validates against the schema).
- Build the line-ingestion pipeline: drop raw recordings in, get normalized loudness, trimmed silence, and game-ready files out (ingesting 100 lines completes without manual steps).
- Implement the dialogue voice lookup: given notable id, topic, and relationship state, return the best-matching line set (a request for an unknown notable falls back to a generic line, never silence-by-crash).
- Implement voice playback hooks in the client dialogue UI: play, interrupt on topic change, and subtitle sync (interrupting a line stops audio within 100ms).
- Add voice-line coverage tracking: which notables/topics have lines vs fallback, reported per build (coverage never silently decreases; CI fails on regression).
- Write pipeline tests: schema validation, loudness normalization within 1 LUFS of target, and fallback behavior (all pass on the checked-in sample lines).

### Battle barks with throttling and positional playback
- Define the bark taxonomy: contact, taking fire, advancing, falling back, routing, victory, casualty witnessed, ammo low, each with variants (every bark event from the sim maps to a taxonomy entry).
- Implement bark throttling: max N barks per 10 ticks per formation, priority queue so critical barks preempt chatter (a rout bark is never dropped for an ammo-low bark).
- Implement positional playback: bark volume and pan from agent position relative to the camera (a bark 100m left plays left and quiet).
- Implement per-faction voice sets: at least two distinct sets so enemies don't sound like the player's troops (swapping factions swaps the set).
- Write bark tests: throttling under event floods, priority preemption, and positional math (a 500-event flood yields at most the throttle limit in barks).

### Ambient battle audio integrated with Hana's SFX pipeline
- Consume Hana's SFX pipeline output format for weapons, impacts, explosions, and movement sounds without duplicating her assets (battle audio references her manifest, never copies files).
- Implement the ambient battle bed: distant gunfire, wind, and battle rumble mixed by battle intensity (intensity 0 is near-silent; intensity 1 is full bed).
- Implement dynamic mixing: duck the ambient bed under dialogue barks and UI speech, restore after (ducking is at least 6dB and releases within 1 second).
- Write audio integration tests: manifest consumption, mix levels within spec, and ducking behavior (all automated, no golden ears required).

### Radio chatter lines extending Hana's radio pipeline
- Extend Hana's radio pipeline manifest with a chatter category: squad callouts, dispatch, and commander orders formatted for her pipeline (chatter files build through her pipeline unmodified).
- Write and ingest the core chatter script: 200 lines covering contact reports, casualty reports, requests for support, and order acknowledgments (every line tagged with tactical context).
- Implement context selection: given battle events, pick chatter lines matching the tactical situation (a flanking maneuver triggers flanking callouts, not random chatter).
- Implement radio effect processing: band-pass, compression, and squelch tails applied at build time through the pipeline (processed chatter is distinguishable from clean dialogue in a blind listen).
- Write chatter tests: context matching accuracy on a labeled event set, and discipline throttle compliance (both automated).


## Critical path

- Define the Battle aggregate struct with id, phase, tick, participants, rosters, terrain seed, and outcome (constructing one from two campaign parties works without a client).
- Implement POST /v1/battle/start accepting attacker party id, defender party id, and options, returning a battle id (starting with invalid party ids returns 400, never a battle).
- Derive battle seeds as HMAC(campaign seed, battle counter, attacker id, defender id) so no two battles share a seed (deriving 1000 seeds yields 1000 unique values).
- Implement base strength calculation from troop count, tier, equipment quality, and commander skill (a 100-tier-3 force outscores a 100-tier-1 force by at least 2x).
- Write auto-resolve results back to the campaign: party troop counts, wounded pools, prisoner lists, treasury, and XP deltas applied atomically (applying the same result twice is impossible; results carry the battle id).
