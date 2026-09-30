# CAUSE_EFFECT.md

The heart of the game. One change should ripple into many others, and the player should be able to trace how.

---

## 1. THE RULE

Every system is an independent rule that **reads** some shared fields and **writes** other shared fields. Systems never call each other. They only interact through shared state, which is what makes chains emerge instead of being scripted.

A system is a function of the form: given the current values of these fields for this entity, produce new values for these other fields.

## 2. CORE SHARED FIELDS (per town)

| Field | Range | Meaning |
|---|---|---|
| population | int | living people |
| workers | int | working-age, healthy people |
| food_stock | float | stored food, in person-days |
| food_production | float | per tick, driven by workers and farmland |
| food_demand | float | per tick, driven by population |
| medicine_stock | float | doses available |
| sanitation | 0-1 | water, waste, and shelter quality |
| infected | 0-1 | share of population currently infected |
| crowding | 0-1 | density relative to housing, raised by refugees |
| unrest | 0-1 | anger and fear |
| loyalty | 0-1 | attachment to current holder |
| prosperity | 0-1 | commerce and wealth |
| tax_rate | 0-1 | set by holder |
| garrison | int | armed troops present |
| garrison_conduct | 0-1 | discipline, low means abuse of residents |
| road_safety | 0-1 | risk on connecting routes |
| treasury | float | money |

Party entities have their own: food, ammo, medicine, morale, wages_owed, and party_size.

## 3. THE SYSTEMS

Each reads and writes only the fields listed.

- **Food system.** Reads workers, food_production, food_demand, food_stock, road_safety. Writes food_stock. A negative balance drains stock. Stock at zero starts starvation.
- **Starvation system.** Reads food_stock, population. Writes population (deaths), workers, unrest, sanitation (weakened people, worse hygiene).
- **Disease system.** Reads infected, crowding, sanitation, medicine_stock, population. Writes infected, population (deaths), workers (sick workers cannot work), medicine_stock (consumed by treatment).
- **Labor system.** Reads population, infected, starvation state. Writes workers. Fewer workers means lower food_production and lower prosperity.
- **Market system.** Reads scarcity of each good, road_safety, prosperity. Writes prices. Scarcity raises prices and can raise unrest if wages do not follow.
- **Unrest system.** Reads food shortage, tax_rate, garrison_conduct, deaths recently, prices, prosperity. Writes unrest.
- **Loyalty system.** Reads unrest, promises kept and broken, tax_rate, recent security, outside offers. Writes loyalty.
- **Council vote system.** Reads loyalty over time, unrest, outside faction offers. Writes holder (ownership) when a vote passes. Never reads "the game wants the player to lose".
- **Migration system.** Reads unrest, food_stock, infected, and neighbor conditions. Writes population and crowding in both towns. Fleeing people carry infection.
- **Security system.** Reads garrison, garrison_conduct, road patrols, raider strength. Writes road_safety. Low road_safety spawns raider pressure and blocks caravans.
- **Logistics system.** Reads caravan routes, road_safety, distances. Writes goods in transit and delivery times. A robbed caravan writes nothing into the destination stocks.
- **Military upkeep system.** Reads wages_owed, food, ammo. Writes morale and desertion. Underfed or unpaid troops leave, which lowers garrison, which lowers road_safety.
- **Faction AI system.** Reads visible state of neighbors (with noise unless spies have reached them). Writes intentions: attack, trade, ally, wait. Uses the same rules as the player.

## 4. THE CAUSE LOG (required)

Every meaningful write records **why**. When a system changes a tracked field beyond a small threshold, it appends a row:

```
event_id, tick, entity, field, old, new, system, caused_by[]   // caused_by = list of prior event_ids or field snapshots
```

This is what lets the player press "why?" on a starving town and see the chain:

```
Town voted you out
  <- loyalty below 0.2 for 12 days
     <- unrest at 0.8
        <- food_stock at zero for 9 days
           <- food_production down 40%
              <- workers down 35%
                 <- outbreak, no medicine
                    <- caravan robbed on Route 9
                       <- road_safety 0.2, no patrols
```

If a feature changes state without writing to the cause log, it is incomplete per CONSTITUTION.md section 2.

## 5. EXAMPLE CHAINS THAT MUST EMERGE (test cases)

Use these as Phase 1 exit tests. None may be scripted.

1. **Famine to vote.** Raise taxes, merchants stockpile less, prices rise, food_stock falls, unrest rises, loyalty falls, council votes the holder out.
2. **Plague.** Refugees arrive, crowding rises, sanitation falls, infection spreads, no medicine, workers die, harvest fails, famine follows.
3. **Road rot.** Holder pulls garrison to fight elsewhere, road_safety falls, caravans get robbed, medicine and food stop arriving, both chains above begin.
4. **Wage spiral.** Party cannot pay troops, morale falls, desertion, garrison shrinks, town security drops, raiders grow.
5. **Recovery.** Player delivers medicine and food, infection falls, workers return, food_production recovers, unrest drops, loyalty climbs back. Good outcomes must emerge the same way bad ones do.

## 6. BALANCE AND TUNING

- All rate constants live in one config file with comments explaining each number.
- Every constant is reviewed against a headless simulation run, not guessed.
- A tuned system should let a careful player stabilize a struggling town and let a careless player collapse a healthy one, both taking real in-game weeks, not seconds.

## 7. ANTI-PATTERNS

- Scripted events that force an outcome ("plague hits on day 30").
- Hidden coupling where one system calls another.
- Random rolls that override the state (a vote that ignores loyalty).
- Numbers the player cannot inspect. If it affects the game, it should be visible somewhere in the UI, even if behind a detail panel.

---

## 8. ADDED FIELDS: RESOURCES, MARCHING, AND POLITICS

These extend section 2 for the full Bannerlord-style scope. See ECONOMY.md, MARCH_AND_WAR.md, and RULERS.md.

Town and ruler fields:

| Field | Meaning |
|---|---|
| money | everyday currency (the earlier `treasury`) |
| gold | hard reserve, does not lose value |
| metal | industrial stock, consumed by ammo, repair, gear, walls |
| food_stock | as before, also tradable |
| influence | ruler's political currency inside a side |
| renown | ruler's standing, raises party size limits |

Party and army fields: food, money_wages_owed, metal_ammo, medicine, morale, fatigue, position, destination, speed.

Ruler fields: traits (valor, mercy, honor, generosity, calculation), ambitions, loyalty_to_leader, relations map.

## 9. ADDED SYSTEMS

- **March system.** Reads party or army position, destination, terrain, size, fatigue, weather. Writes position, fatigue, and per-day draws on food, money, and metal.
- **Supply system.** Reads army stocks, connected friendly towns, route safety. Writes resupply amounts and starvation flags.
- **Attrition system.** Reads fatigue, sanitation on the route, medicine stock, food state. Writes casualties from exhaustion and disease during marches and sieges.
- **Siege system.** Reads attacker and defender food, disease state, garrison, siege equipment (metal). Writes food, disease, loyalty, and the gate-opening check.
- **Ruler decision system.** Reads a ruler's visible world state, traits, ambitions, and relations. Writes intended actions (attack, raid, aid, peace, defect).
- **Relation system.** Reads events between rulers (gifts, battles, betrayals, marriages). Writes relation scores.
- **Currency system.** Reads deficits and reserves. Writes the gold-to-money rate and inflation pressure.
- **Influence system.** Reads service, victories, governance quality, and broken oaths. Writes influence and reputation.

## 10. ADDED CHAINS THAT MUST EMERGE (test cases)

6. **The overlong march.** An army marches deep into a distant region, supply runs short, morale falls, desertion begins, the home garrison thins, a rival raids the home region.
7. **The gold drain.** A ruler covers wages with gold during a long war, reserves empty, mercenaries leave, a lord defects with his troops.
8. **The blockade.** A port is blockaded, food imports stop, prices spike, unrest rises, the governor is voted out or overthrown.
9. **The broken oath.** A leader executes a captured ruler, allied rulers lose trust, relations drop, a coalition forms against the leader.
10. **The siege that opened itself.** A siege drains food and spreads disease, loyalty falls, the town opens its gates before the assault.
