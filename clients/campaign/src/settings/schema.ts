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
import {
  DEFAULT_DIFFICULTY,
  parseDifficulty,
  type DifficultySettings,
} from "./difficulty.js";
import {
  DEFAULT_GRAIN_INTENSITY,
  clampGrainIntensity,
  lookPresetFor,
  type LookPresetId,
} from "../design/lookPresets.js";

export const SETTINGS_VERSION = 3;

/** The UI-scale steps the HUD offers (task 17: 80–150%). Anything else is clamped to the nearest. */
export const UI_SCALE_STEPS = [80, 90, 100, 115, 130, 150] as const;
/** Color vision deficiency remapping for faction/unit colors (task 18). */
export type ColorblindMode = "off" | "deuteranopia" | "protanopia" | "tritanopia";
/** Dialogue subtitle size (task 21). */
export type SubtitleSize = "small" | "medium" | "large";
/** Subtitle background treatment (task 21). */
export type SubtitleBackground = "off" | "translucent" | "solid";

export type GraphicsQuality = "low" | "medium" | "high" | "ultra";
export type TerrainDetail = "low" | "high";
export type PowerPreference = "default" | "low-power" | "high-performance";
/** Real-time shadow maps on the key light. Default off: today's rendering, unchanged. */
export type ShadowQuality = "off" | "low" | "medium" | "high";
/** Draw distance. "far" is today's tuned fog/maxZ; the others trade reach for speed. */
export type ViewDistance = "near" | "far" | "ultra";

/** Shadow map resolution per quality level (task 147). "off" creates no generator.
 * Kept for compatibility; new code should use SHADOW_LEVEL_CONFIG from
 * design/shadows.ts, which also carries distance/cascade/filtering policy. */
export const SHADOW_MAP_SIZE: Record<Exclude<ShadowQuality, "off">, number> = {
  low: 1024,
  medium: 2048,
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
  /** Film grain + color grading preset (task 145). Live: the scene re-grades. */
  lookPreset: LookPresetId;
  /** Grain intensity slider, 0..1. Live: scales the resolved grain; 0 disables. */
  grainIntensity: number;
  /** Bloom post-process (task 146). Live: each toggle applies independently. */
  bloomEnabled: boolean;
  /** Pipeline vignette gate (task 146): the look grade's vignette shows only when on. Live. */
  vignetteEnabled: boolean;
  /** Depth of field post-process (task 146). Live. */
  depthOfFieldEnabled: boolean;
  /** Motion blur post-process (task 146). Live; forced off by reduceMotion. */
  motionBlurEnabled: boolean;
  /** Mouse orbit/zoom multiplier on the 3D canvas. Live. */
  mouseSensitivity: number;
  /** Invert mouse orbit axes. Live. */
  invertMouseX: boolean;
  invertMouseY: boolean;
  /** UI scale step; applied live via the `data-ui-scale` attribute. */
  uiScale: number;
  /** Remaps faction/unit colors for color vision deficiency (task 18). Live. */
  colorblindMode: ColorblindMode;
  /** High-contrast UI theme (task 19). Applied live via `data-high-contrast`. */
  highContrast: boolean;
  /** Dialogue subtitle size (task 21). Live. */
  subtitleSize: SubtitleSize;
  /** Subtitle background treatment (task 21). Live. */
  subtitleBackground: SubtitleBackground;
  /** Hold-to-open inputs behave as toggles instead (task 23). Live. */
  holdToggles: boolean;
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
  /** Floating damage numbers over hits in battle (task 51). Live. */
  floatingDamageNumbers: boolean;
  /** Brief freeze on heavy hits (task 57). Live. Disabled by reduceMotion. */
  hitStop: boolean;
  /** Screen shake on heavy hits (task 57). Live. Disabled by reduceMotion. */
  screenShake: boolean;
  /** Custom key chords, as serialized by the input registry. */
  keyBindings: Record<string, KeyBinding[]>;
  /** Custom difficulty sliders + preset (task 144). Live: read at use time. */
  difficulty: DifficultySettings;
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
  lookPreset: "standard",
  grainIntensity: DEFAULT_GRAIN_INTENSITY,
  bloomEnabled: false,
  vignetteEnabled: true,
  depthOfFieldEnabled: false,
  motionBlurEnabled: false,
  mouseSensitivity: 1,
  invertMouseX: false,
  invertMouseY: false,
  uiScale: 100,
  colorblindMode: "off",
  highContrast: false,
  subtitleSize: "medium",
  subtitleBackground: "translucent",
  holdToggles: false,
  cameraSpeed: 1,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  language: "en",
  reduceMotion: false,
  gamepadEnabled: true,
  hapticsEnabled: true,
  floatingDamageNumbers: true,
  hitStop: true,
  screenShake: true,
  autoQualityDone: false,
  keyBindings: {},
  difficulty: DEFAULT_DIFFICULTY,
};

const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ["low", "medium", "high", "ultra"];
const TERRAIN_DETAILS: readonly TerrainDetail[] = ["low", "high"];
const MAX_FPS_VALUES: readonly Settings["maxFps"][] = [0, 30, 60, 120];
const POWER_PREFERENCES: readonly PowerPreference[] = ["default", "low-power", "high-performance"];
const COLORBLIND_MODES: readonly ColorblindMode[] = ["off", "deuteranopia", "protanopia", "tritanopia"];
const SUBTITLE_SIZES: readonly SubtitleSize[] = ["small", "medium", "large"];
const SUBTITLE_BACKGROUNDS: readonly SubtitleBackground[] = ["off", "translucent", "solid"];
const SHADOW_QUALITIES: readonly ShadowQuality[] = ["off", "low", "medium", "high"];
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
    lookPreset: lookPresetFor(v.lookPreset).id,
    grainIntensity: clampGrainIntensity(v.grainIntensity),
    bloomEnabled: v.bloomEnabled === true,
    vignetteEnabled: v.vignetteEnabled !== false,
    depthOfFieldEnabled: v.depthOfFieldEnabled === true,
    motionBlurEnabled: v.motionBlurEnabled === true,
    mouseSensitivity: pickNumber(v.mouseSensitivity, 0.25, 3, DEFAULT_SETTINGS.mouseSensitivity),
    invertMouseX: v.invertMouseX === true,
    invertMouseY: v.invertMouseY === true,
    uiScale: nearestStep(v.uiScale, DEFAULT_SETTINGS.uiScale),
    colorblindMode: pickEnum(v.colorblindMode, COLORBLIND_MODES, DEFAULT_SETTINGS.colorblindMode),
    highContrast: v.highContrast === true,
    subtitleSize: pickEnum(v.subtitleSize, SUBTITLE_SIZES, DEFAULT_SETTINGS.subtitleSize),
    subtitleBackground: pickEnum(v.subtitleBackground, SUBTITLE_BACKGROUNDS, DEFAULT_SETTINGS.subtitleBackground),
    holdToggles: v.holdToggles === true,
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
    floatingDamageNumbers: v.floatingDamageNumbers !== false,
    hitStop: v.hitStop !== false,
    screenShake: v.screenShake !== false,
    autoQualityDone: v.autoQualityDone === true,
    keyBindings: pickKeyBindings(v.keyBindings),
    difficulty: parseDifficulty(v.difficulty),
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
 * v0 (unversioned) -> v1 absorbed the legacy uiScale key; v1 -> v2 added the
 * difficulty sliders; v2 -> v3 added the look preset + grain intensity
 * (parseSettings defaults them for older blobs).
 * Unknown future versions fall back to defaults rather than pretending to
 * understand them.
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
