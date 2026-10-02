# Local Agent 1: Battle-Sim Branch Triage & Merge (milo's Lane)

## PAX BRIEF 2026-10-01 — READ FIRST

You are running on the boss's personal computer. Your job: untangle milo's battle-simulation branch and get the real sim code merged to main. This is the #1 bottleneck on the project.

I'm AFK. Ask no questions. Work autonomously until done. Make reasonable decisions and keep going.

## Verified facts (from git, not bus chatter)

- Branch `worker/milo/simulation` exists on origin. Tip was `0af6e7a` ("milo: snapshot in-progress battle sim work").
- It is **~95 commits ahead / ~207 behind main**. Zero of its 95 commits are on main.
- Main has **no `cmd/` directory** — the battle server (`cmd/battleserver`, commit f0ab262 on milo's branch) never landed.
- **Phantom SHAs:** milo cited `030c3bb`, `b5d4955`, `c91828b` on the bus — all 404 on GitHub. Either force-pushed away or never pushed. Do not trust SHA claims from the bus; verify everything via the GitHub API.
- His branch mixes battle-sim code with **non-sim content**: voice batches, concept art, SFX packs, dialogue/writing — plus **UI implementations of MASTER_PLAN tasks 2B–4F** (battle HUD, diplomacy, character sheet, party mgmt, inventory, quest log, time controls, day/night, settlement 3D, town menus) that **duplicate Rowan's already-landed work**. Merging wholesale would clobber Rowan's lane.

## Mission

Split `worker/milo/simulation` into reviewable chunks and land the battle-simulation code on main. Do NOT merge the branch as-is.

### Step 1 — Audit (do not skip)
1. `git fetch origin` (if HTTPS creds missing, use the GitHub API for remote reads).
2. List all commits on `origin/worker/milo/simulation` not on `main`: `git log --oneline main..origin/worker/milo/simulation`.
3. Categorize every commit into buckets:
   - **SIM**: battle simulation Go code (`services/simulation/`, `cmd/battleserver`, formation AI, determinism/replay fixtures, commander/surrender fixes, battle-size knob)
   - **ASSETS**: voice, art, SFX, dialogue, writing content
   - **DUPLICATE-UI**: UI work overlapping Rowan's landed tasks (2B–4F) — list which files collide
   - **OTHER**: anything else
4. Write the categorization to `docs/battlesim-triage.md` on your working branch.

### Step 2 — Rebase the SIM bucket onto current main
1. Create branch `worker/local/battlesim-sim-only` from current `origin/main` tip (verify tip via GitHub API first).
2. Cherry-pick ONLY the SIM-bucket commits, in order. Resolve conflicts in favor of main's existing code where Rowan's UI is involved — sim code must not touch `clients/campaign/src/ui/`.
3. The deliverable: `services/simulation/` battle code + `cmd/battleserver` building cleanly.

### Step 3 — Verify
1. `go build ./...` in `services/simulation/` must pass. If no Go toolchain on this machine, say so plainly and skip to step 4 — do NOT claim it builds.
2. Run any existing sim tests: `go test ./...`. Report pass/fail counts.
3. Determinism check: if replay fixtures exist, run the sim twice on the same fixture and confirm identical output.

### Step 4 — Land it
1. Confirm `origin/main` tip via GitHub API matches your local parent. If it moved, rebase first. **NEVER force-push.**
2. Fast-forward merge or squash-merge `worker/local/battlesim-sim-only` into main. Push directly to main (standing order: no PRs, no review queue).
3. Post a summary to the crew bus: `~/workspace/skills/relay-bus/bin/relay.py send "local-agent-1: ..."` — what landed, commit SHA, test results.

### Step 5 — Stage the leftovers (do not merge)
- Create branch `worker/local/battlesim-assets` with the ASSETS-bucket commits for later review. Push the branch, do NOT merge to main.
- Write up the DUPLICATE-UI collisions in `docs/battlesim-triage.md` so Rowan and milo can resolve who owns what.

## Constraints
- Push directly to `main`. No PRs.
- Never force-push. Ever.
- Do not touch Rowan's UI files. Sim code only.
- Real verification only: if you can't run Go tests, say so — don't claim "should work."
- If milo's branch moved while you work, re-audit before cherry-picking.
- Commit messages: prefix `feat(battlesim):` or `fix(battlesim):`, reference the original milo commit SHA in the body.

## Done criteria
- [ ] `docs/battlesim-triage.md` committed with full commit categorization
- [ ] SIM code merged to main, `cmd/battleserver` present on main
- [ ] `go build` + `go test` results reported (or toolchain absence reported)
- [ ] Assets staged on `worker/local/battlesim-assets` (not merged)
- [ ] Bus notified with SHA + results
