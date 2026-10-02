# Milo tasks 129-133: recruit pool, party lookup, march semantics

## Task 129: recruit pool zero — root cause and fix

Root cause: militia is a FLOW from the Watch building, not a stock.
- `construction.go:219`: `w.Add(..., "militia", lv * WatchMilitiaPerLevel, ...)` —
  only the Watch building creates militia.
- `worldgen.go`: never initialized `Militia` (stayed 0).
- Garrison pool is only the surplus above `GarrisonCap` (`recruit.go:72`); worldgen
  sets `Garrison = pop * GarrisonPerCapita` which sits at/below cap.
- Result: both pools zero in every town at game start; the player can never hire.

Fix (on milo/save-load): new `world.militia_per_capita` config (0.0005, ~50 in a
100k city), seeded in worldgen like garrison: `t.Militia = max(1, pop * perCapita)`.
Live-verified: town 78 went from 0 to 1262 militia on a fresh world.

## Task 130: partyByRef / party lifecycle — fixed

Two bugs:
1. `partyForOrder` (trade.go) silently fell back to the player's party when a
   non-empty ref didn't resolve — orders could hit the wrong army. Now returns nil;
   all five callers already handle nil with "no party" errors.
2. `partyByRef` (ids.go) only accepted "party-123" wire IDs, not bare "123".
   Now accepts bare integers.

Live proof: recruit with `partyId: "191"` accepted; recruit with
`partyId: "party-99999"` now fails loudly `not_found: no party "party-99999"`
instead of silently using the player's party.

## Task 131: successful recruit transaction (live)

`POST /v1/recruit {"partyId":"party-191","townId":"town-78","unitId":"militia","quantity":10,"expectedDay":14}`
-> `{"accepted":true,"unitName":"Cedarport Militia","quantity":10,"totalCost":0,"newCount":10,...}`.
Verified: town 78 militia 1262 -> 1252; roster gained a "Cedarport Militia" stack of 10.
Note: the roster mirrors party troops via syncToParty; hiring grows the roster, which
is the client-facing army book.

## Tasks 132-133: march arrival semantics — no arrival bug

The "0,0" is NOT a reset on arrival. `arrive()` (march.go:182-183) correctly sets
position to DestX/DestY. The (0,0) parties are born at the origin:
- worldgen `generateParties`: `var x, y float64` stays (0,0) when the ruler has no
  town at creation time (rulers.go:452-454).
- The mercenary caravan never set X/Y at all (rulers.go:506) — fixed to use the
  ruler's town position.
- `attachParty` (campaign.go) set Y to the town's X (`townPos` instead of
  `townPosY`) — fixed.

Live march test: party 191 marched 0,0 -> Wildhill. It did NOT arrive — it starved
to death en route (0 days of food; the plan warned about this) and the attrition
system deleted it below MinTroopsToPersist. That is correct game behavior, not a
coordinate bug. Arrival-coordinate verification with a supplied party is still open.
