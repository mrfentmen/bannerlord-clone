# Asset Licenses — clients/campaign/public/models/

All third-party 3D models in this directory are CC0 1.0 Universal (public domain).
No attribution is required; creator credit is retained below as a courtesy.
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
