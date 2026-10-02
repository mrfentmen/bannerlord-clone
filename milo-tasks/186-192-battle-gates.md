# Milo tasks 186-192: battle verification gates

## Task 186: full battle suite final verdict
Documented limit (task 110): suite passes all tests except
TestBattleSizeIsConfigurable's 8002-unit subtest, which exceeds the 55m timeout
on the 2-vCPU VM. No failures, only the timeout. Wall: 55m0s.

## Task 187: slowest tests
The 8002-unit subtest is the slowest by far (48m53s before timeout). Next:
1200v1200 reference (4m10s), 500v500 reference (44s). No other test exceeds 5m.

## Task 188: battle report format
Confirmed: prints ticks, winner, both casualty counts. Sample (1200v1200):
"ticks 1910 of 20000 max... winner A, by rout... side A: dead 270 wounded 630
casualties 900... side B: dead 276 wounded 643 casualties 919"

## Task 189: stalemate detection
TestStalemateTimeout passes (0.02s). Stalemate fires before MaxTicks.

## Task 190: fuzz invariants
60s fuzz run: PASS, no invariant violations (no negative casualties, no
resurrected units).

## Task 191: prisoner writeback — GAP FOUND
Battle results track Surrendered (1200v1200: 15 and 19 units). But the campaign
apiserver has ZERO references to Surrendered — the prisoner system does not
consume battle surrenders. Surrendered troops do NOT land in the prisoner count.
This is a campaign-writeback feature gap, not a sim bug.

## Task 192: battleverify
Confirmed: reports contact distance ("closest two units... 0.1 m, against a
battle.melee_range of 2.6 m") and outcome ("winner A, by rout") for scenarios.

## CORRECTION 2026-10-02 (task 191 prisoner finding was incomplete)

The task 191 finding above was made by searching the milo/tasks-101-200
branch, which does NOT contain the campaign apiserver package
(services/simulation/cmd/apiserver exists only on main and milo/save-load).
The claim "the campaign apiserver has ZERO references to Surrendered" is
true of that branch but misleading as a project-wide statement.

What main actually has (verified 2026-10-02):
- services/simulation/cmd/apiserver/campaign/prisoners.go: a full prisoner
  system (ranks, ransom values, loyalty, capture/recruit/release/execute).
- captureFromBattleLocked() is called from ResolveEncounter (battle.go:197,200)
  and EndBattle (battle.go:338,341) when the PLAYER wins. Auto-resolve takes
  prisoners; my task 126-128 note "capture runs on live battle wins" was wrong
  about auto-resolve.
- Rowan's commit 36726d0 ("capture prisoners on ResolveEncounter/EndBattle")
  is mostly comment-stripping/reformatting; the prisoner logic it names lives
  in prisoners.go, not in that diff.

The REAL gap (still open on main):
- The apiserver's live-battle path (SubmitBattleOrders/EndBattle) is a toy
  power-arithmetic model. It never imports or invokes internal/battle.
  SubmitBattleOrders does troop-count arithmetic per order tick; EndBattle
  compares wire-level troop counts. The real battle sim's SideResult.Surrendered
  counts never reach prisoner capture — captureFromBattleLocked takes a flat
  15-45% of survivors instead of the sim's actual surrender numbers.
- Only player victories produce prisoners; AI-vs-AI surrenders vanish.
- Wiring the real battle sim into the campaign apiserver is an integration
  decision: it is the same question as task 116 (Pax's chunk-by-chunk
  integration ruling). Flagged to Pax on the bus 2026-10-02; not fixed
  unilaterally.
