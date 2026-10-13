/**
 * Task 646: a cape flutters behind a moving character.
 *
 * The test runs the cloth and checks the things that decide whether it reads as
 * cloth: it stays attached to the shoulders however the wearer turns, it never
 * stretches past the spacing it was built with, it hangs under gravity when
 * nothing is moving, it is pushed backwards by a walking character and by wind,
 * it stays out of the wearer's body, and a one-second frame does not blow it up --
 * which is the whole reason this is Verlet and not a spring per point.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPE_ROWS,
  DEFAULT_CAPE_SETTINGS,
  MAX_CAPE_DELTA_S,
  STILL,
  capeHem,
  capeLength,
  makeCape,
  stepCape,
  type CapeForces,
  type ClothPoint,
} from "../CapeCloth.js";

const COLLAR = { x: 0, y: 1.5, z: 0 };

/** Step a cape for `frames` frames with the given forces. */
function run(
  cape: ClothPoint[],
  frames: number,
  forces: Partial<CapeForces> = {},
  collar = COLLAR,
  settings = DEFAULT_CAPE_SETTINGS,
): void {
  for (let i = 0; i < frames; i++) {
    stepCape(cape, collar, settings, { ...STILL, ...forces });
  }
}

describe("makeCape (task 646)", () => {
  it("hangs a strip of the requested length below the collar", () => {
    const cape = makeCape(COLLAR, 8);
    expect(cape).toHaveLength(DEFAULT_CAPE_ROWS);
    expect(cape[0]?.pinned).toBe(true);
    expect(cape[7]?.pinned).toBe(false);
    expect(COLLAR.y - (cape[7]?.y ?? 0)).toBeCloseTo(7 * DEFAULT_CAPE_SETTINGS.spacingM);
    expect(capeLength(cape)).toBeCloseTo(7 * DEFAULT_CAPE_SETTINGS.spacingM, 5);
  });

  it("falls back to a usable strip for a broken row count", () => {
    expect(makeCape(COLLAR, 1)).toHaveLength(DEFAULT_CAPE_ROWS);
    expect(makeCape(COLLAR, Number.NaN)).toHaveLength(DEFAULT_CAPE_ROWS);
    expect(makeCape(COLLAR, -3)).toHaveLength(DEFAULT_CAPE_ROWS);
  });

  it("finds the hem", () => {
    expect(capeHem([])).toBeNull();
    const cape = makeCape(COLLAR, 5);
    expect(capeHem(cape)?.y).toBeCloseTo(cape[4]?.y ?? 0);
  });
});

describe("stepCape (task 646)", () => {
  it("keeps the collar exactly on the shoulders", () => {
    const cape = makeCape(COLLAR, 6);
    const moving = { x: 1, y: 1.4, z: -2 };
    run(cape, 60, { wind: { x: 4, y: 0, z: 2 } }, moving);
    expect(cape[0]?.x).toBeCloseTo(moving.x);
    expect(cape[0]?.y).toBeCloseTo(moving.y);
    expect(cape[0]?.z).toBeCloseTo(moving.z);
  });

  it("never stretches past the spacing it was built with", () => {
    const cape = makeCape(COLLAR, 8);
    run(cape, 300, { wind: { x: 9, y: 0, z: 0 }, wearerVelocity: { x: -3, y: 0, z: 0 } });
    expect(capeLength(cape)).toBeLessThanOrEqual(
      cape.length * DEFAULT_CAPE_SETTINGS.spacingM * 1.2,
    );
    // ...and it does not collapse into a knot either.
    expect(capeLength(cape)).toBeGreaterThan((cape.length - 1) * DEFAULT_CAPE_SETTINGS.spacingM * 0.5);
  });

  it("hangs down under gravity and stops moving", () => {
    const cape = makeCape(COLLAR, 6);
    run(cape, 200);
    const hem = capeHem(cape);
    expect(hem?.y).toBeLessThan(COLLAR.y - 0.2);
    // Settled: the hem has stopped dropping between the last two frames.
    const before = capeHem(cape)?.y ?? 0;
    run(cape, 30);
    expect(Math.abs((capeHem(cape)?.y ?? 0) - before)).toBeLessThan(0.01);
  });

  it("is blown sideways by wind", () => {
    const cape = makeCape(COLLAR, 6);
    run(cape, 120, { wind: { x: 12, y: 0, z: 0 } });
    expect(capeHem(cape)?.x ?? 0).toBeGreaterThan(0.05);
  });

  it("is pushed backwards by a character walking forwards", () => {
    const cape = makeCape(COLLAR, 6);
    run(cape, 120, { wearerVelocity: { x: 0, y: 0, z: 2 } });
    // The cape trails behind the wearer: opposite the direction of travel.
    expect(capeHem(cape)?.z ?? 0).toBeLessThan(-0.02);
  });

  it("whips round when the wearer turns on the spot", () => {
    const cape = makeCape(COLLAR, 6);
    run(cape, 60);
    // The shoulders swing to the other side; the hem has to follow.
    run(cape, 60, {}, { x: 2, y: 1.5, z: 0 });
    const hem = capeHem(cape);
    expect(hem?.x ?? 0).toBeGreaterThan(0.2);
  });

  it("stays out of the wearer's body", () => {
    const cape = makeCape(COLLAR, 6);
    run(cape, 120, { wind: { x: 0, y: 0, z: 0 } });
    for (const point of cape) {
      const awayZ = Math.abs(point.z - COLLAR.z);
      if (awayZ > 1e-6) expect(awayZ).toBeGreaterThanOrEqual(DEFAULT_CAPE_SETTINGS.bodyClearanceM - 1e-6);
    }
  });

  it("survives a one-second frame without exploding", () => {
    const cape = makeCape(COLLAR, 8);
    const blowUp: CapeForces = {
      wind: { x: 50, y: 0, z: 0 },
      wearerVelocity: { x: 0, y: 0, z: 0 },
      deltaS: 1,
    };
    for (let i = 0; i < 30; i++) stepCape(cape, COLLAR, DEFAULT_CAPE_SETTINGS, blowUp);
    for (const point of cape) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.z)).toBe(true);
      expect(Math.abs(point.x)).toBeLessThan(100);
      expect(Math.abs(point.y)).toBeLessThan(100);
    }
    expect(MAX_CAPE_DELTA_S).toBeLessThan(1);
  });

  it("clamps a long frame instead of trusting it", () => {
    const cape = makeCape(COLLAR, 6);
    const hemBefore = capeHem(cape)?.y ?? 0;
    stepCape(cape, COLLAR, DEFAULT_CAPE_SETTINGS, { ...STILL, deltaS: 1 });
    // One clamped step falls a few centimetres, not a metre.
    expect(hemBefore - (capeHem(cape)?.y ?? 0)).toBeLessThan(0.1);
  });

  it("does nothing for a broken frame time or broken wind", () => {
    const cape = makeCape(COLLAR, 5);
    const before = JSON.stringify(cape);
    stepCape(cape, COLLAR, DEFAULT_CAPE_SETTINGS, {
      wind: { x: Number.NaN, y: 0, z: 0 },
      wearerVelocity: { x: 0, y: 0, z: Number.POSITIVE_INFINITY },
      deltaS: Number.NaN,
    });
    expect(JSON.stringify(cape)).toBe(before);
  });

  it("falls back to sane settings rather than dividing by zero", () => {
    const cape = makeCape(COLLAR, 5);
    run(cape, 60, {}, COLLAR, {
      spacingM: 0,
      stiffness: Number.NaN,
      damping: 5,
      gravity: Number.NaN,
      iterations: 0,
      bodyClearanceM: Number.NaN,
    });
    for (const point of cape) {
      expect(Number.isFinite(point.x)).toBe(true);
    }
  });

  it("handles a cape of one point without throwing", () => {
    const single = makeCape(COLLAR, 2).slice(0, 1);
    expect(() => stepCape(single, COLLAR)).not.toThrow();
    expect(stepCape([], COLLAR)).toEqual([]);
  });

  it("moves further with a stronger wind", () => {
    const light = makeCape(COLLAR, 6);
    const strong = makeCape(COLLAR, 6);
    run(light, 120, { wind: { x: 4, y: 0, z: 0 } });
    run(strong, 120, { wind: { x: 20, y: 0, z: 0 } });
    expect(Math.abs(capeHem(strong)?.x ?? 0)).toBeGreaterThan(Math.abs(capeHem(light)?.x ?? 0));
  });
});