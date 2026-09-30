# CHANGELOG.md

Running log of what has been built, what is unresolved, decisions made, and generation costs. Required by CONSTITUTION.md sections 1, 2, and 7. Newest entries go at the top of each section.

---

## HOW TO USE THIS FILE

- Every completed task adds an entry under **Built** with what changed and why.
- Every error the build cannot resolve goes under **Unresolved** with steps to reproduce and the seed if relevant.
- A bug that seems to need one system calling another goes under **Unresolved** with an explanation of why decoupled systems did not produce the right behavior (CONSTITUTION.md section 2).
- Every design or technical decision goes under **Decisions**, with the date and the reason.
- Every LLM generation batch logs token spend under **Generation cost** (SPEC.md section 8).

---

## DECISIONS

Format: `YYYY-MM-DD | Decision | Reason | Files affected`

Pending decisions (fill in when made):

| Decision | Options | Status |
|---|---|---|
| Era | 1950 to 2009 campaign with tech by year, one fixed era, or today with era tech tiers | Open (ERA.md) |
| Fuel as a fifth resource | Yes or no | Open (VEHICLES_AND_FUEL.md) |
| Combat model | Era firearms and vehicles as standard, or ammo-scarce mixed model | Open (COMBAT.md) |
| Hosting | Browser-side sim, Go server plus Postgres, or hybrid | Open (SPEC.md section 9) |
| Art style | Stylized low-poly, gritty semi-realistic, or period filter | Open (ART_AND_AUDIO.md) |
| Historical roads | Current network everywhere, or gated by opening year | Open (ERA.md section 5) |
| First playable slice | Which states and sides | Open (PHASES.md Phase 0) |
| Era tiers in V1 | One, two, or all four | Open |
| Mid-range test hardware definition | CPU, GPU, and RAM class | Open (TESTING_AND_BALANCE.md section 8) |

### Made decisions

| Date | Decision | Reason | Files affected |
|---|---|---|---|
| 2026-09-30 | Reconstructed `CONSTITUTION.md` | The file did not exist although 18 docs reference it by section number, including README's "wins any conflict" priority claim. Sections 1, 2, 3, 5, 6, and 7 were rebuilt from their own cross-references. Section 4 (tech stack) was never cited by number and is flagged in-file as an inference needing owner review. | `CONSTITUTION.md` |
| 2026-09-30 | Reconstructed `ASSETS.md` | The file did not exist although 8 docs reference it by section number, and it gates Phase 3. Section 3 and the numeric budgets are starting values sized to the crowd targets in `SPEC.md` section 5.1, to be tuned against real measurements in Phase 3. | `ASSETS.md` |
| 2026-09-30 | Git repository initialised, docs committed as baseline | Four parallel coding agents were about to work in this folder. Without version control they cannot branch, diff, or merge, and will overwrite each other's work. | `.gitignore`, all 24 docs |
| 2026-09-30 | Folder renamed to drop trailing space in name | The directory name ended with a space, which breaks shell scripts, build paths, and agent working directories. | folder name |

### Open conflict recorded, not resolved

| Date | Conflict | Detail | Status |
|---|---|---|---|
| 2026-09-30 | Go + Postgres vs Cloudflare | `CONSTITUTION.md` section 4 and `README.md` state the stack as locked, but Cloudflare does not host Postgres and does not run Go natively on Workers or Pages. Go runs only as WebAssembly, and Go compiled to `js/wasm` cannot open TCP sockets, so it cannot reach Postgres directly. Real options are Workers+WASM+D1, Cloudflare Containers with external Postgres, or a Go server on a VPS. See `SPEC.md` section 9 and `CONSTITUTION.md` section 4.1. | **Open - blocks Phase 2.** Needs an explicit amendment decision. |

---

## BUILT

Format: `YYYY-MM-DD | Phase | Task | What changed and why`

| Date | Phase | Task | What changed and why |
|---|---|---|---|
| 2026-09-30 | Phase 0 | Spot-check parser fix + section rating fixes (agent pass, Hana verified) | Two code fixes in `services/world-data`, both verified by re-running the real stages and the test suite (73 passed, 1 skipped, up from 39 passed / 9 skipped). (1) `src/worlddata/spotcheck.py`: rewrote the reference-figure parser with bounded-gap headcount matching — fixes the Boston bug where "125 km2" borrowed a nearby "population" word and was recorded as Boston's published 2020 census figure. Added retry with exponential backoff for HTTP 429 plus a minimum inter-request interval; new config keys `spot_check_census_year`, `spot_check_max_attempts`, `spot_check_retry_backoff_seconds`, `spot_check_retry_backoff_cap_seconds`, `spot_check_min_request_interval_seconds` in `config/world_data.toml`. Re-ran the spot-check stage for real: 36 settlements, **24 agree, 1 disagree, 11 unverified** (was 15/1/20; the remaining 11 have no decennial figure in the reference summary at all, none are rate-limited). The 1 disagree is Nashville-Davidson (pipeline 2020 base 715,878 vs published 689,447, 3.83% apart) — recorded as a finding, not smoothed over. This resolves the two 2026-09-30 UNRESOLVED spot-check entries below. (2) `src/worlddata/sections.py`: fixed three defects that made the old ratings vacuous — band edges were percentiles of individual-state shares (every side is an aggregate, so all 30 cells scored 5), the money score added millions of dollars to a unitless count (weights did nothing), and the gold dimension read the same BEA series as metal (coal/stone/sand, not gold; now mapped to USGS MRDS gold mine-feature counts per `DECLARED_GAPS`). Ratings recomputed from real data, never adjusted to match: **13/30 exact, 24/30 within one band** vs the old 7/30 and 14/30; every disagreement explained with per-state figures in `docs/SECTION_RATINGS.md`, including one fix that made agreement worse. All 51 jurisdictions assigned to exactly one of the six FACTIONS.md sections, verified with no gaps or overlaps. Regenerated `docs/SPOT_CHECK.md`, `docs/SECTION_RATINGS.md`, `dist/spot_checks.json`. Full pipeline re-run with `--skip-fetch --reuse-stages` in progress to regenerate the portable exports. |
| 2026-09-30 | Phase 0 | World data pipeline first full run | `python -m worlddata run` completed every stage at 2026-09-30T08:37:01Z (pipeline 1.0.0, `config/world_data.toml`, Census 2020 with 2023-vintage estimates, Postgres skipped via `--skip-postgres`). Stage timings in seconds: fetch 7.0, settlements 37.6, boundaries 70.1, state_profiles 61.6, sections 0.0, classification 0.5, terrain 15.9, routes 149.4, seed 1.6, spot_check 10.3, publish 456.7. Settlements: 19,484 places parsed, 13,189 kept at or above the 500-person minimum, 51 states and D.C., Puerto Rico (FIPS 72) excluded as absent from FACTIONS.md section 4; 4,008 places had their county fragments summed against their place total and all agreed exactly. Boundaries: 51 state polygons and 32,037 place polygons, cross-checked against Natural Earth 1:10m admin-1 by ISO 3166-2 with 51 of 51 interior points inside the Census polygon; state area is the Census ALAND value, not a pipeline-computed area. State profiles: 51 profiles from Census, BEA SAGDP (459 state-by-industry values, 0.0000% worst disagreement between SAGDP1 and SAGDP2), USDA ERS land use, and USGS MRDS (304,632 features, 51 of 51 states matched). Sections: 6 sides transcribed from FACTIONS.md sections 4.1 to 4.6 and matched to FIPS; 30 ratings computed across 6 sides x 5 dimensions, 7 match the FACTIONS.md section 3 design target and 23 differ, left as computed rather than adjusted. Routes: 137,315 road and rail segments imported but 0 settlement-to-settlement edges built, because no line snapped to a settlement at either end within 20 km. Terrain: 12 SRTM tiles, elevation sampled at 3,751 of 13,181 settlements. Seed: 13,189 settlements initialised holding 209,446,544 people (132 city, 1,187 town, 11,870 village). Spot check: 36 settlements checked against published 2020 census figures, 15 agree within 1.00%, 1 disagrees, 20 unverified (`services/world-data/docs/SPOT_CHECK.md`). Published 11 tables totalling 195,942 rows as JSONL.GZ plus Parquet: settlements 13,189, route_segments 137,315, place_boundaries 32,037, terrain_samples 13,181, state_profiles 51, state_boundaries 51, ports 81, sections 6, section_ratings 30, routes 0, regions 1. Schema written to `schema/world_data.schema.json` and `dist/schema.json`; manifest of 23 datasets with 5 declared gaps written to `dist/MANIFEST.json`, `docs/DATA_MANIFEST.md`, and `docs/DATA_NOTES.md`. Run record in `services/world-data/docs/PIPELINE_RUN.md`. |
| 2026-09-30 | Setup | Restore missing governance docs | Wrote `CONSTITUTION.md` and `ASSETS.md`, the two files every other document depends on but which were absent. Unblocks any agent starting Phase 0, which previously hit dead references in 18 files. |
| 2026-09-30 | Setup | Version control baseline | `git init` plus a first commit of the 24 design docs and a `.gitignore` covering macOS junk, Node, Python, Go, local databases, and `.env` files. Gives parallel agents something to branch from. |

---

## UNRESOLVED

Format: `YYYY-MM-DD | Area | Problem | Steps to reproduce | Why it is unresolved | Next step |

| Date | Area | Problem | Steps to reproduce | Why it is unresolved | Next step |
|---|---|---|---|---|---|
| 2026-09-30 | World data - spot check | Spot-check reference parser reads the wrong number out of a valid reference summary, so a parse artefact is recorded as a published figure. Boston city, Massachusetts carries a published 2020 census figure of `125` against a pipeline base of 678,617, a 542,793.600% difference, verdict **disagree** (`services/world-data/docs/SPOT_CHECK.md`). The real published Boston count is about 675,247, so the pipeline value is fine and the parser is wrong. Cause is in `services/world-data/src/worlddata/spotcheck.py`: `_extract_census_population` returns the *first* qualifying number in the first sentence that names a census year and has a headcount word within 40 characters, with no scale check against the pipeline value, so an unrelated small figure wins over the population. | Re-run the stage and read the row: `cd services/world-data && python -m worlddata run --skip-fetch --skip-postgres`, then look at the Boston row in `docs/SPOT_CHECK.md`. Or call the parser alone with no pipeline run: `python -c "import requests; from worlddata.spotcheck import _extract_census_population, CHECK_SOURCE_TEMPLATE as T; t = requests.get(T.format(title='Boston,_Massachusetts'), headers={'User-Agent': 'world-data-pipeline/1.0 (+CONSTITUTION.md 1.1 real data only)'}).json()['extract']; print(_extract_census_population(t))"` and observe the returned headcount is 125. | Needs a code change in the spot-check parser, which is not this lane's file. The fix is to take the largest plausible headcount in a qualifying sentence rather than the first, and to reject a reference figure orders of magnitude from the pipeline value as a parse failure (`unverified`) rather than a data disagreement. The pipeline behaved correctly by reporting it instead of hiding it, but Phase 0 cannot be signed off until it is fixed, because a spot check with a known-wrong parser is not evidence. | Fix `_extract_census_population`, re-run spot_check, confirm Boston reads within 1.00%, and confirm no other row changes verdict. Do not hand-edit `docs/SPOT_CHECK.md`; it is generated by the run. |
| 2026-09-30 | World data - spot check | HTTP 429 rate limiting left 14 of 36 spot-check rows **unverified** with no independent comparison at all. Affected rows in `services/world-data/docs/SPOT_CHECK.md`: Fort Worth, Oklahoma City, Phoenix, Tucson, Mesa, Los Angeles, San Diego, San Francisco, Seattle, Portland, Charlotte, Louisville/Jefferson County metro government, Nashville-Davidson metropolitan government, Atlanta. The pipeline-side values are present and correct for all of them; only the reference fetch failed. Cause is in `services/world-data/src/worlddata/spotcheck.py`: the inter-request wait is `time.sleep(0.0)`, which throttles nothing, so 36 requests go out back to back at the same User-Agent with no retry and no `Retry-After` handling. The remaining 6 unverified rows (New York, Washington, Indianapolis, Albuquerque, San Jose, Jacksonville) are a different gap - a reachable summary that simply carries no 2020 census figure - and are not rate limiting. | Reproduce the rate limit directly: `for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" "https://en.wikipedia.org/api/rest_v1/page/summary/Phoenix,_Arizona"; done` returns 429 partway through. To reproduce inside the pipeline: `cd services/world-data && python -m worlddata run --skip-fetch --skip-postgres` with an empty spot-check cache and watch for `reference source unreachable: HTTP 429 Too Many Requests` in the spot-check notes. | Needs a code change plus a cache, both outside this lane. Without a delay the run depends on the endpoint's tolerance of 36 back-to-back anonymous requests, which is not something the pipeline controls and which varies by time of day and by IP. The rows were reported rather than dropped, which is right, but they are still unverified. | Add a real inter-request delay and retry with backoff that honours `Retry-After`, cache each fetched reference figure so re-runs do not refetch, and make the User-Agent conform to the Wikimedia policy (descriptive plus a contact). Then re-run spot_check and drive unverified to zero or to an explained remainder. |
| 2026-09-30 | Process - TASKS.md | TASKS.md Phase 0 still shows all 15 checkboxes unticked (TASKS.md lines 8-22) even though the pipeline run finished most of that work, so the checklist no longer describes reality in either direction. Done by this run: settlement import, classification logic from real population thresholds, seed-value logic, import for all 50 states plus D.C. with section assignment, state profiles from real Census/BEA/USDA/USGS data, section rating verification against FACTIONS.md section 3, and the spot check. Not done: the Postgres schema and load was skipped (`--skip-postgres`, `docs/PIPELINE_RUN.md` line "postgres: Postgres load skipped"); the V1 region choice is not recorded in the DECISIONS section above; the checkbox-named sources were not the ones used (Census TIGER/estimates for roads and settlements rather than an OpenStreetMap extract, Census plus Natural Earth for boundaries rather than Natural Earth or geoBoundaries alone, Census rather than GeoNames or SimpleMaps for population, USGS SRTM rather than a named public DEM for elevation); and the first playable slice is still undefined. | Open TASKS.md lines 8-22 and compare against `services/world-data/docs/PIPELINE_RUN.md`, `services/world-data/docs/SPOT_CHECK.md`, and the BUILT entry above. Every box is unchecked while the run record shows the work completed. | TASKS.md is not this lane's writable file, and several boxes cannot honestly be ticked as written because the run used different sources than the boxes name and the database load never ran. Ticking them would assert a source and a load that did not happen, which is worse than an unticked box. | The TASKS.md owner walks the 15 boxes against the run record, ticks what is genuinely done, rewrites the source-specific boxes to name the sources actually used, and closes the two real gaps: record the V1 region decision in the DECISIONS section above, and run the Postgres load once without `--skip-postgres`. Reconcile only after the two spot-check bugs above are fixed, so the exit criteria are judged on clean numbers. |

---

## GENERATION COST

Format: `YYYY-MM-DD | Batch | Items generated | Tokens in | Tokens out | Notes`

(no entries yet)

---

## PERFORMANCE RESULTS

Format: `YYYY-MM-DD | Build | Test | Hardware | Result | Target | Pass or fail`

(no entries yet)

---

## DATA NOTES

Missing or substituted data, and where each dataset came from.

Format: `YYYY-MM-DD | Dataset | Source | Version or date | Gaps | Handling`

| Date | Dataset | Source | Version or date | Gaps | Handling |
|---|---|---|---|---|---|
| 2026-09-30 | 3D model source availability | External check | Verified 2026-09-30 | Epic Games acquired Sketchfab and closed the Sketchfab Store, migrating it to Fab. Epic announced free downloadable content would stop being supported on Sketchfab during 2025, with downloads becoming unavailable as part of the migration. The site now operates under a different company name. | `ASSETS.md` section 1 names Sketchfab as a primary source and must be re-verified before Phase 3. Additional CC0 sources (Kenney, Poly Haven, Quaternius) added as safer alternatives. See `ASSETS.md` section 1.1. |
| 2026-09-30 | Cloudflare compute and database capabilities | External check | Verified 2026-09-30 | Go is not natively supported on Cloudflare Workers or Pages, only via WebAssembly, and Go compiled to `js/wasm` cannot open TCP sockets. Cloudflare does not host Postgres. | Recorded as an open conflict in the Decisions section above and in `CONSTITUTION.md` section 4.1. No stack change made without an explicit decision. |
