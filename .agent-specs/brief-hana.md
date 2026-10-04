# Brief — Hana (world data / audio / art wiring)

Read `.agent-specs/MISSION-4H.md` and `.agent-specs/divvy.md` first. You own:
`services/world-data/**`, `clients/campaign/public/{world,audio,textures,models,art}/**`,
`clients/campaign/src/audio/**`, `assets/audio/**`, `tools/**`.

Work in this order.

1. **Audio wiring (biggest quick win).** The library is already on main —
   `assets/audio/` (music batches 1-41+, barks 1-56, SFX 1-84) and
   `clients/campaign/public/audio/`. Wire it:
   - music manager (campaign map vs battle vs town)
   - ambience per location (`public/audio/sfx/ambience/*` exists)
   - radio beds (`public/audio/radio/*`)
   - UI + battle SFX hooks
   - volume + mute settings
   Source code lives in `clients/campaign/src/audio/**` — yours.

2. **Port client audio code** from orphan branches `milo/tasks-101-200` and
   `milo/world-ai` (`src/audio/ambience.ts`, `audio.ts`, `radio.ts` + tests).
   `git fetch origin milo/tasks-101-200` and take only what main lacks.

3. **Wire models/textures.** `public/models/` (1,379 vendored files),
   `public/textures/vendor/pbr/` (10 PBR surfaces), `public/textures/vendor/hdris/`
   (12 skies). Put them into data/manifests; Pax places them in scenes —
   coordinate through commit messages, don't edit scene code.

4. **Content packs** from `worker/local/battlesim-assets`: voices, SFX, concept art.

5. **World data:** keep wire deploys green; prep the national map expansion
   (51 states, 19,484 places) — do NOT run it until the playable loop works.

Rules:
- Don't edit `src/scene/**` (Pax), `src/ui/**` or `main.ts` (Buffy).
- Verify: `cd clients/campaign && npx tsc --noEmit` + focused vitest.
- Fetch before push. Never force. One lane per commit.
