# Open-Source Mount & Blade-likes — Code Reuse Catalog

**Project:** browser 3D Mount & Blade-style campaign game, modern America (Babylon.js 8 client, Go sim, Python world-data)
**Date:** 2026-09-30
**Rule enforced:** clean-room open-source code only. NO ripped game assets. Licenses verified via GitHub API where possible; "NOASSERTION" = no machine-readable license file found (treat as all-rights-reserved until verified).

---

## Master Table

| Project | URL | License | Language / Engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **sparta** (lacaedemon) | https://github.com/lacaedemon/sparta | **MIT** ✓ | GDScript / Godot 4.7 | Deterministic tactical battle sim, turn-based campaign map (Gallic War), seed+orders replay system (Total War approach), curated `docs/related-games.md` survey | Deterministic sim + replay architecture maps directly onto our Go battle sim; replay-via-order-log is the cheapest correct way to do battle replays | **WORTH PULLING** |
| **Bannerlord.PartyAI** (adwitkow) | https://github.com/adwitkow/bannerlord.partyai | **MIT** ✓ | C# (Bannerlord mod) | Party AI order-queue system: PartyAIThinker, order execution behaviors, fallback orders, clan party settings | Party-AI order queue design for our Go sim's campaign layer (lord/bandit/caravan decision loop) | **WORTH PULLING** |
| **Mount-Blade-Simulator** (JustinYe377) | https://github.com/justinye377/mount-blade-simulator | **None** (LICENSE file is empty) | JavaScript / Phaser 3, browser-based | Full M&B campaign loop in the browser: procedural overworld, threat-aware A* pathfinding, auto-resolve combat, supply/demand economy + caravans + wages, faction/diplomacy (war/peace/truce/tribute), player kingdom, quests, localStorage saves | The single most directly relevant project: economy, diplomacy, and auto-resolve *algorithms* as design reference for our Go sim. DO NOT copy code (no license) | **REFERENCE ONLY** (design goldmine, license unclear) |
| **BannerlordCoop** (Bannerlord-Coop-Team) | https://github.com/bannerlord-coop-team/bannerlordcoop | **PROPRIETARY "Source Available"** — LICENSE explicitly forbids copying, modifying, distributing, or using code in another project without written permission | C# / Bannerlord mod (LiteNetLib + Harmony) | Shared persistent campaign world for up to 8 players, dedicated server, save transfer, host-authoritative tick model | Architecture ideas only: host-authority model, what gets replicated (towns, parties, battles, diplomacy), dedicated-server shape. **Zero code reuse — license is a trap** | **REFERENCE ONLY** (do not touch the code) |
| **game-conquer-others** (Mirator) | https://github.com/mirator/game-conquer-others | **None found** | C# / Unity 6.3 (URP) | Third-person medieval battles + M&B-style overworld meta-loop: warband party, roaming bandits, hold assaults, economy, tier×archetype recruitment, save/load | Campaign meta-loop structure as design reference | **REFERENCE ONLY** (no license) |
| **100YearsWar** (corbosiny) | https://github.com/corbosiny/100yearswar | **None found** | C#/C++ / Unity | Physics-driven medieval battle sim: mass/inertia/inertia combat, modular AI with morale + fatigue, mixed formations, equipment-based outcomes | Battle-AI and formation design ideas for the Go sim's troop AI | **REFERENCE ONLY** (no license) |
| **The Ur-Quan Masters** | https://sourceforge.net/projects/sc2/ | **GPL-2.0-or-later** (code) / CC BY-NC-SA 2.5 (resources) | C / SDL | Complete shipped open-source game: branching dialogue/conversation system, starmap navigation, planet-surface resource gathering, fleet management, arcade melee combat, mod support | Conversation/dialogue system design, resource-loop design, proof that a volunteer team can ship a full game. GPL → study concepts, don't copy into our codebase | **REFERENCE ONLY** (GPL + wrong genre) |
| **0 A.D. / Pyrogenesis** | https://gitea.wildfiregames.com/0ad/0ad | **GPL-2.0-or-later** (code) / CC-BY-SA 3.0 (art) | C++ / JS | Full historical RTS: formations, long/short pathfinding, unit motion, obstruction, economy, P2P multiplayer | Formation controller, pathfinding, and unit-steering design for crowd battles | **REFERENCE ONLY** (GPL) |
| **OpenRA** | https://github.com/OpenRA/OpenRA | **GPL-3.0** | C# | Deterministic RTS sim: fixed ticks, deterministic command streams, replay-through-order-pipeline, sync hashes, out-of-sync diagnostics | THE reference for deterministic sim + replay + netcode architecture. Directly informs our Go sim's tick model and battle-size scaling | **REFERENCE ONLY** (GPL, highest-value design ref) |
| **Spring RTS / Recoil engine** | https://github.com/spring/spring / https://github.com/beyond-all-reason/recoilengine | **GPL-2.0** | C++ / Lua | Large-scale RTS engine: thousands of units, Lua gadgets as game logic, deterministic synced sim, sensor/LOS systems | Scale techniques for big battles; Lua-as-game-logic pattern if we ever want data-driven battle rules | **REFERENCE ONLY** (GPL) |
| **Warzone 2100** | https://github.com/Warzone2100/warzone2100 | **GPL-2.0** | C++ | Complete 3D RTS with full single-player campaign, liberated 2004, still maintained | Campaign mission structure, tech-tree progression design | **REFERENCE ONLY** (GPL) |
| **Battle for Wesnoth** | https://github.com/wesnoth/wesnoth | **GPL-2.0** | C++ | Turn-based fantasy strategy with huge campaign collection, WML data-driven content | Data-driven campaign content (WML) as a model for our world-data → campaign pipeline | **REFERENCE ONLY** (GPL) |
| **TAOM** (haterade22/taom) | https://github.com/haterade22/taom | Mod (requires commercial Bannerlord) | C# / Bannerlord mod | Total-conversion mod: 800+ troop defs, 58 feature modules, career/diplomacy systems | Nothing standalone — requires owning Bannerlord. Modding patterns only | **SKIP** |
| **Conqueror's Blade** | (commercial, Booming Games) | Commercial | Proprietary | Siege/MMO melee battler | Not open source; no code to pull | **SKIP** |
| **M.A.N.L.I.N.E.** | — | — | — | Not found in any search (web + GitHub). Name may be misremembered or the project too obscure to surface | — | **NOT FOUND** |
| **Vorticon** | — | — | — | Not found as an Indian M&B-like; only Commander Keen "Vorticon" references surface. Name may be misremembered | — | **NOT FOUND** |

---

## License traps to avoid

1. **BannerlordCoop looks open but isn't.** Its LICENSE is a "Source Available" proprietary grant: viewing and contributing only, no reuse in other projects. This is the exact trap the boss flagged — do not vendor or adapt its code.
2. **"No license" = no permission.** mount-blade-simulator, game-conquer-others, and 100YearsWar have no effective license (one has an empty LICENSE file). Under copyright default they are all-rights-reserved. Read for ideas, never copy.
3. **GPL code can't go into our codebase** unless the whole game ships GPL. 0 A.D., OpenRA, Spring, Wesnoth, Warzone, Ur-Quan Masters are study-only.

## What "worth pulling" actually means here

- **sparta (MIT):** deterministic battle sim, fixed-tick enemy AI, order queue applied on tick, stable unit IDs, seed+orders replay files. Our Go sim can implement the same pattern natively. Also read its `docs/related-games.md` — a pre-made survey of every project in this table and more.
- **Bannerlord.PartyAI (MIT):** C# order-queue + thinker pattern for campaign parties. Port the *pattern* (order objects, fallback orders, per-party settings) to Go; don't need the Bannerlord API surface.

## Suggested division of follow-up work

- **milo (sim/battles):** study sparta's deterministic sim + replay, OpenRA's tick/command model, 0 A.D.'s formation controller. Implement the patterns in the Go sim — no code copying.
- **Rowan (campaign client):** study mount-blade-simulator's scene/system layout (World, Town, Battle scenes; systems/ dir) as a checklist for client feature parity, reimplemented in Babylon.js/TS.
- **Hana (world data):** Wesnoth's WML data-driven campaign content as a model for world-data → campaign handoff; already has what she needs from the pipeline.
