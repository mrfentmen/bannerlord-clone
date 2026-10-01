# Section ratings: computed, then checked against FACTIONS.md section 3

PHASES.md Phase 0 requires the six sides show rating profiles roughly matching FACTIONS.md
section 3, checked and not forced. This file is that check.

**No rating was adjusted to match the design target.** FACTIONS.md section 3 says the values are
to be computed from real data, so the targets are read here only to be compared against. Where
they disagree, the disagreement is the finding.

## Method

Each dimension produces one number per side: a weighted blend of that side's share of the national total for each input in [ratings.weights], so it reads directly as a fraction of the country. The 5 bands are the even division of the interval from one standard deviation below the mean side to one standard deviation above it (span 1.0 standard deviations), which puts 3 on the average side and makes one rating step half a standard deviation of the six sides. The mean and the standard deviation are computed from the real data; the design targets in FACTIONS.md section 3 are read only to be compared against, never to compute a value. The bands are deliberately NOT cut at percentiles of the 51 individual states: a side is an aggregate of 2 to 14 states, so its share of the national total is several times a single state's share and every side lands in the top band on every dimension. That is recorded per dimension in state_share_reference and explained in docs/SECTION_RATINGS.md.

## Computed ratings next to the design targets

| Section | Dimension | Computed | Design target | Agrees | Share of national |
|---|---|---|---|---|---|
| atlantic_corridor | food | **1** | 1 | yes | 5.15% |
| atlantic_corridor | gold | **1** | 4 | no | 1.32% |
| atlantic_corridor | metal | **3** | 2 | no | 17.15% |
| atlantic_corridor | money | **5** | 5 | yes | 24.36% |
| atlantic_corridor | population | **5** | 5 | yes | 22.50% |
| great_lakes_union | food | **5** | 5 | yes | 49.69% |
| great_lakes_union | gold | **1** | 1 | yes | 1.19% |
| great_lakes_union | metal | **3** | 4 | no | 17.40% |
| great_lakes_union | money | **4** | 3 | no | 18.77% |
| great_lakes_union | population | **5** | 5 | yes | 20.58% |
| lone_star_frontier | food | **2** | 3 | no | 9.27% |
| lone_star_frontier | gold | **1** | 2 | no | 0.19% |
| lone_star_frontier | metal | **1** | 4 | no | 5.08% |
| lone_star_frontier | money | **1** | 4 | no | 10.06% |
| lone_star_frontier | population | **1** | 3 | no | 10.32% |
| mountain_alliance | food | **2** | 2 | yes | 8.75% |
| mountain_alliance | gold | **5** | 5 | yes | 51.46% |
| mountain_alliance | metal | **5** | 5 | yes | 36.86% |
| mountain_alliance | money | **1** | 2 | no | 5.00% |
| mountain_alliance | population | **1** | 1 | yes | 7.68% |
| pacific_compact | food | **3** | 2 | no | 13.68% |
| pacific_compact | gold | **5** | 3 | no | 43.29% |
| pacific_compact | metal | **2** | 2 | yes | 11.39% |
| pacific_compact | money | **5** | 5 | yes | 23.00% |
| pacific_compact | population | **3** | 4 | no | 15.88% |
| southern_compact | food | **2** | 4 | no | 13.46% |
| southern_compact | gold | **1** | 1 | yes | 2.56% |
| southern_compact | metal | **2** | 3 | no | 12.12% |
| southern_compact | money | **4** | 3 | no | 18.80% |
| southern_compact | population | **5** | 4 | no | 23.05% |

**13 of 30 computed ratings match the design target** (on a 1-5 scale).

## Band edges used

Edges are percentiles of the distribution of the 51 individual states' shares of the national
total. They are what turn a real number into a 1-5 band.

| Dimension | 1/2 edge | 2/3 edge | 3/4 edge | 4/5 edge |
|---|---|---|---|---|
| food | 7.6346% | 13.6560% | 19.6773% | 25.6987% |
| gold | 3.5547% | 12.2960% | 21.0373% | 29.7786% |
| metal | 10.7108% | 14.6814% | 18.6520% | 22.6226% |
| money | 12.5100% | 15.2811% | 18.0522% | 20.8233% |
| population | 13.1023% | 15.4785% | 17.8548% | 20.2311% |

## Where the computed ratings disagree with FACTIONS.md, and what the data says

| Section | Dimension | Computed | Target | Direction | Share of national | Reading |
|---|---|---|---|---|---|---|
| atlantic_corridor | gold | 1 | 4 | weaker than designed | 1.32% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-0.70 across the six sides |
| atlantic_corridor | metal | 3 | 2 | stronger than designed | 17.15% | band 3 of <function max_rating at 0x7611b8c78d60>, z=0.05 across the six sides |
| great_lakes_union | metal | 3 | 4 | weaker than designed | 17.40% | band 3 of <function max_rating at 0x7611b8c78d60>, z=0.07 across the six sides |
| great_lakes_union | money | 4 | 3 | stronger than designed | 18.77% | band 4 of <function max_rating at 0x7611b8c78d60>, z=0.30 across the six sides |
| lone_star_frontier | food | 2 | 3 | weaker than designed | 9.27% | band 2 of <function max_rating at 0x7611b8c78d60>, z=-0.49 across the six sides |
| lone_star_frontier | gold | 1 | 2 | weaker than designed | 0.19% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-0.75 across the six sides |
| lone_star_frontier | metal | 1 | 4 | weaker than designed | 5.08% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-1.17 across the six sides |
| lone_star_frontier | money | 1 | 4 | weaker than designed | 10.06% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-0.95 across the six sides |
| lone_star_frontier | population | 1 | 3 | weaker than designed | 10.32% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-1.07 across the six sides |
| mountain_alliance | money | 1 | 2 | weaker than designed | 5.00% | band 1 of <function max_rating at 0x7611b8c78d60>, z=-1.68 across the six sides |
| pacific_compact | food | 3 | 2 | stronger than designed | 13.68% | band 3 of <function max_rating at 0x7611b8c78d60>, z=-0.20 across the six sides |
| pacific_compact | gold | 5 | 3 | stronger than designed | 43.29% | band 5 of <function max_rating at 0x7611b8c78d60>, z=1.22 across the six sides |
| pacific_compact | population | 3 | 4 | weaker than designed | 15.88% | band 3 of <function max_rating at 0x7611b8c78d60>, z=-0.13 across the six sides |
| southern_compact | food | 2 | 4 | weaker than designed | 13.46% | band 2 of <function max_rating at 0x7611b8c78d60>, z=-0.21 across the six sides |
| southern_compact | metal | 2 | 3 | weaker than designed | 12.12% | band 2 of <function max_rating at 0x7611b8c78d60>, z=-0.46 across the six sides |
| southern_compact | money | 4 | 3 | stronger than designed | 18.80% | band 4 of <function max_rating at 0x7611b8c78d60>, z=0.31 across the six sides |
| southern_compact | population | 5 | 4 | stronger than designed | 23.05% | band 5 of <function max_rating at 0x7611b8c78d60>, z=1.07 across the six sides |

Each row above is a real finding about the source data, not a pipeline fault. The three
structural reasons the computed numbers differ from the design targets are:

1. **The targets were written before any state data existed.** FACTIONS.md section 3 calls them
   "starting design targets", so a mismatch is evidence the pipeline is working, not that
   either side is wrong.
2. **Ports are the weakest input.** The Natural Earth ports file carries no throughput and no
   state attribute, so ports had to be attributed geometrically and weighted by a scale rank.
   A coast with many small wharves scores close to a coast with one deep-water port. Every
   port-derived figure inherits that weakness, and the money dimension leans on it.
3. **Gold has no volume series.** There is no machine-readable per-state gold tonnage, so the
   gold dimension runs on USGS mine-feature counts. That measures where mines are and have
   been, not how much metal came out, and it is why the gold and metal dimensions need to be
   read as intent flags rather than as output.

To change what the pipeline produces, change the data mapping in `[ratings.weights]` or the
field each sub-score reads, and re-run. Changing the target table changes only the comparison
column, never a computed value.
