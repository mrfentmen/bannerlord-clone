# Local Agent 2: Missing MASTER_PLAN Tasks 138 + 141 (Rowan's Lane)

## PAX BRIEF 2026-10-01 — READ FIRST

You are running on the boss's personal computer. Your job: implement the two MASTER_PLAN tasks Rowan claimed were done but aren't. This closes out the "all 150 tasks" claim for real.

I'm AFK. Ask no questions. Work autonomously until done. Make reasonable decisions and keep going.

## Verified facts (from git, not bus chatter)

- Rowan claimed "all 150 MASTER_PLAN tasks landed." Audit of main found **zero commits and zero files** for:
  - **Task 138**: "Build a lifetime statistics page — kills, gold earned, battles, hours (accept: stats accumulate across campaigns)."
  - **Task 141**: "Build local leaderboards — best quick-battle/arena/tournament results on this machine (accept: top 10 per mode)."
- Tasks 139 (campaign timeline), 142 (New Game+), 143 (ironman), 144 (difficulty sliders) ARE on main — do not redo them.
- Saves are **browser-local IndexedDB** (locked architecture — no server-side world storage). Both features must persist in IndexedDB.

## Mission

Implement tasks 138 and 141 in the campaign client, tested and pushed to main.

### Task 138 — Lifetime Statistics Page

**Spec (MASTER_PLAN.md line 406):** kills, gold earned, battles fought, hours played. Stats accumulate ACROSS campaigns (not per-save).

1. Find the existing stats/save infrastructure: look at `clients/campaign/src/` for IndexedDB wrappers, save slots, and any existing stats tracking (Rowan's save UI work). Also check `meta/` for related modules.
2. Design:
   - A `LifetimeStats` store in IndexedDB (separate from per-campaign saves): `{ kills, goldEarned, battlesFought, hoursPlayed, campaignsStarted }`.
   - Hook into the events that change these: battle resolution (kills, battles), economy/trade (gold earned), a playtime accumulator (tick while game running, persist periodically).
   - If the game already emits these events somewhere, hook them. If not, add minimal instrumentation at the battle-resolve and gold-transaction call sites — smallest sensible change.
3. Build a statistics page/panel in the campaign UI showing the lifetime totals. Match the existing UI style (look at Rowan's panels first — `timelinePanel.ts`, `DifficultyPanel.ts` — reuse their patterns).
4. Acceptance: start a campaign, fight/earn, check stats; start a NEW campaign, verify totals carried over.

### Task 141 — Local Leaderboards

**Spec (MASTER_PLAN.md line 409):** best quick-battle / arena / tournament results on this machine, top 10 per mode.

1. Find the quick-battle/arena/tournament flows in the client (Rowan's battle UI). Identify where a result is finalized (victory/defeat screen or resolve call).
2. Design:
   - A `LocalLeaderboards` store in IndexedDB: per mode (`quick-battle`, `arena`, `tournament`), keep top 10 entries `{ score, result, date, partyName? }`. Define "score" sensibly per mode (e.g. enemy value destroyed, rounds survived, tournament placement) — document your scoring choice in code comments.
   - On result finalization, insert into the mode's board, trim to 10.
3. Build a leaderboard panel showing top 10 per mode with rank, score, date. Reuse existing UI patterns.
4. Acceptance: complete 2+ results in a mode, verify ordering and the 10-entry cap (seed 11 fake entries in a test to prove trimming).

### Verification (both tasks)
1. `npx tsc --noEmit` in `clients/campaign/` — must be clean.
2. `npx vitest run` — must pass; ADD unit tests for: stats accumulation across campaigns, leaderboard insert/trim/ordering (at least 6 new tests).
3. `npm run build` — must exit 0.
4. If the client has a dev server, load the stats page and leaderboard panel in the browser and screenshot them (proof they render).

### Landing
1. Confirm `origin/main` tip via GitHub API matches your local parent. If it moved, rebase first. **NEVER force-push.**
2. Commit with messages `feat(stats): lifetime statistics page (MASTER_PLAN 138)` and `feat(leaderboard): local leaderboards (MASTER_PLAN 141)`.
3. Push directly to main (standing order: no PRs).
4. Post to the crew bus: `~/workspace/skills/relay-bus/bin/relay.py send "local-agent-2: ..."` — what landed, SHAs, test counts.

## Constraints
- Browser-local IndexedDB only. No server storage. No new backend endpoints.
- Follow Rowan's existing UI patterns — don't invent a new design language.
- Smallest sensible change: hook existing events where they exist, add instrumentation only where missing.
- Never force-push. Never break the build.
- Real tests, real typecheck, real build. No "should work."

## Done criteria
- [ ] Lifetime stats accumulate across campaigns (verified by test + manual flow)
- [ ] Stats page renders in client (screenshot)
- [ ] Leaderboards keep top 10 per mode with correct ordering (verified by test)
- [ ] Leaderboard panel renders in client (screenshot)
- [ ] tsc clean, vitest green (N new tests), build exit 0
- [ ] Both commits on main, bus notified
