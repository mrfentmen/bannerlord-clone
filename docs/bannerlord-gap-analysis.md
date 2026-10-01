# Bannerlord Gap Analysis

**Date:** 2026-10-01
**Method:** Systematic crawl of mountandblade.fandom.com starting from the main game
page, following links to every major system page. Wiki is the source of truth;
formulas marked [CODE] come from a third-party reverse-engineering doc
(github.com/efoltyn/gta6 research) and are leads, not wiki-verified.
**Pages covered:** 23 wiki pages read directly (see source list at bottom).
**Pages failed:** Siege_(Bannerlord) 403, Villages_(Bannerlord) 404,
Castles_(Bannerlord) 404, Kingdoms_(Bannerlord) 403, Clans_(Bannerlord) 404 —
noted and routed around via search results and the Fief Governance page.

Compare against: `bannerlord-mechanics-port.md` (our current spec).

---

## COVERED (already in our spec — one line each)

- Physics-based melee: velocity/direction/impact/armor all factor into damage [WIKI]
- 4-directional attacks + thrust, directional blocking (must match direction AND physically interpose) [WIKI]
- Damage types: blunt (best vs armor), pierce, cut (worst vs armor) [WIKI]
- Kick, chamber block, feint; shield tradeoffs (passive projectile block vs slower movement) [WIKI]
- Couched lance / mounted velocity damage; braced pikes counter cavalry [WIKI]
- Ranged: bows/crossbows/throwing (→ firearms in our port); shields block projectiles passively [WIKI]
- Battle flow: deployment, formations, orders, morale/rout, reinforcement waves, tactical retreat, auto-resolve
- Raiding: village raid stages, loot scaling with prosperity, consequences, recovery, forage
- Sieges (basic): engines, starvation, assault, sally out, camp management
- Campaign actions: move, enter town, trade, recruit, party mgmt, rest/wait, patrol, track parties, day/night
- Diplomacy (basic): war/peace, tributes, alliances, trade agreements, -100..+100 relations, defection
- Clan: companions, party roles (scout/engineer/surgeon/quartermaster), family/marriage/children, fiefs, garrison, vassals, kingdom policies (named only)
- Character: 6 attributes × 18 skills, XP-by-doing only, Focus + learning-limit caps (`Focus*30 + (Attribute-1)*10`), perks every 25 levels, renown/influence, honor/traits [WIKI]
- Economy (basic): trade goods, supply/demand prices, workshops, caravans, taxes, ransoms, wages, food
- Quests (basic): village/town/lord quests, main storyline, random encounters
- Bandits: 5 bandit types, hideouts, mercenary work, bounty hunting
- Cultures/ethnicities with mechanical pros/cons (our 10-ethnicity port of the 6-culture system)
- 10 reusable battle-map biomes (boss directive)

---

## MISSING (not in our spec, or only named without mechanics)

### Character & Progression

**1. Character creation backgrounds**
[WIKI] https://mountandblade2bannerlord.wiki.fextralife.com/Character+Creation
Bannerlord's character creation is culture → family background → early
childhood → adolescence → youth → young adult → story choices. Each pick grants
skill levels, focus points, and attribute points (e.g. Vlandian "baron's
retainers": +10 Riding/Polearm, +1 focus each, +1 Social). Our spec has culture
picks but no life-path background system.
Area: character. Priority: P1.

**2. Aging, death, and the calendar**
[WIKI] via Steam community + https://mountandblade.fandom.com/wiki/Companions_(Bannerlord)
A year is 84 days (4 seasons × 21 days). Characters visibly age and die of old
age or in battle. Our spec has no aging, no calendar, no natural death.
Area: clan. Priority: P1.

**3. Heir system**
[WIKI] via https://www.taleworlds.com/en/Games/Bannerlord/Blog/119 (dev blog)
Any clan member can be designated heir. When the player character dies, the
player continues as the heir with the clan's renown and reputation intact.
Without this, death = game over, which breaks the long-campaign fantasy.
Area: clan. Priority: P1.

**4. Pregnancy and children growing up**
[WIKI] via Steam community (pregnancy 36 days = 1 season + 15 days; come of age at 18)
Marriage can produce children after a 36-day gestation. Children age in real
time and become usable party members/leaders/governors at 18. Daughters who
marry leave the clan unless they are the clan leader. Our spec says "family,
marriage, children, heirs" as one line with zero mechanics.
Area: clan. Priority: P2.

**5. Courtship**
[WIKI] via TaleWorlds persuasion dev blog (pcgamer.com coverage)
Winning a spouse requires courtship: dialogue, persuasion checks, and
attraction influenced by Charm and reputation. It is a multi-stage process,
not a single dialogue click. Our spec lists "marriage" with no mechanics.
Area: clan. Priority: P2.

### Settlement Management (largest gap — our spec has almost none of this)

**6. Loyalty system**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Every town/castle has a daily loyalty value. Sources: governor same culture +1
/ different culture −1; owner clan culture mismatch −3; security ≥50 +1 / <50
−2; each supporting notable ±0.5; starvation penalties; drift toward 50.
Loyalty ≥75 boosts taxes and prosperity; loyalty <25 puts the fief in a
rebellious state; the wiki states a daily 25% rebellion chance below 25.
Our spec mentions "loyalty" once without any mechanics.
Area: campaign. Priority: P0.

**7. Security system**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Security is driven mostly by garrison strength (unit strength =
((2+tier)×(10+tier))/50, cavalry +20%), drifts toward 50. Nearby hideout −2,
looted bound village −2, under siege −3. Security ≥75 gives +5% taxes; <50
gives −10% taxes and notable relation penalties. Our spec has no security
stat at all.
Area: campaign. Priority: P0.

**8. Town food system**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Towns have food stocks fed by: inside production (+15 town / +10 castle),
bound villages (+6 × hearth tier each), market purchases (food bought on the
market becomes town food), and Orchard/Garden projects. Drains: −2.5% of
prosperity daily and −5% of garrison size daily. Granary buildings expand
storage (100 base town / 250 castle). Starvation tanks loyalty and
prosperity. Our spec has party food only — nothing for settlements.
Area: economy. Priority: P1.

**9. Construction projects**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Towns/castles build tiered projects: Fortifications, Barracks, Training
Fields, Fairgrounds, Marketplace, Granary, Orchards/Gardens, Militia Grounds,
Aqueducts, Forum (daily influence), Siege Workshop, Workshops, Castellan's
Office (castle). Construction points come from prosperity (1%/day), can be
boosted with gold (500/day), and are modified by governor Engineering skill
and perks. Projects queue. Our spec has no building system.
Area: campaign. Priority: P1.

**10. Militia**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Settlements spawn free militia daily: base +2, +prosperity/1000 (towns) or
+hearths/400 (villages), with 2.5% retiring daily. Militia costs no upkeep,
eats no food, and only defends. This is the main reason towns aren't trivially
captured. Our spec has no militia.
Area: combat/campaign. Priority: P1.

**11. Village hearths and production**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Villages grow "hearths" (population): +0.6/day below 300, +0.4 below 600,
+0.2 above; raids set them back hundreds of points plus a raided state with
no growth. Each village type has fixed daily production (grain village +50
grain; fish +28; iron +10; silver +3; etc.), multiplied by hearth tier
(0.5×/1×/1.5×). Our spec says "prosperity regrows" with no numbers.
Area: economy. Priority: P1.

**12. Governors**
[WIKI] https://mountandblade.fandom.com/wiki/Companions_(Bannerlord)
Companions and family members can be assigned as governors of towns/castles.
Their "governor" perks apply to the fief; a governor of mismatched culture
inflicts a loyalty penalty. This is the main use for spare companions in the
late game. Our spec lists companions but not governorship.
Area: campaign. Priority: P1.

**13. Garrison economics**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Garrisons cost wages (reducible via Castellan's Office up to −30%) and eat
town food (−5% of garrison size daily). Training Fields give garrisoned troops
daily XP. Managing garrison size vs. food vs. security is a core loop. Our
spec says "garrison management" as one line.
Area: campaign. Priority: P1.

**14. Rebellion**
[WIKI] https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
Below 25 loyalty the wiki reports a daily 25% rebellion chance; on rebellion
the settlement flips to a rebel clan. Low-loyalty militia gets up to +200%
strength ([CODE] research). Conquest without loyalty management is
self-defeating — this is the anti-snowball mechanic. Our spec has nothing.
Area: campaign. Priority: P1.

**15. Sneaking into hostile towns**
[WIKI] https://mountandblade.fandom.com/wiki/Towns_(Bannerlord)
When barred from a town (enemy faction, criminal), the player can sneak in.
Sneak chance = (0.3 + Roguery×3/1000 − 0.005×garrison avg level −
renown×0.00015) × 1.5 with the Two-Faced perk. Caught = fight the guards.
Our spec has no infiltration mechanic.
Area: campaign. Priority: P2.

### Kingdom & Diplomacy

**16. Influence: gain and spend**
[WIKI] https://mountandblade.fandom.com/wiki/Army + gamertweak.com guide
Influence is the political currency. Gained from: winning battles, fighting
in allied armies, donating prisoners to allied town/castle dungeons, Forum
buildings (+daily), kingdom policies, certain perks. Spent on: forming armies,
kingdom decisions, policy votes. Our spec lists "renown/influence" as one
line with no sources or sinks.
Area: diplomacy. Priority: P0.

**17. Armies**
[WIKI] https://mountandblade.fandom.com/wiki/Army
Parties merge into a single map entity — one speed, one morale, one food
pool. Costs influence to form (free for own-clan parties); has a Cohesion
stat that drains daily and with size; at zero the army auto-disbands.
Cohesion can be restored by spending influence. Our spec mentions "armies" in
passing with no mechanics.
Area: campaign. Priority: P0.

**18. Clan tiers**
[WIKI] https://www.taleworlds.com/en/Games/Bannerlord/Blog/119 (dev blog) + skills page
Renown thresholds: 0/50/150/350/900/2350/6150 for tiers 0–6. Each tier grants
+party size, +1 companion slot, extra clan parties (tiers 3, 5), and more
workshops (tier+1). Tier 1 unlocks mercenary work, tier 2 vassalage, tier 4
kingdom founding. Renown comes from winning battles (more when outnumbered),
tournaments, and trade perks. Our spec mentions renown once with no tiers.
Area: character. Priority: P0.

**19. Kingdom policies**
[WIKI] via https://github.com/litauen/docs.bannerlordmodding.lt (official modding docs)
~15 votable policies with concrete effects: Land Tax, State Monopolies,
Sacred Majesty, Magistrates, Debasement of the Currency, Crown Duty, Imperial
Towns, War Tax, Royal Guard, Senate, etc. Each shifts taxes, loyalty,
security, influence, or prosperity daily. Proposed and repealed through
kingdom votes costing influence. Our spec says "kingdom policies (voting,
laws)" — one line, no policies, no effects.
Area: diplomacy. Priority: P1.

**20. Kingdom decision voting**
[CODE] https://github.com/efoltyn/gta6/blob/HEAD/docs/plan/research-bannerlord-systems.md
Influence costs: support a clan 50, propose peace 100, propose policy 100,
propose war 200, annex fief 200, expel clan 200. Votes are weighted:
slightly favor 20 / strongly favor 60 / fully push 150 influence. AI clans
weigh relations with the proposer. Our spec has no voting mechanics.
Area: diplomacy. Priority: P1.

**21. Persuasion minigame**
[WIKI] via TaleWorlds dev blog (pcgamer.com/rpgwatch.com coverage)
Persuasion is a fill-the-bar dialogue minigame: pick arguments matched to the
NPC's personality and your reputation (honor, generosity). Success reduces
barter costs for the deal that follows; repeated failures can make deals
impossible and damage relations. This is the gateway to defection, marriage,
and peace deals. Our spec lists "persuasion" under quests with no mechanics.
Area: diplomacy. Priority: P1.

**22. Barter system**
[WIKI] via TaleWorlds dev blog (pcgamer.com coverage)
Lords trade via a barter screen: fiefs, prisoners, peace, gold, and items can
all change hands. Persuasion success lowers the price. There are cooldowns
between attempts. Our spec has no barter screen.
Area: diplomacy. Priority: P1.

**23. Mercenary contracts**
[WIKI] https://www.taleworlds.com/en/Games/Bannerlord/Blog/119 (dev blog)
At clan tier 1+, kingdoms at war will hire the player's clan as mercenaries:
paid per influence earned in their wars, no fiefs, can leave freely. This is
the intended early-game on-ramp to kingdom politics. Our spec says
"mercenary work (hire out to factions at war)" — one line.
Area: diplomacy. Priority: P2.

**24. Kingdom founding**
[WIKI] https://mountandblade.fandom.com/wiki/Create_an_Imperial_Faction (referenced in research)
Requires the Dragon Banner questline plus: clan tier 4 (900 renown), 100
troops, independent clan, one owned settlement. Founding lets you set the
first policies and recruit vassal clans. Our spec has no kingdom-founding
path.
Area: diplomacy. Priority: P2.

**25. Defection details**
[WIKI] via Steam community (vassal mechanics)
Leaving a kingdom: keep fiefs = war with the old kingdom; release fiefs =
clean break. Persuading enemy lords to defect requires high relations,
persuasion, and usually being at war with their faction (they bring their
fiefs only under some conditions). Our spec says "defect to another faction
(take fiefs or not)" — one line.
Area: diplomacy. Priority: P2.

### Economy

**26. Workshop types and recipes**
[WIKI] https://mountandblade.fandom.com/wiki/Workshop
11 workshop types with fixed input→output recipes: Brewery (grain→beer),
Velvet Weavery (silk→velvet), Linen Weavery (flax→linen), Wine Press
(grapes→wine), Olive Press (olives→oil), Pottery (clay→pottery), Wool Weavery
(wool→garments), Tannery (hides→leather), Wood Workshop (hardwood→bows/tools),
Smithy (iron→weapons/tools), Silversmith (silver→jewelry). Cost scales with
town prosperity; changing type costs 2000; capped at clan tier+1 workshops;
two of the same type in one town compete and both earn less. Our spec says
"workshops (buy, produce goods, profit over time)" — no types or recipes.
Area: economy. Priority: P1.

**27. Caravan mechanics**
[CODE/WIKI] research doc + https://mountandblade.fandom.com/wiki/Companions_(Bannerlord)
Caravans cost 15,000 denars (22,500 for the guarded version), must be led by
a companion, trade automatically on the map, and can be attacked by bandits
or destroyed in wars. They generate trade rumors and level the companion's
Trade/Scouting. Our spec says "caravans (send out, they trade automatically,
can be attacked)" — one line.
Area: economy. Priority: P1.

**28. Trade rumors and price hunting**
[WIKI] https://mountandblade.fandom.com/wiki/Skills_(Bannerlord)
Trade XP comes specifically from buying/selling "according to their rumors"
— the game feeds price-rumor info, and profitable trades against rumors level
the skill. Our spec has generic "price simulation" with no rumor mechanic.
Area: economy. Priority: P2.

**29. Smithing (crafting) system**
[WIKI] https://mountandblade.fandom.com/wiki/Skills_(Bannerlord) + main page
Smelt loot into raw materials (charcoal from hardwood; iron→steel→fine
steel→thamaskene steel refining chain), unlock weapon parts by
smelting/crafting, forge custom weapons from parts (swords, daggers,
javelins, axes), limited by daily smithing stamina. Crafting orders from
towns pay for specific weapons. Our spec mentions "Crafting (smithing)" as a
skill with no system behind it. (Modern port: gunsmithing/workshop crafting.)
Area: economy. Priority: P2.

**30. Ransom brokers**
[WIKI] https://mountandblade.fandom.com/wiki/Ransom
Wandering ransom brokers appear in town taverns and buy common prisoners
(50–300 denars each). Lords can't be sold to brokers — their kingdoms make
ransom offers over time (1,500–5,000; rulers far more). Our spec says
"tributes / ransoms" — one line.
Area: economy. Priority: P2.

### Combat

**31. Prisoner capture rules**
[WIKI] https://mountandblade.fandom.com/wiki/Prisoners
Only enemies knocked unconscious by blunt damage (maces, horse charges) can
be captured; sharp weapons kill. This makes blunt loadouts a deliberate
economic choice. Our spec has prisoners nowhere.
Area: combat. Priority: P1.

**32. Prisoner recruitment (conformity)**
[CODE] https://github.com/efoltyn/gta6/blob/HEAD/docs/plan/research-bannerlord-systems.md
Prisoners accrue "conformity" over time: needed = (level+6)²−10, gained at
10 + 0.05×Leadership per hour. Recruiting costs party morale (−1 per man,
−2 for bandits). Parties only auto-recruit above 30 morale. This is a full
second recruitment economy. Our spec has nothing.
Area: campaign. Priority: P1.

**33. Hideout assaults**
[WIKI] https://mountandblade.fandom.com/wiki/Bandit_Camp + research doc
Hideouts can only be attacked at night, with exactly 8 troops (companions
first), against 50–60 bandits in a staged fight where kills persist between
attempts; ends in a boss duel. Rewards: 700–1000 Roguery XP, loot,
prisoners, and +6 security to nearby settlements. Our spec says "bandit
hideouts (raidable dungeons)" — one line.
Area: combat. Priority: P1.

**34. Siege engine details**
[WIKI] via https://www.taleworlds.com/en/Games/Bannerlord/Blog/53 (dev blog)
Engines: ladders, battering ram (+improved ram), siege tower, ballista (+fire
variant), onager/mangonel (+fire), catapult (+fire), trebuchet (+fire).
Build order: camp preparations first, then engines one at a time; build
speed scales with sqrt(men) × Engineering skill; engines can be held in
reserve; defenders build counter-engines; fire variants kill engines, normal
variants breach walls and kill troops. Our spec lists 4 engine names with no
mechanics.
Area: siege. Priority: P1.

**35. Wounded vs. killed**
[WIKI] https://mountandblade.fandom.com/wiki/Skills_(Bannerlord) (Medicine)
Troops are wounded more often than killed (blunt helps); the surgeon's
Medicine skill converts would-be deaths into wounded, who recover over days.
This is why Medicine matters and why battles don't permanently erase armies.
Our spec has no wounded state.
Area: combat. Priority: P1.

**36. Troop XP and upgrades**
[WIKI] https://www.taleworlds.com/en/Games/Bannerlord/Blog/119 (dev blog)
Troops earn upgrade XP from battle participation; Vlandian culture gets +20%
upgrade XP. Upgrade paths branch by faction troop trees. Our spec has
recruitment but no troop progression.
Area: combat. Priority: P1.

**37. Execution**
[WIKI] via Steam community (honor/execution discussions)
Captured lords can be executed. It permanently removes them but inflicts
severe relation penalties with their clan/friends and honor loss. It's the
"nuclear option" of Bannerlord politics. Our spec has nothing.
Area: diplomacy. Priority: P2.

**38. Tournaments**
[WIKI] https://mountandblade.fandom.com/wiki/Tournaments_(Bannerlord)
Arena tournaments run in towns: multi-round brackets with random gear, betting
up to 150 denars per round (300 with a Roguery perk), odds that worsen as you
keep winning, prize gear for the champion, and renown gains. Early-game money
and XP staple. Our spec mentions "arena" under town quests — one word.
Area: character. Priority: P2.

### Campaign / Social Systems

**39. Notables**
[WIKI] https://mountandblade.fandom.com/wiki/Notables
Every town (4–6) and village (2–3) has named, persistent notables — headmen,
merchants, artisans, gang leaders, preachers — with a Power stat
(Regular/Influential/Powerful). Relations are per-notable, not per-settlement,
and gate recruitment: slots = 1 + relation bonus (up to +7 at 100 relation) +
faction/war modifiers, capped at 6; Power 200+ notables offer noble troops.
Notables survive conquest and hand out issues. Our spec has recruitment with
no notable layer at all.
Area: campaign. Priority: P0.

**40. Issues (notable quests)**
[WIKI] https://mountandblade.fandom.com/wiki/Quests_(Bannerlord)
Notables offer "issues" with requirements, time limits, and alternative
solutions: send a companion with the right skills + troops for N days, or do
it yourself. Each issue moves settlement stats (security, loyalty,
prosperity, hearths) on success/failure. ~20+ issue types (Army of Poachers,
Family Feud, Extortion by Deserters, Caravan Ambush, etc.). Our spec lists
quest flavors with no issue framework.
Area: campaign. Priority: P1.

**41. Crime rating**
[WIKI] via https://www.taleworlds.com/en/Games/Bannerlord/Blog/96 (dev blog)
Every kingdom tracks your crimes separately: smuggling, caravan raiding,
village raiding. Brackets: mild (minor disruption), moderate (barred from
that faction's settlements — sneak or bribe), severe (hunted; execution on
capture). Fines clear most records; vassals can spend influence; rulers are
above the law but anger their lords. Our spec has no crime system.
Area: campaign. Priority: P1.

**42. Companion assignments**
[WIKI] https://mountandblade.fandom.com/wiki/Companions_(Bannerlord)
Beyond party roles, companions can: resolve issues for you (leave for days
with troops), lead caravans, lead their own war parties (join your army free),
govern settlements, and do "diplomacy" (stationed in a town/castle, slowly
raising your relations with its owner and notables). Recruited from taverns
as "Wanderers" with suffix-based skill sets. Our spec has companions as party
roles only.
Area: clan. Priority: P1.

**43. Board games**
[WIKI] https://mountandblade.fandom.com/wiki/Board_Games
Six culture-specific board games (Tablut, MuTorere, Bagh-Chal, Konane, Seega,
Puluc) playable in every tavern for money. Cheap to build, big flavor win,
and the boss wants "hundreds of things to do." Our spec has nothing.
Area: character. Priority: P2.

**44. Civilian outfit**
[WIKI] https://mountandblade.fandom.com/wiki/Mount%26Blade_II:_Bannerlord (main page)
Separate "civilian" loadout worn inside settlements; combat gear is
restricted in towns. Matters for alley fights and sneaking. Our spec has no
equipment rules in towns.
Area: character. Priority: P2.

**45. Releasing lords / lord relations**
[WIKI] https://mountandblade.fandom.com/wiki/Skills_(Bannerlord)
Releasing captured lords after battle grants relation with them and Charm XP;
it's the primary honorable-path political tool and the main way to befriend
future vassals. Donating prisoners to allied dungeons gives influence
instead. Our spec has neither option after battle.
Area: diplomacy. Priority: P1.

**46. Encyclopedia**
[WIKI] https://mountandblade.fandom.com/wiki/Companions_(Bannerlord) (referenced)
In-game encyclopedia tracking every hero, settlement, clan, and troop type
with live data (locations, relations, skills). It's the game's UI backbone
for finding companions, marriage candidates, and targets. Our spec has no
encyclopedia.
Area: campaign. Priority: P2.

**47. Main quest (Dragon Banner)**
[WIKI] https://mountandblade.fandom.com/wiki/Mount%26Blade_II:_Bannerlord (storyline)
Campaign mode: assemble the Dragon Banner, then choose to restore or destroy
the Empire — the quest gates kingdom founding. Sandbox mode skips it. Our
spec says "main storyline (Bannerlord: assemble the Dragon Banner)" — one
line, no quest structure.
Area: campaign. Priority: P2.

### Explicitly out of scope

**48. Multiplayer (Skirmish / Captain / Team Deathmatch / Siege)**
[WIKI] https://mountandblade.fandom.com/wiki/Mount%26Blade_II:_Bannerlord (multiplayer section)
Class-based PvP modes with an armoury. Noted per boss direction: single-player
campaign is the product; multiplayer is not planned.
Area: n/a. Priority: skip.

---

## Priority summary

**P0 — core loop (build first):** loyalty system (#6), security system (#7),
influence gain/spend (#16), armies (#17), clan tiers (#18), notables (#39).

**P1 — important (build next):** character backgrounds (#1), aging/death
(#2), heir system (#3), town food (#8), construction projects (#9), militia
(#10), village hearths/production (#11), governors (#12), garrison economics
(#13), rebellion (#14), kingdom policies (#19), decision voting (#20),
persuasion (#21), barter (#22), workshop recipes (#26), caravan mechanics
(#27), prisoner capture (#31), prisoner conformity (#32), hideout assaults
(#33), siege engines (#34), wounded vs killed (#35), troop XP (#36), issues
(#40), crime rating (#41), companion assignments (#42), releasing lords (#45).

**P2 — nice-to-have:** pregnancy/children (#4), courtship (#5), sneaking
(#15), mercenary contracts (#23), kingdom founding (#24), defection details
(#25), trade rumors (#28), smithing (#29), ransom brokers (#30), execution
(#37), tournaments (#38), board games (#43), civilian outfit (#44),
encyclopedia (#46), main quest (#47).

---

## Sources

Direct wiki reads:
- https://mountandblade.fandom.com/wiki/Mount%26Blade_II:_Bannerlord (main)
- https://mountandblade.fandom.com/wiki/Combat_(Bannerlord) (prior session)
- https://mountandblade.fandom.com/wiki/Skills_(Bannerlord) (prior session)
- https://mountandblade.fandom.com/wiki/Factions_(Bannerlord) (prior session)
- https://mountandblade.fandom.com/wiki/Towns_(Bannerlord)
- https://mountandblade.fandom.com/wiki/Fief_Governance_(Bannerlord)
- https://mountandblade.fandom.com/wiki/Companions_(Bannerlord)
- https://mountandblade.fandom.com/wiki/Quests_(Bannerlord) (via search)
- https://mountandblade.fandom.com/wiki/Notables (via search)
- https://mountandblade.fandom.com/wiki/Workshop (via search)
- https://mountandblade.fandom.com/wiki/Army (via search)
- https://mountandblade.fandom.com/wiki/Tournaments_(Bannerlord) (via search)
- https://mountandblade.fandom.com/wiki/Board_Games (via search)
- https://mountandblade.fandom.com/wiki/Prisoners (via search)
- https://mountandblade.fandom.com/wiki/Ransom (via search)
- https://mountandblade.fandom.com/wiki/Bandit_Camp (via search)
- https://mountandblade.fandom.com/wiki/Calradic_Empire (minor factions, via search)
- https://mountandblade.fandom.com/wiki/Family_Feud (via search)
- https://mountandblade.fandom.com/wiki/Lady%27s_Knight_Out (via search)
- https://mountandblade.fandom.com/wiki/Raid_an_Enemy (via search)
- https://mountandblade.fandom.com/wiki/Gang_Leader_Needs_Weapons (via search)
- https://mountandblade.fandom.com/wiki/Gang_Leader%27s_Associates_Captured_by_Bounty_Hunters (via search)
- https://mountandblade.fandom.com/wiki/Fencing_Stolen_Goods_in_Town (via search)

Failed (403/404, not retried per instructions): Siege_(Bannerlord),
Villages_(Bannerlord), Castles_(Bannerlord), Kingdoms_(Bannerlord),
Clans_(Bannerlord).

Supplementary (not wiki, used for formulas/leads only):
- https://github.com/efoltyn/gta6/blob/HEAD/docs/plan/research-bannerlord-systems.md ([CODE] items)
- https://github.com/litauen/docs.bannerlordmodding.lt (official modding docs: kingdom policies)
- https://www.taleworlds.com/en/Games/Bannerlord/Blog/119 (clans/renown dev blog)
- https://www.taleworlds.com/en/Games/Bannerlord/Blog/96 (crime dev blog)
- https://www.taleworlds.com/en/Games/Bannerlord/Blog/53 (siege dev blog)
- https://mountandblade2bannerlord.wiki.fextralife.com/Character+Creation
- https://www.gamersheroes.com/game-guides/mount-blade-ii-bannerlord-culture-guide/
