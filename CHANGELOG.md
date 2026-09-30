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
| 2026-09-30 | Setup | Restore missing governance docs | Wrote `CONSTITUTION.md` and `ASSETS.md`, the two files every other document depends on but which were absent. Unblocks any agent starting Phase 0, which previously hit dead references in 18 files. |
| 2026-09-30 | Setup | Version control baseline | `git init` plus a first commit of the 24 design docs and a `.gitignore` covering macOS junk, Node, Python, Go, local databases, and `.env` files. Gives parallel agents something to branch from. |

---

## UNRESOLVED

Format: `YYYY-MM-DD | Area | Problem | Steps to reproduce | Why it is unresolved | Next step`

(no entries yet)

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
