# City Elevation Tiles - Midwest and Eastern US

Terrain elevation tiles (terrarium format) for 20 priority cities across the
Midwestern and Eastern United States. Fetched 2026-10-03 to support Hannah's
city work.

## Source
- AWS Open Data, `elevation-tiles-prod`
- URL pattern: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- Format: Terrarium (elevation_m = R * 256 + G + B / 256 - 32768)
- Zoom: 12, 256x256 PNGs

## Coverage
500 tiles total (25 per city, 5x5 grid centered on city coordinates):

**Southeast (125):** Atlanta GA, Nashville TN, Charlotte NC, Birmingham AL, Memphis TN
**Midwest Central (125):** Kansas City MO, St. Louis MO, Wichita KS, Des Moines IA, Oklahoma City OK
**Great Lakes (125):** Chicago IL, Detroit MI, Columbus OH, Indianapolis IN, Milwaukee WI
**Mid-Atlantic (125):** Washington DC, Philadelphia PA, Baltimore MD, Pittsburgh PA, Richmond VA

## Layout
```
elevation-cities/
  {region}/           # southeast, midwest-central, great-lakes, mid-atlantic
    {city-slug}/       # e.g. atlanta-ga, kansas-city-mo
      12/
        {x}/
          {y}.png
```

City coordinates and populations are in `../settlements.json` and the raw
research files in `~/workspace/city-data/` (not in repo).
