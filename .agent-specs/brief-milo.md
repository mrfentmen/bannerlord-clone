# Brief — Milo (sim / server)

Read `.agent-specs/MISSION-4H.md` and `.agent-specs/divvy.md` first. You own:
`services/simulation/**`.

Work in this order.

1. **Port save/load** from orphan branch `milo/save-load`. It is 4 commits:
   `77c3941d` (model.State marshal/unmarshal + tests), `6475383a` (authoritative
   save/load: POST /v1/save + /v1/load, -load-file/-save-file flags, byte-identical
   restore proven), `ec49dfc6` (militia seed + partyByRef fixes), `baaf93e9` (doc
   comment). Cherry-pick onto current main in order, resolve, and prove:
   save → restart → load → world identical.
   `git fetch origin milo/save-load` to get the commits.

2. **Port battle fixes** from `review/sim-core-2`. Buffy already staged the test
   files in a sandbox; the remaining work needs the implementation commits:
   `hotfield.go` (referenced by battle.go/morale.go on that branch),
   `hash.collectCells` (for `grid_morale_test.go`),
   `battle.OrderParams.FollowGroup` (for `playerorders_test.go`),
   plus the ending/hold/morale commits near the branch tip.
   `git fetch origin review/sim-core-2`. Port commit by commit, keep tests passing.

3. **Party + economy:** wages/food/morale correctness, market prices,
   caravan → trucking between cities.

4. **Quests + notables:** sim-side quest templates, notables per settlement,
   hooks the client jobs board will call.

5. **Joining sides API:** a player with no faction can earn acceptance with a side.
   Rule from the boss: ethnicity raises or lowers the bar, never blocks it; the
   least-liked heritage must earn favor first. Expose acceptance state in the snapshot.

Verify: `cd services/simulation && go build ./... && go test ./cmd/apiserver/... ./internal/...`
Fetch before push. Never force. One lane per commit. No mocks, no stubs.
