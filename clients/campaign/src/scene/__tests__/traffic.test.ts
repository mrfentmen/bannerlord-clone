/**
 * Traffic tests — the street-following math is pure (no scene), so the core
 * is tested with a fake root. One NullEngine test covers spawn/dispose.
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { advanceCar, placeOnStreet, spawnTraffic, type TrafficCar } from "../traffic.js";

function fakeRoot() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
}

function carOn(pts: Array<[number, number]>, laneOffset = 1.8): TrafficCar {
  return {
    root: fakeRoot(),
    street: { pts: pts.map(([x, z]) => ({ x, z })) },
    segIndex: 0,
    segT: 0,
    speed: 10,
    laneOffset,
  };
}

describe("advanceCar", () => {
  it("advances along a straight segment", () => {
    const car = carOn([[0, 0], [100, 0]]);
    expect(advanceCar(car, 10)).toBe(false);
    expect(car.segT).toBeCloseTo(0.1, 6);
    // Lane offset pushes +z for +x travel; x is the along-track position.
    expect(car.root.position.x).toBeCloseTo(10, 6);
    expect(car.root.position.z).toBeCloseTo(1.8, 6);
  });

  it("crosses into the next segment carrying leftover distance", () => {
    const car = carOn([[0, 0], [10, 0], [10, 10]]);
    expect(advanceCar(car, 15)).toBe(false);
    expect(car.segIndex).toBe(1);
    expect(car.segT).toBeCloseTo(0.5, 6);
    // Second segment runs +z; the right-hand lane offset pushes −x.
    expect(car.root.position.x).toBeCloseTo(10 - 1.8, 6);
    expect(car.root.position.z).toBeCloseTo(5, 6);
  });

  it("returns true at the end of the street", () => {
    const car = carOn([[0, 0], [10, 0]]);
    expect(advanceCar(car, 25)).toBe(true);
  });

  it("exact segment boundary lands on the next segment start", () => {
    const car = carOn([[0, 0], [10, 0], [20, 0]]);
    expect(advanceCar(car, 10)).toBe(false);
    expect(car.segIndex).toBe(1);
    expect(car.segT).toBe(0);
  });
});

describe("placeOnStreet", () => {
  it("faces the travel direction", () => {
    const car = carOn([[0, 0], [0, 100]], 0);
    car.segT = 0.5;
    placeOnStreet(car);
    expect(car.root.rotation.y).toBeCloseTo(Math.atan2(0, 100), 6);
    expect(car.root.position.z).toBeCloseTo(50, 6);
  });

  it("does not NaN on a zero-length segment", () => {
    const car = carOn([[5, 5], [5, 5], [10, 5]]);
    placeOnStreet(car);
    expect(Number.isNaN(car.root.position.x)).toBe(false);
    expect(Number.isNaN(car.root.position.z)).toBe(false);
  });
});

describe("spawnTraffic", () => {
  it("spawns the requested cars and disposes cleanly", () => {
    const scene = new Scene(new NullEngine());
    const streets = [{ coords: [[0, 0], [0.001, 0.001]] as [number, number][] }];
    const toWorld = (lat: number, lon: number) => ({ x: lon * 1000, z: lat * 1000 });
    const handle = spawnTraffic(scene, streets, toWorld, { count: 4 });
    expect(handle.cars.length).toBe(4);
    for (const car of handle.cars) {
      expect(car.speed).toBeGreaterThanOrEqual(8);
      expect(car.speed).toBeLessThanOrEqual(15);
    }
    handle.dispose();
    expect(handle.cars.length).toBe(0);
    scene.dispose();
  });

  it("spawns nothing when there are no usable streets", () => {
    const scene = new Scene(new NullEngine());
    const handle = spawnTraffic(scene, [], () => ({ x: 0, z: 0 }), { count: 4 });
    expect(handle.cars.length).toBe(0);
    handle.dispose();
    scene.dispose();
  });
});
