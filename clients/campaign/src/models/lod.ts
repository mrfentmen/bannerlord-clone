/**
 * Task 608: distance LOD for loaded models.
 *
 * Distance LOD is the engine's own: every level is a real decimated copy of the
 * mesh, and Babylon swaps to it once the camera passes the level's distance.
 * That matters here because a line of soldiers forty metres out and the same
 * line two hundred metres out should not cost the same triangles. Nothing in
 * this module pretends to be a cheaper model — the levels are produced by
 * Babylon's quadratic-error simplifier from the actual GLB geometry.
 *
 * Importing this module registers Babylon's simplification queue component and
 * the `mesh.simplify` extension, which is what makes a simplification task
 * possible at all. The engine runs those tasks during frames, so the levels
 * appear a few frames after {@link applyDistanceLod} returns; pass `onApplied`
 * when a caller needs to know they are there.
 *
 * The far end of the ladder belongs to task 610 (cull beyond 500 m) and task
 * 609 (cull behind the camera), which sit on top of these levels rather than
 * duplicating them.
 */

import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import {
  SimplificationType,
  type ISimplificationSettings,
} from "@babylonjs/core/Meshes/meshSimplification.js";
// Side-effect import: registers Scene.simplificationQueue and Mesh.simplify.
import "@babylonjs/core/Meshes/meshSimplificationSceneComponent.js";

/** One detail step of a model: how far away it applies, and how much is kept. */
export interface DistanceLodLevel {
  /** 1 keeps every triangle, 0.5 keeps about half; clamped to 0..1. */
  quality: number;
  /** Camera distance in metres at which this step takes over. */
  distance: number;
}

/**
 * The ladder used when a caller does not bring its own. The first step halves
 * the mesh at 60 m, the second keeps a quarter at 180 m; past the last step the
 * quarter-detail mesh keeps drawing until task 610's 500 m cull takes over.
 */
export const DEFAULT_LOD_LEVELS: readonly DistanceLodLevel[] = [
  { distance: 60, quality: 0.5 },
  { distance: 180, quality: 0.25 },
];

/** How to run the simplification queue for one mesh (task 608). */
export interface ApplyDistanceLodOptions {
  /**
   * Run every level in parallel instead of one per queue step. Serial is the
   * default so the levels land in the order they are listed.
   */
  parallel?: boolean;
  /** Called once when every level has been added to the mesh. */
  onApplied?: () => void;
}

/**
 * Turns the ladder into simplifier settings, clamping quality into 0..1.
 * A level with a non-finite or non-positive distance cannot be used by the
 * engine's LOD ladder, so it is rejected here rather than silently ignored.
 */
export function lodSettingsFor(
  levels: readonly DistanceLodLevel[] = DEFAULT_LOD_LEVELS,
): ISimplificationSettings[] {
  return levels.map((level) => {
    if (!Number.isFinite(level.distance) || level.distance <= 0) {
      throw new RangeError(`lodSettingsFor: bad LOD distance ${level.distance}`);
    }
    return {
      quality: Math.min(1, Math.max(0, level.quality)),
      distance: level.distance,
      optimizeMesh: true,
    };
  });
}

/**
 * Task 608: give a loaded model a real distance LOD ladder. The mesh keeps its
 * own geometry; the levels become lower-detail meshes the engine picks by
 * camera distance. Returns how many levels were requested, so a caller with an
 * empty ladder can tell "no LOD asked for" from "LOD applied".
 *
 * The work is queued, not finished: Babylon runs simplification tasks during
 * frames (see the module header), and `onApplied` fires when the last level is
 * in place.
 */
export function applyDistanceLod(
  mesh: Mesh,
  levels: readonly DistanceLodLevel[] = DEFAULT_LOD_LEVELS,
  options: ApplyDistanceLodOptions = {},
): number {
  const settings = lodSettingsFor(levels);
  if (settings.length === 0) return 0;
  mesh.simplify(settings, options.parallel ?? false, SimplificationType.QUADRATIC, options.onApplied);
  return settings.length;
}
