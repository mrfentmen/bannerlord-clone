# DEL — Campaign Client / Gameplay Task List

Boss order: work top to bottom. Max 4 OpenCode agents at a time. You code alongside them — no idle hands. No questions, we're AFK. Branch, commit, push. Pax merges.

Each item is one buildable unit. Check it off when it's tested and committed.

---

## A. Battle Scene Core (1–20)

1. Battle scene bootstrap: Babylon scene separate from campaign, loads a biome template
2. Biome template loader: pick 1 of 10 biomes by terrain type at battle location
3. Plains biome: flat grass terrain, scattered trees, skybox
4. Forest biome: dense instanced trees, reduced sight lines
5. Urban biome: street grid + building boxes from OSM data
6. Snow biome: white terrain material, falling snow particles
7. River crossing biome: river mesh through middle, 2 bridges, ford points
8. Desert biome: sand material, rocks, heat haze
9. Hills biome: elevated terrain mesh, high ground positions
10. Swamp biome: water patches, slow-movement zones
11. Coastal biome: beach + water plane on one edge
12. Industrial biome: warehouse boxes, fences, containers
13. Weather overlay: rain, fog, clear — applies to any biome
14. Time-of-day lighting: dawn/day/dusk/night variants per biome
15. Deployment phase UI: place your troops before battle starts
16. Battle camera: follow player, free-look toggle
17. Minimap in battle: troop dots, objective markers
18. Battle intro: faction banners, troop counts, terrain name
19. Battle outro: victory/defeat screen, casualty list
20. Return to campaign: apply casualties, loot, prisoners, XP

## B. Melee Combat (21–35)

21. Player character controller: WASD movement in battle scene
22. Walk animation wiring (existing Soldier.glb walk clip)
23. Run animation wiring (existing run clip, shift to sprint)
24. 4-directional attack: mouse movement + click sets swing direction
25. Up attack animation + hitbox
26. Down attack animation + hitbox
27. Left attack animation + hitbox
28. Right attack animation + hitbox
29. Thrust/stab attack (forward)
30. Directional block: hold RMB, match attack direction
31. Block hit reaction: spark, sound, stamina drain
32. Wrong-direction block: damage leaks through, shield takes damage
33. Kick: stagger opponent, break their block
34. Feint: cancel swing mid-animation
35. Chamber block: attack into enemy attack to deflect

## C. Damage & Weapons (36–50)

36. Damage model: base damage × velocity × body part × armor
37. Damage types: blunt (bonus vs armor), pierce, cut — wire to UI icons
38. Headshots: bonus damage multiplier, helmet check
39. Shield system: HP per shield, breaks after enough damage
40. Shield passive block: projectiles stopped even when not actively blocking
41. Weapon inventory: equip 1H, 2H, polearm, shield combos
42. Bats, knives, pipes: melee weapon stats (modern adaptation)
43. Pistols: close-range firearm, reload timer
44. Rifles: long-range firearm, aim-down-sights
45. Throwing: knives/bricks, arc trajectory
46. Weapon switching: 1/2/3 keys + scroll wheel
47. Ammo system: bullets per weapon, resupply from dead
48. Weapon durability: degrades, repairable at towns
49. Couched lance analog: drive-by melee at vehicle speed = massive damage
50. Braced pike analog: set against vehicles/charges for bonus

## D. Vehicle Combat (51–60)

51. Car entity: drivable, HP, fuel
52. Enter/exit vehicle (E key near car)
53. Vehicle speed → melee damage bonus (drive-by)
54. Vehicle ramming: damage to infantry on contact
55. Vehicle HP + destruction: explosion, driver ejects
56. Fuel consumption per km, refuel at towns
57. Truck: slower, more HP, carries more troops
58. Motorcycle: fast, fragile, drive-by bonus
59. Vehicle camera: third-person follow
60. Parked vehicles as battle cover

## E. Troop AI & Formations (61–75)

61. Basic troop AI: advance toward nearest enemy, attack in range
62. Line formation: troops arrange in a row
63. Shield wall formation: shields front, slow advance
64. Wedge formation: charge bonus, for vehicles/cavalry
65. Square formation: anti-surround, all-directions defense
66. Skirmish formation: spread out, for ranged troops
67. Loose formation: scattered, for rough terrain
68. Order: charge (all attack)
69. Order: hold position
70. Order: follow me
71. Order: advance (slow push)
72. Order: retreat (fighting withdrawal)
73. Order: fire at will / hold fire (ranged)
74. Formation facing: rotate formation to face threat
75. Reinforcements: waves spawn when battle size exceeds cap

## F. Morale & Battle Flow (76–85)

76. Morale per unit: drops from casualties, flanked, leader death
77. Rout: unit flees when morale breaks, can be rallied
78. Rally: player shout restores nearby morale (cooldown)
79. Army-wide morale: battle ends when one side routs
80. Prisoners: capture routed enemies, ransom or recruit
81. Loot: collect weapons/armor/gold from battlefield
82. Wounded vs dead: surgeon skill saves wounded
83. Battle size cap config: default 500, adjustable (the 7,272-unit dial)
84. Auto-resolve: simulate battle from party strength, no 3D
85. Retreat: tactical withdrawal, save some troops, lose field

## G. Battle UI (86–95)

86. Health bar + stamina bar (player)
87. Enemy health bars (targeted/focused)
88. Troop count panel: alive/wounded/dead per formation
89. Order buttons: charge/hold/follow/advance/retreat/fire
90. Formation buttons: line/wall/wedge/square/skirmish/loose
91. Kill feed: who killed whom
92. Damage numbers: floating text on hits
93. Hit direction indicator: red flash from attack side
94. Low-health vignette + heartbeat
95. Pause menu in battle: resume, retreat, settings

## H. Character Creation (96–110)

96. Character creation screen: name, gender, appearance
97. Culture select: 10 ethnicities with pro/con display
98. Starting region: set by culture pick
99. Attribute allocation: 6 attributes, points to spend
100. Skill focus: pick focus points per skill
101. Backstory questions: childhood, youth, training (stat bonuses)
102. Starting equipment by backstory
103. Starting gold/troops by backstory
104. Portrait preview: 3D head render
105. Tutorial prompts: first-time help overlays

## I. Campaign Panels (111–135)

106. Town panel: enter town, see options (market, tavern, recruit, leave)
107. Market buy: select good, quantity, confirm — gold decreases, inventory increases
108. Market sell: same in reverse
109. Price display: buy/sell spread, trend arrows
110. Tavern: hire companions, hear rumors, recruit
111. Recruit panel: available troops by culture, cost per troop
112. Troop upgrade: spend XP/gold to tier up
113. Party panel: roster, wages, food, morale display
114. Inventory panel: goods, weapons, armor
115. Character panel: attributes, skills, XP bars, perk choices
116. Perk selection: 1-of-2 choice every 25 skill levels
117. Clan panel: members, relations, fiefs
118. Fief panel: tax rate, build queue, loyalty/security/prosperity/food
119. Diplomacy panel: faction relations, war/peace, actions
120. Quest panel: active issues, objectives, rewards
121. Smithy panel: craft/repair weapons (modern: gunsmith)
122. Arena panel: tournaments, betting, prizes
123. Prisoner panel: capture management, ransom/recruit/execute
124. Notable panel: talk to town NPCs, get quests
125. Bank/loan panel: borrow money, interest
126. Caravan panel: form caravan, assign troops, route
127. Workshop panel: buy workshop, set production, collect profit
128. Army panel: form army, invite lords, cohesion meter
129. Siege panel: build engines, assault, starve, negotiate
130. Hideout panel: attack bandit hideout, duel boss
131. Encyclopedia panel: factions, troops, places reference
132. Settings panel: graphics, audio, controls, keybinds
133. Save/load panel: manual saves, autosave slots
134. Pause menu: resume, save, settings, quit to title
135. Game over screen: death, heir succession

## J. HUD & Time (136–145)

136. Top bar: date, gold, food, troops, morale
137. Speed controls: paused / normal / fast / very fast / skip-to-arrival
138. Party status card: health, location, destination
139. Notification feed: events scroll in
140. Event popups: pause + show on important events
141. Quick-access buttons: character, party, clan, map, menu
142. Compass: N/E/S/W + objective markers
143. Tooltip system: hover anything, get explanation
144. Tutorial hints: contextual first-time tips
145. Mobile HUD: touch-friendly compact layout

## K. Mobile & Polish (146–155)

146. Touch movement: virtual joystick for battle
147. Touch attack/block: on-screen buttons
148. Touch camera: drag to look, pinch to zoom
149. Responsive panels: every panel works on 375px width
150. Performance: 30fps on mid-range phones in battle
151. Loading screens: tips + progress for every transition
152. Sound wiring: hook every action to spark's audio files
153. Screen shake: on explosions, heavy hits
154. Hit-stop: brief freeze on heavy hits (game feel)
155. Final QA pass: click every button, no dead ends

---

Done = tested in browser, committed, pushed. If a task is blocked, skip it, mark BLOCKED, keep going.

---

## Wave 2 — Wiki Gap Analysis (from docs/bannerlord-gap-analysis.md)

Boss order: these are the mechanics the wiki research proved we're missing. Work after Wave 1, in priority order (P0 first).

### P0 — Core loop (do these first)

156. Loyalty system: every town/castle has daily loyalty value, drifts toward 50
157. Loyalty sources: governor same culture +1/day, different culture -1/day
158. Loyalty: owner clan culture mismatch -3/day
159. Loyalty: security >=50 gives +1/day, <50 gives -2/day
160. Loyalty effects: >=75 boosts taxes and prosperity; <25 = rebellious state
161. Loyalty UI: meter on fief panel with all sources listed
162. Security system: driven by garrison strength, drifts toward 50
163. Security formula: unit strength = ((2+tier)x(10+tier))/50, cavalry +20%
164. Security penalties: nearby hideout -2, looted village -2, under siege -3
165. Security effects: >=75 gives +5% taxes; <50 gives -10% taxes
166. Security UI: meter on fief panel
167. Influence: gain from battles, quests, policies; spend on votes and army actions
168. Influence UI: display + gain/spend log
169. Armies: form from clan parties, cohesion meter drains daily
170. Army UI: member list, cohesion bar, disband button
171. Clan tiers: renown thresholds unlock larger parties, more companions, vassalage
172. Clan tier UI: progress bar, unlock list
173. Notables: named NPCs per town/village with power ratings
174. Notable panel: talk, gain relation, get issues/quests

### P1 — Important (do after P0)

175. Character backgrounds: life-path picks (family, childhood, youth) granting skills/focus/attributes
176. Aging: 84-day years, characters visibly age
177. Natural death: old age death for NPCs and player
178. Heir designation: pick clan member as heir
179. Heir succession: on player death, continue as heir with renown intact
180. Town food stocks: fed by production, villages, market; drained by prosperity and garrison
181. Starvation: tanks loyalty and prosperity, visual warning
182. Granary: expands food storage (100 town / 250 castle base)
183. Construction projects: fortifications, barracks, training fields, fairgrounds, marketplace, granary, orchards, militia grounds, aqueducts, forum, siege workshop, workshops, castellan's office
184. Construction points: from prosperity, boostable with gold, governor engineering modifies
185. Build queue UI: pick project, see progress, cancel
186. Militia: free daily spawn, costs no upkeep, defends only
187. Militia display: count on town panel, in siege defense
188. Village hearths: population grows daily by tier, raids set back
189. Village production: fixed daily output by type (grain +50, fish +28, iron +10, etc.) x hearth tier
190. Governor assignment: companions/family as governors, perks apply
191. Governor culture mismatch: loyalty penalty, shown in UI
192. Garrison wages: daily cost, reducible via castellan's office
193. Garrison food: eats town food daily
194. Training fields: garrisoned troops gain daily XP
195. Rebellion: below 25 loyalty, daily rebellion chance; settlement flips to rebels
196. Rebellion event: warning, then battle to retake
197. Kingdom policies: list of laws with effects (from modding docs)
198. Policy proposal: spend influence to propose
199. Decision voting: support/oppose with influence, see results
200. Persuasion minigame: dialogue options, charm checks, multi-stage
201. Barter: trade gold/items/fiefs/prisoners with lords, offer evaluation
202. Workshop recipes: each type produces specific goods from inputs
203. Caravan formation: assign troops, pick route, they trade automatically
204. Caravan ambush: can be attacked, defend or lose
205. Prisoner capture: routed enemies captured by rules (not random)
206. Prisoner conformity: prisoners slowly become recruitable
207. Hideout assault: enter hideout, fight through, duel boss
208. Siege engines: build ram/tower/catapult/trebuchet over days, deploy in assault
209. Wounded vs killed: surgeon skill determines survival rate
210. Troop XP: gain from battles, upgrade thresholds per tier
211. Issues: notable quests (deliver goods, clear bandits, etc.) with objectives
212. Crime rating: criminal acts raise rating, guards hostile at high rating
213. Companion roles: assign scout/engineer/surgeon/quartermaster, best skill applies
214. Releasing lords: free captured lords for relation gains
215. Lord relations: personal -100..+100 per lord, affects persuasion

### P2 — Nice to have (do last)

216. Pregnancy: 36-day gestation after marriage
217. Children aging: become usable at 18
218. Courtship: multi-stage romance with persuasion checks
219. Sneaking into hostile towns: disguise, avoid guards
220. Mercenary contracts: hire out to factions at war
221. Kingdom founding: start your own faction, pick culture and policies
222. Defection details: leave faction, keep/lose fiefs
223. Trade rumors: NPCs hint at good prices elsewhere
224. Smithing: craft custom weapons from parts (modern: gunsmith)
225. Ransom brokers: sell prisoners for quick gold
226. Execution: execute lords, massive relation consequences
227. Tournaments: arena brackets, betting, prizes
228. Board games: playable dice/board game in taverns
229. Civilian outfit: separate clothes for towns
230. Encyclopedia: in-game reference for everything
231. Main quest: Dragon Banner analog — assemble the artifact, found/destroy the nation
