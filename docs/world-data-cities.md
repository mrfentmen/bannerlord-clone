# World Data: Cities

Real-world city geometry for the Bannerlord-clone campaign map. All data is
sourced from OpenStreetMap (© OpenStreetMap contributors, ODbL) via
`tools/fetch-city-data.py`, which queries the Overpass API with curl.

## New York City — Wave 2 (2026-10-01)

Five-borough coverage for the NYC campaign region. Union bbox:
`-74.260,40.505,-73.765,40.895`.

### Borough extracts (`data/cities/nyc/`)

| Borough | File | Buildings | Streets | Bbox | Notes |
|---|---|---|---|---|---|
| Manhattan | `manhattan.json` | 9,470 | 1,154 | -74.025,40.695,-73.975,40.730 | Complete |
| Bronx | `bronx.json` | 10,000 | 5,054 | -73.935,40.780,-73.765,40.895 | Truncated at tool cap (10k); split into N/S halves when Overpass recovers |
| Brooklyn | `brooklyn.json` | — | — | -74.000,40.625,-73.940,40.695 | Blocked: Overpass API down 2026-10-01 |
| Queens | `queens.json` | — | — | -73.960,40.700,-73.780,40.780 | Blocked: Overpass API down 2026-10-01 |
| Staten Island | `staten_island.json` | — | — | -74.260,40.505,-74.050,40.650 | Blocked: Overpass API down 2026-10-01 |

Each borough file is gzip-compressed alongside (`*.json.gz`, ~20% of
original). Total compressed borough data: ~1.5 MB (well under the 15 MB
budget for the full five-borough set).

### Settlements (`data/cities/nyc/settlements.json`)

25 named neighborhoods as towns/villages for the campaign layer:
10 Manhattan, 6 Brooklyn, 4 Queens, 3 Bronx, 2 Staten Island.
Centroids are approximate — replace with OSM-derived centroids when the
borough extracts land.

### Elevation (`clients/campaign/public/world/elevation/12/`)

42 terrarium PNG tiles (zoom 12, x 1203–1208, y 1537–1543) covering the
five-borough union bbox. Fetched from AWS Open Data
(`s3.amazonaws.com/elevation-tiles-prod`).

### Validation

- All files parse as JSON.
- Zero empty geometries.
- Coordinates within declared bboxes except for long arterials whose full
  OSM way geometry legitimately extends past the edge (2 streets in the
  Bronx extract).
- Bronx extract is truncated at the tool's 10,000-building cap; the bbox
  will be split into north/south halves for full coverage.

### Remaining (blocked on Overpass recovery)

- Brooklyn / Queens / Staten Island borough pulls
- Bronx N/S split for full coverage
- Arterial extraction, bridge/tunnel crossings, police stations, hospitals
