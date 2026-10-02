# Battle simulation: how it is verified, and what it measures

This file exists so that "the battle engine works" is one command and a number,
and so that the numbers below have a date, a machine, and a seed attached to them.
Everything here was measured on the branch this file is on, at the balance file
this file's sibling ships. When a number here stops being true, the test that
produced it will fail; when a test stops being run, this file will be the stale
thing, so it is worth reading the dates rather than the adjectives.

- Branch: `worker/milo/simulation`
- Config version: `phase1-01`
- Box: two cores, four agent sessions sharing them, 8 GB
- Date of the runs below: 2026-10-02

---

## 1. One command

```
cd services/simulation
go run ./cmd/battleverify
```

That runs the whole scenario suite headlessly, prints a full report for every
battle, prints a summary table, and exits:

| Code | Meaning |
|---|---|
| 0 | every scenario completed and every invariant held |
| 1 | a rule failed, or a scenario did not complete |
| 2 | the command was used wrongly, or the balance file did not load |

A rule that cannot be checked says so, with the reason, and does not report a
pass. It also does not report a failure, because a rule that cannot run says
nothing about whether the engine is correct. As of this date there are no such
gaps: the last two were closed by raising `battle.max_report_events` from 4096,
which was smaller than one shipped-size battle writes.

Useful flags: `-seeds 3` (three seeds per scenario), `-only symmetric`,
`-scale 4` (bigger battles), `-quiet` (table only), `-json`.

## 2. What the harness is

- **Probe** (`internal/battleverify/probe.go`) is a read-only `Commander` on the
  engine's one published per-tick channel. It writes no orders, and
  `probe-neutral` proves that: every scenario is fought twice, once through the
  probe and once with no seam at all, and the two result hashes must match.
- **Rules** (`invariants.go`) are thirteen checks run against every battle.
- **Report** (`report.go`) is the standard printout and the summary row,
  including the result hash that makes two runs comparable.

## 3. The thirteen rules

| Rule | What it holds |
|---|---|
| `finite-state` | every published x, y, hp, morale, suppression, troops, speed and ammo is finite |
| `hp-in-range` | hit points never fall below zero, rise above the maximum, or rise at all between two ticks |
| `field-bounds` | no unit leaves the movement-reach envelope |
| `no-teleport` | no unit moves further in one tick than `battle.max_step_per_tick` |
| `roster-stable` | ids dense and ascending, sides fixed, the same units on the field, and no destroyed or surrendered unit comes back |
| `sides-made-contact` | the battle was fought: a blow was thrown, and the two armies were inside `battle.melee_range` |
| `casualties-add-up` | per side dead+wounded <= starting bodies, `inflicted[A] == dead[B]+wounded[B]`, and the destroyed events say the same |
| `units-accounted-for` | standing + broken + routed + surrendered + destroyed == starting units, cross-checked against the event log |
| `winner-valid` | the outcome is a side or an explicit draw, and the loser's own numbers agree with the reason |
| `ticks-within-bound` | the tick count is inside `battle.max_ticks`, the elapsed time follows from it, and the stage order is the documented one |
| `probe-neutral` | the commanded and uncommanded runs of the same setup and seed agree |
| `scenario-setup` | the setup is what the scenario claims to build |
| `scenario-expectation` | the battle did what the scenario is for |

There is no per-scenario exemption from any of them. There was one
(`Scenario.MayEndAtRange`) and it was removed once the engine could reach contact
in the scenario that was using it; see the note on the `Scenario` type.

## 4. The suite, measured

`battleverify -seeds 3`, 12 runs, 156 rules checked, 0 failed, 0 not checkable:

| Scenario | Seed | Units A/B | Ticks | Casualties A/B | Winner | Decided by | Rules |
|---|---|---|---|---|---|---|---|
| symmetric 50v50 | 20260930 | 50/50 | 1868 | 35/35 | A | rout | 13/13 |
| symmetric 50v50 | 20360933 | 50/50 | 1924 | 39/35 | B | rout | 13/13 |
| symmetric 50v50 | 20460936 | 50/50 | 1926 | 38/34 | B | rout | 13/13 |
| outnumbered defence 100v50 | 20260930 | 100/50 | 498 | 10/18 | A | rout | 13/13 |
| outnumbered defence 100v50 | 20360933 | 100/50 | 494 | 12/13 | A | rout | 13/13 |
| outnumbered defence 100v50 | 20460936 | 100/50 | 502 | 7/14 | A | rout | 13/13 |
| skirmishers against heavies 40v40 | 20260930 | 40/40 | 479 | 4/108 | A | rout | 13/13 |
| skirmishers against heavies 40v40 | 20360933 | 40/40 | 462 | 2/114 | A | rout | 13/13 |
| skirmishers against heavies 40v40 | 20460936 | 40/40 | 465 | 0/108 | A | rout | 13/13 |
| morale shock, early rout 30v30 | 20260930 | 30/30 | 1925 | 20/22 | B | rout | 13/13 |
| morale shock, early rout 30v30 | 20360933 | 30/30 | 1903 | 23/24 | A | rout | 13/13 |
| morale shock, early rout 30v30 | 20460936 | 30/30 | 1320 | 21/19 | B | rout | 13/13 |

Contact, measured rather than asserted (`TestEveryScenarioReachesContact`):

| Scenario | Ticks | Closest approach | Ticks inside a blow's reach | Swings thrown |
|---|---|---|---|---|
| symmetric 50v50 | 1868 | 0.1 m | 92 | 220 |
| outnumbered defence 100v50 | 498 | 0.4 m | 59 | 137 |
| skirmishers against heavies 40v40 | 479 | 0.6 m | 29 | 42 |
| morale shock, early rout 30v30 | 1925 | 0.1 m | 79 | 149 |

That last table is the one that was false. The skirmishers scenario used to be
decided at 22 m with no swing thrown in it, which is eight and a half times the
reach of a blow, because the morale casualty term was dividing its own side's
dead by its own side's living weight and so had no ceiling. The constant was
swept as well; both are written up in `config/balance.toml` beside the key.

## 5. Size

The size of the verification battle is `battle.reference_units_per_side` and
nothing else. The table in `config/balance.toml` is four rows of it, one per
size, with only that line changing between runs:

| Per side | Ticks | Wall | Swings | Casualties A / B | Result |
|---|---|---|---|---|---|
| 50 v 50 | 1868 | 1.8 s | 220 | 70.0% / 70.0% | PASS |
| 100 v 100 | 1902 | 6.0 s | 432 | 68.0% / 75.0% | PASS |
| 250 v 250 | 1940 | 26.2 s | 1027 | 70.8% / 72.8% | PASS |
| 500 v 500 | 1918 | 49.8 s | 2365 | 73.8% / 70.4% | PASS |

Four thousand units on the field, twice the 1000 unit target, at a tick budget
rather than to a conclusion:

| Per side | Ticks | Wall | Opening cost per tick | Per unit per tick |
|---|---|---|---|---|
| 2000 v 2000 | 700 | 5m00.7s | 700 ms for 4000 units | 175 us opening, 107 us average |

`battle.max_units_per_side` is 4000 and `battle.reference_units_per_side` is 500.
The config package refuses a file whose reference is above its limit, by name,
before any unit exists; `TestSizeKnobsComeFromConfig` checks that refusal.

## 6. What is NOT claimed

- **Casualty rates of 68% to 75% are high.** Most of that is not the tuning: it
  is that these battles stopped being decided by arithmetic, so they last four
  times as long and the men have four times as long to kill each other. The same
  scenario at the same seed went from 13% casualties to 55% when a morale term's
  denominator was fixed, and from 55% to 70% when
  `battle.morale_casualty_hit` was swept from 3.4 to 1.0. Both steps and the
  five-seed sweep behind them are in the balance file beside the key. Whether a
  fight should cost both sides seven men in ten belongs to whoever owns
  TESTING_AND_BALANCE.md.
- **The 1000 unit target is not met on this box.** 175 us per unit per tick at
  4000 units against SPEC.md section 5.1's 33. Closing that is the grid hot
  path's lane.
- **The size rows are single seed.** The size knob is proven by them; the shape
  of a fight is not.
- **The wall column is a note about the machine.** Every row was run more than
  once and the wall time moved 13% between identical runs while the tick count
  did not move at all.
- **A field battle's prisoners reach nobody yet.** `battle.Result` carries
  `PrisonersTakenBy` and `PrisonersTaken`, and the engine half is tested, but
  `grep -rn 'battle.Result' services/simulation/internal services/simulation/cmd`
  returns nothing outside `internal/battle`: the writeback still reads only the
  autoresolve path.

## 7. Running the rest of it

```
# the engine's own suites: size knobs, morale shape, surrender, the reference battle
go test ./internal/battle/ -run 'TestSizeKnobs|TestFormerLiterals|TestTheEngineCarriesNoFixedSize'
go test ./internal/battle/ -run 'TestHeadlessReference$' -v

# the harness's own tests, including the rules that must fail when fed a broken result
go test ./internal/battleverify/

# the race detector over everything that touches morale and surrender
go test -race ./internal/battle/ -run 'Morale|Surrender|Cycle|Broken|Rout|Rally|Panic|Casualty'
```

As of this date, on this box: the harness's own tests take 30 s and the engine's
size, morale and surrender suites take 81 s including a 53 s 500 v 500 reference
battle.

## 8. When a golden fixture moves, which commit moved it

The three fixtures in `internal/battle/testdata/golden` were re-recorded on
2026-10-02 after all three had gone red together. They had last been written on
2026-10-01, before two changes to the morale stage, so they were 25 commits stale.
The interesting part is not that they moved but that the cause was worth knowing,
and that it took a bisect to find rather than a guess.

| Fixture | Was | Now |
|---|---|---|
| `both-sides-ordered-8v8` | `c152b47f12ef7c5f` 333 ticks, A (enemy broke) | `ece0abc308963bac` 485 ticks, A (enemy broke) |
| `one-side-ordered-4v4` | `536862cfcf23cc29` 471 ticks, A (enemy **destroyed**) | `8de36a29c4bba544` 512 ticks, A (enemy broke) |
| `uncommanded-4v4` | `e5f70b16e018c832` 461 ticks, B (enemy **destroyed**) | `2ec2dbe0b6948de0` 474 ticks, B (enemy broke) |

Two commits moved them, both agent4's, both in `internal/battle/morale.go`, and
both logged in `CHANGELOG.md` under Built with their measurements:

| Commit | What it changed | Hashes at that commit |
|---|---|---|
| `fb57a1c` "the casualty term divided its own side's dead by the living" | the casualty term counted bodies against a spatial hash that holds a dead unit for the rest of the battle, so it was unbounded | `ebd9378a8b9b833a` / `cd349e9517db8466` / `59ca84b70da7a5d3` |
| `d33b0bf` "sweep morale_casualty_hit, and the size table at the value it gives" | the constant, swept against four scenarios | `ece0abc308963bac` / `8de36a29c4bba544` / `2ec2dbe0b6948de0` |

Nothing after `d33b0bf` moved them, including the formation hold work
(`3ca6483`, `151f6ed`) and the three ending tests added later.

The `destroyed` to `broke` change in two of the three is the documented effect and
not a new bug: bounding the casualty term is what stops a battle being decided by
arithmetic, and a battle decided by arithmetic ends when one army is gone while a
battle decided by attrition ends when it breaks. `CHANGELOG.md`'s own before/after
row for the same fix says `296 routs` becoming `263 breaks, 228 routs`.

To attribute a golden move yourself, bisect on the hashes rather than on "does the
test pass", and note that the failure line prints both numbers:

```
the battle moved. it hashed to ece0abc308963bac and the fixture says c152b47f12ef7c5f
```

Taking the first sixteen hex characters off that line takes the fixture's as well,
which is how a first attempt at this bisected all the way to a `.glb` asset commit
that cannot touch the simulation. Match on `hashed to ([0-9a-f]{16})` and take the
first group only.