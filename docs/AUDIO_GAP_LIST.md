# Audio Gap List — Bannerlord-clone

**Date:** 2026-10-03
**Status:** executing — no questions, user AFK.

## Current inventory (shipped)

**Music:** 24 tracks (batches 1–4) + stems.
**SFX:** 26 files — ambience(5), foley footsteps(3), radio(3), ui(5), vehicle engines(3), weapon gunfire(8).
**Barks:** 11 categories × 3 voices × 3 variants (select, move, attack, advance, hold, retreat, victory, defeat, enemy_spotted, reloading, medic).
**Screams/vocalizations:** NONE. **Melee SFX:** NONE. **Horse SFX:** NONE. **Siege SFX:** NONE.

## Gaps and assignments

### A. Music batch 5 (→ subagent)
6 new tracks, moods not covered by batches 1–4:
1. `tide-of-war` — naval/sea campaign, rolling 6/8
2. `high-pass` — mountain pass traversal, thin air, sparse
3. `bayou-night` — swamp/bayou stealth, humid drone
4. `midnight-pursuit` — urban night chase, tense pulse
5. `parley` — diplomacy/negotiation, restrained strings
6. `last-stand` — final-battle epic, full ensemble

### B. SFX batch 2 (→ main agent, extend sfx.py)
**Melee (14):** sword-clash, sword-whoosh, shield-block, parry, axe-chop, mace-thud, spear-thrust, dagger-stab, arrow-whoosh, arrow-hit-wood, arrow-hit-flesh, bow-draw, bow-release, crossbow-fire
**Siege (5):** catapult-launch, trebuchet-release, battering-ram, wall-breach, gate-break
**Horse (4):** gallop, trot, neigh, horse-snort
**UI extras (10):** level-up, quest-accept, quest-complete, quest-fail, coin, map-open, paper, notification, back, craft
**Foley extras (9):** footstep-wood, footstep-metal, footstep-water, jump-land, door-open, door-close, chest-open, pick-up, drop
**Ambience extras (8):** forest, campfire, tavern-interior, market-crowd, ocean, cave, desert-wind, thunderstorm
**Horn (2):** war-horn, signal-horn

### C. Screams / vocalizations (→ main agent, new vox.py, formant DSP)
All synthesized, M/F pitch variants, 3 variants each:
- `pain-scream` — wounded yell
- `death-scream` — dying cry
- `battle-cry` — charging shout
- `fear-scream` — panic
- `grunt` — exertion hit
- `cheer` — victory shout
- `groan` — low pain

### D. Barks batch 2 (→ subagent, TTS)
12 new categories × 3 voices × 3 variants = 108 files:
charge, rally, taunt, surrender, wounded, volley-fire, cavalry-flank,
siege-attack, scout-report, follow-me, spread-out, hold-fire
Plus NPC lines (1 voice each, 3 variants): merchant-greet, tavern-rumor, quest-giver.

## Ship checklist
- [ ] All MP3s ffprobe-decodable, durations sane
- [ ] Copied to clients/campaign/public/audio/<category>/
- [ ] assets/audio-manifest.json updated (sha256 + bytes)
- [ ] Committed, pushed to main, announced on bus
