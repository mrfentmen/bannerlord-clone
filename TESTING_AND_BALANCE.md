# TESTING_AND_BALANCE.md

How the project proves it works, and how balance is tuned with data instead of guesses. Supports CONSTITUTION.md sections 1, 2, and 7.

---

## 1. THE HEADLESS HARNESS

A command-line runner executes the full simulation with no graphics.

- Inputs: seed, start year, region or country, number of years, optional scripted player behavior.
- Outputs: logs of state over time, the event log, the cause log, and summary metrics.
- Deterministic: the same seed and inputs produce the same results, byte for byte.
- Fast: a multi-year run finishes in minutes so many seeds can be run in bulk.

## 2. CHAIN ASSERTIONS

Every emergent chain in CAUSE_EFFECT.md sections 5 and 10 gets an automated check that scans the cause log for the linked pattern.

Example: the famine-to-vote chain passes if a run contains a town where taxes rose, then food fell, then unrest rose, then loyalty fell, then a council vote removed the holder, all connected by cause log links, with no scripted trigger.

Rules:
- A chain check fails if the pattern appears only through a scripted event.
- A chain must appear in at least a set fraction of seeds (target: most runs, tuned in the config).
- New systems add new chain checks in the same change.

## 3. SCRIPTED PLAYER PROFILES

Simple player bots for testing:

| Profile | Behavior | Purpose |
|---|---|---|
| Idle | Does nothing | Baseline world evolution |
| Greedy | Maxes taxes, ignores food | Tests famine and vote chains |
| Warmonger | Marches constantly | Tests supply, fuel, and attrition chains |
| Caretaker | Feeds, heals, repairs | Tests recovery chains |
| Trader | Runs caravans | Tests economy and road safety |

## 4. BALANCE TARGETS

Measured across many seeds and start years:

- **Side balance:** no side wins or collapses in most runs. Win, survive, and collapse rates per side stay inside target bands (FACTIONS.md section 3 balance rule).
- **Town survival:** unattended towns eventually suffer, but careful play can save them.
- **Recovery:** a struggling town that gets aid recovers over weeks of in-game time, not instantly.
- **Collapse pace:** neglect takes weeks, not hours, to cause a vote or death spiral.
- **Economy:** no infinite money loops, no resource that constantly hits zero or grows without bound for every side.
- **War pace:** wars last long enough for marches and sieges to matter, and end through exhaustion or peace, not just conquest.

## 5. BALANCE CONFIG

All tunable constants live in one place, with comments:

```
config/
  balance.toml       rates: food per person per day, infection rates, tax effects, loyalty weights
  economy.toml       prices, wages, upkeep, exchange rate rules
  combat.toml        damage, penetration, suppression, morale weights
  ai.toml            utility weights, trait modifiers, cadence
  era/tech_items.*   unlock years, requirements
  quests/*.toml      templates
```

Rules:
- No balance number is hidden inside code (CONSTITUTION.md section 1).
- Every constant has a comment explaining what it does and what reasonable ranges look like.
- Config changes are logged in CHANGELOG.md with the test results that motivated them.

## 6. DATA VERIFICATION TESTS

For the world pipeline (PHASES.md Phase 0):
- Spot-check tests comparing imported populations, areas, and routes to reference values for at least 10 places, plus era data for at least two different start years.
- Schema tests for every table.
- Tests confirming no hardcoded fake data exists (a scan for suspicious constants in seed code).

## 7. UNIT AND INTEGRATION TESTS

- Each system has unit tests with fixed inputs and expected field writes.
- Integration tests run several systems for a few ticks and check cross-system effects.
- Decoupling test: a static check that systems do not import or call each other (CONSTITUTION.md section 2).
- Cause log test: every tracked field write produces a cause log row.

## 8. PERFORMANCE TESTS

Define "mid-range hardware" once and write it in CHANGELOG.md (for example a specific CPU and GPU class and RAM), then test there.

Benchmarks:
- Campaign map frame rate with the full region loaded.
- Battle frame rate at 300 units (60 fps target) and 1,000 units (30 fps target), including a small number of vehicles.
- Simulation tick time with the full world and all AI.
- Load time and total asset download size per scene.

Store results per build and flag regressions above a set threshold.

## 9. REGRESSION LOGS

- Keep "golden" run logs for a few seeds.
- After changes, compare new logs to golden logs. Intended differences are approved and the golden logs updated. Unintended differences are bugs.

## 10. PLAYTEST PLAN

- Phase 2 onward: short playtests with a few people, watching where they get confused by the Why panel, warnings, or UI.
- Questions to ask: did you understand why things happened, did any outcome feel unfair, did anything feel scripted.
- Log findings in CHANGELOG.md and TASKS.md.

## 11. BUG HANDLING

- Every bug is logged with steps and seed.
- A bug that seems to require coupling two systems is logged under Unresolved, not patched over (CONSTITUTION.md section 2).
- Data bugs are traced to the source dataset and fixed at import, not in the game.

## 12. CONTINUOUS CHECKS

If you set up automation, run on every commit:
- Lint and unit tests
- Decoupling check
- Manifest check for assets and audio (ASSETS.md section 2)
- A short headless simulation with chain assertions
