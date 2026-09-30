# How to run four agents on this project

Four agents, four jobs, four folders. This file is the plan they all follow.

**Read this before starting any agent.**

---

## The split, and why it is this split

The work is divided so that **no two agents edit the same file**. That is the whole reason it can run in parallel.

| Agent | Phase | Owns | Language | Can start now? |
|---|---|---|---|---|
| 1 | Phase 0 — World data pipeline | `services/world-data/` | Python | **Yes** |
| 2 | Phase 1 — Headless simulation | `services/simulation/` | **TBD — blocked** | **No — see blocker** |
| 3 | Phase 2 — Campaign map client | `clients/campaign/` | TypeScript + Babylon.js | **Yes** |
| 4 | Phase 3 — Crowd rendering POC | `labs/crowd-poc/` | TypeScript + Babylon.js | **Yes** |

`PHASES.md` deliberately puts the two riskiest things first: the cause-and-effect simulation, and crowd rendering. Agents 2 and 4 exist to kill those two risks early. Agent 4 can run today because it needs no data, no simulation, and no map — just an empty 3D scene and a stopwatch.

### Why not one agent per phase in order?

Because Phases 2 and 3 do not actually depend on Phases 0 and 1 being finished. The map client can render terrain from a real elevation tile and a static fixture while the simulation is still being written. The crowd proof needs nothing at all. Serialising them would waste the parallel time you already have.

---

## THE BLOCKER — read this before starting Agent 2

`CONSTITUTION.md` section 4 and `README.md` say the stack is locked as **Go + Postgres**. `SPEC.md` section 9 leaves hosting open.

Those two things conflict, and it is not a small conflict:

- Cloudflare does not run Go natively on Workers or Pages — only as WebAssembly.
- Go compiled to `js/wasm` **cannot open TCP sockets**, so it cannot reach Postgres.
- Cloudflare does not host Postgres. It offers D1 (SQLite) or Hyperdrive (a proxy to a Postgres living elsewhere).

So before Agent 2 writes a line of simulation code, someone has to answer one question: **does the simulation run in the browser, on a server, or both?**

| Choice | Agent 2 writes | Cost |
|---|---|---|
| Browser-only | TypeScript (or Go→WASM) in a Web Worker, state in IndexedDB | Free. No server. Breaks the locked stack. |
| Go server | Go + Postgres on a VPS or Cloudflare Containers | A server that must be running. Matches the locked stack. |
| Hybrid | Browser first, same Go code reused server-side | Slowest to build, keeps both doors open. |

**Get this decision before starting Agent 2.** Agents 1, 3, and 4 are not blocked by it.

Agent 1 is deliberately told to emit **both** a Postgres load and a portable export, so its output works whichever way this is settled. That hedge is on purpose, not indecision.

---

## THE RULES

### 1. One agent, one folder
An agent writes **only** inside the folder it owns. It does not edit another agent's folder, the design docs, or another agent's prompt.

If an agent believes it needs to change something outside its folder, it **stops and reports it**. It does not do it.

### 2. The design docs are read-only
The 24 docs at the repo root are the specification. Agents read them. Agents do not rewrite them.

The one exception: if an agent finds a genuine contradiction between docs, it logs it in `CHANGELOG.md` under **Unresolved** and reports it. It does not silently pick a side.

### 3. One branch per agent
```
main
├── agent-1-world-data
├── agent-2-simulation
├── agent-3-campaign-client
└── agent-4-crowd-poc
```
Each agent commits to its own branch. Nothing merges to `main` until it passes its own exit criteria. This is why the repo was put under version control before any agent started — without it, four agents in one folder overwrite each other and there is no way to tell.

### 4. No placeholders, no stubs, no mocks in shipped paths
`CONSTITUTION.md` section 7.3. If something cannot be done for real, the agent stops and says so. A facade that looks finished is worse than an honest gap.

Fixtures are allowed **only** as test fixtures and clearly named as such. A fixture is never wired into a production path.

### 5. Prove it or it is not done
Every agent runs its own build, typecheck, and tests before reporting. Real output pasted, not a claim. An exit criterion is a measurement, not an opinion.

### 6. Log to CHANGELOG.md
Every agent adds to `CHANGELOG.md` under **Built** when it finishes a task and under **Unresolved** when it hits something it cannot solve. `CONSTITUTION.md` sections 1, 2, and 7 require this.

Append to the tables. Do not rewrite other agents' entries. This is the one shared file — so edits must be additive only.

### 7. Never write outside the repo
No global installs, no writing to `/Users/dtaxk`, no secrets in code. Any new environment variable goes in `.env.example`.

---

## THE SHARED CONTRACTS

Agents 1, 2, and 3 need to agree on data shapes or they cannot connect. These are frozen until all agents agree to change them.

### Contract A — world data (Agent 1 → Agents 2 and 3)

Field definitions come from `CAUSE_EFFECT.md` section 2 (town fields) and `SPEC.md` section 3 (entity model). Agent 1 must:

1. Publish the schema it actually produced, as a real, checked-in file it can point at.
2. Export a **portable form** (JSON or Parquet) alongside the database load, so consumers work whether or not Postgres ends up used.
3. Include a **manifest** listing every dataset used: source, URL, date retrieved, version, and any gaps or substitutions. `CONSTITUTION.md` section 1.1 requires gaps to be logged.

Sampling requirement, from `PHASES.md` Phase 0 exit criteria: at least **10 settlements spot-checked against real published figures**. The spot-check values and sources get checked in, because an unverified number is a guess.

### Contract B — simulation state (Agent 2 → Agents 3 and 4)

Agent 2 owns the tick loop and the cause log. `CONSTITUTION.md` section 2 fixes the shape:

- Systems never call each other. They read a snapshot and write to the next state.
- Keep **system order fixed and documented**, because results must not depend on which system ran first (`SPEC.md` section 4).
- **Every tracked write produces a cause-log row.** `CAUSE_EFFECT.md` is explicit: a feature that changes tracked state without writing a cause row is *incomplete*.

### Contract C — battle snapshot (Agent 2 ↔ Agents 3 and 4)

Like it or not, three agents touch the battle boundary. `SPEC.md` sections 5.3 defines it:

**In:** both sides' troops (count, quality, gear), morale, supply state, terrain type and map, time of day, weather.
**Out:** casualties, wounded, loot, ammo used, territory change, reputation changes, and cause-log entries.

Agent 4's proof of concept defines the practical limits of the "in" side — how many units are actually affordable. Agent 2 must read those numbers rather than assume them, because `SPEC.md` section 5.1's crowd targets are a budget, not a promise.

---

## HOW TO START

```bash
cd "/Users/dtaxk/Documents/mount and blade clone"    # note: no trailing space, it was removed
git log --oneline                                    # baseline is committed
```

For each agent:

```bash
git checkout -b agent-1-world-data            # or the matching branch
```

Then paste that agent's `PROMPT.md` into the agent's session as its first message.

Point the agent's working directory at the repo root, not at its own subfolder. It needs to read the design docs at the root, and it does its writing inside the folder it owns.

### Order of operations

1. **Now:** start Agents 1, 3, and 4.
2. **When the hosting decision is made:** start Agent 2.
3. **When Agents 1 and 2 pass their exit criteria:** Agent 3 switches from fixtures to the real export, and Agent 4's numbers feed the real battle budget.

---

## WHAT "DONE" LOOKS LIKE

From `PHASES.md`, verbatim in intent:

- **Agent 1 done when:** a script outputs every settlement and every state profile from real data, verified against real figures for at least 10 spot-checked places, and the six sides' rating profiles roughly match `FACTIONS.md` section 3 — *checked, not forced*.
- **Agent 2 done when:** all ten example chains in `CAUSE_EFFECT.md` sections 5 and 10 are observable in logs **without scripting them**, a "why" query on any collapsed town returns a real chain of at least five linked causes, and no side dominates every run across many seeds.
- **Agent 3 done when:** a player can walk a party across the map, enter a town, buy and sell goods, see real stats, and watch prices and unrest respond over time, with the Why panel explaining at least one real event.
- **Agent 4 done when:** **300 units at 60 fps and 1,000 units at 30 fps on mid-range consumer hardware, not just the dev machine.**

That last one is the one people fudge. It is measured on other hardware or it is not measured.
