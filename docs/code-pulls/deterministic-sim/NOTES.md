# deterministic-sim — NOTES (design reference only)

Source: `amsminn/gpt-6-astra-smash-karts`, `game/game/simulation.ts`
(931 lines). **No license detected — code is NOT copied here.** These
are my own notes on the architecture. Reimplement, don't copy.

## The pattern

A `GameRoom` class owns the entire authoritative state: players map,
projectiles, events, item boxes, tick counter, elapsed time. The
renderer is a separate module (`renderer.ts`) that only reads
snapshots. This is the same separation our Go sim uses — worth
studying as a second opinion.

Key design points:

- **Fixed tick:** `TICK_RATE = 30`. All gameplay advances in `tick()`;
  rendering interpolates between snapshots. Deterministic given the
  same input stream.
- **Injectable RNG:** `random: () => number` constructor parameter,
  defaulting to `Math.random`. For lockstep, inject a seeded PRNG —
  the seam is already there, which is the elegant part.
- **Input sanitization:** `sanitizeInput()` clamps/validates every
  client input before it touches state. Untrusted input never reaches
  the sim raw. Our Go server should do the same at the API boundary.
- **Phase machine:** `countdown → playing → results` derived from
  `elapsed` against constants — no boolean soup.
- **Bots as first-class players:** `addPlayer(id, name, color, bot)`
  — bots are just players with `bot: true`; the AI writes into the
  same `input` struct a network player would. Clean way to mix AI and
  human drivers.
- **Spawn selection:** picks the spawn point maximizing minimum
  distance to live players (`clear: Math.min(...)` over players).
  Simple, fair, no spawn camping.
- **Player state is flat data:** x/y/z, angle, speed, vy, hp, weapon,
  ammo, cooldown, shield, respawn timer — no methods, trivially
  serializable for snapshots and replays.

## Relevance to bannerlord-clone

Our authoritative sim is Go, not TS, but the structural lessons
transfer: fixed tick + snapshot interpolation, sanitized inputs at
the boundary, injectable RNG for determinism, flat serializable
state, bots writing into the same input channel as players.
