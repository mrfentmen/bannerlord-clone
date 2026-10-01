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

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** Render resolution scaling. Applied live to the Babylon engine. */
  graphicsQuality: GraphicsQuality;
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
  /** Custom key chords, as serialized by the input registry. */
  keyBindings: Record<string, KeyBinding[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  graphicsQuality: "high",
  uiScale: 100,
  cameraSpeed: 1,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  language: "en",
  reduceMotion: false,
  gamepadEnabled: true,
  keyBindings: {},
};

const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ["low", "medium", "high", "ultra"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
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
