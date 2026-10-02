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
