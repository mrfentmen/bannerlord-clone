# Agent 2 — Headless Simulation

> ## STOP — DO NOT START THIS AGENT YET
>
> **This agent is blocked on one unanswered question.**
>
> `CONSTITUTION.md` section 4 says the stack is locked as **Go + Postgres**. `SPEC.md` section 9 leaves hosting open. Those conflict:
>
> - Cloudflare does not run Go natively — only as WebAssembly.
> - Go compiled to `js/wasm` **cannot open TCP sockets**, so it cannot reach Postgres.
> - Cloudflare does not host Postgres (D1 is SQLite; Hyperdrive proxies to a Postgres elsewhere).
>
> **The question:** does the simulation run in the browser, on a server, or both?
>
> - **Browser-only** → write TypeScript (or Go→WASM) in a Web Worker, state in IndexedDB. Free, no server. Breaks the locked stack, needs a `CONSTITUTION.md` amendment.
> - **Go server** → write Go + Postgres on a VPS or Cloudflare Containers. Matches the locked stack. Costs a running server.
> - **Hybrid** → browser first, same Go code reused server-side later.
>
> Get this decided, then fill in the line below and start.
>
> **Decision: \_\_\_\_\_\_\_\_\_\_\_\_\_  Date: \_\_\_\_\_\_\_\_\_\_\_\_\_**
>
> See `agents/README.md` and `CONSTITUTION.md` section 4.1.

---

Paste everything below the line into a fresh agent session **once the decision above is made**.

---

## Your job

Build the headless simulation: the web of cause and effect, with no graphics at all.

This is the heart of the game. `README.md` calls the cause-and-effect chain the one premise. Your job is to prove it works before anything is built around it.

## Your language

Per the decision recorded above.

## Your folder

Write **only** inside `services/simulation/`.

You may **read** anything in the repo. You may **not** edit any other folder, any design doc, or another agent's prompt.

## Your branch

```bash
git checkout -b agent-2-simulation
```

## Read these first, in this order

1. `CONSTITUTION.md` — **section 2 is your governing law.** Read it twice.
2. `PHASES.md` — Phase 1 only.
3. `TASKS.md` — Phase 1 section. That is your checklist.
4. `CAUSE_EFFECT.md` — the whole file. Section 2 is your field list, section 3 your systems, section 4 the cause log, sections 5 and 10 your ten test chains, sections 8 and 9 resources and march/supply.
5. `SPEC.md` — section 4 (tick model) and section 3 (entity model).
6. `ECONOMY.md`, `MARCH_AND_WAR.md`, `RULERS.md`, `AI.md`.
7. `TESTING_AND_BALANCE.md` — how you prove it.
8. `CHANGELOG.md` — the open decisions, several of which affect you (era, fuel as a fifth resource, combat model).

## What to build

The systems in `CAUSE_EFFECT.md` section 3, the tick loop, the cause log, and a headless runner. From `TASKS.md` Phase 1:

- The systems: Food, Starvation, Disease, Labor, Market, Unrest, Loyalty, Council vote, Migration, Security, Logistics, Military upkeep, Faction AI.
- The resources: money, gold, food, metal, plus influence and renown.
- The war systems: March, Supply, Attrition, Siege, Ruler decisions, Relations, Influence.
- Ruler generation with traits and ambitions.
- The **cause log**, with a row for every tracked field change.
- The **"why" query** that walks a cause chain.
- The **tick runner** with documented system order and snapshot reads.

### The three rules that make or break this

**1. Systems never call each other.** They read a snapshot of the previous state and write to the next. No cross-system imports, no direct calls. `CONSTITUTION.md` section 2.1. There is a static decoupling test for this in `TESTING_AND_BALANCE.md` — write it and make it fail if anything couples.

**2. Every tracked write produces a cause-log row.** Not "should". `CAUSE_EFFECT.md` is explicit: a feature that changes tracked state without writing a cause row is **incomplete**. If you can't explain a change through the cause log, the feature isn't done.

**3. System order is fixed and documented.** Results must never depend on which system ran first inside a tick (`SPEC.md` section 4). Document the order in code and in `CHANGELOG.md`.

### When a bug seems to need coupling

Do not couple the systems. `CONSTITUTION.md` section 2.3: log it in `CHANGELOG.md` under **Unresolved** with an explanation of why decoupled systems did not produce the right behaviour, and fix the shared state model or the tick order instead. A patch that couples two systems to fix a bug is a failed fix, not a fast one.

## Deliverables

- Systems, tick runner, cause log, why-query, all runnable headless.
- **The balance config file** — one commented file with every constant, per `CONSTITUTION.md` section 1.2. No number hidden in code.
- **Saved simulation logs** from multi-year runs, with and without a scripted "dumb player" that makes bad choices.
- **Test results for all ten example chains** from `CAUSE_EFFECT.md` sections 5 and 10.
- **Multi-seed dominance results.**

## Constraints

- All constants in the config file, commented, with reasonable ranges.
- Deterministic from a seed. Same seed plus same inputs equals same outcome. Without this, nothing is reproducible and every bug report is worthless (`AI.md` section 1).
- **No fabricated behaviour.** If a system can't be implemented for real yet, say so. Do not stub it and let the run continue as if it worked — a stub that silently does nothing will make the chains pass for the wrong reason, which is worse than failing.
- No new dependencies without saying so first.

## Exit criteria

From `PHASES.md` Phase 1:

> All ten example chains in `CAUSE_EFFECT.md` sections 5 and 10 are observable in logs **without scripting them**, and a "why" query on any collapsed town returns a real chain of at least five linked causes. Headless runs also show that no side dominates every run (checked across many seeds).

Note "**without scripting them**". If you have to write an event that triggers the chain, the chain did not emerge and the criterion is not met. That is the entire point of the test.

## Report back with

1. The real command you ran and its **actual output** pasted in.
2. For each of the ten chains: the log excerpt showing it emerged, unscripted.
3. A sample why-query on a collapsed town, showing all five-plus links.
4. The multi-seed dominance table — which side won each seed.
5. The decoupling test result.
6. Anything that could not be done for real, stated plainly.

Do not report a chain as working if you had to script it.
