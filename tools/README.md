# tools/

One-off data-fetch and build helpers for the bannerlord-clone world-data
pipeline. Each script documents its own usage in its header comment.

## Rules that apply to every script here

- **HTTP goes through curl via subprocess, never Python urllib.** This
  sandbox's egress proxy cuts urllib streams mid-download
  (`http.client.IncompleteRead`); curl completes them. If you add a new
  downloader, shell out to curl with `--fail --retry --retry-all-errors`.
- **Validate downloads before trusting them.** PNGs get a chunk-structure
  check; JSON gets parsed before anything is written.
- Write through a `.part` temp file and rename on success, so a failed run
  never leaves a half-written artifact.

## Scripts

### fetch-elevation-tiles.py

Downloads terrarium elevation PNG tiles listed in the wire `region.json`
into the campaign client's `public/world/elevation/` tree. Skips tiles that
already exist and pass PNG validation.

    python tools/fetch-elevation-tiles.py [--region PATH] [--out DIR] [--workers N]

### fetch-city-data.py

Fetches building footprints and major streets for a city bounding box from
OpenStreetMap via the Overpass API, and writes a compact JSON the client can
render as an urban map.

    python tools/fetch-city-data.py --bbox="minlon,minlat,maxlon,maxlat" --city NAME [--out DIR]

Example (Lower Manhattan):

    python tools/fetch-city-data.py --bbox="-74.0200,40.7000,-73.9900,40.7200" --city manhattan

Output: `<out>/<city>.json`

```json
{
  "city": "manhattan",
  "bbox": {"minlon": -74.02, "minlat": 40.7, "maxlon": -73.99, "maxlat": 40.72},
  "license": "(c) OpenStreetMap contributors ... (ODbL)",
  "retrieved": "2026-10-01T02:52:36Z",
  "building_count": 3254,
  "street_count": 510,
  "truncated": false,
  "buildings": [{"id": 38868195, "coords": [[-74.0124, 40.7007], ...], "levels": "5", "type": "apartments"}],
  "streets": [{"id": 5669636, "coords": [[-74.0049, 40.7124], ...], "name": "Centre Street", "kind": "secondary"}]
}
```

- One Overpass query per run (60s server timeout, descriptive User-Agent).
  Tries the public mirrors in order (`overpass-api.de`, `overpass.kumi.systems`,
  `overpass.nchc.org.tw`) because mirrors shed load and large transfers
  sometimes get cut.
- Hard cap of 10,000 buildings per call. A bbox that returns more is
  truncated with a loud warning — split it into smaller bboxes instead.
- All data is (c) OpenStreetMap contributors, made available under the
  Open Database License (ODbL). The license string is recorded in every
  output file; keep it there if you transform the data.

### test_fetch_elevation.py

Unit tests for the PNG validation in `fetch-elevation-tiles.py`.
