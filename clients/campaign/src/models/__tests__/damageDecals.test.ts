/**
 * Task 629: a landed shot leaves a mark that fades instead of accumulating.
 *
 * The placement arithmetic is checked directly -- pushed out along the normal by
 * 2 cm so a grazing hit is not culled by the projection, a normalised normal
 * with an upward fallback, a per-position angle so two hits are not stamped
 * alike -- and the bookkeeping is pinned: a per-target budget, a burst share so
 * one burst cannot spend the whole budget, and ageing that reports expired marks
 * for disposal. The real Babylon decal projection is exercised on a NullEngine:
 * `MeshBuilder.CreateDecal` is given the placement this module produced and must
 * come back with geometry.
 */

import { describe, expect, it } from "vitest";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  DEFAULT_DECAL_POLICY,
  DecalBudgets,
  SURFACE_OFFSET_MAX_FRACTION,
  ageDecals,
  decalOpacityAt,
  placeDecal,
  safeNormal,
  type DecalPlacement,
  type HitPoint,
  type LiveDecal,
} from "../DamageDecals.js";

const HIT: HitPoint = {
  position: { x: 1, y: 2, z: 3 },
  normal: { x: 0, y: 1, z: 0 },
};

function liveDecal(placement: DecalPlacement, ageS = 0): LiveDecal {
  return { targetId: 'tank', placement, kind: 'bullet', ageS };
}

describe("placement (task 629)", () => {
  it("pushes the mark out along the normal so the projection cannot cull it", () => {
    const placement = placeDecal('tank', HIT, 0) as DecalPlacement;
    expect(placement.position.y).toBeCloseTo(2 + DEFAULT_DECAL_POLICY.surfaceOffsetM);
    expect(placement.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(placement.id).toBe('tank#0');
  });

  it("normalises the normal it was given", () => {
    expect(safeNormal({ x: 0, y: 5, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
    expect(safeNormal({ x: 3, y: 0, z: 4 })).toEqual({ x: 0.6, y: 0, z: 0.8 });
  });

  it("falls back to straight up rather than to a broken orientation", () => {
    expect(safeNormal({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
    expect(safeNormal({ x: Number.NaN, y: 1, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("sizes an explosion differently from a bullet mark", () => {
    const bullet = placeDecal('tank', HIT, 0) as DecalPlacement;
    const blast = placeDecal('tank', HIT, 1, 'explosion') as DecalPlacement;
    expect(bullet.size).toBe(DEFAULT_DECAL_POLICY.bulletSizeM);
    expect(blast.size).toBe(DEFAULT_DECAL_POLICY.explosionSizeM);
    expect(blast.lifetimeS).toBeGreaterThan(bullet.lifetimeS);
  });

  it("gives the same impact the same angle and different impacts different ones", () => {
    const a = placeDecal('tank', HIT, 0) as DecalPlacement;
    const b = placeDecal('tank', HIT, 1) as DecalPlacement;
    const c = placeDecal('tank', { ...HIT, position: { x: 9, y: 2, z: 3 } }, 2) as DecalPlacement;
    expect(a.angle).toBe(b.angle);
    expect(a.angle).not.toBe(c.angle);
    expect(a.angle).toBeGreaterThanOrEqual(0);
    expect(a.angle).toBeLessThan(Math.PI * 2 + 1);
  });

  it("refuses a slot outside the budget", () => {
    expect(placeDecal('tank', HIT, -1)).toBeNull();
    expect(placeDecal('tank', HIT, DEFAULT_DECAL_POLICY.maxPerTarget)).toBeNull();
    expect(placeDecal('tank', HIT, Number.NaN)).toBeNull();
    expect(placeDecal('tank', HIT, DEFAULT_DECAL_POLICY.maxPerTarget - 1)).not.toBeNull();
  });
});

describe("DecalBudgets (task 629)", () => {
  it("admits up to its maximum and then refuses", () => {
    const budgets = new DecalBudgets();
    expect(budgets.remaining('tank')).toBe(DEFAULT_DECAL_POLICY.maxPerTarget);
    for (let i = 0; i < DEFAULT_DECAL_POLICY.maxPerTarget; i++) {
      expect(budgets.admit('tank')).toBe(i);
    }
    expect(budgets.admit('tank')).toBeNull();
    expect(budgets.remaining('tank')).toBe(0);
  });

  it("frees a slot when a mark expires", () => {
    const budgets = new DecalBudgets();
    budgets.admit('tank');
    expect(budgets.release('tank')).toBe(true);
    expect(budgets.remaining('tank')).toBe(DEFAULT_DECAL_POLICY.maxPerTarget);
    expect(budgets.release('unknown')).toBe(false);
  });

  it("will not let one burst spend the whole budget", () => {
    const budgets = new DecalBudgets();
    const share = Math.floor(DEFAULT_DECAL_POLICY.maxPerTarget * DEFAULT_DECAL_POLICY.burstShare);
    const slots = budgets.admitBurst('tank', 100);
    expect(slots).toHaveLength(share);
    // A second burst continues from where the first stopped, still capped.
    const second = budgets.admitBurst('tank', 100);
    expect(second).toHaveLength(share);
    expect(budgets.remaining('tank')).toBe(DEFAULT_DECAL_POLICY.maxPerTarget - share * 2);
  });

  it("takes only what is left, and nothing from an empty budget", () => {
    const budgets = new DecalBudgets({
      ...DEFAULT_DECAL_POLICY,
      maxPerTarget: 3,
      burstShare: 1,
    });
    expect(budgets.admitBurst('tank', 10)).toEqual([0, 1, 2]);
    expect(budgets.admitBurst('tank', 10)).toEqual([]);
    expect(budgets.admitBurst('tank', -5)).toEqual([]);
  });

  it("keeps budgets per target", () => {
    const budgets = new DecalBudgets();
    budgets.admit('tank');
    expect(budgets.remaining('humvee')).toBe(DEFAULT_DECAL_POLICY.maxPerTarget);
    expect(budgets.snapshot()).toEqual([
      { targetId: 'tank', max: DEFAULT_DECAL_POLICY.maxPerTarget, live: 1, released: 0 },
    ]);
    budgets.clear();
    expect(budgets.snapshot()).toEqual([]);
  });
});

describe("ageing (task 629)", () => {
  it("expires a mark when its lifetime is up", () => {
    const placement = placeDecal('tank', HIT, 0) as DecalPlacement;
    const result = ageDecals([liveDecal(placement, 0)], placement.lifetimeS + 0.1);
    expect(result.expired).toEqual([placement.id]);
    expect(result.live).toEqual([]);
  });

  it("keeps a mark that has not finished", () => {
    const placement = placeDecal('tank', HIT, 0) as DecalPlacement;
    const result = ageDecals([liveDecal(placement, 0)], 1);
    expect(result.expired).toEqual([]);
    expect(result.live[0]?.ageS).toBe(1);
  });

  it("ignores a broken frame time instead of teleporting the marks", () => {
    const placement = placeDecal('tank', HIT, 0) as DecalPlacement;
    for (const bad of [Number.NaN, -1]) {
      expect(ageDecals([liveDecal(placement, 5)], bad).live[0]?.ageS).toBe(5);
    }
  });

  it("fades a bullet mark throughout and a scorch mark only at the end", () => {
    const bullet = placeDecal('tank', HIT, 0) as DecalPlacement;
    const blast = placeDecal('tank', HIT, 1, 'explosion') as DecalPlacement;
    expect(decalOpacityAt(liveDecal(bullet, bullet.lifetimeS / 2))).toBeCloseTo(0.5);
    expect(decalOpacityAt(liveDecal(bullet, bullet.lifetimeS * 2))).toBe(0);
    expect(decalOpacityAt(liveDecal(blast, blast.lifetimeS * 0.5), 'explosion')).toBeGreaterThan(0.7);
    expect(decalOpacityAt(liveDecal(blast, blast.lifetimeS), 'explosion')).toBe(0);
  });

  it("never reports a negative opacity for a broken age", () => {
    const placement = placeDecal('tank', HIT, 0) as DecalPlacement;
    expect(decalOpacityAt(liveDecal(placement, -5))).toBe(1);
    expect(decalOpacityAt({ ...liveDecal(placement), placement: { ...placement, lifetimeS: 0 } })).toBe(0);
  });
});

describe("the real Babylon decal projection (task 629)", () => {
  it("builds a decal from this module's placement", () => {
    const scene = new Scene(new NullEngine());
    const wall = MeshBuilder.CreateBox('wall', { width: 4, height: 4, depth: 0.2 }, scene);
    // The box is 0.2 deep, so its +Z face is at z = 0.1: that is the surface the
    // shot struck, and the placement is pushed 2 cm out from it.
    const placement = placeDecal('wall', { position: { x: 0.5, y: 1, z: 0.1 }, normal: { x: 0, y: 0, z: 1 } }, 0) as DecalPlacement;

    const decal = MeshBuilder.CreateDecal('decal', wall, {
      position: new Vector3(placement.position.x, placement.position.y, placement.position.z),
      normal: new Vector3(placement.normal.x, placement.normal.y, placement.normal.z),
      size: new Vector3(placement.size, placement.size, placement.size),
      angle: placement.angle,
    });

    expect(decal).not.toBeNull();
    expect(decal.getTotalVertices()).toBeGreaterThan(0);
    expect(decal.name).toBe('decal');
    scene.dispose();
  });

  it("survives a placement that lands off the mesh, returning no decal", () => {
    const scene = new Scene(new NullEngine());
    const wall = MeshBuilder.CreateBox('wall', { width: 1, height: 1, depth: 1 }, scene);
    const decal = MeshBuilder.CreateDecal('miss', wall, {
      position: new Vector3(50, 50, 50),
      normal: new Vector3(0, 0, 1),
      size: new Vector3(0.12, 0.12, 0.12),
    });
    // Babylon returns an empty mesh rather than null when nothing was hit.
    expect(decal?.getTotalVertices() ?? 0).toBe(0);
    scene.dispose();
  });

  it("keeps the offset inside the decal so a grazing hit still projects", () => {
    const placement = placeDecal('wall', { position: { x: 0, y: 1, z: 0.1 }, normal: { x: 0, y: 0, z: 1 } }, 0) as DecalPlacement;
    const offset = placement.position.z - 0.1;
    expect(offset).toBeLessThan(placement.size / 2);
    expect(SURFACE_OFFSET_MAX_FRACTION).toBeLessThan(0.5);

    // A policy asking for a larger offset than the mark can take gets clamped
    // rather than producing a mark that never appears.
    const clamped = placeDecal(
      'wall',
      { position: { x: 0, y: 1, z: 0.1 }, normal: { x: 0, y: 0, z: 1 } },
      1,
      'bullet',
      { ...DEFAULT_DECAL_POLICY, surfaceOffsetM: 5 },
    ) as DecalPlacement;
    expect(clamped.position.z - 0.1).toBeCloseTo(placement.size * SURFACE_OFFSET_MAX_FRACTION);
  });
});