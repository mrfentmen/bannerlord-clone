# MARCH_AND_WAR.md

Armies, marching, sieges, and war. Modeled on Bannerlord: marching takes time and money, and every war has a bill.

---

## 1. MARCHING

A march is not a teleport. It happens over real in-game days on real roads and terrain.

**Travel time depends on:**
- Distance along roads (from imported route data), or slower off-road
- Terrain: mountains, forest, swamp, snow, and desert slow the march. Highways and rail speed it.
- Party or army size: larger forces move slower
- Slowest unit: foot, horse, and any vehicles are limited to the slowest group unless split
- Load: heavy metal and food carts slow a column
- Weather and season
- Morale and fatigue

**A march costs, every day:**
- **Food** for every soldier and animal
- **Money** for wages
- **Metal** for ammunition on contact and for repairs
- Morale and health, if food or pay run short or the march is long

This is why distance matters. Lone Star's long reach is powerful but expensive. Mountain's defensive terrain punishes anyone who marches in.

## 2. SUPPLY

- Armies carry limited food, ammo, and medicine.
- Forces can resupply in friendly towns, buy from markets, or take supplies by raiding.
- Supply lines are real routes. A raider on the road behind an army cuts its resupply.
- Deep in enemy territory with no supply, food runs out, morale falls, and troops desert or starve.
- Long marches cause **attrition** (disease and exhaustion), stronger in bad terrain and bad weather, weaker with medics and good rations.

## 3. FORMING ARMIES

- A ruler gathers lords and their parties into an army at a rally point.
- Gathering costs **influence** (see section 8), like Bannerlord, and lords may refuse if they disagree or are unhappy.
- Armies move at the speed of the group and consume food and money together.
- An army leader picks a target: a town, a rival army, a region to raid, or a defensive post.
- Lords may leave an army if it runs out of food, if their own lands are threatened, or if the leader loses their trust.

## 4. RAIDING

- Small parties can raid villages for food, money, and metal, at the cost of the village's prosperity and the raider's reputation.
- Raiding cuts food supply into the target's towns, lowers the ruler's income, and raises unrest. It also raises bitterness that lasts for years.
- Raiders can be intercepted by patrols. Road safety (CAUSE_EFFECT.md) decides how easy it is.

## 5. BATTLES

Field battles, ambushes, and sieges use the Battle Layer (SPEC.md section 5). Before the fight:
- Troop quality, size, supply state, morale, terrain, and leaders all feed into the snapshot.
- A starved or unpaid army enters the fight weakened. A well-fed and paid smaller force can beat a bigger, neglected one.

After the fight:
- **Casualties and wounded:** wounded recover over time if medicine and rest are available.
- **Loot:** money, metal, food, and gear.
- **Captives:** enemy soldiers and rulers can be held, ransomed, released, or recruited.
- **Reputation:** how the player treats prisoners and villages changes how rulers and towns see them.

## 6. SIEGES

- Attackers surround a town. Time is the main weapon and the main cost.
- Both sides burn food and money every day of a siege. The defenders' food stock decides how long they hold.
- Disease grows in besieged towns (crowding, sanitation, lack of medicine).
- Attackers can starve the town, breach it with siege equipment (needs metal), or take it by assault in the Battle Layer.
- A town under siege also suffers loyalty and unrest problems, so it may open its gates to a besieger without a fight.
- Relief armies can arrive and break the siege.

## 7. WAR AND PEACE BETWEEN SIDES

- **War declaration:** a ruler or side's leader declares war for a reason: border dispute, revenge, grabbing food or metal, or defending an ally.
- **Political cost:** wars cost influence, and rulers who disagree may resist.
- **Peace:** negotiated after battles, sieges, or exhaustion. Terms can include money, gold, food, metal, towns, or prisoners.
- **Tribute and vassalage:** a beaten side can become a vassal and pay tribute.
- **Alliances and pacts:** sides can join wars together, with obligations and betrayal risks.
- **War weariness:** long wars drain treasury, food, and morale across a side, and can push rulers to sue for peace or rebel.

## 8. RENOWN AND INFLUENCE (Bannerlord parallels)

- **Renown:** earned by winning battles and completing deeds. Raises the party size limit and how seriously rulers take the player.
- **Influence:** political currency inside a side. Earned by loyal service, tribute, winning fights, and governing well. Spent on calling armies, voting on decisions, keeping lords loyal, and claiming towns.
- **Honor and reputation:** broken oaths and war crimes cost reputation and make rulers less willing to deal with the player.

## 9. FIEFS, VASSALS, AND LOYALTY

- Rulers hold towns and villages as fiefs and owe service to their leader.
- A leader can grant towns to loyal lords. Unhappy lords may refuse orders, quarrel with others, or defect with their holdings.
- The player, once they hold land, is a lord in a side and can be granted more, or take it by force.
- A side leader can be challenged, overthrown, or replaced by vote when trust collapses.

## 10. CAUSE AND EFFECT HOOKS

Every element above writes to shared state and the cause log. Examples:
- A march too long for its supplies starves troops, lowers morale, sparks desertion, and thins the garrison of a home town.
- A raid on a village cuts food, which leads to unrest in the town that relied on that village.
- A siege drains defender food, raises disease, drops loyalty, and can end with the gates opened from inside.
- A costly war empties the treasury, so wages fail, lords defect, and a side splits.

## 11. PLAYER-FACING CLARITY

- The map shows march time and cost to a target before the player commits.
- A supply meter shows days of food, money, and ammo remaining for each army.
- The Why panel explains desertions, defections, and lost sieges.
