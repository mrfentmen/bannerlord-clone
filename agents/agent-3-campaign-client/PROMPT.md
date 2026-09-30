# Agent 3 — Campaign Map Client

Paste everything below the line into a fresh agent session.

---

## Your job

Build the 3D campaign map: terrain, roads, towns, party movement, and the panels — including the Why panel.

You do **not** build the simulation. You consume it. Until Agent 2 lands, you work against Agent 1's portable export and clearly-labelled test fixtures.

## Your folder

Write **only** inside `clients/campaign/`.

You may **read** anything in the repo. You may **not** edit any other folder, any design doc, or another agent's prompt.

## Your branch

```bash
git checkout -b agent-3-campaign-client
```

## Read these first, in this order

1. `CONSTITUTION.md` — **section 3 is your governing law.** Read it twice, especially 3.1.
2. `PHASES.md` — Phase 2 only.
3. `TASKS.md` — Phase 2 section. That is your checklist.
4. `UI_UX.md` — the whole file. Screens, flows, interface rules, and the Why panel.
5. `SPEC.md` — sections 6 (campaign layer) and 7 (UI and art direction).
6. `ART_AND_AUDIO.md` — style options and the lock checklist. You need this for your first task.
7. `CAUSE_EFFECT.md` — section 4, the cause log you have to render.
8. `FACTIONS.md` — the side and state selection screen.
9. `ECONOMY.md` — section 10, the ledger and resource warnings.
10. `MARCH_AND_WAR.md` — section 11, the march planner.
11. `agents/README.md` — Contract A, your data source.

## Task 1 — lock the visual direction. Before any UI.

This is not optional and it is not a formality. `CONSTITUTION.md` section 3.1: the visual direction is locked **before** UI panels and screens are built. `PHASES.md` makes it the first bullet of Phase 2.

The reason is money. Building panels before the direction is locked means rebuilding every panel. That is the single most expensive mistake available in this phase.

Produce, as real checked-in files:

- References — the specific work this game looks like.
- Palette — actual colour values, not adjectives.
- Typography — actual typefaces with licences recorded per `ASSETS.md` section 2.
- Tone — grounded and gritty, modern. `SPEC.md` section 7 says explicitly: **not neon.**
- The post-processing recipe — colour grade, grain, vignette.

`ART_AND_AUDIO.md` lays out the style options and the checklist. **It deliberately does not make the decision for you** — it says so in its own opening. So make it, record it in `CHANGELOG.md` under **Decisions** with the reason, and move on.

Then build the UI against it.

## What to build

From `TASKS.md` Phase 2:

- 3D terrain rendered from **real elevation data** (`SPEC.md` section 2).
- Roads and routes from the real route graph.
- Towns as **clickable 3D clusters** with silhouettes that read by size and type.
- Party movement along roads in real time.
- Panels: Town, Market, Party, and the **Why panel**.
- Side, state, and role selection screen, with ratings, pros, cons, and each side's biggest danger.
- March planner showing travel time and cost **before** the player commits.
- Daily ledger and resource warnings.
- Ruler roster and ruler card.

### The Why panel is the whole point

`README.md` calls traceability the one premise. The Why panel is where the player sees it: it renders the cause log as a readable chain, so a town collapsing into unrest and starvation traces back to a specific choice.

A Why panel that shows a single cause, or a generic explanation, fails the premise even if it renders beautifully. It has to walk the chain.

### Skeleton states, never spinners

`CONSTITUTION.md` section 3.2. Every panel that reads data shows a skeleton placeholder **shaped like the content that is coming**. Loading spinners are banned. Build the skeletons as real components, not as a `loading` boolean that shows a grey box.

### Loading is part of the design

`SPEC.md` section 6 and section 10: initial load shows skeleton UI immediately and streams assets afterward. Design the loading states at the same time as the panels, not after.

## Constraints

- Mobile and small-screen layout checked before you call any UI done. `CONSTITUTION.md` section 3.4.
- No invented design system — no per-component palette or fonts. `CONSTITUTION.md` section 3.4.
- No placeholder text or `TODO` in anything a player can see. `CONSTITUTION.md` section 3.3.
- Interactive elements keyboard reachable and labelled.
- Every panel handles its error cases, not just the happy path. Player-facing error: a plain message **and** a way to recover (`CONSTITUTION.md` section 1.3).
- Fixtures are test fixtures, clearly named, and never wired into a production path. When Agent 2 lands, swap to the real source.

## Exit criteria

From `PHASES.md` Phase 2:

> A player can walk a party across the map, enter a town, buy and sell goods, see real stats, and watch prices and unrest respond over time, with the Why panel explaining at least one real event.

## Report back with

1. The real command you ran and its **actual output** pasted in.
2. Screenshots at desktop **and** a small-screen width.
3. The visual direction lock, and where it is recorded.
4. The Why panel showing a real multi-link chain.
5. The end-to-end test: trade goods, watch prices and unrest change over time.
6. Anything not done for real, stated plainly — including which panels are still on fixtures.
