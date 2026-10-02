# OSS study: `total-claude` — 9k-unit browser battle sim

**Lane:** battle simulation architecture. **Author:** agent5. **Date:** 2026-09-30.

**Subject:** https://github.com/eoinest/total-claude, studied at commit
`7a204aaa669005fa70e25c0f63fbf0d58a1da139` (2026-09-03). Cloned to
`/tmp/oss-study/tc` (blobless sparse checkout, outside the repo). Nothing was copied into
`~/workspace/bannerlord`. All paths below are in **their** repo.

**Headline numbers, as they state them** (`src/sim/battleConfig.ts:726-737`): 8,644 men at
13.44 ms, 9,584 at 16.14 ms, 11,255 at 19.21 ms on a fixed-camera heavy shot. The pool is
hard-capped at `SOLDIER_POOL_CAPACITY = 12000` (`src/sim/types.ts:520`). These are figures
read out of their source comments and their own `docs/`, not numbers I measured — see
[Not verified](#not-verified).

**Licence:** there is **no LICENSE file** in the tree (`git ls-tree -r HEAD` returns
nothing matching `licen`). README `§Assets and licensing` covers *assets* (CC0) and says
nothing about the code. The catalog entry in `agents/oss-research/action-melee.md:13` marked
this "Unverified (check LICENSE)". It is still unverified, and now confirmed absent. Treat
as reference-only, which is the standing rule anyway.

---

## 1. How it structures a battle frame

### One fixed-step loop, strictly ordered subsystems, no workers

`Engine.frame` (`src/core/Engine.ts:441`) is the whole thing. It asks the clock how many
fixed steps are owed, then for each step runs every subsystem's `fixedUpdate` in `order`
(`src/core/Engine.ts:475`), then every `update` (visual), then camera, then every
`preRender` (interpolation + culling + LOD), then one submit.

There is **no Web Worker, no SharedArrayBuffer, no wasm, no Atomics anywhere in `src/`** —
I grepped for all four and got zero hits. The one `Worker` in the repo is
`net/worker.ts`, a Cloudflare Durable Object relay for multiplayer, which its own header
says has never run. So: 8.6k men, single-threaded, on the browser main thread, at 30 Hz.
That is the single most important thing to take from this repo — they did not need workers.

Order values are literal integers on each subsystem, e.g. `battle` = 10
(`src/sim/BattleSystem.ts:715`), `combat` = 20 (`src/sim/Combat.ts:372`), `morale` = 30
(`src/sim/Morale.ts:261`), `unit-quantise` = 60 (`src/sim/quantise.ts:135`), `unitRender`
= 200 (`src/units/UnitRenderSystem.ts:576`). `docs/ARCHITECTURE.md:61-70` publishes the
bands as a contract.

### Units: structure of arrays, one flat pool

`SoldierPool` (`src/sim/types.ts:526`) is **37 parallel typed arrays**, allocated once at
battle start: `x, y, z, px, py, pz, vx, vy, vz, facing, prevFacing, lean` (Float32Array);
`unitId` (Int32Array); `faction, rank, file, state, animClip, animPrevClip, ammo,
deathVariant` (Uint8Array); `slot` (Uint16Array); `hp, maxHp, stateTime, target…` and the
animation playhead fields. Transform, identity, condition, animation, appearance, ragdoll
— grouped exactly as the constructor at `src/sim/types.ts:601-628` allocates them.

Two reasons they give (`docs/tech/SIMULATION.md` §3, which is worth reading and is mostly
honest): sequential memory per pass, and **the renderer uploads instance attributes with one
subarray copy per frame** — an AoS layout would need a gather pass to build every instanced
buffer.

`alloc()` is a bump allocator with no free list (`src/sim/types.ts:631`): `count` is "slots
ever allocated", it is the iteration bound for every pass, and dead soldiers keep their slot
because their corpse still renders. `UnitGroupState.members` is `number[]` of pool indices
(`src/sim/types.ts:375`), not a range — contiguity is an emergent property of `spawnUnit`,
never relied on.

`BattleSystem` keeps its own parallel arrays indexed by the same pool index (`slotX/slotZ/
slotFacing/elevated/support/mounted/press/sepUsed/rally*`, `src/sim/BattleSystem.ts:808-832`),
and so does `CombatSystem` (`swing/swingFired/attackers/matchedWith`, `src/sim/Combat.ts:379-397`). The pool is the shared spine, not the state.

### Nearby enemies: uniform-grid spatial hash, rebuilt from scratch every tick

`SpatialHash` (`src/sim/types.ts:715`) is a flat uniform grid — **not** a quadtree, not a
tree of any kind. One instance, owned by `BattleSystem`:

```ts
this.hash = new SpatialHash(1500, 2.0);   // src/sim/BattleSystem.ts:826
```

1500 m half-extent, **2.0 m cells**. `rebuild` (`src/sim/types.ts:770`) is a two-pass
counting sort into contiguous buckets, run at the top of every fixed step
(`src/sim/BattleSystem.ts:1432`). Their stated reason: a full rebuild of 10k entries is
cheaper than incremental maintenance and **cannot drift**.

The one clever part is the **occupied-rectangle** optimisation (`src/sim/types.ts:736-739`,
`:777-814`): the grid is 1502×1502 = 2.26M cells, so `rebuild` tracks the bounding rectangle
of occupied cells and only clears/prefix-sums/queries inside it. They argue (and I believe
it, the arithmetic is plain) that this is bit-identical to a whole-grid rebuild because
every excluded cell contributes zero to the prefix sum. This is what pays for the 2.0 m
cells: the separation pass asks for everything within 0.84 m per man per tick, and at the
previous 3.5 m cells it scanned ~37 candidates to find 6 (`src/sim/BattleSystem.ts:823-825`).

`query(x, z, radius, fn)` walks the overlapping cells and calls `fn(index, d2)` for every
indexed soldier in them; it does **no distance filtering** — the callback does. The `d2` it
passes is wrong (it is the squared *radius*, same value every candidate,
`src/sim/types.ts:844`), a documented defect their own `docs/tech/SIMULATION.md` lists as
known defect #2. All nine call sites ignore it.

The grid is **2D and never reads `y`**. Instead every visitor applies a same-level gate:
`SAME_LEVEL_DY = 1.9` (`src/sim/BattleSystem.ts:483`), tested in `acquireVisit`
(`src/sim/Combat.ts:241`), `nearestEnemyVisit` (`:272`), `trampleVisit` (`:300`), the
`keepR` retention test (`:799`) and crowd separation (`src/sim/BattleSystem.ts:3330`). They
document why at length: on a wall, a defender 7 m up and an attacker at the foot are grid
neighbours, and this was a real bug.

### Simulation shape per tick

`BattleSystem.fixedUpdate` (`src/sim/BattleSystem.ts:1428`): save previous positions →
rebuild hash → refresh obstacles (one integer compare) → per-unit order/cohesion pass →
steer all men → resolve crowding → integrate → elevation post-pass → animation state.
`CombatSystem.fixedUpdate` (`src/sim/Combat.ts:549`) is four passes: rebuild attacker
counts, survey units, fight units, resolve push.

Measured cost of the whole thing, from `src/core/Engine.ts:490`: `fixedUpdate` costs
**3.657 ms at 8,632 men**.

---

## 2. What it does *not* compute per unit per tick

This is the answer to the 500v500-in-14-minutes problem, and it is five separate
mechanisms, not one big LOD switch. There is **no simulation LOD at all** — every living
man is integrated every tick. The savings are all from *staggering* and *budgeting*.

**(a) Staggered target acquisition — the big one.** The spatial-hash probe is the most
expensive thing in the loop, so it is spread across ticks (`src/sim/Combat.ts:810-815`):

```ts
const eager = p.rank[i] <= 2 || loose || cav || s.contactSeconds > 4;
const due = eager ? ((i + phase) & 7) === 0 : ((i + this.tick) & 31) === 0;
```

Front ranks, loose orders and cavalry re-scan every 8 ticks (0.27 s); deep ranks every 32
(1.07 s), because they almost never have anything in reach. Two edge-triggered cases force
an early look.

**(b) A hard engagement cap per unit.** `engageCap` at `src/sim/Combat.ts:750-753` is
`max(6, min(width, alive) * 1.8 or 1.2)` — men per metre of frontage, 1.8 for spears. A
unit with 160 men can only put ~35 into contact, and a unit that already has its cap does
not even run the acquisition probe. Their measured consequence of *not* having this: two
160-man blocks pressed together interleave until 63% of both are swinging, which triples
kill rate and turns a two-minute grind into a twenty-second massacre.

**(c) A contact-range early-out for whole units.** `fightUnits` skips a unit entirely when
its nearest enemy is beyond `CONTACT_SCAN_RANGE = 90` m (`src/sim/Combat.ts:88`, `:726`) —
it just decays swings. One hash probe per *unit*, then nothing per man.

**(d) Formation re-solves are event-driven, not periodic.** `maybeReform`
(`src/sim/BattleSystem.ts:2902`) re-solves which man holds which slot only when the unit's
heading has turned more than `REFORM_ANGLE = 0.05` rad or its shape has changed
(`:619`). Both directions are measured: too coarse and the men chase the rotating lattice
(7 m of median drift at 0.35 rad), too fine and it is a sort per unit per tick. It also
declines while `contactLock` is set or the block is turning in place.

**(e) Everything expensive outside the per-unit loop is budgeted per tick.** Pathfinding
spends `NODE_BUDGET = 2400` node expansions and `FLOW_BUDGET = 2600` relaxations per tick,
with a `MAX_SEARCH_NODES = 12000` per-search cap and a `MAX_QUEUE = 48` request queue
(`src/ai/Pathfinding.ts:79-96`, `:143`; loop at `:1838`). The wall census runs **once per
second**, not per tick (`src/sim/BattleFlow.ts:342-346`). Melee hit *events* — the VFX/SFX
payload, not the damage — are capped at `HIT_EVENT_BUDGET = 22` non-lethal per tick
(`src/sim/Combat.ts:92`, `:1241`). Crowd separation displacement is budgeted per man per
tick (`MAX_SEPARATION_STEP = 0.22` m, `MAX_SEPARATION_FIGHTING = 0.08` m,
`src/sim/BattleSystem.ts:538`, `:548`) — a positional fix-up with no natural ceiling
otherwise.

**(f) LOD is render-only.** Three mesh LODs plus a billboard impostor tier, chosen per man
in one pass over the pool in `preRender` (`src/units/UnitRenderSystem.ts:2451`), with
fraction bands `[0.14, 0.4, 2.0]` of the tier's far distance (`:137`), 12% hysteresis on
each edge (`:164`), and the impostor edge derived from a **pixel-height criterion** (4.5 px,
`:150`) rather than a distance constant. None of this touches the simulation. The
architecture budget is `fixedUpdate` ≤ 4 ms at 6k men, ≤ 220 draw calls whole frame
(`docs/ARCHITECTURE.md:494-499`).

The generalisable principle: **there is no far-field simplification because there is no
far-field behaviour to simplify.** Every man is a combatant with a reach, so every man
needs a target — but he does not need a *new* target every tick, and he does not need more
than `engageCap` men of his unit fighting. Those two cuts, not LOD, are what make 8.6k
men affordable.

---

## 3. Determinism

### Floats, but with a float32 firewall

Floats throughout — no fixed point anywhere in the sim. The determinism mechanism is more
interesting than the number format.

`SoldierPool` is typed arrays, so every tick reads float32, computes in float64 (JS numbers)
and writes float32 back. `src/sim/quantise.ts:6-15` states the argument: a 1-ULP double
disagreement between two browser engines survives the write to float32 (quantum 1.19e-7)
only when the two doubles straddle a rounding boundary, ~2e-9 of the time. That is why
three engines agree bit-for-bit on 8k men for 6k ticks.

The unit layer (`UnitGroupState`, plain JS doubles) was **not** on that firewall and was
therefore engine-dependent from about one second of simulated time. The fix is
`UnitQuantiseSystem` at `order = 60` (`src/sim/quantise.ts:131-148`), which runs
`Math.fround` over a listed field set at the end of every tick, plus at birth inside
`spawnUnit` (`src/sim/BattleSystem.ts:1121`) because deployment happens after
`initAll`. The field list is *imported from the hash module* so that "the float64 state
that is hashed is exactly the float64 state that is quantised" (`src/sim/quantise.ts:48-55`
).

They are honest that this is a firewall and not a proof (`src/sim/quantise.ts:64-68`): a
unit whose morale sits within 6e-8 of a break threshold can still break in one engine and
hold in another.

### Seeded RNG with named forks

`src/util/rand.ts` — Mulberry32, one uint32 of state. `fork(salt)`
(`src/util/rand.ts:97`) derives a child stream from the parent's **current state** and does
not advance the parent. Two consequences they spell out: fork once and hold (forking every
tick returns the identical stream), and a fork is not salt-only isolation — it depends on
how many draws the parent has made.

Live forks: root at `src/sim/BattleSystem.ts:720`, per-unit at spawn (`:1124`),
`fork('combat')` (`src/sim/Combat.ts:454`), projectiles/artillery, siege, tactical AI,
general AI. Seeding happens **before `initAll()`** and **in place**, because the AIs and
projectiles fork during their own `init` (`docs/tech/SIMULATION.md` §5).

`hash01(index, salt)` (`src/util/rand.ts:116`) is a stateless per-index hash for
"random but fixed" values — used in the sim too, for values two parties must agree on
without either seeing the other's roll (matched-combat pairing, `src/sim/Combat.ts:873`).

### Replay

`src/sim/replay.ts`. The record is `(config, seed, [(tick, order)…])`. Orders are quantised
to int16 over ±1400 m **at the moment they enter the queue**, in live play exactly as in
playback, so recording float64 and replaying int16 — the commonest real lockstep bug —
cannot happen. The record is keyed to **tick index, not timestamp**, so replay is
independent of frame pacing.

### Could this replay identically?

Yes, within one engine. Their own tooling compares two page loads bit-identically on a
32-bit FNV-ish hash over exact float32 bit patterns (`src/sim/stateHash.ts:79`, and note
`docs/tech/SIMULATION.md`'s warning that the `poolHash` multiply is not real FNV-1a and
21 recorded baselines are pinned to its rounding). A cross-engine gate exists
(`qa-xengine`) and, per their own report, the float32 pool + quantised unit layer now match
across Chromium/Firefox/WebKit to t+200.

Their honest defects list is worth reading for calibration
(`docs/tech/SIMULATION.md` "Known defects and gaps"): `Time.alpha` is documented `[0,1)`
and reaches exactly 5.0 under load, which extrapolates soldiers five ticks ahead
(`src/core/Time.ts:271-272` + `:81`); `SpatialHash.query`'s second callback argument lies;
`RagdollSystem.fixedUpdate` reads the camera inside a fixed step
(`src/sim/Ragdoll.ts:268`) and is only safe because it writes nothing back to the pool.

---

## 4. Lessons for `services/simulation/internal/battle/`

Ordered by expected value against our two symptoms (14 min wall for 500v500; a hang in
grid queries). Each is an idea in my own words, with the place in *their* repo to check it.

**1. Every spatial query in our sim currently walks every unit; theirs walks only units that
can matter.** This is the direct answer to our wall time. `stageTargeting`
(`targeting.go:33`) runs `forEachCell` for all 1,000 units every tick, `stageMorale`
(`morale.go:67`) runs a 90 m neighbourhood for all of them, `stageSeparate`
(`intent.go:237`) runs a standoff query for all of them. Their equivalents have three
catches we have none of: a whole-unit early-out beyond 90 m (`src/sim/Combat.ts:88`,
`:726`), a per-unit engagement cap that skips the probe entirely once satisfied
(`src/sim/Combat.ts:750-753`), and stripe-splitting the probe over 8/32 ticks keyed on
`(index + tick) & mask` (`src/sim/Combat.ts:814`). A mask-and-tick stripe is ~5 lines and
needs no new state — but note it changes results, so it belongs behind an explicit
"think cadence" knob in the balance file, not smuggled in.

**2. Cap how many units may engage one target, and cap the query radius per unit.** We have
`MaxAttackersPerTarget` (`targeting.go:59`) already, which is the same idea as their
`CROWD_SOFT_CAP`/`CROWD_HARD_CAP` (`src/sim/Combat.ts:75`, `:86`). What we do not have is
their *asymmetry*: acquisition radius and retention radius are one pad plus a band
(`ACQUIRE_PAD = 0.86` then `+0.32`, `src/sim/Combat.ts:181` and `:194`) rather than two
independent constants, because two independent constants is exactly how they drifted to a
0.65 m band — 60% of a gladius's entire reach. Copy the *convention*, not the numbers.

**3. Make the index rebuild cover only the occupied rectangle, and make it bit-identical to
the full rebuild.** Their `SpatialHash` is 2.26M cells and clears/prefix-sums only the
bounding rectangle of occupied cells (`src/sim/types.ts:736-739`, `:777-814`), which is
what makes their 2.0 m cells affordable — 2.0 m vs the 3.5 m they had before, chosen
because the 0.84 m body query scanned 37 candidates for 6 at the coarser size
(`src/sim/BattleSystem.ts:823-825`). Our `hash.rebuild` (`grid.go:139`) sizes the grid to
the field extent every tick and memclrs the whole thing (`grid.go:197`), which is fine at
our scale and will not be at 9k. The lesson is the *argument*: excluded cells contribute
zero to the prefix sum, so the offsets, the item order and every query result are exactly
what a full rebuild would give. That is what makes it safe to shrink cells aggressively.

**4. Our index coarsening is a correctness hazard their fixed-extent grid does not have,
and it is worth bounding differently.** `grid.go:172-181` doubles the cell size until the
grid fits `maxIndexCells = 1 << 16`. Their grid is fixed at 1500 m half-extent and a man
outside it is simply **not indexed** (`cellOf` returns -1, `src/sim/types.ts:756-761`) —
a loud, bounded failure rather than a silent 10× density increase in one cell. Our version
is correct by their argument (ring count is computed from the cell size actually in use,
`grid.go:277`) but the failure mode is that a spread-out field quietly turns every melee
query into a linear scan — which is exactly the shape of a "grid query got slow and then
things hung" incident. Suggest: log/report `coarsened` (we already track it,
`grid.go:108`) as a hard performance alarm, and consider a distance-tiered early-out so
distant units stop being queried at all rather than being queried more expensively.

**5. Rebuild the index once per tick from one ordered walk, never incrementally.** They
rebuild from scratch every fixed step and say why (`src/sim/types.ts:711-714`, called at
`src/sim/BattleSystem.ts:1432`): a full rebuild of 10k entries is cheaper than incremental
maintenance *and cannot drift*. We already do this (`battle.go:597-598`) — worth keeping as
an explicit invariant, because the tempting optimisation is exactly the one they measured
and rejected.

**6. Adopt a float32 firewall on the whole state, not just the hot arrays — but our
determinism requirement is different from theirs, so adopt the *mechanism* not the
technique.** They hash and quantise the same listed field set by importing the list from
the hash module (`src/sim/quantise.ts:48-55`, `src/sim/stateHash.ts:48`) so the two cannot
drift. We have a Go float64 model; the equivalent discipline is: one declared list of
"simulation state fields", one list of "fields the replay hash covers", and an assertion
that the second is a subset of the first. Their failure mode is instructive — a field in
the hash but not the firewall reads as a portability failure with no cause
(`src/sim/quantise.ts:50-54`).

**7. Budget the things that are not per-unit-per-tick, explicitly, every tick.** Their
pathfinding takes a hard node budget per tick and a hard queue length
(`src/ai/Pathfinding.ts:79-96`), the wall census runs once per second not 30 times a
second (`src/sim/BattleFlow.ts:342-346`), and hit events are capped at 22/tick
(`src/sim/Combat.ts:92`). Every one of these is a *fixed ceiling per tick* rather than a
proportional cost. For us the analogue is: whatever our commanders/AIs/report-building do
per tick, give it an explicit budget and let it spill, so the tick has a bounded worst
case. This is also the difference between "slow" and "hung" — a proportional cost with no
ceiling is what turns a slow tick into a hung tick.

**8. Re-solve derived spatial state on change, never on a timer.** `maybeReform`
(`src/sim/BattleSystem.ts:2902`) keys a full slot-assignment solve on
`|Δheading| > 0.05 rad` **or** a shape change (width/lattice size packed into one integer,
`:2907`), with both failure directions measured in the source comment
(`:601-618`). Same pattern as our `apertureAt` idea and the opposite of a periodic
re-plan. Cheap to adopt, and it removes a whole pass from the tick for units that are not
moving.

**Two things I would *not* copy.** Their unit-level combat model (formation anchor + per-man
reach, `engageCap` in men-per-metre) is a different game from our unit-level model with
troop counts; adopting it wholesale would be a redesign, not a lesson. And their
`CONTACT_SCAN_RANGE` early-out assumes the near-enemy distance is already known cheaply —
we would have to pay for a per-unit nearest-enemy probe to get it, which is the same probe
we are trying to avoid. If we take it, we take it with the per-unit probe amortised.

---

## Not verified

Stated plainly, because several of the numbers above are their claims, not my measurements.

- **I did not run anything.** No build, no benchmark, no `qa-determinism.mjs`, no
  `qa-xengine`, no browser. The repo's sparse checkout excludes `tools/`, so I could not
  even read most of the instrumentation the performance figures come from.
- **Every millisecond figure is theirs**: the 13.44 / 16.14 / 19.21 ms table
  (`src/sim/battleConfig.ts:726-737`), `fixedUpdate` at 3.657 ms
  (`src/core/Engine.ts:490`), the ≤ 4 ms at 6k men budget
  (`docs/ARCHITECTURE.md:499`), the 78%-in-cell-lookup profile that motivated our coarse
  fire hash (`morale.go:88`, quoting *their* repo's style of measurement — that one is
  ours, not theirs). Their hardware is an Apple M4 Max at 1920×1080 and is not comparable
  to ours.
- **The 9,000-unit headline is a menu warning threshold, not a verified frame rate.**
  `PERF_VALIDATED_MEN = 9000` is where the UI *starts warning you*; the pool holds 11,280
  and the largest measured configuration runs at 52 fps (`src/sim/battleConfig.ts:726-731`).
  "9k-unit battles" in the catalog entry is marketing for a number that is a warning line.
- **The float32 cross-engine firewall argument is their claim.** The quantum arithmetic
  (float32 epsilon 1.19e-7 vs 2.2e-16 double disagreement, ~2e-9 straddle rate) is
  plausible and I checked the arithmetic, but the three-engine bit-identical result at
  8,632 men for 6,000 ticks I did not reproduce.
- **`docs/tech/SIMULATION.md` is a second-party document inside their repo**, written by
  what reads like an agent about the same codebase. Where it agrees with the source I
  quoted the source. Where I cite it (the `alpha = 5.0` table, the determinism gate
  results) it is their report of their measurement.
- **Two claims I checked the code for and could not confirm as stated:**
  `SpatialHash.query`'s second callback argument is genuinely `r2`, not per-candidate
  squared distance (`src/sim/types.ts:844`) — their defect list says so and I confirmed it
  against the source; but I could not confirm from source alone that all nine call sites
  ignore it, since I only read four.
- **The AI-cannot-storm-a-wall finding** (`docs/tech/SIMULATION.md` §9) is a claim about
  their code's behaviour that I did not verify and is irrelevant to our lane.
- **Licence.** No LICENSE file exists in the tree. Nothing was copied either way, but if
  anyone ever wants to vendor from here, that question is still open and the answer is
  currently "no grant".

---

## Reproducing this study

```
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/eoinest/total-claude.git /tmp/oss-study/tc
cd /tmp/oss-study/tc
git sparse-checkout init --cone
git sparse-checkout set src/sim src/units src/ai src/core src/util docs/tech README.md docs/ARCHITECTURE.md package.json
git checkout HEAD
```

Sparse because the full tree is dominated by ~1,300 files of CC0 screenshots and 30 MB of
models; `--filter=blob:none --no-checkout` because a plain depth-50 clone pulls the blobs
and blew past a 120 s timeout here.