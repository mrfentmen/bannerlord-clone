# Agent 3 — GUNS / WEAPONS art catalog

**Project:** browser-based 3D campaign game, Mount & Blade-style, set in modern America (real US geography), modern firearms.
**Budget target:** low-poly, game-ready, < ~5k tris per weapon, GLB preferred. No model files downloaded — catalog only.
**Date:** 2026-09-30

## Notes on sources and URLs

- **Sketchfab URLs use the form `https://sketchfab.com/3d-models/none-<uid>`.** This is not a typo — Sketchfab's own public API (`api.sketchfab.com/v3/search`) returns `viewerUrl` literally as `none-<uid>` because their slug index is empty for these uploads. The URL 301-redirects to the canonical slugged page. All `none-<uid>` links below were verified live.
- **Sketchfab API `license_by=cc0` filter is broken/ignored.** A CC0-filtered query returned only CC-BY and CC-BY-NC results. Treat "CC0 on Sketchfab" as unproven; the CC0 claims here come from itch.io / quaternius.com / opengameart.org / polyhaven.com only.
- `Polys` = face/triangle count as published by the source. `—` means the publisher does not state it.
- Every Sketchfab row offers **GLB + GLTF + USDZ + source** (verified across the whole result set).
- **TastyTony** on Sketchfab is the single best per-weapon source: ~130 named real firearms, CC-BY, and the GLB carries **zero embedded textures** — flat/untextured is perfect for browser budgets. Author profile: https://sketchfab.com/TastyTony

---

## A. PACKS (multi-weapon) — primary sourcing

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Styloo — Guns Asset Pack** | https://styloo.itch.io/guns-asset-pack | **GLB + FBX** (individual files, 45 MB zip) + Blend/high-poly/procedural RAR (107 MB) | — (author: "retopo'd and optimized") | **CC0** (page states "Creative Commons Zero v1.0 Universal"; author confirms "it's cc0, you can do whatever you want") | $0 (name your own price) | **Best overall pick.** Only pack found that is CC0 *and* ships native **.glb** *and* covers modern guns. Contents: AK-47 + variant, AWP (sniper), pistol, MAC-10 (SMG), shotgun, rocket launcher + variant, quad rocket launcher, 4 bullet types, flashbang / 2 nades / smoke / incendiary, ammo box. Has an "emission only" folder variant. |
| **Quaternius — Ultimate Guns Pack** | https://quaternius.com/packs/ultimategun.html (OGA mirror: https://opengameart.org/content/low-poly-guns-pack) | FBX, OBJ, Blend | — | **CC0** | Free | 40 models (Jul 2019). Tag set: sniper, AWP, shotgun, p90, revolver, pistol, glock, rifle, m4, uzi, scope, automatic, submachine, ak47. Untextured. **No GLB** — needs a one-time FBX→GLB conversion pass. The OGA mirror avoids the site/JS flow. |
| **Quaternius — 50+ LowPoly Guns** | https://quaternius.itch.io/50-lowpoly-guns | FBX, OBJ, Blend | — | **CC0** ("free for everyone to use in any project, even commercially") | Free | 50+ models. Largest CC0 modern catalog from a single author. No GLB. |
| **Cosmo — Low poly Guns + Test map** | https://cosmo-art.itch.io/low-poly-guns | FBX, OBJ, Blend | — (29 low-poly weapons) | **CC0** ("commercial and non-commercial, attribution not required") | $0 (name your own price) | 29 customizable weapons — color **and detachable parts**. Includes a small test map (useful for in-browser weapon posing/QA). Files: 2.2 MB + 1.3 MB + 5.9 MB. |
| **3dmodelscc0 — Free CC0 Guns & Explosives Pack** | https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack | FBX only (RAR, 154 MB). Community GLB converter: https://github.com/BoQsc/cc0-guns-explosives-pack-glb | — | **CC0** (author: "I have modeled all of the assets I share, they are all in public domain") | Free | 19 models incl. **M4A1**, AK-47, sniper rifle, shotgun, Makarov pistol, Luger, Suomi KP, M3 Grease gun, flare gun, plus 10 explosives (C4, claymore, AT mine, M24, molotov, pipe bomb…). **Caveat:** FBX material/texture links are broken on import — two community Blender fix scripts are in the page comments; use the GLB repo instead of shipping the raw RAR. |
| **Jaks — Low Poly Rifle Pack** | https://jaks.itch.io/low-poly-rifle-pack | 114 kB + 345 kB archives (format not stated) | **2,767 verts / 5,196 tris TOTAL** — per-model counts published (FAMMAS 500 t, F2000 424 t, SCAR 572 t, L85A1 656 t, M16A1 528 t) | **CC-BY 4.0** | Free | 10 rifles. **The only pack that publishes poly counts**, and the only one whose total is near the 5k budget. Author later relicensed to allow commercial use with attribution. |
| **Tabasco — Various Small Arms (OGA)** | https://opengameart.org/content/various-small-arms-assault-rifles-sniper-pistol | Blender `.blend` via smallarms.zip — **no UV textures, Blender materials only** | "relatively low-poly" (not stated) | **CC0 *and* CC-BY 3.0 (dual)** — "2023-12-15: Putting these in the public domain" | Free | Assault rifles, sniper, pistols. **Bolt/slide cycling animations included**, and iron sights are modelled well enough for a realistic first/third-person hybrid. Best realistic-look option with working animations. |
| **Casti_131 — low poly modern weapons (OGA)** | https://opengameart.org/content/low-poly-modern-weapons | "low poly modern weapons.zip" | — | CC-BY 3.0 | Free | Straightforward modern low-poly weapon drop. |
| **Hans Woofington — Dunkelblau Weapon Pack** | https://hans-woofington.itch.io/dunkelblau-weapon-pack | not stated (3.1 MB) | — | Custom — "If you make something using this pack, credit me!" (not a standard CC license) | Free | **The only rigged modern gun pack found.** Guns have bone limits set (easy to animate), and ship with spare magazines (full + empty), loose bullets and shell casings — exactly the attachment/ammo dressing a campaign game needs. No character models included. |
| **Delthor Games — FREE Low Poly Weapons Pack Vol. 1** | https://delthor-games.itch.io/gun-pack | FBX (author: "work in Unity, but not in any other engine") | — | Custom: commercial use **only inside** a commercial project; no reselling; no free→commercial conversion; credit required | Free | Modern guns, animatable parts (mags), PBR textures, free AK-12 with PBR in a separate pack. ~10 files, 50–166 kB each. |
| **Delthor Games — Free Low Poly Weapons Pack Vol. 3** | https://delthor-games.itch.io/free-low-poly-weapons-pack-3 | FBX only | — | Same custom license as Vol. 1 | Free | Detachable mags for animation + sights/scopes for modding. **Explicitly Unity-only** per the author — a real blocker for a browser/webGL pipeline. |
| **Quaternius — Animated Guns Pack** | https://quaternius.com/packs/animatedguns.html | FBX, OBJ, Blend | — | **CC0** | Free | 6 animated guns: P90, revolver, pistol, shotgun, sniper rifle + 1. Good top-ups for the animated Quaternius sets. |
| **McSteeg — PSX Guns: Ammo** | https://mcsteeg.itch.io/psx-guns-ammo | 2.3 MB | "low poly count, compatibility with modern game engines" (not stated) | Custom free license: "free to use in any works… may not redistribute the pack as your own work. No credit is required." (not a formal CC license) | Free / $0 NAYP | Deliberate PS1/PSX aesthetic. Pairs well with the Ace Spectre pack below if you go retro. |
| **Ace Spectre — PS1 Heavy and Light Weapons Pack** | https://ace-spectre.itch.io/ps1-heavy-and-light-weapons-pack | 1.4 MB | very low (PS1-era) | Models **CC0**, but textures are **from texturer.com** under that site's terms — the domain is now a squatted gambling site, so the texture license is unverifiable | Free | Tiny, cheap insurance for filling out weapon lists. Verify/replace textures before shipping. |
| **OBUR Games — Weapon Pack of 10/100, Parts 1–10** | https://sketchfab.com/3d-models/none-b18c1d6cec154f4ca4be66b9117ba6a1 (part 2) — parts 1,3–10 also on the author's Sketchfab page | GLB, GLTF, USDZ, source | **42,982 – 81,607 faces per pack of 10** | CC-BY | Free | Highest realism/variety of the free options (modern mil-surplus, per-part detail). **Way over budget** — requires aggressive per-part decimation. Listed for reference only. |
| **Jestan — The Ultimate Weapons Pack** | https://jestan.itch.io/weapons-pack | 18 kB (single tiny archive) | very low | CC0 (author: "the license in the download says something else" → "Outdated license file if so, it's CC0") | Free | Small placeholder/prop tier. |
| **Kenney — Blaster Kit** | https://kenney.nl/assets/blaster-kit (itch mirror: https://kenney-assets.itch.io/blaster-kit) | **GLB, GLTF, FBX, OBJ, Blend** — verified by inspecting the zip's central directory | very low (hundreds of tris per piece) | **CC0** | Free | 20+ **sci-fi blasters**, not real firearms; includes crates, silencer, throwables, smoke; animated + 3 colour variations. GLB confirmed present. Use only as a fallback/abstraction tier. |
| **Kingofthecrows — FPS weapons (OGA)** | https://opengameart.org/content/fps-weapons | fpsweapons.zip (Quake-mod era) | unknown | **CC-BY-SA 3.0** | Free | ⚠️ **ShareAlike is viral** — incorporating these can oblige you to release your game under CC-BY-SA. Recommend avoiding. |
| **mrpoly — Two Pistols (OGA)** | https://opengameart.org/content/two-pistols | `.blend` only | low | **CC0** | Free | Two-pistol fill-in. |

---

## B. INDIVIDUAL MODELS — assault rifles & battle rifles

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| TastyTony — Low-Poly M4A1 | https://sketchfab.com/3d-models/none-8cab1cbeb82c4396a154f9fc8771417b | GLB/GLTF/USDZ/source | 10,680 f / 5,761 v | CC-BY | Free | The M4 workhorse. Untextured GLB. |
| TastyTony — Low-Poly Mk18 Mod0 | https://sketchfab.com/3d-models/none-740cef42430643c59d0f183683e07112 | GLB/GLTF/USDZ/source | 9,273 f / 4,734 v | CC-BY | Free | Civilian/contractor flavour variant of the M4 platform. |
| TastyTony — Low-poly M4 rifle | https://sketchfab.com/3d-models/none-9836b8d7a1984d5a83f0be2827af1d60 | GLB/GLTF/USDZ/source | 8,175 f / 4,276 v | CC-BY | Free | Second M4 option, different silhouette. |
| TastyTony — Low-Poly HK416 | https://sketchfab.com/3d-models/none-059e968f6f764357880807c62c117ab7 | GLB/GLTF/USDZ/source | 9,253 f / 5,233 v | CC-BY | Free | 5.56 NATO sibling; good "police/military surplus" variant. |
| TastyTony — Low-poly M4 assault rifle | https://sketchfab.com/3d-models/none-fb85c455cf374675a1db7988def2d926 | GLB/GLTF/USDZ/source | **6,109 f / 3,567 v** | CC-BY | Free | **Best in-budget M4** — just over 5k, comfortably cheap for browser. |
| TastyTony — M4A1 (second variant) | https://sketchfab.com/3d-models/none-da61d30453ab49c9a6f1bff4497fa051 | GLB/GLTF/USDZ/source | 7,298 f / 3,944 v | CC-BY | Free | Lighter M4A1. |
| sycgff — M4A1 Animated Low Poly | https://sketchfab.com/3d-models/none-91de835e74e24b65b69659bdbe392ea9 | GLB/GLTF/USDZ/source | 6,522 f / 3,648 v | CC-BY | Free | M4A1 with animation included — useful if you don't want to rig. |
| TastyTony — Low-Poly HK417 | https://sketchfab.com/3d-models/none-36acd0c829574d72a42faff85e2e9944 | GLB/GLTF/USDZ/source | 9,826 f / 5,601 v | CC-BY | Free | 7.62 battle rifle. |
| Skabl — M4 (Free) | https://sketchfab.com/3d-models/none-1f70ed40d0894206b797b9956b88a3c3 | GLB/GLTF/USDZ/source | **5,113 f / 2,790 v** | CC-BY | Free | In-budget M4 alternative, 3 textures. |
| 晴路卡 — Rifles | https://sketchfab.com/3d-models/none-97811f0b5a064590ae243eda8ceeb88d | GLB/GLTF/USDZ/source | **444 f / 296 v** | CC-BY | Free | Absurdly cheap — a whole rifle silhouette set for under 500 tris each. Good for crowds/massing. |
| TastyTony — Bullpup Rifle | https://sketchfab.com/3d-models/none-227e8ab28dde4c9e82e2c93e8d5b6705 | GLB/GLTF/USDZ/source | 9,614 f / 5,169 v | CC-BY | Free | Bullpup branch for exotic loadouts. |

---

## C. INDIVIDUAL MODELS — pistols / handguns

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| TastyTony — LOWPOLY – COLT M1911 – PS1/PSX STYLE | https://sketchfab.com/3d-models/none-f9fc36a1f07b47faaadb761702f703b0 | GLB/GLTF/USDZ/source | **806 f / 464 v** | CC-BY | Free | The archetypal American service/duty pistol at a trivial poly cost. |
| TastyTony — Low Poly Pistol | https://sketchfab.com/3d-models/none-0342cf497fef4b07804b32b4ab7271e5 | GLB/GLTF/USDZ/source | **1,973 f / 1,053 v** | CC-BY | Free | Generic modern sidearm, in budget. |
| TastyTony — Low-Poly Makarov Pistol | https://sketchfab.com/3d-models/none-4a2aa976e29948168169f6da77c3deea | GLB/GLTF/USDZ/source | **2,840 f / 1,506 v** | CC-BY | Free | Cheap "found weapon" sidearm. |
| TastyTony — Low-Poly M3 Grease Gun | https://sketchfab.com/3d-models/none-9fe93b78f0c147d3970d7fadd1df776e | GLB/GLTF/USDZ/source | **3,917 f / 2,086 v** | CC-BY | Free | Distinctive cheap gang-era SMG/pistol hybrid. |
| DJMaesen — Pistol | https://sketchfab.com/3d-models/none-5f6ec54257de449cacc8c872660b40d3 | GLB/GLTF/USDZ/source | **2,919 f / 1,531 v** | CC-BY | Free | Most-liked of the budget pistols (670 likes), 3 textures. |
| Hafeez Ahmed — Modern Semi-Automatic Pistol, Game Ready PBR | https://sketchfab.com/3d-models/none-254d63584b73484092bfac7fe9cedca6 | GLB/GLTF/USDZ/source | **3,451 f / 1,878 v** | CC-BY | Free | Explicitly "Game Ready PBR", 3 textures, in budget. Newest pistol option. |
| TastyTony — Sci-fi Gun Low Poly (Pistol) | https://sketchfab.com/3d-models/none-d4586fb8afc74f82a97354655fd0bdfc | GLB/GLTF/USDZ/source | **3,556 f / 1,794 v** | CC-BY | Free | Sci-fi, but cheap if you need an abstracted sidearm. |
| **Poly Haven — Service Pistol** | https://polyhaven.com/a/service_pistol | GLB, FBX, USDZ + 4K PBR maps | 27,548 | **CC0** | Free | Highest-quality fully PBR pistol found, with detachable mags and two grip variants. **Over budget — decimate or use for hero/cutscene guns only.** Latest Poly Haven weapon releases are strong. |

---

## D. INDIVIDUAL MODELS — SMGs

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| TastyTony — UMP45 Low poly, SMG | https://sketchfab.com/3d-models/none-86da2108eaf045408dea211be3c80f3b | GLB/GLTF/USDZ/source | **1,225 f / 595 v** | CC-BY | Free | Cheapest credible police/SWAT SMG. |
| TastyTony — Low-Poly Sten Gun | https://sketchfab.com/3d-models/none-51a9f6bc2cff4308af41bdde7c83d446 | GLB/GLTF/USDZ/source | **3,743 f / 2,052 v** | CC-BY | Free | Historic/underground-market SMG flavour. |
| TastyTony — Low-Poly Mini Uzi | https://sketchfab.com/3d-models/none-4b585cdf292d4f0798ce40f0d5ff2507 | GLB/GLTF/USDZ/source | **4,582 f / 2,505 v** | CC-BY | Free | Civilian submachine gun — very "modern America" street-tier. |
| TastyTony — Low-Poly IMI Uzi | https://sketchfab.com/3d-models/none-d9f0070b3c924caf8fe47e41881389f0 | GLB/GLTF/USDZ/source | **5,249 f / 2,858 v** | CC-BY | Free | Full-size Uzi counterpart. |
| TastyTony — Low-Poly HK MP5 | https://sketchfab.com/3d-models/none-80980f757c2c463ebc73460a31611652 | GLB/GLTF/USDZ/source | **5,257 f / 2,905 v** | CC-BY | Free | MP5 — the archetypal modern-police SMG. |
| TastyTony — Low-Poly HK MP5SD | https://sketchfab.com/3d-models/none-a79689d37bb547c4a1ab6628f60dd05f | GLB/GLTF/USDZ/source | **5,477 f / 3,013 v** | CC-BY | Free | Suppressed MP5 — fits suppressed/SWAT loadouts. |
| TastyTony — Low-Poly UMP 45 | https://sketchfab.com/3d-models/none-4e8e3535e9d74c06b82066129ec18769 | GLB/GLTF/USDZ/source | **6,409 f / 3,471 v** | CC-BY | Free | The other standard police SMG. |
| TastyTony — Low-Poly FN P90 | https://sketchfab.com/3d-models/none-96b61ebbbf154843b621ebf7f48647fc | GLB/GLTF/USDZ/source | **6,026 f / 3,292 v** | CC-BY | Free | Distinctive PDW silhouette; also the most-liked SMG here (245 likes). |
| samanthacford — Low Poly MP7A2 | https://sketchfab.com/3d-models/none-1c279385747d413dbcddebe1a24151e8 | GLB/GLTF/USDZ/source | **6,221 f / 3,295 v** | CC-BY | Free | Compact military PDW, 9 textures. |
| TastyTony — Low-Poly Sterling SMG | https://sketchfab.com/3d-models/none-a16c9825800442848300cf29638a3a02 | GLB/GLTF/USDZ/source | 8,258 f / 4,150 v | CC-BY | Free | Historic British SMG for flavour tiers. |

---

## E. INDIVIDUAL MODELS — shotguns

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| TastyTony — Low-Poly Shotgun | https://sketchfab.com/3d-models/none-7760ad76b0b4411e9ef4e58e2acbf8f9 | GLB/GLTF/USDZ/source | **666 f / 385 v** | CC-BY | Free | Cheapest shotgun; pump/trap tier filler. |
| TastyTony — Low-Poly Remington 870 | https://sketchfab.com/3d-models/none-8766498ce778479aa03c3b6078937510 | GLB/GLTF/USDZ/source | **1,444 f / 800 v** | CC-BY | Free | **Best value American shotgun** — the 870 is the US default and it costs under 1.5k tris. |
| TastyTony — low poly Remington 870 shotgun | https://sketchfab.com/3d-models/none-2ed9680321eb4d11946184833281f495 | GLB/GLTF/USDZ/source | **2,680 f / 1,423 v** | CC-BY | Free | Second 870 pass, more detail. |
| TastyTony — Low-Poly Mossberg 590 | https://sketchfab.com/3d-models/none-c0551a6b841145f7a8e59e9304728f1f | GLB/GLTF/USDZ/source | **2,552 f / 1,438 v** | CC-BY | Free | The pump counterpart to the 870. |
| TastyTony — Remington Shotgun Low Poly | https://sketchfab.com/3d-models/none-0ebb3c3335f04ac6a57cff624fb14a81 | GLB/GLTF/USDZ/source | **2,164 f / 1,101 v** | CC-BY | Free | Third Remington option. |
| TastyTony — Low-Poly Benelli M4 Super 90 | https://sketchfab.com/3d-models/none-caea90a9470143b69e6042f75b9c59cc | GLB/GLTF/USDZ/source | 5,526 f / 2,982 v | CC-BY | Free | Semi-auto tactical shotgun — civilian/PMC tier. |
| TastyTony — Old Sawed-off shotgun | https://sketchfab.com/3d-models/none-a0bb87f8a0f043eda89d6b2278144661 | GLB/GLTF/USDZ/source | 6,736 f / 3,356 v | CC-BY | Free | Sawn-off is the correct "redneck/lynch-mob" silhouette for this setting. |
| TastyTony — Low-Poly Shotgun Shells | https://sketchfab.com/3d-models/none-7090d59effb14bd987eda7369a3da54a | GLB/GLTF/USDZ/source | 3,800 f / 1,910 v | CC-BY | Free | Loose shells as scatter/loot props. |
| TastyTony — Lowpoly shotgun shell 12 gauge | https://sketchfab.com/3d-models/none-d723c72b2f1a445a9f58c92560cfaf7a | GLB/GLTF/USDZ/source | **224 f / 114 v** | CC-BY | Free | Single-shell prop, essentially free. |
| **Poly Haven — Ammo Box** | https://polyhaven.com/a/ammo_box | GLB, FBX + 4K PBR | **4,382** | **CC0** | Free | In-budget, fully PBR, weathered military ammo crate — good dressing for any weapon slot. |

---

## F. INDIVIDUAL MODELS — sniper rifles

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| TastyTony — Lowpoly sniper rifle | https://sketchfab.com/3d-models/none-adac1eff52e14b51930188ba69962df4 | GLB/GLTF/USDZ/source | **1,408 f / 806 v** | CC-BY | Free | Cheap designated-marksman tier. |
| TastyTony — M700 Sniper Rifle Low Poly | https://sketchfab.com/3d-models/none-fcc8280b5b1e4bb28cb7c8577d2898df | GLB/GLTF/USDZ/source | **1,632 f / 814 v** | CC-BY | Free | **Remington 700 — the correct US sniper rifle**, in budget. |
| TastyTony — Low-poly sniper rifle | https://sketchfab.com/3d-models/none-e06f2fadc3494de5b85c4d0ee40c639d | GLB/GLTF/USDZ/source | **1,798 f / 940 v** | CC-BY | Free | Another budget bolt-action. |
| TastyTony — Low Poly Sniper Rifle | https://sketchfab.com/3d-models/none-578d6ffa887b4a2c87d11e6184ef3bc4 | GLB/GLTF/USDZ/source | **3,230 f / 1,825 v** | CC-BY | Free | Mid-tier. |
| TastyTony — Low-poly M24 Sniper rifle | https://sketchfab.com/3d-models/none-561e3726a95b43f7947b0d90ffd502a0 | GLB/GLTF/USDZ/source | 7,827 f / 4,293 v | CC-BY | Free | Military sniper, US standard issue. |
| TastyTony — Low-poly Barrett 50.cal Sniper rifle | https://sketchfab.com/3d-models/none-c271a28674284820a963135fcddce66d | GLB/GLTF/USDZ/source | 8,477 f / 4,743 v | CC-BY | Free | Anti-materiel/heavy tier for the campaign's late-game antagonist units. |
| TastyTony — Low-Poly SVD Dragunov | https://sketchfab.com/3d-models/none-fe40c5c2696441bc8696ed042056709e | GLB/GLTF/USDZ/source | 9,173 f / 4,978 v | CC-BY | Free | Marksman rifle, widely fielded globally. |
| TastyTony — Low-Poly Sniper Scope | https://sketchfab.com/3d-models/none-cd5d4b160e3047839be7d67dc806282f | GLB/GLTF/USDZ/source | **2,414 f / 1,517 v** | CC-BY | Free | **Detachable optic as a separate mesh** — drop-in scope attachment for the AR/Sniper tiers. |
| DJMaesen — Sniper | https://sketchfab.com/3d-models/none-ac84ffacbbb34504a528446e241465f6 | GLB/GLTF/USDZ/source | 10,005 f / 5,178 v | CC-BY | Free | Textured sniper option. |
| **Poly Haven — Bolt Action Rifle 7.62** | https://polyhaven.com/a/bolt_action_rifle_7_62 | GLB, FBX + 4K PBR | 19,985 | **CC0** | Free | Fully PBR, weathered, scoped (tags: worn, weathered, scope, bullet). **Over budget — hero/cutscene use only.** |

---

## G. INDIVIDUAL MODELS — melee (knives, bats) as backup

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| Falxxx — PS1 Style Machete | https://sketchfab.com/3d-models/none-bec7ee80bac24cc19b1e79cf8b57c50a | GLB/GLTF/USDZ/source | **102 f / 56 v** | CC-BY | Free | Machete at a rounding-error cost — ideal mass-melee. |
| Madeleinone — PS1 style low-poly butcher knife | https://sketchfab.com/3d-models/none-7ee46e7422234dcc839366e85d010074 | GLB/GLTF/USDZ/source | **70 f / 42 v** | CC-BY | Free | Cheapest melee found; 3 textures. |
| Dodecaplex — Baseball Bat | https://sketchfab.com/3d-models/none-0028b77436394fd7963c013e04e69e70 | GLB/GLTF/USDZ/source | **448 f / 226 v** | CC-BY | Free | The correct American melee weapon. |
| Isabella Crowder — Low Poly Baseball Bat | https://sketchfab.com/3d-models/none-96bdb2b0e76642e99023a3d441633077 | GLB/GLTF/USDZ/source | **520 f / 262 v** | CC-BY | Free | Bat variant, 3 textures. |
| Vishal_R — Old Survival Knife | https://sketchfab.com/3d-models/none-42496f36f25841ecae7814713cfd4db6 | GLB/GLTF/USDZ/source | **1,548 f / 779 v** | CC-BY | Free | Folding survival knife. |
| Milosz Ignaszak — Bloody post-apo baseball bat | https://sketchfab.com/3d-models/none-f3c3c73529e14dc59d525a9a6a2220cd | GLB/GLTF/USDZ/source | **1,560 f / 820 v** | CC-BY | Free | Post-apocalyptic variant of the bat — thematically on point. |
| lunea — Tactical Knife | https://sketchfab.com/3d-models/none-5fb333837f1343caa6a0e80a46b68ac1 | GLB/GLTF/USDZ/source | **2,194 f / 1,105 v** | CC-BY | Free | Modern tactical knife, 9 textures. |
| Kirilllucas — BUCK 120 General Knife | https://sketchfab.com/3d-models/none-e854d824feb14900b6963729ae122f55 | GLB/GLTF/USDZ/source | **3,100 f / 1,592 v** | CC-BY | Free | Fixed-blade combat knife. |
| FFeller — Anti-zombie baseball bat | https://sketchfab.com/3d-models/none-254602124bfe43d7993e36a6fb733820 | GLB/GLTF/USDZ/source | **5,386 f / 2,896 v** | CC-BY | Free | Spiked bat, 6 textures. |
| Belonosoff — Machete | https://sketchfab.com/3d-models/none-340a3bed238f48b0aa169c38e1e75066 | GLB/GLTF/USDZ/source | 6,180 f / 3,090 v | CC-BY | Free | Higher-detail machete. |
| **Poly Haven — Fish Knife** | https://polyhaven.com/a/fish_knife | GLB, FBX + 4K PBR | **2,736** | **CC0** | Free | In-budget **CC0, fully PBR** melee blade. Tags: dagger, survival, weapon. The only CC0 PBR melee option found. |

---

## H. Sources checked with NO usable result

| Source | Result |
|---|---|
| **Poly Haven** (https://api.polyhaven.com/assets?t=models) | Only **4 weapon models in the entire 521-model library**: Service Pistol, Bolt Action Rifle 7.62, Fish Knife, Ammo Box — all CC0, all listed above. Restricting to weapons means you get 4 assets and nothing else. |
| **Fab** (fab.com) | Search page returns 200 but is fully client-rendered; no public, scrapeable asset metadata without an account. Fab's standard licensing is Epic's own (not CC), and most useful weapon packs sit behind a login/free-tier gate. Not worth the integration cost vs. the CC0 sources above. |
| **CGTrader** free section | `https://www.cgtrader.com/free-3d-models/guns` returns HTTP 202 with a zero-byte body — bot-blocked. No content retrievable. CGTrader free models are also individually licensed (mostly "Royalty Free License", not CC) and typically far over 5k tris. |
| **Kenney (modern weapons)** | Kenney has no realistic modern-firearm pack. The only weapon-tagged 3D asset is the **Blaster Kit** (sci-fi blasters), listed above. Search endpoint `kenney.nl/assets?q=weapon` ignores the query and returns the unfiltered list, and there is no `weapon-pack` slug. |
| **Sketchfab, CC0-filtered** | The API's `license_by=cc0` parameter is **silently ignored**. No genuine CC0 weapon results were obtainable via that route; Sketchfab's practical floor is CC-BY 3.0 (or its own "Standard License", which permits commercial use without attribution). |

---

## I. Recommended sourcing plan

1. **Base modern firearm roster (CC0):** Styloo Guns Asset Pack — the only CC0 pack with native GLB. Convert Quaternius Ultimate/50+ LowPoly Guns to GLB as a second CC0 source (40 + 50 models, no license risk).
2. **Poly budget (~1k–5k tris) + named real firearms:** pull individual models from **TastyTony on Sketchfab** (CC-BY). Already have an in-budget M4A1 (6,109 f), M700 (1,632 f), 870 (1,444 f), UMP45 (1,225 f), MP5 (5,257 f), M1911 (806 f), bats and knives all under 2,200 f.
3. **Realism/hero tier:** Tabasco's OGA "Various Small Arms" (CC0/CC-BY 3.0, animated bolts) and Poly Haven's PBR Service Pistol / Bolt Action Rifle — for close-ups and cutscenes where poly budget doesn't apply.
4. **Attachments:** TastyTony "Low-Poly Sniper Scope" (2,414 f) as a drop-in optic, plus Hans Woofington's Dunkelblau pack for rigged guns + spare mags + casings.
5. **Licensing:** every CC0 option above is clean for commercial release. The CC-BY tier needs a credits file. **Avoid** the Delthor packs (custom restricted license + Unity-only), the OGA FPS weapons pack (CC-BY-SA is viral), and Ace Spectre's textures (unverifiable third-party terms on a squatted domain).