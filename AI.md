# AI.md

How non-player rulers, armies, parties, and battle units decide what to do. Read CAUSE_EFFECT.md and RULERS.md first.

---

## 1. PRINCIPLES

- **AI plays by the same rules as the player.** No hidden resources, no free supplies, no rubber-banding. If the AI wins, it earned it through the same systems.
- **AI sees what it could know.** Information about other polities is noisy unless the AI has intelligence there (CAUSE_EFFECT.md espionage rules).
- **AI decisions are explainable.** Every meaningful decision logs its top reasons to the cause log, so the Why panel can show them.
- **Deterministic with a seed.** Given the same seed and inputs, the AI makes the same choices. This makes testing and bug reproduction possible.
- **AI stays decoupled.** It reads shared state and writes intentions. It never calls other systems directly (CONSTITUTION.md section 2).

## 2. AI LAYERS

| Layer | Who | Decides | Cadence |
|---|---|---|---|
| Strategic | Side leaders | War, peace, alliances, policies, target priorities | Every few in-game days |
| Ruler | Governors, lords, clan heads | Attack, raid, defend, trade, aid, defect, tax, build | Daily |
| Party | Armies, patrols, caravans, raiders | Route, target, resupply, retreat | Each tick or on events |
| Battle | Formations and units | Move, engage, cover, retreat | Real time in battle |

## 3. UTILITY SCORING

Decisions use **utility scoring**: each possible action is scored by weighted considerations, and the best (with a small seeded randomness) is chosen.

```
score(action) = sum(weight_i * consideration_i)
```

Considerations are values read from shared state, for example:
- Own food, money, fuel, metal, and troop strength
- Target's visible weakness (estimated with noise)
- Distance and march cost (MARCH_AND_WAR.md section 1)
- Relations, grievances, and debts
- Ambition match (RULERS.md section 3)
- Trait modifiers: high Valor raises attack scores, high Calculation raises patience and planning scores, high Mercy raises peace and aid scores, and so on
- War weariness and treasury health

Weights and traits live in data files, not code.

## 4. RULER AND STRATEGIC AI

**Ruler actions:** gather army, march on target, raid a village, send aid, request help, sue for peace, change side, adjust taxes, build a project, hold.

**Strategic (side leader) actions:** declare war, offer peace, propose alliance, grant a fief, call armies, set policy, challenge a rival.

Rules:
- Rulers cannot attack without enough supplies for the march (they check food, fuel, and money costs first).
- Rulers hold back when their own holdings are threatened.
- Rulers can be persuaded, bribed, or pressured through relations, gold, and reputation.
- A ruler with collapsed loyalty may defect, but only when the state supports it (RULERS.md section 6).
- Decisions never assume the player is the target. Rulers act on their own goals.

## 5. PARTY AND BATTLE AI

**Party AI:**
- Caravans choose profitable routes and avoid dangerous roads based on road safety.
- Patrols move to low-safety roads and respond to raids.
- Raiders target weak, valuable targets near their base.
- War parties follow their ruler's plan and resupply at friendly towns.

**Battle AI:**
- Formation-level goals: advance, hold, flank, fall back.
- Units seek cover, engage the nearest valid target in range, and keep formation offsets.
- Morale drives retreat and rout, using the same inputs as the player's units (COMBAT.md section 6).
- Vehicles follow simple rules: escort infantry, avoid anti-armor threats when possible, and withdraw when damaged.
- Difficulty scales AI accuracy and reaction time within limits, not resources.

## 6. INFORMATION AND NOISE

- The AI's view of a target is an estimate. Estimation error shrinks as intelligence investment rises.
- Old information decays. A scouted garrison count is stale after some days.
- AI can be fooled by false reports or by armies that move fast.
- This is what makes surprise attacks and bluffs possible.

## 7. EXPLAINABILITY

Every decision above a small significance threshold writes to the cause log:

```
event: ruler_decision, actor, action, target, top_reasons[3], scores, tick
```

Example the player can read: "Lord Hale raided Millbrook because it had 4 days of food, his Valor is high, and he needed grain for his own army."

## 8. PERFORMANCE

- Stagger AI updates across ticks so not every ruler decides on the same tick.
- Most strategic thinking runs at low frequency. Battle AI runs per frame with a budget per formation, not per unit.
- Set a per-tick AI time budget. If it is exceeded, defer low-priority decisions rather than skipping them.

## 9. TESTING

- Headless runs must show AI rulers producing all the emergent chains in CAUSE_EFFECT.md sections 5 and 10 without the player.
- Balance checks confirm that no side dominates across many seeds (see TESTING_AND_BALANCE.md).
- Regression logs compare AI decisions between builds for the same seed.

## 10. DIFFICULTY

Difficulty settings change:
- Player-facing penalties (injury lethality, prices, ransom demands)
- AI battle skill within a band
- How aggressive AI rulers are in scoring

Difficulty never gives the AI free resources or hides information from the player.
