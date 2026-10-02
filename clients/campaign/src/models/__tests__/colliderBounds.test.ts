/**
 * Task 616: a collider is generated from a model's own bounds.
 *
 * A box fitted to the extent, centred on the geometry, with the padding applied
 * to the size only. Two failure modes are pinned: collapsed bounds (an
 * untransformed or empty mesh) must still produce a solid 1 m box and say that
 * it did not come from real bounds, and a non-numeric bound must not produce a
 * NaN collider that quietly swallows every ray. Troop models get a capsule,
 * because a box on a person catches a swing at the knees.
 */

import { describe, expect, it } from "vitest";
import {
  DEGENERATE_COLLIDER_M,
  buildBoxCollider,
  buildTroopCollider,
  type BoundsLike,
} from "../ColliderBounds.js";

function bounds(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoundsLike {
  return {
    min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
  };
}

describe("buildBoxCollider (task 616)", () => {
  it("fits a box to the extent", () => {
    const built = buildBoxCollider(bounds(0, 0, 0, 6, 2.4, 2.2));
    expect(built.kind).toBe('box');
    expect(built.fromBounds).toBe(true);
    expect(built.box).toEqual({ width: 6, height: 2.4, depth: 2.2, center: { x: 3, y: 1.2, z: 1.1 } });
  });

  it("centres on the geometry, not on the mesh origin", () => {
    const offset = buildBoxCollider(bounds(10, -2, 4, 16, 0, 8));
    expect(offset.box?.center).toEqual({ x: 13, y: -1, z: 6 });
    expect(offset.box?.width).toBe(6);
  });

  it("pads the size without moving the centre", () => {
    const built = buildBoxCollider(bounds(0, 0, 0, 2, 2, 2), 'box', 0.25);
    expect(built.box?.width).toBeCloseTo(2.5);
    expect(built.box?.center).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("falls back to a 1 m box for collapsed bounds and admits it", () => {
    const cases: Array<[BoundsLike, { x: number; y: number; z: number }]> = [
      [bounds(0, 0, 0, 0, 0, 0), { x: 0, y: 0, z: 0 }],
      [bounds(5, 5, 5, 5, 5, 5), { x: 5, y: 5, z: 5 }],
    ];
    for (const [bad, centre] of cases) {
      const built = buildBoxCollider(bad);
      expect(built.fromBounds).toBe(false);
      expect(built.box).toEqual({
        width: DEGENERATE_COLLIDER_M,
        height: DEGENERATE_COLLIDER_M,
        depth: DEGENERATE_COLLIDER_M,
        center: centre,
      });
    }
  });

  it("never emits a NaN from a NaN bound", () => {
    const built = buildBoxCollider({
      min: { x: Number.NaN, y: 0, z: 0 },
      max: { x: 2, y: 2, z: 2 },
    });
    expect(built.fromBounds).toBe(false);
    expect(built.box?.center.x).toBe(0);
    const numbers = [
      built.box?.width,
      built.box?.height,
      built.box?.depth,
      built.box?.center.x,
      built.box?.center.y,
      built.box?.center.z,
    ];
    expect(numbers.some((n) => Number.isNaN(n as number))).toBe(false);
  });

  it("clamps padding so a large pad cannot invert the box", () => {
    const built = buildBoxCollider(bounds(0, 0, 0, 1, 1, 1), 'box', -10);
    expect(built.box?.width).toBe(0);
  });

  it("honours a request for no collider", () => {
    expect(buildBoxCollider(bounds(0, 0, 0, 1, 1, 1), 'none')).toEqual({
      kind: 'none',
      box: null,
      fromBounds: false,
    });
  });
});

describe("buildTroopCollider (task 616)", () => {
  it("capsules a standing figure from base to head", () => {
    // 0.8 m across the shoulders: the capsule radius is half of it.
    const built = buildTroopCollider(bounds(-0.4, 0, -0.3, 0.4, 1.8, 0.3));
    expect(built.kind).toBe('capsule');
    expect(built.fromBounds).toBe(true);
    expect(built.box?.height).toBeCloseTo(1.8);
    expect(built.box?.center).toEqual({ x: 0, y: 0.9, z: 0 });
    expect(built.box?.width).toBeCloseTo(0.8);
    expect(built.box?.depth).toBeCloseTo(0.8);
  });

  it("derives the radius from the shoulder width when none is given", () => {
    const built = buildTroopCollider(bounds(-0.25, 0, 0, 0.25, 1.8, 0.2));
    expect(built.box?.width).toBeCloseTo(0.5);
  });

  it("refuses a collapsed figure instead of inventing a height", () => {
    expect(buildTroopCollider(bounds(0, 0, 0, 0, 0, 0))).toEqual({
      kind: 'capsule',
      box: null,
      fromBounds: false,
    });
  });

  it("falls back to the measured width for a broken radius", () => {
    for (const bad of [Number.NaN, -1, 0]) {
      const built = buildTroopCollider(bounds(-0.4, 0, 0, 0.4, 1.8, 0.3), bad);
      expect(built.box?.width).toBeCloseTo(0.8);
    }
  });

  it("takes an explicit radius when one is given", () => {
    const built = buildTroopCollider(bounds(-0.4, 0, 0, 0.4, 1.8, 0.3), 0.25);
    expect(built.box?.width).toBeCloseTo(0.5);
  });
});