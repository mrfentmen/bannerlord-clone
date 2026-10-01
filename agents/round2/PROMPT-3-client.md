# PROMPT 3 — Lane 3: Campaign Client

**Paste this whole file as the agent's first message.**
**Folder you own: `clients/campaign/` — and nothing else.**

---

## Your lane

You own the campaign client. This round you do one structural thing — **stop running on fixtures** — and then close the four known gaps that make it not-yet-finished.

Three other agents are running in parallel in other folders. **Lane 2 holds the project critical path**; your work is independent and does not wait on theirs.

## Read first

1. `CONSTITUTION.md` — §1.2 no hidden constants, §3.1 lock visual direction before building panels, §3.2 **no spinners, skeleton states only**, §3.3 copy reads like a real game, §3.4 no invented design system
2. `agents/README.md`
3. `SPEC.md` §6 campaign layer, §10 performance budgets
4. `UI_UX.md`, `ART_AND_AUDIO.md`
5. `CHANGELOG.md` — the Phase 2 row lists your own honest gaps. Append only.

## The rules

- Write only inside `clients/campaign/`.
- Root design docs are **read-only**. Contradictions go under **Unresolved**.
- `CHANGELOG.md` is **additive only**.
- **Prove it or it is not done.** Paste real output.
- Design values come from `src/design/tokens.ts`. **Components do not invent their own palette or type.**
- **No placeholders, stubs, mocks, or fixtures in any shipped path** (§7.3). If something cannot be done for real, say so and stop.

---

## What already exists

62 source files, 9 panels, HUD, 282 passing vitest tests across 13 files, Playwright e2e. Terrain, roads, rail, buildings, and party pins all render. Your last verification was: typecheck clean, tests pass, build succeeds, **no fixture code in the production bundle**.

Keep all of that true.

---

## Task 1 — run on real data, not fixtures

**This is the headline task.** `src/data/fixture/fixtureProvider.ts` is 52 KB and is what the game actually loads. Meanwhile the real export already exists on disk at `services/world-data/exports/wire/` — 487 settlements, 439 roads, 4,653 rail segments, 2,236 terrarium tile refs, built field-for-field against your `src/world/types.ts` by Lane 1.

The game is currently showing a hand-written fiction instead of the real Ohio River Valley.

- Build a real provider backed by `src/world/load.ts` that reads the wire JSON.
- Add a runtime flag or env switch so both paths work in development.
- **Fixtures must be unreachable from a production build.** The guard at `src/data/fixture/forbiddenInProduction.ts` stays and must pass. Verify by building and inspecting the bundle, not by assuming.
- Keep fixtures for unit tests. That is what they are for, and `forbiddenInProduction.ts` is the thing that keeps that honest.

**Evidence required:** build against the real export and capture screenshots of a town showing its **real** buildings, roads, and rail. A claim that it renders is not evidence — the screenshot is.

**Do not read or write inside `services/world-data/`.** That is Lane 1's folder. Consume its committed export; if it looks wrong or missing, report it rather than editing it.

## Task 2 — four gaps your own CHANGELOG row admits

All four are already known and carried forward. Fix them.

1. **Town and party skeletons are dormant.** They never appear because `hud`/`main` do not pass the loading flag. Wire them. Per §3.2 the skeleton must be shaped like the content that is coming — not a spinner, and not a generic block.
2. **The ruler roster is unpaginated** at 300–800 cards. Paginate or virtualize.
3. **`LedgerPanel.ts` renders references as printed text.** They must be clickable links into the Why panel. This is the single most important fix in your list: the ability to press "why?" on a shortage **is the product's core premise** (`CAUSE_EFFECT.md` §4). Right now the chain ends in a dead end.
4. **No fixture code in the production bundle** — verify, as part of Task 1.

## Task 3 — close the §3.1 visual-direction gap

`CONSTITUTION.md` §3.1 requires references, palette, typography, and tone locked **before** panels are built, and §3.4 forbids components inventing their own. `ART_AND_AUDIO.md` holds the direction as prose; `src/design/tokens.ts` holds it as code; **nothing links them**, so there is no way to tell whether a panel obeys the direction.

- Audit your panels against `tokens.ts`.
- Any colour, spacing, or type value not coming from a token is a violation. Fix it or log it.
- `docs/mcp-servers.md` §3.4 gives you a keyless `color` server with free `color_scheme` and `color_info` for palette work.

**Note a real limitation:** `color_contrast` on that server is **paywalled**, so contrast verification stays **manual**. Do not claim an automated contrast pass. Do not add a licence key to reach it.

## Task 4 — make your own claims verifiable

Several entries in `CHANGELOG.md` describe rendering as working without a screenshot attached. You have Playwright.

- Every visual claim in your next CHANGELOG row needs an attached screenshot.
- Screenshots reviewed at **320, 390, 768, and 1440 px** (§3.4).

## Definition of done

- [ ] The client builds and runs against the real wire export.
- [ ] No fixture code is reachable in a production bundle, verified by inspecting the build.
- [ ] All four Task 2 gaps closed, each with a test where it makes sense.
- [ ] Skeleton parity tests pass: every panel that loads has a correctly shaped skeleton.
- [ ] `npm run typecheck` clean, `npm test` green, `npm run build` succeeds — output pasted.
- [ ] Screenshots at 320/390/768/1440 attached.
- [ ] Additive **Built** row plus **Unresolved** rows for anything left open.

## Report back

1. **Done** — with pasted build, typecheck, and test output, plus screenshots.
2. **Blocked** — with the specific blocker and who owns it.
3. **Contradictions** — anything in the docs that does not match reality.
4. **Honest gaps** — stated plainly. No placeholders, no stubs, no facade.