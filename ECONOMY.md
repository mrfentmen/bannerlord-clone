# ECONOMY.md

Resources, income, upkeep, and trade. Follows the Bannerlord model: everything costs something every day, and running out of any one resource hurts the others. Numbers here are starting design values. All real constants live in the balance config file per CONSTITUTION.md section 1.

---

## 1. THE FOUR CORE RESOURCES

| Resource | What it is | Main uses | Main sources |
|---|---|---|---|
| **Money** | Everyday currency | Wages, recruiting, buying goods, building upkeep, bribes | Taxes, trade, workshops, tolls, loot, ransom |
| **Gold** | Hard reserve, stable in value | Buying mercenaries, foreign deals, large purchases, buying rulers' loyalty, ransoms | Mines, hard-currency exports, vaults, tribute |
| **Food** | Keeps people and armies alive | Feeding towns, parties, and armies. Also a tradable good | Farms, villages, imports, raiding, stockpiles |
| **Metal** | Industrial base | Weapons, armor, ammunition, repairs, walls, siege equipment, vehicles | Mines, factories, scrap, imports, loot |

Supporting resource: **Medicine**, from CAUSE_EFFECT.md. Consumed by outbreaks and by wounded troops. A **Fuel** resource can be added later if vehicles are included, but it is not part of V1.

## 2. HOW MONEY AND GOLD DIFFER

- **Money** is spent daily. It can lose value if a ruler spends far more than they collect (deficit), which raises prices and can raise unrest.
- **Gold** does not lose value. It is slow to earn and mostly used for big moves.
- Gold and money convert at a **market rate** that changes with each side's supply, deficits, and war status. Converting has a cost.
- Wages can be paid in money. If money runs out, a ruler can burn gold to cover wages, but gold reserves drain fast.
- Some purchases require gold: hiring elite mercenary companies, foreign arms shipments, buying a rival lord's defection, ransoming captured rulers.

## 3. FOOD

- Food is produced by villages and farmland around a town, and imported by caravan.
- Every person eats each day. Towns, parties, and armies all have a food stock and a daily draw.
- Food spoils over time and faster on long marches without storage.
- Food is also a weapon: burn fields, raid villages, cut caravans, blockade cities.
- Great Lakes and Southern sides can export food for money and gold. Pacific and Atlantic sides must import it.

## 4. METAL

- Metal is used up by fighting and maintenance: ammunition, gear repair, weapons for new recruits, wall repair, siege equipment.
- Troop equipment quality depends on metal supply. A ruler with no metal fields poorly equipped troops.
- Metal comes from mines (Mountain, parts of Great Lakes and Lone Star) and factories. Scrap from wrecks and ruins is a small, slow source.
- Ammunition is limited by metal, which is how the mixed combat model in DESIGN.md section 1 is enforced by the economy, not by an arbitrary rule.

## 5. INCOME SOURCES (Bannerlord parallels)

- **Taxes** on towns and villages, scaled by prosperity and tax rate. Too high harms production and loyalty (see CAUSE_EFFECT.md).
- **Trade:** buy goods where cheap, sell where dear. Prices respond to real supply and demand.
- **Caravans:** hired or owned convoys that earn steady profit, but can be robbed.
- **Workshops:** buildings in towns that convert inputs into goods for profit (a metal shop, a food processor, a medical supply maker).
- **Tolls:** charges on roads, bridges, and ports the ruler controls.
- **Loot and ransom:** taken from battles, raids, and captured rulers.
- **Tribute:** paid by defeated or vassal rulers.
- **Contracts:** mercenary pay from other rulers.

## 6. EXPENSES

- **Wages:** paid daily to every soldier. Unpaid troops lose morale, then desert.
- **Party and garrison upkeep:** food and money each day.
- **Building upkeep:** each clinic, granary, barracks, wall, and market costs money.
- **Equipment and repair:** metal and money.
- **Bribes and gifts:** money and gold, used in diplomacy and to keep rulers loyal.
- **Interest and debt:** loans are possible, especially in the Atlantic Corridor. Debt has interest and can be called in by a rival.

## 7. PRICES AND MARKETS

- Each town has a market for each good. Price reacts to local stock relative to demand.
- Prices are also affected by road safety, war, outbreaks, and prosperity. This means a war two towns over can change what a loaf of bread costs in your capital.
- The player can see price history per town to plan trade routes.
- Market rules are pure simulation outputs. No fixed prices except the starting values seeded from data.

## 8. SIDE ECONOMIC PROFILES

See FACTIONS.md section 3 for ratings. In short:
- Pacific and Atlantic earn a lot of money but depend on imported food.
- Mountain has gold and metal but few people and little food.
- Great Lakes is fed and industrial but low on gold.
- Southern is fed and populous but has a small tax base.
- Lone Star has broad output but heavy distance costs.

## 9. THE ECONOMIC WEB (cause and effect)

Examples of how the economy connects to everything else, each of which must emerge from systems rather than scripts:
- Raise taxes, merchants hold less stock, prices rise, food supply weakens, unrest climbs.
- Metal runs out, repairs stop, troop quality drops, garrisons weaken, road safety falls, caravans stop arriving.
- Gold reserve empties, mercenary contracts end, a lord's loyalty fades, he defects with his troops.
- Blockade a port, food imports stop, prices spike, unrest rises, the ruler is voted out.
- Overspend on an army, wages missed, desertion, a weak border, an invasion.

## 10. PLAYER-FACING CLARITY

- A daily ledger shows every income and expense line by source.
- Hovering any resource shows its net change per day and how many days it lasts.
- Warnings appear before a resource hits zero, not after.
- The Why panel (CAUSE_EFFECT.md section 4) can explain any shortage.
