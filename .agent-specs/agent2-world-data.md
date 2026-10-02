# Agent 2: World Data Integration (Hana's Lane)

## PAX UPDATE 2026-10-01 ~18:05 EDT — READ THIS FIRST
- Local main was stale; I resynced it to the origin/main tip (was 819cafa4). Verify with
  `git log --oneline -1` and re-check the live tip via GitHub API before pushing.
- Your last session died with uncommitted WIP. I backed up the 4 modified files to
  `~/workspace/goals/mount-blade-bannerlord-web-clone/hidden_files/agent2-wip-backup-20261001/`
  (clients/campaign/src/world/load.ts, types.ts, clients/campaign/tools/check-no-fixtures.mjs,
  fetch-world-data.mjs). Reconcile: re-apply the parts that are still valid against the new
  main, redo the rest. Do NOT blindly overwrite — Rowan's 5 new commits touched the client.
- Your last session was killed by permission auto-rejects (external_directory, tile tool).
  Rule: if a tool call is auto-rejected, DO NOT retry it — route around it (stay inside the
  repo, use node/python stdlib instead of external CLIs). Never loop on a rejected call.
- Push workflow: confirm local parent == live origin/main SHA via GitHub API first.
  Non-force only. `git fetch` hangs here — use the API for remote reads.

I'm AFK. Ask no questions. Work autonomously until the tasks are complete. Do not stop for clarification — make reasonable decisions and keep going.

## Context
Repo: ~/workspace/bannerlord-clone (git remote: Mrfentmen/bannerlord-clone, branch: main)
You are filling in for Hana (world data / map lane). Hana is down. Her Ohio River Valley data (487 settlements, 439 roads, 4,653 rail segments) needs to be integrated.

## Tasks

### 1. Verify Place Boundaries Data
- Check services/world-data/exports/place_boundaries.jsonl.gz exists and is valid
- Verify the data loads correctly
- Check that place_boundaries.parquet is in sync

### 2. Integrate Ohio River Valley Data
- Find Hana's Ohio data (487 settlements, 439 roads, 4,653 rail segments)
- Ensure it's properly exported and referenced by the client
- The client should be able to load this instead of placeholder map data

### 3. Cache Validation
- Verify CACHE_FORMAT_VERSION is current
- Ensure cache invalidation works correctly (Hana was working on this)
- Test that the client loads cached world data without errors

### 4. Map Data API
- Ensure the world data is accessible via the API or static files
- The client needs to fetch settlements, roads, and boundaries
- Document the data format for the client team

## Rules
- Push direct to main (no PRs) — this is the workflow
- Run tests before pushing
- If tests fail, fix them — do not push broken code
- Commit messages: clear, describe what changed
- Work until ALL tasks are done
