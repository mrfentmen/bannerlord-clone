# CHANGELOG.md

Running log of what has been built, what is unresolved, decisions made, and generation costs. Required by CONSTITUTION.md sections 1, 2, and 7. Newest entries go at the top of each section.

---

## HOW TO USE THIS FILE

- Every completed task adds an entry under **Built** with what changed and why.
- Every error the build cannot resolve goes under **Unresolved** with steps to reproduce and the seed if relevant.
- A bug that seems to need one system calling another goes under **Unresolved** with an explanation of why decoupled systems did not produce the right behavior (CONSTITUTION.md section 2).
- Every design or technical decision goes under **Decisions**, with the date and the reason.
- Every LLM generation batch logs token spend under **Generation cost** (SPEC.md section 8).

---

## DECISIONS

Format: `YYYY-MM-DD | Decision | Reason | Files affected`

Pending decisions (fill in when made):

| Decision | Options | Status |
|---|---|---|
| Era | 1950 to 2009 campaign with tech by year, one fixed era, or today with era tech tiers | Open (ERA.md) |
| Fuel as a fifth resource | Yes or no | Open (VEHICLES_AND_FUEL.md) |
| Combat model | Era firearms and vehicles as standard, or ammo-scarce mixed model | Open (COMBAT.md) |
| Hosting | Browser-side sim, Go server plus Postgres, or hybrid | Open (SPEC.md section 9) |
| Art style | Stylized low-poly, gritty semi-realistic, or period filter | Open (ART_AND_AUDIO.md) |
| Historical roads | Current network everywhere, or gated by opening year | Open (ERA.md section 5) |
| First playable slice | Which states and sides | Open (PHASES.md Phase 0) |
| Era tiers in V1 | One, two, or all four | Open |
| Mid-range test hardware definition | CPU, GPU, and RAM class | Open (TESTING_AND_BALANCE.md section 8) |

---

## BUILT

Format: `YYYY-MM-DD | Phase | Task | What changed and why`

(no entries yet)

---

## UNRESOLVED

Format: `YYYY-MM-DD | Area | Problem | Steps to reproduce | Why it is unresolved | Next step`

(no entries yet)

---

## GENERATION COST

Format: `YYYY-MM-DD | Batch | Items generated | Tokens in | Tokens out | Notes`

(no entries yet)

---

## PERFORMANCE RESULTS

Format: `YYYY-MM-DD | Build | Test | Hardware | Result | Target | Pass or fail`

(no entries yet)

---

## DATA NOTES

Missing or substituted data, and where each dataset came from.

Format: `YYYY-MM-DD | Dataset | Source | Version or date | Gaps | Handling`

(no entries yet)
