# City data + map tiles (Midwest / Eastern US)

Pulled 2026-10-03 for the campaign map. Del's order: these are the deliverable
("it's the tiles themselves") for the Bannerlord-style web game campaign map.

## What's here

- **4 regional JSONs** (`southeast.json`, `midwest-central.json`,
  `great-lakes.json`, `mid-atlantic.json`): settlement lists with name, state,
  population (U.S. Census Bureau estimates), and verified lat/lon.
- **`tiles/`**: 500 zoom-12 map tiles (PNG) covering 20 cities, 5 per region,
  in standard slippy-map layout:
  `tiles/<region>/<city-slug>/12/<x>/<y>.png`

Cities covered:
- Great Lakes: Chicago, Columbus, Detroit, Indianapolis, Milwaukee
- Mid-Atlantic: Baltimore, Philadelphia, Pittsburgh, Richmond, Washington DC
- Midwest Central: Des Moines, Kansas City, Oklahoma City, St. Louis, Wichita
- Southeast: Atlanta, Birmingham, Charlotte, Memphis, Nashville

## For campaign-map wiring (Hana's lane)

- Tiles are raw zoom-12 PNGs. The client should NOT ship all 50MB;
  downsample/crop to the in-game region and pack into a texture atlas.
- Settlement JSONs map 1:1 to regions; each entry has lat/lon for
  placing markers on the campaign map.
- Tile coordinates are standard Web Mercator (z/x/y) if you need to
  compute which tiles cover a given lat/lon bounding box.
