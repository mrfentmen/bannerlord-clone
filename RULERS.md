# RULERS.md

The many rulers the player can march against, ally with, bribe, capture, or replace. Modeled on Bannerlord's lords and clans, grounded in the simulation.

---

## 1. SCALE

At world start, target roughly **300 to 800 named rulers**, generated from real data (one or more per state, many per big city and region), not hand-written. Exact counts come out of the generation pipeline.

## 2. TIERS

- **Side leader:** one per section. Commands the whole side, can declare war and make peace.
- **State governors:** one per state, holds the state's main cities.
- **City rulers and mayors:** run large cities. Powerful and hard to remove.
- **Lords and clan heads:** the Bannerlord lord equivalent. Hold towns, villages, and bases, lead armies, and have families and followers.
- **Local warlords and militia captains:** small rulers controlling a town or road.
- **Mercenary captains:** no land, sell their party to the highest bidder.
- **Bandit and raider leaders:** operate where law is weak.

The player can rise through these tiers.

## 3. RULER DATA

Each ruler has:
- Name, age, family, home region (names are fictional, culturally plausible, and never match a real living public figure)
- Faction and rank
- **Traits** (Bannerlord-style personality)
- Skills: leadership, tactics, logistics, diplomacy, medicine
- Holdings: towns, villages, buildings
- Party, garrison, and retinue
- Wealth: money, gold, food, metal
- Relations with every other ruler they know
- **Ambitions**: what they want (more land, security, revenge, wealth, a rival's downfall)
- Loyalty to their leader

## 4. TRAITS

Each trait ranges from strongly negative to strongly positive, and each has a concrete effect on decisions:

- **Valor:** willingness to attack, accept risky battles, and lead from the front
- **Mercy:** treatment of prisoners and civilians, willingness to accept peace
- **Honor:** keeping oaths, refusing betrayal, loyalty under pressure
- **Generosity:** paying troops well, sharing loot, giving gifts, handling shortages
- **Calculation:** patience, planning, willingness to wait or scheme

A trait is never arbitrary flavor. Where a ruler's trait is generated from state, it should trace to real conditions (a ruler who lost a city to famine may be generated with higher caution and generosity toward food aid, per the generation rules in SPEC.md section 8).

## 5. HOW RULERS DECIDE

Rulers run on the same systems as the player. Each tick, a ruler reads visible state (with noise unless they have intelligence on the target) and picks an action:

- Gather an army and attack a weak neighbor
- Raid a border village
- Send a food or medicine caravan to a starving town
- Ask their leader for help
- Sue for peace
- Quietly switch sides
- Raise or cut taxes
- Fortify or repair
- Do nothing

Decisions weigh traits, ambitions, resources, threats, and relations. They must be explainable in the Why panel: "Lord Reyes attacked Millbrook because it had 4 days of food, his valor is high, and he owed a debt to the enemy."

## 6. RELATIONS AND POLITICS

- Every pair of rulers has a relation score, changed by gifts, insults, battles, marriage, shared enemies, favors, and betrayals.
- Rulers can be friends, rivals, or enemies, and relations spread through families and allies.
- Rulers may support or oppose a leader's decisions (declaring war, choosing a successor, granting a town).
- A ruler with low loyalty and a good offer may **defect** to another side, bringing their holdings and troops.
- **Marriage and family** can tie rulers together and shift relations, with heirs continuing a house after death.

## 7. CAPTURE, RANSOM, AND EXECUTION

When the player defeats a ruler, options include:
- **Release** for goodwill
- **Ransom** for gold and money (gold-heavy sums for high-rank rulers)
- **Hold** as a bargaining chip in peace talks
- **Recruit or pardon** to sway a ruler to the player's side
- **Execute** (strong negative effect on reputation, rulers' Mercy and Honor, and their allies' relations)

Each has consequences that spread through relations and towns.

## 8. AGING, DEATH, AND SUCCESSION

- Rulers age, get sick, get wounded, and die in battle, plague, or of old age.
- Their holdings pass to heirs, or split among rivals, or go to the leader if no heir exists.
- A leader's death can cause a succession fight, defection, or a shift in the whole side's policy.

## 9. TRACKING THE WORLD

- A ruler roster with filters by side, location, rank, and relation to the player.
- A ruler card showing traits, holdings, army, wealth, and recent events, with a Why entry for recent decisions.
- Notifications when key rulers die, defect, or change relation.

## 10. GENERATION RULES

- Ruler names, traits, families, and histories are generated from region-appropriate data plus the simulation state of their holdings.
- Generate once, cache, and regenerate only when a state crosses a defined band, per SPEC.md section 8.
- No real living or recent public figures as characters, per CONSTITUTION.md section 6.
- Each ruler should feel distinct because of real differences (their holdings, neighbors, resources), not because of prompt tricks.
