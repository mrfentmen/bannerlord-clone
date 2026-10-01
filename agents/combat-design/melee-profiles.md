# Melee Combat Profiles — data-driven spec for the Babylon.js battle scene

**Owner:** A7 (design only). **Implementer:** milo's lane (battle/crowd). **Date:** 2026-09-30.
**Built from scratch** against patterns in `agents/oss-research/action-melee.md` (saber-battle, combat-proto) and `mount-blade.md` (OpenRA/sparta determinism). No code was read, copied, or stripped from any listed project.
**Ships alongside** `COMBAT.md` sections 4-6, `TESTING_AND_BALANCE.md` sections 1-5, `CONSTITUTION.md` section 1.2 (no balance number lives in code), section 2 (systems do not call each other).

**Marking convention.** `[P]` marks a **PLACEHOLDER** value: plausible, internally consistent, and *not* playtested. It exists so the lane can build and so CI has numbers to balance against. Every `[P]` must be replaced by a tuned value and the change logged in `CHANGELOG.md` with the test that motivated it. Unmarked numbers are structural: they are consequences of the model, not taste, and changing them changes the design rather than the tuning.

---

## 1. SCOPE AND CONTRACT

1. Melee resolves in the **simulation**, not the client. The client plays animation and feedback; it never decides a hit (server-authoritative, the lesson from `kcd2-multiplayer_reworked`). Rendering does not change.
2. The **sim is headless** (TESTING_AND_BALANCE.md section 1). Every rule below is a pure function of `(snapshot, tick)` with no Babylon, no mesh, no wall clock.
3. All profile and AI numbers live in `services/simulation/config/combat.toml` and `ai.toml` (already reserved in TESTING_AND_BALANCE.md section 5). The client receives a derived JSON view for animation lookup only, keyed by `moveId`.
4. **Tick rate is 60 Hz** for melee. A `TICK_MS = 16.667`. Timing fields are authored in ms and quantised once at load: `ticks = round(ms * 60 / 1000)`. Lint rejects any profile whose quantisation error exceeds 1 tick.
5. Fighter hit points are **100**. Stagger/poise pools and stamina pools are separate from hit points and do not regenerate into them.

### 1.1 Shared constants

```toml
[melee]
tick_hz = 60                 # Range 30-120. 60 keeps ms timings on round tick counts.
stamina_max = 100.0          # Range 60-150. Roughly 5 baton swings, or ~15 knifes.
stamina_regen_per_s = 22.0   # Range 10-40. Below ~15 a fight ends in exhaustion, not death.
stamina_regen_delay_ms = 700 # Range 400-1200. Stops attack-attack-regenerate from being free.
guard_arc_deg = 160.0        # Range 120-200. A guard is a shield arc, so flanking beats turtling.
parry_window_ms = 300.0      # Range 200-400. Study notes: guard age under 0.3 s is a parry.
chip_ratio = 0.12            # Range 0.05-0.25. 12% chip means ~6 blocked baton hits before a kill.
guard_recharge_per_s = 18.0  # Range 10-30. Slower than a health regen; guard loss must be felt.
guard_reaim_ms = 250.0       # Range 150-400. Minimum hold after re-raising, blocks parry spam.
guard_break_stagger_ms = 900 # Range 600-1400. Long enough that a broken guard is a real punish.
parry_attacker_stagger = 45  # Range 20-80. A whiffed parry is the defender's best offence.
parry_stamina_gain = 18.0    # Range 10-30. Rewarding the risk is what makes a parry a choice.
```

---

## 2. PROFILE SCHEMA

A **profile** is a weapon class. A **move** is one attack instance inside a profile's chain table. An attack always resolves as `(profile, moveId)`; `moveId` is what animation, sfx, and the AI table key on.

### 2.1 Fields (per profile, overridden per move where the chain needs it)

| Field | Unit | Meaning |
|---|---|---|
| `damage` | int hp | Base damage at torso, before zone multiplier and armour |
| `range` | m | Max reach of the contact arc, measured from the attacker's `reachOrigin` |
| `minRangeM` | m | Inner dead zone; hits closer than this are ignored so point-blank mash is not a free trade |
| `arcDegrees` | deg | Full width of the hit cone, centred on facing. Half-angle = `arcDegrees / 2` |
| `startupMs` | int ms | Telegraph: guard-press (or move-start) to first contact tick |
| `activeMs` | int ms | **Contact window.** One arc query runs per tick inside it |
| `recoveryMs` | int ms | Locked-out tail; the move cannot be cancelled unless a cancel window says so |
| `staminaCost` | int | Spent in full at startup. Never refunded, including on a whiff |
| `staggerDealt` | int poise | Added to the defender's poise pool on a clean hit |
| `guardBreak` | int | Subtracted from the defender's `guardHealth` on a **block** (not on a parry) |
| `pushForce` | N·s | Impulse along the swing direction, applied after damage so corpses do not slide |
| `objectDamage` | int hp | Damage to doors, barricades, and shields (COMBAT.md section 10). `0` = useless against the world |
| `reachOrigin` | enum | `hand`, `torso`, `shield` — which body point the arc is measured from |
| `moves` | table | The chain: ordered moves, each with the 8 timing fields above |

### 2.2 Contact test (pure arc math)

One function, no side effects, called once per tick during `activeMs`:

1. Transform the defender's capsule into the attacker's local space: `fwd` along the attacker's facing at the `reachOrigin` point, `right` and `up` completing the basis.
2. Reject if `depth < minRangeM` or `depth > range`.
3. Reject if the horizontal angle between `fwd` and the capsule's closest point exceeds `arcDegrees / 2`. This is the whole of the arc rule — no sweep polygon, no collision mesh.
4. Otherwise hit. The **closest point on the capsule** gives the impact height, which maps to a hit zone: `y > 1.52` head, `0.85 < y` torso, else limb. Zone multipliers `1.6 / 1.0 / 0.75` (COMBAT.md section 5 — head and torso are the lethal zones).
5. Add the defender's id to the attack instance's `hitSet`, keyed `(attackInstanceId, defenderId)` and stored in the snapshot so a replay reproduces the same single hits. A defender can be hit **once per attack instance**, never once per tick. This is the anti-multihit rule, and it is what lets a slow swing catch a moving target without shredding them.

---

## 3. RESOLUTION ORDER

Fixed, and written down because a different order produces a different game. Per hit, in this order:

1. **Contact** — the arc test in 2.2. No contact, no resolution.
2. **Zone and armour** — `damage * zoneMult * (1 - armourRating)`, floored at 1.
3. **Guard test** — is the defender guarding, and is the impact inside `guard_arc_deg` of their facing?
   - **Parry** if guarding, inside the arc, and `guardAgeMs <= parry_window_ms` (300). Negate all damage, apply `parry_attacker_stagger` to the *attacker*, transfer `parry_stamina_gain` stamina to the defender.
   - **Block** if guarding and inside the arc but past the window. Apply chip only: `max(1, round(damage * chip_ratio))`, ignoring zone and armour, because a blocked hit did not find armour. Subtract `guardBreak` from `guardHealth`. If `guardHealth <= 0`, the guard shatters and the defender takes `guard_break_stagger_ms` of vulnerability during which no parry is possible.
   - **Clean hit** otherwise — no guard, or impact landed outside the guard arc, i.e. **flanked**.
4. **Stagger** — clean hit adds `staggerDealt` to the defender's poise. Above their poise cap it interrupts the current move.
5. **Push** — apply `pushForce` last, to whatever is still standing.

A parry that arrives during the victim's own `startupMs` is legal and is the intended counter to a telegraphed swing. A parry that arrives during the attacker's `activeMs` is not, because the swing has already committed; that is what `activeMs` means.

---

## 4. PARRY AND GUARD TIMING

`guardAgeMs` is ticks since the guard was raised, and it is the only state the parry test reads. It resets to 0 when the guard is **released and re-raised**, never while held — so holding guard forever is not a parry generator.

| `guardAgeMs` | Result on an in-arc hit |
|---|---|
| 0 – 300 | **Parry.** No damage, attacker staggered, defender refunded stamina |
| 301 – ∞ (guard intact) | **Block.** `chip_ratio` damage, `guardBreak` to `guardHealth` |
| any (guard shattered) | **Clean hit**, plus the break stagger still running |

- **A parry is a bet, not a stance.** 300 ms is roughly one and a half decision cycles for an AI on a 200 ms decision interval, so the AI defender's parry rate is a direct read on its decision interval. Tune one, watch the other.
- **Re-raising is priced.** Releasing guard starts a `guard_reaim_ms` hold before a new parry is possible. Without it, stutter-tapping guard is strictly better than holding it and the defender role has no counterplay.
- **Chip is what makes guard stamina matter.** At `chip_ratio = 0.12`, a 100 hp fighter dies to roughly nine blocked baton hits. Long enough that blocking reads as a valid tactic, short enough that it is not a winning one.

---

## 5. COMBO AND INPUT BUFFERING

**The buffer.** One slot per fighter, `{ moveId, pressedAtTick }`. A press always writes the slot; it does not execute. The slot is consumed at the first legal cancel point of the current move, or discarded when its age exceeds `buffer_ttl_ms = 220`. Overwriting the slot with a newer press is correct and expected — that is the whole point of a buffer.

**Cancel classes.** Each move declares zero or more cancel windows, expressed as `[openAtMs, closeAtMs]` from the move's own start:

| Class | What it opens | Allowed on |
|---|---|---|
| `chain` | The next link of the combo | Light and heavy links only |
| `step` | A directional backstep / sidestep | Any move, from `startupMs` end |
| `guard` | Raising the guard | Only after `recoveryMs` ends, or from a `guard` cancel window |

A move with no `chain` window is a **commitment**: the fighter is locked in through `recoveryMs` and takes a free punish. Finisher links always have no `chain` window. That single rule is what makes combo length a decision for the player rather than an animation they sit through.

**Example chain — baton** (all `[P]` except the shape), each as `startup/active/recovery`:
`light_1` 260/90/340, `chain` 290–520, `guard` 520–600, no `step` before 350. `light_2` 240/80/300, `chain` 270–470, `guard` 470–540.
`light_3` (finisher) 380/110/520, **no** `chain`, `step` 490–520, `guard` 520–640.

Read it as: a 3-hit chain takes 690 + 620 + 1010 = 2320 ms of commitment for three chances to hit, and the buffer lets a player who presses early during `light_1` still get `light_2` out of it. Stamina 12 per link means the chain costs 36 of 100 — it is affordable once, a mistake twice.

**Whiff discipline.** A move that entered `activeMs` with an empty candidate set is flagged `whiffed` for the rest of its `recoveryMs`. Stagger and guard-break punishes scale up against a whiffed target; a whiff costs the defender nothing extra to punish, which is already implied by `recoveryMs > startupMs` on every profile here.

---

## 6. CONCRETE PROFILES (PLACEHOLDERS)

Six loadouts for a modern-America setting. Every value is `[P]` — this set is a starting point for a balance sweep, not a tuned answer. What is *not* marked is structure: the range formulas, the relative ordering of startup, and the commitment ratios.

### 6.1 Baton — **`[P]` PLACEHOLDER** — baseline sidearm. Highest risk: `startupMs` (drives all parry feel)
| Field | Value | Rationale |
|---|---|---|
| `damage` | 18 | ~1/6 of a 100 hp fighter per clean torso hit; the head is the only reliably fatal zone |
| `range` | 1.85 m | 660 mm baton + ~0.75 m arm extension + ~0.4 m target body radius |
| `minRangeM` | 0.35 | Someone inside your guard should still be inside your swing |
| `arcDegrees` | 95 | A diagonal swing covers a front quarter; past ~120 it starts catching people behind you |
| `startupMs` | 260 | Readable by a 200 ms-decision defender, fast enough to punish a guard raised 300 ms ago |
| `activeMs` | 90 | ~5 ticks at 60 Hz; long enough to catch a retreating target, short enough that the hit set stays one hit |
| `recoveryMs` | 340 | 1.3x startup, so a whiffed swing is a punishable commitment |
| `staminaCost` | 12 | ~5 links before exhaustion, matching `stamina_regen_per_s = 22` |
| `staggerDealt` | 22 | Interrupts a guard raise; will not stun a fighter with 100 poise |
| `guardBreak` | 8 | A baton does not dent a rifle butt — guard break stays a heavy-weapon reward |
| `pushForce` | 120 | Shoves ~0.35 m on loose footing, under the threshold for a fall |
| `objectDamage` | 25 | Enough to splinter a plywood door, not a steel one |
| `reachOrigin` | `hand` | Reach is the arm, not the body |

### 6.2 Knife — **`[P]` PLACEHOLDER** — fastest commit, worst answer to being flanked. Highest risk: `damage`
| Field | Value | Rationale |
|---|---|---|
| `damage` | 26 | Highest per-hit lethality here, so it must be easy to make miss — that is the trade |
| `range` | 1.15 m | Close-quarters work; 1.8 m would be a fantasy knife |
| `minRangeM` | 0.20 | Tighter than a swing because the hand is the weapon |
| `arcDegrees` | 45 | A narrow line, so a defender who steps off-line is safe. This is the design |
| `startupMs` | 180 | Fastest in the set; the reward for closing inside someone else's range |
| `activeMs` | 60 | ~4 ticks; the shortest contact window, so it whiffs most often |
| `recoveryMs` | 280 | 1.55x startup; missing a knife is worse than missing a baton |
| `staminaCost` | 9 | Cheap enough to spam, and the arc punishes spamming anyway |
| `staggerDealt` | 14 | Low: a knife is about damage, not about interrupting |
| `guardBreak` | 6 | A blade skates off a guard, it does not break one |
| `pushForce` | 40 | A wrist motion moves a body very little |
| `objectDamage` | 15 | Slashes a strap or a tyre, not a barricade |
| `reachOrigin` | `hand` | |

### 6.3 Rifle butt — **`[P]` PLACEHOLDER** — the heavy commitment. Highest risk: `recoveryMs` (may be too long to be fun)
| Field | Value | Rationale |
|---|---|---|
| `damage` | 34 | Roughly one fifth of a fighter; two clean hits and a block is a fight won |
| `range` | 1.95 m | 800 mm stock + shoulder reach; the longest single-handed reach in the set |
| `minRangeM` | 0.40 | You have to actually swing the thing |
| `arcDegrees` | 70 | A committed downward stock arc, not a sweep |
| `startupMs` | 420 | A 0.7 s telegraph anyone can read and punish; the cost of the damage |
| `activeMs` | 110 | ~7 ticks; a slow arc catches a target that has started to back off |
| `recoveryMs` | 520 | 1.24x startup; whiffing is a near-death sentence, which is correct |
| `staminaCost` | 20 | A quarter of the pool for one swing |
| `staggerDealt` | 55 | Above a standard poise cap, so a clean connect is a combo starter |
| `guardBreak` | 18 | A hardwood-and-steel stock genuinely damages a forearm guard |
| `pushForce` | 380 | Enough to put a light fighter on the ground |
| `objectDamage` | 70 | A butt strike is a real door-opening technique |
| `reachOrigin` | `torso` | The stock is swung with the whole body, so reach starts at the shoulder |

### 6.4 Breaching ram — **`[P]` PLACEHOLDER** — a breaching tool, not a weapon. Highest risk: `objectDamage`
| Field | Value | Rationale |
|---|---|---|
| `damage` | 12 | Near-useless against a fighter by intent; the number exists so the swing is not literally zero |
| `range` | 2.60 m | The ram is 1.5 m and is carried at arm's length in both hands |
| `minRangeM` | 0.60 | You cannot swing a ram into your own chest |
| `arcDegrees` | 60 | A narrow forward shove; it is not a cleave |
| `startupMs` | 700 | Two steps of wind-up, the slowest in the set — it telegraphs itself |
| `activeMs` | 140 | The widest contact window here, because the mass arrives over time |
| `recoveryMs` | 820 | The longest; the fighter is wide open and everyone knows it |
| `staminaCost` | 34 | A third of the pool. It should cost too much to spam |
| `staggerDealt` | 90 | Max poise by definition — this is a knockdown tool |
| `guardBreak` | 55 | A shield or a forearm does not survive this |
| `pushForce` | 900 | Largest in the set by a factor of ~2.4; it is a battering impact |
| `objectDamage` | 260 | The real payload: a single ram strike should open a domestic door, a soft barricade, or a light vehicle door |
| `reachOrigin` | `torso` | Carried two-handed at chest height |

### 6.5 Fists — **`[P]` PLACEHOLDER** — the floor of the model, and the tuning baseline
| Field | Value | Rationale |
|---|---|---|
| `damage` | 9 | ~1/11 of a fighter; 11 clean hits, so fists lose a pure race against every weapon |
| `range` | 0.85 m | Arm plus the target's own chest radius |
| `minRangeM` | 0.0 | Fists have no dead zone, which is their one advantage |
| `arcDegrees` | 60 | A hook covers a narrow band; two hooks can be aimed to cover a semicircle |
| `startupMs` | 210 | Slightly faster than a baton, and it should be — the reach is what is missing |
| `activeMs` | 70 | ~4 ticks, second-shortest in the set |
| `recoveryMs` | 260 | Fastest recovery in the set, so fists are the best at restarting a chain |
| `staminaCost` | 8 | Cheapest, so a boxer outlasts a baton user on stamina alone |
| `staggerDealt` | 10 | Lowest; a fist does not stop a committed swing |
| `guardBreak` | 4 | A fist is not a threat to a guard, and should not be |
| `pushForce` | 60 | A shove, not a fall |
| `objectDamage` | 0 | Fists do nothing to the world. This is the honest value |
| `reachOrigin` | `hand` | |

### 6.6 Riot shield bash — **`[P]` PLACEHOLDER** — the defender's answer to a fast weapon. Highest risk: `arcDegrees`
| Field | Value | Rationale |
|---|---|---|
| `damage` | 16 | Low, because the bash's job is `staggerDealt` and `guardBreak`, not health loss |
| `range` | 1.10 m | The shield face is carried on the forearm, right in front of the body |
| `minRangeM` | 0.15 | The shield can be slammed into a body already against you |
| `arcDegrees` | 80 | Wide, because a bash is a shove of the shield face, not a strike |
| `startupMs` | 300 | Slower than a knife (you lose the exchange) but faster than a rifle butt (you punish it) |
| `activeMs` | 120 | ~7 ticks; the shield face is a large target for a short time |
| `recoveryMs` | 480 | The bash leaves the shield low — the punish window a good player waits for |
| `staminaCost` | 24 | Heavy: it is a whole-body push with a 4 kg shield |
| `staggerDealt` | 70 | Above a standard poise cap, so it interrupts a knife user mid-chain |
| `guardBreak` | 45 | The bash shatters a guard outright — its signature interaction |
| `pushForce` | 620 | Sends a light fighter into the ground; second only to the ram |
| `objectDamage` | 40 | Useful against a door, not against a barricade |
| `reachOrigin` | `shield` | Reach is the shield face, which is the whole point |

**Cross-profile checks the balance sweep should assert.** Fists have the best recovery and worst damage (a speed/range trade, not a strict upgrade). The ram is strictly worse than every other profile against fighters and strictly better against objects — the only profile where the answer is "use a different tool". The knife's 45-degree arc is the narrowest, so it is the profile most punished by a skirmisher's flank.

---

## 7. DETERMINISTIC AI MOVE TABLES

The AI is data, not branching code. One table per enemy role, loaded from `ai.toml`, evaluated by a single selection function shared by the client and the headless sim.

### 7.1 Table shape

```
MoveTable  { id, role, entries[] }
MoveEntry  { id, kind, profileId, moveId, bandMinM, bandMaxM, facingTolDeg, minStamina, cooldownTicks, weight, flags[] }
```

`kind` is one of `approach`, `strike`, `feint`, `guard`, `backstep`, `flank`, `disengage`. `flags` are booleans: `finisher`, `openingsOnly` (usable only while the target is in `startupMs` or `recoveryMs`), `punishOnly` (usable only in the target's parry recovery), `mustFollowBlock`. **No entry contains code, a lambda, a script, or a probability curve.** That is what makes the table loadable by a data parser and diffable in review.

### 7.2 Selection function (deterministic)

On every tick where `tick % decision_interval_ticks == unit.decisionPhase`:

1. Walk the table's entries **in ascending `entry.id` byte order** and drop any that fail a precondition: cooldown still running, `stamina < minStamina`, distance outside `[bandMinM, bandMaxM]`, facing error above `facingTolDeg`, or the unit is already inside a committed move's `recoveryMs`.
2. `score = weight * distanceFactor * staminaFactor * opportunityFactor`. All three factors are bucket lookups from config, not floating-point curves, so the score has a small finite set of values per entry.
3. Pick the **highest score**. Tie-break on the lowest `entry.id` — never on iteration order of a map.
4. `strike`, `feint`, and `backstep` are **commitments**: they lock the unit's state machine until the move's `recoveryMs` ends. The AI cannot change its mind mid-swing, exactly like the player. This is the single most important rule for feel.
5. `guard`, `approach`, `flank`, and `disengage` are re-evaluated at the next decision phase.
6. **No RNG on the main path.** Where jitter is wanted (dodge direction, feint timing), draw once per decision from `rng.Derive("melee-ai/<unitId>/<decisionCount>")`, consumed in a fixed order. This follows `services/simulation/internal/rng`'s `Derive` contract so adding a draw in one role does not shift another role's stream.

### 7.3 What each role's table contains

| Role | Table size | Composition |
|---|---|---|
| **Aggressor** | 8-11 entries | Heavy on `strike` across the close band and the full `chain`; one `guard` entry with low weight; one `backstep` used only to re-enter range after a miss; `feint` carries `openingsOnly` so it is a punish tool, not a random tell. Rarely disengages. |
| **Defender** | 8-11 entries | Guard-heavy. Most `strike` entries carry `punishOnly` or `mustFollowBlock`, so this role attacks *after* the player's `recoveryMs`, not during it. `disengage` has a real weight, so it is willing to give ground rather than eat a ram. Guard is a state it re-enters, and re-entering costs the same `guard_reaim_ms` the player pays. |
| **Skirmisher** | 9-12 entries | The only role with `flank` entries at high weight, and the only one whose `strike` band starts past the knife's `range`. Mostly `backstep` and `flank`; guards are used to bait a `punishOnly` entry out of a defender. Commits late and from an angle, which is why the 45-degree knife arc and the 160-degree guard arc are the numbers that decide its matchups. |

### 7.4 Headless operation and CI gates

- **Duel harness:** the existing headless runner (TESTING_AND_BALANCE.md section 1) runs two fighters, two bot roles, one seed, `tick_limit = 3600` (60 s at 60 Hz). No Babylon, no assets.
- **Determinism gate:** hash the snapshot at tick 1800 across two runs with the same seed and bot pair. Any difference fails CI. This catches a reordering in the contact test or a map iteration in the table walk, which are the two realistic ways this breaks.
- **Balance gate:** 200 seeds per role pairing, symmetric pairs held to a 45-55% win-rate band. Asymmetric pairs get a hand-set band in `ai.toml` with a comment and a range, per the repo rule that every constant carries a comment.
- **Metrics per run, emitted for the sweep:** mean time-to-kill, parry success rate, chip share of total damage, guard-break frequency, time spent at zero stamina, stagger events per second, and mean idle time. A drop in parry rate after a `startupMs` change is a tuning regression even when win rate is unchanged.
- **Coverage requirement:** the balance sweep must include at least one pairing per profile pair. The `objectDamage` axis cannot be swept by duels and needs its own door-and-barricade test before the ram is called tuned.

---

## 8. LINT RULES (fail the build, not the playtest)

1. `startupMs + activeMs + recoveryMs >= 300` for every move, and every `chain` window must fit inside the move it is declared on.
2. Quantisation error after `ms -> ticks` at 60 Hz must be <= 1 tick (16.7 ms).
3. Every `chain` target `moveId` must exist in the same profile; no cycles; a `finisher` may declare no `chain` window.
4. A profile with `damage > 0` must have `staggerDealt > 0`, or the design is a pure chip weapon and should say so in a comment.
5. Every `MoveEntry` must be reachable from at least one state; unreachable entries are a lint error, not dead config.
6. `pushForce` must be non-decreasing with `objectDamage` within a profile — a tool that wrecks a door should also move a body.

## 9. EXPLICITLY OUT OF SCOPE (so nobody stubs them)

- **Thrust vs. cut** as separate move types. The schema can carry a `thrust` flag; the lane ships cut-only, and adding the flag is a data change, not a schema change.
- **Two-handed breaker multi-hit** on crowds. The ram is single-target by design; crowd sweep damage is milo's lane's separate decision.
- **Reach offsets by stance or by crouch.** `reachOrigin` is a static enum here.
- **Per-limb guard** (KCD-style directional stances). A single 160-degree guard arc is the whole model; richer stances would multiply the AI table size against a lane that has not proven its balance sweep yet.
- **Animation-driven hitboxes.** The arc is a pure function of the profile, never of a mesh, or the headless sim and the client can disagree.
