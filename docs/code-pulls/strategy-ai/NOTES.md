# strategy-ai — NOTES (design reference only)

Source: `Toribash67/sengoku_jidai`, `packages/ai/` (TypeScript, ~301
files in repo). **No license detected — code is NOT copied here.**
These are my own notes on the architecture. Reimplement, don't copy.

## The AI stack

A full game-AI toolkit for a turn-based strategy game, layered by
cost:

- `bots/random.ts`, `bots/greedy.ts` — baseline bots. Always build
  the dumb bots first; they're the test harness for the smart ones.
- `bots/alphabeta.ts` + `alphabeta.worker.ts` — alpha-beta search
  over commands, run in a Web Worker so the UI never blocks.
  `alphaBetaCommand(state, ...)` is the entry point.
- `ismcts.ts` + `ismcts.worker.ts` — Information Set MCTS for
  **imperfect information** (hidden enemy positions/intentions).
  `chooseCommandIsmcts(state, seat, opts)`. This is the algorithm
  for "the enemy army is somewhere, but I can't see it."
- `determinize.ts` — `determinize(state, seat, rng)`: samples one
  plausible world consistent with what the seat can observe, then
  runs perfect-information search on it. The standard trick that
  makes ISMCTS work.
- `eval.ts` — `evaluate(state)` with `EvalWeights`: a weighted
  linear evaluation (material, position, economy...). Weights are
  data, not code — tunable without recompiling.
- `combatOdds.ts` — `rollTotalDistribution(...)`: exact probability
  distributions for dice-based combat resolution. No Monte Carlo
  needed when you can compute the distribution directly.
- `candidates.ts`, `heuristics.ts`, `geometry.ts`, `onclock.ts`,
  `rng.ts` — move generation, search heuristics, map math, time
  management (stop searching when the clock runs out), seeded RNG.

## Relevance to bannerlord-clone

This is the blueprint for our faction AI. The layering is the
lesson: random → greedy → alpha-beta → ISMCTS, each behind the same
`Bot` interface, each in a worker. `determinize` + ISMCTS is exactly
how our campaign AI should reason about hidden enemy armies, and
`combatOdds` is the pattern for our auto-resolve battle calculator.
Pair with `mcts-ai/` (the Rust MCTS library) for the algorithm
itself.
