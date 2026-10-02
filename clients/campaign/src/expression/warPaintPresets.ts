/**
 * War paint presets (Rowan solo task 96).
 *
 * Eight preset war-paint designs, one click to apply: each preset fills
 * all three layers (base, marking, accent) with pattern ids and opacity.
 * Applying a preset returns a complete WarPaintDesign.
 */

import type { WarPaintDesign, WarPaintLayer } from "./wardrobe.js";

export interface WarPaintPreset {
  id: string;
  name: string;
  description: string;
  layers: Record<WarPaintLayer, string | null>;
  opacity: Record<WarPaintLayer, number>;
}

function preset(
  id: string,
  name: string,
  description: string,
  layers: Record<WarPaintLayer, string | null>,
  opacity: Record<WarPaintLayer, number> = { base: 1, marking: 1, accent: 1 },
): WarPaintPreset {
  return { id, name, description, layers, opacity };
}

export const WAR_PAINT_PRESETS: WarPaintPreset[] = [
  preset("blood-eagle", "Blood Eagle", "Crimson wings across the cheeks.",
    { base: null, marking: "eagle-wings", accent: "blood-stripes" }),
  preset("night-raven", "Night Raven", "Black raven feathers over pale ash.",
    { base: "ash-pale", marking: "raven-feathers", accent: null }),
  preset("sun-clan", "Sun Clan", "Gold sun disc on a bronze base.",
    { base: "bronze", marking: "sun-disc", accent: "gold-lines" }, { base: 0.8, marking: 1, accent: 0.9 }),
  preset("winter-wolf", "Winter Wolf", "Grey wolf fangs on frost blue.",
    { base: "frost-blue", marking: "wolf-fangs", accent: null }, { base: 0.7, marking: 1, accent: 1 }),
  preset("serpent", "Serpent", "Green serpent coils around the eyes.",
    { base: null, marking: "serpent-coil", accent: "scale-dots" }),
  preset("stormcaller", "Stormcaller", "Lightning forks on a slate base.",
    { base: "slate", marking: "lightning", accent: "storm-dots" }, { base: 0.85, marking: 1, accent: 0.8 }),
  preset("red-hand", "Red Hand", "A single red handprint over bare skin.",
    { base: null, marking: "handprint", accent: null }),
  preset("ghost", "Ghost", "White death-mask, hollow eyes.",
    { base: "bone-white", marking: "hollow-eyes", accent: "crack-lines" }, { base: 0.9, marking: 1, accent: 0.7 }),
];

/** Look up a preset by id. */
export function warPaintPreset(id: string): WarPaintPreset {
  const found = WAR_PAINT_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`unknown war paint preset: ${id}`);
  return found;
}

/** One-click apply: returns a complete WarPaintDesign. */
export function applyWarPaintPreset(id: string): WarPaintDesign {
  const p = warPaintPreset(id);
  return { layers: { ...p.layers }, opacity: { ...p.opacity } };
}
