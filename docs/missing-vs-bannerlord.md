# What Bannerlord has that we are missing

**Date:** 2026-10-01
**Baseline:** the 24 design docs at the repo root, read directly
**Compare against:** Mount & Blade II: Bannerlord
**Status column is verified.** Every `New` and `Partial` below was checked against the named doc. Every `Missing` means no doc mentions it.

> **Read this first, it matters.** `docs/bannerlord-gap-analysis.md` also claims to answer this question, and it is **unreliable**. It was written against a baseline file, `bannerlord-mechanics-port.md`, that **never existed in this repository** — not on any branch, not in any commit, not in the baseline commit. The gap it opened up is why its COVERED column is wrong: it reports *"our spec has no security stat at all"* while `CAUSE_EFFECT.md` §2 defines `road_safety`, and *"no building system"* while `DESIGN.md` §5 lists six building types. **Its formulas and wiki citations are worth keeping. Its COVERED column and its priorities are not.** This file supersedes it for status and sequencing.

---

## Status key

| Status | Meaning |
|---|---|
| **Covered** | Specified in a root doc with enough detail to build from |
| **Partial** | Named, but too thin to build from |
| **New** | Named in `FEATURES.md`, nothing else |
| **Missing** | In Bannerlord, in no doc of ours |

---

## 1. The headline: what is genuinely missing

These are absent from every one of our 24 docs. This is the actual answer to the question.

### 1.1 The dynasty layer — we have none of it

| # | Bannerlord | Our state |
|---|---|---|
| 1.1 | **Clan as a first-class entity** — members, family tree, household | **Missing.** We have flat `rulers` with pairwise `relations` (`RULERS.md` §6). No clan, no household, no membership. |
| 1.2 | **Clan tiers gating what you may hold** — 0/50/150/350/900/2350/6150 renown | **Missing.** `MARCH_AND_WAR.md` §8 treats renown as a single party-size scalar. |
| 1.3 | **Clan-tier fief limits** | **Missing, and it breaks a promise.** `DESIGN.md` §2 step 7 says "More towns means more pressure" and `RISKS.md` §5 names overextension as a risk. **Nothing in our model can enforce it.** In Bannerlord you cannot hold everything because your tier forbids it; we have no such mechanism. |
| 1.4 | **Heirs — death is not game over** | **Missing.** No heir concept anywhere. Player death ends the campaign. |
| 1.5 | **Aging and natural death** — 84-day year, 4 seasons × 21 days | **Missing.** No calendar. `ERA.md` is unresolved so even the year length is open. |
| 1.6 | **Marriage, children, pregnancy, succession disputes** | **Partial.** `FEATURES.md` §9 lists "Marriage, romance, children, heirs" at **V2**; `RULERS.md` §6/§8 one line each. |
| 1.7 | **Courtship** as multi-stage persuasion | **Missing.** |
| 1.8 | **Execution** of captured lords — the nuclear political option | **Partial.** `MARCH_AND_WAR.md` §7 lists prisoner options including execute, no mechanics. |
| 1.9 | **Founding your own kingdom** — gates on tier 4, banner questline | **New.** `FEATURES.md` §9, V2. |

**Why this block is first.** Every other item here is a system. This one is the *reason* the game is long. Without clans there are no families, no inheritance, no dynastic politics, no vendettas — and no reason to keep playing past the third town.

### 1.2 Settlement defence and the second economies

| # | Bannerlord | Our state |
|---|---|---|
| 2.1 | **Militia** — spawns free daily (+2 base, +prosperity/1000 or +hearths/400, 2.5% daily retire), costs no upkeep, eats no food, only defends | **Missing.** The single reason a town is not trivially captured in Bannerlord. We have `garrison` and `SECURITY.md` has no militia. |
| 2.2 | **Rebellion** — below 25 loyalty, 25%/day chance the fief flips to a rebel clan; low-loyalty militia up to +200% strength | **Partial.** `DESIGN.md` §6 one line: "Bandits and raiders appear where law is weak." No flip mechanic, no rebel clan. |
| 2.3 | **Prisoner conformity** — a second recruitment economy with its own currency; need = (level+6)²−10, gain = 10 + 0.05×Leadership per hour; recruiting costs morale | **Missing.** `MARCH_AND_WAR.md` §5 covers capture and ransom only. |
| 2.4 | **Capture is blunt-only** — sharp weapons kill, so loadout is an economic choice | **Missing.** |
| 2.5 | **Hideout assaults** — night only, exactly 8 troops, kills persist between attempts, boss duel | **New.** `FEATURES.md` §7, V2. |
| 2.6 | **Wounded vs killed** — Medicine converts would-be deaths into wounded who recover over days | **Partial.** `CAUSE_EFFECT.md` §3 has attrition writing casualties; no distinct wounded state. |

**2.1 and 2.2 together are Bannerlord's anti-snowball pair.** We have neither, and both are arithmetic on fields we already track (`garrison`, `loyalty`). Cheapest high-value work in this document.

### 1.3 Production and crafting — our largest structural hole

| # | Bannerlord | Our state |
|---|---|---|
| 3.1 | **11 workshop types with fixed recipes** — Brewery (grain→beer), Smithy (iron→weapons), Tannery (hides→leather), Pottery, Weavery, Presses; capped at clan-tier+1 per town; duplicates in one town compete | **Missing.** `ECONOMY.md` §5 lists workshops as an income source, but **no production system exists**. No inputs→outputs→stock chain anywhere. |
| 3.2 | **Smithing** — smelting chain (charcoal, iron→steel→fine→thamaskene), weapon parts, crafting orders from towns, daily stamina | **New.** `FEATURES.md` §4, V2. |
| 3.3 | **Trade rumours** — trade XP comes from trading *against* rumours the game feeds you | **Missing.** |

**Our market is scarcity-priced with zero manufacturing.** `CAUSE_EFFECT.md` §3 Market reads scarcity and writes prices; nothing produces goods. Bannerlord's mid-game is making arms from raw materials; ours is buying them at a price that rises when they run out.

### 1.4 Notable-driven campaign and law

| # | Bannerlord | Our state |
|---|---|---|
| 4.1 | **Crime rating per kingdom** — smuggling / caravan raiding / village raiding, three brackets, barred from settlements, hunted, execution on capture | **Missing.** |
| 4.2 | **Companions posted to raise your relations** with a town's owner over time | **Partial.** `DESIGN.md` §4 companions can govern, run caravans, lead detachments. Not posted-as-diplomat. |
| 4.3 | **Releasing captured lords** — the primary honorable political tool, grants relation and Charm XP | **Missing.** |
| 4.4 | **Issue framework** — requirements, time limits, alternative solutions, each moving settlement stats | **Partial.** `QUESTS_AND_NOTABLES.md` §4 has 10 quest types with triggers and effects. That is a good framework — it just isn't wired to notables the way Bannerlord's is. |
| 4.5 | **Encyclopedia** with live data — the UI backbone for finding companions and targets | **Missing.** |
| 4.6 | **Board games** — six culture-specific games, playable everywhere, wager money | **Missing.** |

### 1.5 Siege, tactics, and the town interior

| # | Bannerlord | Our state |
|---|---|---|
| 5.1 | **Eight siege engines** with build order, √men × Engineering scaling, reserve, **defender counter-engines**, fire variants that destroy engines | **Partial.** `MARCH_AND_WAR.md` §6 lists four names, no mechanics. |
| 5.2 | **Sneaking into a barred town** — real formula against garrison level and renown | **Missing.** Pairs with 4.1: being barred needs somewhere to go. |
| 5.3 | **Civilian loadout inside settlements** | **Missing.** |
| 5.4 | **Tournaments** — brackets, random gear, betting, worsening odds, renown | **New.** `FEATURES.md` §5, V2. This is Bannerlord's primary early-game XP sink. |
| 5.5 | **Troop XP and branching upgrade trees** | **Partial.** `DESIGN.md` §4 says recruits upgrade along branches, costs and time unspecified. No XP source. |
| 5.6 | **Formation cohesion** stat draining with army size, auto-disband at zero | **Partial.** `MARCH_AND_WAR.md` has army supply and fatigue, not cohesion. |

### 1.6 Systems missing from every doc *and* from the old gap analysis

| # | What | Why it matters |
|---|---|---|
| 6.1 | **Auto-resolve battle** | Every campaign day risks a 12-minute fight at 300–1,000 units. Without it, players quit. Nothing in any doc assigns it. |
| 6.2 | **Party templates and refit** — Bannerlord's Stance / Heavy / Light / Horse, rebalanced by terrain and mission | Absent. `DESIGN.md` §4 has troop branches but no compositions. |
| 6.3 | **Party split and merge** | We can *assign* companions; we cannot detach a wing or consolidate war parties. `MARCH_AND_WAR.md` §6 has armies but not their formation. |
| 6.4 | **Naval trade** | `CAUSE_EFFECT.md` §10 chain 8 blockades a port. `ECONOMY.md` §8 assumes waterborne food exports. **No naval layer exists** — so either that chain is fiction or our economy is missing a transport mode. A real contradiction, not just an omission. |
| 6.5 | **Fog of war** | Almost certainly deliberate: `services/world-data` loads the whole country from Census data, so there is nothing to reveal. Listed so the decision is explicit rather than accidental. |

---

## 2. What Bannerlord has that we have already specced and deferred

Not missing — scheduled. Included so nobody rebuilds these.

| # | Bannerlord | Where we put it |
|---|---|---|
| 7.1 | Character creation with life-path backgrounds | `FEATURES.md` §2, V1. No design beyond the table row. |
| 7.2 | Loyalty with governance modifiers | `CAUSE_EFFECT.md` §3 — full system, reads and writes specified, 5-link chain in §4. **Buildable.** |
| 7.3 | Security from garrison strength and road risk | `CAUSE_EFFECT.md` §3 Security, writes `road_safety`. **Buildable.** |
| 7.4 | Settlement food, granaries, projects | `CAUSE_EFFECT.md` §2 per-town `food_stock`/`production`/`demand`; `DESIGN.md` §5 buildings. |
| 7.5 | Governors affecting fief outcomes | `DESIGN.md` §4; `MARCH_AND_WAR.md` §9. |
| 7.6 | Garrison wages and food draw | `ECONOMY.md` §6 upkeep; `CAUSE_EFFECT.md` upkeep system. |
| 7.7 | Influence: sources and sinks | `CAUSE_EFFECT.md` §9 Influence system exists. **Buildable.** |
| 7.8 | Kingdom policies voted by lords | `FEATURES.md` §9, V2. |
| 7.9 | Kingdom decision voting with influence costs | `FEATURES.md` §9, V2. |
| 7.10 | Persuasion checks on dialogue | `FEATURES.md` §8, V2. |
| 7.11 | Barter screen — fiefs, prisoners, gold, items | **Missing**, see 1.6 — no, see §3. |
| 7.12 | Mercenary contracts as the early on-ramp | `MARCH_AND_WAR.md` §7. |
| 7.13 | Defection — keep fiefs means war, release means clean break | `RULERS.md` §6. |
| 7.14 | Caravans with real risk | `ECONOMY.md` §3, §5. |
| 7.15 | Ransom brokers vs lord ransom offers | **Partial.** `ECONOMY.md` §5 lists ransom; no broker layer. |
| 7.16 | Main campaign goal | `QUESTS_AND_NOTABLES.md` §8 — correctly framed as simulation-backed milestones, not a script. |
| 7.17 | Mod support | `FEATURES.md` §11, out of scope. |

---

## 3. Two disagreements with the old gap analysis worth keeping

Its research was good. Two findings survive the baseline problem:

1. **"Our spec mentions loyalty once without any mechanics"** — wrong about the doc, but right about the *gap*. Our loyalty is qualitative: `CAUSE_EFFECT.md` §3 says it "reads unrest, promises kept and broken, tax_rate, recent security, outside offers" with no numbers. Bannerlord's is arithmetic: governor culture ±1, security ≥50 +1 / <50 −2, each supporting notable ±0.5, drift toward 50, ≥75 boosts tax and prosperity. **Converting our qualitative chain to those thresholds is the real task.**
2. **Village hearth tiers scale production** (0.5× / 1× / 1.5× by hearth count). We have villages with `yield` but no hearth tier.

Its formula for sneak chance and its conformity numbers are both good starting points for §1.

---

## 4. What is genuinely not worth copying

| Bannerlord feature | Our call |
|---|---|
| **Multiplayer** — Skirmish, Captain, TDM, Siege | Out. Single-player is the product. `FEATURES.md` §11 agrees. |
| **Dragon Banner main quest** | Not the shape. `QUESTS_AND_NOTABLES.md` §8's "milestones the simulation already supports" is better than a questline and matches `CAUSE_EFFECT.md` §7's ban on scripted outcomes. |
| **Named hero roster of 400+ with hand-authored stats** | No. `CONSTITUTION.md` §1.1 forbids hand-typed data, and `RULERS.md` generates from real data. Keep generating. |
| **Real historical geography** | No. `CONSTITUTION.md` §6 requires fictional people on real geography. We are correct here. |

---

## 5. Sequenced

Ordered by dependency, not by excitement. `CONSTITUTION.md` §7.1 says phases are gates; this is the input to that, not a replacement for `PHASES.md`.

**Tier 0 — verify what exists.** Phase 0 cannot be signed off and Phase 1 cannot be measured. `services/simulation` has 27 systems and zero tests; 10 of 12 seeds panic in world generation; the simulation is not reproducible from a seed. **None of the 60 items above can be validated until this closes.**

**Tier 1 — the keystone.** Clans (1.1–1.3). Unblocks heirs, marriage, succession, kingdom policy voting, and gives overextension its missing enforcement. Everything in §1.1 depends on it and nothing else does.

**Tier 2 — cheapest structural wins.** Militia and rebellion together (2.1, 2.2). Pure arithmetic on `garrison` and `loyalty`, and they deliver the anti-snowball behaviour Bannerlord gets from them.

**Tier 3 — close the largest hole.** Workshops and production (3.1). Our economy has no manufacturing. This is a structural gap, not a missing feature, and it compounds: every settlement system above depends on goods existing.

**Tier 4 — reachability.** Auto-resolve (6.1). Without it the battle layer's cost is paid every campaign day.

**Tier 5 — depth.** 2.3–2.6, 4.1–4.6, 5.1–5.6, 7.x. All real, all schedulable.

### Tier 0 detail — the three defects, as of 2026-10-01

1. **World generation panics on 10 of 12 seeds**, deterministically, in `worldgen.generateParties`. Seeds 2 and 8 complete.
2. **Some seeds fail on tick 0** — `factionai` and `rulerai` both stage an absolute write to the same side relation field. The engine's duplicate-write guard catches it, which is the mechanism that makes system order irrelevant. The two writes are for *different* pairings, 1–2 and 2–6, which suggests the guard's key is per-side where a relation is per-pair.
3. **Not reproducible from a seed.** Only `Party.DecisionScore` differs; towns, rulers, relations, and oaths are identical; the cause logs are byte-identical at 131,365 rows.

**Full write-ups with reproduction steps are in `agents/round2/PROMPT-2-simulation.md`.**

---

## 6. How to use this file

- **Do not rebuild anything in §2.** It is specced.
- **§1 is the work.** Ordered as §5.
- **§4 is settled.** Do not reopen multiplayer or the Dragon Banner.
- **This file supersedes `docs/bannerlord-gap-analysis.md` for status and sequencing.** That file keeps its formulas and sources. Its COVERED column and its P0/P1 priorities should not be used until it is re-based onto these 24 docs.
- **Nothing here is committed to a phase.** `PHASES.md` still gates the build order, and `TASKS.md` is still the owner's checklist.