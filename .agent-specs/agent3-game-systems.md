# Agent 3: Game Systems (Milo's Lane Backup)

## PAX UPDATE 2026-10-01 ~18:05 EDT — READ THIS FIRST
- Local main was stale; I resynced it to the origin/main tip (was 819cafa4). Verify with
  `git log --oneline -1` and re-check the live tip via GitHub API before pushing.
- **Go toolchain: there is NO Go on this VM** (checked /usr/local/go, /opt, PATH — absent;
  your last session's `mkdir /home/hatch/toolchain` install was auto-rejected). You run as
  root, so options: `apt-get install -y golang-go`, or extract a Go tarball into /tmp or
  inside the repo — NOT /home/hatch/toolchain (that path is auto-rejected, do not retry it).
  One failed install attempt = investigate; two = stop and do the client-side work instead.
- If Go proves unobtainable: do task 3 (character creation, client-side, no Go needed) and
  write the quest/diplomacy API as concrete TypeScript types + endpoint specs for the sim
  team. Report "Go toolchain unavailable" as a hard blocker — do not fake Go results.
- Push workflow: confirm local parent == live origin/main SHA via GitHub API first.
  Non-force only. `git fetch` hangs here — use the API for remote reads.

I'm AFK. Ask no questions. Work autonomously until the tasks are complete. Do not stop for clarification — make reasonable decisions and keep going.

## Context
Repo: ~/workspace/bannerlord-clone (git remote: Mrfentmen/bannerlord-clone, branch: main)
You are backing up Milo (game writing / audio lane). Milo is flaky (going on/offline). Focus on game systems that are missing.

## Tasks

### 1. Quest System Foundation
- Design and implement a basic quest system in the Go simulation
- Quests should have: ID, title, description, objectives, rewards
- At least 5 starter quest types:
  - Deliver goods to a town
  - Defeat a bandit party
  - Recruit X troops
  - Earn X gold via trading
  - Visit X towns
- API endpoints: GET /v1/quests, POST /v1/quests/{id}/accept, POST /v1/quests/{id}/complete

### 2. Diplomacy Actions
- Implement basic diplomacy in the Go simulation:
  - Declare war / make peace (between player's faction and others)
  - Pay tribute to avoid war
  - Form alliance
- API endpoints for each action
- Update the AtWar state accordingly

### 3. Character Creation
- Build the character creation flow (client-side)
- Backgrounds, six attributes, 18 skills (see TASKS.md backlog)
- Save character to the campaign

## Rules
- Push direct to main (no PRs) — this is the workflow
- Run tests before pushing: `go test ./...` for Go, `npm run test` for client
- If tests fail, fix them — do not push broken code
- Commit messages: clear, describe what changed
- Work until ALL tasks are done
