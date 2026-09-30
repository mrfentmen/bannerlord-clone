# INFRASTRUCTURE_AND_MEDIA.md

Two modern-era systems that plug into the shared-state model: infrastructure (power, water, roads, comms) and media (news and public opinion). Both are things Bannerlord does not have, and both create new cause-and-effect chains. Read CAUSE_EFFECT.md first.

---

## 1. INFRASTRUCTURE

### 1.1 Types

| Type | Attached to | Effects when healthy | Effects when failing |
|---|---|---|---|
| Power grid and generators | Towns | Runs clinics, factories, radio, water pumps | Blackouts, clinics fail, production drops |
| Water and sewage | Towns | Sanitation stays high | Sanitation falls, disease spreads |
| Roads | Routes | Faster travel, lower fuel use | Slower marches, higher fuel and breakdown cost |
| Rail | Routes | Cheap bulk transport | Supply lines break |
| Bridges and dams | Routes and regions | Connect regions, water and power | Detours, floods, blackouts |
| Refineries and depots | Towns | Fuel supply (VEHICLES_AND_FUEL.md) | Fuel shortage |
| Communications | Towns and routes | Faster news, better army coordination | Slow orders, delayed news |
| Hospitals and clinics | Towns | Better outbreak response and wound recovery | Higher death rates |

### 1.2 Data model

Each item is an entity with:

```
infrastructure: id, type, location_id, condition (0-1), capacity, tier, upkeep_cost, unlock_year
```

- `condition` falls with age, neglect, war damage, sabotage, and disasters.
- `capacity` scales with tier and condition.
- `tier` follows ERA.md (a 1990 clinic outperforms a 1950 one).

### 1.3 Systems

Independent, reading and writing shared fields only:

- **Infrastructure decay system:** reads upkeep spending and time. Writes condition.
- **Power system:** reads generator fuel, grid condition, and demand. Writes power availability per town.
- **Water system:** reads water infrastructure condition and power availability. Writes sanitation.
- **Communications system:** reads tower and line condition, power, and era tier. Writes information delay and army coordination modifiers.
- **Repair system:** reads money, metal, Engineering skill, and repair orders. Writes condition.

The Disease, Food, Market, March, and Siege systems then read these writes without calling the infrastructure systems directly.

### 1.4 Example chains (test cases)

1. **Blackout to outbreak.** Fuel runs out, generators stop, water pumps stop, sanitation falls, disease spreads, clinic without power cannot treat, deaths climb.
2. **Bridge cut.** A key bridge is destroyed, supply routes detour, fuel and food arrive late, prices rise, unrest climbs.
3. **Comms down.** A radio tower is captured, orders to armies arrive late, coordination fails, a battle is lost.
4. **Neglect.** A ruler ignores upkeep for years, roads decay, caravans slow, prosperity falls, loyalty drops.

### 1.5 Player actions

- Fund repairs and upgrades (town projects)
- Sabotage rival infrastructure (covert action, costs reputation if caught)
- Protect key infrastructure with garrisons
- Rebuild after war

## 2. MEDIA AND PUBLIC OPINION

### 2.1 Channels by era

| Era tier | Channels |
|---|---|
| 1 (1950s) | Newspapers, radio |
| 2 (1960s to 1970s) | Newspapers, radio, television |
| 3 (1980s) | Same, with wider TV reach |
| 4 (1990s to 2000s) | Same, plus internet and mobile |

### 2.2 How media works

Media is a shared-state system. Each town has a **media reach** per channel, and each ruler and faction has **media influence** built from ownership, funding, or relationships.

Key fields:
- `information_trust` (0-1): how much people believe official sources in a town
- `media_reach`: share of the population reached, per channel
- `propaganda_pressure`: current level of official messaging
- `censorship`: strength of restrictions

### 2.3 Systems

- **Media system:** reads channel reach, power availability, censorship, and recent events (victories, famines, atrocities, deaths). Writes the flow of news into each town's `information_trust` and an opinion signal.
- **Opinion effect on loyalty:** the Loyalty system reads the opinion signal along with hunger, taxes, and security. It does not call the Media system.
- **Trust decay rule:** propaganda raises loyalty in the short term, but when reality contradicts it (a claimed food surplus while the town starves), trust falls, and later propaganda becomes less effective. This emerges from the fields, not from a script.

### 2.4 Player and ruler actions

- **Run a newspaper, radio station, or broadcast** (buildings and town projects)
- **Propaganda campaigns:** cost money, raise loyalty short-term, risk trust loss if contradicted
- **Censorship:** lowers unrest from bad news short-term, lowers trust and raises resentment over time
- **Counter-propaganda:** attack a rival's information trust
- **Honest reporting:** slower to raise loyalty, but keeps trust high

### 2.5 Example chains (test cases)

1. **Broken promises.** A ruler promises food on the radio, none arrives, trust collapses, unrest rises even after supplies improve.
2. **Wartime morale.** A victory broadcast raises nearby loyalty and recruit flow, a defeat with censorship keeps rumors spreading, trust erodes.
3. **Blackout of news.** Power fails, media reach falls, rumors replace news, unrest becomes hard to predict.
4. **Rival smear.** Counter-propaganda lowers a rival's trust, a town votes them out earlier than food alone would cause.

## 3. RULES

- Neither system scripts events. Both only read and write fields.
- All media effects appear in the cause log (CAUSE_EFFECT.md section 4).
- Media content flavor text (headlines, broadcasts) can be LLM-generated from real state per SPEC.md section 8.
- Headlines and broadcasts must never name real living people or real parties (CONSTITUTION.md section 6).

## 4. V1 SCOPE

- Infrastructure: power, water, roads, and clinics only.
- Media: newspaper and radio only, with a basic trust field feeding the Loyalty system.
- TV, internet, sabotage, and propaganda campaigns come in V2.
