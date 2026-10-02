# ROADMAP.md

What comes after the agents finish their current tasks. In priority order.

---

## Phase 1: Make It Playable (Now → Agents Done)

**Agents are doing:**
- Agent 1: Playtest core loop, fix breaks, trading UI
- Agent 2: Ohio world data swap
- Agent 3: Battle sim wiring, quests/diplomacy

**When they finish, we need:**
1. **Human playtest** (see PLAYTEST.md) — A real person plays the full loop.
   Record every break. This is non-negotiable.
2. **Bug triage** — Fix what the playtest finds. Prioritize blockers.
3. **Deploy live** (see DEPLOY.md) — Get a URL. Playtest in browser, not just locally.

**Done when:** A human can start → march → fight → trade → save/load without
hitting a blocker.

---

## Phase 2: Make It Fun (1-2 weeks)

1. **Balance pass** (see BALANCE.md) — Tune numbers based on playtest data.
   Are battles too easy/hard? Is trading profitable? Does food matter?
2. **Implement 5 endings** — Quest chains are written in lore.md. Build the
   actual quest logic in the QuestJournal.
3. **Audio polish** — 109 tracks are wired. Now: positional audio in battles,
   dynamic music (intensity layers), ambient variations.
4. **Performance** — Test with 500, 1000, 2000 units. Optimize. The Babylon
   9.29 upgrade (eval branch ready) helps here.

**Done when:** Playtesters say "I'd play this for fun" not just "it works."

---

## Phase 3: Make It Deep (1 month)

1. **Companion quests** — Personal stories for companions. Loyalty missions.
2. **Dynamic events** — Plagues, famines, rebellions, elections. The world
   should surprise the player.
3. **Advanced diplomacy** — Marriages, betrayals, complex treaties.
4. **Mod support** — Let players add factions, units, maps.

**Done when:** The game has stories worth telling.

---

## Phase 4: Polish (Ongoing)

- More lore (always)
- Better tutorials
- Mobile optimization
- Accessibility improvements
- Community feedback integration

---

## What We're NOT Doing

- **Multiplayer** — Out of scope. Local saves only, per boss order.
- **Naval combat** — Out of scope for V1.
- **Voice acting** — Text only. Maybe later.
- **Console ports** — Web only.

---

## Decision Log

- **2026-10-02:** Babylon 9.29 eval complete. Safe upgrade. Merging pending.
- **2026-10-02:** Audio wired (109 tracks). Menu/battle/ambient/UI sounds live.
- **2026-10-02:** Lore expanded to 1,178 lines. 5 endings as quest chains.
- **2026-10-02:** GitHub bio updated.
- **Pending:** Stock asset decision (Quaternius GLBs: remove or exception?)
- **Pending:** Agent tasks (playtest, Ohio data, battle sim wiring)
