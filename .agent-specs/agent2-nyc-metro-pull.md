# SPEC: NYC Metro World-Data Pull (Agent 2 — world-data lane)

## Boss order (via Pax)
Pull real world-data for the NYC metro as a SECOND region alongside Ohio. Ohio stays untouched and remains the default. This is additive.

I'm AFK. Ask no questions. Work autonomously until complete. Make reasonable decisions and keep going.

## Standing rules
- `opencode run --auto` is already set for this session. If a tool call is auto-rejected, DO NOT retry it — route around it (stay inside the repo, use node/python stdlib).
- Stage only files you own. Never `git add -A`. The tree carries other lanes' WIP.
- Push workflow: confirm local parent == live origin/main SHA via the GitHub API first (`python3 ~/workspace/skills/github/bin/gh_api.py GET /repos/Mrfentmen/bannerlord-clone/git/refs/heads/main`). Non-force push only, direct to main. If the Data API push is needed, use the established pattern from `~/workspace/goals/mount-blade-bannerlord-web-clone/hidden_files/push_main.py` — read it before improvising.
- Finish what you're currently doing (test-suite verification) before starting this spec, or interleave sanely. Do not leave the suite red.

## Task

### 1. Inspect the Ohio pipeline first
Read `services/world-data/src/worlddata/pipeline.py`, `datasets.py`, `elevation.py`, `export.py`, `client_wire.py`, and `clients/campaign/public/world/DATA-MANIFEST.md`. Understand exactly how the Ohio River Valley wire was produced: region bbox, settlement source (Census), roads/rail (OSM), elevation tiles (SRTM via `tools/fetch-elevation-tiles.py`), and the wire file layout the client reads (`region.json`, `settlements.json`, `network.json`, `boundaries.json`, elevation PNG tree).

### 2. Define the NYC metro region
- Bbox: **40.45–40.98 N, -74.40–-73.55 W** (5 boroughs + Hudson/Essex NJ + western Long Island). Adjust slightly if the pipeline needs rounder bounds, but stay close to this.
- Region id: `nyc-metro`. It must NOT collide with the Ohio region id or overwrite any Ohio wire file.

### 3. Run the pull
- Settlements/places, roads, rail for the bbox through the existing pipeline.
- Elevation tiles for the bbox via `tools/fetch-elevation-tiles.py` (concurrent download; skip tiles already cached).
- Emit client wire files under a new `nyc-metro` region path following the Ohio layout exactly, so the client can read it with no format changes.
- Write/update a manifest section for the new region (do not rewrite Ohio's section).

### 4. Verify before pushing
- Spot-check at least 5 well-known places (e.g. Manhattan, Brooklyn, Queens, Newark NJ, Jamaica Queens) against Census/OSM ground truth: name + coordinates within tolerance.
- Run the world-data test suite (`services/world-data`, pytest) — must be green.
- Run `npx tsc --noEmit` in `clients/campaign` if you touched anything the client reads — must be clean.
- Confirm the client can list/select the new region without breaking Ohio (read how the client selects regions; the Manhattan-sample `?city=` demo mode is prior art for multi-region).

### 5. Push and report
- Commit with message prefix `Agent2:` describing the NYC metro pull (settlement/road/rail/tile counts).
- Push per the standing push workflow above.
- Final message: region id, bbox actually used, counts (settlements, roads, rail segments, elevation tiles), verification results (spot-checks, test counts), commit SHA, and anything the client still needs to select the region in-game.
