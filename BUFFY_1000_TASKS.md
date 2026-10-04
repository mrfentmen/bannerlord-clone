# BUFFY 1000-Task Program

**From:** Pax (Muse), per boss order 2026-10-02
**For:** Buffy (Freebuff coding agent, API-only, no clone)

## How This Works

1. Work top-to-bottom, one task at a time.
2. Write the code, push via Git Data API directly to `main` (see FREEBUFF_API_GUIDE.md).
3. Post to the bus: `buffy: done — task N. commit [sha]. [one line].`
4. **Pax tests every task.** If it fails build/typecheck/tests, Pax reverts and tells you what broke.
5. If a task is unclear or blocked, skip it and post why. Don't guess.

## Rules

- One task = one commit. No bundling.
- Never force-push. If push fails with 422, re-fetch main and retry.
- TypeScript must be clean. You can't run tsc — write carefully, follow existing patterns.
- Read the file before editing it. Match the code style.
- No placeholders. If you can't do it right, skip it.

---

## A. Battle UI Components (1–100)

### Deployment & Setup (1–20)
1. Deployment zone highlight mesh (green translucent box for player zone)
2. Deployment zone highlight for enemy zone (red translucent)
3. Unit placement ghost preview (semi-transparent soldier at cursor)
4. Unit placement click handler (place on valid zone click)
5. Unit placement right-click to cancel
6. Deployment timer display (60s countdown)
7. Deployment "Ready" button per player
8. Deployment auto-start when timer expires
9. Deployment unit count display ("12/20 placed")
10. Deployment invalid placement warning (red flash)
11. Deployment camera preset (top-down angled view)
12. Deployment faction banner display
13. Deployment terrain name display
14. Deployment weather icon
15. Deployment time-of-day icon
16. Deployment music trigger (playMusic on show)
17. Deployment help tooltip ("Click to place units")
18. Deployment grid snap toggle ✓
19. Deployment undo last placement (Ctrl+Z)
20. Deployment clear all placements button ✓

### Battle HUD (21–50)
21. HUD top bar (battle name, timer, weather)
22. HUD player troop count (live update) ✓
23. HUD enemy troop count (live update) ✓
24. HUD morale bar (player) ✓
25. HUD morale bar (enemy) ✓
26. HUD minimap toggle button ✓
27. HUD camera mode toggle (follow/free) ✓
28. HUD pause button ✓
29. HUD surrender button (with confirm dialog) ✓
30. HUD retreat button (with confirm dialog) ✓
31. HUD kill feed (last 5 kills, auto-fade) ✓
32. HUD objective marker display
33. HUD low-health warning (screen edge pulse) ✓
34. HUD ammo counter (if ranged units)
35. HUD selected unit info panel ✓
36. HUD unit health bars (toggleable) ✓
37. HUD faction banners (top corners) ✓
38. HUD battle timer (elapsed, mm:ss) ✓
39. HUD reinforcement timer (if applicable)
40. HUD settings gear (opens pause menu) ✓
41. HUD FPS counter (debug, toggleable) ✓
42. HUD objective progress bar
43. HUD victory points display
44. HUD capture point markers
45. HUD damage direction indicator ✓
46. HUD hit marker (X on hit) ✓
47. HUD kill confirm (skull icon) ✓
48. HUD combo counter (kills in 10s window) ✓
49. HUD ping indicator (multiplayer stub, disabled) ✓
50. HUD chat box (multiplayer stub, disabled) ✓

### Orders & Command (51–75)
51. Order: move (right-click ground) ✓
52. Order: attack-move (A + click) ✓
53. Order: hold position (H key) ✓
54. Order: charge (C key) ✓
55. Order: retreat (R key) ✓
56. Order: follow me (F key) ✓
57. Order: spread out (S key) ✓
58. Order: form up (G key) ✓
59. Order panel UI (bottom, order buttons) ✓
60. Order button tooltips ✓
61. Order hotkey display on buttons ✓
62. Order queue (shift+click to queue) ✓
63. Order cancel (right-click or Esc) ✓
64. Selection box (drag to select multiple) ✓
65. Selection highlight rings ✓
66. Double-click to select all of type ✓
67. Ctrl+click to add to selection ✓
68. Group hotkeys (Ctrl+1-9 to set, 1-9 to select) ✓
69. Group UI indicators (bottom left) ✓
70. Formation selector (line, column, wedge, circle) ✓
71. Formation preview ghost ✓
72. Stance selector (aggressive/defensive/passive) ✓
73. Stance icon on units ✓
74. Behavior: fire at will toggle ✓
75. Behavior: hold fire toggle ✓

### After-Action (76–100)
76. After-action report panel ✓
77. Casualty breakdown by unit type ✓
78. Kill/death ratio display ✓
79. MVP unit highlight (most kills) ✓
80. Loot inventory list ✓
81. Prisoner count and options (recruit/ransom/execute) ✓
82. XP gain per surviving unit ✓
83. Level-up notifications ✓
84. Wounded units list (recovery time) ✓
85. Captured equipment list ✓
86. Battle replay save button ✓
87. Battle stats export (JSON download) ✓
88. "Return to campaign" button ✓
89. "Fight again" button (rematch) ✓
90. Battle rating (S/A/B/C/D based on performance) ✓
91. Achievement unlock toasts ✓
92. New tactic unlocked notification
93. Enemy commander captured event ✓
94. Enemy commander escaped event ✓
95. Heroic victory bonus (outnumbered win) ✓
96. Pyrrhic victory warning (won but heavy losses) ✓
97. Flawless victory bonus (zero losses) ✓
98. Battle duration stat ✓
99. Map name and biome in report header ✓
100. Weather and time-of-day in report header ✓

---

## B. Campaign Map UI (101–250)

### Town Panels (101–140)
101. Town panel: name header with faction banner
102. Town panel: population display
103. Town panel: prosperity bar
104. Town panel: food stores display
105. Town panel: garrison list (unit types + counts)
106. Town panel: recruit button per unit type
107. Town panel: recruit cost display
108. Town panel: recruit time display
109. Town panel: market tab
110. Town panel: market goods list (name, price, quantity)
111. Town panel: buy button per good
112. Town panel: sell button per good
113. Town panel: player inventory display
114. Town panel: player gold display
115. Town panel: tavern tab
116. Town panel: tavern recruitable NPCs list
117. Town panel: tavern hire button
118. Town panel: tavern rumor display
119. Town panel: smithy tab (if applicable)
120. Town panel: smithy weapon list
121. Town panel: smithy buy button
122. Town panel: arena tab (if applicable)
123. Town panel: arena fight button
124. Town panel: arena reward display
125. Town panel: quests tab
126. Town panel: quest list with status icons
127. Town panel: quest accept button
128. Town panel: quest abandon button
129. Town panel: notable NPCs list
130. Town panel: talk button per NPC
131. Town panel: trade caravan option
132. Town panel: wait here button (pass time)
133. Town panel: leave town button
134. Town panel: siege option (if at war)
135. Town panel: raid option (if hostile)
136. Town panel: town description text
137. Town panel: town image/banner
138. Town panel: recent events list
139. Town panel: construction queue (if player-owned)
140. Town panel: tax rate slider (if player-owned)

### Party Management (141–170)
141. Party panel: open via P key
142. Party panel: troop list grouped by type
143. Party panel: troop count per type
144. Party panel: troop wage per type
145. Party panel: total daily wages
146. Party panel: troop upgrade button (when XP sufficient)
147. Party panel: upgrade path display
148. Party panel: dismiss troop button
149. Party panel: troop health/morale indicators
150. Party panel: prisoner list
151. Party panel: prisoner recruit button
152. Party panel: prisoner ransom button
153. Party panel: prisoner release button
154. Party panel: companion list
155. Party panel: companion stats display
156. Party panel: companion equipment slots
157. Party panel: companion assign role dropdown
158. Party panel: party speed display
159. Party panel: party morale display
160. Party panel: food consumption rate
161. Party panel: days of food remaining
162. Party panel: inventory tab
163. Party panel: inventory grid
164. Party panel: item tooltip on hover
165. Party panel: equip item button
166. Party panel: drop item button
167. Party panel: sort inventory button
168. Party panel: party gold display
169. Party panel: rename party button
170. Party panel: close button

### Map & Navigation (171–200)
171. Map: zoom in/out buttons
172. Map: zoom via mouse wheel
173. Map: pan via drag
174. Map: pan via arrow keys / WASD
175. Map: click to set destination
176. Map: right-click to cancel movement
177. Map: party marker (player icon)
178. Map: party movement trail
179. Map: town markers (clickable)
180. Map: town marker tooltip (name, faction)
181. Map: village markers
182. Map: enemy party markers (red)
183. Map: allied party markers (blue)
184. Map: neutral party markers (gray)
185. Map: caravan markers
186. Map: bandit markers
187. Map: battle markers (crossed swords)
188. Map: quest markers (exclamation)
189. Map: tracked quest path highlight
190. Map: day/night indicator
191. Map: date display (Day 47, Spring)
192. Map: speed control (pause/1x/2x/4x)
193. Map: pause on event toggle
194. Map: fog of war toggle
195. Map: faction territory overlay toggle
196. Map: trade route overlay toggle
197. Map: minimap (corner)
198. Map: coordinates display on hover
199. Map: terrain tooltip (plains/forest/etc.)
200. Map: "center on party" button (Space)

### Diplomacy & Factions (201–230)
201. Diplomacy panel: open via D key
202. Diplomacy: faction list with relation bars
203. Diplomacy: relation value display (-100 to +100)
204. Diplomacy: at-war indicator (red)
205. Diplomacy: allied indicator (green)
206. Diplomacy: truce indicator (yellow)
207. Diplomacy: declare war button (with confirm)
208. Diplomacy: propose peace button
209. Diplomacy: peace cost display
210. Diplomacy: propose alliance button
211. Diplomacy: alliance requirements display
212. Diplomacy: break alliance button (with reputation hit warning)
213. Diplomacy: trade agreement button
214. Diplomacy: tribute demand button
215. Diplomacy: tribute amount slider
216. Diplomacy: send gift button
217. Diplomacy: gift amount slider
218. Diplomacy: recent diplomatic events log
219. Diplomacy: faction leader portrait
220. Diplomacy: faction leader name and title
221. Diplomacy: faction strength estimate
222. Diplomacy: faction territory count
223. Diplomacy: faction at-war-with list
224. Diplomacy: player reputation display
225. Diplomacy: reputation effects tooltip
226. Diplomacy: war weariness indicator
227. Diplomacy: war score display
228. Diplomacy: peace treaty terms UI
229. Diplomacy: close button
230. Diplomacy: help tooltip

### Character & Clan (231–250)
231. Character panel: open via C key
232. Character: portrait display
233. Character: name and title
234. Character: level and XP bar
235. Character: attribute list (STR, AGI, INT, CHA)
236. Character: attribute increase button (on level up)
237. Character: skill list with values
238. Character: skill progress bars
239. Character: focus points display
240. Character: perk selection UI
241. Character: equipment slots (head, body, hands, legs, feet)
242. Character: weapon slots (4)
243. Character: mount slot
244. Character: equipped item stats on hover
245. Clan panel: open via L key
246. Clan: banner customization
247. Clan: name display and edit
248. Clan: member list
249. Clan: fief list (owned towns/castles)
250. Clan: clan tier display and progress

---

## C. Battle Simulation (Go) (251–400)

### Unit Behaviors (251–300)
251. Unit: idle behavior (stand, occasional look-around) ✓
252. Unit: move to position (pathfind, avoid obstacles)
253. Unit: attack nearest enemy in range ✓
254. Unit: attack specific target (order) ✓
255. Unit: hold position (don't chase) ✓
256. Unit: retreat to rally point ✓
257. Unit: charge (sprint at enemy) ✓
258. Unit: skirmish (hit and run for ranged)
259. Unit: guard (protect specific unit/position)
260. Unit: follow (trail behind leader)
261. Infantry: shield wall formation bonus
262. Infantry: spear brace vs cavalry
263. Infantry: loose formation (vs arrows)
264. Archers: volley fire (area target)
265. Archers: direct fire (single target)
266. Archers: retreat when charged
267. Cavalry: charge bonus (damage scales with speed)
268. Cavalry: trample (knockdown on impact)
269. Cavalry: wheel maneuver (turn without stopping)
270. Cavalry: disengage (break off cleanly)
271. Unit: morale check on ally death nearby
272. Unit: morale check on taking casualties
273. Unit: rout when morale breaks (flee)
274. Unit: rally (regain morale if safe)
275. Unit: surrender when surrounded
276. Unit: capture prisoners (not just kill)
277. Unit: pick up dropped weapons
278. Unit: use cover (crouch behind obstacle)
279. Unit: suppression effect (pinned by fire)
280. Unit: reload (ranged units, takes time)
281. Unit: ammo tracking (limited arrows/bolts)
282. Unit: resupply from ammo cart
283. Unit: fatigue (slower when tired)
284. Unit: rest to recover fatigue
285. Unit: night penalty (reduced accuracy)
286. Unit: rain penalty (reduced ranged accuracy)
287. Unit: uphill bonus (damage/accuracy)
288. Unit: downhill charge bonus
289. Unit: flanking bonus (attack from side/rear) ✓
290. Unit: friendly fire check (don't hit allies) ✓
291. Unit: overkill (excess damage wasted) ✓
292. Unit: execution (finish downed enemies)
293. Unit: battlefield awareness (don't walk off cliff)
294. Unit: obstacle avoidance (go around, not through)
295. Unit: stuck detection (unstick if not moving) ✓
296. Unit: despawn when far from camera (perf) ✓
297. Unit: respawn at edge (reinforcements)
298. Unit: night vision (reduced penalty if trained)
299. Unit: weather adaptation (reduced penalty if equipped)
300. Unit: veteran bonus (experienced units fight better)

### Damage & Combat (301–340)
301. Damage: base calculation (weapon + STR)
302. Damage: armor reduction
303. Damage: armor penetration (vs heavy armor)
304. Damage: critical hit (5% chance, 2x)
305. Damage: headshot bonus (ranged, 1.5x)
306. Damage: backstab bonus (2x from behind)
307. Damage: falling damage
308. Damage: fire damage over time
309. Damage: bleeding (damage over time)
310. Damage: stun (brief incapacitation)
311. Damage: knockback (push on hit)
312. Damage: knockdown (fall prone)
313. Melee: swing arc (hits multiple in front)
314. Melee: thrust (single target, armor pierce)
315. Melee: overhead (slow, high damage)
316. Melee: block (reduce damage 75%)
317. Melee: parry (timed block, riposte opportunity)
318. Melee: kick (interrupt, small damage)
319. Ranged: arrow projectile (arc, gravity)
320. Ranged: bolt projectile (flat, fast)
321. Ranged: bullet projectile (hitscan-ish)
322. Ranged: spread (inaccuracy cone)
323. Ranged: range falloff (less damage at distance)
324. Ranged: cover blocks projectiles
325. Explosive: grenade throw (arc, timed fuse)
326. Explosive: blast radius damage
327. Explosive: blast knockback
328. Explosive: shrapnel (random secondary hits)
329. Explosive: destroy cover
330. Damage numbers: floating text on hit ✓
331. Damage numbers: color by type (white/yellow/red) ✓
332. Damage numbers: toggle in settings ✓
333. Hit flash: red vignette on player damage ✓
334. Hit sound trigger: on damage dealt ✓
335. Kill sound trigger: on kill ✓
336. Damage: dismemberment chance (visual, on kill)
337. Damage: gib on explosive kill
338. Melee: disarm (knock weapon away, rare)
339. Ranged: friendly fire from missed shots
340. Explosive: crater (terrain decal)

### Morale & Routing (341–360)
341. Morale: base value per unit tier ✓
342. Morale: leader proximity bonus
343. Morale: winning bonus (we're killing more) ✓
344. Morale: losing penalty (we're dying more) ✓
345. Morale: outnumbered penalty ✓
346. Morale: flanked penalty ✓
347. Morale: general died penalty (big)
348. Morale: ally routed penalty (contagion) ✓
349. Morale: check every 5 seconds ✓
350. Morale: rout threshold (break at 0) ✓
351. Morale: waver warning (at 25%, UI indicator) ✓
352. Rout: units drop weapons and flee
353. Rout: routers don't fight back ✓
354. Rout: pursuing routers gives bonus damage ✓
355. Rout: routers can be captured ✓
356. Rally: routers may stop if far from enemy ✓
357. Rally: leader can rally nearby routers (cooldown)
358. Morale: low ammo penalty (ranged)
359. Morale: night penalty (unless trained)
360. Morale: weather penalty (rain/snow)

### Battle End & Results (361–400)
361. Victory check: all enemies dead/routed/captured
362. Defeat check: all player units dead/routed
363. Draw check: time limit reached
364. Casualty count: track per side
365. Kill credit: who killed whom (for MVP)
366. Damage dealt: track per unit
367. Damage taken: track per unit
368. Prisoners: count captured enemies
369. Loot: generate from enemy equipment
370. XP: calculate per surviving unit
371. Level ups: check and apply
372. Wounds: random injury for survivors
373. Death: permanent for killed units
374. Ransom: value of captured nobles
375. Reputation: gain/loss based on conduct
376. War score: update based on result
377. Report: generate structured result
378. Save replay: record seed + orders
379. Achievements: check battle achievements
380. Statistics: update lifetime stats
381. Auto-save after battle
382. Return to campaign: restore state
383. Apply casualties to party
384. Apply XP to party
385. Add loot to inventory
386. Add prisoners to party
387. Update quest progress (if battle-related)
388. Seed: use crypto-random per battle (no persistence)
389. Battle: max duration 20 min (then draw)
390. Battle: reinforcement waves (if scenario)
391. Battle: commander abilities (rally, inspire)
392. Battle: battle cry (morale boost, cooldown)
393. Battle: tactical pause (single-player)
394. Battle: slow-mo on general death (dramatic)
395. Battle: killcam on player kill (toggleable)
396. Battle: after-action stats screen data
397. Battle: log to history
398. Battle: cleanup disposed units
399. Battle: restore campaign time
400. Battle: trigger post-battle events

---

## D. World Data & Map (401–500)

### Settlements (401–430)
401. [x] [Hana] Settlement: name generator (American place names)
402. [x] [Hana] Settlement: type assignment (city/town/village)
403. [x] [Hana] Settlement: population based on type
404. [x] [Hana] Settlement: prosperity calculation
405. [x] [Hana] Settlement: food production
406. [x] [Hana] Settlement: garrison size by importance
407. [x] [milo] Settlement: market goods based on region
408. [x] [milo] Settlement: construction projects
409. [x] [Hana] Settlement: tax income calculation
410. [x] [Hana] Settlement: loyalty to owner faction
411. [x] [milo] Settlement: rebellion risk when loyalty low
412. [x] [milo] Settlement: wall level (defense bonus)
413. [x] [milo] Settlement: granary level (food storage)
414. [x] [milo] Settlement: barracks level (recruit quality)
415. [x] [milo] Settlement: market level (trade volume)
416. [x] [milo] Settlement: upgrade building (cost + time)
417. Settlement: visual: town icon on map
418. Settlement: visual: faction banner color
419. Settlement: visual: siege icon when attacked
420. Settlement: click to open town panel
421. Settlement: hover tooltip (name, faction, pop)
422. Settlement: distance display from player
423. Settlement: travel time estimate
424. Settlement: "track" button (quest marker)
425. Settlement: raid option (if hostile)
426. Settlement: siege option (if at war)
427. [x] [milo] Settlement: prosperity change over time
428. [x] [milo] Settlement: population growth/decline
429. Settlement: food shortage warning
430. [x] [Hana] Settlement: notable NPCs spawn

### Roads & Travel (431–450)
431. [x] [Hana] Road: generate between nearby settlements
432. [x] [Hana] Road: quality (highway/dirt/path)
433. Road: travel speed modifier
434. [x] [milo] Road: bandit ambush chance
435. Road: visual: line on map
436. Pathfinding: A* on road network
437. Pathfinding: prefer roads over off-road
438. [x] [milo] Travel: calculate time for route
439. [x] [milo] Travel: consume food per day
440. [x] [milo] Travel: random encounters on road
441. [x] [milo] Travel: weather slows travel
442. [x] [milo] Travel: forced march (faster, morale hit)
443. [x] [milo] Travel: arrival event trigger
444. [x] [milo] Travel: interrupt on enemy contact
445. Road: patrol encounters (friendly)
446. [x] [milo] Road: toll booths (pay or fight)
447. [x] [milo] Road: bridge crossings (chokepoint)
448. [x] [milo] Road: ferry crossings (cost + time)
449. [x] [milo] Travel: night travel slower
450. [x] [milo] Travel: rest to recover

### Factions & Territory (451–475)
451. [x] [milo] Territory: assign settlements to factions
452. [x] [milo] Territory: border calculation
453. Territory: visual: colored overlay
454. [x] [milo] Faction: capital designation
455. [x] [milo] Faction: strength calculation
456. [x] [milo] Faction AI: expand when strong
457. [x] [milo] Faction AI: defend when weak
458. [x] [milo] Faction AI: seek alliances when threatened
459. [x] [milo] Faction AI: declare war
460. [x] [milo] Faction AI: sue for peace when losing
461. [x] [milo] Faction AI: raid enemy villages
462. [x] [milo] Faction AI: besiege enemy towns
463. [x] [milo] Faction AI: recruit troops
464. [x] [milo] Faction AI: move armies
465. [x] [milo] Faction AI: avoid stronger enemies
466. [x] [milo] War: track active wars
467. [x] [milo] War: war score calculation
468. [x] [milo] War: peace treaty terms
469. [x] [milo] War: tribute for peace
470. [x] [milo] War: territory cession
471. [x] [milo] War: truce duration
472. [x] [milo] Faction: relation decay over time
473. [x] [milo] Faction: relation improvement via gifts
474. [x] [milo] Faction: casus belli system
475. [x] [milo] Faction: war exhaustion

### Events & Encounters (476–500)
476. Event: bandit ambush
477. Event: merchant caravan
478. Event: refugee group
479. Event: deserters
480. Event: weather event (storm)
481. Event: plague (settlement)
482. Event: festival (morale up)
483. Event: tournament
484. Event: bounty hunt
485. Event: escort mission
486. Event: delivery mission
487. Event: rescue mission
488. Event: spy mission
489. Event: defend village
490. Event: raid village
491. Event: encounter dialog UI
492. Event: choice buttons
493. Event: outcome based on skill check
494. Event: reward/penalty application
495. Event: event log entry
496. Event: cooldown before repeat
497. Event: ambush escape option
498. Event: negotiate with bandits
499. Event: pay toll or fight
500. Event: help travelers (reputation up)

---

## E. Audio Implementation (501–600)

### Battle SFX Wiring (501–530)
501. [x] [Hana] Wire: rifle shot on shoot()
502. [x] [Hana] Wire: pistol shot on sidearm
503. [x] [Hana] Wire: shotgun blast
504. [x] [Hana] Wire: reload sound
505. [x] [Hana] Wire: dry-fire click on empty
506. [x] [Hana] Wire: hit flesh on damage
507. [x] [Hana] Wire: armor clank on block
508. [x] [Hana] Wire: death groan on kill (random pitch)
509. [x] [Hana] Wire: explosion on grenade
510. [x] [Hana] Wire: footstep on move (surface-based)
511. [x] [Hana] Wire: horse gallop on cavalry
512. [x] [Hana] Wire: sword swing whoosh
513. [x] [Hana] Wire: sword clash on parry
514. [x] [Hana] Wire: arrow loose on fire
515. [x] [Hana] Wire: arrow hit on damage
516. [x] [Hana] Wire: shield block thud
517. [x] [Hana] Wire: morale break horn
518. [x] [Hana] Wire: rally horn
519. [x] [Hana] Wire: victory fanfare
520. [x] [Hana] Wire: defeat sting
521. [x] [Hana] Wire: ambient battle loop
522. [x] [Hana] Wire: rain loop when raining
523. [x] [Hana] Wire: reload complete click
524. [x] [Hana] Wire: weapon switch click
525. [x] [Hana] Wire: empty mag warning
526. [x] [Hana] Wire: suppressive fire loop
527. [x] [Hana] Wire: distant artillery
528. [x] [Hana] Wire: melee impact thud
529. [x] [Hana] Wire: body fall thump
530. [x] [Hana] Wire: ragdoll impact sounds

### UI SFX Wiring (531–550)
531. [x] [Hana] Wire: click on all buttons
532. [x] [Hana] Wire: hover tick
533. [x] [Hana] Wire: confirm on accept
534. [x] [Hana] Wire: error buzz on invalid
535. [x] [Hana] Wire: toggle on switch
536. [x] [Hana] Wire: panel open whoosh
537. [x] [Hana] Wire: panel close whoosh
538. [x] [Hana] Wire: tab switch
539. [x] [Hana] Wire: gold gain chime
540. [x] [Hana] Wire: gold loss thud
541. [x] [Hana] Wire: level up fanfare
542. [x] [Hana] Wire: quest accept chime
543. [x] [Hana] Wire: quest complete fanfare
544. [x] [Hana] Wire: quest fail sound
545. [x] [Hana] Wire: notification pop
546. [x] [Hana] Wire: warning alert
547. [x] [Hana] Wire: map zoom tick
548. [x] [Hana] Wire: time speed change
549. [x] [Hana] Wire: pause/unpause
550. [x] [Hana] Wire: save game chime

### Music System (551–570)
551. [x] [Hana] Music: menu-theme on title
552. [x] [Hana] Music: ambient-exploration on map
553. [x] [Hana] Music: battle-theme on battle start
554. [x] [Hana] Music: crossfade between tracks (2s)
555. [x] [Hana] Music: victory-fanfare on win
556. [x] [Hana] Music: defeat on loss
557. [x] [Hana] Music: tavern-rest in tavern
558. [x] [Hana] Music: dynamic intensity (nearby enemies)
559. [x] [Hana] Music: duck under dialogue
560. [x] [Hana] Music: shuffle ambient
561. [x] [Hana] Music: volume slider wiring
562. [x] [Hana] Music: mute toggle wiring
563. [x] [Hana] Music: combat intensity layers
564. [x] [Hana] Music: stinger on ambush
565. [x] [Hana] Music: stinger on discovery
566. [x] [Hana] Music: day/night variants
567. [x] [Hana] Music: faction themes (6 variants)
568. [x] [Hana] Music: boss battle theme
569. [x] [Hana] Music: credits theme
570. Music: settings preview button

### Ambient & Foley (571–590)
571. [x] [Hana] Ambient: town daytime
572. [x] [Hana] Ambient: town nighttime
573. [x] [Hana] Ambient: forest (birds)
574. [x] [Hana] Ambient: desert (wind)
575. [x] [Hana] Ambient: snow (wind howl)
576. [x] [Hana] Ambient: rain loop
577. [x] [Hana] Ambient: battlefield (distant)
578. [x] [Hana] Ambient: crossfade on biome change
579. [x] [Hana] Foley: door open/close
580. [x] [Hana] Foley: item pickup/drop
581. [x] [Hana] Foley: coin jingle
582. [x] [Hana] Foley: paper rustle
583. [x] [Hana] Foley: fire crackle
584. [x] [Hana] Foley: water splash
585. [x] [Hana] Foley: blacksmith hammer
586. [x] [Hana] Foley: crowd murmur
587. [x] [Hana] Foley: bell toll (alarm)
588. [x] [Hana] Foley: horse eat
589. [x] [Hana] Foley: campfire
590. [x] [Hana] Foley: tent flap

### Voice & Radio (591–600)
591. [x] [Hana] Radio: "Contact!" on battle start
592. [x] [Hana] Radio: "Man down!" on ally death
593. [x] [Hana] Radio: "Target neutralized" on kill
594. [x] [Hana] Radio: "Falling back!" on retreat
595. [x] [Hana] Radio: "Moving!" on move order
596. [x] [Hana] Radio: "Holding!" on hold order
597. [x] [Hana] Radio: "Enemy spotted"
598. [x] [Hana] Radio: "Area clear" on victory
599. [x] [Hana] Radio: volume duck under SFX
600. Radio: toggle in settings

---

## F. Models & Animations (601–750)

### Model Loading (601–630)
601. ModelLoader: retry on failure (3x) ✓
602. ModelLoader: timeout after 30s ✓
603. ModelLoader: progress callback ✓
604. ModelLoader: cache loaded models ✓
605. ModelLoader: preload battle models ✓
606. ModelLoader: async with placeholder ✓
607. ModelLoader: error fallback (red box) ✓
608. Model: LOD by distance ✓
609. Model: cull behind camera ✓
610. Model: cull when far (>500m) ✓
611. Model: instance identical props ✓
612. Model: validate GLB magic bytes ✓
613. Model: warn if >10MB ✓
614. Model: auto-scale to meters ✓
615. Model: fix up-axis ✓
616. Model: generate collider from bounds ✓
617. Model: tag for raycast ✓
618. Model: damage states (intact/destroyed) ✓
619. Model: snow cover tint ✓
620. Model: wet look when raining ✓
621. Model: preload town models on approach ✓
622. Model: dispose on memory pressure ✓
623. Model: log load times ✓
624. Model: Draco compression support ✓
625. Model: KTX2 texture support ✓
626. Model: center pivot ✓
627. Model: night emissive windows ✓
628. Model: dust cover in desert ✓
629. Model: battle damage decals ✓
630. Model: verify all 49 load

### Animation (631–680)
631. Blend: idle→walk (0.2s) ✓
632. Blend: walk→run (0.15s) ✓
633. Blend: any→hit (0.05s interrupt) ✓
634. Blend: hit→previous (0.3s) ✓
635. Blend: any→death (0.1s) ✓
636. Blend: idle→aim (0.15s) ✓
637. Blend: aim→shoot (0.05s) ✓
638. Blend: shoot→aim (0.2s) ✓
639. IK: feet plant on ground ✓
640. IK: hand to weapon grip ✓
641. IK: look at target (head) ✓
642. IK: rider legs to stirrups ✓
643. IK: disable when ragdoll active ✓
644. Face: blink every 3-7s ✓
645. Face: look at speaker ✓
646. Cloth: cape flutter ✓
647. Equipment: weapon on back when idle ✓
648. Equipment: weapon in hand in combat ✓
649. Blood: decal on hit (fade 30s) ✓
650. Blood: pool under corpse (fade 60s) ✓
651. Blood: toggle in settings ✓
652. Thumb pose: apply on all soldiers (done, verify) ✓
653. LOD: skip thumb anim beyond 30m (done, verify) ✓
654. Speed: scale anim with movement speed ✓
655. Additive: aim overlay (upper body) ✓
656. Horse: walk/trot/gallop gaits ✓
657. Horse: death fall ✓
658. Rider: mount/dismount anim ✓
659. Rider: mounted idle bounce ✓
660. Rider: mounted shoot ✓
661. Rider: fall off on death ✓
662. Ladder: climb anim ✓
663. Ram: push anim (crew) ✓
664. Ram: impact on gate ✓
665. Catapult: fire anim ✓
666. Catapult: reload (30s) ✓
667. Surrender: hands-up (use cheer, verify) ✓
668. Cheer: victory (verify) ✓
669. Hit-react: blend test ✓
670. Death: fall then ragdoll (verify) ✓
671. Prone: crawl anim ✓
672. Crouch: idle/walk (verify) ✓
673. Jump: start/loop/land ✓
674. Slide: start/loop/exit ✓
675. Melee: swing anim ✓
676. Throw: grenade toss ✓
677. Interact: generic ✓
678. Heal: kneel ✓
679. Revive: kneel then stand ✓
680. Downed: incapacitated pose ✓

### Siege Equipment Models (681–700)
681. Model: siege ladder ✓
682. Model: battering ram ✓
683. Model: siege tower ✓
684. Model: catapult ✓
685. Model: trebuchet ✓
686. Model: ballista ✓
687. Model: mantlet (mobile shield) ✓
688. Model: siege tent ✓
689. Model: supply cart ✓
690. Model: ammo cart ✓
691. Model: medical tent ✓
692. Model: command tent ✓
693. Model: palisade wall ✓
694. Model: wooden gate ✓
695. Model: stone wall section ✓
696. Model: wall tower ✓
697. Model: drawbridge ✓
698. Model: portcullis ✓
699. Model: murder holes (visual) ✓
700. Model: boiling oil pot ✓

### Civilians & Variety (701–730)
701. Model: civilian male variant 2
702. Model: civilian male variant 3
703. Model: civilian female variant 2
704. Model: civilian child (non-combat)
705. Model: elderly civilian
706. Model: merchant
707. Model: blacksmith
708. Model: tavern keeper
709. Model: priest
710. Model: farmer
711. Model: guard (town)
712. Model: bandit variant 2
713. Model: bandit leader
714. Model: deserter
715. Model: mercenary
716. Model: noble
717. Model: officer variant
718. Model: medic variant
719. Model: engineer
720. Model: scout
721. Ethnicity: skin tone variants (3+)
722. Ethnicity: facial feature variants
723. Clothing: color variants per faction
724. Clothing: armor tiers visual
725. Clothing: civilian outfits (5+)
726. Idle: civilian walk
727. Idle: civilian talk gesture
728. Idle: vendor hawk wares
729. Idle: child play
730. Idle: guard patrol

### Weapons (731–750)
731. Model: assault rifle variant 2 ✓
732. Model: sniper rifle ✓
733. Model: SMG variant ✓
734. Model: shotgun variant
735. Model: pistol variant 2 ✓
736. Model: LMG
737. Model: grenade
738. Model: knife
739. Model: baton
740. Model: sword (ceremonial)
741. Weapon: muzzle flash effect ✓
742. Weapon: tracer rounds (toggleable) ✓
743. Weapon: shell casings eject ✓
744. Weapon: reload anim (mag out/in) ✓
745. Weapon: inspect anim (idle)
746. Weapon: skins (camo variants) ✓
747. Weapon: attachments (sight, grip)
748. Weapon: stats display (damage, range, etc.)
749. Weapon: compare in inventory ✓
750. Weapon: favorite/star

---

## G. Campaign Systems (751–850)

### Quests (751–780)
751. Quest: data structure
752. Quest: accept from NPC
753. Quest: track/untrack
754. Quest: objective progress (3/5)
755. Quest: turn in
756. Quest: rewards (gold/XP/item)
757. Quest: abandon
758. Quest: fail conditions
759. Quest types: kill X enemies
760. Quest types: collect X items
761. Quest types: deliver
762. Quest types: escort
763. Quest types: bounty
764. Quest: main story (10 quests)
765. Quest: side quests (procedural)
766. Quest: quest log UI (J key)
767. Quest: map markers
768. Quest: giver indicator (!)
769. Quest: turn-in indicator (?)
770. Quest: timer display
771. Quest: prerequisites check
772. Quest: chain unlocks
773. Quest: save state
774. Quest: rescue prisoner
775. Quest: defend village
776. Quest: raid village
777. Quest: spy mission
778. Quest: trade profit goal
779. Quest: recruit troops goal
780. Quest: survive waves

### Economy (781–800)
781. Good: data structure
782. Good: price by supply/demand
783. Good: price varies by town
784. Market: buy/sell UI
785. Market: price history
786. Caravan: form (buy animals)
787. Caravan: set route
788. Caravan: auto-trade
789. Caravan: ambush event
790. Workshop: buy/produce/profit
791. Tax: from owned fiefs
792. Wages: daily troop cost
793. Wages: desertion if unpaid
794. Food: consumption
795. Food: starvation effects
796. Food: foraging
797. Trade: profit tracking
798. Trade: best routes hint
799. Economy: inflation over time
800. Economy: war disrupts trade

### Clan & Kingdom (801–830)
801. Clan: banner editor
802. Clan: tier progression
803. Clan: renown gain
804. Kingdom: join as vassal
805. Kingdom: create own
806. Kingdom: laws (3 policies)
807. Kingdom: grant fief
808. Kingdom: vassal management
809. Marriage: propose
810. Marriage: spouse joins clan
811. Children: born/grow up
812. Death: old age/battle
813. Death: heir takes over
814. Death: game over if no heir
815. Succession: designate heir
816. Clan: member list
817. Clan: fief list
818. Kingdom: war/peace votes
819. Kingdom: ruler decisions
820. Reputation: gain/loss
821. Honor: chivalry vs cruelty
822. Infamy: feared vs loved
823. Titles: earn (Baron, Count, etc.)
824. Titles: display
825. Court: hold court (decisions)
826. Court: petitioners
827. Feast: hold (relation up, gold down)
828. Tournament: host
829. Duel: challenge NPC
830. Legacy: history book

---

## H. Polish & Settings (831–930)

### Settings UI (831–860)
831. Settings: graphics tab
832. Settings: quality preset
833. Settings: resolution scale
834. Settings: shadow quality
835. Settings: view distance slider
836. Settings: post-fx toggles
837. Settings: audio tab
838. Settings: volume sliders
839. Settings: mute toggle
840. Settings: gameplay tab
841. Settings: difficulty
842. Settings: ironman toggle
843. Settings: damage numbers toggle
844. Settings: gore toggle
845. Settings: controls tab
846. Settings: key rebinding
847. Settings: reset defaults
848. Ragdoll toggle wiring (already in schema, wire to UI)
849. Thumb LOD setting
850. FPS counter toggle
851. Auto-quality toggle
852. Subtitle size
853. Colorblind mode selector
854. UI scale slider (verify)
855. Language selector (stub)
856. Credits button
857. Settings: search
858. Settings: import/export
859. Settings: cloud sync stub (disabled)
860. Settings: close

### Save/Load (861–880)
861. Save: manual
862. Save: quicksave F5 (verify)
863. Save: autosave 5min (verify)
864. Save: 3 slots
865. Save: name your save
866. Save: timestamp
867. Save: overwrite confirm
868. Save: delete (confirm)
869. Load: from title
870. Load: progress bar
871. Load: corrupt handling
872. Save: export JSON
873. Save: import JSON
874. Settings persist
875. Keybindings persist
876. Save: thumbnail
877. Save: playtime display
878. Save: ironman single slot
879. Save: backup before overwrite
880. Save: verify on load

### Tutorial & Help (881–900)
881. Tutorial: movement
882. Tutorial: camera
883. Tutorial: interact
884. Tutorial: town panel
885. Tutorial: recruit
886. Tutorial: buy/sell
887. Tutorial: map travel
888. Tutorial: battle
889. Tutorial: orders
890. Tutorial: victory
891. Tutorial: skip
892. Help: controls list (H)
893. Help: searchable
894. Help: context-sensitive
895. FAQ: compiled
896. Tutorial: party management
897. Tutorial: diplomacy
898. Tutorial: quests
899. Tutorial: save/load
900. Tutorial: settings

### Accessibility (901–920)
901. Colorblind modes (verify all 3)
902. Subtitles: dialogue
903. Subtitles: size S/M/L
904. Reduce motion: camera shake off
905. Reduce motion: no flash
906. UI scale 80-150% (verify)
907. High contrast mode
908. Pause on focus loss
909. Remappable keys (verify all)
910. Controller: basic support
911. Text: dyslexia font option
912. Audio: visual cues for sounds
913. Tutorials: skippable
914. Difficulty: story mode (easy)
915. Aim assist: toggle
916. Auto-pause: on low health
917. Color: enemy outline toggle
918. Color: ally outline toggle
919. Font: size adjustment
920. Contrast: text background

### Performance (921–930)
921. FPS counter
922. Auto-quality drop if <30fps
923. Texture quality setting
924. Shadow distance
925. Particle density (verify)
926. Crowd LOD
927. Physics LOD
928. Loading screen progress
929. Asset streaming (load on demand)
930. Memory: dispose unused

---

## I. Multiplayer Stubs (931–960)

*All disabled with "Coming soon". UI only, no netcode.*

931. Menu button (disabled)
932. Lobby browser stub
933. Create lobby stub
934. Player list stub
935. Ready button stub
936. Co-op stub
937. Vs battle stub
938. Leaderboard stub
939. Friends list stub
940. Ping display stub
941. Connection status stub
942. Disconnect handling stub
943. Desync detection stub
944. Anti-cheat notice
945. Terms link
946. Privacy link
947. Age gate
948. 2v2 stub
949. FFA stub
950. Spectator stub
951. Replay share stub
952. Invite friend stub
953. Block player stub
954. Chat stub
955. Voice chat stub (disabled)
956. Team select stub
957. Map vote stub
958. Kick player stub (host)
959. Ban player stub (host)
960. Report player stub

---

## J. Final Verification (961–1000)

961. tsc clean
962. Build passes
963. All vitest pass
964. No console errors: title
965. No console errors: campaign load
966. No console errors: town open
967. No console errors: battle start
968. No console errors: battle end
969. 60fps campaign map (target hw)
970. 30fps+ 100v100 battle
971. Load <10s to title
972. Load <15s to campaign
973. Load <10s to battle
974. All 49 models load
975. All 109 audio files load
976. Save/load roundtrip
977. Settings persist
978. README current
979. FACTION_BACKSTORY in game (codex)
980. LORE.md in game (codex)
981. All 6 faction banners display
982. All 10 biomes load
983. Ragdoll triggers on death
984. Horse ragdoll triggers
985. Thumb pose applied
986. Weather works (rain/fog/clear)
987. Time-of-day works (4 settings)
988. Minimap shows dots
989. Deployment UI works
990. Battle intro/outro work
991. No memory leak (1hr spot check)
992. Mobile viewport usable
993. Keyboard shortcuts documented
994. Credits complete
995. Version number displayed
996. Bug report button
997. Discord link
998. Patch notes UI
999. "Thanks for playing" screen
1000. Boss playtest sign-off

---

**End of 1000 tasks.** Top to bottom. Post to bus when done.
Pax tests everything. Ship it.
