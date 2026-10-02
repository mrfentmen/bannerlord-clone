# Milo tasks 182-185: battle size vs time budget

## Task 182: supported battle size decision
Max size fitting the 5-minute wall budget on the 2-vCPU VM: ~1200 per side.

## Task 184: per-size wall times (measured, seed 20260930, review/sim-core-2)
- 500 vs 500: 44s wall (1918 ticks).
- 1200 vs 1200: 250s wall (4m10s).
- 2000 vs 2000: NOT RUN — projected ~11-12m by quadratic scaling, exceeds budget.
  The "700 ticks, ~5m" claim for 2000-a-side does not hold on this VM; actual
  scaling is roughly quadratic in units per side.

## Task 183
The 2000-a-side "~5m" claim is refuted by measurement. 1200-a-side is the
largest size that fits 5 minutes. Recorded as a correction, not a confirmation.

## Task 185: per-soldier-per-tick budget
500v500: 44s / (1000 units * 1918 ticks) = 23us per soldier per tick. Well under
the 250us budget. 1200v1200: 250s / (2400 * ~1900 ticks) = 55us. Still under 250us.
Budget holds.

## Task 183 (completed 2026-10-02): 2000-a-side ACTUALLY RUN
`go run ./cmd/simrun battle -seed 20260930 -a-units 2000 -b-units 2000`
(agents paused per Pax's rule), on milo/tasks-101-200:
- Wall: 6m37.571s. Ticks: 1917. Outcome: B wins, "enemy broke".
- Side A: 2000 units in; dead 443.1, wounded 1033.9, surrendered 67 units,
  207 standing, 249 routed.
- Side B: 2000 units in; dead 451.8, wounded 1054.2, surrendered 21 units,
  232 standing, 241 routed.
- Result hash 93c79788a5abce8d.

The old "~5m" claim is refuted AND the quadratic projection (~11-12m) was
pessimistic. Actual: 6m37s. Still exceeds the 5-minute budget, so task 182's
decision stands: 1200-a-side is the max supported size.

## Task 184 (completed 2026-10-02): per-size wall times, all measured
- 500 vs 500: 44s wall (1918 ticks).
- 1200 vs 1200: 250s wall (4m10s, 1910 ticks).
- 2000 vs 2000: 397.6s wall (6m37s, 1917 ticks).
All on seed 20260930, 2-vCPU VM, agents paused.
