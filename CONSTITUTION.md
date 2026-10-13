# CONSTITUTION.md

Non-negotiable build rules. **Wins any conflict with any other document.**

If another document, comment, or agent disagrees with anything in this file, this file wins. This file changes only by an explicit decision logged in `CHANGELOG.md` under **Decisions**, with the date and the reason.

Every rule below has an **Enforcement** line. A rule with no enforcement is a wish, not a rule.

Read order: `README.md` → this file → `DESIGN.md` → everything else.

---

## 1. REAL DATA, AND NUMBERS LIVE IN ONE PLACE

### 1.1 Real data is the rule
Geography, city names, populations, roads, and terrain come from real public datasets. Nothing is hand-typed or invented when real data exists.

- Settlements, roads, rail, boundaries, elevation, and population are **imported**, never authored.
- Where real data has gaps, use the nearest real source (nearest census decade, nearest measured value) and **log the gap and the substitution** in `CHANGELOG.md` under **Data notes**.
- A wrong value is traced back to the source dataset and fixed **at import**. Never patched over inside game logic.

### 1.2 No number hides in code
Every balance, economy, combat, AI, and difficulty constant lives in one commented balance config file. No magic numbers in logic.

- Every constant carries a comment saying what it does and what a reasonable range is.
- Design docs may show starting values; the config file is the single source of truth at runtime.
- Changing a constant is logged in `CHANGELOG.md` with the test results that motivated it.

### 1.3 Errors are handled, not swallowed
Every external call is treated as untrusted. Every endpoint handles its failure cases, not just the happy path.

- Player-facing errors show a plain message **and a way to recover**.
- Full detail is logged for developers.
- No empty catch blocks. No silent fallbacks.

**Enforcement:** decoupling and config lint checks in `TESTING_AND_BALANCE.md`; import scripts spot-checked against real published figures; every bug logged with steps and seed.

---

## 2. SYSTEMS STAY DECOUPLED

This is the rule that makes the core premise possible. Everything affects everything, and the player can trace the chain.

### 2.1 Systems never call each other
A system reads shared state and writes to shared state. It never invokes another system directly.

- No cross-system imports or function calls.
- Communication happens through shared state only.
- System order is fixed and documented. Each tick reads a snapshot of the previous state and writes to the next, so results never depend on which system ran first.

### 2.2 Every tracked write produces a cause row
If a feature changes tracked state and writes nothing to the cause log, **the feature is incomplete**. Not "should be improved" — incomplete.

- The cause log records what changed, by how much, which system did it, and what state it read.
- The Why panel walks that chain back to the player-visible origin.

### 2.3 A problem that "needs" coupling is a design problem
If a bug appears to require one system to call another, do **not** couple them. Log it in `CHANGELOG.md` under **Unresolved** with an explanation of why decoupled systems did not produce the right behaviour, and fix it in the shared state model or the tick order.

**Enforcement:** a static decoupling test that fails if systems import or call each other. A cause-log test asserting every tracked field write produces a row. Both are listed in `TESTING_AND_BALANCE.md`.

---

## 3. THE GAME MUST NOT LOOK OR READ GENERIC

### 3.1 Lock visual direction before building panels
References, palette, typography, and tone are locked **before** UI panels and screens are built. Locking happens in Phase 2 (`PHASES.md`), informed by `ART_AND_AUDIO.md`.

Building UI before the direction is locked means redoing it. That is the most expensive mistake available.

### 3.2 No spinners. Skeleton states only
Any panel that reads data shows a skeleton placeholder shaped like the content that is coming. Loading spinners are banned.

### 3.3 UI copy reads like a real game
Labels, empty states, errors, and tooltips are written in the voice of the finished product — grounded and gritty, modern. No placeholder text, no lorem ipsum, no developer-speak, no "TODO" in anything a player can see.

### 3.4 No invented design system
Colours, spacing, and type come from the locked direction in `ART_AND_AUDIO.md`. Components do not introduce their own palette or fonts. Mobile and small-screen layout is checked before any UI work is called done.

**Enforcement:** visual polish pass against this section in Phase 7 (`TASKS.md`); a repo-wide check for spinner usage and placeholder strings.

---

## 4. THE TECH STACK IS LOCKED

> **Provenance note for agents:** every other section of this file is cross-referenced by number from the other docs. Section 4 is the one section never cited by number, and `README.md` points at this file for the "locked" tech stack — so this section is reconstructed and its contents come from `README.md`, `SPEC.md` sections 1 and 9, and `RISKS.md` row 6. The conflict recorded below was resolved 2026-10-02 — see section 4.1.

The stack as stated across the docs:

- **Rendering:** Babylon.js (browser, WebGL/WebGPU)
- **Backend:** Go
- **Database:** none — the simulation has no database; world persistence is Durable Objects and player saves live in the browser (IndexedDB). Postgres was dropped 2026-10-02.
- **Deployment:** built locally, deployed via Cloudflare — Pages (client), one Worker (single domain), Containers (Go sim), Durable Objects (persistence)
- **3D assets:** free models, tracked per `ASSETS.md`
- **World data:** real public datasets, never hand-typed

### 4.1 RESOLVED 2026-10-02 — Cloudflare only
**Resolution:** everything runs on Cloudflare — Pages serves the client, one Worker routes the single domain, the Go simulation runs in Containers, and Durable Objects hold world persistence. **Postgres is dropped**; world saves live in the browser (IndexedDB). Logged in `CHANGELOG.md` under **Decisions**, 2026-10-02.
Kept for the record — why no single Cloudflare product fit the stack as written:

| Claim | Reality |
|---|---|
| Go on Workers | Only as **WebAssembly**. Cloudflare lists JS, TS, Python and Rust as first-class; Go is "compile to Wasm". |
| Go WebAssembly limits | Go compiled to `js/wasm` cannot open TCP sockets, so it cannot talk to Postgres directly. WASI support on Workers is documented as experimental with only some syscalls implemented. |
| Running a real Go server | Possible via **Cloudflare Containers** (real Docker images), which is a paid product with cold starts. |
| Postgres on Cloudflare | Cloudflare **does not host Postgres**. Options are **D1** (hosted SQLite) or **Hyperdrive** (a pooled connection to a Postgres hosted elsewhere). |

The three live options are the ones already listed in `SPEC.md` section 9:

1. **Simulation runs in the browser** (Web Worker in TypeScript, or Go compiled to WASM), state in IndexedDB. No server, no server cost. Cloudflare Pages hosts the static client for free. Conflicts with Go + Postgres as written.
2. **Go server on a VPS or container** with Postgres, fronted by Cloudflare. Matches this stack as written. Costs a server and requires it to be running.
3. **Hybrid:** browser simulation first, the same Go code reused server-side later. Keeps both doors open; slowest to set up.

**Settled openly:** this amendment is logged in `CHANGELOG.md` under **Decisions** (2026-10-02) with the reason, and `SPEC.md` section 9 plus `README.md` were updated in the same change.

### 4.2 Stack decisions need a reason on record
Any change to the stack above — including a new dependency, a new hosted service, or a language swap — is logged in `CHANGELOG.md` under **Decisions** with the date and the reason. Check whether the repo already does a thing before adding a library that does it again.

**Enforcement:** `RISKS.md` row 6 tracked this as an open risk with "decide in Phase 0" as the mitigation; resolved 2026-10-02 (see 4.1).

---

## 5. EVERY ASSET HAS A LICENCE AND A MANIFEST ENTRY

Free models and audio come from many artists under many licences. Getting this wrong means forced removal or legal trouble.

### 5.1 Commercial use only
Only assets cleared for commercial use are allowed in the repo. Licence terms are saved, not just linked — a saved copy of the licence page, because those pages change or vanish.

### 5.2 Everything is in the manifest
No asset enters the project without a manifest entry: **source, author, licence, date retrieved, and the attribution text**. This applies to models, textures, audio, and fonts equally.

- The manifest is checked as part of the build. An asset without an entry fails the build rather than shipping.
- Originals are stored unedited; compressed formats are what ship.
- The credits screen is **generated from the manifest**. Hand-maintained credits drift and miss things.

**Enforcement:** manifest check in the build, listed in `TESTING_AND_BALANCE.md`. Failure state in `RISKS.md` row 4 is "a model with an unclear licence in the repo" — the build check exists to make that impossible.

---

## 6. REAL GEOGRAPHY, FICTIONAL PEOPLE

The game uses real places and real problems. It must never use real people or real tragedies.

### 6.1 Allowed
- Real geography, real city and state names, real population and terrain data, used as-is.
- Real-world problems that are general and ongoing (supply, disease, unrest, scarcity).
- In-game item names that are generic or fictional — "bolt-action rifle", "light utility truck" — even when a 3D model resembles something real. This avoids both trademark trouble and false historical claims.

### 6.2 Banned
- **No real people as characters.** Not in the roster, not in generated news, quests, dialogue, bios, or flavour text. This includes living public figures and recent ones.
- **No real parties, movements, or organisations** named in headlines, broadcasts, or faction content.
- **No real wars, attacks, disasters, or crises replayed**, dated, or referenced as the thing being simulated.
- **No real attack sites or tragedy sites** used as battle set pieces framed as the real event.
- **Not an allegory.** The game is not written as a comment on, or attack on, any real current party, movement, or person. Sides are invented and system-driven.

History in this game is **fictional and system-driven** — it emerges from simulated systems, not from a script of real events. If generated content ever produces a real name, that is a bug to be fixed at the prompt and the filter, not published.

**Enforcement:** generation prompts and output filters per `SPEC.md` section 8 and `AI.md`; reviewed before the Phase 7 content pass ships.

---

## 7. PHASES ARE GATES

### 7.1 Do not start a phase before the last one passed
`PHASES.md` defines eight phases in a deliberate order. Each has **exit criteria**. A phase does not start until the previous phase's exit criteria are met.

The order exists for a reason: it proves the two riskiest things — the cause-and-effect simulation and crowd rendering — before anything is built around them.

### 7.2 Exit criteria are checked, not assumed
An exit criterion is a test result, not an opinion.

- "300 units at 60 fps" is measured on **mid-range consumer hardware**, not the dev machine.
- "No side dominates every run" is measured across **many seeds**.
- "The ten example chains emerge" is observed **in logs, without scripting them**.

### 7.3 Nothing is logged as done unless it was verified
Every completed task adds an entry to `CHANGELOG.md` under **Built**. Every unresolved error goes under **Unresolved** with reproduction steps and the seed. Build, typecheck, and tests pass before anything is called done. Never delete or skip a failing test to make it pass — fix the cause.

### 7.4 A patch over a broken gate is a failed gate
If an exit criterion cannot be met, the phase does not pass and the blocker is reported. Do not redefine success to something easier, and do not ship a facade.

**Enforcement:** `CHANGELOG.md` sections **Built**, **Unresolved**, and **Performance results** are the evidence. `TESTING_AND_BALANCE.md` defines how each is proven.

---

## PROVENANCE

This document was reconstructed after the build folder was found to contain every other design doc but not this one, despite 18 files referencing it by section number.

- Sections 1, 2, 3, 5, 6, and 7 were reconstructed from their own cross-references in `AI.md`, `ART_AND_AUDIO.md`, `CAUSE_EFFECT.md`, `CHANGELOG.md`, `CHARACTER.md`, `ECONOMY.md`, `ERA.md`, `FACTIONS.md`, `FEATURES.md`, `INFRASTRUCTURE_AND_MEDIA.md`, `PHASES.md`, `README.md`, `RISKS.md`, `RULERS.md`, `SPEC.md`, `TASKS.md`, `TESTING_AND_BALANCE.md`, and `UI_UX.md`.
- Section 4 is the inference described in its own provenance note and should be reviewed by the project owner before it is treated as settled.
- Reconstructed: 2026-09-30. Recorded in `CHANGELOG.md` under **Decisions**.
