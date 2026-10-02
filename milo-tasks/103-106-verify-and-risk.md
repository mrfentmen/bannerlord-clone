# Tasks 103-106 — Milo's own verification runs + hot-path merge-risk map

Executed by Milo 2026-10-02 on branch milo/tasks-101-200 (at 6a5a8a3 + task commits).

## Task 103 — agent2 replay commits, verified by my own runs

`go test ./internal/replay/ -run 'TestTheFormatDocument|TestAPlayersOrdersSurviveTheLogAndTheReplay' -count=1`
Result: ok, 6.440s. Covers commits 0c1ca16 (format-doc freshness) and 957a18d
(player orders survive the log). VERIFIED.

## Task 104 — agent3 formation commits, verified by my own runs

`go test ./internal/battle/ -run 'TestSessionFormationOrdersReachTheField|TestAFollowerKeepsUpWithTheGroupItFollows|TestEveryCarriedOrderReachesTheFieldOnItsOwn' -count=1`
Result: ok, 2.366s. Covers commits b0e1f21 (follow order) and 3ca6483 (hold drift).
VERIFIED.

## Task 105 — agent4 morale commits, verified by my own runs

`go test ./internal/battle/ -run 'TestCasualtySeenIsAShareNotACount|TestBreakRoutRallyCycleHappens|TestRoutedUnitsLeaveTheField|TestNoUnitStaysBroken' -count=1`
Result: ok, 12.794s. Covers commits fb57a1c (casualty term) and 661a021
(break/rout/rally cycle). VERIFIED.

## Task 106 — hot-path merge-risk map (commits since b73b7dd)

| File | Commits touching it | Risk |
|------|--------------------|------|
| internal/battle/grid.go | 3409424 (agent1) | LOW. Single owner (agent1), hash-diff in task 102 proved zero behavior change. |
| internal/battle/targeting.go | none | NONE. Untouched since b73b7dd. |
| internal/battle/battle.go | 3409424 (agent1) | LOW. Same commit as grid.go; +6 lines only; covered by task 102 hash-diff. |
| internal/battle/morale.go | 3409424 (agent1), fb57a1c (agent4) | MEDIUM. Two agents touched the same file. 3409424's hunk (+213/-?) is the grid-walk ID fix verified behavior-neutral in task 102; fb57a1c's hunk (+28/-1) is the casualty-term fix verified by TestCasualtySeenIsAShareNotACount above. The hunks touch different functions (walk vs casualty term) — no textual overlap. Chunk integration must keep both hunks. |
| internal/battle/aimedfire.go | 6a5a8a3 (agent4) | LOW. Single commit, +33/-7, scoped to the section-6 mechanic per task 102 inspection. |
| internal/battle/formation.go | 3ca6483 (agent2), b0e1f21 (agent3) | MEDIUM. Two agents, two commits, both behavior-changing and both verified above. Different areas (hold-drift vs follow order); sequential commits so git already ordered them. Chunk integration keeps both in order. |

No file has three or more touching commits. No commit pairs show textual hunk overlap.
The two MEDIUM files need eyes-on diff review during task 107 chunk assembly, nothing more.

Proof: `git log --oneline b73b7dd..worker/milo/simulation -- <file>` per file, run
2026-10-02; test outputs captured above. Branch: milo/tasks-101-200.
