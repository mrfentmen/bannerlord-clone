# Buffy docs audit — 2026-10-02

Read-only audit per `BUFFY_RESPONSE.md` (tasks 1–4). No code touched; nothing fixed silently. Method: GitHub API only (no clone). The approved hosting sync was pushed first, separately: `e9f8845`.

## Task 1 — TASKS reconciliation (`.agent-specs/pax-100-tasks.md` vs `main`)

File state: checkboxes 1–100 all still `[ ]`; completion lives only in prose lists at the bottom; last updated 04:12 UTC (`d423a0e`), later Pax commits not reflected.

- Two completed lists in one file, diverging: copy 1 covers 1–47 + 56–69; copy 2 covers 1–37 + 60,63,64 + 71–72. Each is missing entries the other has (38–39, 40–47, 57–69 exist only in copy 1).
- "Tasks 57–69 (4d40f0a): all 10 biomes" — `4d40f0a` covers biome templates only; 60/63/64 landed in `d2f47ee`, 61–62 in `e052d9e`, 66–67 in `e9c5199`. Task 65 (return to campaign) has no commit and appears in neither list.
- Tasks 73–80 have a commit (`a66fd69`) but appear in neither completed list.
- Tasks 71–72 are marked done with no commit SHA.
- Done-with-no-commit (self-described verification): 4, 7–9, 15, 21–22, 26–29, 33–35, 71–72.
- Progress line says 69/100; completed entries imply 72; `BUFFY_RESPONSE.md` says 84/100. Three different numbers.
- Duplicate commit pair: `41ffd52` and `a107b8c`, same message ("Pax tasks 2+56"); the file cites only `a107b8c`.
- Root `TASKS.md`: known-stale by design per `docs/MASTER_PLAN.md` ("frozen; MASTER_PLAN is the authority").

## Task 2 — `docs/*.md` sweep

Section citations: 147 `FILE.md section N` citations across `docs/` and root docs checked against real section numbers — **0 stale**.

Dead path references (real):

- `docs/MASTER_PLAN.md`: `docs/_draft/idb-schema.md` (no `_draft` in repo); `services/world-data/PIPELINE_RUNBOOK.md` (actual: `services/world-data/docs/PIPELINE_RUN.md`); `tools/ASSET_RUNBOOK.md` (actual: `tools/ASSET_BUILD_README.md`); `tools/anim/CLIPS.md` (not present); `assets/audio/MUSIC_MANIFEST.md` and `assets/audio/SFX_RECIPES.md` (not present).
- `docs/bannerlord-gap-analysis.md`: 7 × `services/world-data/data/*.js` — the files exist as `.json` (character_backgrounds, ethnicities, settlement_economy, skills, trade_goods, troop_trees, weapons).
- `docs/battlesim-triage.md`: `tools/pipelines/{check-sim,check-writing,process-3d}.py` (no `tools/pipelines` dir); `content/dialogue/rumors.md` and `content/lore/endings.md` (no `content/` dir); client files `KingdomScreens.ts`, `battle-hud.ts`, `battle-result.ts`, `formation-orders.ts`, `party-management.ts`, `tavern.ts` (none exist).
- `docs/tasks-mute.md`: `docs/world-data-cities.md` (not present).
- `docs/missing-vs-bannerlord.md`: `SECURITY.md` (not present).

Not dead (checked and cleared): wildcard/placeholder paths; library names (Babylon.js, three.js); `dist/…` paths (build output, gitignored by design); `/models/weapons/*.glb` (exists at `clients/campaign/public/models/weapons/`).

External/local-machine refs (not repo files): `~/workspace/staging/…`, `~/workspace/skills/relay-bus/bin/relay.py`, `send.py`.

Contradictions / drift worth a ruling:

- `services/world-data/docs/SECTION_RATINGS.md` leaks Python reprs — `band 1 of <function max_rating at 0x7611b8c78d60>` — 17 occurrences (lines 68–72 onward). The file also records the real ratings check: 13/30 computed ratings match `FACTIONS.md` section 3 targets, disagreements documented as findings.
- `docs/TESTING_AND_BALANCE.md` plans balance/economy/combat/ai/quests `.toml` files; the repo has one (`services/simulation/config/balance.toml`), and `CONSTITUTION.md` section 1.2 says "one commented balance config file". Pick one story.
- `docs/FACTION_BACKSTORY.md` names six side leaders; `RULERS.md` says ruler names are generated, "not hand-written". Lore vs data — needs a ruling.
- README read-order list was stale (14 of ~30 docs) — fixed in `e9f8845`.

## Task 3 — CHANGELOG honesty

Sampled path claims resolve on `main`: `internal/battle/morale.go`, `src/input/gamepad/haptics.ts`, `tools/check-no-fixtures.mjs`, `config/balance.toml`, `src/data/provider.ts`, `src/data/saves.ts`. Commit `172414d` exists and matches the "wage fixture" fix claim.

Stale rows found and fixed in `e9f8845`: Pending "Hosting" row; new Made-decisions row; "Open conflict" row now resolved (decision logged 2026-10-02).

Cannot verify here (no clone): test counts (e.g., 538/539) and "build passes" claims — those need the crew's runs.

## Task 4 — CONSTITUTION.md section 5 licence spot-check (read-only)

- `assets/manifest.json`: clean — source, author, licence, date_retrieved, attribution_text, licence_copy, sha256 per entry (8 entries, all Kenney CC0 source archives).
- `clients/campaign/public/models/LICENSES.md`: covers the new models with source/licence/provenance (Quaternius CC0 sets, added 2026-10-01) — good.
- Gap A: the new client models (operators, weapons, horse, tank, soldier) are NOT in `assets/manifest.json`; licence coverage lives in a second file. `ASSETS.md` section 2 calls the manifest the gate — rule whether `LICENSES.md` is an accepted second source or the canonical manifest must list them.
- Gap B: `.gitignore` ignores `labs/crowd-poc/assets/originals/` but not `assets/originals/` — the manifest's own fetch path could be committed by accident.
- Policy note (not a licence problem): `MASTER_PLAN.md` marks Kenney carryover "UNDECIDED"; Kenney assets sit in the repo under CC0 with licence copies — boss call.

## What this audit did not do

No builds, typecheck, tests, or runtime checks (no clone). No code touched. Nothing fixed except the separately approved hosting sync. The scratch tooling used for the sweep is not committed.
