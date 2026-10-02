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
