# Open-Source Action/Melee Combat Projects — Code Reuse Catalog

**Purpose:** Find clean-room open-source code we can pull into the browser-based 3D Mount & Blade-style campaign game (Babylon.js 8 client, Go sim server, Python world-data). **Code only — no ripped game assets.**

**Date:** 2026-09-30

---

## Master Table

| Project | URL | License | Language / engine | What it implements | What's reusable for us | Verdict |
|---|---|---|---|---|---|---|
| **total-claude** | https://github.com/eoinest/total-claude | Unverified (check LICENSE before pulling) | Three.js, TypeScript, browser | Real-time historical battle sim: ~9,000 individually simulated soldiers, formations, BattleSystem, Combat, Morale, Projectiles, Ragdoll, tactical/general AI, pathfinding, VAT-baked GPU skinning, 8,561 men at 109 draw calls | Crowd-battle architecture end to end: formation data layout, morale model, draw-call discipline for thousands of units, GPU skinning pipeline, sim/render split | **Worth pulling** — closest thing to our battle-size-knob problem solved in a browser |
| **TotalWarSimulator** (MichelangeloConserva) | https://github.com/MichelangeloConserva/TotalWarSimulator | **MIT** | Python/pymunk 2D prototype + Unity 3D port | Formation battle movement: optimal soldier→slot assignment (Hungarian/Jonker-Volgenant), arrival-time-normalized wheeling, unit-carrier-on-spline movement, drag-out ghost-formation preview | Formation reshaping math ports cleanly to our Go sim: slot assignment, wheeling, spline movement. Proven MIT, vendorable | **Worth pulling** — formation movement algorithms for the Go battle sim |
| **saber-battle** | https://github.com/vheissu/saber-battle | Unverified (check LICENSE) | Three.js, TypeScript, Vite, browser | 3D melee dungeon crawler: three-hit light combo, heavy cleaves, piercing thrusts, timed parries, charged attacks; enemy AI that pursues, flanks, guards, lunges, evades | Browser-native melee hit resolution, combo/parry timing windows, melee enemy AI behaviors — directly portable to Babylon.js client | **Worth pulling** — melee combat feel in browser TS |
| **sparta** (lacaedemon) | https://github.com/lacaedemon/sparta | Unverified (check LICENSE) | Godot (2D, 3D conversion in design) | Deterministic fixed-tick battle simulation with bit-identical replay system, sim/render-split architecture, Total War-style presentation layer | Deterministic sim + replay architecture is exactly what our Go server needs for battle verification and replays | **Reference** — study the sim/replay split, adapt to Go |
| **soldierthirdpersonthreejs** | https://github.com/achrefelouafi/soldierthirdpersonthreejs | Unverified (check LICENSE) | Three.js, Vite, browser | Third-person action template: locomotion, motion-warped melee, ragdoll deaths, shoulder camera | Motion-warped melee attacks and ragdoll death handling in browser 3D | **Reference** — small, readable, good patterns |
| **deathstar** | https://github.com/jeffotoni/deathstar | Unverified (check LICENSE) | **Babylon.js, TypeScript, Vite, browser** | Browser 3D space combat: enemy squadrons, procedural visuals, progressive weapons, boss battle, combat feedback | Same stack as our client (Babylon 8 + TS + Vite): project layout, combat feedback patterns, build/deploy setup | **Reference** — stack-familiar patterns, wrong genre |
| **combat-proto** (fenyn/gamestorming) | https://github.com/fenyn/gamestorming/blob/HEAD/combat-proto/CLAUDE.md | Unverified (check LICENSE) | Godot 4.6, GDScript, Jolt physics | For Honor-style directional stance system (3-guard inverted triangle) fused with Sekiro posture/deflection: lights, heavies, feints, shoves, perilous attacks with specific counters | Directional melee design document — stance/attack/counter matrix we can implement in our own combat system | **Reference** — design, not code |
| **combat-arena** (architeuthisduxdux) | https://github.com/architeuthisduxdux/combat-arena | **MIT** | Unity, C#, ML-Agents | Multi-agent physics-based melee (sword + shield) with emergent tactics via reinforcement learning | Physics-driven melee interaction model; less directly portable (Unity/ML) but MIT and instructive for physics-based hit resolution | **Reference** — physics melee concepts |
| **KatanaCombat** (noahbutcher97) | https://github.com/noahbutcher97/katanacombat_demo/blob/HEAD/README.md | Epic Games license terms (UE-bound) | Unreal Engine 5.6, C++ | Production melee framework: input-buffered combo chains, animation canceling, posture/guard-break system, perfect parries, motion warping, data-driven attack definitions (159 tests) | Combat *design* only: data-driven attack tables, posture mechanics, input buffering — reimplement, don't port (UE-locked) | **Reference only** — excellent design doc, unpullable |
| **kcd2-multiplayer_reworked** (DeepFriedDepp) | https://github.com/deepfrieddepp/kcd2-multiplayer_reworked/blob/HEAD/README.md | **GPLv3** | C++ mod for KCD2 | Unofficial KCD2 co-op: server-authoritative damage for directional/timing-based melee ("every punch, block and dodge lands the same on both screens, because the server decides the damage"), 512-player servers | Netcode design lesson: server-authoritative hit resolution for timing-based melee. **GPLv3 is viral — do not copy code into our codebase** | **Reference only** — netcode pattern, license forbids pulling |
| **kingdom-of-swords** (stevensu1977) | https://github.com/stevensu1977/kingdom-of-swords | Unverified (check LICENSE) | Godot 4.6, GDScript | AI-built melee action game: directional evade, strike timing, archers with telegraphed aim that can be interrupted | Melee skeleton and enemy telegraph/interrupt patterns | **Reference** — small scope, readable |
| **total-battle-2d** (ti-loup) | https://github.com/ti-loup/total-battle-2d | Unverified (check LICENSE) | C++20, SDL3 | Grand strategy + real-time battles: province/settlement management, economy, faction buildings, large-scale battles | Campaign-layer design (provinces, buildings, economy) adjacent to our world-data/sim needs | **Reference** — campaign design, wrong stack |
| **kenshi-coop** (zeroit789) | https://github.com/zeroit789/kenshi-coop | Unverified | C++, DLL injector | Co-op multiplayer *mod injected into the commercial Kenshi game* — requires owning Kenshi | Nothing — it's a hook into a proprietary game, not standalone code | **Skip** — tied to commercial game |
| **TAOM** (haterade22) | https://github.com/haterade22/taom | Unverified | C#, Bannerlord modding API | Lord of the Rings total conversion *mod for Bannerlord*: 58 feature modules, diplomacy, careers, battle AI tweaks, 2,600 unit tests | Nothing pullable — requires owning Bannerlord. Battle-AI approach notes are the only value | **Skip** for code — needs the commercial game |

---

## Important corrections

- **"Glorious Victus" is actually *Gloria Victis*** — a commercial PvP MMORPG (Black Eye Games), sunset 2023 and relaunched free-to-play by Gamigo in 2026. It is **not open source**. Nothing to pull. (Sources: https://massivelyop.com/2026/06/17/gamigos-gloria-victis-reboot-is-officially-live-today-three-years-after-the-ogs-demise/, https://theguidehall.com/medieval-mmorpg-gloria-victis-relaunch-free/)
- **No open-source Chivalry 1/2 clones found.** Search surfaced only cheat tools (skip — not code reuse, and a cheat-tool association is a liability) and an unrelated web "Chivalry Engine" (browser game engine, not the game).
- **No open-source Kingdom Come: Deliverance 1/2 clones found.** Only mods (KCD2 multiplayer mod, combat realism mod) — all require owning the commercial game.
- **No open-source Kenshi clones found.** Only co-op injector mods for the commercial game.
- **No open-source Exanima clones found.** Physics-based melee is covered instead by `combat-arena` (MIT) and the KatanaCombat design reference.

## Pull priority (for the parent agent)

1. **total-claude** — verify license first; if clean, this is the single biggest win: browser-native thousand-unit battles with formations, morale, and GPU skinning.
2. **TotalWarSimulator (MIT)** — pull formation-movement algorithms into the Go sim.
3. **saber-battle** — verify license; pull browser-native melee combo/parry/enemy-AI systems into the Babylon.js client.
