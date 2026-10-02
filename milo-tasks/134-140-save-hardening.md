# Milo tasks 134-140: save/load hardening and docs

## Task 134
main.go's "inspection record rather than a save game" comment now points at the
real save/load contract (POST /v1/save, -save-file, campaign/save.go).

## Task 135
Flags wired: `-load-file` (boot restore, runs before the clock starts),
`-save-file` (shutdown save after the clock stops). Documented in
`goals/ship-the-bannerlord-style-web-game/SAVE-FORMAT-FOR-ROWAN.md`.

## Task 136: full-world timings (97 settlements, 345 characters, day 41)
- Save: 8.6s, 35MB JSON.
- Load: 13.2s, restored to day 41.

## Task 137: race test
Saved while the clock ran at 3 days/sec. The save (day 47) loaded cleanly back
to day 47 and the world continued. No corruption. (Save takes the read lock;
ticks take the write lock; the captured world is tick-atomic.)

## Task 138
Save format documented for Rowan; schema posted to the crew bus 2026-10-02.

## Task 139
Match check: Rowan's F5 quicksave is CLIENT state (browser localStorage: camera,
panels, selections). The server save is the WORLD (97 settlements, RNG position,
cause log, ~17-21MB). They are different things by design. For quickload to
restore the world, the client POSTs server-save bytes to `/v1/load`. Posted to
Rowan on the bus; awaiting his reply on whether his slot format aligns or he
needs a slimmer endpoint.

## Task 140
`go test -race` on internal/model (5 save tests) and internal/cause: all green.
Wall: ~50s.
