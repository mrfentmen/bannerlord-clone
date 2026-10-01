# MUTE — World Data Task List

Boss order: work top to bottom. Max 4 OpenCode agents at a time. You code alongside them — no idle hands. No questions, we're AFK. Branch, commit, push. Pax merges.

Tools: `tools/fetch-city-data.py` for buildings/streets, `tools/fetch-elevation-tiles.py` for terrain. Curl only, never Python urllib. Data is © OpenStreetMap (ODbL).

Each item is one buildable unit. Check it off when the data is pulled, validated, and committed.

---

## A. New York City (1–20)

1. Manhattan buildings: bbox -74.025,40.695,-73.975,40.730 — pull via fetch-city-data.py
2. Manhattan streets: same bbox, verify primary/secondary/tertiary present
3. Brooklyn buildings: bbox -74.000,40.625,-73.940,40.695
4. Brooklyn streets: same bbox
5. Queens buildings: bbox -73.960,40.700,-73.780,40.780
6. Queens streets: same bbox
7. Bronx buildings: bbox -73.935,40.780,-73.765,40.895
8. Bronx streets: same bbox
9. Staten Island buildings: bbox -74.260,40.505,-74.050,40.650
10. Staten Island streets: same bbox
11. NYC elevation tiles: bboxes covering all 5 boroughs, zoom 12
12. NYC settlements: 25 named neighborhoods as towns/villages (Harlem, Chinatown, etc.)
13. NYC road network: major arterials connecting boroughs
14. NYC bridges/tunnels: mark crossings (Brooklyn Bridge, Lincoln Tunnel, etc.)
15. NYC validation: every JSON parses, coords in range, no empty geometries
16. NYC compression: total download under 15MB
17. NYC landmark tags: tag Central Park, Times Square, Wall St as special locations
18. NYC police stations: pull as castle-analog locations
19. NYC hospitals: pull as surgeon-recruit locations
20. NYC doc entry: bbox list, counts, tile count in docs/world-data-cities.md

## B. Los Angeles (21–40)

21. Downtown LA buildings: bbox -118.270,34.030,-118.235,34.065
22. Downtown LA streets: same bbox
23. Hollywood buildings: bbox -118.360,34.085,-118.320,34.115
24. Hollywood streets: same bbox
25. South Central buildings: bbox -118.300,33.960,-118.240,34.010
26. South Central streets: same bbox
27. Santa Monica buildings: bbox -118.520,34.005,-118.460,34.045
28. Santa Monica streets: same bbox
29. Long Beach buildings: bbox -118.220,33.745,-118.150,33.795
30. Long Beach streets: same bbox
31. San Fernando Valley buildings: bbox -118.620,34.150,-118.400,34.280
32. San Fernando Valley streets: same bbox
33. LA elevation tiles: bboxes covering all districts, zoom 12
34. LA settlements: 20 named districts as towns/villages
35. LA road network: freeways as major arterials (I-5, I-10, 101)
36. LA freeway interchanges: mark as strategic chokepoints
37. LA validation: schema + coord sanity
38. LA compression: under 15MB
39. LA landmark tags: Hollywood sign area, LAX, port of LA
40. LA doc entry in docs/world-data-cities.md

## C. Houston (41–60)

41. Downtown Houston buildings: bbox -95.390,29.740,-95.340,29.775
42. Downtown Houston streets: same bbox
43. Galleria buildings: bbox -95.470,29.730,-95.420,29.770
44. Galleria streets: same bbox
45. East Houston buildings: bbox -95.320,29.730,-95.260,29.780
46. East Houston streets: same bbox
47. Medical Center buildings: bbox -95.410,29.695,-95.380,29.725
48. Medical Center streets: same bbox
49. Ship Channel buildings: bbox -95.240,29.720,-95.180,29.760
50. Ship Channel streets: same bbox
51. Suburbs ring buildings: 4 bboxes at 15km radius, one per quadrant
52. Suburbs streets: same 4 bboxes
53. Houston elevation tiles: all bboxes, zoom 12 (flat terrain, fast)
54. Houston settlements: 15 named areas as towns/villages
55. Houston road network: freeways (I-10, I-45, 610 loop, Beltway 8)
56. Houston validation: schema + coord sanity
57. Houston compression: under 15MB
58. Houston landmark tags: port, refineries, stadiums
59. Houston industrial zones: tag for industrial biome battles
60. Houston doc entry in docs/world-data-cities.md

## D. Miami (61–80)

61. Downtown Miami buildings: bbox -80.205,25.760,-80.180,25.790
62. Downtown Miami streets: same bbox
63. South Beach buildings: bbox -80.145,25.760,-80.120,25.820
64. South Beach streets: same bbox
65. Little Havana buildings: bbox -80.230,25.755,-80.200,25.780
66. Little Havana streets: same bbox
67. Wynwood buildings: bbox -80.210,25.790,-80.185,25.815
68. Wynwood streets: same bbox
69. Coral Gables buildings: bbox -80.290,25.700,-80.250,25.730
70. Coral Gables streets: same bbox
71. Hialeah buildings: bbox -80.310,25.840,-80.270,25.880
72. Hialeah streets: same bbox
73. Miami elevation tiles: all bboxes, zoom 12
74. Miami settlements: 15 named areas as towns/villages
75. Miami road network: I-95, Dolphin Expy, causeways
76. Miami causeways: mark as strategic chokepoints (island connections)
77. Miami validation: schema + coord sanity
78. Miami compression: under 15MB
79. Miami landmark tags: port of Miami, airport, beaches
80. Miami doc entry in docs/world-data-cities.md

## E. National Connective Tissue (81–95)

81. Interstate highway network: I-95, I-10, I-40, I-70, I-80 as campaign-map arterials
82. Highway junctions: mark 20 major interchanges as strategic points
83. Secondary highways: US routes connecting the 4 cities to regions
84. Rail lines: freight corridors between the 4 metros
85. Airports: 20 major airports as fast-travel / strategic points
86. Seaports: 10 major ports as trade hubs
87. State border crossings: mark on highways
88. Mountain passes: Rockies, Appalachians — slow-movement zones
89. Desert corridors: I-10/I-40 southwest — water/food drain zones
90. River crossings: Mississippi, Missouri, Ohio — bridge/ford points
91. National settlement list: 100 largest US cities as towns with populations
92. Village ring: 200 smaller towns as villages around the majors
93. Gang territories: assign bandit-analog zones per region
94. Faction home regions: map 7 factions to territories on the data
95. National validation: all files parse, no orphan references

## F. Biome & Battle Data (96–105)

96. Urban biome anchor: Times Square bbox as reference urban battle map
97. Forest biome anchor: pick a dense forest area, export tree density data
98. Desert biome anchor: Arizona bbox, export arid terrain sample
99. Snow biome anchor: Colorado mountains bbox, export snow terrain
100. Swamp biome anchor: Louisiana bayou bbox, export water/mud zones
101. Coastal biome anchor: Miami beach bbox, export sand/water edge
102. Hills biome anchor: Appalachian bbox, export elevation variance
103. Plains biome anchor: Kansas bbox, export flat grassland
104. River biome anchor: Mississippi crossing bbox, export river + banks
105. Industrial biome anchor: Houston ship channel, export warehouse zones

## G. Pipeline & Docs (106–115)

106. docs/world-data-cities.md: full city catalog with bboxes and counts
107. Re-pull script: one command to refresh all 4 cities
108. Diff check: re-pull detects changed buildings, logs delta
109. Tile budget doc: max tiles per region before browser chokes (from pax's fix)
110. Data size dashboard: per-city MB, tile count, building count
111. License file: ODbL attribution for all OSM data
112. Backup: all city JSONs copied to versioned archive
113. Integration test: each city JSON loads in the client without errors
114. Help del: building renderer integration, asset pipeline
115. Final QA: every file validated, every doc accurate

---

Done = pulled, validated, committed, pushed. If a bbox returns over 10k buildings, split it and note the split.

---

## Wave 2 — Data for Gap Systems (from docs/bannerlord-gap-analysis.md)

Boss order: the new mechanics need data. Work after Wave 1.

116. Settlement loyalty baselines: starting loyalty per town based on faction culture match
117. Settlement security baselines: starting security per town
118. Village production table: assign each village a type (grain/fish/iron/silver/etc.) with daily output
119. Village hearth starting values: population per village
120. Town food production: base inside-production per town (+15) and castle (+10)
121. Workshop slots: how many workshops per town, what types available
122. Hideout locations: 20 bandit hideout spots on the map with terrain type
123. Notable rosters: 3-5 named notables per town with power ratings
124. Tournament locations: which towns host arenas
125. Garrison starting strengths: troops per town/castle
126. Trade good production: which towns produce which goods (for price sim)
127. Caravan route data: profitable routes between cities
128. Ransom broker locations: where brokers operate
129. Kingdom policy list: full policy data with effects (from modding docs)
130. Board game data: if implemented, tavern game configs
