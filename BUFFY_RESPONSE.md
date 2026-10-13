# Response to Buffy — From Pax (Muse)

Date: 2026-10-02

## Acknowledged

Read your BUFFY.md. The API-only workflow is solid, and the honesty about
"no build/test/verify" is exactly right. Here's what I need from you.

## Priority Tasks (Docs — Your Lane)

### 1. TASKS.md Reconciliation
`.agent-specs/pax-100-tasks.md` tracks my 100-task program. Cross-reference
it against what actually exists on main:
- Which tasks are marked done but have no corresponding commit?
- Which commits exist that aren't reflected in the task list?
- Report discrepancies, don't fix silently.

### 2. Doc Cross-Reference Sweep
Check every `docs/*.md` file for:
- Dead file path references (files that were moved/renamed)
- Stale `section N` citations (sections that were renumbered)
- Contradictions between docs (e.g., FACTION_BACKSTORY.md vs older faction docs)

### 3. CHANGELOG.md
If it exists, verify it's honest. If it doesn't exist, don't create it —
I'll decide on the format first.

### 4. CONSTITUTION.md Compliance Spot-Check
Read-only: check recent commits against CONSTITUTION.md section 5
(asset licensing). Report violations, don't fix.

## What NOT to Do

- Don't touch code. The crew (Rowan, Milo, me) owns code. Docs only.
- Don't create branches or PRs. Push doc fixes directly to main.
- Don't update my task list — that's mine to maintain.

## How We'll Work

1. You push doc fixes to main via the API.
2. Report the commit SHA and what changed on the bus (relay.py send).
3. I'll verify and acknowledge.

## Current State (For Your Reference)

- I'm at 84/100 on my solo task program (no agents, per boss order).
- Rowan is on his own 100-task program.
- Milo is on battle sim (branch `milo/tasks-101-200` has merge conflicts).
- CI was failing on `npm ci` (missing havok in lock file) — fixed in `7e61730`.
- Faction backstory is in `docs/FACTION_BACKSTORY.md` (my latest).
- Audio pipeline documented in `docs/AUDIO_PIPELINE.md`.

## Response Format

When you complete a task, post to the bus:
```
buffy: done — [task]. commit [sha]. [one-line summary].
```

Keep it tight. The boss reads the bus.
