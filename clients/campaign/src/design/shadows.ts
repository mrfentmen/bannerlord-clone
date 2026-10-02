/**
 * Shadow quality levels (MASTER_PLAN task 147): four levels with
 * cascade/distance tradeoffs.
 *
 * - off: no shadow generator at all (today's default look, fastest).
 * - low: single 1024px shadow map, shadows only near the camera.
 * - medium: single 2048px shadow map with percentage-closer filtering,
 *   mid-range shadow distance.
 * - high: 2048px *cascaded* shadow map (3 cascades) over the full range —
 *   the cascade/distance tradeoff at full price.
 *
 * This module is the pure policy: per-level map size, shadow-camera range,
 * filtering, and cascade count, plus UI labels that state the cost. The
 * scene owns the Babylon generators and applies the config; nothing here
 * touches Babylon, so it unit-tests without an engine.
 *
 * Distances are world units on the kilometre-scale heightfield (the key
 * light sits at y=60,000; the ultra view distance reaches 400,000).
 */

export type ShadowLevel = "off" | "low" | "medium" | "high";

export const SHADOW_LEVELS: ShadowLevel[] = ["off", "low", "medium", "high"];

export interface ShadowLevelConfig {
  /** Shadow map resolution in px (unused when "off" — no generator). */
  mapSize: number;
  /**
   * Shadow camera range in world units. Single-map levels render shadows
   * inside this radius; the cascaded level splits it into `cascades` bands.
   */
  shadowDistance: number;
  /** Percentage-closer filtering softens edges at a GPU cost. */
  filtering: "none" | "pcf";
  /** 1 = single shadow map; >1 = cascaded generator with this many bands. */
  cascades: number;
  /** Short label for the settings UI. */
  label: string;
  /** One-line cost tradeoff for the settings UI. */
  blurb: string;
}

export const SHADOW_LEVEL_CONFIG: Record<Exclude<ShadowLevel, "off">, ShadowLevelConfig> = {
  low: {
    mapSize: 1024,
    shadowDistance: 90_000,
    filtering: "none",
    cascades: 1,
    label: "Low",
    blurb: "1024px · shadows near the camera only — fastest",
  },
  medium: {
    mapSize: 2048,
    shadowDistance: 200_000,
    filtering: "pcf",
    cascades: 1,
    label: "Medium",
    blurb: "2048px, softened edges · mid-range shadows",
  },
  high: {
    mapSize: 2048,
    shadowDistance: 400_000,
    filtering: "pcf",
    cascades: 3,
    label: "High",
    blurb: "2048px · 3 cascades · full range — slowest",
  },
};

/** True for levels that render any shadows. */
export function shadowsEnabled(level: ShadowLevel): boolean {
  return level !== "off";
}

/** Config for a level, or null when shadows are off. */
export function shadowConfigFor(level: ShadowLevel): ShadowLevelConfig | null {
  return level === "off" ? null : SHADOW_LEVEL_CONFIG[level];
}
