# Build-state brief and work order (T0 → T1)

**Date:** 2026-10-01
**Status:** active work order from the project owner
**Read first:** `CONSTITUTION.md`, `agents/README.md`, `RISKS.md`, `docs/bannerlord-gap-analysis.md`

---

## 0. How this relates to `docs/bannerlord-gap-analysis.md`

Read that document first. It is the feature inventory — 48 numbered Bannerlord mechanics with wiki sources, formulas, and priorities. **Do not rebuild it here.**

This document covers three things it does not:

1. **§T0 — build state.** Work already claimed as done that is not verified or not actually wired up. These gaps are not in the feature inventory because they are not features.
2. **§T1 — sequencing and lane ownership.** Which of the inventory's items go first, who builds them, and what "done" means.
3. **§T4 — items missing from the inventory itself.** A short list.

**Where this document and the gap analysis disagree, stop and log it under `CHANGELOG.md` **Unresolved**.** Do not silently pick a side. See §5 for a discrepancy found on 2026-10-01 that needs an owner ruling.

---

## 1. Ground rules

Already binding via `CONSTITUTION.md` and `agents/README.md`. Restated so nobody has to remember.

1. **One agent, one folder.** Write only inside the folder you own. If you need another lane's folder, **stop and report it**.
2. **Root design docs are read-only to lanes.** If this brief conflicts with a design doc, log it under **Unresolved**.
3. **`CHANGELOG.md` edits are additive only.** Append rows. Never rewrite another lane's row.
4. **Prove it or it is not done.** Run the real build, typecheck, and tests. Paste real output. An exit criterion is a measurement, not an opinion.
5. **No placeholders, stubs, mocks, or facade code in shipped paths.** If it cannot be done for real, say so and stop.
6. **No magic numbers.** Every balance constant goes in `services/simulation/config/balance.toml` or the client's design tokens, with a comment saying what it does and what a reasonable range is.
7. **Systems never call each other** (`CONSTITUTION.md` §2). A simulation system reads shared state and writes shared state. Nothing else.
8. **Every tracked write produces a cause-log row.** A feature that changes tracked state without one is incomplete.
9. **No spinners.** Skeleton states shaped like the content. No placeholder copy in anything a player can see.
10. **Fictional people only.** No real public figures, no real parties, no real tragedies (`CONSTITUTION.md` §6).

### Lane ownership

| Lane | Folder | Language |
|---|---|---|
| Agent 1 — world data | `services/world-data/` | Python |
| Agent 2 — simulation | `services/simulation/` | Go |
| Agent 3 — campaign client | `clients/campaign/` | TypeScript + Babylon.js |
| Agent 4 — crowd POC | `labs/crowd-poc/` | TypeScript + Babylon.js |

---

## 2. What already exists — read before building

- **World data pipeline is essentially complete.** 13,189 settlements, 51 state profiles, 177,179 rows across 11 tables, real Census / BEA / USGS / USDA / SRTM / Natural Earth data, 75 passing tests. Portable export committed at `services/world-data/exports/`.
- **Client wire format already exists.** `services/world-data/exports/wire/{network,region,settlements}.json` — 487 settlements, 439 roads, 4,653 rail segments — built field-for-field against `clients/campaign/src/world/types.ts`, plus 2,236 terrarium tile refs. Agent 1, Wave 2 done.
- **Campaign client is substantial.** 62 source files, 9 panels, HUD, 282 passing vitest tests, Playwright e2e. Terrain, roads, rail, buildings, party pins render.
- **Crowd rendering is proven.** `labs/crowd-poc` passes 300 units @ 60fps and 1,000 units @ 30fps median, with an honest benchmark recording the 27.8fps worst repeat.
- **The simulation has 27 systems** in `services/simulation/internal/systems/`, covering most of `CAUSE_EFFECT.md` §3 and §9.

The last item is the problem. It is the least verified thing in the repo.

---

## 3. T0 — Unblock existing work. Do this before any T1 item.

`CONSTITUTION.md` §7.2: a gate that cannot be met is a failed gate. Until these close, anything built on top is unverifiable.

### T0.1 — The Go simulation has no tests at all

**Owner: Agent 2.** `services/simulation/` has 91 files and 27 systems and **zero `*_test.go` files.**

This is the project's core premise — the cause-and-effect web in `CAUSE_EFFECT.md` — and the one component with no evidence behind it. The gap analysis rates loyalty, security, influence, and clan tiers as P0 features; none of them are measurable today.

Deliver:

1. **Table-driven Go tests per system**, at `internal/systems/<name>/<name>_test.go`. Cover at minimum the normal case, the failure case, and the recovery case. Good outcomes must emerge the same way bad ones do (`CAUSE_EFFECT.md` §5 chain 5).
2. **A decoupling test.** Walk the import graph of `internal/systems/**` and fail if any system imports or calls another. This is a named enforcement in `CONSTITUTION.md` §2.3 and it does not currently exist.
3. **A cause-log completeness test.** Assert every write to a tracked field produces a row in `internal/cause/log.go`. `CAUSE_EFFECT.md` §4.
4. **The ten chains from `CAUSE_EFFECT.md` §5 and §10 as executable tests.** They must emerge from the systems. If a chain only passes because something is scripted, the test must fail.
5. **A multi-seed harness.** Run headless over many seeds, assert no side dominates every run, report the spread rather than a single number.

Do not start T1.2 (clans) until this lands. Everything below depends on it.

### T0.2 — Phase 1 has no CHANGELOG entry

**Owner: Agent 2.** The **Built** table jumps Phase 0 → campaign client → setup. 614 KB of Go landed with no row, and the last three commits to `main` are unsigned `pax@localhost` syncs. Add an additive **Built** row for Phase 1 describing what exists, including honest known gaps. Add a **Performance results** row once T0.1 gives you numbers.

### T0.3 — The client still runs on fixtures

**Owner: Agent 3, Agent 1 for the data side.** `clients/campaign/src/data/fixture/fixtureProvider.ts` is 52 KB and is what the game loads. The real export already exists at `services/world-data/exports/wire/`.

1. A real provider backed by `src/world/load.ts` reading the wire JSON.
2. A runtime flag or env switch so both paths work in dev, with **fixtures unreachable from a production build**. The existing guard at `src/data/fixture/forbiddenInProduction.ts` must stay and must pass.
3. Proof: build against the real Ohio River Valley export and screenshot a town with its real buildings, roads, and rail.

Keep fixtures for unit tests. That is what they are for.

### T0.4 — The Postgres load has never run

**Owner: Agent 1.** Every pipeline run used `--skip-postgres`. `PHASES.md` Phase 0 requires "Load into Postgres." Run it once for real. If it cannot run, log exactly why under **Unresolved**. Do not tick the box.

### T0.5 — The hosting decision is still not made

**Owner: project owner. Escalate; do not self-resolve.**

`SPEC.md` §9 says "Decided: Cloudflare" and then admits the implementation option is TBD. `CONSTITUTION.md` §4.1 calls the conflict open and blocking Phase 2. Go cannot open TCP sockets from `js/wasm`, and Cloudflare does not host Postgres.

Until settled, **the client cannot talk to the simulation**, and every T1 item needing server state is blocked. Agent 2 may build the simulation behind an interface so either outcome works, but must not commit to one. Log the interface under **Decisions**.

### T0.6 — `TASKS.md` is unticked while Phase 0 is largely done

**Owner: project owner.** 164 checkboxes, none ticked, Phase 0 ~90% complete. Agent 1 already logged this under **Unresolved**, correctly. Two boxes cannot honestly be ticked as written because they name datasets that were not the ones used. Rewrite those to name the real sources (Census TIGER/estimates, Census + Natural Earth, Census, USGS SRTM), tick what is genuinely done, and record the V1 region choice under **Decisions**.

---

## 4. T1 — Sequencing for the gap analysis inventory

The gap analysis already has priorities. This section adds **dependency order and lane assignment**, which the analysis does not.

Ordered by dependency, not by importance. `T1.2` is the keystone: everything after it needs it.

| # | Item | Gap analysis ref | Lane | Blocked by |
|---|---|---|---|---|
| T1.1 | **Simulation test suite** | (see T0.1) | Agent 2 | nothing |
| T1.2 | **Clans as a first-class entity** | #18, #3 | Agent 2 | T1.1 |
| T1.3 | **Loyalty + security with real mechanics** | #6, #7 | Agent 2 | T1.1 |
| T1.4 | **Marriage, heirs, succession, aging** | #2, #3, #4, #5 | Agent 2 | T1.2 |
| T1.5 | **Kingdom policies + decision voting** | #19, #20 | Agent 2 | T1.2 |
| T1.6 | **Influence gain/spend** | #16 | Agent 2 | T1.1 |
| T1.7 | **Armies** | #17 | Agent 2 | T1.1 |
| T1.8 | **Notables** | #39 | Agent 2 | T1.1 |
| T1.9 | **Workshops, recipes, smithing** | #26, #29 | Agent 2 | T1.1 |
| T1.10 | **Notables / issues UI, panels** | #39, #40 | Agent 3 | T1.8 |
| T1.11 | **Clan panel + family tree** | #18 | Agent 3 | T1.2, T1.4 |

### T1.2 — Clans as a first-class entity (the keystone)

Today `rulers` are flat individuals with pairwise `relations`. Clans are what produce marriage, inheritance, defection, fief limits, and politics. T1.4, T1.5, and T1.11 all fall out of this one concept.

Add to `internal/model/entities.go` and `fields.go`:

- `clans`: id, name, tier, members (ruler ids), fiefs, leader, wealth, influence, relations to other clans.
- **Clan-tier fief limits are the point.** In Bannerlord, "hold everything" fails organically because your tier does not permit it. This project currently has **no mechanism that stops overextension** — the failure mode in `DESIGN.md` §2 step 7 has nothing enforcing it.
- Clan member relations replace some pairwise `relations` rows. Keep pairwise for non-clan interactions (notables, foreign rulers).
- Inheritance, fief grant, defection, and tier changes all write cause rows.

### T1.3 — Loyalty and security with real mechanics

The gap analysis rates these P0 and says the spec has no mechanics for them. The systems exist in `CAUSE_EFFECT.md` §3, so the work is reconciling the two: promote the qualitative chains to the numeric thresholds the analysis documents, in `balance.toml`, and cover them with the T1.1 tests.

### T1.9 — Workshops, recipes, smithing

Largest economy gap. `ECONOMY.md` §5 lists workshops as an income source, but there is **no production system** — no inputs → process → outputs → stock chain. Bannerlord's mid-game is manufacturing from raw goods; this project has scarcity-priced markets with no manufacturing.

- Workshops consume raw goods and labor, produce finished goods over time.
- Finished goods feed troop equipment quality and repair, which feeds `metal` consumption.
- **A new system.** It must not call the Market system — it writes stock, and Market reacts to stock on the next tick like everything else.
- Every stock change writes a cause row. A player must be able to ask "why is my rifle production down?" and get a real chain.

### Agent 3 — panels, for whatever T1 items you own

Follow the existing patterns in `src/ui/panels/`: named layout-shaped skeletons, no spinners, real copy, keyboard and focus handling, skeleton parity tests, and screenshots at 320 / 390 / 768 / 1440 px.

Four gaps already known from `CHANGELOG.md` — close these regardless:

- **Town and party skeletons are dormant** until `hud`/`main` pass the loading flag. Wire them.
- **Ruler roster is unpaginated** at 300–800 cards. Paginate or virtualize.
- **`LedgerPanel.ts` renders references as printed text**, not links into the Why panel. Fix it — that link is the product's core premise.
- **The client runs on fixtures.** See T0.3.

---

## 5. Discrepancy found 2026-10-01 — needs an owner ruling

**`docs/bannerlord-gap-analysis.md` compares against a spec file that does not exist in this repository.**

It states: *"Compare against: `bannerlord-mechanics-port.md` (our current spec)."* That path returns **404**. The root spec is `FEATURES.md` / `DESIGN.md` / `CAUSE_EFFECT.md`.

The consequence is that its COVERED / MISSING split disagrees with the current docs. Examples:

| Gap analysis claim | Actual state |
|---|---|
| #6 "Our spec mentions loyalty once without any mechanics" | `CAUSE_EFFECT.md` §3 specifies a Loyalty system with reads, writes, and a 5-link example chain |
| #7 "Our spec has no security stat at all" | `CAUSE_EFFECT.md` §2 has a `road_safety` field; §3 specifies a Security system writing it |
| #9 "Our spec has no building system" | `DESIGN.md` §5 lists clinic, granary, wall, market, barracks, water treatment; `PHASES.md` Phase 6 has building investment |
| #8 "Our spec has party food only — nothing for settlements" | `CAUSE_EFFECT.md` §2 has `food_stock`, `food_production`, `food_demand` per town |

**Lanes must not resolve this.** Two possible fixes, both owner decisions:

- **(a)** The analysis was written against a draft that has since been folded into `CAUSE_EFFECT.md`; the analysis needs re-basing and its priorities will shift.
- **(b)** `bannerlord-mechanics-port.md` was lost or never committed; it needs recovering, and the analysis is still correct.

Owner ruling required before T1.3, because its scope depends on the answer.

---

## 6. §T3 — Missing from the inventory itself

Short list. These appear in neither the root docs nor the gap analysis.

| Item | Note |
|---|---|
| **Auto-resolve battle** | The gap analysis lists auto-resolve as **COVERED**, meaning specified. It is not built, and no lane owns it. Without it, every campaign day risks a 12-minute fight at 300–1,000 units. Recommend promoting to T1. |
| **Party templates and refit** | Bannerlord's Stance / Heavy / Light / Horse compositions, refittable to terrain. Not in the analysis. |
| **Party split and merge** | Companions can be *assigned*; splitting off a detachment and merging war parties are absent. |
| **Naval trade** | `CAUSE_EFFECT.md` §10 chain 8 designs a port blockade and `ECONOMY.md` §8 assumes waterborne food exports, but no naval layer exists. Either the chain is fiction or the economy lacks a transport mode. **Owner decision.** |
| **Mod support** | Out of scope per `FEATURES.md` §11, but the config-file discipline in `CONSTITUTION.md` §1.2 is already most of the way there. Later decision. |

`FEATURES.md` §11 lists multiplayer and mod support as out of scope, which matches the boss direction recorded in the gap analysis. Leave multiplayer out.

---

## 7. Definition of done

An item is done when all of these are true and the evidence is pasted into `CHANGELOG.md`:

- [ ] Works against real state, not fixtures, in a runnable build.
- [ ] Balance constants live in the config file, with comments and ranges.
- [ ] Every tracked write produces a cause-log row, and the Why panel can walk it.
- [ ] Its systems do not import or call each other.
- [ ] Tests cover the normal case, the failure case, and the recovery case.
- [ ] Client panels have layout-shaped skeletons, real copy, focus handling, and skeleton parity tests.
- [ ] Screenshots reviewed at 320 / 390 / 768 / 1440 px.
- [ ] Build, typecheck, and tests pass, with real output pasted.
- [ ] An additive **Built** row, plus **Unresolved** rows for anything left open.

---

## 8. Report format

Each lane reports back with:

1. **Done** — items completed, with pasted build and test output.
2. **Blocked** — what cannot proceed, the specific blocker, and who owns it.
3. **Contradictions** — anything conflicting with a design doc or with the gap analysis, logged under **Unresolved**.
4. **Honest gaps** — what is not finished, stated plainly. A facade that looks finished is worse than an admitted gap.

Do not redefine success to something easier. Do not delete or skip a failing test to make a build pass. Fix the cause or report it.

---

## 9. Do not cut this

`RISKS.md` §6 names what must survive scope pressure. Reinforcing it here:

- The cause log and the Why panel — the core premise
- Decoupled systems
- Real data and asset licence tracking
- Skeleton loading states
- **The simulation test suite (T1.1).** Cut anything else first. A cause-and-effect game whose simulation is untested is a facade.