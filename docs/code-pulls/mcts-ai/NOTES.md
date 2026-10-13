# mcts-ai — NOTES

Source: `patricker/treant` (MIT). Lock-free, parallel Monte Carlo Tree
Search library in Rust. Code in this folder is the actual core
(`treant/src/`, 3,417 lines), copied with its license.

## What MCTS is

Monte Carlo Tree Search: the AI plays thousands of random playouts
from the current position, builds a search tree of the moves that
led to good outcomes, and picks the move with the best record.
It's how programs play Go/chess-style games without hand-written
heuristics — and it works for any turn-based decision: campaign-map
moves, diplomacy choices, battle orders.

## Architecture

- `lib.rs` — `MCTSManager`: `playout()`, `playout_n()`,
  `playout_parallel_for(duration, num_threads)`, `best_move()`,
  `principal_variation()` (the AI's expected line of play).
  You implement two traits and get the whole engine:
- `GameState` trait — `current_player()`, `available_moves()`,
  `make_move()`. Your game state, nothing else required.
- `Evaluator` trait — scores a state. Plug in hand-tuned weights
  or a neural net.
- `tree_policy.rs` — `UCTPolicy` (classic UCB1 exploration) and
  `AlphaGoPolicy` (PUCT with priors). Exploration constant tunable.
- `search_tree.rs` — lock-free tree (1,466 lines), thread-safe
  parallel playouts via `atomics.rs` + `batch.rs`.
- `transposition_table.rs` — merges identical positions reached by
  different move orders (with `TranspositionHash`), big speedup.
- `PolicyRng::seeded(seed)` — deterministic playouts when you need
  reproducibility.

## Relevance to bannerlord-clone

This is the campaign-map AI endgame. Instead of hand-scripting what
each faction does each turn, you give the MCTS manager your
`GameState` (factions, armies, cities, diplomacy) and a move
generator, and it searches for good plans. The parallel playout API
fits a tick budget: `playout_parallel_for(200ms, 8 threads)` then
take `best_move()`. Deterministic option via seeded RNG matches our
lockstep philosophy. Even if we never port the Rust, the trait
boundaries (`GameState` / `Evaluator` / tree policy) are the right
shape for a Go or TS implementation.
