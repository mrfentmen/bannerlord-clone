/**
 * Task 611: repeated props are drawn as thin instances -- one buffer, one draw
 * call -- instead of one clone each.
 *
 * The buffer arithmetic is checked directly (16 floats per placement, column
 * major, translation in the right slots, yaw applied) and then applied to a
 * real Babylon mesh on a NullEngine, which is what proves the wire-up to
 * `thinInstanceSetBuffer` rather than just the maths. The fallback path is
 * forced on to prove it exists, and a runaway placement count is capped and
 * reported instead of stalling the frame.
 */

import { describe, expect, it, vi } from "vitest";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  MATRIX_FLOATS,
  PropInstancer,
  buildInstanceMatrices,
  countUnusablePlacements,
  instanceProp,
  type Placement,
} from "../Instancing.js";

/** A NullEngine scene; no GPU, real meshes and real vertex buffers. */
function sceneWithBox(name = "crate"): { scene: Scene; mesh: Mesh } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene);
  // The template stays undrawn; only its placements render.
  mesh.setEnabled(false);
  return { scene, mesh };
}

describe("buildInstanceMatrices (task 611)", () => {
  it("writes 16 floats per placement", () => {
    const buffer = buildInstanceMatrices([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    expect(buffer.length).toBe(3 * MATRIX_FLOATS);
  });

  it("puts the translation in Babylon's column-major slots", () => {
    const buffer = buildInstanceMatrices([{ x: 3, y: 4, z: 5 }]);
    // Babylon stores translation in elements 12, 13, 14.
    expect(buffer[12]).toBeCloseTo(3);
    expect(buffer[13]).toBeCloseTo(4);
    expect(buffer[14]).toBeCloseTo(5);
    expect(buffer[15]).toBeCloseTo(1);
  });

  it("leaves the identity for an unrotated, unscaled placement", () => {
    const buffer = buildInstanceMatrices([{ x: 0, y: 0, z: 0 }]);
    expect([...buffer.slice(0, 16)]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("applies yaw so a row of props can face along the line", () => {
    const turned = buildInstanceMatrices([{ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }]);
    const straight = buildInstanceMatrices([{ x: 0, y: 0, z: 0 }]);
    expect([...turned]).not.toEqual([...straight]);
    // A quarter turn maps the +X axis onto -Z, i.e. element 2 becomes -1.
    expect(turned[2]).toBeCloseTo(-1);
  });

  it("applies a uniform scale and rejects a broken one", () => {
    const scaled = buildInstanceMatrices([{ x: 0, y: 0, z: 0, scale: 2 }]);
    expect(scaled[0]).toBeCloseTo(2);
    const broken = buildInstanceMatrices([
      { x: 0, y: 0, z: 0, scale: 0 },
      { x: 0, y: 0, z: 0, scale: -3 },
      { x: 0, y: 0, z: 0, scale: Number.NaN },
    ]);
    expect([...broken.slice(0, 4)]).toEqual([1, 0, 0, 0]);
  });

  it("skips an unusable placement rather than poisoning the buffer with NaN", () => {
    const placements: Placement[] = [
      { x: 0, y: 0, z: 0 },
      { x: Number.NaN, y: 1, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const buffer = buildInstanceMatrices(placements);
    expect(buffer.length).toBe(2 * MATRIX_FLOATS);
    expect([...buffer].some((n) => Number.isNaN(n))).toBe(false);
    expect(countUnusablePlacements(placements)).toBe(1);
  });

  it("returns an empty buffer for no placements", () => {
    expect(buildInstanceMatrices([]).length).toBe(0);
  });
});

describe("PropInstancer on a real mesh (task 611)", () => {
  it("puts every placement in one thin-instance buffer", () => {
    const { scene, mesh } = sceneWithBox();
    const placements = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, z: 0 }));
    const report = instanceProp(mesh, placements);

    expect(report).toEqual({ strategy: 'thin', drawn: 40, dropped: 0, unusable: 0 });
    expect(mesh.thinInstanceCount).toBe(40);
    // One shared geometry for 40 props: the point of the task.
    expect(mesh.getTotalVertices()).toBe(MeshBuilder.CreateBox('probe', { size: 1 }, scene).getTotalVertices());
    scene.dispose();
  });

  it("replaces the previous batch instead of adding to it", () => {
    const { scene, mesh } = sceneWithBox();
    const instancer = new PropInstancer();
    instancer.apply(mesh, Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, z: 0 })));
    const report = instancer.apply(mesh, [{ x: 0, y: 0, z: 0 }]);
    expect(report.drawn).toBe(1);
    expect(mesh.thinInstanceCount).toBe(1);
    scene.dispose();
  });

  it("scales the bounding info so a row of crates is not culled at its centre", () => {
    const { scene, mesh } = sceneWithBox();
    mesh.thinInstanceSetBuffer?.('matrix', buildInstanceMatrices([{ x: 0, y: 0, z: 0 }]), 16, false);
    const before = mesh.getBoundingInfo().boundingBox.extendSize.x;
    instanceProp(mesh, [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }]);
    const after = mesh.getBoundingInfo().boundingBox.extendSize.x;
    expect(after).toBeGreaterThan(before);
    scene.dispose();
  });
});

describe("PropInstancer fallbacks (task 611)", () => {
  it("falls back to per-instance clones when thin instancing is unavailable", () => {
    const { scene, mesh } = sceneWithBox();
    const report = instanceProp(mesh, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], {
      forceInstanceFallback: true,
    });
    expect(report.strategy).toBe('clone-fallback');
    expect(report.drawn).toBe(2);
    expect(mesh.instances.length).toBe(2);
    scene.dispose();
  });

  it("reports nothing drawn for a mesh that can do neither", () => {
    const bare = { name: 'stub' };
    const report = new PropInstancer().apply(bare, [{ x: 0, y: 0, z: 0 }]);
    expect(report).toEqual({ strategy: 'none', drawn: 0, dropped: 1, unusable: 0 });
  });

  it("caps a runaway placement count and reports the overflow once", () => {
    const { scene, mesh } = sceneWithBox();
    const onOverflow = vi.fn();
    const report = instanceProp(
      mesh,
      Array.from({ length: 25 }, (_, i) => ({ x: i, y: 0, z: 0 })),
      { maxPlacements: 20, onOverflow },
    );
    expect(report).toEqual({ strategy: 'thin', drawn: 20, dropped: 5, unusable: 0 });
    expect(onOverflow).toHaveBeenCalledWith(5, 20);
    scene.dispose();
  });

  it("counts a bad placement as unusable, not as an overflow", () => {
    const { scene, mesh } = sceneWithBox();
    const report = instanceProp(mesh, [
      { x: 0, y: 0, z: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
    ]);
    expect(report.unusable).toBe(1);
    expect(report.drawn).toBe(1);
    expect(report.dropped).toBe(0);
    scene.dispose();
  });

  it("remembers the strategy it last used", () => {
    const { scene, mesh } = sceneWithBox();
    const instancer = new PropInstancer();
    expect(instancer.lastStrategy()).toBe('none');
    instancer.apply(mesh, [{ x: 0, y: 0, z: 0 }]);
    expect(instancer.lastStrategy()).toBe('thin');
    expect(instancer.lastDrawnCount()).toBe(1);
    scene.dispose();
  });
});