# ASSETS.md

How free 3D models, textures, audio, and fonts are **sourced, licensed, processed, and credited**.

The models come from many artists with different styles, scales, and texture qualities. **Making them look like one game is the core art job**, not a finishing step. See `ART_AND_AUDIO.md` for the visual direction this pipeline serves.

Required by `CONSTITUTION.md` section 5.

---

## 1. SOURCES

Free models, with licence terms checked per asset, never assumed from the site.

| Source | Notes |
|---|---|
| **Fab** | Epic Games' marketplace. Where Sketchfab's store content migrated. Check per-asset licence. |
| **CGTrader** | Free tier available. Filter for commercial use. |
| **Free3D** | Mixed licence quality. Verify each model individually. |
| **Kenney** | CC0 asset packs, low-poly. Very safe licensing, consistent style. Strong for props and placeholders. |
| **Poly Haven** | CC0 HDRIs, textures, and models. Safe. |
| **Quaternius** | CC0 character and prop packs, consistent style. Safe. |
| **Mixamo** | Free character rigs and animation library. Check current terms before use. |

### 1.1 Source warning — verify before Phase 3

The docs name **Sketchfab** as a primary source. That site's situation has changed and must be re-verified before Phase 3:

- Epic Games acquired Sketchfab and **closed the Sketchfab Store**, migrating it to Fab.
- Epic announced that **free downloadable content would stop being supported on Sketchfab** during 2025, with downloads becoming unavailable as part of the Fab migration.
- The site is now operated under a different company name than at the time these docs were written.

**Action for Phase 3:** confirm the current state of free downloads and licence terms on the day the pipeline is built, and prefer sources publishing explicit CC0 or CC-BY terms. Do not build the pipeline around one site. Record what was found in `CHANGELOG.md` under **Data notes**.

### 1.2 Licence rule
Only assets cleared for **commercial use** enter the repo. Not "probably fine", not "it said free" — the licence text says commercial use is allowed.

- **Save** the licence page as a local copy (PDF or text) at retrieval time. Those pages change and vanish, and a dead link is not a defence.
- Record the attribution string exactly as the licence requires it.
- If a licence is unclear, the asset does not enter. Find another.

---

## 2. THE MANIFEST

**Every asset has a manifest entry. No exceptions.** The manifest is the single record of what is in the project and where it came from.

### 2.1 Required fields

| Field | Meaning |
|---|---|
| `id` | Stable identifier used by code |
| `path` | Where the processed asset lives in the repo |
| `source_url` | Where it was downloaded from |
| `source_site` | Fab, CGTrader, Kenney, Poly Haven, Mixamo, … |
| `author` | Creator name, exactly as credited |
| `licence` | Licence identifier (CC0, CC-BY-4.0, …) |
| `licence_copy` | Path to the saved licence text |
| `date_retrieved` | When it was downloaded |
| `attribution_text` | The exact string the licence requires |
| `class` | Asset class from section 3 |
| `lod_tiers` | Which LOD tiers exist for this asset |
| `modifications` | What was done in processing (scale, retopo, retexture) |
| `sha256` | Hash of the processed file, for the build check |

Audio and fonts use the same manifest with the type-appropriate fields. See `ART_AND_AUDIO.md` for the audio-specific requirements.

### 2.2 Build check
The manifest is **checked as part of the build**. An asset file with no manifest entry, or a manifest entry whose hash does not match the file, **fails the build**. It does not warn. Shipping an unlicensed asset must be impossible, not discouraged.

The check is listed in `TESTING_AND_BALANCE.md`. `RISKS.md` row 4 names "a model with unclear licence in the repo" as the failure state this exists to prevent.

### 2.3 Originals are kept unedited
Originals are stored as downloaded. Processing writes new files. If a model needs reprocessing later, the original is still there.

### 2.4 Runtime format
Processed assets are **GLB / glTF** — the format loaded at runtime (`GLOSSARY.md`). Source formats (`.blend`, `.fbx`, `.obj`) are kept as originals but never loaded by the game.

---

## 3. ASSET CLASSES

Budgets in section 5 are per class, because a town building and a rifle do not deserve the same texture resolution.

| Class | Contents |
|---|---|
| `character_body` | Base bodies for troops and the player |
| `character_gear` | Clothing, armour, webbing, helmets |
| `character_head` | Heads and faces, varied for crowd diversity |
| `weapon` | Firearms, melee, improvised |
| `vehicle` | Trucks, technicals, civilian vehicles |
| `building` | Town structures and silhouettes for town clusters |
| `prop` | Crates, barrels, sandbags, market goods |
| `terrain_texture` | Ground and road surface materials |
| `environment` | Trees, rocks, fences |
| `audio` | Music, SFX, ambience |
| `font` | UI and in-world typefaces |

Towns render as **3D clusters of buildings**, not explorable interiors (`SPEC.md` section 6). Building assets optimise for silhouette at distance, not detail up close.

---

## 4. THE PIPELINE

Six steps, in order. Every asset goes through all six, including the ones that look fine as downloaded.

**Step 1 — Select.** Find a candidate. Check the licence before anything else. Wrong licence ends the search here, not after processing.

**Step 2 — Manifest and licence capture.** Create the manifest entry and save the licence copy. Doing this after processing means it never gets done.

**Step 3 — Download and store the original.** Unedited, into the originals directory, hash recorded.

**Step 4 — Convert to GLB.** Via Blender. Fix scale here: **1 unit equals 1 metre** (`ART_AND_AUDIO.md` checklist). Wrong scale is the most common imported-model defect and the most annoying to find later.

**Step 5 — Optimise.** Apply the class texture budget (section 5). Decimate to poly budget. Generate LOD tiers. Rig to the shared skeleton if it is a character.

**Step 6 — Unify.** **This is the core art job.** Mixed-source models do not look like one game until this step is done deliberately:

- Apply the **shared colour grade** and post-processing recipe so every asset sits in the same light.
- Apply the **single shared texture-resolution budget** for the class, so sharp and blurry assets stop fighting each other.
- Match palette against `ART_AND_AUDIO.md`.
- Check silhouettes read at distance for the far LOD billboard tier.

If a screenshot of the processed set looks like a collage, step 6 is not finished.

### 4.1 One shared skeleton
Characters rig to **one shared skeleton** so animations are reusable across every troop, gear set, and body. A second skeleton doubles the animation work forever. `ART_AND_AUDIO.md` requires this.

### 4.2 Animation
Animations are **baked to textures** for GPU vertex-texture skinning (`SPEC.md` section 5.1). Per-instance CPU bone skinning does not scale past a few dozen units and cannot hit the crowd targets.

### 4.3 LOD tiers
Three tiers per character asset, per `SPEC.md` section 5.1:

| Tier | Form | Used at |
|---|---|---|
| Close | Full skeletal mesh | Near the camera |
| Mid | Simplified mesh | Mid distance |
| Far | Billboard impostor | Crowd distance |

**Distance thresholds are tuned by testing, never assumed.**

### 4.4 Pipeline exit criterion
The pipeline is proven when it runs **end to end for one troop type** — Phase 3 exit criterion in `PHASES.md` and `TASKS.md`. One troop type, all six steps, all tiers, in the game.

---

## 5. BUDGETS

Budgets exist because the crowd targets in `SPEC.md` section 5.1 (300 units at 60 fps, 1,000 at 30 fps) are decided by draw calls and texture memory, not by polygon count alone.

### 5.1 Texture resolution per class

Starting budgets. Tighten against real measurements in Phase 3; record changes in `CHANGELOG.md`.

| Class | Base colour | Normal | Roughness / metallic |
|---|---|---|---|
| `character_body` | 1024 | 1024 | 512 |
| `character_gear` | 512 | 512 | 256 |
| `character_head` | 512 | 512 | — |
| `weapon` | 512 | 512 | 256 |
| `vehicle` | 1024 | 1024 | 512 |
| `building` | 1024 | — | 512 |
| `prop` | 256 | 256 | — |
| `terrain_texture` | 2048 tiled | 2048 tiled | 1024 |

### 5.2 Model budgets

| Class | Close tier | Mid tier | Far tier |
|---|---|---|---|
| Troop (body + gear + head) | 12k tris | 4k tris | billboard |
| Weapon | 3k tris | 1k tris | — |
| Vehicle | 15k tris | 6k tris | billboard |
| Building | 5k tris | 2k tris | billboard |
| Prop | 500 tris | — | — |

### 5.3 Draw call budget
The point of Thin Instances is a **handful of draw calls regardless of unit count**. If the draw call count is climbing with the number of units on screen, instancing is not working and that is the bug — not the frame budget.

### 5.4 Memory budget
Audio streams from compressed files with a per-scene memory budget (`ART_AND_AUDIO.md`). Post-processing must be optional at low settings.

### 5.5 The real test
`PHASES.md` Phase 3 exit criterion: **300 units at 60 fps and 1,000 units at 30 fps on mid-range consumer hardware, not just the dev machine.** The mid-range hardware definition is an open decision in `TESTING_AND_BALANCE.md` section 8.

---

## 6. CREDITS AND ATTRIBUTION

The credits screen is **generated from the manifest**. It is not hand-maintained, because hand-maintained credits drift and miss things. Adding an asset with an `attribution_text` field automatically adds it to the credits screen.

This is why the manifest is not optional bookkeeping: it is the credits screen, the licence record, and the build check, from one source of truth.

Attribution must appear as the licence requires it to appear. A CC-BY asset attributed in a text file nobody opens is not attributed.

---

## PROVENANCE

Reconstructed after the build folder was found to contain every other design doc but not this one, despite 8 files referencing it by section number.

- Section 1 (sources), 2 (manifest and licensing), 4 (the pipeline, step 6 unify, shared skeleton), and 5 (budgets) were reconstructed from `ART_AND_AUDIO.md`, `GLOSSARY.md`, `PHASES.md`, `README.md`, `RISKS.md`, `SPEC.md` sections 7 and 10, `TASKS.md`, and `TESTING_AND_BALANCE.md`.
- Section 3 (asset classes) and the numeric budgets in section 5 are starting values, not cited figures. They are sized to the crowd targets in `SPEC.md` section 5.1 and should be tuned against real measurements in Phase 3.
- Section 1.1 records external facts about Sketchfab's change of ownership and the migration to Fab, verified 2026-09-30. Re-verify before Phase 3.
- Reconstructed: 2026-09-30. Recorded in `CHANGELOG.md` under **Decisions**.
