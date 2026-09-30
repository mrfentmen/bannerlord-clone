# FEATURES.md

A full inventory of Mount & Blade II: Bannerlord features, each mapped to a modern equivalent for the 1950s to 2000s, with a status showing whether the docs already cover it.

**Status legend**
- **Covered:** already written in an existing doc (file named)
- **Partial:** touched on, needs a full design
- **New:** not in the docs yet

**Scope tiers**
- **V1:** needed for the first playable game
- **V2:** after V1 works end to end
- **Later:** only if V1 and V2 succeed

---

## 1. ERA SYSTEM (assumption, needs confirming)

Working assumption: the campaign clock runs across the era, and **technology unlocks by year**, so the same game feels different in 1955, 1975, 1995, and 2005.

- The player picks a **start year** (or a scenario decade).
- Weapons, vehicles, medicine, communications, and building types unlock by year, for every side, with side-specific lags and strengths (a rich side gets new tech first, a poor side gets it late or through trade and capture).
- Disease, food technology, and infrastructure follow the same year tiers.
- Real geography, real city names, and real population data stay. History is **fictional and system-driven**, not a replay of real events, and no real people appear (CONSTITUTION.md section 6).

| Era tier | Years | Typical ground combat | Typical mobility | Comms and intel |
|---|---|---|---|---|
| Tier 1 | 1950s | Bolt-action and early semi-auto rifles, submachine guns, grenades, mortars | Trucks, jeeps, early tanks, horses and bikes in poor regions | Field telephones, early radios, couriers, print news |
| Tier 2 | 1960s to 1970s | Assault rifles, machine guns, rocket launchers, flak vests | Armored carriers, trucks, more capable tanks | Better radios, radio and TV broadcast, wiretaps |
| Tier 3 | 1980s | Modern body armor, night vision, anti-tank missiles | Mechanized infantry, better armor | Field radios common, early computers for logistics |
| Tier 4 | 1990s to 2000s | Improved optics, better body armor, precision weapons | Fast mechanized forces, better logistics | GPS, mobile phones, satellite imagery, internet |

Helicopters and aircraft are **Later** (see section 12).

---

## 2. CHARACTER

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Character creation with backstory choices (childhood, youth, adulthood) | Background questions: hometown, family trade, military service, street life. Sets starting skills, money, relations | New | V1 |
| Six attributes (Vigor, Control, Endurance, Cunning, Social, Intelligence) | Keep the same six | New | V1 |
| Focus points and 18 skills | Same structure with modern skills (below) | New | V1 |
| Skill leveling by use | Same: shooting raises marksmanship, driving raises driving | Partial (DESIGN.md section 3) | V1 |
| Perks at skill milestones | Same, with modern perks | Partial | V1 |
| Character level and renown | Keep | Covered (MARCH_AND_WAR.md section 8) | V1 |
| Traits (valor, mercy, honor, generosity, calculation) | Keep for player and rulers | Covered (RULERS.md section 4) | V1 |
| Character appearance editor | Face, body, clothing, era-appropriate | New | V2 |
| Clan banner and sigil editor | **Insignia, flag, and unit patch editor**, shown on armies, vehicles, and towns | New | V1 |

**Modern skill list (18, mirroring Bannerlord's structure):**
- Combat: Rifles (Bow), Sidearms (Crossbow), Automatic Weapons (Throwing), Heavy Weapons and Launchers (Polearm), Close Combat (One Handed), Explosives (Two Handed)
- Mobility: Driving (Riding), Athletics
- Party: Scouting, Tactics, Leadership, Logistics (Steward), Medicine, Engineering, Gunsmithing (Smithing)
- Social: Charm, Trade, Streetcraft (Roguery)

---

## 3. PARTY AND TROOPS

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Party with size limit | Keep, driven by Leadership and renown | Covered (DESIGN.md section 4) | V1 |
| Troop trees per culture, upgradeable by XP and money | Troop trees per side, tiers unlock by year (militia, rifleman, machine gunner, medic, engineer, scout, sniper, mechanic, armor crew) | Partial (FACTIONS.md troop styles) | V1 |
| Party roles: Quartermaster, Scout, Surgeon, Engineer | Keep the same four roles, assigned to companions | New | V1 |
| Companions and wanderers found in taverns | Found in **bars, diners, camps, and hospitals**, each with skills, backstory, and personal quests | Partial (DESIGN.md section 4) | V1 |
| Wages and morale | Keep | Covered (ECONOMY.md) | V1 |
| Wounded troops and healing | Keep, driven by Medicine skill and medicine stock | Covered (CAUSE_EFFECT.md) | V1 |
| Prisoners and recruiting prisoners | Keep | Covered (MARCH_AND_WAR.md section 5, RULERS.md section 7) | V1 |
| Troop upgrade trees with equipment sets | Era-based equipment sets per troop type | New | V1 |
| Desertion | Keep | Covered (CAUSE_EFFECT.md) | V1 |

---

## 4. EQUIPMENT, CRAFTING, AND INVENTORY

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Weapons, armor, shields, mounts, item tiers and quality | Weapons, body armor, helmets, vehicles, gear, by era tier and condition | New | V1 |
| Horses | **Vehicles:** motorcycles, jeeps, trucks, armored carriers, tanks. Need fuel and repairs. Horses and bikes remain for poor regions | New | V1 |
| Smithing and weapon crafting | **Gunsmithing and workshops:** assemble, modify, and repair weapons. Vehicle mechanics for repairs and upgrades | New | V2 |
| Item weight and party inventory | Keep, with vehicle cargo capacity | New | V1 |
| Loot from battles | Keep, with salvage from wrecks | New | V1 |
| Item upkeep | Repairs cost metal, parts, and time | Partial (ECONOMY.md section 4) | V1 |
| Trade goods and pack animals | Trade goods carried by trucks | Covered (ECONOMY.md) | V1 |
| Weapon proficiency and damage types | Ballistics: weapon type versus armor rating, range, rate of fire | New | V1 |

---

## 5. COMBAT (Battle Layer)

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Real-time third and first person combat | Third and first person, cover-based | Partial (SPEC.md section 5) | V1 |
| Directional melee attack and block | Melee remains for close quarters and desperate cases. Firearms use aim, recoil, and reload | New | V1 |
| Mounted combat | **Vehicle combat:** drive, ride as passenger, fire from vehicles, dismount. Later tank crew roles | New | V1 (one or two vehicle types), V2 (more) |
| Ranged units with limited ammo | Rifles, machine guns, launchers with ammo tied to metal and supply | Partial (ECONOMY.md) | V1 |
| Formation commands (hold, advance, charge, follow) | Same, plus **fire teams, spread, suppress, take cover, flank** | New | V1 |
| Formation types (line, square, shield wall) | Line, column, wedge, staggered, cover posts | New | V1 |
| Morale and rout | Keep, plus suppression as a factor | Covered (SPEC.md section 5.2) | V1 |
| Friendly fire | Keep | New | V2 |
| Weather, time of day | Keep, affects visibility and vehicle movement | Partial | V2 |
| Battle map from campaign terrain | Keep | Covered (SPEC.md) | V1 |
| Field battles and ambushes on the road | Keep | Covered (MARCH_AND_WAR.md) | V1 |
| Kill and hit feedback | Blood and hit effects, injury state per unit | New | V2 |
| Tournaments and arena | **Shooting contests, boxing, races, arena matches** in towns for prizes and renown | New | V2 |
| Duels | Keep, as quick one on one fights | New | V2 |
| Training field | Firing range and driving course | New | V2 |

---

## 6. SIEGES AND FORTIFICATIONS

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Castles and walled towns | **Military bases, fortified compounds, bunkers, dams, bridges, walled or barricaded city districts** | New | V1 |
| Siege engines (catapults, towers, rams, ladders) | **Artillery and mortars, armored breachers, demolition charges, sappers, ladders and ramps** | Partial (MARCH_AND_WAR.md section 6) | V1 (basic), V2 (full) |
| Defenders' siege weapons | Mounted machine guns, anti-tank weapons, minefields, barbed wire, barricades | New | V2 |
| Siege camp and multi-day building | Keep: building siege equipment takes days and metal | Partial | V1 |
| Sallying out | Keep | New | V2 |
| Wall breach phases | Breach, assault, secure | New | V2 |
| Relief armies | Keep | Covered (MARCH_AND_WAR.md section 6) | V1 |

---

## 7. TOWNS, CASTLES, AND VILLAGES

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Towns, castles, villages with bound relationships | Cities, bases, farm and factory villages bound to a city | Partial (DESIGN.md section 5) | V1 |
| Prosperity, loyalty, security, food | Keep | Covered (CAUSE_EFFECT.md) | V1 |
| Town projects (construction queue) | **Town projects:** clinic, granary, armory, motor pool, radio tower, generator, school, market, bunker | Partial (DESIGN.md section 5) | V1 |
| Governors | Companions or rulers governing a town, skills affect results | Partial (MARCH_AND_WAR.md section 9) | V1 |
| Town militia | Local defense force | New | V1 |
| Village production and hearths | Village output tied to workers and farmland | Covered (CAUSE_EFFECT.md) | V1 |
| Bandit hideouts | **Bandit compounds and safe houses** infiltrated in small stealth-and-fight missions | New | V2 |
| Taverns | **Bars and diners** for rumors, recruiting, and companions | New | V1 |
| Town menu: arena, market, lord's hall, tavern, keep | Town menu: market, town hall, bar, arena, motor pool, clinic | New | V1 |

---

## 8. NOTABLES, QUESTS, AND RELATIONS

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Notables (headmen, artisans, merchants, gang leaders, rural and urban) | Town and village notables: mayors, foremen, shopkeepers, union bosses, gang bosses, farm owners. They give quests and recruits and shape loyalty | New | V1 |
| Procedural quests | Delivery, escort, bounty, rescue, protect a village, clear a compound, gang disputes, supply runs, find missing people, and many more | New | V1 (a set of about 10), V2 (many more) |
| Main story quest | Optional long campaign goal (for example: unite a region, or become national leader) | New | V2 |
| Relationship system | Keep | Covered (RULERS.md section 6) | V1 |
| Persuasion and dialogue skill checks | Dialogue choices tested against Charm, Streetcraft, Leadership, and trust | New | V2 |
| Random map events (ambush, refugees, wounded travelers) | Roadblocks, refugee columns, broken-down convoys, checkpoints, random encounters | New | V2 |

---

## 9. KINGDOMS AND POLITICS

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Kingdoms and clans, clan tiers | Sides and clans (families or organizations) with tiers | Partial (FACTIONS.md, RULERS.md) | V1 |
| Kingdom policies voted by lords | **Policies** voted by rulers: conscription, tax law, rationing, martial law, trade openness | New | V2 |
| Kingdom decisions (war, peace, fief grants, annexation) | Keep | Covered (MARCH_AND_WAR.md section 7) | V1 |
| Mercenary contracts | Keep | Covered (DESIGN.md, RULERS.md) | V1 |
| Vassalage | Keep | Covered (MARCH_AND_WAR.md section 9) | V1 |
| Founding your own kingdom | Keep | New | V2 |
| Clan influence and renown | Keep | Covered (MARCH_AND_WAR.md section 8) | V1 |
| Rebellions of towns | Town revolts when loyalty collapses | Covered (CAUSE_EFFECT.md) | V1 |
| Marriage, romance, children, heirs | Keep, with generational play | Partial (RULERS.md section 6 and 8) | V2 |
| Family and death | Keep | Partial (RULERS.md section 8) | V2 |

---

## 10. WORLD AND MAP

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| Campaign map with speed by terrain | Keep, with road, rail, and terrain speed | Covered (MARCH_AND_WAR.md section 1) | V1 |
| Time controls (pause, normal, fast) | Keep, essential | New | V1 |
| Seasons and weather | Keep, affects food, marching, and disease | Partial | V2 |
| Day and night | Keep | New | V2 |
| Caravans, patrols, war parties, villagers moving on the map | Keep | Partial (CAUSE_EFFECT.md, ECONOMY.md) | V1 |
| Bandit types by region | Highway raiders, looters, smugglers, militia holdouts | New | V1 |
| Map encounters and speed menu | Encounter menus: attack, flee, talk, bribe | New | V1 |

---

## 11. UI AND META

| Bannerlord feature | Modern equivalent | Status | Tier |
|---|---|---|---|
| In-game encyclopedia | Encyclopedia for rulers, sides, places, units, items | New | V2 |
| Inventory, party, clan, kingdom, quest, character screens | Same | Partial | V1 |
| Save and load, autosave | Keep, plus difficulty and iron-man option | New | V1 |
| Difficulty settings | Keep | New | V2 |
| Sound, music, voiced lines | Era-appropriate music and radio, ambient sound | New | V2 |
| Multiplayer | Not in V1 | Out of scope | Later |
| Mod support | Data-driven configs make this possible | Out of scope | Later |

---

## 12. MODERN-ONLY ADDITIONS (not in Bannerlord)

These come from the 1950 to 2000s setting and make the era feel real.

- **Fuel as a fifth resource.** Vehicles need it, and fuel supply chains become a target. Recommended once vehicles are central. See section 13.
- **Communications:** radios and phones let armies coordinate and let scouts report in real time. Cutting communications slows rivals. Later eras add satellite and network effects.
- **Media and public opinion:** newspapers, then radio and TV, shape loyalty and unrest. Propaganda and censorship become tools. This plugs into the existing loyalty system.
- **Infrastructure:** power grids, water, roads, rail, bridges, and dams can be built, repaired, or destroyed. Damaged infrastructure feeds sanitation, food, and prosperity.
- **Industry:** factories convert metal and labor into weapons, vehicles, and goods. Strikes and shortages matter.
- **Era-specific disease and medicine:** disease severity follows medical tech tiers (vaccines, antibiotics, hospitals appear by year).
- **Refugee flows** from war and collapse, already in the migration system.
- **Checkpoints and blockades** on modern roads.
- **Helicopters, aircraft, and naval forces:** Later, if the scope allows. Air support would be a strong siege and supply tool but is expensive to build and balance.
- **Mines, booby traps, and IEDs** for defenders and insurgents (Later).

---

## 13. DECISIONS THIS CHANGES

- **Setting text:** LORE and DESIGN currently say "today." Switch to the era system in section 1, or keep today and use section 1's tiers as tech level options.
- **Fuel:** adding it changes ECONOMY.md, MARCH_AND_WAR.md, and CAUSE_EFFECT.md, since marches, caravans, and vehicle battles all draw on it.
- **Combat model:** DESIGN.md section 1 (mixed, ammo scarce) needs rewriting for era-based firearms and vehicles.
- **Battle performance:** vehicles are heavy meshes. Phase 3 crowd tests should include a small number of vehicles among many infantry.
- **Asset needs:** a wide era range needs many more model variants (era vehicles and weapons). Decide whether to cover all decades or start with a smaller window.

---

## 14. SCOPE ADVICE

Bannerlord took a full studio years. For one person, V1 should be:
- Character with skills, party, troop trees, companions
- Campaign map with trade, towns, notables, basic quests
- Ground combat with infantry and one or two vehicle types
- Basic sieges, kingdoms, war and peace, rulers
- One or two era tiers, not all four

Everything marked V2 and Later comes after V1 runs end to end and feels good.
