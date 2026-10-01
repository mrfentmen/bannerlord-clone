# Campaign map tile renderer

Renders slippy-map PNG tiles (`z/x/y.png`, 256px) of the tactical campaign
map from world-data exports. Zero new data collection — it reads the same
`settlements.jsonl.gz` and `routes.jsonl.gz` the client already ships.

## What it draws

- Settlement dots sized by population (village → metro), amber on dark slate
- Road links (gray) and rail links (bronze) between settlements
- Town labels at zoom 7+ for population ≥ 20k
- Graticule grid

## Run it

```sh
python3 tools/map-tiles/render-tiles.py \
  --bbox -84.8 38.4 -80.5 41.9 \
  --zooms 6 7 8 \
  --out clients/campaign/public/world/tiles \
  --manifest clients/campaign/public/world/tiles.json
```

Any bbox/zoom range works; the demo tiles ship the Ohio River Valley
(the region the campaign client currently loads).

## Client use

Point the campaign map's tile layer at `world/tiles/{z}/{x}/{y}.png`.
`tiles.json` records bbox, zooms, tile count, and sources.

## Style

`tactical-v1`: dark slate land, amber accents — matches the era color grade
in `tools/art/POST_PROCESSING.md`. Tweak the palette constants at the top of
`render-tiles.py` to reskin.
