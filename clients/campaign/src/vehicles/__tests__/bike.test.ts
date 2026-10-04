/**
 * BikeController tests — pure math plus a NullEngine-driven controller.
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  BikeController,
  computeTargetLean,
  suspensionForce,
  uprightTorque,
} from "../bike.js";

function makeBike() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  // Flat ground at y=0: the ray from y=1 travels 1.0 m.
  const groundRay = (origin: Vector3, maxDistance: number): number | null => {
    if (origin.y <= 0) return null;
    const d = origin.y;
    return d <= maxDistance ? d : null;
  };
  const input = {
    handlers: new Map<string, () => void>(),
    releases: new Map<string, () => void>(),
    on: (id: string, handler: () => void) => {
      input.handlers.set(id, handler);
      return () => {
        input.handlers.delete(id);
      };
    },
    onRelease: (id: string, handler: () => void) => {
      input.releases.set(id, handler);
      return () => {
        input.releases.delete(id);
      };
    },
    press: (id: string) => input.handlers.get(id)?.(),
    release: (id: string) => input.releases.get(id)?.(),
  };
  const bike = new BikeController({
    scene,
    input: input as never,
    start: new Vector3(0, 0, 0),
    groundRay,
  });
  return { bike, input, scene, engine };
}

describe("computeTargetLean", () => {
  it("leans into the turn, scaled by speed", () => {
    expect(computeTargetLean(1, 20, 0.9)).toBeCloseTo(-0.9, 5);
    expect(computeTargetLean(1, 0, 0.9)).toBeCloseTo(-0.27, 5);
    expect(computeTargetLean(0, 20, 0.9)).toBe(0);
    expect(computeTargetLean(-1, 20, 0.9)).toBeCloseTo(0.9, 5);
  });
});

describe("uprightTorque", () => {
  it("pushes the lean toward the target and damps velocity", () => {
    const t = uprightTorque(0.5, 0, 0, 20, 10);
    expect(t).toBeLessThan(0); // pushes back toward 0
    const t2 = uprightTorque(-0.5, 0, 0, 20, 10);
    expect(t2).toBeGreaterThan(0);
  });

  it("is weaker at a standstill", () => {
    const fast = Math.abs(uprightTorque(0.5, 0, 0, 20, 10));
    const slow = Math.abs(uprightTorque(0.5, 0, 0, 0, 10));
    expect(fast).toBeGreaterThan(slow);
  });
});

describe("suspensionForce", () => {
  it("rises with compression and resists compression velocity", () => {
    const f1 = suspensionForce(0.5, 0, 55, 6, 0.25);
    const f2 = suspensionForce(0.8, 0, 55, 6, 0.25);
    expect(f2).toBeGreaterThan(f1);
    const f3 = suspensionForce(0.5, 2, 55, 6, 0.25);
    expect(f3).toBeLessThan(f1);
  });
});

describe("BikeController", () => {
  it("is inert until mounted", () => {
    const { bike, input } = makeBike();
    input.press("player.moveForward"); // no handler yet: inert
    bike.update(0.5);
    expect(bike.speedMs).toBe(0);
    bike.mount();
    input.press("player.moveForward");
    bike.update(0.5);
    expect(bike.speedMs).toBeGreaterThan(0);
  });

  it("accelerates toward top speed and no further", () => {
    const { bike, input } = makeBike();
    bike.mount();
    input.press("player.moveForward");
    for (let i = 0; i < 200; i++) bike.update(0.1);
    expect(bike.forwardSpeed).toBeLessThanOrEqual(45.5);
    expect(bike.forwardSpeed).toBeGreaterThan(30);
  });

  it("leans into steering at speed", () => {
    const { bike, input } = makeBike();
    bike.mount();
    input.press("player.moveForward");
    for (let i = 0; i < 50; i++) bike.update(0.1);
    input.press("player.moveLeft");
    for (let i = 0; i < 30; i++) bike.update(0.1);
    // steer left (input +1) → negative lean (into the turn)
    expect(bike.leanAngle).toBeLessThan(-0.1);
  });

  it("crashes past the lean limit and can reset", () => {
    const { bike } = makeBike();
    bike.mount();
    bike.crash();
    expect(bike.isCrashed).toBe(true);
    bike.update(0.5);
    bike.reset();
    expect(bike.isCrashed).toBe(false);
    expect(bike.speedMs).toBe(0);
  });

  it("detects airborne when the ground ray misses", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const bike = new BikeController({
      scene,
      input: { on: () => () => {}, onRelease: () => () => {} } as never,
      start: new Vector3(0, 0, 0),
      groundRay: () => null, // no ground: a jump
    });
    bike.mount();
    bike.update(0.1);
    expect(bike.isAirborne).toBe(true);
    engine.dispose();
  });

  it("dismount releases input", () => {
    const { bike, input } = makeBike();
    bike.mount();
    input.press("player.moveForward");
    bike.update(0.5);
    const speed = bike.speedMs;
    expect(speed).toBeGreaterThan(0);
    bike.dismount();
    input.release("player.moveForward");
    input.press("player.moveForward"); // no handler anymore
    bike.update(0.5); // inert: coasts without throttle
    expect(bike.speedMs).toBeLessThanOrEqual(speed);
  });
});
