# DESIGN.md

The game as the player experiences it. Technical detail lives in SPEC.md. The systems web lives in CAUSE_EFFECT.md.

---

## 1. SETTING

Modern-day Earth, real geography, real city names. Local governance is contested: towns and cities are held by whoever can keep them fed, safe, and loyal. No federal cavalry is coming. Territory changes hands through force, deals, and elections held by frightened people.

The world is a collection of towns, cities, and rural settlements connected by roads, highways, rail lines, and waterways. Armed groups, militias, gangs, and local governments compete for them.

**Decision needed before Phase 2: how does modern combat feel?** Default assumption for these docs is a **mixed** model: firearms exist but ammunition is scarce and precious, so melee weapons, improvised weapons, bows, and crossbows stay viable and firearms feel powerful and limited. This keeps Bannerlord-style crowd melee, formations, and ranged units while staying in the modern day. Alternatives are guns-first (tactical shooter feel) or fully low-tech. Changing this later affects unit models, animation sets, AI, and the crowd budget, so decide early.

## 1B. SIDES, STATES, AND SCOPE

The map starts as America only, split into six sides (sections) plus a Wanderer start. The player picks a side, then a state inside it, then a starting role. Each side has real pros and cons. See FACTIONS.md.

Core resources are **money, gold, food, and metal** (plus medicine). See ECONOMY.md.

Armies march over real time and real distance, and marching costs food, money, and morale. See MARCH_AND_WAR.md.

The world holds hundreds of rulers the player can fight, court, bribe, capture, or replace. See RULERS.md.

## 2. THE CORE LOOP

1. **Start as a nobody.** Create a character. A small party, a few bad weapons, a little money.
2. **Earn.** Trade goods between towns, take contracts, hunt bandits, join fights for pay, escort caravans.
3. **Grow.** Recruit, train, and upgrade troops. Gain companions. Level skills and perks.
4. **Fight.** Real-time 3D battles with formations and hundreds of units on screen.
5. **Take a town.** Siege it, negotiate for it, or be granted it.
6. **Govern.** Feed it, cure it, guard it, and tax it without breaking it. Lose its loyalty and it votes you out. Lose its health and it dies.
7. **Expand or fall.** More towns means more pressure. Every holding is a liability as well as an asset.

## 3. THE PLAYER CHARACTER

- Attributes and skills (melee, ranged, riding or driving, leadership, medicine, trade, logistics, persuasion). Skills level by use.
- Perks unlocked at skill milestones that change how systems respond to you (a high logistics skill reduces spoilage on caravans, a high medicine skill improves outbreak response).
- Equipment slots, weight, condition, and repair.
- A reputation per faction and per town, written to shared state so the rest of the world reacts to it.

## 4. THE PARTY

- Party size limit driven by leadership and renown.
- Troops have quality, morale, wages, and upkeep. Unpaid or underfed troops desert.
- Troop trees: recruits upgrade along branches (militia, marksman, medic, scout, heavy). Upgrades cost money and training time.
- Companions: named characters with skills, opinions, and personal quests. They can be sent to govern a town, run a caravan, or lead a detachment.
- Party carries food, ammo, medicine, and trade goods. All three of the first are consumed over time.

## 5. TOWNS AND CITIES

Every town has:
- Population by class (workers, merchants, militia, dependents)
- Food stock and production
- Medicine stock, sanitation, and infection state
- Prosperity and market prices
- Loyalty toward its current holder
- A council that votes (see below)
- Buildings the holder can invest in (clinic, granary, wall, market, barracks, water treatment)

### Losing a town without a battle

Each town runs a periodic loyalty check. If loyalty stays below a threshold for long enough, the council calls a vote. The vote result depends on the town's actual conditions and history, not a dice roll: hunger, unpaid promises, recent deaths, heavy taxes, garrison abuse, an outside faction offering a better deal. If the vote goes against the holder, the town leaves them. The player sees which conditions tipped it.

### Losing a town to sickness

An outbreak spreads by crowding, poor sanitation, and contact with infected travelers. A cure requires medicine stock, which must be produced or delivered. If none arrives, deaths climb, workers die, farms and shops empty, and the town can collapse to a ghost settlement with nothing left to govern.

## 6. WORLD AND FACTIONS

- Factions are fictional: local governments, militias, trade guilds, and criminal groups. Each has territory, a leader, a treasury, armies, and goals.
- Factions run on the same systems as the player. AI factions can also starve a town, lose a vote, or lose a city to plague.
- Bandits and raiders appear where law is weak and loot is rich. Roads with no patrols produce more raiders, which produces fewer caravans, which produces shortages.

## 7. BATTLES

- Real-time 3D, player controls one character on the field and commands formations.
- Field battles, town sieges, and ambushes on the road.
- Sizes from small skirmishes to a few hundred units in the first target, scaling up as performance allows.
- Terrain, cover, morale, and troop quality matter more than raw numbers.
- Outcomes write back to shared state: casualties, wounded, loot, territory, reputation, and the mood of nearby towns.

## 8. TRADE AND ECONOMY

- Goods have prices that respond to local supply and demand. Buy low, haul, sell high.
- Prices are outputs of the same shared state as everything else. A town with an outbreak pays more for medicine. A blockaded city pays more for food.
- Caravans move over real time on real roads and can be robbed, delayed, or protected.

## 9. WHAT THE PLAYER SHOULD FEEL

- "I did this." Every disaster should be traceable to specific choices, even when the choice was reasonable at the time.
- Systems pushing back. Solving one problem creates a new one.
- Towns feel like places with people in them, not stat bars.
- No side is good or evil. Everyone is trying to keep their people alive.

## 10. OUT OF SCOPE FOR V1

- Multiplayer
- Naval combat
- Full global map (start with one region, see PHASES.md Phase 0)
- Deep dialogue trees and full voice acting
