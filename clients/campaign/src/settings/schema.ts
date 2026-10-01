/**
 * The typed settings schema: every player-facing setting in one versioned object.
 *
 * Rules:
 * - `parseSettings` never throws and never returns garbage. Any field that fails
 *   validation falls back to its default, so a corrupt or hand-edited localStorage
 *   blob degrades to defaults instead of a broken client.
 * - `migrateSettings` owns schema evolution. Each version has a small upgrader;
 *   the current version validates and fills.
 * - Key bindings live here too, so there is exactly one persisted blob and one
 *   migration path. The input registry owns the live chords; this owns the bytes.
 */

import type { KeyBinding } from "../input/actions.js";

export const SETTINGS_VERSION = 1;

/** The UI-scale steps the HUD offers. Anything else is clamped to the nearest. */
export const UI_SCALE_STEPS = [90, 100, 115, 130] as const;

export type GraphicsQuality = "low" | "medium" | "high" | "ultra";
export type TerrainDetail = "low" | "high";
export type PowerPreference = "default" | "low-power" | "high-performance";
/** Real-time shadow maps on the key light. Default off: today's rendering, unchanged. */
export type ShadowQuality = "off" | "low" | "high";
/** Draw distance. "far" is today's tuned fog/maxZ; the others trade reach for speed. */
export type ViewDistance = "near" | "far" | "ultra";

/** Shadow map resolution per quality level ("off" creates no generator). */
export const SHADOW_MAP_SIZE: Record<Exclude<ShadowQuality, "off">, number> = {
  low: 1024,
  high: 2048,
};

/** Camera far plane and fog density per view distance. "far" = the tuned look. */
export const VIEW_DISTANCE_CONFIG: Record<ViewDistance, { maxZ: number; fogDensity: number }> = {
  near: { maxZ: 120_000, fogDensity: 0.000016 },
  far: { maxZ: 260_000, fogDensity: 0.0000085 },
  ultra: { maxZ: 400_000, fogDensity: 0.000004 },
};

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** Preset selector (task 12): one click applies the bundle in presets.ts. */
  graphicsQuality: GraphicsQuality;
  /** Render resolution scale: 1 = native, >1 = sharper/slower. Live. */
  renderScale: number;
  /** MSAA at engine creation. Needs a reload. */
  antialias: boolean;
  /** Terrain mesh density. Needs a reload. */
  terrainDetail: TerrainDetail;
  /** Frame cap: 0 = uncapped. Live. */
  maxFps: 0 | 30 | 60 | 120;
  /** GPU preference at engine creation. Needs a reload. */
  powerPreference: PowerPreference;
  /** Real-time shadows from the key light. Applied live (generator rebuild). */
  shadowQuality: ShadowQuality;
  /** Draw distance: camera far plane + fog density. Applied live. */
  viewDistance: ViewDistance;
  /** Mouse orbit/zoom multiplier on the 3D canvas. Live. */
  mouseSensitivity: number;
  /** Invert mouse orbit axes. Live. */
  invertMouseX: boolean;
  invertMouseY: boolean;
  /** UI scale step; applied live via the `data-ui-scale` attribute. */
  uiScale: number;
  /** Camera pan speed multiplier. Read at dispatch time, so it applies live. */
  cameraSpeed: number;
  /** 0..1. Stored and validated here; the audio pipeline (Hana's lane) applies them. */
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** BCP-47 tag. Only "en" has strings today; the field is ready for more. */
  language: string;
  /** Applied live via the `data-reduce-motion` attribute. */
  reduceMotion: boolean;
  gamepadEnabled: boolean;
  /** Rumble on battle events (orders, hits, deployment). Best-effort. */
  hapticsEnabled: boolean;
  /** Set once the first-launch quality benchmark has run (task 13). */
  autoQualityDone: boolean;
  /** Custom key chords, as serialized by the input registry. */
  keyBindings: Record<string, KeyBinding[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  graphicsQuality: "high",
  renderScale: 1,
  antialias: true,
  terrainDetail: "high",
  maxFps: 0,
  powerPreference: "default",
  shadowQuality: "off",
  viewDistance: "far",
  mouseSensitivity: 1,
  invertMouseX: false,
  invertMouseY: false,
  uiScale: 100,
  cameraSpeed: 1,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  language: "en",
  reduceMotion: false,
  gamepadEnabled: true,
  hapticsEnabled: true,
  autoQualityDone: false,
  keyBindings: {},
};

const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ["low", "medium", "high", "ultra"];
const TERRAIN_DETAILS: readonly TerrainDetail[] = ["low", "high"];
const MAX_FPS_VALUES: readonly Settings["maxFps"][] = [0, 30, 60, 120];
const POWER_PREFERENCES: readonly PowerPreference[] = ["default", "low-power", "high-performance"];
const SHADOW_QUALITIES: readonly ShadowQuality[] = ["off", "low", "high"];
const VIEW_DISTANCES: readonly ViewDistance[] = ["near", "far", "ultra"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickOneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
}

function pickNumber(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function nearestStep(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  let best: number = UI_SCALE_STEPS[0]!;
  for (const step of UI_SCALE_STEPS) {
    if (Math.abs(step - v) < Math.abs(best - v)) best = step;
  }
  return best;
}

function pickKeyBindings(v: unknown): Record<string, KeyBinding[]> {
  if (!isRecord(v)) return {};
  const out: Record<string, KeyBinding[]> = {};
  for (const [id, chords] of Object.entries(v)) {
    if (typeof id !== "string" || !Array.isArray(chords)) continue;
    const clean = chords.filter(
      (c): c is KeyBinding =>
        isRecord(c) && typeof c.key === "string" && c.key.length > 0 && c.key.length <= 24,
    );
    if (clean.length > 0) out[id] = clean.map((c) => ({ ...c }));
  }
  return out;
}

/** Validate one settings-shaped object into a full `Settings`. Never throws. */
export function parseSettings(raw: unknown): Settings {
  const v = isRecord(raw) ? raw : {};
  return {
    version: SETTINGS_VERSION,
    graphicsQuality: pickEnum(v.graphicsQuality, GRAPHICS_QUALITIES, DEFAULT_SETTINGS.graphicsQuality),
    renderScale: pickNumber(v.renderScale, 0.5, 2, DEFAULT_SETTINGS.renderScale),
    antialias: v.antialias !== false,
    terrainDetail: pickEnum(v.terrainDetail, TERRAIN_DETAILS, DEFAULT_SETTINGS.terrainDetail),
    maxFps: pickOneOf(v.maxFps, MAX_FPS_VALUES, DEFAULT_SETTINGS.maxFps),
    powerPreference: pickEnum(v.powerPreference, POWER_PREFERENCES, DEFAULT_SETTINGS.powerPreference),
    shadowQuality: pickEnum(v.shadowQuality, SHADOW_QUALITIES, DEFAULT_SETTINGS.shadowQuality),
    viewDistance: pickEnum(v.viewDistance, VIEW_DISTANCES, DEFAULT_SETTINGS.viewDistance),
    mouseSensitivity: pickNumber(v.mouseSensitivity, 0.25, 3, DEFAULT_SETTINGS.mouseSensitivity),
    invertMouseX: v.invertMouseX === true,
    invertMouseY: v.invertMouseY === true,
    uiScale: nearestStep(v.uiScale, DEFAULT_SETTINGS.uiScale),
    cameraSpeed: pickNumber(v.cameraSpeed, 0.25, 3, DEFAULT_SETTINGS.cameraSpeed),
    masterVolume: pickNumber(v.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
    musicVolume: pickNumber(v.musicVolume, 0, 1, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: pickNumber(v.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
    language:
      typeof v.language === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(v.language)
        ? v.language
        : DEFAULT_SETTINGS.language,
    reduceMotion: v.reduceMotion === true,
    gamepadEnabled: v.gamepadEnabled !== false,
    hapticsEnabled: v.hapticsEnabled !== false,
    autoQualityDone: v.autoQualityDone === true,
    keyBindings: pickKeyBindings(v.keyBindings),
  };
}

export interface MigrationInput {
  /** The raw parsed blob, whatever shape it arrived in. */
  raw: unknown;
  /**
   * Reads a legacy (pre-settings) localStorage key. Used once, at migration time,
   * to absorb keys like the old `campaign.uiScale`.
   */
  readLegacy: (key: string) => string | null;
}

/**
 * Bring any stored blob up to the current schema. Version upgrades chain here:
 * v0 (unversioned) -> v1 is the only step today. Unknown future versions fall
 * back to defaults rather than pretending to understand them.
 */
export function migrateSettings({ raw, readLegacy }: MigrationInput): Settings {
  const v = isRecord(raw) ? raw : {};
  const version = typeof v.version === "number" ? v.version : 0;

  if (version === SETTINGS_VERSION) return parseSettings(v);
  if (version > SETTINGS_VERSION) return { ...DEFAULT_SETTINGS }; // from the future; don't guess

  // v0 -> v1: absorb the pre-settings uiScale key, then validate everything.
  // Note: a missing legacy key reads as null, and Number(null) is 0 — so only
  // absorb when the key actually exists.
  const legacyRaw = readLegacy("campaign.uiScale");
  const legacyScale = legacyRaw === null ? NaN : Number(legacyRaw);
  const merged: Record<string, unknown> = { ...v, version: SETTINGS_VERSION };
  if (Number.isFinite(legacyScale) && merged.uiScale === undefined) {
    merged.uiScale = legacyScale;
  }
  return parseSettings(merged);
}
