# Milo task 109: non-battle internal-package tests on review/sim-core-2

Command: `go test -count=1 -timeout 20m` over all `./internal/...` except
`internal/battle`. Wall time: ~18 minutes (1086s).

## Result: 3 failures, all in one test, all expected

`TestTheGoldenFixturesVerifyThroughTheFile` (internal/replay/crosscheck_test.go)
fails on all three golden fixtures:

| fixture | recorded | now |
|---|---|---|
| both-sides-ordered-8v8 | c152b47f12ef7c5f | ece0abc308963bac |
| one-side-ordered-4v4 | 536862cfcf23cc29 | 8de36a29c4bba544 |
| uncommanded-4v4 | e5f70b16e018c832 | 2ec2dbe0b6948de0 |

The test's own comment says this failure is the intended behavior of the
cross-check: it fails when the engine legitimately changes. The 21-commit
chunk intentionally changed battle outcomes (hold-your-ground fix, aimed fire,
morale fixes — all reviewed KEEP in task 101). "replay from bytes matches true"
on all three: the replay machinery is consistent, only the recorded hashes are
stale.

Per REPLAY_FORMATS.md 5.7, the fixtures must be re-recorded with old+new hashes
in the commit message. That is agent2's lane (replay/determinism) — flagged on
the crew bus 2026-10-02. Not re-recorded unilaterally.

All other non-battle packages: pass. (Note: my original run script had an
`EXIT=$?` pipeline bug that masked the failure; the log above is the true result.)
