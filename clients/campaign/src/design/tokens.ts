/**
 * The locked visual direction, as data.
 *
 * Every colour, type step, spacing step and shadow in the client comes from here.
 * `CONSTITUTION.md` section 3.4 forbids components inventing their own palette or
 * fonts, and `ART_DIRECTION.md` is the lock this file implements. If a value is not
 * in this file it does not exist.
 *
 * `tools/build-tokens.mjs` generates `tokens.css` from this file, so the stylesheet
 * and the TypeScript can never drift apart.
 */

/** 4px base grid, from the USWDS spacing scale (ART_DIRECTION.md section 4). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

/**
 * Paper is the interface substrate; ink is the type on it. Warm throughout, never
 * pure black on pure white (ART_DIRECTION.md section 5.1, 5.2).
 */
export const paper = {
  0: "#F2EDE1", // top of a sheet, header bars, inside top highlight
  100: "#E7E1D2", // panel body, the default surface
  200: "#DBD3C0", // recessed fills, table zebra, input wells
  300: "#C9BFA8", // hairline rules, panel edges, table borders
  400: "#AEA287", // disabled fill, skeleton blocks
} as const;

export const ink = {
  900: "#17140F", // primary text
  700: "#3B352B", // secondary text, table body
  500: "#6B6354", // captions, units, sources
  300: "#9A9080", // decorative only, never informational
} as const;

/**
 * Institutional accents, all low chroma.
 *
 * Each status has two colours and they do different jobs, which the first draft got
 * wrong. `mark` is a graphic: a glyph, a gauge fill, a rule on paper. `fill` is a
 * solid background that carries `ink` text. They cannot be the same value, because
 * amber that is dark enough to pass AA as a fill stops being distinguishable from the
 * critical red under tritanopia. The two roles are separated here rather than papered
 * over with a threshold nobody checked.
 *
 * `glyph` is not decoration. The shape is the primary signal and the colour is the
 * third, so a status is legible with no colour vision at all
 * (`UI_UX.md` section 12, `ART_DIRECTION.md` section 5.3). Both facts are asserted in
 * `src/design/__tests__/design.test.ts`.
 */
export const status = {
  critical: { mark: "#8A3524", fill: "#7A2E20", ink: "#F2EDE1", glyph: "◆", label: "critical" },
  warning: { mark: "#A87614", fill: "#6E4A08", ink: "#F2EDE1", glyph: "▲", label: "warning" },
  good: { mark: "#5E6C24", fill: "#4C6C24", ink: "#F2EDE1", glyph: "●", label: "healthy" },
  info: { mark: "#2F6068", fill: "#274F56", ink: "#F2EDE1", glyph: "■", label: "informational" },
} as const;

/** Non-status accents. Each has one job; none is interchangeable with another. */
export const accent = {
  primary: "#2B4A6F",
  primaryDeep: "#1D3350",
  primaryInk: "#F2EDE1",
  influence: "#6B3A5E",
  influenceInk: "#F2EDE1",
  /** Money, supply, and anything informational that is not a resource. */
  info: "#2F6068",
  infoInk: "#F2EDE1",
} as const;

/**
 * Subtitle bar colours (task 21). Captions sit over the 3D scene rather than
 * over paper, so they need scene-proof colours: white text and a gold speaker
 * name on translucent or solid black. Functional, not decorative — and the
 * only place pure black/white appear outside high-contrast mode.
 */
export const subtitle = {
  text: "#FFFFFF",
  speaker: "#FFD97A",
  backgroundTranslucent: "rgba(0, 0, 0, 0.62)",
  backgroundSolid: "#000000",
} as const;

/**
 * Unit-kind colours for the deployment map and battle command UI. One muted
 * colour per kind, desaturated like the rest of the palette. The kind name on
 * the roster card and the token label are the primary signal; colour is
 * secondary, so the five stay distinguishable without being neon.
 */
export const unitKind = {
  infantry: "#4E6E94",
  archers: "#5E7A4E",
  cavalry: "#9A8548",
  siege: "#9E6B40",
  militia: "#7E838A",
} as const;

export const type = {
  display: { size: 30, line: 34, weight: 800, tracking: "-0.02em", family: "sans" },
  title: { size: 20, line: 26, weight: 700, tracking: "-0.01em", family: "sans" },
  section: { size: 12, line: 16, weight: 700, tracking: "0.09em", family: "sans", uppercase: true },
  body: { size: 15, line: 22, weight: 400, tracking: "0", family: "sans" },
  label: { size: 13, line: 18, weight: 600, tracking: "0", family: "sans" },
  caption: { size: 12, line: 16, weight: 400, tracking: "0.01em", family: "sans" },
  data: { size: 15, line: 20, weight: 500, tracking: "0", family: "mono" },
  dataLg: { size: 26, line: 30, weight: 600, tracking: "-0.01em", family: "mono" },
  dataSm: { size: 12, line: 16, weight: 400, tracking: "0", family: "mono" },
} as const;

export const font = {
  sans: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

export const radius = { 0: "0", 1: "2px", 2: "4px" } as const;

/**
 * Elevation is expressed as paper, not as shadow: a panel is a sheet lying on the
 * map. All three shadows are warm-black, never pure black (ART_DIRECTION.md §4).
 */
export const sheet = {
  0: "0 1px 2px rgba(23, 20, 15, 0.28)",
  1: "0 2px 6px rgba(23, 20, 15, 0.30), 0 1px 1px rgba(23, 20, 15, 0.20)",
  2: "0 8px 24px rgba(23, 20, 15, 0.34), 0 2px 4px rgba(23, 20, 15, 0.22)",
} as const;

export const focusRing = `0 0 0 2px ${paper[0]}, 0 0 0 4px ${accent.primary}`;

/**
 * Terrain ramp. Hypsometric, keyed to elevation, desaturated by construction:
 * every one of these is under 25% HSL saturation (ART_DIRECTION.md section 5.4).
 * Bands are metres above sea level and come straight from the locked direction.
 */
export const terrainBands = [
  { upTo: 1800, color: "#6E6A55", name: "dry prairie" },
  { upTo: 2100, color: "#7E7A5C", name: "steppe" },
  { upTo: 2400, color: "#5F6247", name: "open range" },
  { upTo: 2700, color: "#47503A", name: "scrub" },
  { upTo: 3000, color: "#36402F", name: "forest" },
  { upTo: 3300, color: "#5E5C55", name: "rock" },
  { upTo: 3600, color: "#8A877E", name: "scree" },
  { upTo: Number.POSITIVE_INFINITY, color: "#C9C7BE", name: "snow" },
] as const;

/**
 * Town cluster materials. Value falls with class, so a city reads darker and denser
 * than a village from the same distance. Desaturated like everything else here.
 */
export const townColor = {
  cityWall: "#7C7A6E",
  townWall: "#8A8676",
  villageWall: "#948E7C",
  cityRoof: "#5C5A50",
  townRoof: "#6A675C",
  silo: "#D5D2C7",
} as const;

export const mapColor = {
  water: "#35474E",
  roadMajor: "#26251F",
  roadMinor: "#4A473E",
  rail: "#6E6455",
  /** Sky and fog, matched to the grade so the horizon does not fight the terrain. */
  sky: "#9AA0A2",
  fog: "#8E9497",
} as const;

/** Settled sizes for town silhouettes (ART_DIRECTION.md section 7). */
export const townClass = {
  city: { minPopulation: 100_000, minHeight: 18, maxHeight: 34, marker: "double-diamond" },
  town: { minPopulation: 25_000, minHeight: 8, maxHeight: 16, marker: "diamond" },
  village: { minPopulation: 0, minHeight: 3, maxHeight: 6, marker: "hollow-diamond" },
} as const;

export type TownClassName = keyof typeof townClass;

export const tokens = {
  space,
  paper,
  ink,
  status,
  accent,
  unitKind,
  type,
  font,
  radius,
  sheet,
  focusRing,
  terrainBands,
  mapColor,
  townColor,
  townClass,
} as const;

/**
 * Screen sizes checked before any UI is called done (CONSTITUTION.md section 3.4).
 * `UI_UX.md` section 13 puts mobile out of scope for V1, which is why `small` only
 * has to not break.
 */
export const breakpoints = {
  wide: 1200,
  desktop: 900,
  tablet: 600,
  small: 0,
} as const;
