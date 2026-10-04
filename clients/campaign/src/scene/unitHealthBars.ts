/**
 * Task 36: unit health bars — toggleable floating bars above every soldier.
 *
 * One thin billboarded bar per unit, green fading to red as health drops. The
 * bar reads the soldier's own health over its own max — never a second copy
 * of the number — and hides itself for the dead, because a corpse with a
 * health bar is a lie the ragdoll already tells better. `update()` is called
 * once a frame by the battle loop; `setVisible` toggles the whole layer for
 * the HUD switch.
 */

import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import type { UnitBrain } from "./battleUnit.js";
import type { BattleSoldier } from "./BattleSoldier.js";

const BAR_WIDTH = 1.1;
const BAR_HEIGHT = 0.12;
const BAR_Y = 2.15;

interface BarEntry {
  brain: UnitBrain;
  soldier: BattleSoldier;
  mesh: Mesh;
  material: StandardMaterial;
}

export class UnitHealthBars {
  private readonly entries: BarEntry[] = [];
  private visible = true;
  private disposed = false;

  /**
   * Brains and soldiers pair by index — the same pairing `BattleLoop` builds.
   */
  constructor(
    scene: Scene,
    brains: UnitBrain[],
    soldiers: BattleSoldier[],
  ) {
    const count = Math.min(brains.length, soldiers.length);
    for (let i = 0; i < count; i++) {
      const brain = brains[i];
      const soldier = soldiers[i];
      if (!brain || !soldier) continue;
      const mesh = MeshBuilder.CreatePlane(`unitHpBar_${i}`, {
        width: BAR_WIDTH,
        height: BAR_HEIGHT,
      }, scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      const material = new StandardMaterial(`unitHpBarMat_${i}`, scene);
      material.emissiveColor = new Color3(0.2, 0.85, 0.35);
      material.disableLighting = true;
      mesh.material = material;
      this.entries.push({ brain, soldier, mesh, material });
    }
    this.applyVisibility();
  }

  /** Show or hide the whole health-bar layer. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.applyVisibility();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Refresh every bar from its soldier. Call once per frame. */
  update(): void {
    if (this.disposed || !this.visible) return;
    for (const entry of this.entries) {
      const { brain, soldier, mesh, material } = entry;
      if (!brain.alive) {
        mesh.setEnabled(false);
        continue;
      }
      mesh.setEnabled(true);
      const max = soldier.maxHealth;
      const fraction = max > 0 ? Math.max(0, Math.min(1, soldier.health / max)) : 0;
      const pos = brain.position;
      mesh.position.set(pos.x, pos.y + BAR_Y, pos.z);
      mesh.scaling.x = Math.max(0.001, fraction);
      // The bar shrinks toward its centre; shift it so the left edge stays
      // put and the bar drains right-to-left like every health bar the
      // player has ever seen.
      mesh.position.x -= (BAR_WIDTH * (1 - fraction)) / 2;
      material.emissiveColor.set(fraction * 0.9, 0.15 + fraction * 0.7, 0.2);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries) {
      entry.mesh.dispose();
      entry.material.dispose();
    }
    this.entries.length = 0;
  }

  private applyVisibility(): void {
    for (const entry of this.entries) entry.mesh.setEnabled(this.visible);
  }
}
