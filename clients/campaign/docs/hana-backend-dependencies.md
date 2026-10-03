# Hana lane: backend dependencies (mandate §3, §4, §5)

These player-facing systems are BLOCKED on simulation APIs that do not exist yet.
The frontend will not fake them. Each entry names the exact missing API surface so
Muse (simulation lane) can build it.

## Tournaments (§4) — BLOCKED

The sim has a background tournament system
(`services/simulation/internal/systems/tournament/tournament.go`) that resolves
tournaments automatically. Nothing is exposed to the client.

Needed for a real tournament player experience:
- `GET` upcoming/announced tournaments: town, day, prize, entrants
- `POST` enter tournament (player party)
- `GET` bracket state: rounds, participants, results
- Player participation flow connecting to the existing battle system
- `GET` tournament history + notifications on victory/defeat

Without these, any tournament UI would be a fake bracket. Not building one.

## Hideouts (§5) — BLOCKED

Hideouts exist only as issue (quest) triggers (`issue.clear_hideout_*` config keys).
There are no hideout entities, no scouting data, no assault action.

Needed for a real hideout experience:
- `GET` known/discovered hideouts: location, scouting info, enemy composition
- `POST` assault hideout (connecting to the existing battle system)
- Victory/defeat outcomes, rewards, clearing + respawn state

Without these, any hideout UI would invent enemies and outcomes. Not building one.

## Taverns (§3) — BLOCKED (framework possible)

No tavern entities, no patrons, no companion recruitment in the sim. The checkers
game (`services/simulation/internal/boardgames/checkers.go`) is unrelated.

Needed for real taverns:
- Tavern per settlement (or which settlements have one)
- Keeper + patrons (characters present)
- Companion recruitment mechanics
- Tavern events

A tavern *panel* aggregating existing real data (local rumors, available quests,
notables present) is possible without new APIs, but the core tavern mechanics
(recruitment, companions, events) need the sim. Framework deferred until the
entities exist — a panel of only-aggregated data would be a shallow shell.

## NPC parties (§15, §17) — BLOCKED (recorded 2026-10-03)

`SimSnapshot` publishes one player party. No NPC-party collection exists in the
TypeScript snapshot contract, so NPC party markers, caravans, armies, and
detailed NPC-party inspection cannot be built. When the API lands, the map will
consume it through the same marker/hover-card patterns built for settlements.

## Quest-related objectives (§12) — DEFERRED

"Accept a quest" / "complete a quest" objectives need a client-readable issue
board state (accepted/completed counts per party). The IssueBoard is read
per-panel via provider; a lightweight snapshot-level quest summary would unlock
this.

## Relationship visualization (§18) — BLOCKED

The sim models dynasties (`Ruler.SpouseID/FatherID/MotherID/HeirID` in
`services/simulation/internal/model/entities.go`), but the ruler payload the
client reads exposes none of it — no spouse, parents, children, or heir fields
in `RulerState`. A relationship graph needs:
- `spouseId`, `fatherId`, `motherId`, `heirId` on the ruler payload (as
  `leader-N` ids, `-1`/null when absent)
- Children derivable client-side once parent ids are present

Without these, any family tree would be invented. Not building one.
