# Asset Licenses — clients/campaign/public/models/

Third-party 3D models in this directory come under two licenses.
The pre-existing curated sets (Quaternius etc.) are CC0 1.0 Universal
(public domain). The `vendor/` packs pulled 2026-10-03 from the
awesome-ai-games sweep are mixed CC0 / MIT — see the vendor table
below for per-pack licensing. No attribution is legally required for
CC0; MIT packs require the copyright notice to be retained
(see notes below).
"All usage goes into this game" per project directive — assets listed here are
cleared for unrestricted commercial use in the bannerlord-clone.

## Characters (animated)

| File | Source | License | Provenance |
|------|--------|---------|------------|
| `soldier-animated.glb` | Quaternius Ultimate Animated Character Pack | CC0 1.0 | Bundled in three.js examples: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb . Clips: Idle, Walk, Run, TPose. |
| `female-operator.glb` | Quaternius Ultimate Modular Women (Soldier preset) | CC0 1.0 | Via aetherradar/operation-steel-tide (`assets/models/quaternius_female_operator/`). 25 locomotion/combat/incapacitation/revive actions. |

## Operators (ethnic roster — Quaternius CC0)

Five authored presets from Quaternius' **Ultimate Modular Women Pack**
(https://quaternius.com/packs/ultimatemodularwomen.html), CC0 1.0,
via aetherradar/operation-steel-tide (`assets/models/quaternius_operators/`).
Added 2026-10-01 for faction/ethnicity visual variety.

| File | Operator | Authored preset | Palette |
|------|----------|-----------------|---------|
| `viper.glb` | VIPER / Assault | Soldier | orange/charcoal |
| `heron.glb` | HERON / Medic | Worker | teal/white |
| `lynx.glb` | LYNX / Recon | SciFi | cyan/navy |
| `magpie.glb` | MAGPIE / Scavenger | Adventurer | ochre/olive |
| `jackal.glb` | JACKAL / Locksmith | Punk | violet/black |

## Vehicles

| File | Source | License | Provenance |
|------|--------|---------|------------|
| `tank-quaternius.glb` | Quaternius / Poly Pizza low-poly tank | CC0 1.0 | Via pisberg/east-vs-west-game. Animated tracks. |

## Weapons (category "prop")

Quaternius **Ultimate Guns Pack**, CC0 1.0,
via aetherradar/operation-steel-tide (`assets/models/quaternius_ultimate_guns/`).
Added 2026-10-01.

| File | Weapon |
|------|--------|
| `weapons/ak74.glb` | AK-74 assault rifle |
| `weapons/scarl.glb` | SCAR-L assault rifle |
| `weapons/m24.glb` | M24 sniper rifle |
| `weapons/axmc.glb` | AXMC sniper rifle |
| `weapons/awm.glb` | AWM sniper rifle |
| `weapons/vss.glb` | VSS suppressed rifle |
| `weapons/mp5a5.glb` | MP5A5 SMG |
| `weapons/m3a1.glb` | M3A1 SMG |
| `weapons/p226.glb` | P226 pistol |
| `weapons/m1911.glb` | M1911 pistol |

## Notes

- The manifest (`models.manifest.json`) is the machine-readable index of all
  models above. `ModelCategory` in `clients/campaign/src/scene/models.ts`
  includes `"prop"` for hand-held weapons.
- Upstream license text for the Quaternius packs is CC0 1.0 Universal:
  https://creativecommons.org/publicdomain/zero/1.0/

## Vendor packs (awesome-ai-games sweep, 2026-10-03)

Pulled from AI-built open-source games catalogued in AgentsLoop/awesome-opus-5.5-games.
GLB files load directly in the client; FBX files are staged for a future FBX→GLB conversion pass.

| Directory | Source repo | License | Contents |
|-----------|-------------|---------|----------|
| `vendor/fable51-worlds/` | [PhiloLabs/fable51-worlds](https://github.com/PhiloLabs/fable51-worlds) | MIT | 210 GLB: modular pedestrian parts (civilian variety), 13 vehicles, street/arch/retail props, vegetation |
| `vendor/branch-zero/` | [JaCoderX/Branch-Zero](https://github.com/JaCoderX/Branch-Zero) | MIT (repo); KayKit assets CC0 1.0 | 70 GLB: KayKit Adventurers characters + animation rigs, Kenney bank staff |
| `vendor/hexland/` | [kimotomura-0101/hexland](https://github.com/kimotomura-0101/hexland) | CC0 1.0 (KayKit pack license) | 753 FBX: KayKit knights/pirates/zombies, weapon racks, ships; 7 animals incl. Horse.fbx |
| `vendor/game-city-skylines/` | [codersusu/game-city-skylines](https://github.com/codersusu/game-city-skylines) | CC0 1.0 (Kenney pack license) | 214 FBX: Kenney cars, commercial/industrial/suburban buildings, watercraft |
| `vendor/gravewake/` | [LioraLabs/gravewake](https://github.com/LioraLabs/gravewake) | MIT | 26 GLB: catapult (siege), fantasy characters/props |
| `vendor/sakura-rally/` | [SummerEngine/sakura-rally](https://github.com/SummerEngine/sakura-rally) | MIT | 106 GLB: cars and track props |

Notes:
- Repos without a LICENSE file were excluded even when the models looked useful (e.g. GTB6's GTA-style characters/cars) — needs author permission.
- Kenney assets are CC0 per kenney.nl; the Kenney stock-asset question with the boss remains open — flag before shipping Kenney content.
- KayKit assets are CC0 1.0 per kaykit.co.
