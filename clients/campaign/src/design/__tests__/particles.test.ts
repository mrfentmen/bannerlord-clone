import { describe, expect, it } from "vitest";
import {
  PARTICLE_DENSITY_DEFAULT,
  clampParticleDensity,
  particlesDisabled,
  scaledEmitRate,
} from "../particles.js";

describe("particle density policy (task 148)", () => {
  it("defaults to full density", () => {
    expect(PARTICLE_DENSITY_DEFAULT).toBe(1);
    expect(clampParticleDensity(undefined)).toBe(1);
    expect(clampParticleDensity(NaN)).toBe(1);
  });

  it("clamps to 0..1", () => {
    expect(clampParticleDensity(0)).toBe(0);
    expect(clampParticleDensity(0.5)).toBe(0.5);
    expect(clampParticleDensity(1)).toBe(1);
    expect(clampParticleDensity(-0.2)).toBe(0);
    expect(clampParticleDensity(1.7)).toBe(1);
  });

  it("scales emission linearly", () => {
    expect(scaledEmitRate(100, 1)).toBe(100);
    expect(scaledEmitRate(100, 0.5)).toBe(50);
    expect(scaledEmitRate(40, 0.25)).toBe(10);
  });

  it("zero disables, never negative", () => {
    expect(scaledEmitRate(100, 0)).toBe(0);
    expect(particlesDisabled(0)).toBe(true);
    expect(particlesDisabled(0.01)).toBe(false);
    expect(scaledEmitRate(-5, 1)).toBe(0);
    expect(scaledEmitRate(100, -1)).toBe(0);
  });
});
