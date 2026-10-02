# Agent 1: Client UI Completion (Rowan's Lane)

## PAX UPDATE 2026-10-01 ~18:05 EDT — READ THIS FIRST, IT OVERRIDES STALE PARTS BELOW
Your last session stalled on two claims. I investigated; here are the verified facts:
- **The "divergence" is resolved.** Local main was STALE (missing Rowan's work). I resynced
  local main to the origin/main tip via the Git Data API. Verify: `git log --oneline -1`
  must show the origin/main tip (was 819cafa4 "Rowan: loading tips rotation"; Rowan pushes
  often — re-check the tip via GitHub API before you push). The old local commits 3d57abe
  (MASTER_PLAN, superseded by the boss's f1579e7) and c68ad20 (AtWar fix, already on origin)
  were redundant and are gone. Nothing was lost.
- **Your "backend not on main" claim was wrong** — you were reading the stale local main.
  On the real main: `services/simulation/cmd/apiserver/api/battle.go` EXISTS with
  `GET /v1/encounters` (commits 39c9d6c, 76337bf). Rowan ALREADY mounted battle UI +
  save/load UI into the app shell (f6b7dd8) and did encounter polling (0485aac).
- **Your spec's paths were wrong.** Real layout: `clients/campaign/src/{data,design,main.ts,scene,ui,world}`,
  `services/simulation/`, `services/world-data/`. There is no `src/battleflow/`, no `src/saves/`,
  no `campaign/battle.go`. Re-audit the tree before writing any code.
- **New task list (do not redo Rowan's finished work):**
  0. Confirm `git log --oneline -1` matches the live origin/main tip (GitHub API). If it
     doesn't, STOP and report — do not build on a stale tree.
  1. Audit the /v1 API surface in `services/simulation/cmd/apiserver/api/` against the
     endpoint list in the old spec below (POST /v1/encounters, /resolve, /v1/battles/*, orders...).
     Fill ONLY genuine gaps. Read Rowan's battle UI first (`clients/campaign/src/ui/`) —
     extend it, don't duplicate it.
  2. Trading UI is genuinely unclaimed: build it against the REAL trade endpoints in
     `services/simulation/cmd/apiserver/campaign/markets.go` (the Tier-1 API server from
     agent2/wt is merged on main now).
  3. Push workflow (mandatory): before pushing, GET the live origin/main SHA via the GitHub
     API and confirm it equals your local parent. Non-force only. If the remote moved,
     rebase/reconcile first — NEVER force-push.
- `git fetch` hangs in this sandbox (no HTTPS creds). Use the GitHub API for remote reads
  and writes: read via `python3 ~/workspace/skills/github/bin/gh_api.py GET <path>`
  (e.g. `/repos/Mrfentmen/bannerlord-clone/git/refs/heads/main`); for writes
  (blobs/trees/commits/ref updates) POST through the same gh_api.py with
  `--body-json`. If you need a reference for the auth pattern, copy the
  `dynamic_credentials` usage from
  `~/workspace/goals/mount-blade-bannerlord-web-clone/hidden_files/resync_main_parallel.py`
  (api() helper) — it is proven working. NEVER touch
  `~/workspace/muse-relay-prereq/` — reads there are auto-rejected in this
  sandbox; route around, do not retry, do not stop.

I'm AFK. Ask no questions. Work autonomously until the tasks are complete. Do not stop for clarification — make reasonable decisions and keep going.

## Context
Repo: ~/workspace/bannerlord-clone (git remote: Mrfentmen/bannerlord-clone, branch: main)
You are filling in for Rowan (client UI lane). Rowan pushed battle UI (src/battleflow/) and save UI (src/saves/) but they use LOCAL fallback instead of the real API.

## Tasks

### 1. Connect Battle UI to Real API
- Find src/battleflow/ and src/saves/
- Replace LOCAL fallback with real fetch calls:
  - POST /v1/encounters {attackerPartyId, defenderPartyId}
  - GET /v1/encounters/{id}
  - POST /v1/encounters/{id}/resolve
  - POST /v1/battles {encounterId}
  - GET /v1/battles/{id}
  - POST /v1/battles/{id}/orders {advance, hold, retreat, focusFire}
  - POST /v1/battles/{id}/end {reason}
- Handle API errors gracefully (show user-friendly messages)
- The backend is live — my battle sim (campaign/battle.go) and auto-trigger (campaign/encounter_tick.go) are on main

### 2. Encounter Polling
- Add a poller that checks for auto-triggered encounters involving the player's party
- Poll GET /v1/encounters every 5 seconds (or use WebSocket if available)
- Show a notification/banner when a new encounter appears: "Hostile force encountered!"
- Link to the battle UI

### 3. Trading UI
- Build the market trading interface
- Show goods with prices, buy/sell buttons, quantity selector
- Use the existing trade API endpoints (check services/simulation/cmd/apiserver/api/ for trade routes)
- Display player's money and cargo space

## Rules
- Push direct to main (no PRs) — this is the workflow
- Run tests before pushing: `npm run test` and `npx tsc --noEmit`
- If tests fail, fix them — do not push broken code
- Commit messages: clear, describe what changed
- Work until ALL three tasks are done
