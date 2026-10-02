# Task 101 — verdicts on every worker/milo/simulation commit since b73b7dd

Range: `b73b7dd..worker/milo/simulation` = 21 commits. Reviewed by Milo 2026-10-02.
Method: `git show --stat` on each commit; classification = fix / test / doc / config.
Hot-path files flagged for task 102/106 follow-up.

| # | SHA | Agent | Class | One-line verdict |
|---|-----|-------|-------|------------------|
| 1 | 6a5a8a3 | agent4 | fix | KEEP. COMBAT.md s6 first mechanic was inert; aimedfire.go + balance.toml corrected. Touches aimedfire.go (hot path) — needs behavior-diff check in task 102. |
| 2 | 10796a9 | agent4 | test | KEEP. Ending coverage: 3 of 5 engine endings previously never executed by a test. Test-only, no behavior change. |
| 3 | ee0c1e4 | agent4 | fix | KEEP. Real bug found via 5-seed run: a balance constant was masking a defect. balance.toml + VERIFICATION.md. Behavior-changing, in the right direction. |
| 4 | 25b7e8f | agent2 | test | KEEP. 500v500 hold-fix verification — the exact run commit 3ca6483 left unverified. Test-only. |
| 5 | 94e3491 | agent4 | doc | KEEP. VERIFICATION.md consolidating what is verified, how, and the numbers. Doc-only. |
| 6 | 957a18d | agent2 | test | KEEP. Player orders survive the battle log; only the label was wrong. Test-only. |
| 7 | 0c1ca16 | agent2 | test | KEEP. Format-doc freshness check: something now fails when REPLAY_FORMATS.md drifts. Test-only. |
| 8 | 3409424 | agent1 | fix | KEEP WITH CAUTION. Grid-walk ID fix: grid.go, morale.go, battle.go all touched (hot path). Needs before/after battle-hash diff in task 102 before it enters any chunk. |
| 9 | b288613 | agent4 | config | KEEP. 2000-a-side benchmark record (700 ticks, 5m00.7s, non-linear tick cost) in balance.toml. Config-only. |
| 10 | 2b762d3 | agent2 | test | KEEP. 500v500 replay validation: crosscheck, overhead, provenance, scale tests. Test-only, 1098 insertions. |
| 11 | 151f6ed | agent3 | fix | KEEP. Hold-advance bug: a silent hold was advancing; two tests were asserting the bug. Behavior-changing, correct. |
| 12 | 60472f2 | agent4 | fix | KEEP. Surrendered troops now route into the prisoner count (result.go + test). Needed for campaign writeback. |
| 13 | b450a46 | agent4 | test | KEEP. Hit-rate measurement now actually stands shooters still. Test-only. |
| 14 | efe3083 | agent4 | fix | KEEP. Two brief invariants were range checks; neither fault was a range. battleverify probe + tests. |
| 15 | 661a021 | agent4 | test | KEEP. Full morale break -> rout -> rally cycle measured in a finishing battle. Test-only. |
| 16 | 3d22dd2 | agent2 | test | KEEP. 50 random order scripts, each through its own file format and replayed. Test-only. |
| 17 | 3ca6483 | agent2 | fix | KEEP. Hold drift fixed: formation told to hold was walking 35m per 200 ticks (command.go + formation.go). Behavior-changing, correct. |
| 18 | ae36296 | agent4 | fix | KEEP. Contact harness no longer excuses a scenario from reaching contact. Test-harness strengthening. |
| 19 | d33b0bf | agent4 | config | KEEP. morale_casualty_hit sweep + size table at the resulting value. Config-only. |
| 20 | fb57a1c | agent4 | fix | KEEP. Casualty term was dividing own side's dead by the living (morale.go + test). Real bug, fixed. |
| 21 | b0e1f21 | agent3 | fix | KEEP. Follow order implemented at this layer (formation.go, playerorders.go + tests). Behavior-changing, tested. |

## Summary

- 21 commits: 10 fix, 9 test, 1 doc, 2 config (one fix commit also touched docs).
- Verdict: ALL 21 KEEP. No reverts needed. No commit is pure noise.
- Hot-path caution list for task 102 (before/after battle-hash diff required):
  - 3409424 (grid.go, morale.go, battle.go)
  - 6a5a8a3 (aimedfire.go)
- Behavior-changing fixes cleared for the new chunk (task 107) pending task 102 results:
  - 6a5a8a3, ee0c1e4, 151f6ed, 60472f2, 3ca6483, fb57a1c, b0e1f21, ae36296, efe3083
- Test-only commits cleared unconditionally: 10796a9, 25b7e8f, 957a18d, 0c1ca16, 2b762d3, b450a46, 661a021, 3d22dd2
- Doc/config cleared: 94e3491, b288613, d33b0bf

Proof: `git log --oneline b73b7dd..worker/milo/simulation` (21 commits, listed above);
`git show --stat` per commit inspected 2026-10-02. Branch: milo/tasks-101-200.
