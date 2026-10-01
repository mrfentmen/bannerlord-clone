# PROMPT 2 — Lane 2: Simulation

**Paste this whole file as the agent's first message.**
**Folder you own: `services/simulation/` — and nothing else.**

---

## Your lane

You own the headless simulation. **You hold the critical path for the whole project.**

This is the highest-priority prompt of the four. Three other agents are running in parallel in other folders and none of their work matters until yours lands.

## Read first

1. `CONSTITUTION.md` — §2.1 systems never call each other, §2.3 a coupling need is a design problem, §7.2 exit criteria are measurements, §7.3 nothing is done unless verified
2. `agents/README.md`
3. `PHASES.md` Phase 1 — your exit criteria
4. `CAUSE_EFFECT.md` — the heart of the project
5. `CHANGELOG.md` — append only

## The rules

- Write only inside `services/simulation/`.
- Root design docs are **read-only**. Contradictions go under **Unresolved**.
- `CHANGELOG.md` is **additive only**.
- **Prove it or it is not done.** Paste real output.
- Every constant in `config/balance.toml` with a comment and a range. **No magic numbers.**
- A new system reads shared state and writes shared state. **It never imports another system.**

---

## THE SITUATION

`CONSTITUTION.md` §7.2 says a gate that cannot be met is a failed gate. **Phase 1 cannot currently be met**, and not because the simulation is missing features. It is because the simulation is **unverified and mostly crashes**.

Measured on 2026-10-01, Go 1.26.6, module `mbclone/simulation`:

- **91 files, 27 systems, zero `*_test.go` files.**
- **10 of 12 seeds panic** in world generation before tick 1.
- Some seeds **fail on tick 0** with a duplicate-write error.
- **The simulation is not reproducible from a seed.** Same seed, same order, two runs, different committed state.

Your exit criteria are *"ten chains emerge in logs without scripting"* and *"no side dominates across many seeds."* **Right now those criteria are unmeasurable, not failing** — 83% of seeds never reach tick 1.

Three bugs, then the test suite.

---

## Bug 1 — world generation panics on most seeds

**Where:** `internal/worldgen/rulers.go`, function `generateParties`, in the standing-raider-band loop around lines 502–524.

**What happens:** a `*model.Town` is nil when dereferenced at roughly line 509 (`X: t.X + r.Range(-60, 60)`).

**Reproduction:**

```
cd services/simulation
go run ./cmd/simrun --seed 1
```

Seeds that panic: 1, 3, 4, 5, 6, 7, 9, 10, 11, 12. Seeds that complete: 2, 8.

**It is deterministic, not a race.** Each failing seed was run three times with identical results. Do not go looking for a data race; there is no goroutine anywhere in `internal/`.

**Already ruled out, do not redo these:**
- `model.sortedKeys` sorts correctly (`internal/model/state.go:237`).
- `State.TownIDs()` is sorted keys of `Towns`.
- `bestTarget`, `bestTradePartner`, `bestBlockadeTarget` all iterate `TownIDs()`, so their loop order is deterministic.
- `DistanceBetweenTowns` and `DistanceTo` are pure arithmetic.
- There is no `math/rand` and no `go func` in the module.

**A confusing observation worth your attention:** on a *working* seed the town map has 25 entries with **zero** nil values at loop entry, and a scan immediately before the failing lookup still reports no nils — yet the very next statement yields a nil. Either something in that loop body is corrupting the map, or the nil is arriving from somewhere earlier that a scan of `Towns` alone would not show. Instrument and find it properly. **Do not paper over it with a nil check** — a nil check that swallows this produces an empty world that looks like it worked.

## Bug 2 — tick-0 crash: two absolute writes to one side relation field

**Where:** `factionai` and `rulerai` both stage an absolute write to the same side relation field.

**The error, verbatim:**

```
seed 1000 tick 0: sim: 1 invalid write(s):
  two absolute writes to side#2.coalition_with in one tick
  ("relation=-0.4598, willing_share=0.6667, side_a=1, side_b=2" and
   "relation=-0.2843, willing_share=0.8000, side_a=2, side_b=6"):
  the result would depend on system order
```

**Look closely at the two pairings: 1–2 and 2–6. Those are different relationships, not the same one written twice.** That points at the key used by the duplicate-write guard in `internal/sim/engine.go` (`WriteSet.stage` / `setIndex`), which is keyed by `(kind, entity, field)`. A relation is per-**pair**, so keying it by one side collapses two distinct opinions into one field and manufactures a false collision.

Verify that reading before acting on it. If it is right, the fix belongs in how relation fields are identified — **not** in the two systems, and **certainly not** by relaxing the guard.

**The guard is load-bearing.** It is one of three mechanisms making system order irrelevant. Weakening it to make a run pass would silently break the property the whole cause-and-effect design rests on. If you conclude the guard is genuinely wrong, say so loudly under **Unresolved** and explain the invariant you are replacing.

## Bug 3 — the simulation is not reproducible from a seed

**Where:** `internal/systems/rulerai/rulerai.go:87` writes `decision_score`; the setter is `model.partySet` at `internal/model/access.go:731`.

**What happens:** same seed, same system order, two runs, different committed state.

**The isolation, which is the important part:**

- Only `Party.DecisionScore` differs. **Towns, rulers, relations, oaths, and villages are all identical.**
- 45 of 73 parties differ.
- **The cause logs are byte-identical: 131,365 rows, zero differing values.**
- Affects every seed tried: 2, 8, 4242.

So a value changes in committed state while producing **no** log difference at all. That means the divergence is happening somewhere the cause log does not see, which is itself the clue worth chasing.

**Already ruled out:** `sortedKeys` sorts; `TownIDs()` is sorted; the three `best*` selectors iterate `TownIDs()`; distance functions are pure; no goroutines; no `math/rand`; the engine keys RNG substreams by system **name** (`tick-%d-%s`), not position, so order does not affect the stream.

**Two specific leads:**

1. `jitter` at `rulerai.go:105` is a closure drawing from `v.Rng`. It is called a **variable number of times** per `decide()`, depending on which option branches fire. If any branch decision depends on state that a prior draw already perturbed, you have a feedback loop. Trace how many draws a given ruler consumes and whether that count can vary between two runs of the same seed.

2. `internal/model/state.go:143` documents `Clone()` as *"the engine clones at the start of a tick so a system's reads always see committed state, and commits the clone at the end, which is what makes the tick atomic."* But `Engine.Tick` at `internal/sim/engine.go:525` builds its `View` over the caller's state and commits straight back into it — **no clone.** Either the doc is wrong or the tick is not the atomic unit it claims to be. Work out which. If systems can mutate state directly through `View.State`, they can bypass the cause log entirely, which would explain a changed field with an unchanged log.

That second lead is my strongest hypothesis for Bug 3. Start there.

---

## Task 4 — the test suite

**A decoupling test already exists and passes.** It was written on 2026-10-01, and it failed on first run by catching a real violation: `march`, `logistics`, and `attrition` each imported the `security` package to read one terrain lookup table. The fix moved `TerrainRoughness` into `shared`, which is where `shared`'s own package comment says a lookup belongs. Five files changed; the build and `go vet` are clean.

**Re-create these, do not take them on trust.** They are described here so you can verify each behaves as claimed:

- `internal/simrun/decoupling_test.go` — parses the import graph of `internal/systems/**` and fails if any system package imports another. `shared` is the only allowed system-package import, and a second test holds `shared` to the same discipline so the exemption cannot be abused. Also asserts every system package on disk is actually registered in `simrun.Systems()`, which catches a system that was written but never wired in and would silently never run.
- `internal/runner/order_test.go` — proves system order cannot affect results, by running the documented order against reversed and rotated orders and comparing a fingerprint of committed state. Plus a determinism test and a seed-divergence control.
- `internal/runner/known_issues_test.go` — documents Bugs 1–3 as tests that **skip once fixed**, so a fix turns them into a visible skip rather than silence.

**One implementation detail that will bite you.** `model.State` holds maps of pointers, so `fmt.Sprintf("%+v", state)` prints memory addresses and two identical states will not compare equal. `encoding/json` is no better: `Relations` and `SideRelations` are keyed by `model.Pair`, a struct, and `encoding/json` refuses a non-string struct map key. The digest must therefore walk state with reflection, dereference pointers, sort map keys by rendered form, and render floats at 17 significant digits so a one-ULP difference is still caught.

**Expected outcome before you fix anything:** the decoupling tests pass; the order-independence and determinism tests **fail**, and they should. A test suite that passes on broken code is worse than no test suite. Once the three bugs are fixed they should go green.

**Then, in this order:**

5. Per-system table-driven tests, each covering the **normal case, the failure case, and the recovery case**. Good outcomes must emerge the same way bad ones do (`CAUSE_EFFECT.md` §5 chain 5).
6. The ten chains from `CAUSE_EFFECT.md` §5 and §10 as executable tests. If a chain only passes because something is scripted, the test must fail.
7. A multi-seed harness asserting no side dominates, using `metrics.Table`.

## Definition of done

- [ ] All three bugs fixed at the root, with a regression test each.
- [ ] No seed out of the first twelve panics.
- [ ] The same seed twice produces identical committed state and an identical cause log.
- [ ] `go build ./...`, `go vet ./...`, and `go test ./...` all clean, output pasted.
- [ ] Additive **Built** row for Phase 1 — it has never had one — plus **Unresolved** rows for anything open.

## Report back

1. **Done** — with pasted output, including the multi-seed table.
2. **Blocked** — with the specific blocker and who owns it.
3. **Contradictions** — anything in the docs that does not match the code.
4. **Honest gaps** — stated plainly. **Do not redefine success to something easier, and do not ship a facade.** A cause-and-effect game whose simulation is untested is a facade.