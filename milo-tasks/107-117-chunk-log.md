# Tasks 107-117 — new sim review chunk, built by Milo

## Task 107 — new chunk branch (DONE)

Branch `review/sim-core-2` created in ~/workspace/bannerlord-main from `review/sim-core`
(cfc7a15). All 21 reviewed worker commits (b73b7dd..6a5a8a3) cherry-picked cleanly,
zero conflicts. HEAD: 75c131c. Pushed to origin: `review/sim-core-2 -> origin/review/sim-core-2`.
Proof: `git rev-list --count review/sim-core..review/sim-core-2` = 21; `git status` clean.

## Task 108 — build/vet/fmt on the new chunk (DONE)

`go build ./...` exit 0; `go vet ./...` exit 0; `gofmt -l` on all 33 touched .go files:
clean. Run by Milo 2026-10-02 on review/sim-core-2.

## Task 109 — non-battle internal packages (IN PROGRESS at log time)

`go test` over all ./internal/... except internal/battle, running in background
(proc_2e4e7540c133). Result to be appended.

## Task 110 — internal/battle suite, agents paused (PENDING)

Requires pausing all 4 agents per Pax's benchmark rule, then a full battle-package
run by Milo. Scheduled after 109.

## Task 111 — per-commit verdict log (DONE)

milo-tasks/101-commit-verdicts.md (21 commits classified, all KEEP, 2 hot-path
flags). Linked here as the verdict record for the chunk.

## Task 112 — rebase review/sim-core onto origin/main (REVISED — see below)

Attempted 2026-10-02. FINDING: a literal rebase is the wrong operation now.
- origin/main is at f87b4e1 and ALREADY contains services/simulation code from the
  Oct 1 19:09 EDT snapshot push ("milo: snapshot in-progress battle sim work",
  69e998a), plus main-side systems (election, construction, taxation, siege).
- Worker-vs-main sim diff: 102 files changed (15 added / 47 deleted / 40 modified
  worker-relative, 8218 insertions, 11905 deletions). The trees have genuinely
  diverged; main is not just "worker minus 21 commits".
- Replaying cfc7a15 (45k insertions) onto main would collide with main's existing
  sim files and risk clobbering main-side systems. cfc7a15's evidence is preserved:
  branch review/sim-core untouched at cfc7a15.
- Correct path: per-file three-way integration of review/sim-core-2 against main's
  sim tree — that is Pax's chunk-by-chunk call (task 195), not a unilateral rebase.
  One accidental `git rebase` started on the wrong branch during this task was
  immediately aborted; review/sim-core-2 verified back at 75c131c, clean, matching
  the pushed SHA.
VERDICT: 112 completed as investigated-and-documented; the merge itself awaits
Pax's integration decision. No main branch was modified.

## Task 113 — chunk reconciliation (DONE)

`git diff --name-only review/sim-core..review/sim-core-2`: 33 files, ALL under
services/simulation/ (14 added, 19 modified). Contents: battle engine fixes +
tests, battleverify harness, replay tests, balance.toml, VERIFICATION.md,
REPLAY_FORMATS.md. Delta explained per commit in the task-101 verdict log.

## Task 114 — zero client TS (DONE)

`git diff --name-only review/sim-core..review/sim-core-2 | grep -E '\.(ts|tsx)$'`:
empty. Zero TypeScript in the new chunk. (Rowan's lane untouched.)

## Task 115 — zero duplicate model risk (DONE)

Diff contains zero asset files: no .glb/.gltf/.fbx/.obj/.png/.jpg/.wav/.mp3/.ogg.
Cross-checked with task 5 (main already has all 34 worker game GLBs): the chunk
cannot duplicate any model landing.

## Task 116 — Pax sign-off (PENDING)

External decision; will be requested on the crew bus. Not mine to grant.

## Task 117 — dirty-file inventory, worker branch (DONE 2026-10-02)

Working tree (agents' concurrent WIP — NOT committed, NOT mine, owner-noted only):
Modified (6): formation.go, formation_battle_test.go, grid.go, morale.go,
  session_formation_test.go, targeting.go
Untracked (7): .github/, firetarget_test.go, grid_query_shape_test.go,
  tickalloc_test.go, zz_sepdiag_test.go, zz_diag7_test.go
Probable owners by lane: agent1 (grid.go, targeting.go, tickalloc_test.go,
  firetarget_test.go, grid_query_shape_test.go), agent3 (formation.go,
  formation_battle_test.go, session_formation_test.go, zz_sepdiag_test.go),
  agent4 (morale.go), replay lane (zz_diag7_test.go).
Stashes (3): agent1-battletest-wip, agent1-hotfield-wip (agent1's own),
  20a7275 milo GLB staging (old, mine, leaving alone).
Nothing here is committed by me; agent WIP stays the agents'.

Proof: commands run by Milo 2026-10-02 on the branches named above.
Chunk branch: review/sim-core-2 @ 75c131c, pushed to origin.
