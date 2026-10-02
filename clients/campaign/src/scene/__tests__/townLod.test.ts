/**
 * TownLodController tests (MASTER_PLAN task 149). Fake towns, no Babylon
 * scene needed — only Vector3 math.
 */

import { Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { TownLodController } from "../townLod.js";

function fakeTown(x: number) {
  return {
    position: new Vector3(x, 0, 0),
    mesh: {
      enabled: true,
      writes: 0,
      setEnabled(v: boolean) {
        this.enabled = v;
        this.writes += 1;
      },
    },
  };
}

describe("TownLodController", () => {
  it("pops towns out beyond the range and back in inside it", () => {
    const near = fakeTown(100);
    const far = fakeTown(500);
    const lod = new TownLodController([near, far], 300);
    lod.update(new Vector3(0, 0, 0));
    expect(near.mesh.enabled).toBe(true);
    expect(far.mesh.enabled).toBe(false);
    lod.setRange(600);
    lod.update(new Vector3(0, 0, 0));
    expect(far.mesh.enabled).toBe(true);
  });

  it("only writes setEnabled on state changes", () => {
    const town = fakeTown(100);
    const lod = new TownLodController([town], 300);
    lod.update(new Vector3(0, 0, 0));
    lod.update(new Vector3(10, 0, 0));
    expect(town.mesh.writes).toBe(0);
  });

  it("follows the camera target", () => {
    const town = fakeTown(500);
    const lod = new TownLodController([town], 300);
    lod.update(new Vector3(0, 0, 0));
    expect(town.mesh.enabled).toBe(false);
    lod.update(new Vector3(400, 0, 0));
    expect(town.mesh.enabled).toBe(true);
  });
});
