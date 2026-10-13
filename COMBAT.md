# COMBAT.md

Detailed design for the Battle Layer. SPEC.md section 5 covers rendering and structure. This file covers how fighting works. Status: depends on the era decision (ERA.md), and assumes firearms and vehicles are normal for the period.

---

## 1. GOALS

- Feels like Bannerlord: you fight in the field as one soldier while commanding formations.
- Numbers, supply, morale, terrain, and troop quality decide outcomes more than raw headcount.
- Everything that happens writes back to the shared state and cause log (CAUSE_EFFECT.md section 4).

## 2. BATTLE TYPES

| Type | Description | Tier |
|---|---|---|
| Field battle | Two armies meet on open ground | V1 |
| Ambush | One side surprises the other, often on a road or in a town | V1 |
| Siege assault | Attack on a fortified town, base, or compound | V1 (basic) |
| Convoy fight | Attack or defense of a moving caravan | V1 |
| Compound infiltration | Small stealth-and-fight mission into a bandit or enemy site | V2 |
| Arena and duel | Sport fights for prizes | V2 |

## 3. THE PLAYER IN BATTLE

- Third and first person camera, cover-based movement.
- The player controls one character and commands formations with simple orders.
- Core actions: move, sprint, crouch, take cover, aim, fire, reload, throw, melee, mount a vehicle, use a medkit, issue an order.
- Dying or being knocked out ends the player's active role but not the battle. What happens next follows the difficulty setting (CHARACTER.md section 7).

## 4. WEAPONS

Weapons are data entries by class and tier:

```
weapons: id, class, name (generic), tier, damage, penetration, range, rate_of_fire,
         spread, recoil, reload_time, magazine, ammo_type, weight, metal_cost, unlock_year
```

**Classes:** melee, sidearm, bolt-action rifle, semi-auto rifle, assault rifle, submachine gun, machine gun, launcher, mortar, grenade, mounted gun, breaching charge.

- Melee stays in the game for close quarters, compounds, and desperate moments. Melee damage scales with Vigor and Close Combat.
- Ammo comes from the party's supply and is tied to metal in the economy (ECONOMY.md section 4). Running out matters.
- Ammo types can include standard, armor-piercing, and tracer, unlocked by tier.

## 5. ARMOR AND DAMAGE

- Armor is a rating per hit zone (head, torso, limbs). Body armor and helmets appear by tier.
- Damage combines weapon damage, weapon penetration, armor rating, and range.
- Hit zones matter: head and torso hits are more lethal, limb hits cause injuries.
- Injuries: lost health, bleeding, and lasting wounds that reduce troop or character effectiveness. Treated by medics (Medicine skill and medicine stock).
- No realistic instructions or overly graphic gore. Hit feedback is readable and restrained.

## 6. SUPPRESSION AND MORALE

- Incoming fire lowers a unit's effectiveness (**suppression**), making them less accurate and more likely to take cover or fall back.
- Morale drops from casualties, suppression, leaders falling, low supply, unpaid wages, and being outnumbered locally. Morale rises from wins, leaders nearby, and rest.
- Low morale causes rout. Routing troops run, may surrender, and spread panic (SPEC.md section 5.2).
- Troops who are hungry or unpaid enter battle with lowered morale (MARCH_AND_WAR.md section 5).

## 7. FORMATIONS AND ORDERS

Formation commands (Bannerlord's F1 to F3 style):
- Hold position, advance, charge, fall back, follow me
- **Spread** or **tighten**
- **Take cover**, **suppress target**, **flank left or right**
- **Fire at will** or **hold fire**

Formation shapes: line, column, wedge, staggered line, cover posts.

Units are grouped into fire teams and squads. Orders apply at formation level, and individual units keep small offsets. Formation-level pathfinding only (SPEC.md section 5.2).

## 8. TERRAIN AND COVER

- Battle maps come from real campaign terrain (SPEC.md section 6).
- Cover objects (walls, cars, rubble, sandbags, terrain folds) give protection bonuses.
- Terrain effects: mountains and forest slow movement and reduce vehicle use, open ground favors ranged fire.
- Weather and time of day change visibility (V2).

## 9. VEHICLES IN BATTLE

See VEHICLES_AND_FUEL.md for the full design. In combat:
- The player can drive, ride as a passenger, or fire from a vehicle.
- V1 supports one or two vehicle types (for example a light utility vehicle and an armored carrier).
- Vehicles need fuel, take damage by zone, and can be disabled or destroyed.
- Vehicle counts in a battle are small to protect performance (SPEC.md section 10).

## 10. SIEGE COMBAT

- Attackers use artillery or mortars, armored breachers, demolition charges, and infantry assaults.
- Defenders use cover, fortifications, mounted guns, and barricades.
- Fortification state (walls, gates, bunkers) is part of the snapshot (SPEC.md section 5.3) and damage persists back to the town after the fight.

## 11. AI IN BATTLE

Battle AI follows AI.md section 5: formation-level goals, simple flocking, cover use, retreat logic, and morale-based decisions. It must be explainable in aftermath reports ("the left flank broke because morale fell after the sergeant died and supply was low").

## 12. AFTERMATH

Writes back to state:
- Casualties, wounded, and prisoners
- Ammo and fuel used, vehicles lost or captured
- Loot and salvage
- Town damage (walls, buildings, infrastructure)
- Reputation, influence, and relation changes
- Cause log entries linking the result to prior causes

## 13. PERFORMANCE TARGETS

Per SPEC.md section 5.1 and 10: 300 units at 60 fps and 1,000 units at 30 fps on mid-range hardware, with a small number of vehicles included in the test. Bigger battles are a later target.

## 14. CONTROLS

- Keyboard and mouse first, rebindable.
- Gamepad support later.
- Camera: shoulder, over-the-shoulder aim, and a tactical overhead view for issuing orders.

## 15. UNIT TYPES IN DETAIL

### Infantry
- **Militia:** Cheap, numerous, fragile. Good for garrisons, bad for open battle.
- **Riflemen:** Standard line infantry. Reliable, versatile.
- **Heavy Infantry:** Armored, slow, deadly in melee. Breaks lines.
- **Marksmen:** Long-range precision. Fragile up close.
- **Medics:** Heal wounded. No combat value, immense strategic value.
- **Engineers:** Build, repair, demolish. Essential for sieges.

### Cavalry
- **Scouts:** Fast, light, excellent vision. Die if caught.
- **Mounted Rifles:** Frontier specialty. Shoot from horseback, vanish.
- **Heavy Cavalry:** Shock troops. Devastating charge, vulnerable if stopped.

### Support
- **Supply Trucks:** Carry ammo, food, medicine. Unarmed. Protect them.
- **Artillery:** Long-range firepower. Slow, fragile, game-changing.
- **Command:** Officers boost nearby troops. Kill them and units rout.

## 16. MORALE SYSTEM

Units don't fight to the last man. They break.

**Morale factors:**
- Casualties (friends dying hurts)
- Leadership (officers nearby help)
- Winning/losing (momentum matters)
- Supply (hungry troops don't fight)
- Terrain (defending home ground helps)
- Reputation (elite units hold longer)

**Breakpoints:**
- **Steady (>70):** Fight normally
- **Shaken (40-70):** Reduced accuracy, may waver
- **Breaking (20-40):** Likely to rout if pressed
- **Routed (<20):** Flee. Can be rallied by officers.

## 17. TERRAIN EFFECTS

- **High ground:** +25% ranged accuracy, +15% melee defense
- **Forest:** -30% visibility, +20% ambush chance
- **Urban:** -50% vehicle speed, +30% infantry defense
- **Mud:** -40% movement, vehicles bogged down
- **Night:** -40% accuracy, +50% stealth

## 18. FORMATIONS

- **Line:** Balanced. Good all-around.
- **Column:** Fast movement. Vulnerable to flanking.
- **Wedge:** Breakthrough. Devastating charge, weak flanks.
- **Square:** Anti-cavalry. Immobile but solid.
- **Skirmish:** Spread out. Hard to hit, hard to command.
- **Shield Wall:** Maximum defense. Very slow.

## 19. COMMAND & CONTROL

Orders take time to propagate. Distance, terrain, and chaos cause delays.

- **Instant:** Units within shouting distance of player character
- **Fast (5s):** Via runners, within line of sight
- **Slow (15s):** Via radio, anywhere on battlefield
- **Delayed (30s+):** If command structure disrupted

This is why officers matter. Kill the officers, and the enemy army becomes
a mob.
