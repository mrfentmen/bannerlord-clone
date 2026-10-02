# Milo tasks 122-125: authoritative save/load — implementation + live proof

Branch: `milo/save-load` (from origin/main f87b4e1), pushed to GitHub.
Commits: 77c3941 (task 122), 6475383 (tasks 123-125).

## What was built

- `internal/model/save.go`: `MarshalJSON`/`UnmarshalJSON` on `model.State`.
  Versioned `mbclone-save` JSON, Pair maps as "A:B" keys, nil maps never
  serialize as null, pair caches rebuild lazily. Unknown versions and
  malformed/denormalized pair keys are hard errors.
- `internal/model/save_test.go`: 5 tests, all pass (round trip full, round
  trip empty, reject unknown version, reject bad pair key, reject wrong format).
- `internal/rng`: `State()`/`SetState()` for the splitmix64 stream.
- `internal/sim`: `Engine.Seed()`, `RNGState()`, `RestoreRNGState()`.
- `internal/cause`: `Log.Export()`/`Log.Import()` (rows + counters; indexes rebuilt).
- `internal/systems/bandit`: `SnapshotRuntime()`/`RestoreRuntime()` — the only
  sim state that lived outside model.State (package-global camps/bounties).
- `cmd/apiserver/campaign/save.go`: `Campaign.Save()` / `Campaign.Load()`.
  Captures world, RNG, cause log, bandits, prisoners, companions, roster,
  character, market history, notifications, encounters/battles, clock.
  Refuses when orders are queued (fail-loud beats silent drop).
- `POST /v1/save`, `POST /v1/load`, `POST /v1/step-days` (deterministic day stepping).
- `-load-file` (boot restore), `-save-file` (shutdown save).

## Live proof (2026-10-02, seed 7)

1. Save at day 14.
2. Step exactly 20 days -> day 34. Save B.
3. Load day-14 save -> back to day 14.
4. Step exactly 20 days -> day 34. Save C.
5. `cmp saveB saveC` -> BYTE IDENTICAL.

- `-load-file`: server booted with seed 99, restored the seed-7 save, reported day 14. Works.
- `-save-file`: SIGTERM after stepping to day 19 wrote a 21MB save at day 19. Works.

One real bug found by the proof: companion tavernCache serialized as null on
snapshot but {} after restore (nil vs empty map). Fixed by normalizing snapshot
output; the byte-identical result above is after the fix.

## Pre-existing main-line build breaks fixed (drive-by, required to compile)

- `internal/systems/bandit/bandit.go`: unused `fmt` import (main did not build).
- `cmd/apiserver/campaign/prisoners.go`: referenced `c.prisoners`/`c.companions`
  struct fields that do not exist; converted to the package-level state pattern
  from f898cd1 (same as companions.go).
- `go fmt` realigned whitespace in 9 untouched files (actions, battle, march,
  notifications, recruit, snapshot, trade, wire/battle, wire/orders). Verified
  whitespace-only: stripped +/- lines are identical. No semantic change.

## Notes for Pax

- Save files are ~17-21MB (cause log dominates). Fine for now; compression later.
- The prisoners fix touches Rowan-adjacent code (prisoner ransom/recruit routes);
  behavior preserved, only the state storage moved to package level.
- `POST /v1/step-days` is also useful for Rowan's testing.
