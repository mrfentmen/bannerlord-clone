# strategy-core — NOTES

Source: `zhubby/Shogun` (MIT) — a Three Kingdoms strategy game in
Rust/Bevy. Code in this folder is `src/game/` (11,325 lines), copied
with its license. The `src/core/` UI layer and LLM-adapter AI files
were left out; this is the pure game model.

## The model

`model.rs` — `GameState` is a flat, serializable struct (serde):

- `factions: BTreeMap<FactionId, Faction>`
- `cities: BTreeMap<CityId, City>` (with `FacilityKind`, upgrade costs)
- `officers: BTreeMap<OfficerId, Officer>` (+ personnel generation)
- `roads: Vec<Road>`, `army_movements: Vec<ArmyMovement>`
- `diplomacy: BTreeMap<String, DiplomaticRelation>` + pending orders
- `technologies: BTreeMap<FactionId, FactionTechnologyState>`
- `events: Vec<GameEvent>`, turn/year/month clock, versioned

This is Bannerlord's campaign data model wearing different clothes:
factions, officers (lords), cities, armies moving on roads,
diplomacy states, tech trees. Ours is Go; the shape transfers.

## Turn resolution

`commands.rs` — `resolve_command_batch(state, commands) -> TurnReport`.
All player/AI orders for the turn are collected as `Command` values,
validated (`validate_command_for_state`), then resolved as a batch
into a `TurnReport`. Variants accept an officer generator and a
history recorder. **Batch-then-report** is the right pattern for our
sim tick: deterministic, auditable, replayable.

## AI seam

`ai.rs` — `AiProvider` trait: `decide(AiDecisionRequest) -> AiDecisionResponse`.
The request is a cloned snapshot (turn, cities, officers, roads,
army movements, diplomacy) — the AI never touches live state.
Exactly the boundary our Go sim needs between tick logic and
faction AI.

## Relevance to bannerlord-clone

Closest structural relative to our campaign layer found so far.
Study `model.rs` for field coverage we might be missing (pending
diplomacy orders, technology per faction, incidents), `commands.rs`
for the batch-resolve pattern, and `ai.rs` for the AI snapshot
boundary. The `save.rs` versioned-save approach is worth copying too.
