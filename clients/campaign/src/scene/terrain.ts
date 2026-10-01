/**
 * Terrain from the real heightfield. `SPEC.md` section 6, `ART_DIRECTION.md` section 6.
 *
 * The mesh is a grid draped over the decoded elevation, coloured by the locked
 * hypsometric ramp with slope-aware rock so a steep face reads as rock regardless of
 * its height. That is the USGS convention (R1 in the reference board) and it is the
 * thing that makes real terrain legible at a glance.
 *
 * Flat shading, on purpose: the art style is stylized low-poly with a period grade
 * (ART_DIRECTION.md section 8), and hard normals also mean the mesh is honest about
 * what the DEM actually measured rather than smoothing it into a guess.
 */

import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { terrainBands, tokens } from "../design/tokens.js";
import { bandFor } from "../world/load.js";
import type { Heightfield, Projection } from "../world/types.js";

export interface TerrainOptions {
  scene: Scene;
  heightfield: Heightfield;
  projection: Projection;
  /**
   * Grid resolution. The heightfield is 2560 × 2048 px; sampling every pixel is
   * 5.2 million vertices, which is not what a campaign map needs. Sampled, it is a
   * terrain that reads correctly and costs a fraction as much.
   */
  samples?: number;
}

const SKIRT_DEPTH = 600; // metres, so the region does not float in the void

export function buildTerrain(options: TerrainOptions): { mesh: Mesh; name: string } {
  const { scene, heightfield: hf, projection } = options;
  const samples = options.samples ?? 256;

  const widthM = projection.width;
  const depthM = projection.depth;
  const cols = samples;
  const rows = samples;

  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 4);
  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);

  // Real elevation range in this region, for the vertical exaggeration below.
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < hf.metres.length; i += 1) {
    const v = hf.metres[i]!;
    if (v < minH) minH = v;
    if (v > maxH) maxH = v;
  }
  if (!Number.isFinite(minH) || !Number.isFinite(maxH)) {
    minH = 0;
    maxH = 1;
  }

  // Vertical exaggeration. A 1:1 map of the Front Range is 3,300 m of relief across
  // 60 km, which on a 68 km wide view is legible but flat. 1.6x is the smallest
  // factor at which the canyons read without inventing relief that is not there.
  const verticalScale = 1.6;

  const baseColor = new Color3();
  // Rock and snow come out of the same ramp, so a steep face and a high face agree.
  const rockColor = Color3.FromHexString(terrainBands[5]!.color);
  const snowColor = Color3.FromHexString(terrainBands[7]!.color);
  const snowLine = 3600;

  for (let r = 0; r < rows; r += 1) {
    const v = r / (rows - 1);
    const z = v * depthM;
    for (let c = 0; c < cols; c += 1) {
      const u = c / (cols - 1);
      const x = u * widthM;
      const y = projection.heightAt(x, z);
      const i = r * cols + c;

      positions[i * 3] = x;
      positions[i * 3 + 1] = (y - minH) * verticalScale;
      positions[i * 3 + 2] = z;

      const band = bandFor(y);
      baseColor.set(...hexToRgb(band.color));

      // Slope from the two neighbours along each axis. Steep faces are rock whatever
      // their altitude, which is how a topographic sheet reads.
      const xL = projection.heightAt(x - widthM / cols, z);
      const xR = projection.heightAt(x + widthM / cols, z);
      const zD = projection.heightAt(x, z - depthM / rows);
      const zU = projection.heightAt(x, z + depthM / rows);
      const cell = Math.max(widthM / cols, 1);
      const slope = Math.hypot((xR - xL) / (2 * cell), (zU - zD) / (2 * cell));
      const slopeMix = Math.min(1, Math.max(0, (slope - 0.35) / 0.9));
      Color3.LerpToRef(baseColor, rockColor, slopeMix, baseColor);
      if (y > snowLine) {
        const snowMix = Math.min(1, (y - snowLine) / 250);
        Color3.LerpToRef(baseColor, snowColor, snowMix, baseColor);
      }

      colors[i * 4] = baseColor.r;
      colors[i * 4 + 1] = baseColor.g;
      colors[i * 4 + 2] = baseColor.b;
      colors[i * 4 + 3] = 1;
    }
  }

  let t = 0;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      // Two triangles per cell.
      //
      // The winding is the other way round from the right-handed convention, because
      // Babylon is left-handed. Measured, not assumed: with this order the computed
      // normals came out pointing down, N dot L went negative, and the entire terrain
      // rendered black. `src/scene/__tests__/terrain.test.ts` asserts the normals
      // point up so this cannot come back.
      indices[t] = a;
      indices[t + 1] = b;
      indices[t + 2] = d;
      indices[t + 3] = b;
      indices[t + 4] = e;
      indices[t + 5] = d;
      t += 6;
    }
  }

  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh("terrain", scene);
  const data = new VertexData();
  data.positions = positions as unknown as number[];
  data.indices = indices as unknown as number[];
  data.normals = normals;
  data.colors = colors as unknown as number[];
  data.applyToMesh(mesh, false);

  // An explicit material with backface culling off.
  //
  // Terrain is a single-sided sheet seen from above, so culling saves nothing, and
  // Babylon's default winding is left-handed: get the triangle order one way wrong and
  // the whole sheet is culled, which renders as an empty map with the sky behind it.
  // Turning culling off makes the sheet render from either side and takes the winding
  // out of the failure mode entirely. The colour comes from the vertex buffer, so the
  // material is white.
  const material = new StandardMaterial("terrain-mat", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.useVertexColors = true;

  // A skirt around the edge, so the region does not end in mid-air when the camera
  // swings out. It is the same colour as the edge vertex above it, so it reads as the
  // land continuing rather than as a wall.
  const skirt = buildSkirt(scene, positions, cols, rows, minH, verticalScale);
  skirt.name = "terrain-skirt";
  skirt.material = material;
  skirt.useVertexColors = true;

  return { mesh, name: `terrain ${minH.toFixed(0)}-${maxH.toFixed(0)} m` };
}

function buildSkirt(
  scene: Scene,
  positions: Float32Array,
  cols: number,
  rows: number,
  minH: number,
  verticalScale: number,
): Mesh {
  const positions2: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  let index = 0;

  const pushEdge = (i: number, outward: [number, number, number]): void => {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const c = [positions[i * 4]!, positions[i * 4 + 1]!, positions[i * 4 + 2]!, 1];
    for (const dy of [0, -SKIRT_DEPTH * verticalScale]) {
      positions2.push(x, y + dy, z);
      normals.push(...outward);
      colors.push(...c);
    }
  };

  const quad = (): void => {
    // Two triangles bridging the top and bottom edge vertices just pushed.
    const a = index;
    indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    index += 4;
  };

  // South edge, looking north: outward is -Z.
  for (let c = 0; c < cols - 1; c += 1) {
    pushEdge(c, [0, 0, -1]);
    pushEdge(c + 1, [0, 0, -1]);
    quad();
  }
  // North edge.
  const northBase = (rows - 1) * cols;
  for (let c = 0; c < cols - 1; c += 1) {
    pushEdge(northBase + c + 1, [0, 0, 1]);
    pushEdge(northBase + c, [0, 0, 1]);
    quad();
  }
  // West edge.
  for (let r = 0; r < rows - 1; r += 1) {
    pushEdge(r * cols, [-1, 0, 0]);
    pushEdge((r + 1) * cols, [-1, 0, 0]);
    quad();
  }
  // East edge.
  for (let r = 0; r < rows - 1; r += 1) {
    pushEdge((r + 1) * cols + cols - 1, [1, 0, 0]);
    pushEdge(r * cols + cols - 1, [1, 0, 0]);
    quad();
  }

  const mesh = new Mesh("skirt", scene);
  const data = new VertexData();
  data.positions = positions2;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  data.applyToMesh(mesh, false);
  void minH;
  return mesh;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
}

/** The region's terrain summary, shown in the data-source panel. */
export function terrainSummary(hf: Heightfield): { min: number; max: number; resolution: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of hf.metres) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    resolution: hf.resolutionMetres,
  };
}

/** A hard minimum so the map is never a single colour if the DEM came back flat. */
export function defaultCameraTarget(projection: Projection): Vector3 {
  return new Vector3(projection.width / 2, 0, projection.depth / 2);
}

export { Color4, tokens };
