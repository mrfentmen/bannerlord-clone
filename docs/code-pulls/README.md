# Code pulls — reusable game systems from the awesome-ai-games sweep

Pulled 2026-10-03 from AI-built open-source 3D games
(AgentsLoop/awesome-opus-5.5-games list). These are **systems**, not art:
vehicle physics, deterministic sim architecture, city simulation design.
Staged here for porting into the bannerlord-clone; nothing is wired in yet.

## Systems

### 1. vehicle-physics/ — arcade vehicle physics + racing AI (MIT, code included)
From `bridge-mind/turbo-kart-rally` (three.js kart racer, quality 9.3/10).
Full working arcade vehicle model: grip-based turning, drift with
mini-turbo boost, hop, boost pads, wall collision, offroad slowdown,
slope gravity. Plus `AIDriver`: personality-driven racing AI
(lane bias/weave, aggression, drift preference, skill-based reaction
time and noise, stuck/wrong-way recovery).
**Use for:** driving model for cars/trucks (we now have Kenney + KayKit
vehicle models), AI drivers for traffic/chase sequences.
See `vehicle-physics/NOTES.md`.

### 2. deterministic-sim/ — fixed-tick authoritative sim pattern (design notes only)
From `amsminn/gpt-6-astra-smash-karts` (Next.js + TS vehicular combat).
30 Hz fixed-tick `GameRoom` fully separated from the renderer:
sanitized inputs, serial-numbered snapshots, countdown/playing/results
phases, bot players as first-class citizens. Mirrors our authoritative
Go sim philosophy; useful as a second opinion on lockstep structure
and input validation.
**Use for:** reference when hardening the Go sim's tick/input/snapshot
design. See `deterministic-sim/NOTES.md`.

### 3. city-sim/ — tile city simulation design (design notes only)
From `codersusu/game-city-skylines` ("SEABRIGHT", Unity C# city builder,
quality 9/10). Tile-grid city sim: zoning (residential/jobs), economy
(money, income, expenses, tax rate), happiness, traffic flow, power
capacity, road building with traffic load per tile, save format.
Presentation split: `CityTraffic` (instanced car meshes on routes) and
`CityPedestrians` (walker agents on sidewalk segments).
**Use for:** town economy/traffic design reference; the traffic/pedestrian
presentation split maps directly onto our instanced crowd/traffic plans.
See `city-sim/NOTES.md`.

## License status

- `vehicle-physics/`: **MIT** (BridgeMind, 2026) — code copied with
  license intact (`LICENSE-bridge-mind`). Cleared for use with attribution.
- `deterministic-sim/`, `city-sim/`: **no license detected** (all rights
  reserved by default). Code is NOT copied here — only my own design
  notes describing the architecture. Reimplement, don't copy.

Full per-system license notes in `LICENSES.md`.
