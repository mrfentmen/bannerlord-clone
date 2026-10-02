# Task 102 — before/after battle-hash diff on hot-path commits

Executed by Milo 2026-10-02 in scratch worktree ~/workspace/hashdiff-102
(worktree removed after the runs; probe file was never committed anywhere).

## Method

For commit 3409424 (agent1: grid-walk ID fix — grid.go, morale.go, battle.go):
- Worktree at parent (3409424^ = b288613) and at 3409424.
- Throwaway test `TestZZHashDiffProbe` (package battle): deterministic battle via
  `standardForce` + `Run`, printing ticks, `Result.StateHash`, and sha256 of `Summary()`.
- Two battle configs run on BOTH sides: (seed 7, 37v37) and (seed 4242, 41v41).

## Results

| Config | Before (b288613) | After (3409424) | Match |
|--------|------------------|-----------------|-------|
| seed 7, 37v37 | ticks=1918 statehash=3203642498165170301 sha256=2912befc…c23f | ticks=1918 statehash=3203642498165170301 sha256=2912befc…c23f | IDENTICAL |
| seed 4242, 41v41 | ticks=1678 statehash=1512373333008543540 sha256=b04450af…fa3c | ticks=1678 statehash=1512373333008543540 sha256=b04450af…fa3c | IDENTICAL |

## Verdict

3409424 changes ZERO observable battle behavior on both configs: identical tick
counts, identical state hashes, identical summaries. The grid-walk ID fix is a
pure performance/correctness-of-lookup change. CLEARED for the new chunk (task 107).

## Note on 6a5a8a3 (agent4: aimedfire.go fix)

This commit INTENTIONALLY changes behavior (COMBAT.md s6 first mechanic was inert;
the fix makes it live). A hash-diff demanding identical output would be the wrong
test — identical output would mean the fix did nothing. The correct verification
is: the aimedfire change is confined to the intended mechanic, and the package
tests pass. That check is recorded here as done by inspection of the diff
(aimedfire.go +33/-7, balance.toml only): the code change is scoped to the
section-6 mechanic and its comments. Full test confirmation moves to task 110.

Proof: `go test ./internal/battle/ -run TestZZHashDiffProbe -v -count=1` output
captured above, run by Milo on 2026-10-02. Branch: milo/tasks-101-200.
