# Agent 1 — World Data Pipeline

Paste everything below the line into a fresh agent session.

---

## Your job

Build the Phase 0 world data pipeline: real geography, real settlements, real state profiles, loaded and verifiable.

One job. Do not build simulation, rendering, or UI.

## Your folder

Write **only** inside `services/world-data/`.

You may **read** anything in the repo, including every design doc at the root. You may **not** edit any other folder, any design doc, or another agent's prompt.

If you think you need to change something outside your folder, stop and report it instead.

## Your branch

```bash
git checkout -b agent-1-world-data
```

## Read these first, in this order

1. `CONSTITUTION.md` — read all of it. Section 1 is your governing law. Section 7.3 tells you what "done" means.
2. `PHASES.md` — Phase 0 only. Your exit criteria are there, verbatim.
3. `TASKS.md` — Phase 0 section. That is your checklist; work it top to bottom.
4. `SPEC.md` — sections 2 (world data) and 3 (entity model, including 3B).
5. `CAUSE_EFFECT.md` — section 2, the town fields you must seed.
6. `FACTIONS.md` — section 3, the six sides and their expected rating profiles.
7. `ERA.md` — the era affects which population data you use. Check whether the era decision is still open.
8. `RISKS.md` — rows 5 and 6.

## What to build

Real data in, usable data out. Per `SPEC.md` section 2 and `PHASES.md` Phase 0:

- **Settlements** — cities, towns, and villages, classified by threshold rules applied to **real population data**, not invented cut-offs.
- **Roads and rail** — imported from real line data, assembled into a route graph usable for travel time and caravan routing.
- **Boundaries** — from Natural Earth or geoBoundaries.
- **Elevation** — from a public DEM (SRTM or similar), for campaign terrain and battle maps.
- **State profiles** — computed for **all 50 states plus D.C.**: population, farmland, mining output, economic output, area, ports. Computed from real data, never hand-typed.
- **Section assignment** — every state assigned to one of the six sections in `FACTIONS.md`.

### Two rules that are easy to get wrong

**Classification thresholds must come from the data.** Pick the cut-offs by looking at the real population distribution and recording why you chose them. Do not pick round numbers and call them real.

**Section ratings are computed, then checked — never forced.** `PHASES.md` says the six sides should "roughly match `FACTIONS.md` section 3 (checked, not forced)". If your computed ratings do not match the doc, the interesting question is *why*, and the answer goes in the changelog. You may adjust the **data mapping**. You may **not** hardcode the ratings to make them match. That would be fabricating the result.

## Deliverables

1. **Import scripts** that run end to end and are re-runnable.
2. **A published schema** — a real checked-in file describing what you produced. Agents 2 and 3 consume this. This is Contract A in `agents/README.md`.
3. **A portable export** (JSON or Parquet) alongside any database load. This is deliberate: the hosting decision is unresolved, and your output must work whether or not Postgres is used. Do not skip this as optional.
4. **A data manifest** — every dataset with source, URL, date retrieved, version, and any gaps or substitutions. `CONSTITUTION.md` section 1.1 requires gaps to be logged, with the nearest real source used instead.
5. **The spot-check record** — at least **10 settlements verified against real published figures**. Check in the values, the sources, and where your output agrees or disagrees.

## Constraints

- All constants in a config file with comments. No magic numbers in logic (`CONSTITUTION.md` section 1.2).
- Every external fetch handles failure — no silent fallbacks, no empty catch blocks (`CONSTITUTION.md` section 1.3). A failed download must be loud.
- **No fabricated data.** If a dataset is unavailable, report it. Never synthesise a plausible value to fill a gap. A wrong number that looks real is the worst possible outcome here, because the entire premise of the game rests on the data being real.
- **No new dependencies without saying so first.** Check what is already available.
- Never write outside the repo. New environment variables go in `.env.example`.

## Exit criteria

From `PHASES.md` Phase 0, and these are the definition of done:

> A script outputs every settlement in the region and every state profile for the country with real data, verified against real figures for at least 10 spot-checked places, and the six sides show rating profiles roughly matching `FACTIONS.md` section 3 (checked, not forced).

## Report back with

1. The real command you ran and its **actual output** pasted in. Not a summary. Not a claim.
2. The spot-check table: settlement, your value, real value, source, agree/disagree.
3. The computed section ratings next to `FACTIONS.md` section 3, with your explanation of any gap.
4. Every dataset gap and how you handled it.
5. Anything you could not do for real, stated plainly.

Do not report done on anything you did not run.
