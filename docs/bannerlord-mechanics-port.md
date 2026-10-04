# Bannerlord Mechanics Port — Feature Checklist

Source: Mount & Blade II: Bannerlord wiki (Fandom), TaleWorlds press materials,
community guides. This document ports Bannerlord's mechanics to our modern-America
setting. It is a design reference, not copied code.

Our game: browser-based, Babylon.js client, Go simulation, Python world data.
Setting: modern America, Ohio River Valley map. Bannerlord's 6 cultures become
10 ethnicities. Medieval weapons become modern melee + firearms.

---

## 1. Combat (melee)

Bannerlord's signature system. Port the feel, not the swords.

### 1.1 Directional attacks
- Four attack directions: overhead, left swing, right swing, thrust.
- Player chooses direction with mouse movement + click (or keys).
- Each weapon has distinct speed, reach, damage, and handling per direction.
- Unbalanced weapons (axes, bats, sledgehammers) chain faster follow-ups using
  swing momentum.

### 1.2 Directional blocking
- Manual block must match the incoming attack direction.
- Blocking in the wrong direction does not always mean death, but degrades the
  block tool faster (shield integrity / guard stamina).
- Shields are forgiving: as long as the shield is interposed, the blow is
  rebuffed. Blocking "down" covers the largest area against projectiles.
- Footwork matters: a correctly aimed block can still fail if the weapon is
  rotated away from the point of impact.

### 1.3 Shield bash / shove
- Lunge forward, bash the opponent: brief stun + knockback.
- Lowers the target's defense, creates breathing room.
- Highly requested Bannerlord feature; core to sword-and-board feel.

### 1.4 Attack chaining
- A completed swing can chain into a follow-up attack.
- Catches opponents off guard after a miss.
- Unbalanced weapons get faster chains from momentum.

### 1.5 Kicks, feints, chambers
- Kick: interrupts, creates space.
- Feint: start an attack in one direction, switch mid-swing.
- Chamber block (advanced): attack into an incoming attack to deflect.

### 1.6 Mounted and vehicle combat
- Bannerlord has deep horseback combat (couched lances, horse archery).
- Our port: vehicle combat. Drive-by shooting, ramming, mounted (motorcycle)
  melee. Same physics-driven damage model: speed + weapon weight + impact angle.

### 1.7 Damage model
- Physical: weapon weight distribution, swing speed, impact point, relative
  velocity of attacker and target.
- Consistent and predictable: the same input produces the same result.
- Armor reduces damage by location; headshots matter.

### Modern-America adaptation
- Melee weapons: baseball bats, machetes, crowbars, sledgehammers, knives,
  riot batons, fire axes.
- Shields → improvised: car doors, riot shields, trash-can lids, plywood.
- Firearms exist but are loud, ammo-scarce, and attract attention (see §5).
- Reference feel: saber-battle (per pax's order).

---

## 2. Ranged combat

- Bows → hunting bows, compound bows, crossbows.
- Throwing → molotovs, throwing knives, bricks.
- Firearms: pistols, shotguns, rifles. Loud. Ammo is a trade good (§4).
- Projectile blocking: shield-down covers the most area.
- Ranged troops need ammunition resupply; running dry in a long fight is real.

---

## 3. Character system

### 3.1 Attributes (6)
Ported directly; every 3 character levels grants 1 attribute point.

| Attribute | Governs | Modern flavor |
|-----------|---------|---------------|
| Vigor | Melee combat | Street fighting, physical intimidation |
| Control | Ranged | Firearms, throwing |
| Endurance | Movement, crafting | Driving, athletics, repair |
| Cunning | Recon, trickery | Scouting, tactics, roguery |
| Social | People | Charm, leadership, trade |
| Intelligence | Support | Medicine, engineering, steward |

### 3.2 Skills (18, three per attribute)
Skills level by use. Focus points (1 per level) accelerate chosen skills.
Attribute investment raises the skill cap.

- **Vigor:** One-Handed, Two-Handed, Polearm (→ melee archetypes)
- **Control:** Bow, Crossbow, Throwing (→ firearms, thrown)
- **Endurance:** Riding (→ Driving), Athletics, Smithing (→ Repair/Craft)
- **Cunning:** Scouting, Tactics, Roguery
- **Social:** Charm, Leadership, Trade
- **Intelligence:** Steward, Medicine, Engineering

### 3.3 Perks
Each skill unlocks perk choices at thresholds (25/50/75/100/125/175/200/275).
Perks are the build-defining choices. Examples from the real game:
- *Nomadic Traditions* (Riding 75): mounted troops +30% party speed
- *Forest Kin* (Scouting 75): +50% forest speed if party is mostly infantry
- *Day Traveller / Night Runner* (Scouting 25): ±time-of-day speed bonuses

Port: perks must be concrete, percentage-based, and situational. No dead perks.

### 3.4 Character creation
- Choose ethnicity (10 options, §6).
- Choose family background: sets base attributes + skill focus.
- Choose early life / adolescence / youth: each adds skill levels, focus points,
  attribute points. Urban vs rural background gates some options.

---

## 4. Campaign layer

### 4.1 Party
- Player + companions + troops. Party size scales with Steward/Leadership.
- Troops are recruited from settlements (§4.3), upgraded along troop trees.
- Morale, wages (daily), food consumption. Desertion if unpaid or starving.
- Wounded troops heal over time (Medicine speeds this).

### 4.2 Map movement
- Real-time movement on the Ohio River Valley map (487 settlements, 439 roads).
- Speed factors: terrain (forest/swamp slow), party size, mounted ratio,
  morale, wounded, overburdened (too much loot), night/day, weather.
- Forced march: faster, costs morale.
- Scouting reveals enemy parties and tracks.
- **Party speed system** (`clients/campaign/src/campaign/partySpeed.ts`,
  ported from Bannerlord's party-speed rules, modernized):
  - Spare riding horses mount footmen: one horse per footman is optimal.
  - **Perfect herd**: exactly one horse per footman gives a +5% bonus.
  - **Herd penalty**: more than 1.5 animals per troop slows the party.
  - **Horse breeds × terrain**: quarter (balanced), mustang (hills/desert),
    draft (forest/swamp), thoroughbred (fast on roads, bad in mud).
  - **Trucks**: +400 capacity each, fast on roads, struggle off-road; more
    than 1 per 8 troops causes congestion; unfueled trucks are dead weight.
  - **Horse-truck synergy**: trucks haul the heavy gear while horses keep the
    pace (+5%).
  - **Encumbrance**: cargo over carrying capacity brings the party to a crawl;
    capacity = troops×30 + mules×100 + horses×20 + trucks×400.
  - Wounded, prisoners, low morale, and night all slow the march.
  - The party panel shows the full Bannerlord-style speed breakdown.

### 4.3 Recruitment
- Recruit from settlements. Each ethnicity's territory favors its own units.
- Higher Charm → better deals. Garrisoned towns have more recruits.
- Troop trees: recruit → tier 2 → tier 3 ... (modern: street tough → enforcer →
  veteran; militia → rifleman → marksman, etc.)
- Upgrading costs money and requires battle XP.

### 4.4 Trade and economy
- 8 trade goods (see ECONOMY.md): grain, medicine, metal, fuel, arms,
  textiles, tools, lumber.
- Buy low in producing settlements, sell high where scarce. Prices fluctuate
  with supply, war, and season.
- Caravans: player-owned, generate passive income, can be raided.
- Workshops: buy in towns, produce goods for profit.

### 4.5 Diplomacy and factions
- 10 ethnicities are the factions. Relations, wars, alliances.
- Player can be mercenary, vassal, or independent warlord.
- Influence: earned in armies/battles, spent on kingdom decisions.
- Sieges → compound assaults (§7).

### 4.6 Quests
- Settlement quests: deliver goods, clear threats, escort.
- Keep them simple; Bannerlord's own quests are repetitive. Ours should be
  fewer but hand-tuned.

---

## 5. Battles

### 5.1 Command
- Player commands squads on the field: infantry, ranged, mounted, plus
  sergeant delegation (AI sub-commanders).
- Formations: line, shield wall (→ phalanx of riot shields), wedge, skirmish,
  split/merge units on the fly.
- Orders: advance, hold, charge, fall back, focus target.

### 5.2 Battle AI
- AI commanders use formations, flank, protect ranged, commit reserves.
- Must present a real challenge, not a death blob.

### 5.3 Battle size
- Config knob, never hardcoded. Templates scale from skirmish to army.
- Reinforcement waves for large battles.

### 5.4 Morale and routing
- Troops break and flee when morale collapses. Routing enemies can be cut down.
- Player's own troops routing loses the battle.

### 5.5 Post-battle
- Loot, prisoners (recruit or ransom), wounded, XP.
- Medicine skill increases survival rate of the wounded.

---

## 6. Ethnicities (port of Bannerlord's 6 cultures)

Bannerlord's real pattern, from game data: **each culture gets 2 pros + 1 con.**
Examples:
- *Empire:* 20% cheaper garrison wages + 25% more influence in armies, but
  village hearths grow 20% slower.
- *Aserai:* 30% cheaper caravans + no desert speed penalty, but 5% higher
  troop wages.
- *Sturgia:* 25% cheaper infantry recruits/upgrades + 20% slower army cohesion
  loss, but 20% worse relationship hits from kingdom decisions.
- *Vlandia:* 5% more battle renown + 15% mercenary income, but 20% more
  influence to recruit lords.
- *Battania:* 50% less forest speed penalty + 15% forest sight range, but 10%
  slower town construction.
- *Khuzait:* 10% cheaper mounted recruits/upgrades (+ a second pro), with a con.

Our 10 ethnicities follow the same 2-pro / 1-con structure:
Italian, Irish, Chinese, Korean, African, Jamaican, Mexican, Puerto Rican,
German, Russian. (Full definitions: `~/workspace/staging/agent5-ethnicities.json`.)

Each ethnicity also gets: starting territory on the Ohio map, a troop tree of
2–4 unit archetypes, and a flavor identity.

---

## 7. Compound assaults (port of sieges)

- Bannerlord sieges: build siege engines, bombard walls, assault with towers
  and rams, or starve the defenders.
- Our port: fortified compounds (warehouses, gated communities, police
  stations). Breach the perimeter (vehicles as rams, explosives from the
  Engineering skill), fight room to room.
- Defenders get the same tools in reverse. Starvation/siege camp is replaced
  by cutting utilities and supply.

---

## 8. Playable-path priority (pax's order)

del's campaign client builds in this order:
1. **Market** — working buy/sell with the 8 goods, price fluctuation.
2. **Recruitment** — hire from settlements, troop trees, upgrade.
3. **March** — move the party on the Ohio map, terrain speed, encounters.
4. **Melee combat** — directional attacks/blocks (§1), saber-battle feel.

Battle maps: ~10 reusable biome templates (plains, forest, urban, snow,
river crossing, desert, hills, swamp, coastal, industrial). Same template
every fight in that biome. (Spec: `~/workspace/staging/agent3-biome-templates.md`.)

---

## 9. Rules carried over

- **Reference, don't strip:** MIT/Apache/CC0 sources may be studied and
  reimplemented. No GPL/AGPL/unlicensed code. Never copy BannerlordCoop.
- **Real data:** settlement names, coordinates, and geography come from the
  world-data pipeline, never invented.
- **No number hides in code:** balance values live in config, not constants.
- **Battle size is a config knob.** Never hardcoded.
