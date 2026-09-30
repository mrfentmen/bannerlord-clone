# Vehicle 3D Art Sourcing Catalog — Modern America Campaign Game

**Brief:** browser-based 3D campaign game, Mount & Blade-style, set in modern America (real US geography). Military + civilian vehicles driving on real roads.

**Scope of this document:** catalog only. **No model files were downloaded.**
**Searched:** Sketchfab (API, 425 unique downloadable models triaged), itch.io, OpenGameArt, Quaternius, Kenney, Poly Pizza, CGTrader free section, Poly Haven (checked, see §8).
**Perf target:** < ~8k tris per vehicle for browser.

### Global notes
- **Sketchfab format caveat:** the public API does not expose the download archive list (auth required). Every *downloadable* Sketchfab model can be downloaded as **GLB/glTF** plus its original source format. Treat Sketchfab entries as "GLB guaranteed via Sketchfab download; original format per listing".
- **Poly Pizza** (poly.pizza) is the single best browser-friendly source found: it hosts Quaternius and Poly-by-Google models as **direct FBX/GLTF downloads**, and prints per-model poly counts and license on each page.
- **Recommendation for the GLB pipeline:** anything sourced as FBX/OBJ/BLEND/USD needs a one-time Blender/GLTF export step. Prioritise packs already offering `.gltf`/`.glb` or Sketchfab/Poly Pizza mirrors.

---

## 1. Tanks / armored military vehicles

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Quaternius — Animated Tanks Pack** | https://quaternius.com/packs/animatedtanks.html | FBX, OBJ, Blend (+ **GLB** mirror: https://poly.pizza/bundle/Animated-Tank-Pack-0tfvbeAJkU) | ~1–2k tris/model | **CC0** | Free | 4 animated tanks, 4 rotating turrets. Smallest tank option found. Best in class for browser. |
| **Quaternius — Zombie Apocalypse Kit** (vehicle subset) | https://quaternius.com/packs/zombieapocalypsekit.html | FBX, OBJ, **glTF**, Blend | Low-poly; per-model ~1–3k | **CC0** | Free | 60 models, **animated**, textured. Includes cars + trucks. Only Quaternius kit shipping native glTF. |
| **Artisau — Toy Tanks** | https://aitordsgn.itch.io/toy-tank-3d | FBX, OBJ, **GLTF** | Low-poly (unstated) | **CC0** | Free | Stylised/simplified WWII-ish tank. Author states "no restrictions". |
| **Sketchfab — Low-poly Military Vehicles pack** (MedSamer) | https://sketchfab.com/3d-models/low-poly-military-vehicles-pack-48137988cfef4ff88f51b08b996ecc1f | GLB via Sketchfab + original | **3,746 faces** | CC-BY | Free | Tank, APC, truck, light armored cars. Pixel-art-ish stylisation. 1 model = whole pack; poly count fits budget easily. |
| **Sketchfab — K9 THUNDER ARTILLERY** | https://sketchfab.com/3d-models/k9-thunder-artillery-dda88d1dc5b34f1e95507ae848642d8a | GLB via Sketchfab | **6,898 faces** | CC-BY | Free | Self-propelled artillery. Under 8k budget. |
| **Sketchfab — Stylized Tank** (Lee Johansson) | https://sketchfab.com/3d-models/stylized-tank-5fed1107837945d2baa535291f6ee4cb | GLB via Sketchfab | 2,614 faces | CC-BY | Free | Clean, reads well at gameplay distance. |
| **CGTrader — Low Poly Tanks Pack** (3 tanks) | https://www.cgtrader.com/free-3d-models/vehicle/military-vehicle/low-poly-tank-68d0cbb9-bc4e-481d-9002-1aebd48b4f08 | OBJ, FBX, glTF, Blender, Alembic, Collada, USDZ, STL | Low-poly (unstated) | Royalty Free License (no AI) | Free | Widest format spread found. Verify per-model tris on the page. |
| **OGA — Low-Poly tank assets** | https://opengameart.org/content/low-poly-tank-assets | BLEND (verify) | Low-poly | **CC0** | Free | In OGA's "CC0 — 3D Vehicles and Cars" collection. |
| **CraftUz — Free Low Poly Tanks Pack** | https://craftuz.itch.io/free-low-poly-tanks-pack | FBX, OBJ, MTL, **GLB**, ABC, PLY, USDC, DAE, BLEND | Unstated | ⚠️ **No license text** — only an itch "Royalty Free" tag | Free | Format list is superb (includes GLB). **Do not ship without written permission** — itch defaults to all-rights-reserved. |
| ~~Sketchfab — Military Vehicles pack in low-poly (vkh3d)~~ | https://sketchfab.com/3d-models/military-vehicles-pack-in-low-poly-9b4f6eac5a874772b84fb3a4edd9b1d7 | — | 34,248 faces (16 pieces, 1.2k–5k each) | ⚠️ **None set / not downloadable** | Free (view only) | Description is ideal (16 pieces, 41k tris, 1.2k–5k each) but **download is disabled and no license** — reference-only, ping the author. |

## 2. Humvees / military jeeps

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Sketchfab — Low Poly Humvee vehicle** | https://sketchfab.com/3d-models/low-poly-humvee-vehicle-fac4178dc3db4eb9abf7f45425125e1e | GLB via Sketchfab | **1,528 faces** | CC-BY | Free | Cheapest correct Humvee found. Over-tessellate/rig a dummy if you need real M998 shape. |
| **Sketchfab — U.S. Army HMMWV (Iraq)** | https://sketchfab.com/3d-models/u-s-army-hmmwv-iraq-6801c8b642424558a7d4a6ff9931e110 | GLB via Sketchfab | **4,249 faces** | CC-BY | Free | Accurate US-spec HMMWV. Best silhouette for a modern-America game. |
| **Sketchfab — HUMVEE (LOW POLY)** | https://sketchfab.com/3d-models/humvee-low-poly-a6936c219966427c8f444d39ce87410e | GLB via Sketchfab | 7,522 faces | CC-BY | Free | Just under the 8k budget. |
| **Ravenfield Vanilla+ Asset Pack — Military Vehicles** (Sofa) | https://sofa499.itch.io/vanillaplus | `.unitypackage` (Unity 2020+, FBX inside) | Unstated, generally modest | ⚠️ **No license published on page** — Ravenfield mod assets, contains RFTools scripts | "Name your own price" | Huge: jeeps, trucks, tanks, troop carriers, helicopters, jets, warships. **Reference only** — shipping this is a licensing risk. |
| **Sketchfab — M1151 HMMWV LRAS3** | https://sketchfab.com/3d-models/m1151-hmmwv-lras3-1af4881bea4745329d8bc285b4b3ac46 | GLB via Sketchfab | 10,071 faces | ⚠️ **CC-BY-NC** | Free | Usable for non-commercial only — excluded from commercial path. |

## 3. Buses (city bus, school bus)

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Quaternius — Public Transport Pack** | https://quaternius.com/packs/publictransport.html | FBX, OBJ, Blend | ~1–2k/model | **CC0** | Free | 12 vehicles: **ambulance, school bus**, bus, taxi, train, bike. Single best bus/emergency source. |
| **OGA — 3D Bus** (ajanhallinta) | https://opengameart.org/content/3d-bus | BLEND, FBX, OBJ | 5,669 faces / **14,507 tris** | **CC0** | Free | Wheels are separate meshes (good for rolling). Above tris budget — decimate or use LOD. No interior, no textures (materials only). |
| **OGA — LowPoly Public Transport** (Quaternius mirror) | https://opengameart.org/content/lowpoly-public-transport | ZIP (BLEND) | Low-poly | **CC0** | Free | Same pack as row 1, mirrored on OGA. |
| **Poly Pizza — Schoolbus** (Poly by Google) | https://poly.pizza/m/8xacyNqdJ3t | **OBJ/GLTF**, direct download | Low-poly (Poly standard) | CC-BY | Free | Most browser-native school bus found — direct GLTF. |
| **Poly Pizza — SCHOOL BUS** (Kyle Li) | https://poly.pizza/m/2_1dZHNPJqJ | **OBJ/GLTF**, direct download | Low-poly | CC-BY 3.0 | Free | Second school bus option, direct GLTF. |
| **Sketchfab — Low Poly Bus** | https://sketchfab.com/3d-models/low-poly-bus-30cf9f7983db48c9a8450ff34c403414 | GLB via Sketchfab | **764 faces** | CC-BY | Free | Trivially cheap generic bus shell. |
| **Sketchfab — FREE School bus - Low Poly** (SophieJu) | https://sketchfab.com/3d-models/free-school-bus-low-poly-392a362ca6e6453f8c29ffbf3fc20608 | GLB via Sketchfab | 9,560 faces | CC-BY | Free | Correct American school-bus shape (flat nose, stop arm). Slightly over budget. |
| **Sketchfab — Stylized Bus 3D Model** | https://sketchfab.com/3d-models/stylized-bus-3d-model-207af6ea41b8421da589b9dafa8e760e | GLB via Sketchfab | 4,967 faces | CC-BY | Free | Under budget. |
| **VGTrader / Vyurt — Low Poly Urban Bus** | https://vyurt.itch.io/low-poly-urban-bus-3d-game-asset | 3DS, MAX, FBX, OBJ, MTL | "Low polygon count" (unstated) | Unstated on page | Paid | Listed for completeness — license and exact tris need confirming before use. |

## 4. Cars / SUVs / pickup trucks

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Kenney — Car Kit** | https://kenney.nl/assets/car-kit | GLB, FBX, OBJ, BLEND (45 files) | ~200–400 tris/car (Kenney low-poly standard; not listed) | **CC0** | Free | v3.1. Mix of body types + kart racers + debris. The default backbone for civilian traffic. Pairs with Kenney's road kits. |
| **RGS_Dev — Free Low Poly Vehicles Pack** | https://rgsdev.itch.io/free-low-poly-vehicles-pack | Unity, Unreal, Godot (FBX/GLB under the hood) | Low-poly (unstated) | **CC0** | Free | 18 vehicles, **separated wheels**: 4 police (sedan/sports/muscle/SUV), muscle, sports, roadster, sedan, hatchback, **pickup**, **SUV**, van, ambulance, monster truck, taxi, truck, truck+trailer, **bus**, **firetruck**, limo. Single best modern-US match. |
| **Pavel 3D — Low Poly City Vehicles Pack** | https://pavel-3d.itch.io/low-poly-city-vehicles-pack | FBX, OBJ, BLEND (RAR, 34 MB) | Low-poly; 5 colour variants | **CC BY 4.0** | Free | **50+ vehicles**, separated wheels, separated helicopter rotors. Broadest modern-US coverage (see §6). Attribution required. |
| **OGA — Vehicles Assets pt1** (eracoon) | https://opengameart.org/content/vehicles-assets-pt1 | BLEND inside ZIP (3.5 MB) | Low-poly | **CC0** | Free | 12 unique cars × 7 colours = **84 vehicles** from one small file. Great for populating traffic cheaply. Known issue: duplicate materials (see OGA comments). |
| **ALSTRA INFINITE — Vehicles (PolyPack)** | https://alstrainfinite.itch.io/vehicles | FBX (~60–90 kB each), 16 files | Low-poly | ⚠️ **FAL** (Free Asset License) — commercial OK **with credit**, **no redistribution/resale** | Free | Muscle cars V1–V4, pickups V1–V2, SUVs, minivans, ambulance-truck, EL/post/ice-cream trucks, "Swift". |
| **Sketchfab — 2019 Ford Ranger Raptor CIVIL** (Cities: Skylines mod) | https://sketchfab.com/3d-models/2019-ford-ranger-raptor-civil-cities-skylines-c2d4113e6acd401cb1999f81bb318325 | GLB via Sketchfab | **3,655 faces** | CC-BY | Free | Correct modern American pickup. Cities: Skylines vehicles are already game-ready proportions + separate wheels. |
| **GGbot — PSX Style Cars** | https://ggbot.itch.io/psx-style-cars | 3D (GLB/FBX), + SFX | Low-poly | **CC0** | Free | PSX-aesthetic car pack with sound effects. Also mirrored at https://opengameart.org/content/psx-style-cars |
| **maxorbie — Low Poly Cars Complete Asset Pack** | https://maxorbie.itch.io/low-poly-cars-complete-pack | `.unitypackage`, FBX, BLEND | Low-poly | ⚠️ **Unstated** on itch page | Free | 21 vehicles incl. police car, fire truck, ambulance, taxi, 2 pickups, delivery truck. Verify license in writing. |
| **Quaternius — Cars Pack** | https://quaternius.com/packs/cars.html | FBX, OBJ, Blend | ~1–2k/model | **CC0** | Free | 8 cars, untextured (single colour palette). Cheapest and safest CC0 car set. |
| **Sketchfab — Zhiguli Soviet Cars** | https://sketchfab.com/3d-models/zhiguli-soviet-cars-7c3f4bee5d37401d853d2206dc7859fc | GLB via Sketchfab | 4,044 faces | CC-BY | Free | Multi-car pack, but Lada/Soviet — wrong era for the setting. Use only for wrecks/impound. |
| **David Jakubec — 3D Low poly vehicle pack** | https://davidjakubec.itch.io/3d-low-poly-vehicle-pack | BLEND, FBX (RAR 20 MB) | Low-poly | ⚠️ **Unstated** — author says "free" in comments only | Free | 21 models: 2 buses, 5 cars, caravan, fire car, limo, pickup, police car, scooter, taxi, 3 trucks, van, plane. |

## 5. Trucks / semi-trailers

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **OGA — Semi-Trailer Truck (lowpoly)** | https://opengameart.org/content/semi-trailer-truck-lowpoly | BLEND (568 kB) | **450 tris**, 18 wheels | **CC0** | Free | 18-wheeler. Cheapest semi found; will need texturing/material work to read as US. |
| **Sketchfab — Double Trailer Semi Truck** | https://sketchfab.com/3d-models/double-trailer-semi-truck-0611ef06d0084cc082e6db6e793b8c5f | GLB via Sketchfab | **1,296 faces** | CC-BY | Free | Truck + two trailers, way under budget. Mount & Blade road-logistics traffic. |
| **Bukkbeek — Low-poly Trucks Collection** | https://bukkbeek.itch.io/low-poly-trucks-collection-free-download | FBX (1 MB), BLEND | Low-poly | Author: "feel free to use it for anything" (informal; confirm in writing) | Free | 4 game-ready trucks + base truck with **modular** trailer assets. Good for a rig-building system. |
| **CGTrader — Low Poly Truck 3D Model Pack** | https://www.cgtrader.com/free-3d-models/vehicle/truck/low-poly-truck-3d-model-pack | OBJ (22 MB) | Low-poly (unstated) | Royalty Free License (no AI) | Free | Tankers, log carriers, container trucks, flatbeds, box trailers — best trailer variety in the free tier. |
| **Sketchfab — Semi trailer freestanding** | https://sketchfab.com/3d-models/semi-trailer-freestanding-0c568e77a9604c51a280588854edad38 | GLB via Sketchfab | 3,868 faces | CC-BY | Free | Detachable trailer body. |
| **Sketchfab — Refrigerated Trailer** | https://sketchfab.com/3d-models/refrigerated-trailer-custom-model-1d23f8e7bbef4655a62ead4f92398de2 | GLB via Sketchfab | **408 faces** | CC-BY | Free | Essentially free polys. Pairs with a tractor unit. |
| **Sketchfab — Simple tank trailer** | https://sketchfab.com/3d-models/simple-tank-trailer-738d0e2db6584fe39d4bf9b284c7b614 | GLB via Sketchfab | 4,144 faces | CC-BY | Free | Hazmat tanker for convoy/route-blocking gameplay. |
| **Stanisko — Semi trucks, low poly, game ready** | https://stanisko.itch.io/semi-trucks-low-poly-game-ready | ZIP (821 kB, FBX) | Low-poly | ⚠️ **Unstated** | Free | 2 semis, all wheels separated, single palette. Verify license. |
| **Quaternius — Zombie Apocalypse Kit** (truck/camper subset) | https://quaternius.com/packs/zombieapocalypsekit.html | FBX, OBJ, **glTF**, Blend | Low-poly | **CC0** | Free | Animated civilian trucks + wrecks. |
| **Megapoly.Art — Trucks & Trailers I** | https://assetstore.unity.com/packages/2d-vehicles/trucks-trailers-i | Unity `.unitypackage` (URP/HDRP) | Low-poly, mobile-tuned | Proprietary | **Free *for learning/testing only*** — explicitly **not for commercial use** | 3 tractor cabs + 5 trailer types. Good reference; **do not ship**. |

## 6. Police cars, ambulances, fire trucks

> Note: the two packs with the best modern-US emergency coverage (RGS_Dev and Pavel 3D) are listed in §4 — both include police, ambulance and fire apparatus, so importing one pack covers both §4 and §6.

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Pavel 3D — Low Poly City Vehicles Pack** (emergency subset) | https://pavel-3d.itch.io/low-poly-city-vehicles-pack | FBX, OBJ, BLEND | Low-poly | **CC BY 4.0** | Free | Emergency: ambulance, air ambulance, emergency van, **firetruck**. Police: sedan, SUV, van, truck, helicopter. SWAT + special variants. Best single pack for §6. |
| **RGS_Dev — Free Low Poly Vehicles Pack** (emergency subset) | https://rgsdev.itch.io/free-low-poly-vehicles-pack | Unity, Unreal, Godot | Low-poly | **CC0** | Free | 4 police cars (sedan/sports/muscle/SUV), ambulance, firetruck, taxi, monster truck. **CC0 + modern-US shapes = lowest-friction choice.** |
| **CGTrader — Low poly emergency vehicles** | https://www.cgtrader.com/free-3d-models/vehicle/other/low-poly-emergency-vehicles | 2.11 MB (format not stated on page) | Low-poly | Royalty Free License (no AI) | Free | Police car + ambulance + fire truck set. Digital use only (not 3D-print). |
| **CGTrader — low poly pickup police and fire truck** | https://www.cgtrader.com/free-3d-models/vehicle/truck/low-poly-pickup-police-and-fire-truck | FBX, OBJ, Maya 2020 | **3,244 faces**, 3,338 verts | Royalty Free License | Free | Real-world scale, one standard material. Explicit poly count — ideal for browser budget. |
| **Sketchfab — Fire Truck** | https://sketchfab.com/3d-models/fire-truck-e0fadd42bd3b448eaa0eb660764c170a | GLB via Sketchfab | **474 faces** | CC-BY | Free | Near-free polys. Untextured/basic — needs material work. |
| **Sketchfab — AMBULANCE CAR - LOW POLY** | https://sketchfab.com/3d-models/ambulance-car-low-poly-25392b75045946f7a4c9a03e3bea969e | GLB via Sketchfab | 3,654 faces | CC-BY | Free | Correct US box-ambulance profile. |
| **Sketchfab — Playstation 1 Police car low poly** | https://sketchfab.com/3d-models/playstation-1-police-car-low-poly-a1772a2ed6e44ee69cb705b8f1275495 | GLB via Sketchfab | **2,508 faces** | CC-BY | Free | Under budget, cruiser silhouette. |
| **Sketchfab — 2019 Ford Ranger Raptor POLICE** (Cities: Skylines mod) | https://sketchfab.com/3d-models/2019-ford-ranger-raptor-police-cities-skylines-47ce3eac47524efc85363cca7513751a | GLB via Sketchfab | **3,723 faces** | CC-BY | Free | Modern US police pickup, sibling of the civilian model in §4. |

---

## 7. Supporting / environment packs that include vehicles

| Pack/Model | URL | Format | Polys | License | Price | Notes |
|---|---|---|---|---|---|---|
| **Sketchfab — PSX Industrial Pack** | https://sketchfab.com/3d-models/psx-industrial-pack-12cb749961974f94a4063e67dafb2d76 | GLB via Sketchfab | 8,622 faces (whole pack) | CC-BY | Free | Industrial vehicles/props, PSX look. Right at the budget ceiling. |
| **Sketchfab — Modular City Road Pack (Game Ready)** | https://sketchfab.com/3d-models/modular-city-road-pack-game-ready-d9df5cfa079f4da8a18ef1372c00d01c | GLB via Sketchfab | 9,402 faces (whole pack) | CC-BY | Free | Roads + traffic. Pairs with Kenney road kits for the "real roads" requirement. |
| **Sketchfab — Royal 59 FREE / WarHavoc Survival Car Pack** | https://sketchfab.com/3d-models/royal-59-free-warhavoc-survival-car-pack-efbcde2e51fc46b4bcc097cfc9d9eaab | GLB via Sketchfab | 6,218 faces | CC-BY | Free | Wrecked/survivalist civilian cars — useful for post-battle roadblock dressing. |
| **Kenney — City Kit (Roads)** | https://kenney.nl/assets/city-kit-roads | GLB, FBX, OBJ, BLEND | Low-poly | **CC0** | Free | Companion to Car Kit; road + intersection geometry. |
| **Ahmad Merheb — Stylized Lowpoly Vehicle Pack #1** | https://ahmadmerheb.itch.io/stylized-lowpoly-vehicle-pack-1 | OBJ, FBX (3.7 MB) | Low-poly | Proprietary (broad use grant stated) | **$9.99** | 9 models: truck, taxi, police car, garbage truck, **bus**, car, **ambulance**, 2× 4x4. Cheap paid fallback. |
| **Mighty Handful — Cartoon Vehicles Pack 1 / 3 / Full** | https://assetstore.unity.com/packages/slug/146263 | Unity `.unitypackage` | Low-poly | Proprietary | $9 / $9 / $28 | Stylised civilian + emergency fleet if the free sets run out. |

## 8. Sources checked with no / poor vehicle coverage

| Source | Result |
|---|---|
| **Poly Haven** | No vehicle models. Library is HDRIs, PBR textures, and architecture/nature props only. **Not applicable.** |
| **Fab** (Epic) | Vehicle content exists but is almost entirely paid or Epic-unlimited-gated; free tier requires an Epic account and per-asset license review. **Not pursued** — use Kenney/Quaternius/itch instead. |
| **OpenGameArt** | Strong for *civilian* CC0 cars/buses/semis; thin or absent for modern military (WWII/alt-history dominates) and for police/ambulance. Best OGA finds are in §3–§5. |
| **Sketchfab** | Excellent individual low-poly finds, but almost everything is **CC-BY** (attribution required) and **non-commercial variants are mixed in** — filter `license=cc0,cc-by` on every search. No official "pack" pages worth licensing wholesale. |
| **Kenney** | Car Kit is the one must-have. Kenney has **no military/tank assets**. |

---

## 9. License concerns — read before adopting anything

**Hard blockers / do not ship:**
1. **Ravenfield Vanilla+ Asset Pack** (Sofa) — **no license published**, assets are Ravenfield mod content and the Unity package **bundles third-party RFTools scripts**. Treat as reference-only.
2. **Megapoly.Art — Trucks & Trailers I** — explicitly **"NOT FOR COMMERCIAL PURPOSES"** on the free download. Reference only.
3. **CraftUz — Free Low Poly Tanks Pack** — **no license text at all**, only an itch "Royalty Free" *tag* (a tag is not a license). Get written confirmation or skip.
4. **CC-BY-NC / CC Attribution-NonCommercial items** were found in nearly every category (Japanese Nagoya City Bus, M1151 HMMWV LRAS3, ZET Jeep Coupé camos, several Sketchfab "camp scene"/"free standard" uploads). **These are excluded from the tables above for that reason** — they are fine for prototypes and non-commercial builds only. Always filter out `-NC` variants before building a release pipeline.

**Attribution obligations (fine, but must be honoured):**
5. **CC-BY** on all Sketchfab finds — requires visible credit (author + license + link) in your game's credits.
6. **CC-BY 4.0** on **Pavel 3D — Low Poly City Vehicles Pack** — the single most useful modern-US pack is attribution-required. Budget a credits-screen entry.
7. **CC-BY** on the Poly-by-Google Poly Pizza models (Schoolbus, Bus, Chevrolet Camaro, Ambulance, Poly by Google set) — CC-BY, not CC0.
8. **FAL (Free Asset License)** on ALSTRA INFINITE PolyPack — commercial use is fine **with credit**, but **reselling or redistributing the source assets is not**. Do not re-export and redistribute their FBX files as your own pack.

**Grey area — get written confirmation before shipping:**
9. **maxorbie — Low Poly Cars Complete Asset Pack**, **David Jakubec — 3D Low poly vehicle pack**, **Stanisko — Semi trucks**, **amaraha free tiers**, **Bukkbeek — Low-poly Trucks Collection**, **Vyurt — Low Poly Urban Bus**: all itch.io pages either omit the license or rely on an informal comment. **itch.io's default is all-rights-reserved**, so silence is not permission.

**Practical recommendation:** build the game on a **CC0 spine** — **Kenney Car Kit** + **Quaternius (Cars Pack, Public Transport Pack, Zombie Apocalypse Kit, Animated Tanks Pack)** + **RGS_Dev Free Low Poly Vehicles Pack** + **OGA Vehicles Assets pt1** + **OGA Semi-Trailer Truck**. That covers every requested subcategory at CC0 with no attribution strings to ship. Layer **Pavel 3D** (CC-BY 4.0) on top only where the CC0 set falls short (its 50+ modern-US emergency and police models are genuinely not matched by any CC0 set), and accept the credits-screen cost.

---

*Catalog only — no model files were downloaded. Poly counts are as published by each source; "unstated" means the source does not publish a count and it must be verified on the product page after download.*
