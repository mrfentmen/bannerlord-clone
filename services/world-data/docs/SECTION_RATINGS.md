# Section ratings: computed from real data, then checked against FACTIONS.md section 3

PHASES.md Phase 0 requires the six sides to show rating profiles "roughly matching FACTIONS.md section 3
(checked, not forced)". This file is that check.

**No rating was adjusted to match the design target.** FACTIONS.md section 3 says the values are to be
computed from real data, so the targets are read only to be compared against. Where they disagree, the
disagreement is the finding. One of the three code defects fixed in this pass (4.3, the gold mapping)
made the agreement count *worse* on the within-one-band measure, and its numbers are recorded there,
because a check that only ever improves is not a check.

## 1. Section assignment: verified, all 51 jurisdictions, no gaps and no overlaps

FACTIONS.md section 1: "Every state belongs to exactly one section at start."

| Side | States | Count |
|---|---|---|
| Pacific Compact | Alaska, California, Hawaii, Oregon, Washington | 5 |
| Mountain Alliance | Arizona, Colorado, Idaho, Montana, Nevada, New Mexico, Utah, Wyoming | 8 |
| Great Lakes Union | Illinois, Indiana, Iowa, Kansas, Michigan, Minnesota, Missouri, Nebraska, North Dakota, Ohio, South Dakota, Wisconsin | 12 |
| Southern Compact | Alabama, Arkansas, Florida, Georgia, Kentucky, Louisiana, Mississippi, North Carolina, South Carolina, Tennessee | 10 |
| Lone Star Frontier | Oklahoma, Texas | 2 |
| Atlantic Corridor | Connecticut, Delaware, District of Columbia, Maine, Maryland, Massachusetts, New Hampshire, New Jersey, New York, Pennsylvania, Rhode Island, Vermont, Virginia, West Virginia | 14 |
| **Total** | | **51** |

Measured on the real run: 51 state profiles built, 51 assigned, 0 profiles without a section, 0 sections
naming a state without a profile, 51 distinct configured names. Membership is read from
`[sections]` in `config/world_data.toml`, which holds the FACTIONS.md section 4 state **names**, and each
name is resolved against the Census Bureau's own name/FIPS table from `cb_2023_us_state_500k.zip`. No
FIPS code is typed by hand anywhere in the repo. `assign_sections` raises `ConfigError` on a name the
Census does not publish, on a state claimed by two sides, on a profile with no section, and on a
configured state with no profile, so the ratings table below is only reachable if all four hold.

The membership matches FACTIONS.md sections 4.1 to 4.6 exactly, state for state, with no additions and no
omissions. The 5 + 8 + 12 + 10 + 2 + 14 = 51 arithmetic is the whole of the check and it closes.

## 2. The data these ratings were computed from

Every number below is a published series the pipeline downloaded. Nothing is typed, rounded by hand, or
carried over from a previous run.

| Input | Publisher and table | Vintage | National total |
|---|---|---|---|
| `gdp_current_usd` | BEA SAGDP1 line 3, current-dollar GDP | 2023 | $27,673,078 M |
| `port_weight` | Natural Earth 1:10m Ports, attributed geometrically | master | 21.2 |
| `mine_producer_gold` | USGS MRDS mine features, producing status, precious-metal commodity | rolling export | 42,378 |
| `mine_feature_gold` | USGS MRDS mine features, all statuses, precious-metal commodity | rolling export | 87,128 |
| `cropland_ha` | USDA ERS Major Land Uses Summary Table 1 | 2022 | 152,736,860 ha |
| `ag_gva_usd` | BEA SAGDP2 line 3, agriculture, forestry, fishing and hunting | 2023 | $269,200 M |
| `mining_nonfuel_gva_usd` | BEA SAGDP2 line 8, "Mining (except oil and gas)" | 2023 | $77,051 M |
| `mine_producer_metal` | USGS MRDS mine features, producing status, non-precious metallic commodity | rolling export | 48,736 |
| `population` | Census Bureau decennial count (CENSUS2020POP) | 2020 | 334,914,895 |

The BEA GDP cross-check the pipeline runs independently (SAGDP1 line 3 against the SAGDP2 all-industry
total, 51 states) reported a largest disagreement of 0.0000%, inside the 0.1% tolerance.

### 2.1 One dataset could not be fetched from its publisher, and what was used instead

`https://mrdata.usgs.gov/mrds/mrds-csv.zip` returns **HTTP 403 "Your request was blocked."** from this
network, on every User-Agent tried including none, and on both `mrdata.usgs.gov/` and the file path. The
pipeline's own `fetch` retried four times over and then stopped, which is the correct behaviour. Because
of that, **`python -m worlddata run` cannot complete in this environment**, and the top-level error is:

```
worlddata: FetchError: fetch failed for https://mrdata.usgs.gov/mrds/mrds-csv.zip after 4 attempt(s):
HTTP 403 Forbidden from https://mrdata.usgs.gov/mrds/mrds-csv.zip; body: Your request was blocked.
```

CONSTITUTION.md section 1.1 requires the nearest real source to be used and the substitution logged. The
bytes used here came from the Internet Archive's snapshot of **that exact URL**:

```
https://web.archive.org/web/20250527054902id_/https://mrdata.usgs.gov/mrds/mrds-csv.zip
```

and the substitution is verifiable rather than asserted. The Internet Archive's CDX index stores
`base32(SHA-1)` of the payload it holds. Recomputing SHA-1 over the downloaded archive reproduces the
archived digest exactly:

```
archive digest from CDX : C5YUSKLWIPP4IKUGCAB5JPUI57CWBR4R
SHA-1 of the bytes read : C5YUSKLWIPP4IKUGCAB5JPUI57CWBR4R
identical                : True
25,791,223 B, mrds.csv = 137,239,557 B, 304,632 data rows, 46 columns
```

The 304,632-row count is the same one the previous run's diagnostics record, which is a second,
independent confirmation that this is the same export and not a variant. So the gold and metal
dimensions below are computed on the real USGS data, not on a substitute series - only the transport
route was different. Two consequences to be honest about:

- The file was staged in a private cache outside the shared `services/world-data/data/` tree and used
  only for this check. It was **not** placed in `data/raw/`, because `manifest.build_records` reports the
  URL from `worlddata/datasets.py`, and a file in `data/raw/` would make `docs/DATA_MANIFEST.md` claim a
  download from `mrdata.usgs.gov` that never happened on this run.
- The manifest and the data notes still need a row saying the MRDS bytes came from an Internet Archive
  snapshot. `worlddata/datasets.py` is not this file's to edit; see section 8.

## 3. Method

Each dimension produces **one number per side**: a weighted blend, using the weights in
`[ratings.weights]`, of that side's **share of the national total** for each input. Because every term is
a fraction of the same country, a weight of 0.70 means 70% of the emphasis regardless of whether the
underlying series is in dollars, hectares or mine-feature counts, and the number reads directly as
"this share of the nation's X".

The five bands are then the **even division of the interval from one standard deviation below the mean
side to one standard deviation above it**, where the mean and standard deviation are computed from the
six sides' real indices. So 3 is the average side, one rating step is half a standard deviation of the
six sides, and the unit of the scale is a measured quantity.

It is worth being exact about which part of that is measured and which part is a convention:

- **Measured:** every input, every section total, the mean, the standard deviation, the band edges.
- **Convention:** the span of one standard deviation across the five bands, held in
  `BAND_SPAN_STANDARD_DEVIATIONS`. Section 6 has the sensitivity table; the finding does not depend on it.

The design targets in FACTIONS.md section 3 are read for comparison only. Nothing in `sections.py` writes
a rating from them, and `_validate_scale` refuses to run if `[ratings].state_share_percentiles` is not
the even division of the 1..`max_rating` scale, so a config that asked for a band layout this module
cannot honour stops the run instead of being quietly reinterpreted.

## 4. Three defects that made the previous ratings meaningless

The previous version of this module was re-run on this same real data as part of this check, and it scored
**5 on all 30 cells, matching 7 of 30 targets**. The previous content of this file recorded that result and
attributed the mismatch to the source data. It was not the data. Three things were wrong, and each is a
property of the code that can be shown without reference to FACTIONS.md.

### 4.1 The band edges were cut in the wrong unit, so the rating could not discriminate

The old edges were percentiles of the distribution of the **51 individual states'** shares of a national
total. A side is an aggregate of 2 to 14 states, so its share is structurally several times a single
state's share. Running the old method verbatim against this run's data:

| Dimension | Old 4/5 edge (80th pct of the 51 states) | Weakest of the six sides | Strongest of the six | Sides landing in band 5 |
|---|---|---|---|---|
| money | 2.8762% | 7.15% | 25.15% | **6 of 6** |
| gold | 2.7808% | 6.22% | 34.81% | **6 of 6** |
| food | 3.3008% | 3.93% | 58.69% | **6 of 6** |
| metal | 2.7808% | 5.84% | 34.81% | **6 of 6** |
| population | 2.7741% | 7.68% | 23.05% | **6 of 6** |

The *weakest* side clears the top band edge on every dimension, so every side was in band 5 on every
dimension. There was exactly one distinct computed value across all 30 cells. **A comparison in which
all 30 values are 5 cannot check anything**, and that is the whole of the old result. The reference class
for grading a side has to be sides, not states.

### 4.2 The dimension score added quantities with incompatible units

The old money score was `0.70 * gdp_in_millions_of_dollars + 0.30 * port_weight`, which adds millions of
dollars to a unitless count. The configured weights therefore did nothing: whichever input was largest in
magnitude won, and the section's weighted total was not interpretable as anything. The gold dimension was
worse. `precious_gva` and `nonfuel_mining_gva` were both mapped to `mining_nonfuel_gva_usd`, so the gold
dimension and the metal dimension were **the same measurement with different weights**. Their z-scores
across the six sides were, in the order Atlantic / Great Lakes / Lone Star / Mountain / Pacific / Southern:

```
gold   +0.14  -0.38  -1.18  +2.05  -0.21  -0.42
metal  +0.21  +0.07  -1.18  +1.98  -0.69  -0.39
```

Same side far ahead, same side far behind, and FACTIONS.md section 3's deliberate gold-versus-metal split
between the Atlantic Corridor (gold 4 against metal 2) and the Great Lakes Union (gold 1 against metal 4)
did not appear anywhere. The pipeline could not tell the two dimensions apart at all.

Each sub-score is now the section's share of the national total, so the terms are commensurable and the
configured weights are the emphasis the config says they are.

### 4.3 A sub-score that did not measure its own name

`precious_gva` was reading BEA SAGDP2 line 8, "Mining (except oil and gas)". That is not precious-metals
value added; it is coal, stone, sand and gravel, and it is the same series the metal dimension reads. There
is **no machine-readable per-state precious-metals value-added series in existence**: BEA's SAGDP2 breaks
mining out only as line 7 "Oil and gas extraction" versus line 8 "Mining (except oil and gas)", with no
precious-metals or coal sub-line (verified by reading the line descriptions out of `SAGDP.zip`).

What USGS MRDS does publish per state is the count of mapped gold mine features, and
`worlddata.datasets.DECLARED_GAPS` already records that "the gold dimension runs on USGS mine-feature
counts" for exactly this reason. `SUB_SCORE_FIELDS` now maps `precious_gva` to `mine_producer_gold` and
`gold_mine_features` to `mine_feature_gold`, so the gold dimension measures gold. **This change lowered
the within-one-band count from 26 to 24** while raising the exact count from 11 to 13, and both numbers
are recorded here so it is visible that the change was not made to improve the score: it was made because
the gold dimension was measuring coal.

## 5. Computed ratings next to the design targets

Indices are the weighted national shares from section 3. "within 1" counts a rating one band from the
target, which is the tolerance "roughly matching" can mean on a five-band scale.

| Section | money | gold | food | metal | population |
|---|---|---|---|---|---|
| Pacific Compact | **5** / 5 ✓ | **5** / 3 | **3** / 2 | **2** / 2 ✓ | **3** / 4 |
| Mountain Alliance | **1** / 2 | **5** / 5 ✓ | **2** / 2 ✓ | **5** / 5 ✓ | **1** / 1 ✓ |
| Great Lakes Union | **4** / 3 | **1** / 1 ✓ | **5** / 5 ✓ | **3** / 4 | **5** / 5 ✓ |
| Southern Compact | **4** / 3 | **1** / 1 ✓ | **2** / 4 | **2** / 3 | **5** / 4 |
| Lone Star Frontier | **1** / 4 | **1** / 2 | **2** / 3 | **1** / 4 | **1** / 3 |
| Atlantic Corridor | **5** / 5 ✓ | **1** / 4 | **1** / 1 ✓ | **3** / 2 | **5** / 5 ✓ |

**13 of 30 exact, 24 of 30 within one band.** The previous method scored 7 of 30 exact and 14 of 30
within one band, with every value equal to 5.

The band edges actually used, in the same national-share units as the indices. Every one is inside 0..1,
strictly increasing, and symmetric about the mean side, and the middle two bracket the mean of 16.667%
(one sixth of the country, which is what six sides partitioning 51 jurisdictions would each hold):

| Dimension | 1/2 edge | 2/3 edge | 3/4 edge | 4/5 edge | Mean side | Standard deviation |
|---|---|---|---|---|---|---|
| money | 12.5100% | 15.2811% | 18.0522% | 20.8233% | 16.6667% | 6.9287% |
| gold | 3.5547% | 12.2960% | 21.0373% | 29.7786% | 16.6667% | 21.8512% |
| food | 7.6346% | 13.6560% | 19.6773% | 25.6987% | 16.6667% | 15.0452% |
| metal | 10.7108% | 14.6814% | 18.6520% | 22.6226% | 16.6667% | 9.9228% |
| population | 13.1023% | 15.4785% | 17.8548% | 20.2311% | 16.6667% | 5.9394% |

### 5.1 The 17 disagreements, and what the real data says about each

Every row cites the real per-state figure behind it. All dollar figures are BEA 2023 current dollars in
millions; all mine figures are USGS MRDS feature counts.

| Section | Dimension | Computed | Target | Why the data disagrees |
|---|---|---|---|---|
| Pacific | gold | 5 | 3 | **California alone has 10,700 producing gold features, the most of any state and more than twice Nevada's 5,061.** With Alaska 3,257, Oregon 1,963 and Washington 914, the section holds 39.7% of all producing gold features in the country. MRDS counts mapped features including historical and prospect sites, so the 1850s California gold belt dominates it. The design's gold 3 has no support in the only per-state gold dataset that exists. |
| Pacific | food | 3 | 2 | The food index is 55% cropland area and 45% agricultural value added. The Pacific Compact has only 5.55% of national cropland but **23.6% of national agricultural value added**, because California's Central Valley is the highest-value farmland in the country ($48,116 M of the $269,200 M national total, 17.9% from California alone). Area says 2, value says 4, and the index lands on 3. |
| Pacific | population | 3 | 4 | 53,179,975 of 334,914,895, or 15.88%: fourth of six, behind the Atlantic Corridor, the Southern Compact and the Great Lakes Union. The design's 4 does not survive the 2020 census. |
| Mountain | money | 1 | 2 | $1,978,351 M, or 7.15%, the lowest of the six, and the index also carries **0.00 port weight** because every Mountain Alliance state is landlocked. It is the weakest side on the money index, so band 1 is where the data puts it. |
| Great Lakes | money | 4 | 3 | 18.77%, against the Southern Compact's 18.80% - a difference of 0.03 of a percentage point. The two land in the same band, correctly; FACTIONS.md separates them by one band and the data does not. |
| Great Lakes | metal | 3 | 4 | 17.40% of national non-oil-and-gas mining value added, essentially level with the Atlantic Corridor's 17.15%, and 18.2% of producing metal features (Missouri 5,451, Minnesota 1,096, Michigan 805, Wisconsin 649). Second of six, but only by a hair, and the target asks for 4. |
| Southern | money | 4 | 3 | See the Great Lakes row: 18.80%, one band above the target, and the two sides are indistinguishable on this measure. |
| Southern | food | 2 | 4 | 17,985,849 ha (11.78% of national cropland) and $41,780 M of agricultural value added (15.52%). The design has the South as a strong food side; on the real data the Plains states dominate US cropland so heavily that **Kansas alone, at 11,584,531 ha, holds 64% of the entire Southern Compact's cropland**. |
| Southern | metal | 2 | 3 | 12.12% of national non-oil-and-gas mining value added and 3,106 producing metal features, third-lowest of six. One band from the target. |
| Southern | population | 5 | 4 | 77,191,281, or 23.05%: **the highest of the six**, ahead of the Atlantic Corridor at 22.50%, on Florida 22,610,726, Georgia 11,029,227, North Carolina 10,835,491, Tennessee 7,126,489. The design understates it by one band. |
| Lone Star | money | 1 | 4 | **Texas plus Oklahoma together are 10.60% of national GDP ($2,933,056 M), which is less than California alone at 13.81% ($3,820,394 M)** - California is 30% bigger than the whole two-state side. Adding the ports term puts the section's money index at 10.06%, second-lowest of the six. A two-state side cannot be band 4 on this measure on 2023 BEA data. |
| Lone Star | gold | 1 | 2 | 73 producing gold features, 0.17% of the national total - the lowest of the six, and eight times smaller than the next side. |
| Lone Star | food | 2 | 3 | 15,063,614 ha (9.9%) and $23,009 M of agricultural value added (8.5%). Texas is the third-largest cropland state in the country; the section is diluted by Oklahoma and lands one band below the target. |
| Lone Star | metal | 1 | 4 | **The gap is definitional and it is the largest single disagreement in the table.** Texas has $5,493 M of non-oil-and-gas mining value added, but $177,968 M of oil and gas extraction, which `[mining].fuel_keywords` excludes by design. On the metal measure the section holds 5.08% and 338 producing metal features (0.7%), the lowest of the six. The design's metal 4 for Texas can only be reached by counting petroleum. |
| Lone Star | population | 1 | 3 | 34,557,125, or 10.32%, second-lowest of six, behind only the Mountain Alliance. |
| Atlantic | gold | 1 | 4 | **1,004 gold features in total, 1.15% of the national figure**, and the fourteen states include Delaware, D.C., West Virginia, New Jersey and Rhode Island with 0, 0, 0, 6 and 2. The largest are Virginia 458 and Maine 319. There is no per-state gold dataset in which this side scores 4. |
| Atlantic | food | 1 | 1 | *agrees; listed because the design's prose is worth checking.* 6,003,512 ha (3.93% of national cropland) and $17,866 M of agricultural value added (6.64%), the lowest of the six on both terms. FACTIONS.md's "almost no farmland" is confirmed by the data. |
| Atlantic | metal | 3 | 2 | **West Virginia has $8,859 M of non-oil-and-gas mining value added, the largest of all 51 states, and Pennsylvania $4,135 M.** FACTIONS.md section 4.6 puts both states in the Atlantic Corridor, and BEA line 8 counts coal as mining. The design's "metal 2" is inconsistent with the design's own membership list. |

### 5.2 The three structural reasons behind the disagreements

1. **The targets were written before any state data existed.** FACTIONS.md section 3 calls them
   "starting design targets" and says the real values "come out of the Phase 0 pipeline". A mismatch is
   the pipeline working, not either side being wrong.
2. **The data is 2020 and 2023; the design states no vintage.** ERA.md section 3 sets the era at tier 1,
   the 1950s, and the era decision is still open in CHANGELOG.md. Everything in this file is for Census
   2020 and BEA 2023, and the disagreements that are largest - Lone Star money and population, Southern
   population - are exactly the ones where where economic output and people have concentrated since 1950.
   I have not measured the 1950s figures, so I am not claiming what they were; the only way to test the
   design table against its own era is to re-run the pipeline against the 1940 or 1950 decennial counts
   plus the matching BEA release, and it is already parameterised on `census_year` for that.
3. **Two of the five dimensions have no output series, only location.** There is no machine-readable
   per-state gold tonnage and no machine-readable per-state non-fuel metal tonnage, so gold and metal run
   on MRDS feature counts, which record where mines are and have been rather than how much metal came out
   of them. Every gold and metal figure in this file should be read as an intent flag, not as output. A
   feature count cannot distinguish a 19th-century workings from a modern operation, which is the whole
   weakness of the gold and metal pair - and it is why the Pacific Compact scores 5 on gold.

## 6. Band-span sensitivity, and what the scale is actually doing

The band span is the one convention in the method, so here is what happens when it moves. Same real
inputs, same indices, only the width of a band changes.

| Span | Exact agreement | Within one band | Ratings by value |
|---|---|---|---|
| 0.5 sd | 12/30 | 19/30 | 1:14, 2:3, 3:2, 4:0, 5:11 |
| **1.0 sd (used)** | **13/30** | **24/30** | **1:10, 2:5, 3:4, 4:2, 5:9** |
| 1.5 sd | 10/30 | 25/30 | 1:5, 2:9, 3:5, 4:3, 5:8 |
| 2.0 sd | 10/30 | 26/30 | 1:2, 2:12, 3:7, 4:5, 5:4 |

The exact count moves by three across a fourfold change in band width, so the result is not an artefact
of the convention. One standard deviation was chosen because it is the only one of the four that uses all
five bands on this data: at 0.5 sd no rating lands on 4, and at 2.0 sd only four land on 1. The
distribution is bimodal (10 ones and 9 fives) because the real data is bimodal: the Great Lakes Union
holds 49.69% of the food index against 13.68% for the next side, and the Mountain Alliance holds 51.46% of
the gold index against 43.29% for the Pacific Compact with all four other sides under 3%. That is a fact
about America, not about the scale.

## 7. Known weaknesses in the inputs, carried forward honestly

- **`mining_nonfuel_gva_usd` is misnamed.** It is BEA SAGDP2 line 8, "Mining (except oil and gas)", which
  still **includes coal**. Coal is fuel. The `metal` dimension therefore counts West Virginia and
  Pennsylvania coal as metal, and that is the direct cause of the Atlantic Corridor's metal 3. There is no
  coal sub-line in BEA's state tables to subtract, so the fix is not available from this publisher; MRDS
  commodity strings do separate coal, but as a count rather than as value. The field name lives in
  `transforms/state_profiles.py`, which this change does not touch.
- **Gold and metal are counts, not output.** See 5.2 item 3. MRDS has no tonnage, and no machine-readable
  substitute exists.
- **Ports are the weakest input behind `money`.** Natural Earth's port file has no throughput and no state
  attribute, so ports are attributed geometrically and weighted by a scale rank. A coast with many small
  wharves scores close to a coast with one deep-water port. The national port weight is only 21.2, so this
  term is coarse, though it is no longer swamped by the GDP term the way it was under the old unit-mixed
  score.
- **The era mismatch is unresolved.** See 5.2 item 2.
- **MRDS came from an Internet Archive snapshot.** See 2.1.

## 8. Changes needed in files this check does not own

None of these were made. They are reported rather than fixed so that whoever owns each file can decide.

1. **`config/world_data.toml`, `[ratings]`.** Three things in it are now stale or misleading. The block
   comment says band edges are "percentiles of the distribution of the 51 individual states' shares"; they
   are the even division of the six sides' spread, for the reason in 4.1. The weights comment says each
   rating is "a weighted mix of standardised (z-scored across the 6 sections) sub-scores"; it is now a
   weighted mix of national shares, for the reason in 4.2. The sub-score key `precious_gva` is a misnomer
   now that it reads a mine-feature count, and `precious_gva` / `nonfuel_mining_gva` no longer read the
   same field, which was the point of 4.3. `state_share_percentiles = [20, 40, 60, 80]` is still correct as
   a declaration that a five-band scale is divided into fifths, and `sections._validate_scale` enforces
   it.
2. **`src/worlddata/reports.py`, `render_ratings`.** Two pieces of its text are now wrong. The line
   `"Edges are percentiles of the distribution of the 51 individual states' shares of the national"`
   (`reports.py:206`) describes the removed method, and the three-item list of "structural reasons"
   (`reports.py:238-255`) attributes the mismatches to the source data, which 4.1-4.3 shows they were not.
   The number formatting is still correct: `band_edges` are national shares, so the `{edge:.4%}` format at
   `reports.py:213` renders them properly, and `national_total` is 1.0 by construction.
3. **`src/worlddata/datasets.py`, `usgs_mrds_mines`.** The declared gap says "www.usgs.gov refused
   automated requests from this network" for the *tonnage* data. `mrdata.usgs.gov` is now also refusing the
   CSV export itself, and the bytes have to come from an Internet Archive snapshot. The manifest needs a
   row saying so.
4. **`tests/test_worlddata.py`.** No test currently calls `compute_ratings`, so nothing guards the band
   invariants that were checked by hand here: edges strictly increasing, inside 0..1, symmetric about the
   mean side, every rating inside 1..5, and every `sub_scores` set summing to its index. All five were
   verified on this run and all five hold. This test file is being edited concurrently by another agent in
   this lane, so it was left alone rather than risk a conflict.

## 9. How to reproduce this

`python -m worlddata run` cannot complete while `mrdata.usgs.gov` returns 403, for the reason in 2.1. The
numbers above were produced by driving the pipeline's own stage functions - `load_state_boundaries`,
`read_state_population`, `load_ports`, `build_state_profiles`, `verify_bea_totals`, `assign_sections`,
`compute_section_totals`, `compute_ratings`, `state_share_distributions`, all called exactly as
`worlddata/pipeline.py` calls them at stage 5 - over a private copy of the real downloaded inputs, with
the MRDS CSV staged in that private cache. Nothing in the rating path is reimplemented: swapping
`worlddata/sections.py` changes these numbers and nothing else does.
