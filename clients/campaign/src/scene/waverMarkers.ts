/**
 * Task 351: waver warning — a floating "!" over soldiers whose nerve is going.
 *
 * Yellow for wavering (morale under 25% but still fighting), red for routing.
 * The marker reads the brain's own morale each frame, so it appears and
 * clears exactly when the brain's state does — never a frame early, never a
 * frame late. One billboarded marker per brain, shared yellow/red materials.
 */

import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import { battleSide, subtitle } from "../design/tokens.js";
import type { UnitBrain } from "./battleUnit.js";

const MARKER_Y = 2.6;
const MARKER_SIZE = 0.55;

function markerMaterial(scene: Scene, name: string, color: string): StandardMaterial {
  const texture = new DynamicTexture(name, { width: 64, height: 64 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D | null;
  if (ctx) {
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = 8;
    ctx.strokeText("!", 32, 34);
    ctx.fillStyle = color;
    ctx.fillText("!", 32, 34);
    texture.update();
  }
  texture.hasAlpha = true;
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  return material;
}

export class WaverMarkers {
  private readonly meshes: Mesh[] = [];
  private readonly warnMaterial: StandardMaterial;
  private readonly routMaterial: StandardMaterial;
  private disposed = false;

  constructor(
    scene: Scene,
    private readonly brains: UnitBrain[],
  ) {
    this.warnMaterial = markerMaterial(scene, "waverWarn", subtitle.speaker);
    this.routMaterial = markerMaterial(scene, "waverRout", battleSide.enemy);
    brains.forEach((brain, i) => {
      const mesh = MeshBuilder.CreatePlane(`waver_${i}`, {
        width: MARKER_SIZE,
        height: MARKER_SIZE,
      }, scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.meshes.push(mesh);
      void brain;
    });
  }

  /** Refresh markers from brain morale. Call once per frame. */
  update(): void {
    if (this.disposed) return;
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const mesh = this.meshes[i];
      if (!brain || !mesh) continue;
      if (!brain.alive) {
        mesh.setEnabled(false);
        continue;
      }
      const pos = brain.position;
      if (brain.isRouting) {
        mesh.material = this.routMaterial;
        mesh.position.set(pos.x, pos.y + MARKER_Y, pos.z);
        mesh.setEnabled(true);
      } else if (brain.isWavering) {
        mesh.material = this.warnMaterial;
        mesh.position.set(pos.x, pos.y + MARKER_Y, pos.z);
        mesh.setEnabled(true);
      } else {
        mesh.setEnabled(false);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    this.warnMaterial.dispose();
    this.routMaterial.dispose();
  }
}
