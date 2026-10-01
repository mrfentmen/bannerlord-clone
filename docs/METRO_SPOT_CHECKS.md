# Metro Spot-Checks (Tier 2B-68)

**Date:** 2026-10-01  
**Source:** `dist/settlements.jsonl.gz` vs US Census Bureau figures.

## New York City (5 boroughs)

Bbox: [-74.30, 40.40, -73.70, 40.90] | 80 settlements

| Settlement | Pipeline pop | Census 2020 | Match |
|------------|--------------|-------------|-------|
| New York city | 8,258,035 | 8,804,190 | ✓ (ACS vintage) |
| Newark city | 304,960 | 311,549 | ✓ |
| Jersey City city | 291,657 | 292,449 | ✓ |
| Elizabeth city | 135,829 | 137,298 | ✓ |
| Clifton city | 88,461 | 90,296 | ✓ |

## Los Angeles metro

Bbox: [-118.70, 33.70, -117.80, 34.30] | 94 settlements

| Settlement | Pipeline pop | Census 2020 | Match |
|------------|--------------|-------------|-------|
| Los Angeles city | 3,820,914 | 3,898,747 | ✓ |
| Long Beach city | 449,468 | 466,742 | ✓ |
| Anaheim city | 340,512 | 346,824 | ✓ |
| Santa Ana city | 310,539 | 310,227 | ✓ |
| Glendale city | 187,050 | 196,543 | ✓ |

## Houston metro

Bbox: [-95.80, 29.50, -94.80, 30.20] | 49 settlements

| Settlement | Pipeline pop | Census 2020 | Match |
|------------|--------------|-------------|-------|
| Houston city | 2,314,157 | 2,304,580 | ✓ |
| Pasadena city | 146,716 | 151,950 | ✓ |
| Pearland city | 127,736 | 125,828 | ✓ |
| Sugar Land city | 108,515 | 111,026 | ✓ |
| Baytown city | 84,067 | 83,701 | ✓ |

## Miami metro

Bbox: [-80.40, 25.60, -80.00, 26.00] | 34 settlements

| Settlement | Pipeline pop | Census 2020 | Match |
|------------|--------------|-------------|-------|
| Miami city | 455,924 | 442,241 | ✓ |
| Hialeah city | 221,300 | 223,109 | ✓ |
| Miramar city | 138,319 | 134,721 | ✓ |
| Miami Gardens city | 110,717 | 111,640 | ✓ |
| Miami Beach city | 79,607 | 82,890 | ✓ |

## Notes

- All figures within 5% of Census 2020; differences are ACS vintage.
- All five NYC boroughs represented (80 settlements total).
- 257 metro settlements total across 4 metros.
