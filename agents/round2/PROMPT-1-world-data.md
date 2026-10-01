# PROMPT 1 — Lane 1: World Data Pipeline

**Paste this whole file as the agent's first message.**
**Folder you own: `services/world-data/` — and nothing else.**

---

## Your lane

You own the world data pipeline. This round you close the three gaps that are **blocking Phase 0 from being signed off**. You are not the only agent working; three others are running in parallel in other folders.

## Read first

1. `CONSTITUTION.md` — §1.1 real data only, §1.3 errors handled not swallowed, §5 licences and manifests
2. `agents/README.md` — the rules below are a restatement, not a replacement
3. `PHASES.md` Phase 0 — your exit criteria
4. `services/world-data/docs/PIPELINE_RUN.md` and `SPOT_CHECK.md` — your own last run
5. `CHANGELOG.md` — append only, never rewrite another lane's rows
6. `docs/mcp-servers.md` §3.2 — you have a keyless US Census MCP server available

## The rules

- Write only inside `services/world-data/`. If you need another lane's folder, **stop and report it**.
- The root design docs (`FEATURES.md`, `DESIGN.md`, `TASKS.md`, `PHASES.md`) are **read-only**. If you find a contradiction, log it in `CHANGELOG.md` under **Unresolved** and report. Do not edit.
- `CHANGELOG.md` edits are **additive only**.
- **Prove it or it is not done.** Paste real output. Never delete or skip a failing test to make a build pass.
- Every balance or threshold constant goes in `config/world_data.toml` with a comment saying what it does and what a reasonable range is. **No magic numbers.**
- No real people, no real parties, no real tragedies (`CONSTITUTION.md` §6).

## What is already true — do not rebuild it

The pipeline runs end to end. 13,189 settlements, 51 state profiles, 177,179 rows across 11 tables, 75 passing tests, 23 dataset digests verified. Exports are committed at `exports/`. The client wire format at `exports/wire/` is built and matches `clients/campaign/src/world/types.ts`.

## Your tasks, in priority order

### Task 1 — Drive the unverified spot-check rows to zero

`SPOT_CHECK.md` currently records **36 checked, 24 agree, 1 disagree, 11 unverified**. Those 11 are the single reason Phase 0 is unsigned.

You have a keyless US Census server (`docs/mcp-servers.md` §3.2): tools `geocode`, `coordinates`, `coordinate_geographies`.

- Close as many of the 11 as Census 2020 decennial data genuinely allows.
- **If a row cannot be verified, say so explicitly and say why.** A row that stays `unverified` with a stated reason is honest and acceptable. A row that is quietly dropped is not.
- Do **not** substitute a non-decennial figure for a decennial one. If only a 2020-estimates figure exists, that is a substitution: log it in `CHANGELOG.md` under **Data notes** with the substitution and the gap, per §1.1.

**Done when:** `SPOT_CHECK.md` shows zero rows unverified for no stated reason, and every substitution is logged.

### Task 2 — Run the Postgres load. Once. For real.

Every pipeline run in this repo used `--skip-postgres`. `PHASES.md` Phase 0 requires "Load into Postgres" and it has **never happened**.

- Run it once, for real.
- If it cannot run — no database, no credentials, whatever — **log exactly why under Unresolved, with the real error**, and report it. Do not tick the box. An honest blocked result beats a fake pass.

**Done when:** either the load succeeded with the row counts pasted, or a precise Unresolved row explains the blocker.

### Task 3 — `place_boundaries` exports 0 rows

Your last run recorded this. Find out whether it is a real gap in the pipeline or a data source that has nothing to return. Either fix it or document why it is legitimately empty.

## Also worth doing if the above finish early

- **NYC wave 2 is stalled.** The last repo commit says *"Brooklyn/Queens/Staten Island pending: Overpass API timing out on all queries as of 2026-10-01 03:40 UTC"*. You have a keyless `overpass` server (§3.1) with free tools `nodes_in_box` and `tag_census`. Note the paid tools include `named_places` and `nearby_features` — **do not try to add a licence key to reach them.** Use the free tools and `tools/fetch-city-data.py`.
- **A timeout and an empty result look identical on the wire.** Implement real backoff and report a timeout as a timeout. Never conclude a place is empty because a request timed out.
- Add a regression test for anything you fix.

## Definition of done

- [ ] The pipeline still exits 0, and the full test suite passes with real output pasted.
- [ ] Every dataset you touched still has a digest in `docs/DATA_MANIFEST.md`.
- [ ] New additive **Built** row in `CHANGELOG.md`.
- [ ] Every gap you could not close has an **Unresolved** row with reproduction steps.
- [ ] No new box ticked in `TASKS.md`. That is the owner's file.

## Report back

1. **Done** — with pasted output.
2. **Blocked** — with the specific blocker and who owns it.
3. **Contradictions** — anything in the docs that does not match reality.
4. **Honest gaps** — what is still not finished, stated plainly. A facade that looks finished is worse than an admitted gap.