# Density split: sim vs client (tasks 157-159)

## Task 157: city demo pedestrian density
`clients/campaign/src/scene/cityDemo.ts:45`: `CROWD_DEFAULT = 24`.
Adjustable at runtime via `?crowd=<n>` (0-150). This is a CLIENT render setting
(Rowan's lane) — how many pedestrians the city demo draws. It does not affect the
simulation.

## Task 158: formation density controls (sim side, wired)
`services/simulation/config/balance.toml`, BATTLE FORMATIONS section:
- `front_spacing = 1.5` (metres between neighbours in the front rank)
- `rank_spacing = 2.0` (metres between ranks)
- `loose_spacing = 7.0` (metres between neighbours in loose order)
- `min_separation = 1.2` (hard floor; separation solver pushes units apart)
- `separation_iterations = 3`, `separation_push_fraction = 0.4`, `separation_push_max = 0.5`

These are SIM knobs — they change battle geometry and therefore battle outcomes.
The client crowd setting changes nothing in the sim.

## Task 159: release-notes entry
"The sim owns battle density (front/rank/loose spacing, min separation — all in
balance.toml, all affecting outcomes). The client owns render density (city demo
crowd count, default 24, `?crowd=` override — affects only how many pedestrians
are drawn). Changing the client crowd setting never changes a battle result."
