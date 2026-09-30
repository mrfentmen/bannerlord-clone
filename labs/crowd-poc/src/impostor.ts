/**
 * Far-tier billboard impostor atlas.
 *
 * ASSETS.md section 4.3 and SPEC.md section 5.1: the far tier is a billboard impostor, and
 * ART_AND_AUDIO.md section 7 requires the silhouette to read at distance. So the atlas is rendered
 * from the real skinned close-tier mesh at N viewing angles across N animation frames, which is the
 * only way the far tier keeps the gait instead of becoming a static cardboard cut-out.
 *
 * It is rendered with Babylon rather than in Blender for two reasons: this project's headless
 * Blender cannot render at all on the build machine (see ASSET_PIPELINE_NOTES.md), and rendering
 * with the runtime engine means the far tier is graded identically to the near tiers.
 *
 * Atlas layout: `angles` columns across the horizontal circle, `frames` rows down the clip.
 * The PNG comes back as a data URL and the Node driver writes it to disk, because a page cannot
 * write files. That is also what gets a manifest entry.
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { AnimHeader, CrowdConfig } from "./config";
import { TroopSources } from "./glb";
import { buildSkinnedMesh } from "./mesh-factory";
import { SkinnedMaterial } from "./skinning";

export interface ImpostorResult {
  /** PNG as a data URL. */
  atlas: string;
  width: number;
  height: number;
  angles: number;
  frames: number;
  cellPx: number;
  clip: string;
  /** Cells that actually contain a silhouette. All of them should. */
  nonEmptyCells: number;
  cellsTotal: number;
  /** Fraction of each cell covered by the figure, averaged. A near-zero value means the framing
   *  is wrong and the far tier would render as an invisible speck. */
  meanCoverage: number;
}

export async function bakeImpostorAtlas(
  cfg: CrowdConfig,
  header: AnimHeader,
  animData: Float32Array,
  sources: TroopSources
): Promise<ImpostorResult> {
  const imp = cfg.impostor;
  const A = imp.angles;
  const F = imp.frames;
  const cell = imp.cell_px;
  const W = A * cell;
  const H = F * cell;

  // Two canvases: the Engine takes one for WebGL, and a separate 2D canvas receives the readback.
  // A canvas can only have one context type, so asking the Engine's canvas for "2d" returns null.
  //
  // The WebGL canvas is exactly one cell, so each shot is framed and scaled for the cell rather than
  // being cropped out of a full-size frame. Reading a cell-sized corner of a full-size frame is what
  // an earlier version did, and it produced an atlas of 64 empty cells because the figure is in the
  // middle of the frame, not the corner.
  const glCanvas = document.createElement("canvas");
  glCanvas.width = cell;
  glCanvas.height = cell;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const bakeEngine = new Engine(glCanvas, false, { preserveDrawingBuffer: true, stencil: false }, false);
  bakeEngine.setSize(cell, cell, true);
  const scene = new Scene(bakeEngine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.autoClear = true;

  // Flat-lit on purpose: an impostor is read as a shape, and a directional Lambert term would
  // bake one lighting direction into the atlas for every unit that ever uses it.
  const mat = new SkinnedMaterial({
    scene, header, data: animData,
    baseTint: [1, 1, 1],
    lightDir: [0, 1, 0],
    fogColor: [0, 0, 0],
    fogRange: [1e9, 2e9],
  });

  const meshes = (["body", "weapon"] as const).map((part) => {
    const mesh = buildSkinnedMesh(scene, sources[part].close, `${part}_impostor`);
    mesh.material = mat;
    mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  });

  const cam = new ArcRotateCamera("impCam", 0, Math.PI / 2, 4, new Vector3(0, 0.9, 0), scene);
  cam.minZ = 0.01;
  cam.maxZ = 100;
  cam.fov = 0.5;

  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const anim = new Float32Array(4);
  const clipIndex = Math.max(0, Object.keys(header.clips).indexOf(imp.clip));

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  const cellPixels = new Uint8ClampedArray(cell * cell * 4);

  let nonEmpty = 0;
  let coverage = 0;
  // Time is pinned to zero and the clip phase carries the frame, so the atlas is reproducible
  // regardless of how long the bake has been running.
  mat.setTime(0);

  for (let f = 0; f < F; f++) {
    const phase = F === 1 ? 0 : f / F;
    anim[0] = clipIndex;
    anim[1] = phase;
    anim[2] = 1;
    anim[3] = 0;
    for (const mesh of meshes) {
      mesh.thinInstanceSetBuffer("matrix", identity, 16, true);
      mesh.thinInstanceSetBuffer("instAnim", anim, 4, true);
    }

    for (let a = 0; a < A; a++) {
      cam.alpha = (a / A) * Math.PI * 2;
      cam.beta = Math.PI / 2;
      cam.radius = 4.2;
      cam.setTarget(new Vector3(0, 0.9, 0));
      scene.render();

      const px = (await bakeEngine.readPixels(0, 0, cell, cell)) as Uint8Array;
      // WebGL readPixels returns rows bottom-up; ImageData is top-down. Without this flip every
      // cell is upside down, which reads as a plausible-but-wrong atlas rather than an error.
      let opaque = 0;
      const stride = cell * 4;
      for (let y = 0; y < cell; y++) {
        const src = (cell - 1 - y) * stride;
        const dst = y * stride;
        for (let i = 0; i < stride; i += 4) {
          cellPixels[dst + i] = px[src + i];
          cellPixels[dst + i + 1] = px[src + i + 1];
          cellPixels[dst + i + 2] = px[src + i + 2];
          cellPixels[dst + i + 3] = px[src + i + 3];
          if (px[src + i + 3] > 8) opaque++;
        }
      }
      if (opaque > 0) nonEmpty++;
      coverage += opaque / (cell * cell);
      ctx.putImageData(new ImageData(cellPixels, cell, cell), a * cell, f * cell);
    }
  }

  const atlas = canvas.toDataURL("image/png");
  bakeEngine.dispose();
  scene.dispose();

  return {
    atlas, width: W, height: H, angles: A, frames: F, cellPx: cell, clip: imp.clip,
    nonEmptyCells: nonEmpty,
    cellsTotal: A * F,
    meanCoverage: coverage / (A * F),
  };
}
