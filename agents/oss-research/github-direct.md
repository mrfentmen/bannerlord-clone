# GitHub Direct Search — Open-Source Clones (2026-09-30)

Direct GitHub repo search for open-source clones of the boss's game list.
Verdict: true 1:1 clones of these commercial games are rare on GitHub. The real
value is in open-source strategy/sandbox games, not clones.

## Found on GitHub

| Game | Clone found | URL | License | Notes |
|---|---|---|---|---|
| Total War | wilbefast/open-war | github.com/wilbefast/open-war | Unspecified | "An open-source Total War clone (note the pun)", C++ Ogre3D, 9 stars |
| EU2 | tom-bladko/myeu | github.com/tom-bladko/myeu | Unspecified | EU2/For the Glory clone in Python |
| Ur-Quan Masters | yes, established | github.com/JHGuitarFreak/UQM-MegaMod (112 stars) | GPL-2.0 | The canonical open-source Star Control 2; MegaMod is the active fork |
| Grand strategy (browser) | Pr1nted/Open-Doctrines | github.com/Pr1nted/Open-Doctrines | Source-available | Free browser grand strategy |
| Grand strategy | OpenHistoria/OpenHistoria | github.com/OpenHistoria/OpenHistoria | AGPL-3.0 | Sandbox alternative to Pax Historia |
| Cold War grand strategy | elebras1/Projet-Guerre-Froide | github.com/elebras1/Projet-Guerre-Froide | GPL-3.0 | HOI4-adjacent setting |
| Historical strategy | CtxPilot/Late-Eastern-Han-Dynasty | github.com/CtxPilot/Late-Eastern-Han-Dynasty | MIT | Clean license, historical |
| Mount & Blade: Warband | onysd128/WarbandX | github.com/onysd128/WarbandX | MIT | Open-source CLI launcher, NOT a clone — no game code |

## Nothing on GitHub (0 real results)

- Chivalry 1/2, Kenshi, Exanima, Kingdom Come: Deliverance (only a lockpicking-minigame clone), Conqueror's Blade, CK3, HOI4 (only mods), Ultimate General: Civil War, Gloria Victis
- "M.A.N.L.I.N.E." and "Vorticon" (Indian passion projects): no GitHub presence found

## Takeaway

Don't hunt 1:1 clones — they barely exist. Pull from: open-war (TW battle logic), myeu (EU2 systems), Ur-Quan Masters (completed open-source game architecture), OpenHistoria/Open-Doctrines (browser strategy), and the MIT-licensed TotalWarSimulator formation math from the web research. GPL/AGPL items are reference-only unless we reimplement.

## Web-search additions (2026-09-30) — the finds GitHub search missed

| Project | URL | License | What it is | Reusable | Verdict |
|---|---|---|---|---|---|
| **WebBand** (srknzl) | github.com/srknzl/webband — playable at serkanozel.me/webband | **AGPL-3.0** | Single-page Mount & Blade: Warband-style RPG, entirely in browser. Campaign map, towns, battles (PixiJS), no build step, no server | Whole genre in a browser: campaign structure, town UI, battle flow | **Reference only** — AGPL is viral for web games. Study the design, reimplement |
| WebBand proto (teknesyum) | github.com/teknesyum/webband | Archived | Browser M&B Warband strategy-layer prototype, vanilla JS | Strategy-layer prototype patterns | Reference — archived |
| **OpenMB** (cookgreen) | github.com/lfp163/openmb | **GPL-3.0** | Open-source RPG engine for Mount&Blade series, C#/Ogre3D, world map, physics, mod system, in-game editor | Engine architecture: world map, item types, script/GUI systems | **Reference only** — GPL. Architecture study |
| PMCCompany (mb2lord) | github.com/mb2lord/pmccompany | Open (check) | Open-source Bannerlord campaign mod: HQ, reserves, contracts, logistics, spy network | Campaign systems design (needs Bannerlord to run) | Reference — campaign design |
| **0 A.D.** | play0ad.com / gitea.wildfiregames.com | Open | 3D RTS like Age of Empires II | RTS architecture, pathfinding, formation movement | Reference — big, mature |
| **Beyond All Reason + Spring engine** | github.com/beyond-all-reason/Beyond-All-Reason, github.com/spring/spring | Open | Massive-scale RTS on the Spring engine — THE open-source engine for thousand-unit battles | Engine that solves large battle sim; sim/render split | **Reference** — study how Spring handles scale |
| **OpenRA** | github.com/OpenRA/OpenRA | GPL-3.0 | C&C/Dune/Red Alert rebuild for modern era | Deterministic netcode, replay system | Reference — netcode/replay |
| **Unciv** | github.com/yairm210/Unciv | **MPL-2.0** (permissive) | Civ V open-source clone, 11.3k stars, actively maintained | 4X systems: cities, tech, diplomacy, AI — MPL allows reuse with attribution | **Worth pulling** — permissive license, huge codebase |
| Freeciv / Openage / Mindustry | various | GPL | Classic 4X / AoE2 engine / factory-tower-defense | Systems reference | Reference |

## Mainland / Vorticone — final answer

Web-searched both names. **Neither exists** as an Indian Mount & Blade-like passion project — not on GitHub, not on the web. "Project Mainland" hits are a Minecraft Jurassic Park addon; "Vorticone" appears only as a forum username. If these are real projects, they're not indexed under those names.
