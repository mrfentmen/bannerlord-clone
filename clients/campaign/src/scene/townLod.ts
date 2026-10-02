/**
 * Town LOD controller (MASTER_PLAN task 149): distant towns pop in/out at
 * the view-distance range.
 *
 * Each town's 3D cluster mesh is enabled only while the camera target is
 * within the set range; the map pin marker is untouched, so settlements
 * stay findable at campaign zoom. State changes are the only writes —
 * setEnabled is never called redundantly.
 */

import { Vector3 } from "@babylonjs/core";

export interface LodTown {
  position: Vector3;
  mesh: { setEnabled(enabled: boolean): void };
}

export class TownLodController {
  private readonly states = new Map<LodTown, boolean>();
  private range: number;

  constructor(towns: LodTown[], initialRange: number) {
    this.range = initialRange;
    for (const town of towns) this.states.set(town, true);
  }

  /** Update the pop in/out range (the view-distance slider value). */
  setRange(range: number): void {
    this.range = Math.max(0, range);
  }

  getRange(): number {
    return this.range;
  }

  /**
   * Re-evaluate every town against the camera target. Call once per frame
   * (or whenever the camera moves); only changed towns are written.
   */
  update(target: Vector3): void {
    for (const [town, wasVisible] of this.states) {
      const visible = Vector3.Distance(target, town.position) <= this.range;
      if (visible !== wasVisible) {
        town.mesh.setEnabled(visible);
        this.states.set(town, visible);
      }
    }
  }
}
