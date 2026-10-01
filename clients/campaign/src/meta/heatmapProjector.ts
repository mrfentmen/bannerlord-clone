/**
 * World→screen projector for the battle heatmap overlay (task 140).
 *
 * Kept in its own module so heatmap.ts stays Babylon-free. Only the math
 * leaf modules are imported — never the engine — so this stays cheap and
 * importable in vitest's node environment.
 */

import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Frustum } from "@babylonjs/core/Maths/math.frustum.js";
import type { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

/** Structural view of the Babylon scene pieces the projector needs. */
export interface ProjectorScene {
  activeCamera: {
    getViewMatrix(): Matrix;
    getProjectionMatrix(): Matrix;
    viewport: { toGlobal(renderWidth: number, renderHeight: number): Viewport };
  } | null;
  getEngine(): { getRenderWidth(): number; getRenderHeight(): number };
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Build a projector for the scene's active camera. Points outside the camera
 * frustum (including behind it) project to null, so blobs never smear across
 * the screen when their cell is off-camera. The frustum test is
 * handedness-agnostic: it uses the extracted frustum planes, not a view-space
 * z sign convention.
 */
export function makeWorldProjector(
  scene: ProjectorScene,
  heightAt?: (x: number, z: number) => number,
): (x: number, z: number) => ScreenPoint | null {
  return (x: number, z: number): ScreenPoint | null => {
    const camera = scene.activeCamera;
    if (!camera) return null;
    const engine = scene.getEngine();
    const view = camera.getViewMatrix();
    const projection = camera.getProjectionMatrix();
    const viewProjection = view.multiply(projection);

    // Cull first: a point behind the camera projects to garbage.
    const worldPoint = new Vector3(x, heightAt ? heightAt(x, z) : 0, z);
    const planes = Frustum.GetPlanes(viewProjection);
    for (const plane of planes) {
      if (plane.dotCoordinate(worldPoint) < 0) return null;
    }

    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const projected = Vector3.Project(worldPoint, Matrix.Identity(), viewProjection, viewport);
    return { x: projected.x, y: projected.y };
  };
}
