# RISKS.md

Known risks, how likely they are, and what to do about them. Review at the end of each phase and update.

---

## 1. RISK TABLE

| # | Risk | Impact | Likelihood | Mitigation | Early warning sign |
|---|---|---|---|---|---|
| 1 | **Scope too large for one person** | Project stalls | High | Build V1 only (FEATURES.md section 14), one or two era tiers, small first slice, phase gates | A phase takes more than twice its estimate |
| 2 | **Browser performance for battles** | Battles unplayable | High | Phase 3 proof of concept first, LOD, instancing, small vehicle counts, lower targets if needed | Prototype misses 300 units at 60 fps |
| 3 | **Asset style mismatch** | Game looks amateur | High | Style A or C, unify step, one skeleton, palette control (ART_AND_AUDIO.md) | Screenshots look like a collage |
| 4 | **Asset license problems** | Forced removal, legal trouble | Medium | Manifest, saved license pages, commercial-use rule, build check (ASSETS.md) | Model with unclear license in repo |
| 5 | **Historical data gaps** | Era feature incomplete or inaccurate | Medium | Use nearest real decade, log gaps, decide roads approach early (ERA.md section 5) | Missing fields for a start year |
| 6 | **Hosting cost and Go on Cloudflare** | Blocked deployment or cost | Medium | Decide in Phase 0 (SPEC.md section 9), consider browser-side simulation first | Server bills or deploy failures |
| 7 | **Simulation instability** | Runaway numbers, unfair collapse | High | Headless tuning, chain assertions, balance targets (TESTING_AND_BALANCE.md) | Same side wins most seeds, resources spike |
| 8 | **Hidden system coupling** | Cause and effect breaks | Medium | Decoupling check, Unresolved log, code review rule | A fix that imports another system |
| 9 | **AI-assisted build drift** | Inconsistent code and design | Medium | Constitution as single authority, CHANGELOG discipline, review each phase | Docs and code disagree |
| 10 | **Content sensitivity** | Backlash or platform issues | Medium | See section 2 | Content reads as real-world advocacy |
| 11 | **Real-brand and real-history IP** | Legal or takedown risk | Low to medium | Generic in-game item names, fictional events, no real people (ERA.md section 6) | Real brand text in UI or assets |
| 12 | **Web load size and load time** | Players leave | Medium | Streaming per scene, KTX2 textures, LOD, asset caps (SPEC.md section 10) | Initial load over target |
| 13 | **Save data and world size** | Slow saves, big files | Medium | Compact state, delta saves, browser storage limits tested | Save takes seconds |
| 14 | **Burnout and long timeline** | Project abandoned | Medium | Small wins each phase, playable slice early, cut V2 items freely | Nothing playable after months |

## 2. CONTENT SENSITIVITY

The game is set in real US places with armed conflict, disease, and political power struggles. Guardrails:

- Events, sides, and rulers are **fictional**. Real geography only.
- Not written as an allegory for or attack on any real current party, movement, or person (CONSTITUTION.md section 6).
- No real tragedies, attacks, or disasters recreated. No real attack sites as battle set pieces framed as real events.
- No real people as characters, including in generated news, quests, or dialogue.
- Violence stays readable and restrained, not gratuitous.
- Sides are not written as good or evil. Every side has real strengths and dangers (FACTIONS.md).
- Review generated content (LLM text) against these rules before it ships. Add automated filters where possible.

## 3. TECHNICAL SPIKES TO RUN EARLY

Small experiments to reduce the biggest unknowns before committing:

1. **Crowd spike:** 1,000 instanced animated units in Babylon.js on mid-range hardware.
2. **World data spike:** import one state's real data with roads, elevation, and populations end to end.
3. **Simulation spike:** ten systems, one region, one decade, headless, with cause log writes.
4. **Asset pipeline spike:** take one free model from source to processed GLB with manifest entry and shared grade.
5. **Historical data spike:** find census and road data for one earlier start year, and decide how much to gate.

## 4. DECISIONS THAT STILL NEED MAKING

Log each in CHANGELOG.md when decided:

- Era: confirm the 1950 to 2009 span, or a fixed era (ERA.md)
- Fuel as a fifth resource (VEHICLES_AND_FUEL.md)
- Combat model and vehicle scope (COMBAT.md)
- Hosting approach (SPEC.md section 9)
- Art style (ART_AND_AUDIO.md section 3)
- Historical roads: simple or gated (ERA.md section 5)
- V1 slice: which states and sides (PHASES.md Phase 0)
- How many era tiers in V1

## 5. TRIGGERS TO CUT SCOPE

If any of these happen, cut V2 items and simplify:
- A phase runs more than double its estimate.
- The crowd spike misses targets by a large margin.
- Balance testing shows no stable configuration after several tuning rounds.
- Asset cohesion still fails after applying the pipeline.

What to cut first: family and heirs, tournaments, kingdom policies, media beyond radio and newspapers, weather and seasons, and extra vehicle types.

## 6. WHAT MUST NOT BE CUT

- The cause log and Why panel (core premise)
- Decoupled systems (CONSTITUTION.md section 2)
- Real data and asset license tracking (CONSTITUTION.md sections 1 and 5)
- Skeleton loading states (CONSTITUTION.md section 3)
