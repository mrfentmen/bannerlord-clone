/**
 * The vocabulary both unit factories agree on.
 *
 * The scene asks a `UnitFactory` for a unit; it does not know or care whether the
 * geometry came from a vendored GLB or from the procedural placeholder. That is the
 * whole point of this module: `CampaignScene.ts` builds its party marker out of
 * primitives today, and swapping in CC0 character packs later must not change a line
 * of scene code.
 *
 * Colours here are token references, never literals. `CONSTITUTION.md` section 3.4
 * forbids a component inventing its own palette, and `ART_DIRECTION.md` section 5 is
 * the lock, so a unit's team colours are assembled from `src/design/tokens.ts` rather
 * than typed in.
 */

import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { accent, ink, paper, status } from "../../design/tokens.js";

/**
 * The four shapes a party on the map can take.
 *
 * These are what a manifest can key on and what a silhouette is chosen from. A rig that
 * cannot be classified as one of these is not a unit the pipeline can draw.
 */
export const UNIT_KINDS = ["infantry", "cavalry", "vehicle", "civilian"] as const;

export type UnitKind = (typeof UNIT_KINDS)[number];

export function isUnitKind(value: unknown): value is UnitKind {
  return typeof value === "string" && (UNIT_KINDS as readonly string[]).includes(value);
}

/**
 * The four colour jobs a unit has.
 *
 * Kept to four on purpose. A packed character has far more materials than this — skin,
 * boots, webbing — and the mapping is by name, so an unnamed material falls back to
 * `primary` and a busy rig still reads as one team colour rather than as a collage.
 * `ART_DIRECTION.md` section 8 is explicit that unifying many artists' assets into one
 * look is the core art job, and a four-slot palette is the mechanism.
 */
export type UnitPaletteSlot = "primary" | "secondary" | "accent" | "metal";

/** Hex strings, `#RRGGBB`, in the locked palette. */
export interface UnitPalette {
  /** Team colour. The bulk of the unit. */
  readonly primary: string;
  /** Team colour in shadow: webbing, a coat, the underside of a brim. */
  readonly secondary: string;
  /** The one contrasting note: a pennant, a hi-vis stripe, a vehicle's stripe. */
  readonly accent: string;
  /** Cold gunmetal and dull aluminium. */
  readonly metal: string;
}

/**
 * The standing teams, assembled from locked tokens.
 *
 * `stamp-blue` for the player because `ART_DIRECTION.md` section 5.3 assigns it to the
 * player outright. `oxide` for hostile, `amber` for neutral, ink for civilian. Nothing
 * here is a new colour.
 */
export const UNIT_TEAMS = ["player", "hostile", "neutral", "civilian"] as const;

export type UnitTeam = (typeof UNIT_TEAMS)[number];

export const unitPalettes: Record<UnitTeam, UnitPalette> = {
  player: {
    primary: accent.primary,
    secondary: accent.primaryDeep,
    // Paper on the pennant: at campaign zoom a small shape has to survive against
    // olive plains, dark forest and white snow, and a deep blue flag does not.
    accent: accent.primaryInk,
    metal: ink[500],
  },
  hostile: {
    primary: status.critical.mark,
    secondary: status.critical.fill,
    accent: status.critical.ink,
    metal: ink[500],
  },
  neutral: {
    primary: status.warning.mark,
    secondary: status.warning.fill,
    accent: status.warning.ink,
    metal: ink[500],
  },
  civilian: {
    primary: ink[700],
    secondary: ink[900],
    accent: paper[100],
    metal: ink[300],
  },
};

/**
 * A unit as the scene asks for one: what it is, what colour it is, how big.
 *
 * Deliberately flat and serialisable. A save file, a network message and a procedural
 * placeholder all have to be able to carry this object unchanged.
 */
export interface UnitAppearance {
  readonly kind: UnitKind;
  readonly palette: UnitPalette;
  /** Uniform multiplier on the unit's own metres. 1 is the authored size. */
  readonly scale: number;
}

/**
 * Everything that can put a unit on the map.
 *
 * Asynchronous from the first draft, because the GLB factory is a network fetch and a
 * procedural factory that returned synchronously would be a lie about that: the scene
 * must already be written to await this. There is no spinner here and none is needed —
 * `ART_DIRECTION.md` section 11's skeleton rule is about data panels, and a map marker
 * that is one frame late is not a state the player sees.
 */
export interface UnitFactory {
  create(appearance: UnitAppearance): Promise<TransformNode>;
}

/** Where a unit's geometry actually came from. Recorded so a panel can say so. */
export type UnitSource = "procedural" | "glb";

/**
 * What both factories write onto the root node's `metadata`.
 *
 * The scene reads a unit through this and nothing else, so replacing the factory
 * cannot change what the scene knows about a unit. `url` is null for procedural units.
 */
export interface UnitNodeMetadata {
  readonly unitKind: UnitKind;
  readonly source: UnitSource;
  readonly appearance: UnitAppearance;
  /** The manifest URL that produced this unit, or null when it is a placeholder. */
  readonly url: string | null;
}

export const DEFAULT_UNIT_SCALE = 1;

/**
 * Scale bounds. A save file or a network message can carry any number at all, and a
 * zero scale collapses a unit to an invisible speck while a large one is a performance
 * problem that only shows up on someone else's machine.
 */
export const MIN_UNIT_SCALE = 0.1;
export const MAX_UNIT_SCALE = 20;

/** How a malformed appearance field was repaired, reported to the caller verbatim. */
export interface AppearanceIssue {
  readonly field: "kind" | "palette" | "scale";
  readonly received: string;
  readonly used: string;
}

/**
 * Repair an appearance that came from outside this module.
 *
 * `CONSTITUTION.md` section 1.3: an untrusted input is handled, not trusted and not
 * crashed on. Every field is checked, the substitute is a locked token or a unit-scale
 * bound rather than an invented value, and each repair is reported so the full detail
 * reaches the log while the caller still gets a usable unit.
 */
export function normalizeAppearance(
  input: Partial<UnitAppearance> & { readonly kind?: unknown },
  team: UnitTeam | string = "civilian",
  onIssue?: (issue: AppearanceIssue) => void,
): { appearance: UnitAppearance; issues: AppearanceIssue[] } {
  const issues: AppearanceIssue[] = [];
  const note = (issue: AppearanceIssue): void => {
    issues.push(issue);
    onIssue?.(issue);
  };

  const rawKind: unknown = input.kind;
  const kind: UnitKind = isUnitKind(rawKind) ? rawKind : "infantry";
  if (!isUnitKind(rawKind)) {
    note({
      field: "kind",
      received: describe(rawKind),
      used: kind,
    });
  }

  const rawScale: unknown = input.scale;
  const scale = clampScale(typeof rawScale === "number" ? rawScale : Number.NaN);
  if (scale !== rawScale) {
    note({ field: "scale", received: describe(rawScale), used: String(scale) });
  }

  const base = unitPalettes[team as UnitTeam] ?? unitPalettes.civilian;
  const rawPalette = (input.palette ?? {}) as Partial<Record<UnitPaletteSlot, unknown>>;
  const palette = {} as Record<UnitPaletteSlot, string>;
  for (const slot of ["primary", "secondary", "accent", "metal"] as const) {
    const value = rawPalette[slot];
    if (value === undefined) {
      // A slot the caller never mentioned is the team's own locked colour, not a
      // repair: there is nothing untrusted to report.
      palette[slot] = base[slot];
    } else if (isHexColour(value)) {
      palette[slot] = value;
    } else {
      palette[slot] = base[slot];
      note({ field: "palette", received: `${slot}=${describe(value)}`, used: `${slot}=${base[slot]}` });
    }
  }

  return {
    appearance: { kind, palette: { primary: palette.primary, secondary: palette.secondary, accent: palette.accent, metal: palette.metal }, scale },
    issues,
  };
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return DEFAULT_UNIT_SCALE;
  return Math.min(MAX_UNIT_SCALE, Math.max(MIN_UNIT_SCALE, scale));
}

/** `#RRGGBB` only. Three-digit and named colours are refused rather than guessed at. */
export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/**
 * Read a unit's metadata back off its root node.
 *
 * Null when the node is not a unit, so a caller holding an arbitrary `TransformNode`
 * can ask without having to know which factory made it.
 */
export function readUnitMetadata(node: TransformNode): UnitNodeMetadata | null {
  const metadata = node.metadata as UnitNodeMetadata | undefined;
  if (!metadata || !isUnitKind(metadata.unitKind)) return null;
  return metadata;
}

/**
 * Which palette slot a material or mesh name is asking for.
 *
 * The whole tint mechanism for vendored packs, and it is name-matching because that is
 * all a GLB gives you: the same rig used for two teams is the same file with two
 * palettes. Anything unrecognised is `primary`, so a rig nobody annotated still comes
 * out in one team colour instead of in whatever colours its artist baked.
 */
export function slotForName(name: string): UnitPaletteSlot {
  const lower = name.toLowerCase();
  if (/(^|[^a-z])(accent|flag|pennant|hi-?vis|stripe)([^a-z]|$)/.test(lower)) return "accent";
  if (/(^|[^a-z])(secondary|webbing|shadow|coat|dark)([^a-z]|$)/.test(lower)) return "secondary";
  if (/(^|[^a-z])(metal|gunmetal|steel|weapon|rifle|equipment)([^a-z]|$)/.test(lower)) return "metal";
  return "primary";
}

function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return Object.prototype.toString.call(value);
}