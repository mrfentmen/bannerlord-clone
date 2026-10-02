/**
 * Task 563: combat intensity layers.
 *
 * The battle theme ships as four stems over one loop — drums, bass, fx, lead —
 * so a fight can gain weight as the enemy closes instead of switching tracks.
 * This module is the ladder: a 0..1 intensity mapped to the stems that should be
 * heard. The mixer ramps each stem's gain to its target rather than cutting it,
 * and every stem is the same length, so they stay in phase once started together.
 */

import type { SfxId } from "./AudioManager.js";

/** One stem of the combat bed and the intensity at which it joins. */
export interface CombatLayer {
  id: SfxId;
  /** The lowest intensity that includes this stem. */
  threshold: number;
}

/**
 * The ladder, sparse to full: drums carry the pulse early, bass fills the middle,
 * fx and lead are saved for a fight that is genuinely on top of the player. The
 * ids are the real `battle-theme-stem-*` manifest entries.
 */
export const COMBAT_LAYERS: readonly CombatLayer[] = [
  { id: "battle-theme-stem-drums", threshold: 0.2 },
  { id: "battle-theme-stem-bass", threshold: 0.4 },
  { id: "battle-theme-stem-fx", threshold: 0.6 },
  { id: "battle-theme-stem-lead", threshold: 0.8 },
];

/**
 * The stems that should be heard at this intensity (task 563). The input is
 * clamped rather than trusted: a caller reading a distance can produce NaN or a
 * negative number, and either would otherwise silence the whole bed.
 */
export function battleLayersFor(intensity: number): SfxId[] {
  const level = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return COMBAT_LAYERS.filter((layer) => level >= layer.threshold).map((layer) => layer.id);
}
