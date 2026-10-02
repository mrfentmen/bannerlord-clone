/**
 * Task 619: snow settles on the surfaces that can see the sky.
 *
 * Coverage is the product of two things -- how deep the snow is and how much sky
 * a normal faces -- which is why a roof whitens and a wall does not. The
 * shallow-snow floor and the vertical-wall floor are both pinned, because
 * either one alone produces the obvious artefacts: snow-painted walls, or a
 * roof that whitens after a light dusting the player should not see.
 */

import { describe, expect, it } from "vitest";
import {
  CLEAR_WEATHER,
  SNOW_COVER_FULL_M,
  SNOW_COVER_START_M,
  SNOW_HORIZONTAL_FLOOR,
  WET_DARKENING,
  WET_GLOSS,
  snowCoverOn,
  snowLayer,
  skyFacing,
  weatherWriteFor,
  wetDiffuseScale,
  wetLayer,
  type Normal,
  type WeatherState,
} from "../WeatherTints.js";

const UP: Normal = { x: 0, y: 1, z: 0 };
const SIDE: Normal = { x: 0, y: 0, z: 1 };
const DOWN: Normal = { x: 0, y: -1, z: 0 };
const SLOPED_ROOF: Normal = { x: 0, y: 0.7, z: 0.71 };

describe("skyFacing (task 619)", () => {
  it("reads 1 straight up and 0 sideways or down", () => {
    expect(skyFacing(UP)).toBeCloseTo(1);
    expect(skyFacing(SIDE)).toBeCloseTo(0);
    expect(skyFacing(DOWN)).toBeCloseTo(-1);
  });

  it("normalises a non-unit normal", () => {
    expect(skyFacing({ x: 0, y: 5, z: 0 })).toBeCloseTo(1);
    expect(skyFacing({ x: 0, y: 3, z: 4 })).toBeCloseTo(0.6);
  });

  it("reports no sky for a degenerate normal rather than dividing by zero", () => {
    expect(skyFacing({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(skyFacing({ x: Number.NaN, y: 1, z: 0 })).toBe(0);
  });
});

describe("snowCoverOn (task 619)", () => {
  it("puts nothing on a surface under the shallow-snow floor", () => {
    expect(snowCoverOn(UP, 0)).toBe(0);
    expect(snowCoverOn(UP, SNOW_COVER_START_M)).toBe(0);
    expect(snowCoverOn(UP, SNOW_COVER_START_M - 0.001)).toBe(0);
  });

  it("whitens an up-facing surface at full depth", () => {
    expect(snowCoverOn(UP, SNOW_COVER_FULL_M)).toBeCloseTo(1);
    expect(snowCoverOn(UP, SNOW_COVER_FULL_M * 2)).toBeCloseTo(1);
    expect(snowCoverOn(UP, (SNOW_COVER_START_M + SNOW_COVER_FULL_M) / 2)).toBeCloseTo(0.5);
  });

  it("keeps snow off a wall no matter how deep it gets", () => {
    expect(snowCoverOn(SIDE, 1)).toBe(0);
    expect(snowCoverOn(DOWN, 1)).toBe(0);
  });

  it("puts less on a sloped roof than on a flat one", () => {
    const deep = SNOW_COVER_FULL_M;
    expect(snowCoverOn(SLOPED_ROOF, deep)).toBeGreaterThan(0);
    expect(snowCoverOn(SLOPED_ROOF, deep)).toBeLessThan(snowCoverOn(UP, deep));
    // Below the horizontal floor a slope collects nothing, like a wall.
    expect(snowCoverOn({ x: 0, y: 0.3, z: 0.95 }, deep)).toBe(0);
    expect(SNOW_HORIZONTAL_FLOOR).toBeGreaterThan(0);
    expect(SNOW_HORIZONTAL_FLOOR).toBeLessThan(0.5);
  });

  it("ignores a snow depth that is not a number", () => {
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(snowCoverOn(UP, bad)).toBe(0);
    }
  });
});

describe("snowLayer (task 619)", () => {
  it("reports strength, a gloss lift and a cold tint", () => {
    const clear = snowLayer(UP, 0);
    expect(clear.strength).toBe(0);
    expect(clear.gloss).toBeCloseTo(1);

    const deep = snowLayer(UP, SNOW_COVER_FULL_M);
    expect(deep.strength).toBeCloseTo(1);
    expect(deep.gloss).toBeGreaterThan(1);
    expect(deep.tint.b).toBeGreaterThan(deep.tint.r);
  });
});

describe("weatherWriteFor under snow (task 619)", () => {
  const snowy = { ...CLEAR_WEATHER, snowM: SNOW_COVER_FULL_M };

  it("darkens the diffuse and lifts the specular on a roof", () => {
    const roof = weatherWriteFor(UP, snowy);
    expect(roof.coverage).toBeCloseTo(1);
    expect(roof.diffuseScale).toBeLessThan(0.2);
    expect(roof.specularScale).toBeGreaterThan(1);
    // Snow's tint is cool: blue survives better than red.
    expect(roof.emissiveAdd.b).toBeGreaterThan(roof.emissiveAdd.r);
  });

  it("leaves a wall alone", () => {
    const wall = weatherWriteFor(SIDE, snowy);
    expect(wall.coverage).toBe(0);
    expect(wall.diffuseScale).toBe(1);
    expect(wall.specularScale).toBeCloseTo(1);
  });

  it("writes nothing at all in clear weather", () => {
    const write = weatherWriteFor(UP, CLEAR_WEATHER);
    expect(write).toEqual({
      diffuseScale: 1,
      specularScale: 1,
      emissiveAdd: { r: 0, g: 0, b: 0 },
      coverage: 0,
    });
  });
});
describe("wet look (task 620)", () => {
  const dry: WeatherState = { snowM: 0, raining: false, biome: 'plains' };
  const rain: WeatherState = { ...dry, raining: true };

  it("is a no-op when it is not raining", () => {
    expect(wetLayer(false)).toEqual({ strength: 0, gloss: 1, tint: { r: 0, g: 0, b: 0 } });
    expect(wetDiffuseScale(false)).toBe(1);
    expect(weatherWriteFor(UP, dry)).toEqual(weatherWriteFor(SIDE, dry));
  });

  it("darkens and glosses every surface, whatever its normal", () => {
    for (const normal of [UP, SIDE, DOWN]) {
      const write = weatherWriteFor(normal, rain);
      expect(write.diffuseScale).toBeLessThan(1);
      expect(write.specularScale).toBeCloseTo(WET_GLOSS);
    }
  });

  it("darkens by a fifth, which is what water does to albedo", () => {
    expect(WET_DARKENING).toBeCloseTo(0.2);
    expect(wetDiffuseScale(true)).toBeCloseTo(0.8);
  });

  it("composes with snow rather than replacing it", () => {
    const snowyRain: WeatherState = { snowM: SNOW_COVER_FULL_M, raining: true, biome: 'plains' };
    const write = weatherWriteFor(UP, snowyRain);
    // Coverage is still the snow that fell; the rain darkens on top of it.
    expect(write.coverage).toBeCloseTo(1);
    expect(write.coverage).toBeGreaterThan(0.7);
    expect(write.specularScale).toBeCloseTo(WET_GLOSS);
    // Clear snow is brighter than wet snow.
    expect(write.diffuseScale).toBeLessThan(weatherWriteFor(UP, { ...snowyRain, raining: false }).diffuseScale);
  });

  it("never darkens past black or glosses past the wet value", () => {
    const write = weatherWriteFor(UP, { snowM: 10, raining: true, biome: 'desert' });
    expect(write.diffuseScale).toBeGreaterThan(0);
    expect(write.specularScale).toBeLessThanOrEqual(WET_GLOSS);
    expect(write.coverage).toBeLessThanOrEqual(1);
  });
});
