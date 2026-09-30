# 3D Character Models — Code Reuse Catalog (characters, not code)

**Project:** Mount & Blade-style browser campaign game, modern America (Babylon.js 8 client)
**Target:** Rigged, game-ready humans. Budget aim: **< ~15k tris per character** for browser crowd rendering.
**Animation source:** Mixamo — Mixamo-compatible/humanoid rigs win.
**Scope:** Modern civilians, soldiers/militia, police.
**Method:** Catalog only — no files downloaded. Licenses recorded per find, never assumed.
**Date:** 2026-09-30

---

## Master Table

| Model / Pack | URL | Format | Rig | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|---|
| **Quaternius — Ultimate Modular Men Pack** | https://quaternius.com/packs/ultimatemodularcharacters.html | FBX, glTF | Humanoid, shared `CharacterArmature` rig, 24 baked clips | Low (stylized) | **CC0** | Free | **THE core pick.** 11 characters: Adventurer, King, Farmer, Hoodie, Beach, **Casual**, Worker, Punk, **SWAT**, Business Man, Astronaut. Modular swappable parts. One coherent style, one rig. Confirmed by 5+ independent projects. |
| **Quaternius — Ultimate Modular Women Pack** | https://quaternius.com/packs/ultimatemodularwomen.html | FBX, glTF | Humanoid, shared rig, 24 clips | Low (stylized) | **CC0** | Free | Female variants incl. **soldier**, witch, woman, scifi. Same rig family as men pack. |
| **Quaternius — Universal Base Characters** | https://quaternius.com/packs/universalbasecharacters.html | FBX, glTF | **Humanoid rig, retargeting-ready** | **~13k avg** | **CC0** | Free (60–70% of pack) | 6 base models (Superhero/Regular/Teen × M/F), 20 hairstyles, skin/eye customization. Designed for animation retargeting incl. Mixamo. |
| **Quaternius — Universal Animation Library** | https://quaternius.com/packs/universalanimationlibrary.html | glTF | Universal humanoid rig | N/A (anims) | **CC0** | Free | **120+ animations**, CC0. The animation backbone: retarget onto any humanoid rig incl. the modular packs and Mixamo rigs. |
| **Quaternius — Modular Character Outfits (Fantasy)** | https://quaternius.itch.io/modular-character-outfits-fantasy | FBX, glTF | Humanoid | Low | **CC0** | Free | 6 base models, 20 hairstyles, 12 outfits / 62 modular parts. Outfit-swap system reference. |
| **Quaternius — Animated Men Pack (4-pack)** | https://poly.pizza (search "Quaternius animated men") | GLB | `CharacterArmature`, 24 clips | Low | **CC0** | Free | Farmer, Worker, Adventurer, Casual as individual GLBs. Clip set **includes gun animations**: Gun_Shoot, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Run_Shoot. Directly useful for armed civilians/militia. |
| **Poly Pizza — Ultimate Modular Men bundle** | https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ | GLB (per model) | Shared rig, 24 clips | Low | **CC0** | Free | All 11 men as individual downloadable GLBs. Fastest route to a working character. |
| **Poly Pizza — Ultimate Modular Women bundle** | https://poly.pizza/bundle/Ultimate-Modular-Women-Pack-aCBDXDdTNN | GLB (per model) | Shared rig, 24 clips | Low | **CC0** | Free | All women as individual GLBs. |
| **Quaternius SWAT (direct)** | https://poly.pizza/m/Btfn3G5Xv4 | GLB | Shared rig, 24 clips | Low | **CC0** | Free | **Tactical character, CC0.** The soldier/militia/SWAT base. Used in production by multiple shipped browser games. |
| **three.js Soldier.glb** | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb | GLB | **Mixamo rig** (mixamorig joints) | ~2.2 MB file | **MIT** | Free | Mixamo-sourced soldier, baked Idle/Walk/Run/TPose. MIT via three.js examples. Instant Mixamo-animation-compatible soldier. |
| **three.js Xbot.glb** | https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb | GLB | **Mixamo rig** (standard test char) | ~2.9 MB file | **MIT** | Free | Mixamo's own test character. The canonical Mixamo-rig reference model. |
| **Mixamo characters (official)** | https://www.mixamo.com | FBX (+ auto-rig) | **Mixamo rig** (native) | Varies | **Royalty-free commercial** (Adobe terms, NOT open source) | Free (Adobe ID) | ~100 free characters incl. soldiers, SWAT, cops, civilians. Animations auto-applied. **Caveat:** no standalone redistribution of source files — keep FBX out of any public repo; only shipped game binaries. |
| **Omer Bhatti — Low Poly Police And Robber (Animated)** | https://sketchfab.com/3d-models/low-poly-police-and-robber-animated-b2a9ae4084184c8f8f7cbc00caf12d9c | GLB + original | Rigged + animated | **9.9k** | CC-BY | Free | **Police + robber pair, rigged and animated.** Under budget. Needs attribution. |
| **Alstra Infinite — Low Poly Characters (Cop + Robber)** | https://sketchfab.com/3d-models/low-poly-characters-rigged-animated-27a232143ccc462588c062f4f7bc3cc7 | GLB + original | Rigged, 6 anims (Idle/Run cop + robber) | **3.6k** | License unverified (page states downloadable) | Free | Cop + robber, tiny poly count, ships with police baton prop. **Verify license on page before use.** |
| **DanlyVostok — Soldier Full Tactical Gear (LowPolyGameReady)** | https://sketchfab.com/3d-models/soldier-full-tactical-gear-lowpoly-850593a8c7114c188395ba1849a66eb9 | GLB + original | Rigged (verify) | Not listed | License unverified | Free | Full tactical gear soldier. **Verify license + poly count before use.** |
| **samanthacford — Low Poly Soldiers** | https://sketchfab.com/3d-models/low-poly-soldiers-6079b29d21564db5ba141e0de0c456fe | GLB + original | Not stated | **30.1k** | License unverified | Free | US military w/ ERDL/Snow camo + M4/M16 rifles. **Over the 15k budget** — decimate or LOD only. |
| **rustic.orcullo13 — Infantry** | https://sketchfab.com/3d-models/infantry-7db6df32a8774301880a41e2becfbd0e | GLB + original | Not stated | **1.4k** | CC-BY | Free | Ultra-low-poly infantry. Needs attribution. Good for distant crowd filler. |
| **MrMGames — Soldier Character (voxel)** | https://mrmgames.itch.io/soldier-character-3d-voxel-low-poly-model | OBJ, DAE, MTL | **Humanoid rig**, 7 anims (Idle/Run/Jump/Dodge/Hit/Attack/Death) | **1.8k** | License unverified (itch page) | Free | Voxel-style soldier, very cheap. **Verify license on itch page before use.** |
| **00amza — Prisoner Hostage Low Poly** | https://sketchfab.com/3d-models/prisoner-hostage-low-poly-character-dae7e2ff73cd4ece8d7655d1f4fcbb1b | GLB + original | **Mixamo rig**, T-pose | **2.3k** | CC-BY | Free | Prisoner/hostage/civilian-unrest character, Mixamo-rigged. Needs attribution. Useful for riot/unrest scenarios. |
| **saladudo — Enforcer** | https://sketchfab.com/3d-models/enforcer-4e0d0ad5cace4011a91add440e948bf0 | GLB + original | Rigged | **3.4k** | **CC-BY-ND** | Free | SWAT/enforcer look, under budget — **REJECTED: NoDerivs forbids modification. Cannot use.** |

---

## Coverage by Category

| Category | Best picks | Gaps |
|---|---|---|
| **Modern civilians** | Quaternius Modular Men (Casual, Hoodie, Beach, Punk, Business Man) + Women pack; Quaternius Animated 4-pack (Farmer/Worker/Adventurer/Casual w/ gun clips) | **Covered.** 15+ civilian variants, all CC0, one shared rig. |
| **Soldiers / militia** | Quaternius SWAT (CC0); three.js Soldier.glb (MIT, Mixamo rig); Mixamo's own soldiers | **Covered.** SWAT as CC0 base + Mixamo characters for variety. |
| **Police** | Quaternius master FBX ships **police + security outfits** (per breachpoint CREDITS); Omer Bhatti Police+Robber (CC-BY, animated); Alstra Infinite Cop (3.6k, verify license) | **Covered with a caveat.** Dedicated US police uniform = Quaternius police outfit or Omer Bhatti. The building-pack gap (US precinct) remains the harder problem. |

---

## Rig / Animation Strategy

1. **One rig to rule them all:** Quaternius modular packs share a single `CharacterArmature` rig with 24 baked clips. Standardize the crowd pipeline on it.
2. **Mixamo bridge:** Quaternius Universal Base Characters are built for humanoid retargeting — Mixamo animations retarget onto them. three.js Soldier.glb / Xbot.glb are native Mixamo rigs and MIT.
3. **Animation library:** Quaternius Universal Animation Library (120+ CC0 clips) + Mixamo's animation catalog = the full moveset without authoring a single clip.
4. **Crowd rendering:** shared rig + shared clips + vertex-color materials (no textures on Quaternius) = ideal for GPU instancing / VAT baking at the battle-size-knob scale.

## License Concerns

1. **CC0 is the safe core.** All Quaternius packs (modular men/women, base characters, animation library, animated 4-pack) are CC0 — commercial-safe, no attribution, no viral terms. Build the character roster on these.
2. **MIT is safe.** three.js Soldier.glb and Xbot.glb are MIT via the three.js repo — Mixamo-rigged and redistributable.
3. **Mixamo's own characters are royalty-free, NOT open source.** Adobe permits commercial use in end products but forbids standalone redistribution of the source files. Keep Mixamo FBX files out of any public repo; only the shipped game build may contain them.
4. **Sketchfab CC-BY needs attribution.** Omer Bhatti, rustic.orcullo13, 00amza — ship a credits screen.
5. **CC-BY-ND is a hard reject.** saladudo's Enforcer cannot be modified — excluded.
6. **Unverified licenses = do not use yet.** Alstra Infinite cop, DanlyVostok tactical soldier, MrMGames voxel soldier — verify the license text on the source page before committing.
7. **rigmodels.com "Royalty Free" is not verifiable.** Skip — terms are unclear and poly counts are too high anyway.
