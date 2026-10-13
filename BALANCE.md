# BALANCE.md

Initial balance numbers for the Bannerlord Clone. All values are starting
targets. Tune based on playtesting, not theory.

**Rule:** If a number feels wrong in playtesting, the number is wrong.
Change it. Document the change here.

---

## Economy

### Daily Costs (per unit)

| Item | Money/day | Food/day |
|---|---|---|
| Militia | 2 | 1 |
| Rifleman | 5 | 1.5 |
| Heavy Infantry | 8 | 2 |
| Marksman | 6 | 1.5 |
| Scout | 4 | 1 (horse: +2) |
| Medic | 6 | 1.5 |
| Engineer | 7 | 1.5 |

### Food Production

| Source | Food/day |
|---|---|
| Farm (per worker) | 3 |
| Village (small) | 50 |
| Village (large) | 120 |
| Town (with farms) | 300 |
| City (with imports) | 800 |

**Rule of thumb:** 1 food feeds 1 person for 1 day. Armies eat more when marching.

### Trade Margins

- **Normal profit:** 10-20% (buy low, sell high, after transport costs)
- **Good profit:** 30-50% (long distance, high risk)
- **Exceptional:** 100%+ (smuggling, war profiteering, monopolies)

If normal trade consistently yields >30%, prices are too volatile. If <5%,
trade isn't worth the risk.

---

## Combat

### Unit Stats (base)

| Unit | HP | Damage | Range | Speed | Cost |
|---|---|---|---|---|---|
| Militia | 50 | 8 | Melee | 4 | 100 |
| Rifleman | 80 | 15 | 100m | 4 | 300 |
| Heavy Infantry | 150 | 20 | Melee | 3 | 500 |
| Marksman | 60 | 25 | 200m | 4 | 400 |
| Scout | 70 | 10 | 50m | 8 | 250 |
| Medic | 60 | 5 | — | 4 | 350 |

### Damage Modifiers

- **High ground:** +25% ranged damage
- **Flanking:** +50% damage (attacking from side/rear)
- **Cover:** -30% damage taken
- **Night:** -40% accuracy for all
- **Rain:** -20% ranged accuracy, -10% movement

### Morale

- **Base morale:** 60 (militia), 70 (regular), 80 (elite)
- **Casualty impact:** -5 per 10% losses
- **Officer nearby:** +10
- **Winning:** +5 per minute
- **Losing:** -5 per minute
- **Rout at:** <20

---

## Progression

### XP Requirements

| Level | XP Needed | Cumulative |
|---|---|---|
| 1→2 | 100 | 100 |
| 2→3 | 250 | 350 |
| 3→4 | 500 | 850 |
| 4→5 | 1000 | 1850 |

### Skill Gain

- **By use:** ~1-3 XP per relevant action
- **By training:** 10 XP/day (costs money, requires trainer)
- **By battle:** 20-50 XP per battle (depending on intensity)

**Target:** A dedicated player reaches level 3 in a core skill after ~10 hours.

---

## Factions (Starting Resources)

| Faction | Money | Gold | Food Stock | Metal |
|---|---|---|---|---|
| Pacific Compact | 10000 | 500 | 2000 | 500 |
| Mountain Alliance | 3000 | 2000 | 1500 | 3000 |
| Great Lakes Union | 6000 | 200 | 10000 | 2000 |
| Southern Compact | 5000 | 100 | 6000 | 1000 |
| Lone Star Frontier | 8000 | 300 | 4000 | 1500 |
| Atlantic Corridor | 12000 | 1500 | 1000 | 800 |

**Tune so:** Each faction can survive 30 days without trade, but not 60.
Scarcity drives interaction.

---

## Tuning Process

1. **Playtest** the core loop (see PLAYTEST.md)
2. **Record** actual numbers (income, costs, time to milestones)
3. **Compare** to targets above
4. **Adjust** the numbers, not the systems
5. **Document** the change and why

**Never:** Change a system because a number feels off. Fix the number first.
