/**
 * The player's party as 3D units on the campaign map.
 *
 * The scene asks a `UnitFactory` for two vehicles and gets `TransformNode`s back;
 * whether those are the procedural placeholders or the vendored GLBs from
 * `public/assets/units/` is the factory's business, not this file's. The factory
 * grounds whatever it returns (the GLB factory shifts feet to y = 0, the procedural
 * one builds on the ground plane), so slots sit at y = 0 and never inherit the old
 * box-convoy's hand-tuned heights.
 *
 * The convoy is asynchronous from the first frame: `buildPartyConvoy` returns the
 * root immediately so the scene can parent the mast, pennant and pin onto it, and
 * `ready` resolves when both vehicles have landed. A vehicle that never arrives
 * (the factory threw instead of falling back, which is a factory bug) leaves an
 * empty slot and reports through `onError`; it must not take the scene down.
 *
 * This module is additive: `CampaignScene.ts` keeps its mast/pennant/pin code, and
 * the two-vehicle swap is a small edit once the bundle-diet pass is done.
 */

import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { UnitFactory, UnitPalette } from "./types.js";

export interface ConvoyOptions {
  /** Called when a vehicle fails outright. The slot stays empty; the map survives. */
  readonly onError?: (error: unknown, slot: string) => void;
  /** Uniform multiplier on the authored vehicle size. 1 keeps the GLB's own scale. */
  readonly vehicleScale?: number;
}

export interface PartyConvoy {
  /** Attached to the scene graph immediately; vehicles land on it asynchronously. */
  readonly root: TransformNode;
  /** Resolves when every vehicle slot has either landed or reported an error. */
  readonly ready: Promise<void>;
  /** Names of the slots that landed, in slot order. */
  readonly landed: readonly string[];
}

const VEHICLE_SLOTS = ["party-lead", "party-second"] as const;
/** Slot offsets in metres, matching the old box convoy's footprint. */
const SLOT_OFFSETS: Record<(typeof VEHICLE_SLOTS)[number], readonly [number, number, number]> = {
  "party-lead": [0, 0, 0],
  "party-second": [0, 0, -14],
};

export function buildPartyConvoy(
  scene: Scene,
  factory: UnitFactory,
  palette: UnitPalette,
  options: ConvoyOptions = {},
): PartyConvoy {
  const root = new TransformNode("party", scene);
  const landed: string[] = [];
  const { onError, vehicleScale = 1 } = options;

  const pending = VEHICLE_SLOTS.map(async (slot) => {
    const [x, y, z] = SLOT_OFFSETS[slot];
    try {
      const node = await factory.create({ kind: "vehicle", palette, scale: vehicleScale });
      node.name = slot;
      node.parent = root;
      node.position.set(x, y, z);
      // Units are scenery, not targets: nothing under the convoy should intercept
      // pointer events meant for settlements and the route line.
      for (const mesh of node.getChildMeshes()) mesh.isPickable = false;
      landed.push(slot);
    } catch (error) {
      onError?.(error, slot);
    }
  });

  return { root, ready: Promise.all(pending).then(() => undefined), landed };
}
