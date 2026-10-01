# Animation source notes

Every file in this directory was downloaded, not authored. Originals are kept
unedited; the pipeline only reads them. License records follow ASSETS.md
section 1.2: nothing enters the repo unless the license text allows
commercial use.

## Soldier.glb

- **What:** three.js example soldier model, Mixamo rig, with baked
  Idle / Walk / Run / TPose animations.
- **Source URL:** https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb
- **Author:** Mixamo (via the three.js project examples).
- **License:** MIT (via three.js examples; recorded per MASTER_PLAN task 106).
- **Date retrieved:** 2026-10-01.
- **sha256:** dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b
- **Used for:** Mixamo retarget completion (MASTER_PLAN task 113) — idle,
  walk, and run clips retargeted onto the shared skeleton.

## Quaternius_SWAT.glb

- **What:** Quaternius low-poly SWAT character (CharacterArmature rig) with
  24 baked animations, mirrored from the free Quaternius release via
  poly.pizza (no login required).
- **Source URL:** https://poly.pizza/m/Btfn3G5Xv4
  (direct file: https://static.poly.pizza/713f6535-f4f3-4367-a4c6-ced126ae0936.glb)
- **Author:** Quaternius.
- **License:** CC0 (public domain; no attribution required). Quaternius
  publishes all packs under CC0 — see
  https://creativecommons.org/publicdomain/zero/1.0/ and the pack page.
- **Date retrieved:** 2026-10-01.
- **sha256:** a835107bac833eb916c494e10997ae1709e85957ea6f6c59ace3c9a66f6d1fec
- **Used for:** combat clip extraction (MASTER_PLAN task 109) — Sword_Slash,
  Gun_Shoot, HitRecieve, and Death retargeted onto the shared skeleton.

## Why these two

The Quaternius Universal Animation Library 2 (CC0, 130+ clips) is the
catalogued long-term source, but it is distributed through itch.io's
name-your-price flow, which needs an interactive browser session to fetch.
The SWAT model above is the same author's CC0 rig with the combat clips the
pipeline needs today (slash, shoot, hit-react, death), fetched over plain
HTTPS. If UAL2 is ever fetched interactively, drop it in this directory,
record it here, and add its clips to `run.py`'s EXTRACT_SPECS.
