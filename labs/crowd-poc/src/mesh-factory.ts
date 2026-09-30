/**
 * Builds a Babylon mesh from one of this repo's processed GLBs.
 *
 * Shared by the crowd scene and the impostor bake so both produce byte-identical geometry, which
 * matters because the far tier is supposed to be the same troop at a lower detail.
 *
 * The `joints` and `weights` streams are the same four-float vertex layout the glTF spec uses for
 * skinning, uploaded under those names so the skinning shader finds them by name.
 */

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import type { ProcessedMesh } from "./glb";

export function buildSkinnedMesh(scene: Scene, src: ProcessedMesh, name: string): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = src.position as unknown as number[];
  vd.normals = src.normal as unknown as number[];
  vd.indices = src.indices as unknown as number[];
  vd.applyToMesh(mesh, false);
  const geometry = (mesh as unknown as { geometry: { setVerticesData(k: string, d: ArrayBufferView | number[], upd: boolean, stride: number): void } }).geometry;
  geometry.setVerticesData("joints", src.joints, false, 4);
  geometry.setVerticesData("weights", src.weights, false, 4);
  mesh.isPickable = false;
  return mesh;
}
