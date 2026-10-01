# The replay formats

Everything the battle engine writes so that a battle can be fought again and the
second fight can be compared against the first. Three formats, in the order they
appear in a battle's life:

| Format | File | Written by | Read by | Who writes it |
|---|---|---|---|---|
| Order script | `*.battle` | a person, or a tool | `battle.DecodeScript` | you, by hand |
| Order log | `order.log` | the engine, during a battle | `battle.DecodeOrderLog` | nobody, ever |
| Battle record | `battle.json` | `simrun battle` | `battle.ReadBattle` | `simrun battle` |

All three are JSON Lines: one header object, then one object per line. That is
not a style choice, it is a review choice. A diff of two five-hundred-row logs
that differ in one order shows the one order.

Read this file top to bottom and you can write a script. Section 5 is the part
you need; sections 1 to 4 are why it is shaped the way it is.

---

## 1. The three formats and which way the arrow points

```
   script  --->  log  --->  battle  --->  log (on disk)  --->  battle again
  (written)    (engine)    (fought)      (recorded)           (replayed)
```

- A **script** is what a person wrote *before* the battle. Readable, reviewable,
  editable. It cannot be the record of a battle, because it is the input.
- An **order log** is what the engine *produced*. Hundreds of rows of exact
  float64s under a digest. Superb evidence, useless to type.
- A **battle record** is a directory holding both a log and a small JSON summary,
  addressed by a battle id. It is what `simrun replay --battle <id>` opens.

A script expands into the same `battle.Order` struct the recorder writes, so a
hand-written battle and a recorded battle go through the identical apply path
(`battle.runCommanders`). That is why a scripted battle is a real replay test and
not a simulation of one: the script does not get its own movement code, it gets
the recorder's rows.

## 2. What the engine's own decisions are not logged

The engine picks a movement, a target and an intent for every unit on every tick.
None of that is in an order log. It does not need to be, because it is a
deterministic function of the snapshot and of per-tick named RNG substreams
derived from the seed. It reads no clock, no global generator, and no map
iteration order, so replay **re-derives** it from the seed alone.

This is the second branch of the sparta rule the design cites: AI orders are
either recorded like player orders or re-derived, and a re-derived AI must read
only serialised sim state.

The consequence worth knowing: **a battle nobody ordered replays from an empty
log.** `TestReplayFromEmptyLogIsTheWholeProofOfRederivedAI` requires exactly
that. It also means a log stays small, which is the other half of why an order
log is an order log and not a frame recording.

If you were looking for the engine's per-tick decisions in `order.log`, they are
deliberately absent and should stay so: a log that grew with ticks x units would
stop being evidence of anything.

## 3. Field meanings

### 3.1 Order script (`.battle`)

**Header line.** One object, then one object per step.

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | Always `"battle_script"`. This is how a reader tells a script from a log, since both are JSONL with a header. |
| `version` | int | Format version. Currently `1`. See section 4. |
| `name` | string | Identifies the script in test output and in a diff. Never reaches the engine. |
| `seed` | uint64 | The battle seed. The script carries it rather than taking it as an argument, because a script beside the wrong seed is the easiest way to run a battle nobody asked for. |
| `a` | roster | Side A's force. See below. |
| `b` | roster | Side B's force. See below. |
| `steps` | int | How many step lines follow. The header never carries the steps themselves: a header holding the whole list would make every scripted battle one enormous line, and a diff would put the one step that changed somewhere in the middle of a wall of text. |

**Roster**, the same fields on both sides:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `units` | int | required | How many units the side fields. Each unit stands for `troops_per_unit` bodies, so "500 troops" is fifty units of ten and is counted the same as five hundred individuals. Must be at least 1. |
| `troops_per_unit` | float | `battle.roster_troops_per_unit` | Bodies per unit. |
| `skill_bias` | float | `0` | Shifts generated skill on a 0-1 scale, where 0 is the balance file's mean and 1 is a perfect soldier. Lets a balance sweep send better or worse armies without editing constants. |
| `morale_bias` | float | `0` | The same, for morale. A hungry, unpaid army arrives with worse morale. |
| `no_ranged` | bool | `false` | The side is all melee. |
| `all_ranged` | bool | `false` | The side is all shooters. Asking for both is an error: a side is one or the other. |
| `label` | string | `""` | Names this side in the battle report. |
| `terrain` | string | `""` | The ground. Belongs to the *battle* rather than to a side, so both sides must agree; see section 5.4. |

The label that ends up on the result is `<a.label> against <b.label>` when both
sides have one, otherwise the script's `name`.

**Step lines.** One object per step, in tick order.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `tick` | int | yes | Which tick the order lands on. The engine runs 20 ticks a second. |
| `unit` | int | yes | Which unit. **Positional, and this matters**: see section 5.2. |
| `order` | string | yes | `"move"`, `"hold"`, or `"formation"`. See section 5.3. |
| `intent` | string | no | `"advance"`, `"engage"`, `"withdraw"`, `"rout"`, or `"hold"`. |
| `dx` | float | no | Metres of movement this tick, in the unit's own frame. Negative is backwards. |
| `dy` | float | no | The same, laterally. |
| `formation` | string | no | `"line"`, `"column"`, `"wedge"`, `"square"`, or `"skirmish"`. `""` means "no opinion". |
| `facing` | float | no | Bearing in radians. |
| `note` | string | no | Free text for whoever reads the diff. Carried into the order log row's `source` field, so it is part of the log digest but not of the battle: changing a note changes `order_hash` and nothing else. |

Every field except `tick`, `unit` and `order` is optional, and the short form a
person wants to type and the long form a generator wants to emit encode
identically. Without that, a round trip through the encoder would turn an
authored `hold` into a movement order of no metres, which the engine reads as
silence about the unit's intent and a log records as a different kind of row.

Steps are written **sorted by tick**. A script's steps are a set of instructions
about ticks rather than a sequence, and a person who added a step for tick 5 at
the bottom of the file meant the same battle as one who added it at the top.
Sorting on write makes those two files identical. Within one tick the sort is
stable on decode order, so a script ordering two units on the same tick keeps
authoring order.

### 3.2 Order log (`order.log`)

**Header line.**

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | Always `"order_log"`. |
| `version` | int | Format version. Currently `1`. |
| `seed` | uint64 | The seed the battle ran under. Carried in the file because a log with the wrong seed beside it is the easiest way to get a replay that reproduces the wrong battle, and a file that carries its own seed cannot be paired with the wrong one by accident. |
| `config_version` | string | The balance file version. **The balance file itself is not embedded.** A replay runs under whatever config the reader loads, and a config whose version does not match is refused. |
| `order_hash` | uint64 hex | A digest of every row, so a reader can tell a complete log from an edited one before trusting a single row. |
| `roster_hash` | uint64 hex | Identifies the force the orders were issued against, so a reader can refuse to replay this log against a different one. |
| `rows` | int | How many rows follow. A truncated write reads as a broken file rather than as a short battle. |
| `truncated` | bool | The log refused rows and is therefore not a complete record. |

**Row lines.** Every row has every field, whatever wrote it.

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | Always `"order"`. |
| `seq` | int | Position in the log, from zero. **Rebuilt on read, not trusted**, so a hand-edited or reordered file cannot make the log claim an order happened at a position it did not. |
| `tick` | int | The tick the order landed on. |
| `unit` | int | The unit's id. Positional; see section 5.2. |
| `side` | int | `0` for side A, `1` for side B. |
| `order` | string | `"move"`, `"hold"`, or `"formation"`. |
| `dx`, `dy` | float | Metres of movement this tick. |
| `intent` | int | The intent's numeric value. See section 5.3. |
| `formation` | int | The formation's numeric value. `0` is "none", which is the absence of an order rather than a shape. |
| `facing` | float | Bearing in radians. |
| `source` | string | Who issued it: the script's `note`, the script kind, or a caller's label. It is folded into `order_hash`, so it is part of the log's identity and not of the battle's result. |

The float fields are written with `strconv.FormatFloat(v, 'g', -1, 64)`, the
shortest encoding that parses back to the identical float64. A format with fewer
digits would be prettier and would silently change the battle on replay.

The header and row shapes are written by hand rather than through
`encoding/json`'s reflection, for two reasons: the row layout must not depend on
which commander wrote it, and two encodings of one battle have to be
byte-comparable, which is the determinism proof. `encoding/json` reaches that
through a shortest-representation search whose output is not contractually stable
across Go releases.

**`hold` is a distinct row from silence.** `OrderHold` is not an `OrderMove` with
zero `dx` and `dy`, because the two are not the same instruction. The command
channel has two separate "was this spoken to" flags, `UnitCommand.Set` for the
movement channel and `UnitCommand.FormationSet` for the shape, and `Set` is what
separates "told to hold" from "said nothing". A log that collapsed them would
record a commander's silence as a command. A tick with no row for a
unit is a commander that said nothing, which the engine reads as "this unit
follows its own rules".

### 3.3 Battle record (`battle.json`)

A record is a **directory** named for the battle id, holding `battle.json` and
`order.log`. Two files rather than one because the log already has its own
version, digest and strict decoder, and re-serialising it into a larger document
would mean a second encoder to keep in step with the first. The log file here *is*
the log file: `battle.ReadBattle` copies the bytes out unchanged.

**Header fields.**

| Field | Type | Meaning |
|---|---|---|
| `kind` | string | Always `"battle_record"`. |
| `version` | int | Format version. Currently `1`. |
| `id` | string | The battle id, which is also the directory name. Must be one path component: no separators, no `.`, no `..`. |
| `seed` | uint64 | What the battle ran under. |
| `config_version` | string | The balance version it ran under. |
| `label` | string | The battle's name. Carried because `Result.Hash` folds it: a record that dropped it would replay to a *different hash* while every printed number matched. |
| `a`, `b` | roster | The two forces, in the script's spelling. The seed rebuilds a force only if you also say what kind of force it was, and this is that. |
| `order_log` | object | `file`, `rows`, `order_hash`, `roster_hash`, `truncated`. Repeated from the log's own header so a reader can see a record and its log disagree without parsing the log; the reader then checks that they do agree. |
| `original` | summary | The result the record was written with. See below. |

**Summary fields.** `result_hash`, `state_hash`, `label`, `outcome`, `reason`,
`ticks`, `elapsed`, `truncated`, `events`, `events_dropped`, and `sides`.

Each side carries `side`, `start_units`, `start_bodies`, `dead`, `wounded`,
`surrendered`, `surrendered_bodies`, `standing`, `broken`, `routed`,
`casualties_inflicted`, `shots`, `swings`, `ranged_hits`, `melee_hits`.

`surrendered` counts **units** and `surrendered_bodies` counts **bodies off the
field**, which includes the routed as well as the surrendered. One officer speaks
for a squad, so the prisoners column of an aftermath is counted in units.

`result_hash` is the digest of everything a finished battle produced: every
unit's final state, the outcome, and every published total. `state_hash` is the
part of that which covers the units themselves, kept separately so a reader can
tell "the units diverged" from "the report diverged".

## 4. Versioning policy

Three rules, one per format, all the same rule: **bump the version, and refuse
what you do not know.**

1. **A format version changes when the layout changes.** Adding an optional field
   a reader can ignore is not a change. Renaming a field, removing one, changing
   what a number means, or changing the set of legal values is.

2. **A reader refuses a version it does not know.** It does not guess at a layout
   it was not written for. This is the single most important line in this file: a
   log read with the wrong layout produces a confidently wrong replay, which is
   worse than no replay, because it looks like evidence.

3. **An old version stays readable until it is deliberately dropped.** When you
   bump, the reader keeps the old branch for as long as records in that version
   are worth replaying, and drops it with a commit that says which fixtures
   needed re-recording. The golden fixtures under
   `internal/battle/testdata/golden/` are the thing that tells you whether a bump
   broke anything, so re-record them in the same commit as the bump.

`config_version` is a separate axis and a stricter one. A record or log carries
the balance version it was made under, and replaying under a different one is
**refused**, not warned about. Orders computed under different constants are not
the same orders, and a replay under new balance data would be a what-if, not a
replay.

The numeric enum values in an order log (`intent`, `formation`) are also a
versioning surface. `IntentHold` is deliberately **last** in its enum so that
every intent value already written into a saved log still means what it meant.
The same applies to any new intent or formation: append, never insert.

## 5. Writing a script

This section assumes nothing but this file.

### 5.1 The smallest script that does anything

```
{"kind":"battle_script","version":1,"name":"ridge farm","seed":106003,"a":{"units":8},"b":{"units":8},"steps":1}
{"tick":0,"unit":0,"order":"hold","intent":"hold"}
```

Fight it:

```
cd services/simulation
go run ./cmd/simrun battle -seed 106003 -script ridge-farm.battle
```

That prints the battle, records it under `battle-106003`, and tells you the
command that replays it. Replay it with `go run ./cmd/simrun replay -battle
battle-106003`.

### 5.2 Unit ids are positional, and this is the mistake everybody makes once

Unit ids are assigned densely: **side A in slice order, then side B in slice
order.** So in an 8 v 8:

| id | who |
|---|---|
| 0-7 | side A, units 1 to 8 |
| 8-15 | side B, units 1 to 8 |

A script's `"unit": 3` means the fourth unit of side A in a 10 v 10 and the fourth
unit of the whole battle in a 4 v 8. Write the number you mean and check it
against the roster you wrote.

This is safe because replay refuses a log whose roster does not fingerprint to the
one its rows were written for. A script edited to change the roster under its own
rows is **refused**, not replayed onto different men.

The `side` field in an order *log* row is derived by the engine and is not in a
script step at all. A script step says which unit, and the engine knows which side
that unit is on.

### 5.3 The three order kinds and the five intents

**Order kinds.**

- `"move"` - go `dx`, `dy` metres this tick. The only kind that carries
  movement. Also pass an `intent` so the unit knows what it is doing while it
  moves.
- `"hold"` - stand still this tick, on purpose. Distinct from saying nothing; see
  section 3.2. Pass `"intent":"hold"`.
- `"formation"` - stand in this shape and say nothing about where you go. Use
  this for a formation change, not for movement. Passing `dx`/`dy` alongside a
  `formation` is contradictory: the row is meant to leave the movement channel
  silent, because a man already standing in his slot must not be told to stand
  still in order to be in it. The engine's own rules still decide whether he
  fights or closes.

**Intents.** `"advance"` (closing on the enemy), `"engage"` (in contact),
`"withdraw"` (a broken unit backing off rather than running), `"rout"` (running
from the field), `"hold"` (standing where you were told to stand).

`"hold"` is the one intent the engine's own decision stage never reaches. No rule
in the engine decides that a man should stand still; a commander may. So a
`"hold"` order is something you can write and nothing you will see arrive on its
own.

**Formations.** `"line"` (abrest, neither adds nor takes anything away),
`"column"` (narrow, deep, fast, can use a road, shoots almost nothing to the
front), `"wedge"` (a point that goes in first, which breaks a line and is caught
from the side), `"square"` (a hollow square, a wall rather than a spear, the only
shape here that turns a fast mover away), `"skirmish"` (spread out so one burst
cannot hit ten men, paid for in the hand-to-hand). `""` means "no opinion".

### 5.4 Terrain

Only `"open"` is modelled. `""`, `"open"`, `"open-field"` and `"level"` all mean
open ground. Any other name is an **error naming the one that exists**, not a
silent downgrade, because a battle fought on different ground than the one asked
for is not the battle that was asked for.

Terrain belongs to the battle, so it is written in *both* rosters and the two must
agree. A script naming it on one side only is refused.

### 5.5 A worked example

Two sides, eight a side, meeting in columns, then the Company advancing and
pinning one man while the Host squares up. This is a checked-in golden fixture,
`internal/battle/testdata/golden/both-sides-ordered-8v8.script`, reproduced here
so this file stands on its own:

```
{"kind":"battle_script","version":1,"name":"both-sides-ordered-8v8","seed":106003,"a":{"units":8,"label":"the Company","terrain":"open"},"b":{"units":8,"label":"the Host","terrain":"open"},"steps":8}
{"tick":0,"unit":0,"order":"formation","intent":"advance","formation":"column"}
{"tick":0,"unit":8,"order":"formation","intent":"advance","formation":"line"}
{"tick":10,"unit":1,"order":"move","intent":"advance","dx":1.1,"dy":-0.2}
{"tick":10,"unit":9,"order":"move","intent":"advance","dx":-1.1,"dy":0.2}
{"tick":40,"unit":2,"order":"hold","intent":"hold"}
{"tick":40,"unit":10,"order":"formation","intent":"engage","formation":"square"}
{"tick":90,"unit":3,"order":"move","intent":"advance","dx":0.5,"dy":0.5}
{"tick":90,"unit":11,"order":"move","intent":"advance","dx":-0.5,"dy":-0.5}
```

Its recorded result is checked into `both-sides-ordered-8v8.hash` beside it:

```
c152b47f12ef7c5f  A (enemy broke)  ticks=333  orders=8
```

### 5.6 What a script is refused for

Every one of these is an error, never a repaired script that fights a battle
nobody asked for:

- a version it does not know;
- a step count that disagrees with the header, which is a truncated file;
- steps out of tick order, because the order of decisions is part of the battle;
- two steps for the same unit on the same tick, because the command channel has
  one slot per unit and the second would silently overwrite the first;
- a step naming a unit the roster does not have;
- an `order`, `intent` or `formation` name that is not one this build has;
- a side with fewer than one unit, or asking for both `no_ranged` and `all_ranged`;
- terrain the engine does not model, or the two sides disagreeing about it.

Note the asymmetry, which is deliberate. A **script** is hand-written, so an
unknown name is an error *naming the good values*: an author who typed `advnce`
wants to be told. An **order log** is machine-written, so an unknown name maps to
a sentinel and fails the **digest** instead of the parse.

### 5.7 Checked-in fixtures and the nightly sweep

Three golden fixtures live in `internal/battle/testdata/golden/`, each a script
plus the hash it produced:

```
both-sides-ordered-8v8    c152b47f12ef7c5f  A (enemy broke)      ticks=333  orders=8
one-side-ordered-4v4      536862cfcf23cc29  A (enemy destroyed)  ticks=471  orders=4
uncommanded-4v4          e5f70b16e018c832  B (enemy destroyed)  ticks=461  orders=0
```

Any simulation change that moves one of these fails loudly, which is the point: a
balance change and a determinism bug both move the hash, and neither should be
able to reach a commit without a human reading why.

Re-record a fixture only when the change to the outcome was intended, and say so
in the commit message with the old and new hashes in it.

Expect a fixture to move when a balance constant, the intent stage, the morale
stage, or the targeting stage changes. All three fixtures move together when the
engine's own decisions change, which is the tell: a balance knob moves the
outcome but usually not all three hashes at once.

## 6. The commands

```
# fight a battle and record it (uncommanded: the engine drives both sides)
go run ./cmd/simrun battle -seed 7 -a-units 40 -b-units 40 -label "ridge farm"

# fight a scripted battle and record it
go run ./cmd/simrun battle -seed 106003 -script my.battle

# what is recorded
go run ./cmd/simrun replay -list

# re-run one and compare
go run ./cmd/simrun replay -battle battle-7

# the one line a CI job wants
go run ./cmd/simrun replay -battle battle-7 -quiet
```

**Exit codes**, kept apart because a CI job that sees only "failed" cannot tell
them:

| Code | Meaning |
|---|---|
| 0 | The replay reproduced the recorded battle. |
| 1 | The replay ran and **disagreed**. A finding, not a crash: the replay path worked and the answer was no. The number that moved is printed. |
| 2 | The command line does not make sense. |
| 3 | The record could not be replayed at all: corrupt file, a balance file whose version has moved on, or a roster the log was not recorded against. |

A match requires **both** the result hashes and every published number in the
record to agree. Comparing the hashes alone is not enough: a record whose recorded
casualty figure was edited still quotes the hash the battle really produced, so
the hashes agree while the file says two things about the same battle at once.
The mirror case also exists, where every number agrees and the hashes do not,
because the units finished somewhere else.

## 7. Limits worth knowing before you rely on any of this

- **Bit-exactness is claimed for one build on one platform, not across
  architectures.** Float64 arithmetic is not portable and no amount of care in
  this package makes it so.
- **A change smaller than one ULP cannot change a battle.** `Battle.commit`
  applies a step by addition (`u.X += d.DX`), and a unit's `X` is hundreds of
  metres from its start line, where one ULP of float64 is about 3e-14 m. A replay
  with an order nudged below that threshold finishes on bit-identical
  coordinates. This is a limit on what the simulation can *represent*, not on
  whether it is deterministic. The order log's own digest reads exact bits and
  *does* catch a one-ULP edit to a recorded order; the result hash can only
  report a difference the engine carried through to a unit's final state.
- **A record describes a battle whose forces were generated from a seed and a
  roster.** A battle whose forces a caller wrote out by hand as literal units is
  still recorded and still replayable in memory, through `battle.Record` and
  `battle.Verify`, but it does not get a file: there is no honest way to put
  literal `battle.Unit` values back into a record without inventing a schema for
  every field of a unit.
- **A side-level order cannot be expressed.** `UnitCommand` is one slot per unit,
  so there is no way to write "the whole line advances" as one row. `Replay`
  refuses such a row rather than dropping it.
- **A log that reached its bound is not replayable.** If the recorder refused any
  rows, the log does not describe its battle. `SaveBattle` refuses to save one, and
  `NewReplayer` refuses to run one. Pass a bound you do not expect to reach and
  check `Recorder.Refused` afterwards.

## 8. Where the code is

| Thing | File |
|---|---|
| Order log format, encode, decode, digest | `internal/battle/orderlog.go` |
| Order script format, encode, decode, run | `internal/battle/script.go` |
| Replay, verify, the verdict | `internal/battle/replay.go` |
| Battle record format, store, replay from files | `internal/battle/battlefile.go` |
| Result hash and what it covers | `internal/battle/resulthash.go` |
| The two CLI commands | `internal/simrun/battle.go` |
| Golden fixtures | `internal/battle/testdata/golden/` |
