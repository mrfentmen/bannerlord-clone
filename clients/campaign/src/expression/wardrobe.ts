/**
 * Tasks 124 & 128: war paint / cosmetics and victory poses.
 * Unlockable catalogs; unlocking is deed-driven data the campaign layer
 * records. Equipping is a selection the renderer reads.
 */

import type { Cosmetic, VictoryPose } from "./types.js";

export const COSMETICS: Cosmetic[] = [
  { id: "paint-ash", name: "Ash stripes", slot: "war-paint", unlock: "Win 5 battles" },
  { id: "paint-blood", name: "Blood hand", slot: "war-paint", unlock: "Win a battle outnumbered" },
  { id: "trim-gold", name: "Gold trim", slot: "armor-trim", unlock: "Hold 10,000 coin" },
  { id: "trim-iron", name: "Iron trim", slot: "armor-trim", unlock: "Own a smithy" },
  { id: "cloak-wolf", name: "Wolf cloak", slot: "cloak", unlock: "Defeat the Rust Horde warlord" },
  { id: "cloak-raven", name: "Raven cloak", slot: "cloak", unlock: "Complete 10 schemes" },
];

export const VICTORY_POSES: VictoryPose[] = [
  { id: "pose-fist", name: "Raised fist", unlock: "Win your first battle" },
  { id: "pose-kneel", name: "Kneel of respect", unlock: "Win without losing a unit" },
  { id: "pose-banner", name: "Banner plant", unlock: "Capture an enemy banner" },
  { id: "pose-silence", name: "Silent vigil", unlock: "Win a battle at night" },
];

export interface Wardrobe {
  unlocked(): string[];
  unlock(id: string): void;
  equipped(): Record<string, string | null>;
  equip(slot: Cosmetic["slot"], id: string): void;
  victoryPose(): string | null;
  setVictoryPose(id: string): void;
}

export type WarPaintLayer = "base" | "marking" | "accent";

export interface WarPaintDesign {
  /** Pattern id per layer, or null for bare skin. */
  layers: Record<WarPaintLayer, string | null>;
  /** Opacity 0..1 per layer. */
  opacity: Record<WarPaintLayer, number>;
}

export const WAR_PAINT_LAYERS: WarPaintLayer[] = ["base", "marking", "accent"];

export function createWarPaintDesign(): WarPaintDesign {
  return {
    layers: { base: null, marking: null, accent: null },
    opacity: { base: 1, marking: 1, accent: 1 },
  };
}

/**
 * Task 135: paint a layer. Opacity clamps to 0..1; clearing the pattern
 * resets that layer's opacity to full.
 */
export function setWarPaintLayer(
  design: WarPaintDesign,
  layer: WarPaintLayer,
  pattern: string | null,
  opacity = 1,
): WarPaintDesign {
  return {
    layers: { ...design.layers, [layer]: pattern },
    opacity: {
      ...design.opacity,
      [layer]: pattern === null ? 1 : Math.min(1, Math.max(0, opacity)),
    },
  };
}

export function createWardrobe(): Wardrobe {
  const unlockedSet = new Set<string>();
  const equippedMap = new Map<Cosmetic["slot"], string>();
  let pose: string | null = null;
  const known = (id: string) =>
    COSMETICS.some((c) => c.id === id) || VICTORY_POSES.some((p) => p.id === id);
  return {
    unlocked: () => [...unlockedSet],
    unlock(id) {
      if (!known(id)) throw new Error(`unknown cosmetic: ${id}`);
      unlockedSet.add(id);
    },
    equipped: () => ({
      "war-paint": equippedMap.get("war-paint") ?? null,
      "armor-trim": equippedMap.get("armor-trim") ?? null,
      cloak: equippedMap.get("cloak") ?? null,
    }),
    equip(slot, id) {
      const item = COSMETICS.find((c) => c.id === id);
      if (!item || item.slot !== slot) throw new Error(`no ${slot} cosmetic ${id}`);
      if (!unlockedSet.has(id)) throw new Error(`${item.name} is not unlocked yet`);
      equippedMap.set(slot, id);
    },
    victoryPose: () => pose,
    setVictoryPose(id) {
      if (!VICTORY_POSES.some((p) => p.id === id)) throw new Error(`unknown pose: ${id}`);
      if (!unlockedSet.has(id)) throw new Error("pose is not unlocked yet");
      pose = id;
    },
  };
}
