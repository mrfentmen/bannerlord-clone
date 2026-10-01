/**
 * Day/night cycle and weather: sun position/colour, night lights, weather
 * blending within 5s, and fog halving the spotting range. Uses NullEngine, so it
 * runs headless in CI.
 */

import { describe, expect, it } from "vitest";
import { DirectionalLight, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import {
  NIGHT_DAY_FACTOR,
  NIGHT_LIGHT_RANGE,
  WEATHER_BLEND_SECONDS,
  createAtmosphere,
  effectiveSpottingRange,
  sunParams,
  weatherFogTarget,
  type AtmosphereState,
} from "../atmosphere.js";

function testScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

function baseState(): AtmosphereState {
  return {
    hour: 12,
    weather: "clear",
    partyX: 100,
    partyZ: 200,
    partyGroundY: 40,
    spottingRange: 200,
    settlements: [
      { x: 0, z: 0, y: 30 },
      { x: 500, z: 500, y: 35 },
    ],
  };
}

describe("sunParams", () => {
  it("noon is full daylight with a high sun", () => {
    const p = sunParams(12);
    expect(p.dayFactor).toBeCloseTo(1, 6);
    expect(p.intensity).toBeCloseTo(1.18, 6);
    expect(p.direction.y).toBeLessThan(-0.9);
  });

  it("midnight is dark with a cold blue key", () => {
    const p = sunParams(0);
    expect(p.dayFactor).toBe(0);
    expect(p.intensity).toBeCloseTo(0.08, 6);
    expect(p.keyColor[0]).toBeCloseTo(0.35, 6);
    expect(p.keyColor[2]).toBeCloseTo(0.6, 6);
  });

  it("hour 24 wraps to midnight and hour 6 is sunrise", () => {
    const a = sunParams(24);
    const b = sunParams(0);
    expect(a.intensity).toBeCloseTo(b.intensity, 9);
    expect(a.dayFactor).toBeCloseTo(b.dayFactor, 9);
    expect(sunParams(6).dayFactor).toBeCloseTo(0, 9);
  });

  it("dawn and dusk are warm, midday is neutral", () => {
    const dawn = sunParams(7);
    expect(dawn.dayFactor).toBeGreaterThanOrEqual(NIGHT_DAY_FACTOR);
    expect(dawn.keyColor[0]).toBe(1.0);
    expect(dawn.keyColor[1]).toBe(0.75);
    const noon = sunParams(12);
    expect(noon.keyColor[0]).toBe(0.95);
    expect(noon.keyColor[1]).toBe(0.93);
  });
});

describe("setTimeOfDay", () => {
  it("drives the scene's existing key and fill lights", () => {
    const scene = testScene();
    const key = new DirectionalLight("key", new Vector3(-0.5, -0.8, 0.3), scene);
    key.intensity = 1.15;
    const fill = new HemisphericLight("fill", new Vector3(0.2, 1, -0.1), scene);
    fill.intensity = 0.4;
    const atmo = createAtmosphere({ scene });

    atmo.setTimeOfDay(12);
    expect(key.intensity).toBeCloseTo(1.18, 6);
    expect(key.diffuse.r).toBeCloseTo(0.95, 6);

    atmo.setTimeOfDay(0);
    expect(key.intensity).toBeCloseTo(0.08, 6);
    expect(key.diffuse.r).toBeCloseTo(0.35, 6);
    expect(key.diffuse.b).toBeCloseTo(0.6, 6);
    expect(fill.diffuse.r).toBeCloseTo(0.12, 6);
    atmo.dispose();
  });

  it("creates lights when the scene has none", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    atmo.setTimeOfDay(9);
    expect(scene.lights.length).toBeGreaterThanOrEqual(2);
    atmo.dispose();
  });
});

describe("night lights", () => {
  it("builds settlement lights with 200m+ range and a party torch at night", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    const state = baseState();
    state.hour = 0;
    atmo.update(state);

    expect(atmo.nightLightsBuilt).toBe(true);
    const lights = scene.lights.filter((l) => l.name.startsWith("night-light-"));
    expect(lights.length).toBe(2);
    for (const l of lights) {
      expect((l as { range: number }).range).toBeGreaterThanOrEqual(200);
      expect(l.intensity).toBeGreaterThan(0);
    }
    const torch = scene.getLightByName("torch-light");
    expect(torch).toBeTruthy();
    expect(torch!.intensity).toBeGreaterThan(0);
    expect(NIGHT_LIGHT_RANGE).toBeGreaterThanOrEqual(200);
    atmo.dispose();
  });

  it("dims the night lights during the day", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    const night = baseState();
    night.hour = 0;
    atmo.update(night);
    const day = baseState();
    day.hour = 12;
    atmo.update(day);
    const lights = scene.lights.filter((l) => l.name.startsWith("night-light-"));
    for (const l of lights) expect(l.intensity).toBe(0);
    expect(scene.getLightByName("torch-light")!.intensity).toBe(0);
    atmo.dispose();
  });
});

describe("weather", () => {
  it("fog blends to its target density within 5 seconds", () => {
    const scene = testScene();
    scene.fogDensity = 0.001;
    const atmo = createAtmosphere({ scene, baseFogDensity: 0.001 });
    atmo.setWeather("fog");
    const target = weatherFogTarget("fog", 0.001).density;
    atmo.tick(WEATHER_BLEND_SECONDS);
    expect(scene.fogDensity).toBeCloseTo(target, 12);
    expect(atmo.weather).toBe("fog");
    atmo.dispose();
  });

  it("is partway through the blend halfway in", () => {
    const scene = testScene();
    scene.fogDensity = 0.001;
    const atmo = createAtmosphere({ scene, baseFogDensity: 0.001 });
    atmo.setWeather("fog");
    const target = weatherFogTarget("fog", 0.001).density;
    atmo.tick(WEATHER_BLEND_SECONDS / 2);
    expect(scene.fogDensity).toBeGreaterThan(0.001);
    expect(scene.fogDensity).toBeLessThan(target);
    atmo.dispose();
  });

  it("returns to clear density on clear", () => {
    const scene = testScene();
    scene.fogDensity = 0.001;
    const atmo = createAtmosphere({ scene, baseFogDensity: 0.001 });
    atmo.setWeather("rain");
    atmo.tick(WEATHER_BLEND_SECONDS);
    atmo.setWeather("clear");
    atmo.tick(WEATHER_BLEND_SECONDS);
    expect(scene.fogDensity).toBeCloseTo(0.001, 12);
    atmo.dispose();
  });

  it("rain spawns falling particles, clear removes them", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    atmo.setWeather("rain");
    expect(atmo.particleCount).toBeGreaterThan(0);
    const before = scene
      .getMeshByName("weather-particles")!
      .getChildMeshes()
      .map((m) => m.position.y);
    atmo.tick(1);
    const after = scene
      .getMeshByName("weather-particles")!
      .getChildMeshes()
      .map((m) => m.position.y);
    const fell = after.some((y, i) => y < before[i]!);
    expect(fell).toBe(true);
    atmo.setWeather("clear");
    expect(atmo.particleCount).toBe(0);
    atmo.dispose();
  });

  it("snow spawns particles too", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    atmo.setWeather("snow");
    expect(atmo.particleCount).toBeGreaterThan(0);
    atmo.dispose();
  });
});

describe("spotting range", () => {
  it("fog halves the displayed range, other weather leaves it", () => {
    expect(effectiveSpottingRange(200, "fog")).toBe(100);
    expect(effectiveSpottingRange(200, "clear")).toBe(200);
    expect(effectiveSpottingRange(200, "rain")).toBe(200);
    expect(effectiveSpottingRange(200, "snow")).toBe(200);
  });

  it("the ring reflects the weather-adjusted range on update", () => {
    const scene = testScene();
    const atmo = createAtmosphere({ scene });
    const state = baseState();
    state.weather = "fog";
    atmo.update(state);
    expect(atmo.spottingRange).toBe(100);
    const ring = scene.getMeshByName("spotting-ring");
    expect(ring).toBeTruthy();
    expect(ring!.scaling.x).toBeCloseTo(100, 6);
    atmo.dispose();
  });
});
