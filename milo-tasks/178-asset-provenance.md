# Task 178: Asset provenance table (audited 2026-10-02 on review/assets f9aeaaf)

## 3D models (clients/campaign/public/models/, 38 GLBs on disk)

| File | Source | License | In-game use |
|------|--------|---------|-------------|
| soldier-animated.glb | Quaternius Ultimate Animated Character Pack (via three.js examples) | CC0 1.0 | Animated soldier |
| female-operator.glb | Quaternius Ultimate Modular Women (via operation-steel-tide) | CC0 1.0 | Female operator |
| viper/heron/lynx/magpie/jackal (operator-*.glb) | Quaternius Ultimate Modular Women presets | CC0 1.0 | Ethnic operator roster |
| tank-quaternius.glb | Quaternius/Poly Pizza tank (via east-vs-west-game) | CC0 1.0 | Tank vehicle |
| weapons/*.glb (7 files) | Quaternius Ultimate Guns Pack | CC0 1.0 | Weapon props |
| apc.glb, artillery.glb, bunker.glb, helicopter.glb, humvee.glb, motorcycle.glb, etc. | three.ws Forge (generated) | Original, no third-party license | Vehicles/structures |
| concrete-barrier.glb, farmhouse.glb, farm/water-tower variants | three.ws Forge (generated) | Original | Structures |

**FLAGGED FOR DEL (2026-10-02):** 13+ GLBs on disk are Quaternius/Poly Pizza
sourced (soldier-animated, female-operator, 5 operator-*.glb, tank-quaternius,
7 weapons/*.glb). Del ordered 2026-10-02: "No no Kenney assets" / no third-party
stock libraries, Forge-or-procedural only. These models were added 2026-10-01,
BEFORE Del's order, but remain in the repo on main. Needs Del's call: remove and
replace with Forge-generated, or grant an exception. The Kenney license files in
assets/licenses/ are orphaned (no Kenney models on disk) and should be removed
regardless.

## Audio (content/audio/, clients/campaign/public/audio/)

| Group | Count | Source | License |
|-------|-------|--------|---------|
| Voice lines (content/audio/voices/*.mp3) | 81 | Synthesized in-repo (per VOICES.md) | Original |
| Music/SFX (public/audio, incl. sfx/) | ~100 | Procedural compositions by Hana | Original |
| Radio stations (station-street/night/talk) | 3 MP3 + 3 WAV masters | Synthesized in-repo | Original |

All 81 voice MP3s decode cleanly (ffprobe, 2026-10-02). 0 failures.

## Dialogue/lore (content/dialogue/, content/lore/, content/characters/)

| Group | Files | Source |
|-------|-------|--------|
| Faction-leader dialogue | 10 files | Written in-repo |
| Companion/tavern/tutorial/quest/combat barks | per manifest | Written in-repo |
| Lore (factions-regions, settlements, endings) | 3 files | Written in-repo |
| Characters (faction-leaders, companions, antagonists) | 3 files | Written in-repo |

Punctuation audit 2026-10-02: zero em dashes, en dashes, curly quotes across all
10 dialogue files. Lore entity audit: all named people resolve to
content/characters/ entries (Vega, Oyelaran, Jessup, Adair, Dumas, Boatwright);
all places are real US geography (by design).

## Orphans (recorded, not removed)

- 9 images in clients/campaign/public/images|icons: 4 portraits, 2 banners,
  3 PWA icons. None referenced by client TypeScript source (2026-10-02).
  Portraits/banners appear staged for future use.
- 3 radio stations: listed in radio-manifest.json, documented in RADIO.md, but
  not wired into game client code (no .ts references).
- 4 Kenney license files in assets/licenses/: no Kenney models exist; remove.
