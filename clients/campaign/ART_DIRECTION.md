# ART_DIRECTION.md

**The locked visual direction for the campaign map client.**

Locked per `CONSTITUTION.md` section 3.1: references, palette, typography and tone are
fixed **before** UI panels and screens are built. This file is that lock. Every colour,
font, spacing step and grade value the client uses is defined here and nowhere else
(`CONSTITUTION.md` section 3.4 forbids components inventing their own).

Machine-readable companions — these are what the code actually imports:

| File | Used by |
|---|---|
| `src/design/tokens.ts` | Every panel. The single source of truth for colour, type scale, spacing, radius, shadow. |
| `src/design/tokens.css` | Global stylesheet, generated from `tokens.ts` by `tools/build-tokens.mjs`. |
| `src/design/grade.ts` | The 3D colour grade, grain and vignette constants. |
| `assets/fonts/` | Self-hosted typefaces. Licences in `assets/fonts/licences/`. |

- **Style option chosen:** **A — stylized low-poly, with a period-photographic grade**
  (`ART_AND_AUDIO.md` section 2). See section 8 for why, and `CHANGELOG.md` under
  **Decisions** for the recorded decision.
- **Locked:** 2026-09-30
- **Applies to:** the whole campaign map client, campaign layer and battle layer.

---

## 1. THE ONE-LINE DIRECTION

> **A mid-century American field survey, spread out on the table under overcast light.**
> The world is cold, dusty and real. The interface is warm paper laid on top of it —
> stamped, ruled, typed, annotated by hand, and honest about the numbers.

The map is dark, cold and photographic. The UI is light, warm and printed. That
contrast is the whole idea. It keeps the map readable underneath the panels, it is
nothing like the dark-glass-neon default of the genre, and it comes straight out of
`UI_UX.md` section 1's instruction that interface elements should feel like printed
forms, radio dials and typewritten reports rather than sci-fi.

**Not neon. Not holographic. Not glassmorphism. No cyan/magenta gradient. No glow.**

---

## 2. REFERENCES

Sixteen specific works. Each one dictates a decision, and the decision is written down
so a later contributor can hit the same target without guessing.

### 2.1 Map and campaign layer

| # | Reference | What it dictates |
|---|---|---|
| R1 | **USGS Topographic Quadrangle maps** (`usgs.gov`, the "Topo" standard) | Terrain colour ramp keyed to elevation, not to biome fantasy. Contour logic, hypsometric tints, the desaturated olive-to-grey-to-white ladder. **Palette section 5.** |
| R2 | **Declassified US Army Map Service (AMS) sheets, WWII** | The khaki field-paper substrate, the overprinted blue grid, stamped annotations, the "RESTRICTED" rubber stamp. **UI motifs, section 6.** |
| R3 | **Michelin road maps, 1950s–70s** | How a road network reads at a glance: road class encoded by weight and value, never by hue. Settlements as a symbol family, not as coloured dots. **Town clusters, section 7.** |
| R4 | **Murchison, *The Times Atlas of the World*** | Cartographic restraint. No visual element that is not carrying information. |
| R5 | **Mount & Blade II: Bannerlord campaign map** | The genre baseline this project is measured against, and the specific thing to *differ* from: its UI is high-contrast, glossy and icon-led. Ours is printed and text-led. |
| R6 | **Todd Hido — *Homesick for the Future* / *Los Angeles Spring*** | American road photography: sodium-vapour warmth against cold concrete, heavy air, distance flattened by haze. **The map's atmosphere.** |

### 2.2 Interface

| # | Reference | What it dictates |
|---|---|---|
| R7 | **USWDS (U.S. Web Design System)** | American civic typography and the 4/8 spacing grid. This game's literal subject is contested American local government, so the design language of American civic paperwork is the correct one, not a European or sci-fi one. **Palette, spacing, typography.** |
| R8 | **Suzerain (Torpor Games), UI and art** | Political decision UI as paperwork: ministry letterhead, rubber stamps, cables, a state that visibly degrades. Directly relevant to the council-vote and side-selection screens. |
| R9 | **This War of Mine (11 bit studios)** | The closest existing game to this project's moral register. Greys, paper, restraint, and a UI that refuses to make suffering look exciting. **The rule for every colour choice in a warning state.** |
| R10 | **Papers, Please (Lucas Pope)** | Printed-form UI taken literally: rules, fields, stamps, a rubber-stamp sound, and every field meaning something. **The Why panel's expand-a-line interaction.** |
| R11 | **Disco Elysium, UI and typography (ZA/UM)** | Period typography, hand-set rules, the fiction of a real document, and the discipline of one typeface family used seriously. |

### 2.3 Light and grade

| # | Reference | What it dictates |
|---|---|---|
| R12 | **Roger Deakins, *Blade Runner 2049*** | The canonical "grounded, gritty, modern, not neon" image: heavy atmosphere, deep cold shadows, a single restrained warm accent, huge dynamic range, nothing saturated. **The grade, section 9.** |
| R13 | **Kodachrome 25, expired** | The era palette. Warm reds and ochres, cold greens that actually go grey, hard daylight. Sets the paper and stamp accents. |
| R14 | **Fuji Pro 400H** | Gentle highlight roll-off and a green-shifted shadow, which is exactly the low-chroma, slightly sickly cast that keeps the terrain from looking like a video game. |
| R15 | **Gregory Crewdson** | Cold, over-lit, slightly unreal American suburban space. The town-cluster silhouettes should feel *arranged* rather than organic. |
| R16 | **Edward Burtynsky — *Manmade* / *Anthropo* scales** | Terrain read as infrastructure and land use, not as wilderness. The Front Range map is a landscape that somebody cut roads through. |

### 2.4 What the references rule out

- No neon, no chromatic aberration, no bloom-heavy "cinematic" grade.
- No glassmorphism, no frosted translucent panels, no floating rounded-rect cards with
  drop shadows on a blurred backdrop.
- No glassmorphic "hologram" HUD frames, no glowing borders.
- No icon-only controls. Icons accompany text; they never replace it.
- No rounded-pill buttons. Corners are square or near-square. This is a document.

---

## 3. TYPOGRAPHY

**Two families. Locked. Licences recorded per `ASSETS.md` section 2.**

| Role | Family | Licence | Weights | Why this one |
|---|---|---|---|---|
| Display and UI text | **Public Sans** | SIL Open Font License 1.1 | variable 400–800 | It is the typeface of the U.S. federal government (USWDS, R7). This game's subject is American civic authority, so the interface should sound like the paperwork of that authority rather than like a startup. Engineered, slightly squared, unshowy, and it holds up when stamped. |
| All numerals, ledger, cause log, coordinates, timestamps | **IBM Plex Mono** | SIL Open Font License 1.1 | 400, 500, 600 | Tabular figures, so a column of prices or an hourly ledger never jitters as it updates. Machine-age, typewriter-adjacent, and it is the reason the Why panel's cause IDs can be quoted verbatim. |

Files, hashes and the saved licence texts: `assets/fonts/FONT-MANIFEST.json`,
`assets/fonts/licences/`. Self-hosted; no third-party request at runtime. Only the
`latin` and `latin-ext` subsets ship.

### 3.1 The type scale

Fixed steps. No component may introduce another.

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `type-display` | 30 / 34 | 800 | -0.02em | Screen titles. Once per screen. |
| `type-title` | 20 / 26 | 700 | -0.01em | Panel titles, town names. |
| `type-section` | 12 / 16 | 700 | 0.09em, uppercase | Form section headers. Looks rubber-stamped. |
| `type-body` | 15 / 22 | 400 | 0 | Default body copy. |
| `type-label` | 13 / 18 | 600 | 0 | Field labels, table headers. |
| `type-caption` | 12 / 16 | 400 | 0.01em | Secondary text, units, sources. |
| `type-data` | 15 / 20 | 500 (mono) | 0 | Any number in a table. |
| `type-data-lg` | 26 / 30 | 600 (mono) | -0.01em | Top-bar resources. |
| `type-data-sm` | 12 / 16 | 400 (mono) | 0 | Coordinates, cause IDs, tick counters. |

**The mono rule:** *every numeral rendered inside a table, gauge, ledger, or cause
chain is `type-data`.* Sans-serif figures are not permitted there, because a strategy
game whose numbers jitter as they tick is a strategy game you cannot read.

### 3.2 Rules

- Uppercase only for `type-section`, stamped seals, and resource key labels. Never for
  sentences.
- UI scale is user-adjustable at 90 / 100 / 115 / 130 percent (`UI_UX.md` section 12).
  This scales the root size; every token is in `rem` off that root.
- Minimum body size 15px at 100 percent.

---

## 4. SPACING, RADIUS, ELEVATION

A 4px base grid, from USWDS (R7). No exceptions.

- **Spacing:** `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 24,
  `space-6` 32, `space-7` 48, `space-8` 64 (px).
- **Radius:** `radius-0` 0 (default — this is a document), `radius-1` 2px for inputs
  and chips, `radius-2` 4px, used sparingly, for a card that must read as a card
  laid on the page.
- **No border radius above 4px anywhere.** Pills, stadiums and 50% circles are out
  except for literal map pins and gauges.
- **Elevation is expressed as paper, not as shadow.** A panel is a sheet: `paper-100`
  fill, a 1px `paper-300` rule on the outside, a 1px `paper-000` highlight on the
  inside top edge, and one soft shadow so it sits above the map. Stacked sheets get a
  slightly deeper shadow and shift 2px down.
- **Panel shadow tokens:** `sheet-0` `0 1px 2px rgba(23,20,15,.28)`,
  `sheet-1` `0 2px 6px rgba(23,20,15,.30), 0 1px 1px rgba(23,20,15,.20)`,
  `sheet-2` `0 8px 24px rgba(23,20,15,.34), 0 2px 4px rgba(23,20,15,.22)`.
  All three are warm-black, never pure black. Pure black on warm paper looks like a
  hole.

---

## 5. PALETTE

**Actual values, not adjectives.** These are the tokens in `src/design/tokens.ts`.

### 5.1 Paper — the UI substrate

| Token | Hex | Use |
|---|---|---|
| `paper-000` | `#F2EDE1` | Top of a sheet, header bars, the inside top highlight |
| `paper-100` | `#E7E1D2` | Panel body. The default surface. |
| `paper-200` | `#DBD3C0` | Recessed fills, table zebra rows, input wells |
| `paper-300` | `#C9BFA8` | Hairline rules, panel edges, table borders |
| `paper-400` | `#AEA287` | Disabled fill, skeleton blocks (see section 11) |

### 5.2 Ink — the type

| Token | Hex | Contrast on `paper-100` | Use |
|---|---|---|---|
| `ink-900` | `#17140F` | 15.4:1 | Primary text |
| `ink-700` | `#3B352B` | 9.6:1 | Secondary text, table body |
| `ink-500` | `#6B6354` | 4.9:1 | Captions, units, sources |
| `ink-300` | `#9A9080` | 2.6:1 | Disabled text, decorative only, never informational |

### 5.3 Accents — institutional, low chroma

| Token | Hex | Meaning | Redundant shape |
|---|---|---|---|
| `stamp-blue` | `#2B4A6F` | Primary action, links, section accent, the player | — |
| `stamp-blue-deep` | `#1D3350` | Pressed / active / hover | — |
| `oxide` | `#8A3524` | Critical. Danger. The rubber-stamp red. | ◆ |
| `amber` | `#A87614` | Warning. Shortage inside 10 days. | ▲ |
| `moss` | `#4A6A38` | Healthy, stable, improved | ● |
| `slate-teal` | `#2F6068` | Information. Money. Supply. | ■ |
| `plum` | `#6B3A5E` | Influence and renown only | ✦ |

**The shape rule (`UI_UX.md` section 12, accessibility).** Every status colour is
*always* accompanied by its glyph, and the glyph alone is sufficient to read the
status. Colour is never the only carrier of meaning. This is enforced by the
`<Status>` component and asserted in `src/design/__tests__/status.test.ts`.

### 5.4 Terrain and network

Cold, desaturated, hypsometric. Values are the actual low/base colours fed to the
terrain shader in `src/design/grade.ts`.

| Token | Hex | Band |
|---|---|---|
| `terrain-prairie` | `#6E6A55` | low, 1500–1800 m |
| `terrain-steppe` | `#7E7A5C` | 1800–2100 m |
| `terrain-range` | `#5F6247` | 2100–2400 m |
| `terrain-scrub` | `#47503A` | 2400–2700 m |
| `terrain-forest` | `#36402F` | 2700–3000 m, and shaded north-facing slopes |
| `terrain-rock` | `#5E5C55` | 3000–3300 m, steep slope regardless of height |
| `terrain-scree` | `#8A877E` | 3300–3600 m |
| `terrain-snow` | `#C9C7BE` | above 3600 m |
| `terrain-water` | `#35474E` | rivers, reservoirs |
| `road-major` | `#26251F` | motorway, trunk, primary |
| `road-minor` | `#4A473E` | secondary |
| `rail` | `#6E6455` | rail, drawn as a sleeper-dash |

Every one of these is under 25% saturation. If a candidate terrain colour comes out
saturated, it is wrong.

---

## 6. UI MOTIFS

Drawn from R2, R7, R8, R10. All of them are CSS or SVG; none require an art asset.

1. **Form rules.** Hairline `paper-300` rules under section headers, as on a printed
   form. Not a coloured underline, not a glow.
2. **The rubber stamp.** Critical and confirmed states carry a rotated, slightly
   translucent `oxide` or `stamp-blue` stamp reading e.g. `OVERDUE`, `SEIZED`,
   `QUARANTINE`. Rotation is a fixed −4.5 degrees. Stamps are never animated in.
3. **Dog-ear.** The bottom-right corner of a long panel (the ledger, the cause log)
   is cut at 10px with a 1px `paper-300` diagonal and a 4px `paper-200` fold.
4. **Carbon triplicate.** Ledger and ruler cards use three horizontal bands
   (`paper-100` / `paper-200` / `paper-100`) as if a carbon copy was stacked behind.
5. **The map pin.** Town markers are a hard diamond on a short stem with a 2px
   outline, not a soft round pin.
6. **Typewriter labels.** Resource keys in the top bar are `type-data-sm` uppercase
   with 0.09em tracking, as if typed onto the form.
7. **Grease-pencil annotation.** A caution the player has been told about already is
   marked with a hand-drawn-looking 2px underline offset below the baseline, in
   `amber`, at 60% opacity. Used once per screen, maximum.
8. **The radio dial.** Time controls are a rotary selector rendered as a 3-position
   dial with detent ticks, not as three pill buttons.

---

## 7. TOWN AND MAP SYMBOLS

`SPEC.md` section 6: towns are 3D clusters with silhouettes that read by size and
type. Silhouette does the work, colour only confirms it.

| Class | Real-data threshold | Silhouette | Marker |
|---|---|---|---|
| **City** | population ≥ 100,000 | A tall block cluster, 18–34 buildings, one tower at 2.2× mean height, low-rise sprawl around it | Double diamond |
| **Town** | 25,000 – 99,999 | 8–16 buildings, one water tower or grain silo at 1.6× mean height, a visible street grid | Single diamond |
| **Village** | < 25,000 | 3–6 buildings, a single pitched roof, one silo | Hollow diamond |
| **Base / compound** | no population | Square earthwork berm, low walls, no spire | Square outline |

Height and block count scale from real population, so the map reads as a real
settlement-size map rather than a set of arbitrary icons. The threshold table is data
in `src/data/classify.ts`, not a rule buried in a component.

**District tint by prosperity** (4C task 143): a flat ground ring around the
cluster, coloured by the sim's 0–1 prosperity figure. The tint is a ring, not a
building recolour, so the cluster silhouette keeps doing the work. When the sim
has no prosperity figure for a town, no ring is drawn rather than a fake one.

| Level | Prosperity | Colour | Reads as |
|---|---|---|---|
| 0 | 0.00 – 0.19 | `#4A4A42` | destitute |
| 1 | 0.20 – 0.39 | `#625E52` | poor |
| 2 | 0.40 – 0.59 | `#77715C` | holding |
| 3 | 0.60 – 0.79 | `#8D835F` | thriving |
| 4 | 0.80 – 1.00 | `#9E9260` | rich |

The scale is data in `src/design/tokens.ts` (`prosperityScale`), not a rule
buried in a component. Desaturated like everything else here.

**City Walls** (4C task 142): a completed City Walls project adds a stone ring
(`fortWall` `#5E5C55`) just outside the cluster footprint, with a gate gap at
bearing 0. **Garrison banners** (4C task 144): a banner pole outside the wall
ring flies cloth in the controlling faction's colour and swaps on ownership
change; a faction with no colour entry gets the neutral `bannerUnknown` grey.

**Road class by weight, never by hue** (R3):

| Class | Ribbon width | Value |
|---|---|---|
| motorway / trunk | 34 m | `road-major` |
| primary | 26 m | `road-major` |
| secondary | 15 m | `road-minor` |
| rail | 9 m dashed | `rail` |

These are **screen-legibility widths, not carriageway widths.** A real motorway is
3.2 m across; at the campaign zoom, 13 km above the ground, that is a quarter of a
pixel and the entire road network vanishes into a dotted smear. The widths above render
at two to three pixels at the default zoom and keep their relative weight as the camera
descends, which is what a road map is for. The first draft of this file said "3.2 m"
under a "screen width" heading, which was simply wrong; corrected 2026-09-30 and logged
in `CHANGELOG.md` under **Decisions**.

---

## 8. WHY STYLE A WITH A PERIOD GRADE

`ART_AND_AUDIO.md` section 2 offers A (stylized low-poly), B (gritty semi-realistic)
and C (period filter), and recommends A or C. **The decision is A, with a light dose
of C.**

- **A is load-bearing.** The Phase 3 crowd targets — 300 units at 60 fps, 1000 at
  30 fps (`SPEC.md` section 5.1) — are decided by draw calls and texture memory.
  Low-poly flat-shaded geometry with a shared texture budget is what makes mixed
  Sketchfab/Fab/Kenney/Quaternius assets read as one game, which `ASSETS.md` section
  4 step 6 calls *the core art job*. Semi-realistic assets from many artists do not
  unify; that is the risk `ART_AND_AUDIO.md` names in its own table.
- **C is applied in the grade, not in the geometry** (section 9). The grade is what
  supplies the era and the grit, and it costs one fullscreen pass instead of an art
  budget.
- **B is rejected.** Its own table says "highest risk with mixed sources", and the
  failure mode is a collage.
- Flat shading with hard normals is also the honest choice for a game whose premise
  is legible state. Detail on a hillside is detail the player cannot read a number off.

---

## 9. POST-PROCESSING RECIPE

One recipe for the whole game, in `src/design/grade.ts`, applied by the Babylon
`DefaultRenderingPipeline` plus one custom grain pass. Optional and switchable off at
low settings (`ART_AND_AUDIO.md` section 10, `ASSETS.md` section 5.4).

### 9.1 Colour grade

| Parameter | Value | Why |
|---|---|---|
| Tone mapping | ACES | R12. Holds highlight detail in snow and blown rock instead of clipping to white. |
| Contrast | 1.18 | Enough separation to read relief on a hazy map. |
| Exposure | 1.02 | Neutral. |
| Saturation | **-0.22** | The single most important value in the file. Nothing in this game is neon. |
| Shadow lift | `#1A2228` at 0.06 | Cold, slightly green shadows. Keeps large dark areas from going dead black. |
| Highlight tint | `#F2E4C8` at 0.05 | Warm highlights. The R13/R14 split. |
| Vignette weight | 1.6 | Multiply, subtle. |
| Vignette stretch | 0.35 | Elliptical, so it does not crush the corners of a 21:9 monitor. |
| FXAA | on | Cheap edge cleanup; the map is full of thin geometry. |

### 9.2 Grain

Not a static overlay. A real animated pass, so the image has the temporal texture of
film rather than a fixed dirty screen.

| Parameter | Value |
|---|---|
| Intensity | 0.045 |
| Animated | yes, hash reseeded per frame |
| Monochrome | yes — grain in the chroma channels is what makes cheap renderers look digital |
| Size | 1.6 px, sampled from a 256² noise tile |
| Grain response to luminance | strongest in the midtones, halved in highlights |

### 9.3 Vignette

As above: elliptical multiply, weight 1.6, colour `#17140F`. Applied after the grade,
before grain, so the grain sits on top of the vignette and the corners do not look
cleaner than the centre.

### 9.4 Era grades

`ART_AND_AUDIO.md` section 4. The grade shifts with the campaign year, subtly, so a
long campaign feels like time passing. One value moves per tier.

| Era | Years | Saturation | Contrast | Warmth | Grain |
|---|---|---|---|---|---|
| 1 | 1950s | 0.90 | 1.26 | +0.06 | 0.062 |
| 2 | 1960s–70s | 0.94 | 1.22 | +0.04 | 0.056 |
| 3 | 1980s | 1.00 | 1.18 | +0.02 | 0.050 |
| 4 | 1990s–2000s | 1.06 | 1.14 | 0.00 | 0.045 |

Multipliers, not absolutes. V1 starts in era tier 4 and the player picks the year
(`ERA.md` section 7).

### 9.5 UI grain and paper

Separate from the 3D grade, and much lighter.

- A 180×180 tiling paper-fibre noise at **0.035** opacity over every panel fill.
- A 1px `rgba(23,20,15,.06)` inner shadow on panel wells, so a recessed area reads as
  pressed into the sheet rather than drawn on it.
- No animated grain in the UI. It would make text harder to read and it would cost
  repaints on every tick.

---

## 10. TONE

`CONSTITUTION.md` section 3.3: labels, empty states, errors and tooltips are written in
the voice of the finished product. Grounded and gritty, modern. No placeholder text,
no lorem ipsum, no developer-speak.

### 10.1 Voice

- **Bureaucratic, not chatty.** The game is a set of forms filled in by people who
  have to live in the consequences.
- **Plain, not literary.** Short declaratives. Numbers with units.
- **Never editorialising.** The game does not tell the player a town is sad. It says
  `FOOD 0.0 days · 2,140 at risk` and lets them decide.
- **Never cute.** No exclamation marks. No emoji. No "Oops!". No "Welcome back!".

### 10.2 Worked examples

| Situation | Copy |
|---|---|
| No towns under the cursor | `No town selected. Choose a settlement on the map, or press Tab to cycle holdings.` |
| Market has nothing to sell | `Caravan holds no goods. Buy something in a market before hauling.` |
| Not enough money | `Short 312. You have 2,180. Sell first, or take the contract at Longmont.` |
| Town is starving | `FOOD 0.0 DAYS` and beneath it, in `ink-500`: `Balance −41 person-days per day. Last delivery 9 days ago.` |
| Player has been warned already | `You were told about this on 4 March. It has not improved.` |
| Data failed to load | `The town ledger did not load. The connection to the simulation was refused.` + button `Try again` |
| No cause chain recorded | `Nothing caused this. It was true when the survey was taken.` |
| No route exists | `No surveyed road connects these two towns. Move to a town with a road, or plan off-road at reduced speed.` |
| Unrest critical | `Unrest 0.91. Loyalty is following it down. 12 days to a council vote.` |

### 10.3 Banned

`TODO`, `Lorem ipsum`, `Coming soon`, `Feature not available`, `Error`, `Something went
wrong`, `undefined`, `NaN`, `null`, `[]`, dev-facing strings, and any string
containing a developer name or a file path.

There is a repo test for this: `src/design/__tests__/copy.test.ts` walks every
player-visible string literal in the client and fails the build on any of the above.

---

## 11. SKELETON STATES

`CONSTITUTION.md` section 3.2: no spinners, anywhere. A skeleton is shaped like the
content that is coming, because the shape is what stops the layout jumping when the
data lands.

Rules, all enforced by `src/ui/skeleton/Skeleton.tsx`:

- Each data-driven panel owns a **named skeleton** that mirrors its real layout:
  `town-skeleton` has the same section count, gauge widths and two-row market stub as
  the real town panel.
- Skeleton blocks use `paper-400` with a **1px `paper-300` outline** and a 6% animated
  wash — the wash moves, the shape does not. It is not a spinner; it never rotates and
  it never has a travelling highlight.
- Skeletons render **immediately**, before the request is made, so there is never a
  frame with neither data nor placeholder.
- A skeleton is a real component, not `loading ? <div className="grey-box"/> : content`.
  The repo test `src/ui/__tests__/skeleton.test.ts` fails if a panel is found with a
  boolean-flag loading branch and no skeleton component.
- **Small-screen skeletons are the real responsive layout at skeleton scale**, not a
  single grey block.

---

## 12. ACCESSIBILITY

`UI_UX.md` section 12. All of it is binding here, not aspirational.

- Every status carries a glyph as well as a colour (section 5.3). The
  `deuteranopia` / `protanopia` / `tritanopia` simulation in
  `src/design/__tests__/palette.test.ts` asserts the four status pairs stay
  distinguishable in all three.
- Ink on paper clears WCAG AA at every text size in the scale. Measured contrasts are
  in the tokens file.
- Interactive elements are keyboard reachable, visibly focusable with a 2px
  `stamp-blue` focus ring offset 2px, and every control has an accessible name.
- The map is keyboard operable: `Tab` cycles settlements, `Enter` selects, arrow keys
  pan, and every map selection is mirrored into a live region so a screen reader
  announces it.
- Text size and UI scale adjustable at 90 / 100 / 115 / 130 percent.
- `prefers-reduced-motion` disables the skeleton wash, the grain animation and the
  map camera easing.
- Nothing meaningful is conveyed by an icon alone.

---

## 13. SMALL SCREEN

`CONSTITUTION.md` section 3.4: mobile and small-screen layout is checked **before**
any UI work is called done. `UI_UX.md` section 13 puts mobile out of scope for V1,
which does not mean it goes unchecked — it means it is not a target platform, so the
requirement is *the layout does not break*, not *it is optimised*.

Checked at **390 × 844** (iPhone-class) and **768 × 1024** (tablet portrait).

| Breakpoint | Layout |
|---|---|
| ≥ 1200px | Full HUD. Top bar, left party rail, right context panel, bottom notification tray, map fills the frame. |
| 900–1199px | Right context panel narrows to 320px. Left rail collapses to icons with labels on hover. |
| 600–899px | Context panel becomes a bottom sheet, 45% height, drag-resizable. Top bar wraps to two rows of resources. |
| < 600px | Single column. Map fills the frame. Top bar is a two-row sticky header with horizontally scrolling resource chips. Panels are full-height bottom sheets at 88%. Notification tray is a single-line ticker. No horizontal page scroll at 320px. |

Requirements at every width: no horizontal page scroll, no clipped text, no control
below 44×44px on touch, tap targets at least 8px apart, and the Why panel chain
readable at full width without horizontal scrolling.

---

## 14. CHANGE CONTROL

This direction is locked. Changing any value in it means:

1. A `CHANGELOG.md` entry under **Decisions** with the date, the reason, and what it
   costs.
2. A sweep of every already-built panel, because per `CONSTITUTION.md` section 3.1
   that is exactly the expensive mistake the lock exists to prevent.

Small refinements that do not change the direction (a new spacing step inside the
4px grid, a fourth terrain band) are additive and do not need the sweep.
