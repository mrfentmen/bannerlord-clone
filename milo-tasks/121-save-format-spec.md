# Task 121 — Authoritative Save-Format Spec

Author: Milo, 2026-10-02. Target: services/simulation (main line, apiserver).

## Problem

`cmd/apiserver/main.go` documents the periodic snapshot as "an inspection record
rather than a save game". The on-disk `diskSnapshot` (campaign.go) is a wire read
model: towns, roster stacks, cause rows. It does NOT contain the full
`model.State` (parties, relations, oaths, wars, sieges, NextID, RNG state), so a
server restart cannot restore the world. Rowan's client quicksave (F5, 6a338e2)
writes a Quicksave slot; quickload is deliberately unshipped because there is no
server restore path. This spec defines it.

## What a save file contains

Top-level JSON object, versioned:

```json
{
  "format": "mbclone-save",
  "version": 1,
  "savedAtTick": 12345,
  "world": { ... },        // model.State, full
  "campaign": { ... },     // apiserver campaign-level fields
  "rng": { "state": 987654321 }
}
```

### world — model.State, all of it

- Year, Tick, Season (float64/int/float64).
- Towns, Villages, Parties, Rulers, Sides, Routes, Sieges, Wars: `map[int]*T`.
  All entity struct fields are exported (verified 2026-10-02); plain JSON objects.
- NextID: `map[int]int` — the ID allocators. MUST be saved, or a restored world
  will hand out duplicate IDs for new parties/armies.
- Relations, SideRelations: `map[Pair]float64`. Pair is a struct key; encoding/json
  cannot marshal struct keys. Encoding: `"A:B": value` string keys (e.g. `"3:7"`),
  normalized with A <= B per MakePair. Unmarshal parses back and validates A <= B.
- Oaths: `map[int]Oath` — plain.
- Unexported cache fields on State (rulerPairs, sidePairs *PairSlice): EXCLUDED
  from the file; rebuilt on load by the existing sorted-key construction.

### rng — engine master stream

`internal/rng.Rng` is one uint64 (`state`). Save it verbatim. On load, reseed the
engine's Rng to the saved state. Per-tick substreams derive from it, so restoring
the master state restores determinism from the save point forward. (Full
bit-identical replay from world-genesis is NOT claimed; determinism is guaranteed
only from the restore tick onward, which is what quickload needs.)

### campaign — apiserver-level fields

- seed, startYear (from Options), playerRuler, homeTown, party (int IDs).
- character sheet (POST /v1/character payload).
- clock: scale, acc, ticksRun (NOT lastScale/started/done — runtime only).
- roster state, price history, notifications (+notifSeq), prisoners, companions.
- pending jobs queue: drained or explicitly saved? DECISION: the save happens at a
  tick boundary with the queue drained (jobs only enter via tick). If the queue is
  non-empty, the save is refused with an error rather than silently dropping
  player orders. (Prevents "I clicked march, saved, reloaded, my order vanished".)
- cause.Log: the ring buffer. DECISION: saved (it is bounded). Restored into a
  fresh log. If the log format ever changes, version bump handles it.

Explicitly NOT saved: mutexes, channels, context, WaitGroup, snapshotPending
bytes, event bus subscribers, config file contents (config is referenced by
path+version; a version mismatch on load is a hard error, not a silent drift).

## Format rules

1. `format` must equal "mbclone-save" and `version` must be <= the loader's
   supported version, else refuse with a clear error.
2. Canonical JSON: maps are serialized with sorted keys (Go's encoding/json does
   this for map[string]/map[int] natively; Pair maps use the "A:B" string form
   which sorts lexicographically — document that this is string sort, not numeric).
3. Large world test: 97 settlements / 345 characters must save+restore (task 136).
4. Save-then-immediately-restore must yield identical StateHash-equivalent world
   (task 125): compare via JSON round-trip equality of the `world` section.
5. -race clean (task 140): save path takes RLock, never Lock, and never blocks
   the tick loop; the actual disk write happens after unlock (same pattern as
   snapshotPending).

## API surface (tasks 123-124)

- `POST /v1/save` → writes save file, returns {tick, path, bytes}. Refuses when
  the job queue is non-empty.
- `POST /v1/load` with {path} → stops clock, restores world+rng+campaign, resumes.
  Only when no battle is mid-tick (tick boundary).
- Server flags: `-save-file` (write on exit), `-load-file` (boot from save).
  Documented in main.go flag block.

## Compatibility with Rowan's quicksave

Rowan's F5 quicksave writes the client-visible slot. The client slot format and
this server format are DIFFERENT layers: his is UI state, mine is world state.
Task 138/139: publish this spec on the bus; the handshake is that quickload calls
`POST /v1/load` with the server-side save the server wrote at quicksave time
(server writes its own save file on every client quicksave request).

## Implementation order

122: model.State marshal/unmarshal + round-trip unit tests.
123: save write path + curl test. 124: restart restore. 125: live save/advance/restore.
