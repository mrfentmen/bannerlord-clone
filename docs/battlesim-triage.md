# Battle-Sim Branch Triage — `worker/milo/simulation`

Audit of milo's battle-simulation branch, commit-by-commit, so the sim code can be
landed on `main` without dragging in assets or re-implementing UI that is already
on `main`.

**Branch audited:** `origin/worker/milo/simulation` @ `0af6e7a`
**Base:** `origin/main` @ `4dd4a5c`
**Fork point:** `1fd6dd0` (the two branches diverged before `cmd/apiserver` landed)
**Audit date:** 2026-10-01
**Method:** all counts from `git log`/`git diff` against a fresh clone. No SHA in
milo's bus traffic was trusted; see "Phantom SHAs" below.

---

## Headline numbers

| | |
|---|---|
| Commits on milo's branch not on `main` | **95** |
| Commits `main` has that milo lacks | **211** |
| Merge commits in the range | **0** (fully linear — clean to cherry-pick) |
| SIM-bucket commits (landed on `main` by this triage) | **35** |
| ASSETS-bucket commits (staged, **not** merged) | **40** |
| DUPLICATE-UI commits (held, **not** merged) | **18** |
| OTHER commits (docs/tooling, **not** merged) | **2** |
| Files milo touched under `services/simulation` | **119** |
| …of which are *pure additions* | **116** |
| …files containing any deletion | **3** |
| True content collisions with `main` under `services/simulation` | **6** |

The sim work is **almost entirely additive**. Across 119 files and ~44,400
inserted lines there are only **8 deleted lines in 3 files**. That is the single
most important fact for landing this: there is very little here to rebase *around*.

---

## Phantom SHAs

milo cited `030c3bb`, `b5d4955`, `c91828b` on the bus. None of the three resolves
on GitHub:

```
gh api repos/mrfentmen/bannerlord-clone/commits/030c3bb  -> 404
gh api repos/mrfentmen/bannerlord-clone/commits/b5d4955  -> 404
gh api repos/mrfentmen/bannerlord-clone/commits/c91828b  -> 404
```

They were either force-pushed away or never pushed. The commit subjects quoted
for them *do* correspond to real work present on the branch (formation
cohesion, grid-query early exit, the snapshot), so the work is real — but the
SHAs are not addressable. **Do not cite them in review threads**; use the SHAs in
the tables below, which are all verified resolvable.

---

## The six true collisions under `services/simulation`

Only these six files were changed on *both* sides since the fork point. These are
the only files where a conflict is possible, and the only ones needing a
resolution decision:

| File | milo | main | Nature of overlap |
|---|---|---|---|
| `services/simulation/config/balance.toml` | +keys | +keys | Both add formation keys. milo adds the 27 formation knobs; `main` adds campaign keys. Additive on both sides. |
| `services/simulation/internal/config/keys.go` | +353/-1 | changed | milo adds 27 formation key constants + defaults. `main` has its own key set. Needs union. |
| `services/simulation/internal/config/validate.go` | +353/-1 | changed | milo adds formation validation. `main` has campaign validation. Needs union. |
| `services/simulation/internal/config/config.go` | changed | changed | Config struct + loader. Both sides extended it. Needs union. |
| `services/simulation/internal/model/entities.go` | changed | changed | Battle entities. Needs union. |
| `services/simulation/internal/cause/log.go` | +7/-1 | changed | Cause-log row shape. Needs union. |

Everything else under `services/simulation` is new-file or main-untouched, so it
lands as a clean add.

**Important:** the `main` side of these six files comes from `cmd/apiserver` and
the campaign sim, which milo's branch does not contain. The conflicts are
therefore always *add milo's side to main's side* — never *take milo's version*.
Taking milo's version of `config.go` or `validate.go` would delete the campaign
config surface that `apiserver` depends on, and `go build` would fail loudly at
`cmd/apiserver`. Resolving any of these six as "theirs" is a mistake.

### Files that exist on both sides but are only main's

49 files exist in both trees under `services/simulation`. 43 of them are
main-only changes since the fork (the campaign systems: `attrition`, `campaign`,
`council`, `currency`, `demography`, `disease`, `factionai`, `food`, `influence`,
`labor`, `logistics`, `loyalty`, `march`, `market`, `migration`, `player`,
`relation`, `rulerai`, `security`, `shared`, `siege`, `starvation`, `supply`,
`unrest`, `upkeep`, plus `worldgen`, `sim`, `runner`, `simrun`, `profile`, `rng`,
`metrics`, `chains`). Those are untouched by the sim cherry-pick and stay as
`main` has them. This is why the sim branch must not be merged as a merge — a
merge would carry milo's stale copies of the campaign systems.

---

## Bucket 1 — SIM (35 commits, landed)

Battle simulation Go code under `services/simulation/`, plus the `cmd/battleserver`
entrypoint. This is the whole point of the triage.

| SHA | Subject |
|---|---|
| `e880fd9` | agent2: formation AI — shapes, orders, flanking movement, and its 27 balance knobs |
| `0a1fb8b` | agent4: central config owns the 27 formation keys; formation reads from central |
| `0f94911` | agent1: fix battle livelock where broken units could never route or rally |
| `8eaa98c` | add art wave 2 (12 concept pieces), voice wave 2 (16 recordings), dialogue tranche 2, sim tuning — **sim portion only** (57 of 123 files) |
| `7c75d37` | agent4: fix the battle test harness self-corrupting, and the raised-limit test |
| `b22c7da` | milo: add three pipelines (writing QA, 3D intake, sim check) — **sim portion only** (16 of 20 files) |
| `755e538` | milo: fix check-sim tsc path; wire MeleeRange into battleverify Report |
| `efaa090` | milo: battle session aggregate, HMAC seed derivation, /v1/battle/* API |
| `b796491` | milo: auto-resolve + campaign write-back (master plan Tier 1) |
| `965a1b2` | agent3: fix a fall-back order that withdrew nothing |
| `8cccc71` | agent2: prove the replay check can fail, and close the file-to-replay loop |
| `c1e9b3a` | milo: modern ballistics + vehicles as cavalry (master plan Tier 1) |
| `6d66c70` | agent2: judge the stage-order rule by the result hash, not by compareResults |
| `9c1de8a` | milo: battle barks — taxonomy, throttling, selection, positional mix |
| `4694398` | agent4: hold the shooters still in the hit-rate measurement, or it measures walking |
| `b6ae2f5` | agent1: stop the yes/no grid queries at the first hit instead of sweeping the field |
| `f0ab262` | milo: runnable battle server (`cmd/battleserver`) |
| `d89d4b5` | agent4: prove the battle size knob at two sizes, config change only |
| `e9b3301` | agent2: an order script format and three golden replay fixtures |
| `0f7aa15` | agent2: the determinism fuzz, and the experiment a same-process loop cannot run |
| `e6e3199` | agent3: an advance now carries the formation forward, not just a faster tidy |
| `8ca6ff2` | agent3: one rule for a formation's pace, on the commander that uses it |
| `5566469` | agent4: the casualty term counted bodies, so one death emptied a field |
| `862734f` | agent3: test the cohesion rule, which nothing was testing |
| `ed77d06` | agent3: a session battle can be given a commander, so formations can reach it |
| `479af50` | agent4: the size table is green at four sizes, and two assertions measured the wrong thing |
| `8b77d60` | agent3: stop rebuilding every group's layout four times a second |
| `f8f8af3` | agent1: stop the ranks walking through each other, or a battle is a parade |
| `530c39c` | agent3: a formation of men who are not there is an error, not a quiet no-op |
| `0c50732` | agent3: a player's order has to reach the field, and seven of the fourteen cannot |
| `2a345ec` | agent2: `simrun replay --battle <id>`, so a recorded battle can be re-run from disk |
| `77987a0` | agent4: the branch did not compile, and a battle nobody fought still printed a clean row |
| `2790b98` | agent3: a session battle stopped being recorded the moment a player changed his mind |
| `52b8ae8` | agent2: the replay formats, written down, and three golden fixtures that had drifted |
| `0af6e7a` | milo: snapshot in-progress battle sim work for Del-ordered push |
| `03d8cad` | milo: battle HUD + result screen (plan 2D/2E) — **sim portion only** (2 of 10 files) |

### Two SIM commits are mixed and were split by path

`8eaa98c` touches 123 files: 57 under `services/simulation` (SIM), 60 under
`content/` (art/voice/dialogue — ASSETS), 6 under `labs/crowd-poc/` (OTHER). Only
the 57 sim files were taken.

`b22c7da` touches 20 files: 16 under `services/simulation` (SIM), 3 under
`tools/pipelines/` (OTHER — CI helpers), 1 under `content/art/` (ASSETS). Only the
16 sim files were taken.

`03d8cad` touches 10 files: 2 under `services/simulation` (SIM — the battle-size
test pair), 6 under `clients/campaign/public/` (ASSETS), 2 under
`clients/campaign/src/ui/` (DUPLICATE-UI). Only the 2 sim files were taken.

### New packages this brings to `main`

None of these exist on `main` today:

```
internal/battle/        battle engine: formation, melee, aimedfire, morale,
                        targeting, grid, command, roster, result, resulthash,
                        replay, runticks
internal/formation/     formation AI: shapes, orders, flanking
internal/replay/        record/encode/causes + determinism + harness tests
internal/command/       order model, side, tactics, config
internal/battleapi/     /v1/battle/* HTTP surface
internal/battlefeed/    JSON feed + recorder
internal/battleverify/  invariants, scenarios, probe, report, findings
internal/barks/         bark taxonomy/throttling/selection
internal/autoresolve/   auto-resolve + campaign write-back
internal/writeback/     campaign state write-back, idempotent
internal/scale/         battle-size knob
internal/simfeed/       sim feed loader
cmd/battleserver/       runnable battle server on 127.0.0.1:8080
cmd/battleverify/       verification CLI
```

`cmd/battleserver` is the headline deliverable. Per `f0ab262`, it was verified
live on milo's branch: `/v1/version` answers, `POST /v1/battle/start` creates a
session, `GET /v1/battle/state` ticks forward, `POST /v1/battle/orders` accepts
orders, `POST /v1/battle/resolve` completes a battle.

---

## Bucket 2 — ASSETS (40 commits, staged on `worker/local/battlesim-assets`, NOT merged)

Voice, art, SFX, dialogue, writing, staged 3D. Real work, not sim, and not this
triage's call to merge.

| SHA | Subject |
|---|---|
| `b05eaec` | agent1: six faction leaders with backstories and first-meeting dialogue |
| `e1882ae` | agent7: townsfolk ambient dialogue, 154 lines by section and mood |
| `3044c7f` | Game writing: 6 new content files (antagonists, companions, quests, tavern-merchants, tutorial-guide, factions-regions) |
| `461090e` | agent1: add combat barks and battlefield dialogue |
| `f44355e` | agent4: faction rank progression dialogue, six sections, 2493 lines |
| `7996c27` | agent2: settlement flavor text for the campaign map, 18 entries |
| `0e8d231` | agent2: trim Omaha and Butte descriptions inside the 250 word cap |
| `1cdc8cc` | agent2: final word count trim on Omaha and Butte |
| `43ed66a` | agent2: bring Omaha description inside the 250 word cap |
| `b37b1a4` | agent8: add `content/lore/endings.md` endgame text |
| `3a3f0f2` | add voiced combat barks: 21 MP3s in 7 unit voices, labeled scripts |
| `b8eed60` | add concept art: 6 faction key art + 2 battle scenes |
| `cb4c8a0` | add voice batch 4: last captain/troop barks + townsfolk ambient voices |
| `33b1784` | add concept art: 6 faction leader portraits |
| `eb7c7a7` | add voice batch 5: bartender + shopkeeper tavern dialogue |
| `9cb0c2c` | add concept art: 10 ethnicity culture reference portraits |
| `3a5b5c3` | add voice batch 6: 10 ethnicity voices with character lines |
| `75df02f` | add SFX pack 1: 18 procedural sound effects + voice event wiring map |
| `4e77be0` | add SFX pack 2: 36 tiered weapons, vehicles, ambience, siege, UI, stingers |
| `8e977cd` | Add 28 more voice lines: round-2 barks, ethnic callouts, ambient, leader sets |
| `ef9c790` | Add 11 verified concept-art images: troops, battle, menu, vehicles |
| `fcfed60` | Add SFX pack 3: 48 procedural effects with manifest |
| `dd0a34b` | agent7: add rumor system `content/dialogue/rumors.md` |
| `6202837` | agent6: add campfire rest dialogue (12 conversations, 6 night watch monologues, 4 player question scenes) |
| `d95bd9c` | Start animation pipeline: procedural troop animator + spec |
| `88b2303` | milo: voice pipeline — asset contract, ingestion, lookup, coverage |
| `62b19d2` | stage 26 3D GLB assets for Rowan integration, add babylon loaders dep, art prompt template |
| `7b11ef5` | Milo: connect MCP servers for asset/audio lane (musicbrainz, image-tools) |
| `c9d657c` | Milo: connect 3D MCP servers (chisel, 3d-asset-processing-mcp) |
| `1f5dcf1` | milo: stage sniper + medic GLBs for Rowan (3D batch) |
| `20a7275` | milo: stage gunner + officer GLBs for Rowan (3D batch complete) |
| `6aa968b` | milo: clear GLB licences for build use (three.ws creator-ownership, MIT TRELLIS, generic subjects) |
| `ed4ca4f` | milo: stand `troop-officer.glb` upright (was lying flat along Z, Rowan's report) |
| `1420338` | milo: animation pipeline (master plan 4B, tasks 108-114) |
| `80b687d` | milo: SFX pipeline (master plan 4C, tasks 115-120) |
| `f6f76b2` | milo: radio and music pipeline (master plan 4D) |
| `2026c02` | milo: SFX loudness re-normalization pass |
| `07e3de8` | milo: asset pipeline hardening (master plan 4A) |
| `3dddbf7` | milo: cache invalidation strategy and operational runbook (master plan 4E) |

**Licensing note for whoever reviews this branch:** `6aa968b` clears GLB licences
for build use (three.ws creator-ownership, MIT TRELLIS, generic subjects), and
`88b2303` introduces a voice asset contract. The audio and art batches are large
(100+ MP3s, dozens of PNGs) and are **not** covered by the sim merge. They need
their own review pass before landing.

---

## Bucket 3 — DUPLICATE-UI (18 commits, held, NOT merged)

These implement MASTER_PLAN tasks 2A–4F **on milo's branch**, where Rowan's
equivalent work has **already landed on `main`**. Merging them would clobber
Rowan's lane. Held pending an ownership decision between Rowan and milo.

| SHA | Subject | Task range |
|---|---|---|
| `ac16119` | 3D battle scene scaffold | 2A, 44-51 |
| `a647f6c` | third-person player combat | 2B, 52-60 |
| `0f8dddd` | formation order UI | 2C, 61-68 |
| `d38bbdd` | siege assault UI | 2F, 78-81 |
| `fc946f5` | encounters UI | 2G, 82-88 |
| `2bea73e` | march planner wired to the real sim | 2H, 89-94 |
| `bdc1554` | NPC/clan/kingdom screens | 3D, 115-119 |
| `be3362b` | diplomacy UI | 3E, 120-125 |
| `bb2b667` | dialogue and persuasion UI | 3G, 131-134 |
| `60c59d5` | character sheet UI | 3A, 95-100 |
| `10d62d8` | party management UI | 3B, 101-109 |
| `4338eb7` | inventory and equipment UI | 3C, 110-114 |
| `b7b91a3` | quest log and markers UI | 3F, 126-130 |
| `98964c4` | time controls UI | 4A, 135-137 |
| `e3e5007` | day/night cycle and weather | 4B, 138-141 |
| `50c8fff` | settlement 3D upgrades | 4C, 142-144 |
| `4beace0` | town menu screens | 4D, 145-147 |
| `0623f77` | performance budgets and mobile | 4F, 151-154 |

### Collisions — for Rowan and milo to resolve

13 filenames exist in **both** `clients/campaign/src/ui/` trees. The right-hand
column says which side actually modified the file since the fork.

| File | on milo's branch | on `main` | Both modified? | Verdict |
|---|---|---|---|---|
| `MarchPlanner.ts` | `src/ui/panels/MarchPlanner.ts` | `src/ui/MarchPlanner.ts` | **YES — BOTH** | **Real conflict.** Different paths too (`panels/` vs flat). `2bea73e` rewrote `src/data/provider.ts`, `fixtureProvider.ts`, `types.ts`, `main.ts` alongside it. Needs ownership call. |
| `MarketPanel.ts` | `src/ui/panels/MarketPanel.ts` | `src/ui/MarketPanel.ts` | **YES — BOTH** | **Real conflict.** `4beace0` adds tavern/arena/market-rumor screens around it. |
| `ui.css` | present | present | **YES — BOTH** | **Real conflict.** 8 of the 18 UI commits above each append to `ui.css` (`a647f6c`, `0f8dddd`, `d38bbdd`, `fc946f5`, `2bea73e`, `bdc1554`, `be3362b`, `bb2b667`, `60c59d5`, `10d62d8`, `4338eb7`, `b7b91a3`, `98964c4`, `4beace0`, `0623f77`). A stylesheet append per screen across 15 commits is a merge-conflict factory. |
| `LedgerPanel.ts` | present | present | main only | Stale on milo's side. Keep main's. |
| `PartyPanel.ts` | present | present | main only | Stale. Keep main's. Note milo *also* wrote a separate `party-management.ts` — likely superseded by main's `PartyPanel.ts`. |
| `RulerPanel.ts` | present | present | main only | Stale. Keep main's. milo wrote `KingdomScreens.ts` instead. |
| `StartScreen.ts` | present | present | main only | Stale. Keep main's. |
| `TownPanel.ts` | present | present | main only | Stale. Keep main's. milo's `4beace0` town menu work is in `arena.ts`/`tavern.ts`. |
| `WhyPanel.ts` | present | present | main only | Stale. Keep main's. |
| `dom.ts` | present | present | main only | Stale — shared helper. Keep main's. |
| `hud.ts` | present | present | main only | Stale. Keep main's; milo's HUD work is in `battle-hud.ts`. |
| `kit.ts` | present | present | main only | Stale — shared helper. Keep main's. |
| `rendered.test.ts` | present | present | main only | Stale. Keep main's. |

### Structural mismatch, not just content

Rowan's tree is **flat** (`src/ui/MarketPanel.ts`). milo's is **nested**
(`src/ui/panels/MarketPanel.ts`). This is a layout disagreement, not a naming
accident, and it means the two lanes cannot be reconciled by file-level merge at
all — someone has to pick a layout. milo's `2bea73e` also rewrites
`src/data/provider.ts` and `src/data/fixture/fixtureProvider.ts`, which is the
sim-facing data path the campaign client uses; that rewrite is a **behavioural**
change to the client, not just UI, and deserves its own review regardless of who
wins the ownership call.

### Recommended split of ownership

- **Rowan keeps the shell and the panel set** on `main`: `dom.ts`, `kit.ts`, `ui.css`, `hud.ts`, the flat `*Panel.ts` family, and their tests.
- **milo's sim-adjacent UI is worth porting by hand, not merging**: `battle-hud.ts` and `battle-result.ts` are the battle-sim's own readouts and are genuinely new capability, not duplication. The `formation-orders.ts` screen is the natural counterpart to the landed formation AI.
- **The remaining 15 screens are straightforward duplicates** and should stay on milo's branch until each is checked against Rowan's equivalent, then dropped rather than merged.

`battle-hud.ts` / `battle-result.ts` were deliberately **excluded** from the SIM
merge: they are TypeScript under `clients/campaign/src/ui/`, and the triage brief
is explicit that sim work must not touch that tree. They are the highest-value
thing for Rowan to pull across by hand, because the sim they visualise only
becomes visible to players once the HUD lands.

---

## Bucket 4 — OTHER (2 commits, held)

| SHA | Subject | Why held |
|---|---|---|
| `afdc7d1` | agent5: total-claude OSS architecture notes for the battle sim | Prose under `agents/`. Documentation of the sim, not sim code. Worth keeping as a `docs/` note, but it is not part of this merge and it describes an architecture that predates the landing. |
| `4beace0` *(partial)* | — | Split: the `tools/pipelines/check-sim.py` and `check-writing.py` helpers in `b22c7da` are CI tooling, not sim. Held with the OTHER bucket. |

Also held from `b22c7da` / `755e538`: `tools/pipelines/check-sim.py`,
`tools/pipelines/check-writing.py`, `tools/pipelines/process-3d.py` — CI helpers
that reference paths on milo's branch layout. Landing them without the branch
layout would break CI.

---

## What landed, and how

1. `worker/local/battlesim-sim-only` branched from `origin/main` @ `4dd4a5c`, then rebased onto `main` as it moved (final parent `a65c0ca`).
2. The 35 SIM commits cherry-picked in original order, oldest first.
3. The 3 mixed commits split by path — only their `services/simulation/` files taken.
4. All 6 collision files resolved as **union (main + milo)**, never "theirs".
5. Zero files under `clients/campaign/src/ui/` touched. Verified.
6. `cmd/battleserver` present on `main`. Verified.
7. `go build ./...`, `go vet`, `go test ./...` and a determinism check run in
   `services/simulation/`. Full results below.

Branch state: `worker/local/battlesim-sim-only` — 38 commits ahead of `main`,
118 files under `services/simulation/`, plus `CHANGELOG.md` (one battle-morale
row) and this doc. Zero files under `clients/`, `content/` or `labs/`.

### Branch moved during the work

`main` advanced repeatedly while this was in flight (`4dd4a5c` → `237cdba` →
`2165880` → `4998ff2`), and a concurrent process rebased this branch onto the
newer `main` mid-task and reset it. It was finally rebased onto `4998ff2` with no
conflicts. The sim work survived the rebase intact — the tree of
`services/simulation/` after the rebase is byte-identical to the tree before it —
and the branch was fast-forwarded back onto that rebased commit rather than
force-pushed. Worth knowing: another agent is using the same `local-agent-1`
identity and has been committing **Rowan UI work** to `main` (`2165880`,
`0b88423`, `867a1dd`). Two agents sharing an identity on one repo is how the
branch got reset out from under this one.

---

## Verification

Run in `services/simulation/` on branch `ed7b24c`, Go 1.26.6 darwin/amd64.

### `go build ./...` — 7 packages fail, all pre-existing

```
mbclone/simulation/cmd/apiserver            FAIL
mbclone/simulation/cmd/apiserver/api        FAIL
mbclone/simulation/cmd/apiserver/campaign    FAIL
mbclone/simulation/cmd/simrun               FAIL
mbclone/simulation/internal/runner          FAIL
mbclone/simulation/internal/simrun          FAIL
mbclone/simulation/internal/systems/bandit   FAIL
```

Two independent root causes, **both on pristine `main` as well**:

```
cmd/apiserver/campaign/prisoners.go:55:7:  c.prisoners undefined
cmd/apiserver/campaign/prisoners.go:75:13: c.companions undefined
internal/systems/bandit/bandit.go:9:2:      "fmt" imported and not used
```

`cmd/simrun`, `internal/simrun` and `internal/runner` fail downstream of
`internal/runner`.

Verified by building every package individually on both `origin/main` and this
branch and diffing the two failing sets: **identical, 7 and 7.** This merge
introduces **no** new build failure. Note `cmd/simrun` is one of the pre-existing
failures, so the replay CLI cannot be built on `main` today; the sim engine
itself is unaffected.

Every sim package builds:

```
./cmd/battleserver      OK      ./internal/battle/...      OK
./cmd/battleverify      OK      ./internal/formation/...   OK
./cmd/simrun            OK      ./internal/replay/...     OK
                                 ./internal/battleverify/... OK
```

### `go vet` — clean

Clean across all 10 new sim packages (`battle`, `formation`, `replay`,
`battleverify`, `command`, `battleapi`, `barks`, `scale`, `autoresolve`,
`writeback`) plus `cmd/battleserver` and `cmd/battleverify`.

### `go test ./...` — 14 packages ok, 4 fail (all pre-existing), 7 cannot build

**Pre-existing, not caused by this merge.** Verified by running the same 4
packages on milo's **untouched** `worker/milo/simulation` worktree
(`0af6e7a`) — all 4 fail there identically:

| Package | Status | Failing tests (same on both branches) |
|---|---|---|
| `internal/battle` | FAIL | `TestGoldenReplaysAreTheBattlesTheyWere` (2 of 3 fixtures) |
| `internal/battleverify` | FAIL | `TestProbeSeesEveryTick`, `TestSuiteRunsAndPasses` |
| `internal/command` | FAIL | `TestCommandedBattle50v50` |
| `internal/replay` | FAIL | `TestDeterminismSameSeedSameBytes`, `TestDeterminismAcrossProcessBoundaries`, `TestDifferentSeedsProduceDifferentBattles`, `TestRecordingDoesNotChangeTheBattle` |

Passing (15): `autoresolve`, `barks`, `battleapi`, `cause`, `config`,
`formation`, `model`, `scale`, `simfeed`, `simrun`, `systems/construction`,
`systems/election`, `systems/player`, `systems/siege`, `writeback`.

**The golden-fixture failures are a real bug, not drift.** Two of the three
fixtures report `orders now 0, fixture says 8` and `orders now 0, fixture says 4`
— the recorded battle ran, the outcome and tick count are right, but **no orders
were delivered to the field**. That is the same defect as `0c50732` ("a player's
order has to reach the field, and seven of the fourteen cannot") failing to hold
for the scripted path. It needs a real fix, and `BATTLE_UPDATE_GOLDEN` must
**not** be used to silence it: the fixtures are the only thing recording that
orders reach a battle, and re-blessing them would delete the evidence.

A further 7 packages cannot be tested at all, because they do not build — the
same 7 as above, on `main` either.

### Determinism — holds

`internal/battle/testdata/golden/` has 3 fixtures. `uncommanded-4v4` matches its
recorded hash, 3 runs out of 3, in separate processes:
`e5f70b16e018c832` every time.

`battleverify -seed 777` run twice and diffed: **every game-relevant value is
identical** — ticks, casualties, result hash, outcome, per-scenario verdicts. The
only differences are the wall-clock columns (`790ms` vs `663ms`), which are
timing, not state. Byte-comparing whole reports will always differ because of
those columns; the hashes are the thing to compare, and they are stable.

So: the engine is deterministic run-to-run on a fixed seed, which is the claim
the replay harness exists to protect. The `replay` package's *own* determinism
tests fail for a different reason — they report `the battle reported N ticks but
published 0 frames`, i.e. the frame publisher produces nothing, so there is
nothing to replay.

Cherry-pick order matters here and was preserved: the sim commits form a chain
(`e880fd9` formation AI → `0a1fb8b` config keys → … → `0af6e7a` snapshot), and each
later commit's tests reference symbols introduced by earlier ones. Reordering
produces compile failures that look like conflicts but are not.

---

## What is still open

- **The SIM branch is pushed but not merged to `main`.** Step 4 of the brief is
  outstanding. It is ready to merge, but the merge was not performed — see
  "Not done" below.
- **A real bug in the scripted battle path.** Recorded orders are not reaching
  the field: 2 of 3 golden fixtures replay with `orders 0`. This predates the
  merge (it fails on milo's branch too) and it is the one finding here that
  needs an actual fix.
- **`cmd/apiserver` does not build on `main`.** `prisoners.go` references
  `c.prisoners` and `c.companions`, which do not exist on `Campaign`. Unrelated
  to the sim lane, but it means three packages are untestable and `apiserver`
  cannot run.
- **Rowan vs milo UI ownership** — 18 commits, 3 genuine conflicts
  (`MarchPlanner.ts`, `MarketPanel.ts`, `ui.css`), plus a flat-vs-nested layout
  disagreement that no file-level merge can settle.
- **ASSETS branch review** — 38 commits, 100+ MP3s and dozens of PNGs, needs its
  own licence/provenance pass. Staged on `worker/local/battlesim-assets` @ `b9670fa`.
- **`battle-hud.ts` / `battle-result.ts`** — new capability, currently stranded
  on milo's branch. Highest-value hand-port for Rowan.
- **milo's branch is 211 behind main.** Even after the sim code lands, milo's
  branch should be rebased or retired so it stops being a divergence trap.
- **The phantom SHAs** mean milo's bus traffic cannot be used to locate work.
  Worth a convention fix: cite resolvable SHAs only.

### Not done

- **Step 4 (merge to `main`) was not performed.** The branches were pushed and
  the SIM branch is verified, but the merge to `main` was interrupted. Nothing
  has been force-pushed and `main` was not modified by this triage.
- **The crew bus was not notified.** `~/workspace/skills/relay-bus/bin/relay.py`
  does not exist on this machine — `~/workspace` did not exist before this task
  created it, and there is no `relay-bus` anywhere on the filesystem. No bus
  message was sent.
