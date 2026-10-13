/**
 * Task 608: distance LOD for loaded models.
 *
 * The pure half of the module is checked without an engine: the ladder is
 * clamped and a step the engine cannot use is rejected. The engine half runs on
 * a NullEngine scene and proves the levels are real — the simplified meshes
 * carry fewer vertices than the model they come from, and the engine's own LOD
 * ladder holds the distances that were asked for. Simplification tasks only run
 * during frames (that is Babylon's queue), so the test pumps `scene.render()`
 * until the applied callback fires.
 */

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOD_LEVELS,
  applyDistanceLod,
  lodSettingsFor,
  type DistanceLodLevel,
} from "../lod.js";

const LEVELS: DistanceLodLevel[] = [
  { quality: 0.5, distance: 40 },
  { quality: 0.25, distance: 120 },
];

const engines: NullEngine[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

function buildScene(): Scene {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const camera = new FreeCamera("cam", new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  return scene;
}

function buildSphere(scene: Scene, segments = 12): Mesh {
  return MeshBuilder.CreateSphere("soldier", { diameter: 2, segments }, scene);
}

/** Babylon runs simplification tasks during frames, one queue step at a time. */
async function pumpUntil(scene: Scene, done: () => boolean, maxFrames = 300): Promise<void> {
  for (let frame = 0; frame < maxFrames && !done(); frame++) {
    scene.render();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe("lodSettingsFor (task 608)", () => {
  it("clamps quality into 0..1 and keeps the distance", () => {
    const settings = lodSettingsFor([
      { quality: 1.4, distance: 40 },
      { quality: -0.5, distance: 120 },
    ]);
    expect(settings.map((s) => s.quality)).toEqual([1, 0]);
    expect(settings.map((s) => s.distance)).toEqual([40, 120]);
  });

  it("comes with a default ladder", () => {
    expect(lodSettingsFor().length).toBe(DEFAULT_LOD_LEVELS.length);
  });

  it("rejects a step with a distance the engine cannot use", () => {
    expect(() => lodSettingsFor([{ quality: 0.5, distance: 0 }])).toThrow(RangeError);
    expect(() => lodSettingsFor([{ quality: 0.5, distance: Number.NaN }])).toThrow(RangeError);
    expect(() => lodSettingsFor([{ quality: 0.5, distance: Number.POSITIVE_INFINITY }])).toThrow(
      RangeError,
    );
  });
});

describe("applyDistanceLod (task 608)", () => {
  it("adds real decimated levels to the engine's LOD ladder", async () => {
    const scene = buildScene();
    const mesh = buildSphere(scene);
    const fullVertices = mesh.getTotalVertices();
    expect(fullVertices).toBeGreaterThan(0);

    let applied = false;
    expect(applyDistanceLod(mesh, LEVELS, { onApplied: () => (applied = true) })).toBe(2);
    await pumpUntil(scene, () => applied);

    expect(applied).toBe(true);
    const levels = mesh.getLODLevels();
    // The engine sorts the ladder itself; assert the distances, not their order.
    const distances = levels
      .map((level) => level.distanceOrScreenCoverage)
      .sort((a, b) => a - b);
    expect(distances).toEqual([40, 120]);
    for (const level of levels) {
      expect(level.mesh).toBeTruthy();
      expect(level.mesh?.getTotalVertices() ?? fullVertices).toBeLessThan(fullVertices);
    }
    scene.dispose();
  });

  it("calls onApplied once, after every level is in place", async () => {
    const scene = buildScene();
    const mesh = buildSphere(scene);
    let calls = 0;
    applyDistanceLod(mesh, LEVELS, { onApplied: () => calls++ });
    await pumpUntil(scene, () => calls > 0);
    // Give the queue a few more frames: a second callback would show up here.
    for (let i = 0; i < 5; i++) {
      scene.render();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(calls).toBe(1);
    scene.dispose();
  });

  it("queues nothing for an empty ladder", async () => {
    const scene = buildScene();
    const mesh = buildSphere(scene);
    expect(applyDistanceLod(mesh, [])).toBe(0);
    for (let i = 0; i < 5; i++) {
      scene.render();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(mesh.getLODLevels()).toEqual([]);
    scene.dispose();
  });
});
