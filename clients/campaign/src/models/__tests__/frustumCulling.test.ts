/**
 * Task 609: a model behind the camera is not drawn.
 *
 * The test is the dot product against the camera's forward axis, which has to
 * survive the awkward cases: a model straddling the camera plane (kept, via a
 * world-space margin), a camera whose forward vector is not normalised (same
 * band either way), a zero forward vector or a NaN position (kept -- an
 * unclassifiable object must not blink out on one bad frame).
 *
 * The culler is also held to the write discipline a scene needs: the callback
 * fires on the edge, not on every frame.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CameraCuller,
  DEFAULT_BACK_MARGIN_M,
  DEFAULT_FAR_CULL_HYSTERESIS_M,
  DEFAULT_FAR_CULL_M,
  distanceBetween,
  dot,
  isBehindCamera,
  isBeyondFarCull,
  lengthOf,
  type CameraPose,
  type Cullable,
} from "../FrustumCulling.js";

/** Looking down -Z from the origin, the Babylon/three.js default. */
const CAMERA: CameraPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };

describe("vector helpers (task 609)", () => {
  it("computes length and dot without normalising", () => {
    expect(lengthOf({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(lengthOf({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: -1, z: 0 })).toBe(2);
  });
});

describe("isBehindCamera (task 609)", () => {
  it("culls a model behind the camera and keeps one in front", () => {
    expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: 10 })).toBe(true);
    expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: -10 })).toBe(false);
    expect(isBehindCamera(CAMERA, { x: 5, y: 0, z: -10 })).toBe(false);
  });

  it("culls the whole range beyond the margin, not only just behind the plane", () => {
    for (const z of [10, 100, 1000]) {
      expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: z })).toBe(true);
    }
  });

  it("keeps a model straddling the plane until it is clear of the margin", () => {
    const straddling = { x: 0, y: 0, z: -DEFAULT_BACK_MARGIN_M / 2 };
    const onTheBand = { x: 0, y: 0, z: DEFAULT_BACK_MARGIN_M };
    const clearOfIt = { x: 0, y: 0, z: DEFAULT_BACK_MARGIN_M + 0.01 };
    expect(isBehindCamera(CAMERA, straddling)).toBe(false);
    // The band edge is exclusive: exactly on it the model is still straddling.
    expect(isBehindCamera(CAMERA, onTheBand)).toBe(false);
    expect(isBehindCamera(CAMERA, clearOfIt)).toBe(true);
  });

  it("gives the same band for an unnormalised forward vector", () => {
    const scaled: CameraPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -7 } };
    expect(isBehindCamera(scaled, { x: 0, y: 0, z: DEFAULT_BACK_MARGIN_M + 0.01 })).toBe(true);
    expect(isBehindCamera(scaled, { x: 0, y: 0, z: -DEFAULT_BACK_MARGIN_M })).toBe(false);
  });

  it("follows the camera when it turns around", () => {
    const target = { x: 0, y: 0, z: -10 };
    expect(isBehindCamera(CAMERA, target)).toBe(false);
    const turned: CameraPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 1 } };
    expect(isBehindCamera(turned, target)).toBe(true);
  });

  it("offsets by the camera position, not the world origin", () => {
    const moved: CameraPose = { position: { x: 0, y: 0, z: 50 }, forward: { x: 0, y: 0, z: -1 } };
    expect(isBehindCamera(moved, { x: 0, y: 0, z: 60 })).toBe(true);
    expect(isBehindCamera(moved, { x: 0, y: 0, z: 40 })).toBe(false);
  });

  it("keeps the object when the camera or the model cannot be classified", () => {
    expect(isBehindCamera({ position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: 0 } }, { x: 0, y: 0, z: 10 })).toBe(false);
    expect(isBehindCamera(CAMERA, { x: Number.NaN, y: 0, z: 10 })).toBe(false);
    expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("honours a per-call margin of zero, culling any point behind the plane", () => {
    expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: 0.01 }, 0)).toBe(true);
    expect(isBehindCamera(CAMERA, { x: 0, y: 0, z: -0.01 }, 0)).toBe(false);
  });
});

describe("CameraCuller (task 609)", () => {
  const makeTarget = (id: string, position: { x: number; y: number; z: number }): Cullable & {
    calls: number[];
  } => {
    const calls: number[] = [];
    return { id, position, calls, onVisibleChange: (v) => calls.push(v ? 1 : 0) };
  };

  it("writes visibility once and then only on a change", () => {
    const culler = new CameraCuller(CAMERA);
    const inFront = makeTarget("a", { x: 0, y: 0, z: -10 });
    const behind = makeTarget("b", { x: 0, y: 0, z: 10 });

    culler.updateAll([inFront, behind]);
    expect(inFront.calls).toEqual([1]);
    expect(behind.calls).toEqual([0]);

    culler.updateAll([inFront, behind]);
    expect(inFront.calls).toEqual([1]);
    expect(behind.calls).toEqual([0]);

    inFront.position = { x: 0, y: 0, z: 20 };
    culler.update(inFront);
    expect(inFront.calls).toEqual([1, 0]);
    expect(culler.isVisible("a")).toBe(false);
  });

  it("reports the reason a model was culled", () => {
    const culler = new CameraCuller(CAMERA);
    const behind = makeTarget("b", { x: 0, y: 0, z: 10 });
    const inFront = makeTarget("f", { x: 0, y: 0, z: -10 });
    expect(culler.updateAll([behind, inFront])).toEqual([
      { id: "b", visible: false, reason: "behind-camera" },
      { id: "f", visible: true, reason: null },
    ]);
  });

  it("applies a per-object margin over the culler's own", () => {
    const culler = new CameraCuller(CAMERA, 0);
    const wide = makeTarget("building", { x: 0, y: 0, z: 5 });
    wide.backMarginM = 50;
    expect(culler.update(wide).visible).toBe(true);
    wide.position = { x: 0, y: 0, z: 80 };
    expect(culler.update(wide).visible).toBe(false);
  });

  it("forgets an object so a respawned model is written again", () => {
    const culler = new CameraCuller(CAMERA);
    const t = makeTarget("a", { x: 0, y: 0, z: -10 });
    culler.update(t);
    culler.forget("a");
    culler.update(t);
    expect(t.calls).toEqual([1, 1]);
  });

  it("survives a target with no callback", () => {
    const culler = new CameraCuller(CAMERA);
    expect(culler.update({ id: "bare", position: { x: 0, y: 0, z: 10 } })).toEqual({
      id: "bare",
      visible: false,
      reason: "behind-camera",
    });
  });

  it("only writes a spawner-side change through its own seam", () => {
    const onVisibleChange = vi.fn();
    const culler = new CameraCuller(CAMERA);
    culler.update({ id: "hook", position: { x: 0, y: 0, z: -1 }, onVisibleChange });
    culler.update({ id: "hook", position: { x: 0, y: 0, z: -1 }, onVisibleChange });
    expect(onVisibleChange).toHaveBeenCalledTimes(1);
    expect(onVisibleChange).toHaveBeenCalledWith(true);
  });
});
describe("isBeyondFarCull (task 610)", () => {
  it("culls past 500 m and keeps a model inside it", () => {
    expect(DEFAULT_FAR_CULL_M).toBe(500);
    expect(isBeyondFarCull(400)).toBe(false);
    expect(isBeyondFarCull(600)).toBe(true);
  });

  it("needs the hysteresis band to drop a drawn model", () => {
    expect(isBeyondFarCull(500)).toBe(false);
    expect(isBeyondFarCull(DEFAULT_FAR_CULL_M + DEFAULT_FAR_CULL_HYSTERESIS_M)).toBe(false);
    expect(isBeyondFarCull(DEFAULT_FAR_CULL_M + DEFAULT_FAR_CULL_HYSTERESIS_M + 0.1)).toBe(true);
  });

  it("brings a culled model back only once it is inside the band", () => {
    expect(isBeyondFarCull(495, DEFAULT_FAR_CULL_M, DEFAULT_FAR_CULL_HYSTERESIS_M, false)).toBe(true);
    expect(isBeyondFarCull(480, DEFAULT_FAR_CULL_M, DEFAULT_FAR_CULL_HYSTERESIS_M, false)).toBe(false);
  });

  it("honours a custom limit and rejects a broken one", () => {
    expect(isBeyondFarCull(120, 100)).toBe(true);
    expect(isBeyondFarCull(120, 0)).toBe(false); // falls back to the 500 m default
    expect(isBeyondFarCull(120, Number.NaN)).toBe(false);
  });

  it("draws a model whose distance cannot be measured", () => {
    expect(isBeyondFarCull(Number.NaN)).toBe(false);
    expect(isBeyondFarCull(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("CameraCuller far field (task 610)", () => {
  /** Camera at the origin looking down -Z, so -Z is in front and +Z is behind. */
  const pose: CameraPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };

  function tracked(id: string, position: { x: number; y: number; z: number }) {
    const calls: boolean[] = [];
    const target: Cullable = { id, position, onVisibleChange: (v) => calls.push(v) };
    return { target, calls };
  }

  it("measures the distance in three dimensions, not just along the view axis", () => {
    expect(distanceBetween({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
    expect(Number.isNaN(distanceBetween({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0, z: 0 }))).toBe(true);
  });

  it("culls a model past 500 m and reports it as too-far", () => {
    const culler = new CameraCuller(pose);
    const { target, calls } = tracked("far", { x: 0, y: 0, z: -600 });
    expect(culler.update(target)).toEqual({ id: "far", visible: false, reason: "too-far" });
    expect(calls).toEqual([false]);
  });

  it("does not blink a model that straddles the limit", () => {
    const culler = new CameraCuller(pose);
    // Start well inside, as a model the camera is closing on would be.
    const { target, calls } = tracked("edge", { x: 0, y: 0, z: -450 });
    culler.update(target);
    expect(calls).toEqual([true]);
    // A hair past the limit, still inside the band: kept drawn, no new write.
    target.position = { x: 0, y: 0, z: -(DEFAULT_FAR_CULL_M + 1) };
    expect(culler.update(target).visible).toBe(true);
    expect(calls).toEqual([true]);
    // Well past the band: dropped.
    target.position = { x: 0, y: 0, z: -(DEFAULT_FAR_CULL_M + DEFAULT_FAR_CULL_HYSTERESIS_M + 1) };
    expect(culler.update(target).visible).toBe(false);
    // Back near the limit: the band keeps it hidden for a moment.
    target.position = { x: 0, y: 0, z: -(DEFAULT_FAR_CULL_M + 1) };
    expect(culler.update(target).visible).toBe(false);
    // Inside the band: drawn again, so exactly two writes happened.
    target.position = { x: 0, y: 0, z: -(DEFAULT_FAR_CULL_M - 30) };
    culler.update(target);
    expect(calls).toEqual([true, false, true]);
  });

  it("moves the limit from the draw-distance slider", () => {
    const culler = new CameraCuller(pose);
    expect(culler.getFarCullM()).toBe(DEFAULT_FAR_CULL_M);
    culler.setFarCullM(120);
    expect(culler.getFarCullM()).toBe(120);
    const { target } = tracked("a", { x: 0, y: 0, z: -200 });
    expect(culler.update(target).visible).toBe(false);
    culler.setFarCullM(Number.NaN); // rejected: a broken slider value is ignored
    expect(culler.getFarCullM()).toBe(120);
  });

  it("lets a landmark model reach further than the default", () => {
    const culler = new CameraCuller(pose);
    const { target } = tracked("landmark", { x: 0, y: 0, z: -900 });
    target.farCullM = 1200;
    expect(culler.update(target).visible).toBe(true);
  });

  it("prefers the behind-camera reason when a model is both behind and far", () => {
    const culler = new CameraCuller(pose);
    const { target } = tracked("both", { x: 0, y: 0, z: 900 });
    expect(culler.update(target).reason).toBe("behind-camera");
  });

  it("keeps a fresh spawn hidden until it is inside the band", () => {
    const culler = new CameraCuller(pose);
    // The culler has never written this object, so it must not pop in at the
    // limit: 510 m is outside the band and stays hidden.
    const { target, calls } = tracked("new", { x: 0, y: 0, z: -510 });
    expect(culler.update(target).visible).toBe(false);
    expect(calls).toEqual([false]);
    target.position = { x: 0, y: 0, z: -400 };
    culler.update(target);
    expect(calls).toEqual([false, true]);
  });
});
