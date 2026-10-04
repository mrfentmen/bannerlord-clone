/**
 * VehicleController pure-logic tests.
 *
 * The driving model is plain math over the heading frame, so the whole core
 * (decompose/recompose, turn rate, longitudinal step) is tested without a
 * Babylon scene. The `VehicleController` class itself needs a real Scene and
 * is verified in the browser.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import {
  DEFAULT_VEHICLE_STATS,
  computeTurnRate,
  decomposeVelocity,
  recomposeVelocity,
  stepLongitudinal,
} from "../VehicleController.js";

const STATS = DEFAULT_VEHICLE_STATS;

describe("decomposeVelocity / recomposeVelocity", () => {
  it("round-trips through the heading frame", () => {
    const v = new Vector3(3, 0, -4);
    for (const h of [0, 0.7, -2.1, Math.PI]) {
      const { forward, lateral } = decomposeVelocity(v, h);
      const back = recomposeVelocity(forward, lateral, h);
      expect(back.x).toBeCloseTo(v.x, 5);
      expect(back.z).toBeCloseTo(v.z, 5);
    }
  });

  it("at heading 0, forward is -Z and right is +X (Babylon convention)", () => {
    const f = decomposeVelocity(new Vector3(0, 0, -5), 0);
    expect(f.forward).toBeCloseTo(5, 5);
    expect(f.lateral).toBeCloseTo(0, 5);
    const r = decomposeVelocity(new Vector3(5, 0, 0), 0);
    expect(r.forward).toBeCloseTo(0, 5);
    expect(r.lateral).toBeCloseTo(5, 5);
  });
});

describe("computeTurnRate", () => {
  it("is zero with no steering input", () => {
    expect(computeTurnRate(0, 10, STATS)).toBe(0);
  });

  it("is zero at standstill (no authority)", () => {
    expect(computeTurnRate(1, 0, STATS)).toBe(0);
  });

  it("ramps authority with speed and stays positive turning right", () => {
    const slow = computeTurnRate(1, 2, STATS);
    const fast = computeTurnRate(1, 9, STATS);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
  });

  it("loses turn rate at top speed (high-speed loss)", () => {
    const atFull = computeTurnRate(1, 9, STATS);
    const atTop = computeTurnRate(1, STATS.maxSpeed, STATS);
    expect(atTop).toBeLessThan(atFull);
  });

  it("flips sign in reverse", () => {
    const fwd = computeTurnRate(1, 10, STATS);
    const rev = computeTurnRate(1, -10, STATS);
    expect(fwd).toBeGreaterThan(0);
    expect(rev).toBeLessThan(0);
  });

  it("never exceeds the base turn rate at full lock", () => {
    for (const s of [5, 9, 15, 30]) {
      expect(Math.abs(computeTurnRate(1, s, STATS))).toBeLessThanOrEqual(STATS.turnRate + 1e-9);
    }
  });
});

describe("stepLongitudinal", () => {
  const dt = 1 / 60;

  it("accelerates from standstill on throttle", () => {
    const v = stepLongitudinal(0, 1, 0, dt, STATS);
    expect(v).toBeGreaterThan(0);
    // kart.js launch factor: accel * max(0.3, 1.6 - 1.2*r), r=0 at standstill
    expect(v).toBeLessThanOrEqual(STATS.accel * 1.6 * dt + 1e-9);
  });

  it("never exceeds max speed", () => {
    let v = STATS.maxSpeed;
    for (let i = 0; i < 600; i++) v = stepLongitudinal(v, 1, 0, dt, STATS);
    expect(v).toBeLessThanOrEqual(STATS.maxSpeed + 1e-9);
  });

  it("acceleration falls off near top speed", () => {
    const low = stepLongitudinal(1, 1, 0, dt, STATS) - 1;
    const high = stepLongitudinal(STATS.maxSpeed * 0.95, 1, 0, dt, STATS) - STATS.maxSpeed * 0.95;
    expect(high).toBeLessThan(low);
  });

  it("brakes to a stop, then holding brake reverses (kart behavior)", () => {
    let v = 20;
    for (let i = 0; i < 50; i++) v = stepLongitudinal(v, 0, 1, dt, STATS);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(20);
    // keep holding: brake at standstill becomes reverse, capped
    for (let i = 0; i < 1200; i++) v = stepLongitudinal(v, 0, 1, dt, STATS);
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThanOrEqual(-STATS.reverseMaxSpeed - 1e-9);
  });

  it("reverses when braking at a standstill, capped at reverse max", () => {
    let v = 0;
    for (let i = 0; i < 1200; i++) v = stepLongitudinal(v, 0, 1, dt, STATS);
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThanOrEqual(-STATS.reverseMaxSpeed - 1e-9);
  });

  it("coasts to a stop with no input", () => {
    let v = 10;
    for (let i = 0; i < 3600; i++) v = stepLongitudinal(v, 0, 0, dt, STATS);
    expect(v).toBe(0);
  });

  it("throttle while reversing brakes toward zero first", () => {
    const v = stepLongitudinal(-5, 1, 0, dt, STATS);
    expect(v).toBeGreaterThan(-5);
    expect(v).toBeLessThanOrEqual(0);
  });
});
