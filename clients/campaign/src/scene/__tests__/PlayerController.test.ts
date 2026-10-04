/**
 * PlayerController pure-logic tests.
 *
 * `computeWishDir`, `headBob`, and `slopeWalkable` carry no Babylon scene
 * state, so they are tested directly. The `PlayerController` class itself
 * needs a real Scene and is verified in the browser.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import {
  computeWishDir,
  headBob,
  slopeWalkable,
  type HeldState,
} from "../PlayerController.js";

const idle: HeldState = {
  forward: false, back: false, left: false, right: false, sprint: false, crouch: false,
};

describe("computeWishDir", () => {
  it("returns zero when no keys are held", () => {
    expect(computeWishDir(idle, 0).lengthSquared()).toBe(0);
  });

  it("faces -Z at yaw 0 (Babylon convention)", () => {
    const d = computeWishDir({ ...idle, forward: true }, 0);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.z).toBeCloseTo(-1, 5);
  });

  it("strafes right perpendicular to facing", () => {
    const d = computeWishDir({ ...idle, right: true }, 0);
    expect(d.x).toBeCloseTo(1, 5);
    expect(d.z).toBeCloseTo(0, 5);
  });

  it("normalises diagonals", () => {
    const d = computeWishDir({ ...idle, forward: true, right: true }, 0);
    expect(d.length()).toBeCloseTo(1, 5);
  });

  it("opposing keys cancel", () => {
    const d = computeWishDir({ ...idle, forward: true, back: true }, 0);
    expect(d.lengthSquared()).toBe(0);
  });

  it("rotates with yaw: facing +X at yaw -PI/2", () => {
    const d = computeWishDir({ ...idle, forward: true }, -Math.PI / 2);
    expect(d.x).toBeCloseTo(1, 5);
    expect(d.z).toBeCloseTo(0, 5);
  });
});

describe("headBob", () => {
  it("is zero at time zero", () => {
    const b = headBob(0, false);
    // x = cos(0)*amp, y = sin(0)*amp
    expect(b.x).toBeCloseTo(0.009, 5);
    expect(b.y).toBeCloseTo(0, 5);
  });

  it("scales amplitude when sprinting", () => {
    const walk = headBob(Math.PI / 2, false);
    const sprint = headBob(Math.PI / 2, true);
    // At t=PI/2: y = sin(PI/2)*ampY = ampY
    expect(walk.y).toBeCloseTo(0.016, 5);
    expect(sprint.y).toBeCloseTo(0.032, 5);
    expect(Math.abs(sprint.y)).toBeGreaterThan(Math.abs(walk.y));
  });

  it("oscillates: vertical completes a full cycle over 2*PI", () => {
    const a = headBob(0.3, false);
    const b = headBob(0.3 + Math.PI * 2, false);
    expect(a.y).toBeCloseTo(b.y, 5);
  });
});

describe("slopeWalkable", () => {
  const flat = () => 100;
  const gentle = (x: number) => 100 + x * 0.3; // ~17 degrees
  const cliff = (x: number) => 100 + x * 3; // ~72 degrees

  it("accepts flat ground", () => {
    expect(slopeWalkable(flat, 0, 0, Math.PI / 4)).toBe(true);
  });

  it("accepts a gentle slope under the limit", () => {
    expect(slopeWalkable(gentle, 0, 0, Math.PI / 4)).toBe(true);
  });

  it("rejects a cliff over the limit", () => {
    expect(slopeWalkable(cliff, 0, 0, Math.PI / 4)).toBe(false);
  });

  it("a tighter limit rejects the gentle slope", () => {
    expect(slopeWalkable(gentle, 0, 0, Math.PI / 12)).toBe(false);
  });

  it("handles a z-gradient", () => {
    const slopeZ = (_x: number, z: number) => 50 + z * 3;
    expect(slopeWalkable(slopeZ, 0, 0, Math.PI / 4)).toBe(false);
  });

  it("uses Vector3.Zero-compatible math (no NaN on zero gradient)", () => {
    const v = new Vector3(0, 0, 0);
    expect(v.lengthSquared()).toBe(0);
    expect(slopeWalkable(flat, 1e6, -1e6, Math.PI / 4)).toBe(true);
  });
});
