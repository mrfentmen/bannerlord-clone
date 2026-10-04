# MISSION — Bannerlord clone gap list + 4-hour sprint (2026-10-03)

Read this file, then `.agent-specs/divvy.md`, then YOUR brief
(`brief-pax.md` / `brief-hana.md` / `brief-milo.md`) before touching anything.

## Reality check

A full Bannerlord clone is not a 4-hour job. A **playable core** is.
4 hours buys exactly this:

> menu → character creation → spawn → walk and drive → enter a town → trade →
> one fight → save and reload — with music and SFX playing.

Everything below that is not in that sentence waits.

## The board right now

- The game stalls at the start screen ("sides"). Cause: the screen asks you to pick
  one of 6 factions, but the shipped map is the Ohio River Valley only — 3 of the 6
  sides own zero towns there, and the screen waits on a slow server snapshot, so the
  boxes sit empty and nothing leads anywhere. **Fixer: Buffy, first priority.**
- Movement does not exist. You cannot walk or drive. The code is already pulled.
  **Fixer: Pax.**
- The sim forgets the whole campaign when it restarts. Save/load is finished and
  parked in an orphan branch. **Fixer: Milo.**
- Audio, models, textures: 1,379 3D files and a huge audio library sit on main,
  mostly unwired. **Fixer: Hana.**
- The repo was rebuilt on Oct 2; work from before lives on branches with no shared
  history. Port it, don't rebuild it. See "Parked work".

## Gap list — everything a Bannerlord clone needs

Status: HAVE = works, PARTIAL = exists but not wired/tested, MISSING = not built.

### Core loop
1. Main menu — HAVE (buttons need wiring) — Buffy
2. Character creation: culture → family → childhood/youth → stats → name/look — PARTIAL (data exists, flow is wrong: side-first) — Buffy
3. Spawn, home, starting gear/cash — PARTIAL — Buffy
4. Walk (FPS/TPS controller) — MISSING (code in `docs/code-pulls/babylon-controller`) — Pax
5. Drive cars / ride bikes — MISSING (code in `docs/code-pulls/vehicle-physics`) — Pax
6. Campaign map: travel, time, party movement, encounters — PARTIAL (Ohio Valley only) — Buffy + Hana
7. Towns and villages: enter, interiors, notables — PARTIAL — Buffy + Pax
8. Trade + inventory — PARTIAL (UI exists, never tested end-to-end) — Milo
9. Party: recruits, wages, food, morale, prisoners — PARTIAL — Milo
10. Field battle: command, formations, auto-resolve — PARTIAL (scene exists) — Pax
11. Sieges / compound assaults — MISSING (sim `siege.go` exists, client none) — Pax + Milo
12. Battle aftermath: loot, casualties, prisoners, ransom — PARTIAL — Milo
13. Save/load that survives a restart — MISSING (parked: `milo/save-load`) — Milo
14. Quests: main line + side + procedural — PARTIAL (tracker exists, no content) — Milo
15. Jobs board (gang jobs + civilian jobs) — MISSING — Buffy
16. Companions + party roles (quartermaster/scout/surgeon/engineer) — PARTIAL — Milo
17. Skills/XP/perks (18 skills, 6 attributes) — PARTIAL (sim ignores them) — Milo
18. Renown / influence / relations — PARTIAL — Milo
19. Ageing, marriage, children, heirs — MISSING — Milo
20. Death and succession — MISSING — Milo

### Kingdom / syndicate layer (the Bannerlord spine)
21. Factions, diplomacy, wars, alliances — PARTIAL — Milo
22. Joining a side / mercenary contracts (ethnicity raises or lowers the bar, never blocks) — MISSING — Buffy + Milo
23. Vassals → lieutenants, council → sit-downs — MISSING — Milo
24. Armies → crew mustering — MISSING — Milo
25. Fiefs → turf and fronts (own, manage, defend) — MISSING — Milo + Buffy
26. Policies, internal politics, succession splits — MISSING — Milo

### World and systems
27. Economy: workshops → modern businesses, caravans → trucking, prices/shortages — PARTIAL — Milo
28. City income identity (port / industrial / tourist / farm / college) — MISSING — Buffy
29. Villages (suburbs, truck stops, rural towns) as food/recruit sources — MISSING — Hana
30. Gangs: roaming, hideouts, turf wars — MISSING — Milo
31. Police / heat / wanted — MISSING (MIT code in `docs/code-pulls/crime-systems`) — Pax + Milo
32. Heists + mission framework — MISSING (MIT code in `docs/code-pulls/crime-systems/missions`) — Buffy
33. Bounty hunting — MISSING (build from mission framework) — Buffy
34. Crafting → chop shop / gunsmithing — MISSING — Milo
35. Bars / clubs / diners (taverns) — MISSING — Buffy
36. Day/night cycle + weather — MISSING (HDRIs on main) — Buffy clock + Pax visuals

### Presentation
37. Models wired into scenes (1,379 vendored, many unwired) — PARTIAL — Hana + Pax
38. Animations: walking, combat, riding — PARTIAL — Pax
39. Music + radio — PARTIAL (library on main) — Hana
40. SFX + voice barks — PARTIAL (huge library on main) — Hana
41. UI: HUD, panels, menus, notifications — PARTIAL — Buffy
42. Tutorial / help — MISSING — later

## Parked work (orphan branches — port, don't rebuild)

- `milo/save-load` — full server save/load (1 file + 2 routes). **Milo.**
- `review/sim-core-2` — battle endings, hold fix, morale tests, verification doc. **Milo.**
- `rowan/campaign-client` — client scene/model files (gltf, modelAssets, units). **Pax.**
- `worker/hana/tier-systems` — tier world-data code, panels, encyclopedia, fog, issues. **Buffy + Hana split by dir.**
- `milo/tasks-101-200`, `milo/world-ai` — client audio code + player combat + content packs. **Hana (audio) + Pax (combat).**
- `worker/local/battlesim-assets` — voices/SFX/concept art content. **Hana.**

## The 4-hour sprint (definition of done, nothing else)

1. Menu → New Game → ethnicity → family → upbringing → home → spawn. (Buffy)
2. WASD walk + get in a car and drive. (Pax)
3. Enter a town, buy or sell one thing. (Milo + Buffy)
4. One fight end-to-end: enter, fight, result, back to map. (Pax)
5. Quicksave → reload → same world. (Milo)
6. Music + SFX playing. (Hana)

Success = all 6 green on main. Everything else in the gap list waits its turn.

## Rules

- One lane per directory (see `divvy.md`). `main.ts` is Buffy's; ask for a hook line.
- `git fetch` before push. Never force. Keep builds green:
  - Go: `cd services/simulation && go build ./... && go test ./cmd/apiserver/...`
  - Client: `cd clients/campaign && npx tsc --noEmit && npx vitest run <your files>`
- No mocks, no stubs, no placeholders. Real behavior or say what's blocked.
- If you need a decision: write it in your commit message and keep moving.
