/**
 * Graphics quality presets (MASTER_PLAN task 12).
 *
 * One click applies a coherent bundle of engine values. Values that the engine
 * only reads at creation (antialias, GPU preference, terrain mesh density)
 * take effect on the next load; the settings panel says so next to them.
 */

import type { GraphicsQuality, Settings } from "./schema.js";

export interface GraphicsBundle {
  renderScale: number;
  antialias: boolean;
  terrainDetail: Settings["terrainDetail"];
  maxFps: Settings["maxFps"];
  powerPreference: Settings["powerPreference"];
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsBundle> = {
  low: {
    renderScale: 1.5,
    antialias: false,
    terrainDetail: "low",
    maxFps: 30,
    powerPreference: "low-power",
  },
  medium: {
    renderScale: 1.25,
    antialias: true,
    terrainDetail: "low",
    maxFps: 60,
    powerPreference: "default",
  },
  high: {
    renderScale: 1,
    antialias: true,
    terrainDetail: "high",
    maxFps: 0,
    powerPreference: "default",
  },
  ultra: {
    renderScale: 0.85,
    antialias: true,
    terrainDetail: "high",
    maxFps: 0,
    powerPreference: "high-performance",
  },
};

/** The settings patch a preset click applies. */
export function presetPatch(quality: GraphicsQuality): Partial<Settings> {
  const b = GRAPHICS_PRESETS[quality];
  return {
    graphicsQuality: quality,
    renderScale: b.renderScale,
    antialias: b.antialias,
    terrainDetail: b.terrainDetail,
    maxFps: b.maxFps,
    powerPreference: b.powerPreference,
  };
}

/** One-line summary for the settings UI, so players see what a click changes. */
export function describePreset(quality: GraphicsQuality): string {
  const b = GRAPHICS_PRESETS[quality];
  const res = b.renderScale === 1 ? "native" : `${Math.round((1 / b.renderScale) * 100)}%`;
  return [
    `render ${res}`,
    b.antialias ? "AA on" : "AA off",
    `terrain ${b.terrainDetail}`,
    b.maxFps === 0 ? "uncapped" : `${b.maxFps} fps`,
    `GPU ${b.powerPreference}`,
  ].join(" · ");
}
