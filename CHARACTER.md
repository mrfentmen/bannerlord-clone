# CHARACTER.md

The player character and how every character (player, companions, rulers) is built. Modeled on Bannerlord's attributes, focus, skills, and perks. All numbers live in the balance config (CONSTITUTION.md section 1).

---

## 1. CHARACTER CREATION

Creation is a short sequence of background choices, like Bannerlord's childhood, youth, and adulthood questions. Each choice adjusts starting skills, money, gear, and relations.

1. **Origin:** hometown region and side leaning (from FACTIONS.md), family trade (farm, factory, shop, military family, drifter).
2. **Youth:** how you grew up (street life, trade school, service, family business, rural work).
3. **Adulthood:** what you did before the game starts (soldier, mechanic, medic, courier, smuggler, clerk).
4. **Appearance and name:** era-appropriate looks (V2), name, insignia (FEATURES.md section 2).
5. **Start choice:** side, state, and starting role (FACTIONS.md section 2).

The result is a starting skill set, a small amount of money and gear, and a few initial relations. The choices are visible so the player can see why they start where they do.

## 2. ATTRIBUTES AND FOCUS

Six attributes, as in Bannerlord:

| Attribute | Governs |
|---|---|
| Vigor | Melee power, carrying, stamina |
| Control | Aim, weapon handling, recoil control |
| Endurance | Health, fatigue, driving long distances |
| Cunning | Scouting, streetcraft, stealth |
| Social | Charm, leadership, trade |
| Intelligence | Tactics, medicine, engineering, logistics |

- **Attribute points** are gained at level milestones.
- **Focus points** are spent on individual skills and speed up learning in them.
- Each skill's growth is limited by its governing attribute.

## 3. SKILLS

18 skills, grouped as in FEATURES.md section 2:

| Skill | Attribute | Effect (examples) |
|---|---|---|
| Rifles | Control | Accuracy and damage with rifles |
| Sidearms | Control | Handgun accuracy, draw speed |
| Automatic Weapons | Control | Recoil control, burst accuracy |
| Heavy Weapons | Vigor | Launchers, mounted guns |
| Close Combat | Vigor | Melee damage and blocking |
| Explosives | Intelligence | Grenade accuracy, breaching charge effect |
| Driving | Endurance | Vehicle speed, fuel efficiency, breakdown chance |
| Athletics | Endurance | Speed on foot, fatigue |
| Scouting | Cunning | Map vision, tracking, ambush spotting |
| Tactics | Intelligence | Army morale, battle commands, reduced march attrition |
| Leadership | Social | Party size, morale, influence gain |
| Logistics | Intelligence | Food and fuel efficiency, spoilage, supply |
| Medicine | Intelligence | Wound recovery, outbreak response |
| Engineering | Intelligence | Siege gear, repairs, town projects |
| Gunsmithing | Intelligence | Weapon repair, crafting, ammo efficiency |
| Charm | Social | Relations, recruiting, persuasion |
| Trade | Social | Better prices, caravan profit |
| Streetcraft | Cunning | Bribes, smuggling, gang dealings |

**Leveling by use:** firing a rifle raises Rifles, driving raises Driving, trading raises Trade. XP gains follow diminishing returns so repeated trivial actions do not level a skill fast.

## 4. PERKS

- Perks unlock at skill milestones (for example 25, 50, 75, 100, and so on), and each milestone offers **two choices**, as in Bannerlord.
- Perks change how systems respond, for example:
  - Logistics: reduced food spoilage on long marches, or reduced fuel use in convoys.
  - Medicine: faster wound recovery, or a lower infection spread rate in towns where the character is present.
  - Leadership: bigger party size, or cheaper army gathering.
  - Driving: higher convoy speed, or lower breakdown chance.
- Perks are data entries that modify shared fields. They never call other systems.

## 5. TRAITS

Character traits use the same five as rulers: Valor, Mercy, Honor, Generosity, Calculation (RULERS.md section 4). Player traits move up and down based on actual choices (executing captives lowers Mercy, keeping oaths raises Honor). Traits affect how rulers and towns respond, so choices carry weight.

## 6. LEVEL, RENOWN, AND INFLUENCE

- **Level** comes from total skill XP and grants attribute and focus points.
- **Renown** raises party size limits and how seriously rulers take the player (MARCH_AND_WAR.md section 8).
- **Influence** is political currency inside a side.

## 7. HEALTH, INJURY, AND DEATH

- Health regenerates slowly and faster with rest and medicine.
- Serious injuries can leave lasting penalties (for example a bad leg lowering Athletics) until treated. Better medicine tier and clinics reduce this.
- Death is possible in battle. The player can continue as a designated heir if one exists (RULERS.md section 8). If not, the game ends with a legacy summary.
- Difficulty settings control whether the player can be killed in battle or is only knocked out and captured.

## 8. COMPANIONS

- Companions are full characters using this same system.
- Each has a background, skills, traits, and a personal goal. Found in bars, diners, camps, and hospitals.
- Companions fill the four party roles (FEATURES.md section 3): Quartermaster, Scout, Surgeon, Engineer.
- A companion can be sent to govern a town, run a caravan, or lead a detachment. Their skills decide how well.
- Companions have opinions. Poor treatment, unpaid wages, or choices that clash with their traits can make them leave.

## 9. AGING AND FAMILY

- Characters age with the campaign clock. Skills grow early and can slowly decline in old age (Vigor and Endurance first).
- Marriage, children, and heirs are V2 (FEATURES.md section 9). Children inherit a mix of traits and a starting skill bias from parents and upbringing.

## 10. DATA MODEL

```
characters: id, name, birth_year, sex, faction_id, role, attributes jsonb, focus jsonb,
            skills jsonb, perks jsonb, traits jsonb, health jsonb, injuries jsonb,
            renown, influence, relations jsonb, party_id, home_town_id
```

Skill, perk, and attribute definitions live in data files, not code, so balance changes never need a rebuild.
