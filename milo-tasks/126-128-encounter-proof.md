# Milo tasks 126-128: deterministic encounter -> resolve -> writeback

## Task 126: deterministic encounter trigger

No random waiting: `POST /v1/encounters` takes explicit party IDs.

Request schema (`wire.EncounterRequest`):
```json
{"attackerPartyId": 191, "defenderPartyId": 2}
```

Response: `enc-1`, attacker "Ethmund's company" (147 troops, power 74.2),
defender "Varenren's company" (156 troops, power 78.8), status "pending".
Party IDs are the simulation's integer IDs (found via a save file's
`world.parties` map; there is no party-listing endpoint yet).

## Task 127: resolve end to end

`POST /v1/encounters/enc-1/resolve` -> status "resolved":
- winner: party 2 (defender)
- attackerLosses: 81, defenderLosses: 27, loot: 49

## Task 128: campaign writeback verified

Save-file comparison before/after:
- Party 191: 147 -> 66 troops (exactly the 81 lost). Morale 1 -> 0.
- Party 2: 156 -> 129 troops (exactly the 27 lost).
- Prisoners: none taken (auto-resolve; capture runs on live battle wins).

The loss numbers in the resolution match the troop deltas in the world exactly.
