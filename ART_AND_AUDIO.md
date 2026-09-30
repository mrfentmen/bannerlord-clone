# ART_AND_AUDIO.md

Visual and audio direction. CONSTITUTION.md section 3 requires the visual direction to be **locked before UI panels are built** (PHASES.md Phase 2). This file gives the options and the checklist so that decision can be made, and does not make it for you.

---

## 1. THE MAIN ART CHALLENGE

You are using free models from Sketchfab, CGTrader, and Free3D. They come from many artists with different styles, scales, and texture qualities. Making them look like one game is the core art job (ASSETS.md section 4, step 6).

## 2. STYLE OPTIONS

| Option | Look | Fit with free assets | Performance | Notes |
|---|---|---|---|---|
| **A. Stylized low-poly** | Flat colors, simple shapes, strong silhouettes | Best: easy to unify by recoloring | Best for large crowds | Matches your interest in PS1 and PS2 style aesthetics, forgiving of asset differences |
| **B. Gritty semi-realistic** | Muted colors, grain, realistic proportions | Hard: mismatches show | Heavier | Highest risk with mixed sources |
| **C. Period-photographic filter** | Realistic models under an era color grade and grain | Medium | Medium | Color grading hides many differences |

**Recommendation:** A or C. Style A makes mixed free assets cohesive and keeps crowds cheap. Style C works if you can find enough good realistic models and apply a strong shared grade. Pick one and record it in CHANGELOG.md decisions.

## 3. LOCK CHECKLIST (do this before Phase 2 UI)

- [ ] Chosen style (A, B, or C)
- [ ] Reference board with 10 to 20 images for mood
- [ ] Color palette (primary, secondary, accent, status colors for good, warning, critical)
- [ ] Typography: one display face and one text face, both with free-use licenses tracked like assets
- [ ] UI motifs (paper forms, stamps, radio dials, map pins)
- [ ] Post-processing recipe (color grade, grain, vignette)
- [ ] Texture resolution budget per asset class (ASSETS.md section 5)
- [ ] Scale standard (1 unit equals 1 meter)

## 4. ERA COLOR AND MOOD

A shared look with a per-era grade:

| Era tier | Grade and mood |
|---|---|
| 1950s | Warm, slightly faded, high contrast, post-war |
| 1960s to 1970s | Earthy, warmer tones, grainier |
| 1980s | Cooler, higher saturation in artificial lights |
| 1990s to 2000s | Cleaner, sharper, cooler daylight |

The grade changes with the campaign year, subtly, so long campaigns feel like time passing.

## 5. UI VISUAL STYLE

- Panels look like period objects: field reports, ledgers, maps, and radio equipment, not futuristic glass.
- Status colors must be color-blind safe (UI_UX.md section 12).
- Consistent icon set for money, gold, food, metal, fuel, medicine, influence, and renown.
- Insignia and flags from the editor appear in the UI and on the map.

## 6. THE MAP LOOK

- Terrain from real elevation, with simple, readable texturing.
- Roads and rail drawn clearly, with condition affecting visual wear.
- Towns as clustered 3D shapes, distinct by size and type.
- Overlays (food, unrest, disease, supply) are readable at a glance.
- Weather and season visuals in V2.

## 7. CHARACTERS AND UNITS

- One shared skeleton for animation reuse (ASSETS.md section 4).
- A small set of base bodies, many clothing and gear variants.
- Silhouettes must read at distance for the far LOD billboards (SPEC.md section 5.1).
- Faction colors and insignia visible on uniforms and vehicles.

## 8. AUDIO DIRECTION

### 8.1 Music
- Period-appropriate but **original or properly licensed** music. Never use real recordings or real songs without a license. Sources with clear free-use licenses need tracked entries just like models.
- Campaign map: slower, atmospheric tracks that change with era tier and tension.
- Battle: dynamic layers that respond to intensity.

### 8.2 In-game radio (design opportunity)
- A radio channel players can tune, playing original era-styled music and news bulletins generated from real world state (INFRASTRUCTURE_AND_MEDIA.md). This doubles as a way to learn about world events.
- Broadcasts never name real living people or parties.

### 8.3 Ambient and effects
- Town ambience by size and time of day, weather sounds, vehicle engines that change by class and load.
- Weapon sounds by class and tier.
- Environmental cues for low food, outbreaks, and unrest (for example, crowd murmur).

### 8.4 Voice
- V1: text with short barks (single lines) or silence.
- Voiced dialogue is Later. If added, use licensed or original voice work only.

## 9. AUDIO SOURCING RULES

- Every audio file needs a manifest entry: source, author, license, date, and attribution text.
- Same commercial-use rule as models (CONSTITUTION.md section 5).
- Store originals unedited and ship compressed formats.
- Credits screen is generated from the manifest.

## 10. PERFORMANCE

- Texture budgets per ASSETS.md section 5.
- Post-processing must be optional at low settings.
- Audio streams from compressed files, with a memory budget per scene.
