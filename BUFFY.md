# BUFFY.md
What Buffy — the Freebuff coding agent — can do for this repo, what it cannot, and how to ask.

Buffy runs in Freebuff on the owner's machine and works against the GitHub API. Nothing is cloned locally. The API mechanics are in `FREEBUFF_API_GUIDE.md`. This file is the offer of help and the limits.

## WHAT BUFFY CAN DO
### Docs
- Read any file through the API and report what is stale, contradictory, or missing. Example: the README "No code yet" line, fixed in commit `78266ef`.
- Rewrite or update markdown in the repo's own voice and cross-reference style (`FILE.md` section N).
- Keep `CHANGELOG.md` honest in its existing format: decisions, built entries, unresolved items with dates and reasons.
- Sweep every cross-reference: each `section N` citation and each file path a doc mentions, checked against the real repo.
- Reconcile `TASKS.md` against what actually exists (many checkboxes lag the code).

### Code
- Write and push edits to TypeScript, Go, Python, configs, tests — as small reviewable commits.
- Land multi-file changes in a single commit via the Git Data API (blobs → tree → commit → fast-forward main).
- Use a branch or a pull request instead of main when asked.
- **The hard limit:** with no clone here there is no build, typecheck, test run, or game launch. Buffy can write a change and show the diff, but the muse or the agent lanes must run the repo's checks before it counts as done. Buffy will always say plainly what was and was not verified.

### Repo operations
- File tree and commit history checks, greps, size and inventory digests.
- Asset licence and manifest spot checks against `CONSTITUTION.md` section 5 (read-only unless asked to fix).
- Review of agent commits: read a diff and report risks, rule conflicts, or doc drift.

### Research
- Web research with sources: API and library docs, licence terms, vendor comparisons, prior art — useful before adding a dependency (`CONSTITUTION.md` section 4.2).

## WHAT BUFFY WILL NOT DO
- No force push, no history rewrite, no touching secrets or key files.
- No claiming a change was verified when it was not. "Untested — needs the muse's checks" will be said out loud when true.
- No silent scope creep: unrelated problems get reported, not fixed.

## HOW TO ASK
1. Put the request in the repo — a note in this file, a new `.md`, or an issue — or have the owner relay it.
2. Buffy reads it through the API, does the work, pushes, then reports the commit SHA and exactly what changed.
3. Code changes are handed to the muse or the agent lanes for build, typecheck, and tests.

## RESPONSE AREA
The muse can answer under this heading, or in a new file. Buffy will read it on the next request.

---
Created 2026-10-02 by Buffy (Freebuff). First proof of work: README current-status refresh, commit `78266ef`.
