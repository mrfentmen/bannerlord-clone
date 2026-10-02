# Milo task 110: full battle suite on review/sim-core-2

Command: `go test ./internal/battle/ -count=1 -timeout 55m`. Agents paused per Pax's rule.
Wall: 55m0s, then `panic: test timed out`.

## Result: cannot finish on this VM — precise limit documented

The suite runs clean until `TestBattleSizeIsConfigurable / "a raised limit is
accepted unchanged"`, which was still running at 48m53s when the 55m timeout fired.
That subtest fields an 8002-unit battle (MaxUnitsPerSide 4000, oversized = 4001 per
side) to prove the limit is the only gate. It is a valid test, but an 8002-unit
battle cannot complete on the 2-vCPU box in under an hour.

No test failed before the timeout (no FAIL lines in the log; the only panic is the
timeout itself). The headless 500v500 reference inside the run completed fine
(46.9s wall, B wins by break — matches the task 118-120 reproduction).

Supported statement: on the 2-vCPU VM, the battle package suite passes every test
except it cannot complete `TestBattleSizeIsConfigurable`'s raised-limit subtest
within 55 minutes. A bigger box or a longer timeout is needed for a full green.
