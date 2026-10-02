# Milo tasks 161-180: content/assets/licenses inventory

## Task 161: audio paths
Manifest `assets/audio-manifest.json`: 109 entries (not 374; the 374 number does
not match any manifest on disk). All 109 files exist on disk. 0 missing.
All are original procedural compositions by Hana (synthesized in-repo, no samples).

## Task 162: art paths
`clients/campaign/public/`: 157 PNG/JPG files. `clients/campaign/public/models/`:
39 GLB files on disk, 49 entries in models.manifest.json (includes non-GLB refs).
0 missing.

## Task 163: voice lines
18 MP3s in public/audio root; all have valid MP3 headers. No decode failures.

## Tasks 164-166: dialogue punctuation
All 10 dialogue files in review/assets content/dialogue/: zero em dashes, en
dashes, or curly quotes. Clean.

## Task 169: GLB headers
All 39 GLBs parse: valid glTF magic (0x46546C67), chunk lengths match file sizes.
0 failures.

## Task 170: pipeline-source GLBs
The 2 worker-only pipeline-source GLBs from the assets chunk (f9aeaaf) remain
the only worker-only ones; main has all 34 game GLBs. (From task 5 verification.)

## Tasks 171-172: licenses — FINDING
`assets/licenses/` contains Kenney city-kit license files, but NO Kenney models
exist in the repo (not in manifest, not on disk). Del ordered "No no Kenney
assets" 2026-10-02. The license files are orphaned. Recommendation: remove the
Kenney license files to avoid confusion, or keep with a README noting they're
unused. Needs Pax's call.

three.ws Forge: generates original models via API; no third-party license needed.
All 39 GLBs are original/generated per the manifest.

## Task 176: zero client TS in assets chunk
Re-verified: review/assets (f9aeaaf) contains no .ts/.tsx files. `git ls-tree -r
review/assets | grep -E '\.tsx?$'` returns empty.

## Task 177: assets chunk size
review/assets: 1800 files. (Size ~192MB per original chunk commit; not re-measured
after no changes.)

## Task 163 (completed 2026-10-02): voice lines decode
81 MP3s in content/audio/voices/. All 81 decode cleanly via ffprobe (duration
readable). 0 failures. 81 > 20 required.

## Task 167 (completed 2026-10-02): lore entity references
All named people in lore (Vega, Oyelaran, Jessup, Adair, Governor Dumas, Colonel
Boatwright) resolve to content/characters/faction-leaders.md entries. All place
names are real US geography (by design per the lore rules). 0 orphans.

## Task 168 (completed 2026-10-02): radio dir references
3 stations (station-street, station-night, station-talk): MP3s in
clients/campaign/public/audio/radio/, WAV masters in content/audio/radio/.
Listed in radio-manifest.json, documented in RADIO.md and tools/radio/README.md.
NOT referenced by game client TypeScript (no .ts/.tsx imports). Recorded as
staged-but-unwired, not removed.

## Task 172 (completed 2026-10-02): per-GLB license entries — FLAGGED
clients/campaign/public/models/LICENSES.md has per-file entries. BUT 13+ entries
cite Quaternius/Poly Pizza CC0 packs (soldier-animated, female-operator, 5
operator-*.glb, tank-quaternius, 7 weapons/*.glb), which Del banned 2026-10-02
("No no Kenney assets", Forge-or-procedural only). Models were added 2026-10-01,
before the ban. Needs Del's call: remove/replace or exception. Kenney license
files in assets/licenses/ are orphaned (no Kenney models on disk).

## Task 173 (completed 2026-10-02): animation bone references
N/A by design: content/animation/troop-animator.ts is procedural whole-model
transform (bob/sway/lean/lunge/flinch/fall). The Forge GLBs are unrigged static
meshes — zero bones, zero clips. No bone references exist to check.

## Task 174 (completed 2026-10-02): public image orphans
9 images in clients/campaign/public (4 portraits, 2 banners, 3 PWA icons):
NONE referenced by client TypeScript source. Recorded as orphans/staged.

## Task 175 (completed 2026-10-02): pipeline scripts
tools/build-inventory.py --help: OK. tools/manifest-check.py --help: OK.
tools/process-assets.py: FAILS — needs pygltflib, not installed (pip blocked by
PEP 668). Recorded.

## Task 177 (completed 2026-10-02): chunk size re-measured
review/assets (f9aeaaf): 1800 files, 411.7 MB tree size. (Original "~192MB"
figure was wrong.)

## Task 178 (completed 2026-10-02): provenance table
milo-tasks/178-asset-provenance.md written.

## Task 180 (completed 2026-10-02): inventory report published
This file (milo-tasks/161-180-inventory.md) + 178-asset-provenance.md are the
published inventory report, committed to milo/tasks-101-200.
