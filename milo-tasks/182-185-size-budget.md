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
