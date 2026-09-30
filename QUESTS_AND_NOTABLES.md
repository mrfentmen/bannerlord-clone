# QUESTS_AND_NOTABLES.md

Notables and quests, modeled on Bannerlord but generated from shared world state so they fit the cause-and-effect premise. Read CAUSE_EFFECT.md first.

---

## 1. THE PRINCIPLE

**Quests are outputs of world state, not scripted plots.** If a village is starving, the village headman asks for food. If a road is unsafe, a merchant asks for an escort. When a quest ends, it writes back to state, so success and failure ripple through the simulation.

## 2. NOTABLES

Notables are non-ruler people who hold local power. They give quests, supply recruits, and shape loyalty, like Bannerlord's notables.

| Type | Where | Gives |
|---|---|---|
| Mayor or town official | Cities and towns | Town business, governance quests |
| Foreman or union boss | Factories, docks | Labor issues, strike and supply quests |
| Merchant | Towns | Trade contracts, caravan escorts |
| Shopkeeper or bar owner | Towns | Rumors, small errands, companion leads |
| Farm owner or headman | Villages | Food and protection quests, recruits |
| Doctor or clinic head | Towns | Medicine deliveries, outbreak quests |
| Gang boss | Cities | Streetcraft quests, extortion, gang disputes |
| Militia captain | Towns and villages | Recruits, patrol quests |

Each notable has:
- Name, occupation, home settlement
- **Power** (how much they sway their town's loyalty and prosperity)
- **Relation** with the player and with rulers
- Needs and grievances (read from the town's state)
- A recruit pool (some notables provide troops at a price or favor)

Notables are generated from real local data (industries, population) per SPEC.md section 8.

## 3. QUEST DATA MODEL

```
quest_templates: id, name, giver_type, trigger_conditions[], objectives[], rewards[],
                 failure_effects[], success_effects[], time_limit, cooldown, scope
quests: id, template_id, giver_id, location_id, state, started_tick, deadline_tick, log[]
```

- `trigger_conditions` read shared fields (for example `food_stock < X days` in a village bound to a town).
- `success_effects` and `failure_effects` are writes to shared fields (loyalty, food_stock, road_safety, relations, prices).
- Every quest step and result writes a cause log row, so the Why panel can show quest chains.

## 4. STARTER QUEST TYPES (V1, about ten)

1. **Food delivery:** a starving village or town asks for food. Trigger: low food days. Success: food_stock, loyalty, and notable relation rise.
2. **Medicine run:** clinic asks for medicine during an outbreak. Trigger: infection above a threshold and low medicine. Success: infection falls, town survives.
3. **Escort caravan:** merchant asks for protection. Trigger: low road safety on a route. Success: goods arrive, prices normalize. Failure: goods lost, shortage.
4. **Clear the road:** bandits on a route. Trigger: low road safety. Success: road_safety rises.
5. **Bounty:** a ruler or notable pays to remove a bandit leader.
6. **Protect the harvest:** village asks for defenders during harvest. Success: food production preserved.
7. **Recover stolen goods:** shipment stolen by raiders. Success: goods returned, relation gain.
8. **Rescue prisoner:** a notable's relative is captured. Success: relation and loyalty gain.
9. **Repair infrastructure:** bridge, generator, or radio tower down. Trigger: low infrastructure condition. Success: infrastructure and prosperity recover (INFRASTRUCTURE_AND_MEDIA.md).
10. **Gang dispute:** two gangs threaten a district. Options include mediating, taking a side, or crushing one. Consequences write to unrest, security, and relations.

More types come in V2 (FEATURES.md section 8).

## 5. QUEST FLOW

- Notables offer quests when trigger conditions hold. A quest has a time limit and a clear reward and risk.
- The player accepts, tracks progress in a quest log, and completes objectives.
- The player may **ignore** a quest. Ignoring has consequences (a starving village keeps starving, and the headman's opinion drops).
- Some quests can be completed in more than one way (bribe, fight, negotiate), with different effects on state.

## 6. REWARDS AND CONSEQUENCES

- Rewards: money, gold, items, recruits, relations, influence, renown.
- Consequences are always real state changes. A failed escort truly loses goods and moves prices. A cleared road truly changes road safety.
- Reward size scales with the real value of what is at stake (a large food shortage pays more).

## 7. QUEST LIMITS

- Each notable holds at most one or two open quests.
- A cooldown prevents the same quest from repeating instantly.
- Quest count is capped per region to keep the world readable.
- Quests never spawn out of thin air. If the trigger state is not true, the quest cannot appear.

## 8. MAIN CAMPAIGN GOAL (V2)

An optional long goal, like Bannerlord's main quest, such as unifying a region, holding a certain number of cities, or becoming a side leader. It is presented as a set of milestones the simulation already supports, not a scripted plot.

## 9. PLAYER-FACING CLARITY

- Quest log with objectives, time left, and the world condition behind the request (for example "Millbrook has 3 days of food left").
- After completion, the Why panel shows what changed and why.
