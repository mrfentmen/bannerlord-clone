# AGENTS.md

Working notes for agents in this repository. Facts here were verified on
2026-10-03; the older agent specs under `.agent-specs/` predate them and are
wrong in the places called out below.

## Before you build anything

Confirm local `main` is the live tip. `git fetch` **does** work here (see
Push workflow), so:

```sh
git fetch origin main && git rev-parse origin/main
```

If that is not your parent, stop and reconcile. Building on a stale tree is how
the previous stall happened.

## Push workflow

Push direct to `main`, no PRs, non-force only.

**Fetch works; push does not.** `git fetch origin main` succeeds, apparently
without credentials at all -- the repository is public, so the earlier report
that "fetch hangs" was almost certainly a fetch that was never given enough
time, or one that went through an interactive prompt. Reads of the remote can
be done with plain git:

```sh
git fetch origin main && git rev-parse origin/main
```

`git push` cannot be done with plain git. The credentials socket holds a token
that is accepted by the REST API but not by git-over-HTTPS ("Password
authentication is not supported for Git Operations"), so a push fails with
`could not read Username` or `Invalid username or token` no matter how the
askpass is wired. Use the Data API instead: POST the blobs, tree, commit and
ref update through `dynamic_credentials.add_surrogate_to_request`, as
`~/workspace/goals/mount-blade-bannerlord-web-clone/hidden_files/resync_main_parallel.py`
does in its `api()` helper. Never write the token to a file.

Two things to do around an API push, both of which are load-bearing:

- The API normalises commit metadata, so the pushed commit gets a **different
  SHA** than the local one with an identical tree. After pushing, run
  `git fetch origin main` and `git reset --keep <remote-sha>`; the trees match,
  so the working tree and index are left alone. Never leave `main` on a local
  commit the remote does not have -- that is precisely the divergence that
  stalled the previous session, and the API workaround is what recreates it.
- Abort unless the remote tip equals the local parent. The remote moves
  constantly here, and a non-force push that races is how work gets lost.

Reading a ref without any of this:

```sh
python3 ~/workspace/skills/github/bin/gh_api.py GET /repos/Mrfentmen/bannerlord-clone/git/refs/heads/main
```

## Go

The system `go` is 1.22 and `go.mod` requires 1.24, so `GOTOOLCHAIN=local`
makes `go build` fail with a version error that reads like a build break. Use
the newer toolchain explicitly:

```sh
export PATH=/usr/lib/go-1.24/bin:$PATH GOTOOLCHAIN=local
```

The repository is **not** gofmt-clean and `gofmt -l cmd/apiserver/` lists many
untouched files. Do not sweep the tree. Format only the files you wrote.

## Tests

```sh
# Go, apiserver
cd services/simulation && go test ./cmd/apiserver/...

# Client -- about 15 minutes, mostly jsdom
cd clients/campaign && npx tsc --noEmit && npm run test
```

The client suite prints many `Not implemented: HTMLCanvasElement's
getContext()` notices. Those are jsdom without the `canvas` package and are not
failures.

## The client/server contract

There is no schema generator and no shared spec file, so nothing notices when
the two halves of the API disagree -- except `apiContract.test.ts`, which reads
both ends and compares paths. Two consequences worth knowing:

- A provider method can exist, be fully implemented in the fixture provider, be
  covered by passing tests, and still 404 against a real server because no route
  is mounted. This happened to `POST /v1/encounters/flee` and
  `/v1/encounters/defeat`.
- `apiContract.test.ts` compares **paths only**, ignoring methods. Inferring the
  verb would mean parsing which private helper each call went through, and the
  bug worth catching is a path that was never mounted.

When you add a client call, either mount the route or add the path to
`DECLARED_BUT_UNSERVED` with a reason. Two tests keep that list honest: it may
not excuse a path the running game reaches, and it may not excuse a path nothing
requests any more.

## Layout

The client is `clients/campaign/src/{data,design,main.ts,scene,ui,world}`.
There is no `src/battleflow/` under `src/` at the top level and no
`campaign/battle.go`; the simulation is `services/simulation/cmd/apiserver/`.

## Branches with no common ancestor

`agent1/trade-ui` and `agent1/final` share no history with `main` (empty
`git merge-base`). Work in them is not an ancestor of `main` and is not
main's history -- treat it as unrelated history, not as unmerged work to
reconcile. Main carries the trading UI, the battle UI, and encounter polling.

## Stale untracked files in the shared tree

The working tree carries untracked agent scratch and other lanes' in-flight
edits (`.agent*/` worktrees, `lore.md`, `clients/campaign/public/sw.js`). Stage
the paths you changed explicitly. `git add -A` here will commit someone else's
work in progress.