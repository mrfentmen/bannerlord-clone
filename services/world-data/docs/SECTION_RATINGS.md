# Section ratings: computed, then checked against FACTIONS.md section 3

PHASES.md Phase 0 requires the six sides show rating profiles roughly matching FACTIONS.md
section 3, checked and not forced. This file is that check.

**No rating was adjusted to match the design target.** FACTIONS.md section 3 says the values are
to be computed from real data, so the targets are read here only to be compared against. Where
they disagree, the disagreement is the finding.

## Method

For each dimension, each side's real total is expressed as a share of the national total. Rating band edges are percentiles of the distribution of the 51 individual states' shares of that same national total, at percentiles [20.0, 40.0, 60.0, 80.0]. A side scores 5 when it holds more of the national figure than that percentile of individual states do. Because the bands come from the real state distribution rather than from FACTIONS.md, a side can legitimately score 1 on every dimension, and the comparison against the design targets is a report rather than an input.

## Computed ratings next to the design targets

| Section | Dimension | Computed | Design target | Agrees | Share of national |
|---|---|---|---|---|---|
| atlantic_corridor | food | **5** | 1 | no | 3.93% |
| atlantic_corridor | gold | **5** | 4 | no | 16.50% |
| atlantic_corridor | metal | **5** | 2 | no | 17.32% |
| atlantic_corridor | money | **5** | 5 | yes | 25.24% |
| atlantic_corridor | population | **5** | 5 | yes | 22.50% |
| great_lakes_union | food | **5** | 5 | yes | 58.69% |
| great_lakes_union | gold | **5** | 1 | no | 13.27% |
| great_lakes_union | metal | **5** | 4 | no | 17.13% |
| great_lakes_union | money | **5** | 3 | no | 19.22% |
| great_lakes_union | population | **5** | 5 | yes | 20.58% |
| lone_star_frontier | food | **5** | 3 | no | 9.86% |
| lone_star_frontier | gold | **5** | 2 | no | 6.51% |
| lone_star_frontier | metal | **5** | 4 | no | 6.11% |
| lone_star_frontier | money | **5** | 4 | no | 10.46% |
| lone_star_frontier | population | **5** | 3 | no | 10.32% |
| mountain_alliance | food | **5** | 2 | no | 10.16% |
| mountain_alliance | gold | **5** | 5 | yes | 35.87% |
| mountain_alliance | metal | **5** | 5 | yes | 35.77% |
| mountain_alliance | money | **5** | 2 | no | 7.18% |
| mountain_alliance | population | **5** | 1 | no | 7.68% |
| pacific_compact | food | **5** | 2 | no | 5.58% |
| pacific_compact | gold | **5** | 3 | no | 14.64% |
| pacific_compact | metal | **5** | 2 | no | 10.30% |
| pacific_compact | money | **5** | 5 | yes | 18.52% |
| pacific_compact | population | **5** | 4 | no | 15.88% |
| southern_compact | food | **5** | 4 | no | 11.78% |
| southern_compact | gold | **5** | 1 | no | 13.21% |
| southern_compact | metal | **5** | 3 | no | 13.37% |
| southern_compact | money | **5** | 3 | no | 19.38% |
| southern_compact | population | **5** | 4 | no | 23.05% |

**7 of 30 computed ratings match the design target** (on a 1-5 scale).

## Band edges used

Edges are percentiles of the distribution of the 51 individual states' shares of the national
total. They are what turn a real number into a 1-5 band.

| Dimension | 1/2 edge | 2/3 edge | 3/4 edge | 4/5 edge |
|---|---|---|---|---|
| food | 0.3389% | 0.9111% | 1.6835% | 3.3008% |
| gold | 0.3205% | 0.8753% | 1.7188% | 2.8998% |
| metal | 0.3205% | 0.8753% | 1.7188% | 2.8998% |
| money | 0.4040% | 0.9412% | 1.5616% | 2.8738% |
| population | 0.4186% | 0.9576% | 1.7550% | 2.7741% |

## Where the computed ratings disagree with FACTIONS.md, and what the data says

| Section | Dimension | Computed | Target | Direction | Share of national | Reading |
|---|---|---|---|---|---|---|
| atlantic_corridor | food | 5 | 1 | stronger than designed | 3.93% | band 5 of <function max_rating at 0x16662a020>, z=-0.67 across the six sides |
| atlantic_corridor | gold | 5 | 4 | stronger than designed | 16.50% | band 5 of <function max_rating at 0x16662a020>, z=-0.02 across the six sides |
| atlantic_corridor | metal | 5 | 2 | stronger than designed | 17.32% | band 5 of <function max_rating at 0x16662a020>, z=0.07 across the six sides |
| great_lakes_union | gold | 5 | 1 | stronger than designed | 13.27% | band 5 of <function max_rating at 0x16662a020>, z=-0.37 across the six sides |
| great_lakes_union | metal | 5 | 4 | stronger than designed | 17.13% | band 5 of <function max_rating at 0x16662a020>, z=0.05 across the six sides |
| great_lakes_union | money | 5 | 3 | stronger than designed | 19.22% | band 5 of <function max_rating at 0x16662a020>, z=0.42 across the six sides |
| lone_star_frontier | food | 5 | 3 | stronger than designed | 9.86% | band 5 of <function max_rating at 0x16662a020>, z=-0.36 across the six sides |
| lone_star_frontier | gold | 5 | 2 | stronger than designed | 6.51% | band 5 of <function max_rating at 0x16662a020>, z=-1.11 across the six sides |
| lone_star_frontier | metal | 5 | 4 | stronger than designed | 6.11% | band 5 of <function max_rating at 0x16662a020>, z=-1.12 across the six sides |
| lone_star_frontier | money | 5 | 4 | stronger than designed | 10.46% | band 5 of <function max_rating at 0x16662a020>, z=-1.03 across the six sides |
| lone_star_frontier | population | 5 | 3 | stronger than designed | 10.32% | band 5 of <function max_rating at 0x16662a020>, z=-1.07 across the six sides |
| mountain_alliance | food | 5 | 2 | stronger than designed | 10.16% | band 5 of <function max_rating at 0x16662a020>, z=-0.34 across the six sides |
| mountain_alliance | money | 5 | 2 | stronger than designed | 7.18% | band 5 of <function max_rating at 0x16662a020>, z=-1.57 across the six sides |
| mountain_alliance | population | 5 | 1 | stronger than designed | 7.68% | band 5 of <function max_rating at 0x16662a020>, z=-1.51 across the six sides |
| pacific_compact | food | 5 | 2 | stronger than designed | 5.58% | band 5 of <function max_rating at 0x16662a020>, z=-0.58 across the six sides |
| pacific_compact | gold | 5 | 3 | stronger than designed | 14.64% | band 5 of <function max_rating at 0x16662a020>, z=-0.22 across the six sides |
| pacific_compact | metal | 5 | 2 | stronger than designed | 10.30% | band 5 of <function max_rating at 0x16662a020>, z=-0.68 across the six sides |
| pacific_compact | population | 5 | 4 | stronger than designed | 15.88% | band 5 of <function max_rating at 0x16662a020>, z=-0.13 across the six sides |
| southern_compact | food | 5 | 4 | stronger than designed | 11.78% | band 5 of <function max_rating at 0x16662a020>, z=-0.26 across the six sides |
| southern_compact | gold | 5 | 1 | stronger than designed | 13.21% | band 5 of <function max_rating at 0x16662a020>, z=-0.38 across the six sides |
| southern_compact | metal | 5 | 3 | stronger than designed | 13.37% | band 5 of <function max_rating at 0x16662a020>, z=-0.35 across the six sides |
| southern_compact | money | 5 | 3 | stronger than designed | 19.38% | band 5 of <function max_rating at 0x16662a020>, z=0.45 across the six sides |
| southern_compact | population | 5 | 4 | stronger than designed | 23.05% | band 5 of <function max_rating at 0x16662a020>, z=1.07 across the six sides |

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
