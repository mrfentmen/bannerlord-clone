# Agent 8 — VEHICLES REVIEW: Picks, License Flags, Style Fit

**Scope:** review + recommendation over `agents/asset-packs/vehicles.md` (56 finds), filtered through the
verified verdicts in `agents/asset-packs/licenses.md` (173 finds checked by Agent 4).
**Status:** review only — **no files downloaded, no source files modified, nothing committed.**
**Setting constraint:** browser 3D campaign game, modern America, Mount & Blade-style. glTF/GLB pipeline, Babylon.js 8.
**Poly budget applied:** ≤ ~8k tris per vehicle (catalog target); buildings guide was ~10k, so vehicles stay under.

---

## 1. The 10 picks

Ordered by value-per-import. Every pick is SAFE or ATTRIBUTION-REQUIRED in Agent 4's verification — nothing
unverified survives here. **7 of 10 are CC0.**

| # | Pack / Model | URL | Format | Polys | License | Price | Fit |
|---|---|---|---|---|---|---|---|
| 1 | **RGS_Dev — Free Low Poly Vehicles Pack** | <https://rgsdev.itch.io/free-low-poly-vehicles-pack> | Unity / Unreal / Godot wrappers (FBX+GLB inside) | Low-poly (unstated; expect sub-3k) | **CC0** | Free | **The one import that closes §4 + §6 at once:** 4 police variants (sedan / sports / muscle / SUV), ambulance, firetruck, taxi, sedan, hatchback, pickup, SUV, van, truck+trailer, bus, limo, monster truck. Separated wheels. |
| 2 | **Kenney — Car Kit** | <https://kenney.nl/assets/car-kit> | GLB, FBX, OBJ, BLEND (45 files) | ~200–400 tris/car | **CC0** | Free | Civilian traffic backbone at ~1/20th the tri cost of everything else; same author as the already-picked Kenney City Kits, so it drops into the world shell with zero art reconciliation. |
| 3 | **maxorbie — Low Poly Cars Complete Asset Pack** | <https://maxorbie.itch.io/low-poly-cars-complete-pack> | `.unitypackage`, FBX, BLEND | Low-poly | **CC0** | Free | 21 vehicles incl. **police car, fire truck, ambulance, taxi, 2 pickups, delivery truck** — independent emergency-fleet redundancy so one bad UV set can't break the police/EMS layer. *(Catalog called this "unstated"; Agent 4 verified CC0.)* |
| 4 | **Quaternius — Public Transport Pack** | <https://quaternius.com/packs/publictransport.html> | FBX, OBJ, Blend | ~1–2k/model | **CC0** | Free | 12 vehicles: **ambulance, school bus, city bus, taxi, train, bike** — the cheapest legitimate fill for the school-bus and motorcycle gaps the rest of the catalog leaves open. |
| 5 | **Quaternius — Animated Tanks Pack** | <https://quaternius.com/packs/animatedtanks.html> + GLB mirror <https://poly.pizza/bundle/Animated-Tank-Pack-0tfvbeAJkU> | FBX, OBJ, Blend, **GLB** | ~1–2k tris/model | **CC0** | Free | 4 tanks with **rotating turrets** already animated — the only CC0 armoured option anywhere in the catalog, and the only one with native GLB. Rotating turret is a Mount & Blade campaign-flanker feature for free. |
| 6 | **OGA — Vehicles Assets pt1** (eracoon) | <https://opengameart.org/content/vehicles-assets-pt1> | BLEND in ZIP (3.5 MB) | Low-poly | **CC0** | Free | 12 cars × 7 colours = **84 instances from one 3.5 MB file** — the cheapest possible way to populate a highway with non-identical traffic. Known issue: duplicated materials in the blend; merge on import. |
| 7 | **OGA — Semi-Trailer Truck (lowpoly)** | <https://opengameart.org/content/semi-trailer-truck-lowpoly> | BLEND (568 kB) | **450 tris**, 18 wheels | **CC0** | Free | Cheapest 18-wheeler found; 18 separated wheels roll correctly for free. Road-logistics traffic and the moving-parties/chase layer. Needs a texture/material pass to read as US rather than generic. |
| 8 | **Pavel 3D — Low Poly City Vehicles Pack** | <https://pavel-3d.itch.io/low-poly-city-vehicles-pack> | FBX, OBJ, BLEND (RAR, 34 MB) | Low-poly, 5 colour variants | **CC-BY 4.0** | Free | **Deepest modern-US coverage of anything found** — 50+ vehicles: police sedan/SUV/van/truck/**helicopter**, ambulance, **air ambulance**, emergency van, firetruck, SWAT variants. Only pack with an aircraft. Costs one credits-screen row. |
| 9 | **Sketchfab — Low-poly Military Vehicles pack** (MedSamer) | <https://sketchfab.com/3d-models/low-poly-military-vehicles-pack-48137988cfef4ff88f51b08b996ecc1f> | GLB via Sketchfab + original | **3,746 faces** | **CC-BY 4.0** | Free | Modern armour in one download: tank, APC, truck, light armoured cars. Half the 8k budget, so several can be co-resident in a battle scene. The only modern-military pack that clears budget *and* verification. |
| 10 | **Sketchfab — U.S. Army HMMWV (Iraq)** (42manako) | <https://sketchfab.com/3d-models/u-s-army-hmmwv-iraq-6801c8b642424558a7d4a6ff9931e110> | GLB via Sketchfab | **4,249 faces** | **CC-BY 4.0** | Free | Accurate US-spec HMMWV silhouette — the vehicle the setting actually implies. Complements #9 (which is generic) with one correct hero asset. |

### Category coverage after the picks

| Requested category | Covered by | Status |
|---|---|---|
| Police cruisers | RGS_Dev (4 variants) + maxorbie + Pavel 3D | **Strong.** Three independent sources, so liveries can differ by agency. |
| Civilian sedans / SUVs | Kenney Car Kit + RGS_Dev + OGA pt1 | **Strong.** |
| Trucks / semis | OGA Semi (CC0) + RGS_Dev truck+trailer + Pavel 3D | **Adequate.** Trailer variety is the weak half — see gaps. |
| Ambulances | RGS_Dev + maxorbie + Quaternius Public Transport | **Strong.** |
| Military vehicles | Quaternius Tanks (CC0) + MedSamer + 42manako HMMWV | **Adequate — but everything here is CC-BY except generic Quaternius tanks.** |
| Motorcycles | Quaternius Public Transport "bike" only | ⚠️ **Not really covered.** See §4. |
| Buses / school buses | Quaternius Public Transport + RGS_Dev bus | **Covered.** |

---

## 2. Licence red flags

### 🚩 Hard blockers — removed from the recommendation despite attractive specs

**Every CGTrader find in the catalog is unusable.** This is the single biggest red flag in the file: four entries
that looked like the best-value options in their categories are all dead on arrival.

| Find | Why it looked good | Verdict |
|---|---|---|
| CGTrader — low poly pickup police and fire truck | **3,244 faces with an explicit count**, real-world scale, FBX/OBJ | **REJECTED — unverifiable.** Page returns HTTP 202 with a zero-byte body (Cloudflare bot challenge). "Royalty Free License" is unconfirmed and unreadable by any automated means. Independently confirmed blocked by Agent 3. |
| CGTrader — Low Poly Tanks Pack (3 tanks) | Widest format spread in the whole catalog (OBJ/FBX/glTF/USDZ/Alembic) | **REJECTED — same bot block.** |
| CGTrader — Low Poly Truck 3D Model Pack | Best trailer variety in the free tier | **REJECTED — same bot block.** |
| CGTrader — low poly emergency vehicles | Police + ambulance + fire set | **REJECTED — same bot block.** |

If we want CGTrader content, a human must open all four pages in a browser and paste the license text into the repo.
That is a 15-minute task with a real payoff (the pickup police/fire truck alone fills the emergency gap).
Until then: assume CGTrader is not a source.

Other blockers:

- **Sketchfab — M1151 HMMWV LRAS3 — CC-BY-NC.** "No commercial use." Excluded from the release path. Do not let it back in via a search result.
- **Ravenfield Vanilla+ Asset Pack (Sofa)** — no published licence, *and* the Unity package bundles third-party **RFTools scripts**. Twice bad. Reference only.
- **Megapoly.Art — Trucks & Trailers I** — URL 404s (dead), and Unity Asset Store EULA is proprietary regardless. Never ship.
- **CraftUz — Free Low Poly Tanks Pack** — **no licence text at all**, only an itch "Royalty Free" *tag*; a tag is not a licence. Painful because its format list is the best in the catalog (GLB/ABC/USDC/DAE/BLEND). Write to the author or skip.
- **Sketchfab — Military Vehicles pack in low-poly (vkh3d)** — no licence set *and* `isDownloadable=False`. The description is ideal (16 pieces, 1.2k–5k each) which makes it worth a ping to the author, but it is unusable as-is.

### 🚩 Attribution-required (fine — but each one is a credits-screen row)

All picks #8/#9/#10 are CC-BY 4.0. Per Agent 4's report, CC-BY carries **no share-alike obligation**, so the
game's own code and assets stay proprietary — this is bookkeeping, not a licensing risk. Credit strings,
copied from Agent 4's verification table:

- Pavel 3D — `Pavel 3D, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/` + pack link.
- MedSamer military pack — `MedSamer, CC BY 4.0, …` (verify uploader name on the model page at download time).
- 42manako HMMWV — `42manako, CC BY 4.0, …`.

**Take the attribution strings from the Sketchfab model page at download time, not from this file.** Agent 4
found **23 weapon models credited to the wrong uploader** ("TastyTony" was actually szaw, notcplkerry, DJMaesen,
aBraM_ and others) — a direct CC-BY breach caused by trusting a summary table instead of the API. There is also a
small internal inconsistency for our Humvee: Agent 4's verdict table says **"Duane's Mind"** while the credits
summary lists **"Duane"**. Trust the page.

### ⚠️ Notes, not blockers

- **ALSTRA INFINITE PolyPack (FAL)** — commercial use is fine **with credit**, but redistribution/resale of the
  source FBX is forbidden. Shippable in the game, must not be re-exported into a public asset repo. Not picked
  (superseded by Pavel 3D, which is broader and uses a standard licence), but keep it as the muscle-car/SUV fallback.
- **David Jakubec — 3D Low poly vehicle pack** — catalog said "unstated"; Agent 4 found a real **CC-BY 4.0** on the
  page. Usable with attribution, *not* the grey-area item the catalog implies. 21 models incl. police car, fire car,
  taxi, scooter, 3 trucks. A reasonable 4th-tier expansion.
- **Unity Asset Store paid packs** — Mighty Handful Cartoon Vehicles ($9 / $9 / $28) is a **Single Entity** licence:
  commercial use is permitted, but it needs a purchase and consumes a seat. Legitimate, just not free and not
  CC0-equivalent. Only buy it if the CC0 spine genuinely runs dry.

### ✅ Positive finding

**The vehicles catalog contains zero SA/viral finds.** The ShareAlike traps in this project are all in the
buildings catalog (MRowa Apartment Houses + Roads/Bridges at CC-BY-SA; the OGA "Modern building" at CC-BY-SA
**plus GPL**). Vehicles are clean — no `*-NC`, no SA, no ND survives into the picks. That is worth protecting:
keep it that way by refusing Sketchfab search results without checking the licence badge first.

---

## 3. Style pairing with the chosen character and building packs

The brief is stylised low-poly, not realistic — so consistency is a **palette-and-silhouette** problem, not a
detail problem. The good news is the already-chosen assets are from two authors with two established looks.

### Tier A — drops in with zero art work

| Pair | Why |
|---|---|
| **Kenney Car Kit** ↔ **Kenney City Kits (Suburban/Commercial/Industrial/Roads)** | Same author, same flat-shaded 200–400-tri dialect, same vertex-colour material approach, same GLB convention. A Kenney car parked outside a Kenney shop needs nothing done to it. **This is the reason Kenney Car Kit is pick #2 rather than an afterthought.** |
| **Kenney Car Kit** ↔ **Kenney City Kit (Roads)** | Companion by design — road/intersection geometry and vehicle geometry share one scale convention, so alignment and lane widths come out right the first time. |

### Tier B — matches the characters

| Pair | Why |
|---|---|
| **Quaternius packs** (Public Transport #4, Animated Tanks #5) ↔ **Quaternius Ultimate Modular Men/Women** | Same studio dialect: faceted low-poly, untextured vertex-colour shading, similar proportions. A Quaternius soldier dismounting a Quaternius bus reads as one art style, and the vehicle animations use the same clip conventions as the character rig family. |
| **Quaternius Animated Tanks** ↔ any Quaternius character | Turret/animation conventions match, so a crew can be posed in the turret without a retargeting detour. |

### Tier C — close enough, needs one palette pass

**RGS_Dev (#1), maxorbie (#3), Pavel 3D (#8)** are independent itch low-poly packs. They are not Kenney and not
Quaternius, but they sit in the same general band, and the cost of reconciliation is a **single vertex-colour /
toon-shader pass plus one shared ramp of road, chrome, glass and paint**. Do that pass once across all three and
they read as the same world. Note that RGS_Dev and Pavel 3D both already ship separated wheels and multi-colour
variants, which is the thing that actually matters for a traffic system.

### ⚠️ Style-drift risks to manage

1. **The Sketchfab military models (#9, #10) are the highest-drift items in the set.** They are individually fine
   but lit and shaded more "model-viewer" than "game asset". Confine them to silhouettes, night scenes, and distant
   column shots; put the close-up hero vehicles on Kenney/Quaternius where we control the shading.
2. **Do not mix the PSX/PS1 dialect with the Kenney dialect.** GGbot PSX Style Cars (#spare), the Sketchfab PS1
   police car, and the PSX Industrial Pack all share a late-90s pixel-art look that clashes with Kenney's flat-shade
   under the same lighting. Pick one dialect per scene, not per asset. GGbot is CC0 and ships **GLB + SFX**, which
   makes it attractive as a *standalone* PSX-styled mode — but not as filler inside Kenney city blocks.
3. **Untextured packs need the material pass too.** Quaternius Cars/Public Transport, the OGA 3D Bus, and the OGA
   semi are material-only. They are the cheapest to unify, not exempt from unification.
4. **Recommendation:** standardise on the **Kenney dialect for the world shell** (civilian traffic, streets, props)
   and the **Quaternius dialect for anything that animates or carries crew** (buses, tanks, mounted characters).
   Then recolour the Tier-C packs into whichever of the two they land closest to, once, at import.

---

## 4. Gaps the catalog does not close

1. **Motorcycles are effectively uncovered.** The only motorcycle-adjacent entries are the Quaternius Public
   Transport "bike" (pick #4 — needs a visual check that it is a motorcycle and not a bicycle) and David Jakubec's
   "scooter" (CC-BY 4.0). There is **no dedicated CC0 modern-American motorcycle pack** in the catalog, and motor
   units are a signature Mount & Blade roster category. Either commission one or run one focused CC0 search.
2. **Modern military at CC0 does not exist.** Quaternius Animated Tanks is the only CC0 armoured asset and its
   silhouettes are generic. Every *accurate* modern military vehicle is CC-BY. Accept the credits cost rather than
   shipping wrong-era armour — the setting is specifically modern America.
3. **Trailer variety is thin at verified licences.** The two best trailer collections (CGTrader truck pack,
   Bukkbeek's modular trailers) are both rejected. The OGA semi (#7) plus Pavel 3D (#8) is what we have; a rig
   builder built from those two is a real art task, not a freebie.
4. **No US police precinct to drive the cruisers to** — carried over from Agent 1's buildings gap. The highest-value
   commissioned asset in the whole project.
5. **Unstated tri counts** on RGS_Dev, Pavel 3D, OGA pt1 and both Quaternius car/transport packs. They are all
   *described* as low-poly and every comparable sibling in the same table is 1–4k, but these four must be measured
   on the product page after download before they enter the pipeline.

---

## 5. Buy / download order

**First three — $0.00 total.** The vehicle spine does not require spending anything.

| Order | Pack | Why first | Cost |
|---|---|---|---|
| **1** | **Kenney — Car Kit** | Zero art reconciliation with the Kenney City Kits already chosen; GLB direct; ~200–400 tris means a populated highway is nearly free. Establishes the dialect everything else gets recoloured into. | **$0.00** |
| **2** | **RGS_Dev — Free Low Poly Vehicles Pack** | Closes the two categories the brief cares about most — police cruisers and ambulances/fire — in a single CC0 import. Nothing else in the catalog matches its category coverage per file. | **$0.00** |
| **3** | **Quaternius — Public Transport Pack** | Fills school bus + city bus + the motorcycle gap, and shares the dialect of the chosen Quaternius character packs. | **$0.00** |
| | **Total** | | **$0.00** |

Then, at the crew's convenience, all still free: OGA Vehicles Assets pt1 (traffic volume) → OGA Semi-Trailer
(logistics) → maxorbie (emergency redundancy) → Quaternius Animated Tanks + MedSamer + 42manako HMMWV (military).

**Paid, only if the above runs dry:** Mighty Handful Cartoon Vehicles Full at **$28** (Unity Single Entity licence —
purchase + one seat, attribution expected). Worth comparing against a commission rather than buying reflexively.

**Worth 15 minutes of someone's time:** open the four CGTrader pages in a real browser and paste the licence text
into this repo. The pickup police/fire truck (3,244 faces, explicit count) alone is worth more than $28 if it
verifies clean. Do **not** budget for it — budget for the manual check.

**Non-obvious caveat for the pipeline:** three of the picks need unpacking before a browser build — maxorbie
ships a `.unitypackage` (a hashed tarball; extract the FBX/GLB directly, do not adopt Unity), Pavel 3D ships a
**34 MB RAR** (needs `unrar`), and the two OGA picks ship **BLEND inside a ZIP** (one Blender export pass).
The Sketchfab picks and Kenney are GLB-direct; the Quaternius packs are FBX/OBJ, and Quaternius' own
[Poly Pizza bundle](https://poly.pizza/bundle/Animated-Tank-Pack-0tfvbeAJkU) proves native GLB mirrors exist for
their packs — check Poly Pizza before scheduling a Blender pass.

---

*Review only — no model files downloaded, no source files modified. Verdicts cross-checked against
`agents/asset-packs/licenses.md`; tri counts are as published by each source and "unstated" means it must be
measured after download. Sketchfab CC-BY attribution strings must be taken from each model page at download time,
not from this document.*