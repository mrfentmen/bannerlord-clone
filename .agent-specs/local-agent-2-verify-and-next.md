# Local Agent 2: Verify Tasks 138+141, Then Next Bottleneck (Rowan's Lane)

## PAX BRIEF 2026-10-01 — READ FIRST

You are running on the boss's personal computer. Situation changed: Rowan landed MASTER_PLAN tasks 138 (lifetime stats) and 141 (local leaderboards) in commit `4dd4a5c6` AFTER the original spec for you was written. Do NOT reimplement them. Your job now: verify his work is real and complete, fix any gaps, then move to the next bottleneck.

I'm AFK. Ask no questions. Work autonomously until done. Make reasonable decisions and keep going.

## Verified facts (from git)

- Commit `4dd4a5c6` "Rowan: lifetime statistics page (MASTER_PLAN task 138) + local leaderboards (task 141)" — 14 files, author mrfentmen, on main.
- Files: `clients/campaign/src/meta/lifetimeStats.ts`, `lifetimeStatsPanel.ts`, `lifetimeStats.css`, `leaderboards.ts`, `leaderboardsPanel.ts`, `leaderboards.css`, plus tests (`__tests__/lifetimeStats.test.ts`, `leaderboards.test.ts`, `lifetimeStatsPanel.test.ts`), wired into `main.ts`, `meta/index.ts`, `modes/arena.ts`, `modes/menu.ts`, `ui/hud.ts`.
- His claim: 1168/1168 vitest. Bus claims are unverified — verify yourself.
- Note: his commit message says stats use `localStorage (fentmen.lifetimestats.v1)`. Locked architecture says saves are browser-local IndexedDB. localStorage is browser-local too, so this is acceptable — but flag it in your report if you find durability problems (localStorage has ~5MB limits and no transaction support).

## Mission, Phase 1 — Verify 138+141 (do this first)

### 1. Acceptance audit
- **Task 138 accept:** "stats accumulate across campaigns." Read `lifetimeStats.ts`. Confirm: kills, gold earned, battles fought, hours played are tracked; the store is keyed independently of campaign save slots; starting a new campaign does NOT reset totals. Trace every write call-site — if kills are only incremented in one battle path but arena/tournament use another, that's a gap.
- **Task 141 accept:** "top 10 per mode" for quick-battle/arena/tournament. Read `leaderboards.ts`. Confirm: per-mode boards, insert keeps top 10 (sorted), 11th entry evicts correctly, ties handled deterministically. Check what "score" means per mode — it must be documented and sensible.

### 2. Test audit
- Run `npx vitest run` in `clients/campaign/`. Confirm his new test files actually run and pass. His "1168/1168" claim must be reproduced by you.
- Check the tests aren't vacuous: do they assert accumulation across campaigns (138) and the 10-entry cap + ordering (141)? If a test just checks "function exists," write a real one.

### 3. UI smoke test
- `npx tsc --noEmit` must be clean. `npm run build` must exit 0.
- Load the client, open the stats page and leaderboard panel, screenshot both. If they don't render or crash, that's a gap.

### 4. Fix gaps, don't just report them
- For every gap found: fix it, add/extend a test proving the fix, re-run tsc + vitest + build.
- Commit fixes as `fix(stats): ...` / `fix(leaderboard): ...`, push directly to main (no PRs, never force-push — rebase if main moved, verify tip via GitHub API first).

### Phase 1 done criteria
- [ ] 138 acceptance verified in code + test (cross-campaign accumulation proven)
- [ ] 141 acceptance verified in code + test (top-10 per mode, ordering, eviction proven)
- [ ] tsc clean, vitest green, build exit 0 (your run, not his claim)
- [ ] Both panels screenshot-rendered in browser
- [ ] Gaps fixed + pushed, or "no gaps found" with evidence

## Mission, Phase 2 — Next bottleneck (only after Phase 1 is green)

Pick the FIRST item below that is still unclaimed on main (check git before starting):

1. **Hana's tier-systems review** — branch `worker/hana/tier-systems@7773e610` was "ready for review." If unmerged: review the diff, run its tests, merge to main if clean. If already merged: skip.
2. **Weapon GLB runtime wiring** — 10 Quaternius weapon GLBs are in `clients/campaign/public/models/weapons/` and the manifest (v3, 48 entries), schema fixed. But nothing proves they load through `ModelLibrary` at runtime. Write a vitest + a browser smoke test that loads each weapon GLB through the real loader path. Fix what breaks.
3. **Ohio world-data swap** — Hana's Ohio River Valley data (487 settlements, 439 roads, 4,653 rail segments) is "ready to swap in for the placeholder map." If still on placeholder: perform the swap behind a feature flag, verify the campaign map renders with real data.

Do Phase 2 items in order; stop after the first one you complete. Don't start a second.

## Constraints
- Push directly to `main`. No PRs. Never force-push.
- Browser-local storage only. No server-side state.
- Follow Rowan's existing UI patterns — don't restyle his panels.
- Real verification only: your test runs, your screenshots, your typechecks. Never "should work."
- Post to the bus when done: `~/workspace/skills/relay-bus/bin/relay.py send "local-agent-2: ..."` — Phase 1 verdict (verified clean / gaps fixed + SHAs), Phase 2 item completed + SHA, test counts.

## Done criteria
- [ ] Phase 1 complete (all boxes above)
- [ ] Phase 2: one bottleneck item completed and pushed, or documented as already-done with evidence
- [ ] Bus notified with SHAs + test results
