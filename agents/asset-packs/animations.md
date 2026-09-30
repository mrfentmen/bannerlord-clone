# 3D Animation Catalog — Mixamo-Rigged Characters

**Project:** Browser 3D Mount & Blade-style campaign game, modern America (Babylon.js 8 client).
**Rig target:** Mixamo skeletons (mixamorig). All Mixamo-library clips retarget natively; Quaternius UAL is stated "compatible with Mixamo".
**Method:** Catalog only — nothing downloaded. Frame counts are given where verified in third-party teardowns; otherwise "check Mixamo preview".
**Date:** 2026-09-30

---

## Priority 1 — Mixamo's own animation library (mixamo.com)

Free with an Adobe account. 2,500+ mocap clips, FBX (with/without skin) or COLLADA; convert to GLB via Blender for the web build. **License: free for personal AND commercial use in projects — but do NOT redistribute raw animation/character files as standalone assets (do not commit raw Mixamo FBX to the public repo; bake into the build).** Mixamo mirror repos on GitHub are piracy — do not use.

### Themed packs (download as a set from mixamo.com)

| Pack | Contents (clip count) | Covers our categories | Loopable | URL |
|---|---|---|---|---|
| **Basic Locomotion Pack** (+ Male Locomotion Pack, ~50 clips combined) | Walk/run in every direction × cadence × stance; in-place + root-motion variants | idle, walk, run, sprint, crouch-walk | Yes — all locomotion loops | https://www.mixamo.com/ (search "locomotion") |
| **Rifle 8-Way Locomotion Pack** (83 files: in-place + root-motion) | 8-way rifle walk/run/strafe, crouch move, idle-crouch-aim, jump loop | rifle locomotion, crouch-walk | Locomotion loops; aim-idle loops | https://www.mixamo.com/ (search "rifle") |
| **Pistol-Handgun Locomotion Pack** | Pistol walk/run/strafe set | pistol locomotion | Loops | https://www.mixamo.com/ (search "pistol") |
| **Sword And Shield Pack** (~17 clips) | Slash, block, walk, run, strafe, jump, turn, idle | melee swing, block | Loco/idle loop; attacks one-shot | https://www.mixamo.com/ (search "sword and shield") |
| **Great Sword Pack** (~46 clips) | Combos, dodges, idle, run, walk variants | melee swing (two-handed) | Loco/idle loop; attacks one-shot | https://www.mixamo.com/ (search "great sword") |
| **Pro Melee Axe Pack** (~30 clips) | Axe attacks, locomotion | melee swing variants | Loco loops; attacks one-shot | https://www.mixamo.com/ (search "melee axe") |
| **Scary Zombie Pack** + **Not So Scary Pack** (~30 clips) | Zombie idle/walk/run, attacks, bite, scream, death | panic run (zombie run), death, hit reactions | Loco loops; attacks/death one-shot | https://www.mixamo.com/ (search "zombie") |
| **Creature Pack (Mutant)** (~17 clips) | Mutant idle, walk, swipe, jump attack, breathing idle | melee swipe, idle | Loco/idle loop; attacks one-shot | https://www.mixamo.com/ (search "mutant") |
| **Longbow Aiming Pack** (~15 clips) | Aim, draw, loose | aim poses (reference for rifle aim layering) | Aim-idle loops | https://www.mixamo.com/ (search "longbow") |
| **Capoeira Pack** (~30 clips) | au, ginga, esquiva, kicks | dodge/evade flavor | Mixed | https://www.mixamo.com/ (search "capoeira") |
| **Pro Magic Pack** (~30 clips) | Casts, idles | emotes / crowd gestures | Mixed | https://www.mixamo.com/ (search "magic") |

### Individual clips by our category (verified names from production teardowns)

| Our need | Mixamo clip name(s) | Loop | Frames (verified) | Notes |
|---|---|---|---|---|
| idle | Standing Idle, Breathing Idle, Happy Idle, Offensive Idle | Yes | — | Offensive Idle suits armed units |
| walk | Walking | Yes | 32f @30fps (1.033s) | In-place variant for controller-driven movement |
| run | Running | Yes | 22f @30fps (0.700s) | — |
| sprint | Fast Run | Yes | — | — |
| crouch-walk | (Rifle pack) walk crouching left/right/back | Yes | — | From Rifle 8-Way Pack |
| punch | (search: jab, cross, hook, uppercut) | No | — | Unarmed combat set |
| rifle aim | Rifle Idle, Rifle Aiming Idle, Idle Aiming, Holding Rifle | Yes (aim-idle) | — | Pick the preview with stock visibly shouldered |
| rifle fire | Shoot Rifle, Firing Rifle | No | — | — |
| rifle crouched fire | Fire Rifle While Crouched | No | — | — |
| pistol fire | (Pistol pack) pistol fire / Firing Rifle works one-handed per open-parallaxpro mapping | No | Pistol run 16f @30fps (0.5s) | — |
| reload | (search "reload" — rifle/pistol reload clips exist in packs) | No | — | One-shot |
| melee swing | Sword and Shield Slash; Zombie Attack (overhead, 140f); Zombie Attack (1) (swing, 80f) | No | 140f / 80f @30fps | Trim to ~40–43f at 1.4–1.5× speed for game feel |
| grenade throw | (search "throw" — Mixamo has throw clips) | No | — | One-shot |
| hit flinch | Hit Reaction, Being Hit | No | — | Speed-scale to ~0.5s window |
| death forward/back | Dying; Rifle pack: Death From Back Headshot, Death From Front Headshot, Death From Right | No (holds final pose) | — | One-shot, hold last frame |
| knockdown | (search "knockdown", "getting up") | No | — | Pair with Getting Up / Zombie Rising |
| cheer | (search "cheer", "celebrate", "yelling") | Optional | — | Crowd emote |
| panic run | Zombie Run, Fast Run | Yes | — | Crowd flee |
| surrender | (search "surrender" — hands-up clip exists) | Yes (hold) | — | Crowd / prisoner |

---

## Priority 2 — CC0/CC-BY packs compatible with Mixamo rigs

| Pack | URL | Format | Rig compatibility | License | Price | Loop / frames | Notes |
|---|---|---|---|---|---|---|---|
| **Quaternius Universal Animation Library 1** | https://quaternius.itch.io/universal-animation-library | FBX, GLB, .blend | Universal humanoid rig, **stated compatible with Mixamo** | **CC0** | Free | 120+ clips; 8-dir locomotion loops, emotes, root-motion variants | **Best non-Mixamo pick.** Pairs with Universal Base Characters. |
| **Quaternius Universal Animation Library 2** | https://quaternius.com/packs/universalanimationlibrary2.html | FBX, GLB, .blend | Same — Mixamo-compatible | **CC0** | Free (name-your-price) | 130+ clips; v2.0 June 2026 | Extends UAL1. |
| **Quaternius Ultimate Animated Character Pack** | https://quaternius.com/packs/ultimatedanimatedcharacter.html | FBX, OBJ, .blend (no GLB — convert via Blender) | 52 chunky humanoids, own rigs | **CC0** | Free | Per character: Idle, Run, Shoot_OneHanded, SwordSlash | Shoot_OneHanded + SwordSlash per character; needs retarget to Mixamo rig. |
| **KayKit Character Animations** | https://kaykit.itch.io/ (search "character animations") / OpenGameArt mirror | FBX, GLTF | KayKit rig — **retarget required** | **CC0** | Free | Sit, lie-down, interact, locomotion; high quality | Good for civilian/sit/sleep; budget retarget time. |
| **RancidMilk CMU mocap pack** | https://rancidmilk.itch.io/ (764 MB) | FBX, GLTF | Quaternius example rig — retarget | **CC0-ish (verify on page)** | Free | 2,500+ CMU clips; varies | Massive but heavy; cherry-pick only. |
| **Kevin Iglesias Basic Motions (FREE)** | https://keviniglesias.itch.io/ | FBX | Unity humanoid — retarget | **Custom free license (read terms)** | Free | Sitting variants, sleep, locomotion | High quality; confirm commercial terms. |
| **Humane Basics (oudarya)** | https://oudarya.itch.io/ | FBX | Custom rig — retarget | **CC0** | Free | Basics: sit, stand, locomotion | Medium quality; simple retarget. |

---

## Coverage check

| Category | Covered by |
|---|---|
| idle / walk / run / sprint | Mixamo Basic Locomotion Pack; UAL1/2 |
| crouch-walk | Mixamo Rifle 8-Way Pack; UAL crouch set |
| punch | Mixamo unarmed search set (jab/cross/hook/uppercut) |
| rifle aim/fire | Mixamo rifle clips (Shoot Rifle, Firing Rifle, Rifle Aiming Idle) |
| pistol fire | Mixamo Pistol pack |
| reload | Mixamo reload clips (one-shot) |
| melee swing | Mixamo Sword packs; Zombie Attack trims; UAL SwordSlash |
| grenade throw | Mixamo throw search |
| hit flinch | Mixamo Hit Reaction |
| death fwd/back | Mixamo Dying; Rifle pack directional deaths |
| knockdown | Mixamo knockdown + Getting Up |
| cheer | Mixamo cheer/celebrate search; UAL emotes |
| panic run | Mixamo Zombie Run / Fast Run |
| surrender | Mixamo surrender (hands-up hold) |

**All 15 categories covered.** 11 Mixamo packs + 7 third-party packs = 18 finds.

---

## License concerns

1. **Mixamo: usable, not redistributable.** Free with Adobe account for commercial projects, but raw FBX files must NOT be committed to the public repo as standalone assets. Pipeline: download → Blender → bake into the game build. Keep raw downloads gitignored/local.
2. **Mixamo mirror repos on GitHub = piracy.** Never pull animations from re-upload mirrors; download from mixamo.com only.
3. **CC0 core is safe:** Quaternius UAL1/2, Quaternius character pack, KayKit, Humane Basics — commit freely.
4. **Verify before use:** RancidMilk ("CC0-ish") and Kevin Iglesias (custom free license) — read the actual license text on the page before committing.
5. **AI-generated flag:** some itch.io animation packs are AI-assisted; fine for CC0, but note it in the asset manifest per project policy.
