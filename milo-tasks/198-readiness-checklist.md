# Production readiness checklist (task 198)

## Sim
- [x] Battle chunk reviewed and pushed (review/sim-core-2).
- [x] Determinism proven (byte-identical battle fingerprints, save/load).
- [x] 500v500 benchmark: contact, reconciliation exact.
- [x] Size budget: 1200/side in 5m, 250us budget holds.
- [x] Fuzz: 60s clean. Stalemate: passes.
- [ ] Full suite green: NO — 55m VM timeout on 8002-unit test (documented limit).

## Save/load
- [x] Round-trip proven byte-identical.
- [x] Race test clean. -race green.
- [x] Docs for Rowan posted.

## Client
- [x] tsc clean. Build green.
- [ ] vitest fully green: NO — 3 failures (Rowan's lane).
- [ ] Browser playtest: BLOCKED — needs public URL.

## Content
- [x] Audio (109), GLBs (39), dialogue clean.
- [ ] Licenses: Kenney orphans need Pax call.

## Integration
- [ ] Pax chunk sign-off: PENDING.
- [ ] Collisions resolved: PENDING (143-148).

## Verdict
NOT production-ready. Blockers: Pax integration ruling, 3 vitest failures,
browser playtest, license cleanup. All documented with evidence.
