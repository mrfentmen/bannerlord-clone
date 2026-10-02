/**
 * ParticleDensityManager tests (MASTER_PLAN task 148). The manager only
 * talks to the DensityEmitter interface, so these run without Babylon.
 */

import { describe, expect, it } from "vitest";
import { ParticleDensityManager, type DensityEmitter } from "../particles.js";

function fakeEmitter(): DensityEmitter & { rates: number[]; starts: number; stops: number } {
  const f = {
    rates: [] as number[],
    starts: 0,
    stops: 0,
    setEmitRate(rate: number) {
      f.rates.push(rate);
    },
    start() {
      f.starts += 1;
    },
    stop() {
      f.stops += 1;
    },
    dispose() {},
  };
  return f;
}

describe("ParticleDensityManager", () => {
  it("scales registered emitters by density", () => {
    const mgr = new ParticleDensityManager();
    const dust = fakeEmitter();
    mgr.register("dust", dust, 100);
    expect(dust.rates.at(-1)).toBe(100);
    mgr.setDensity(0.5);
    expect(dust.rates.at(-1)).toBe(50);
    expect(mgr.getDensity()).toBe(0.5);
  });

  it("stops emitters at zero density and restarts above zero", () => {
    const mgr = new ParticleDensityManager();
    const snow = fakeEmitter();
    mgr.register("snow", snow, 40);
    mgr.setDensity(0);
    expect(snow.stops).toBe(1);
    mgr.setDensity(0.25);
    expect(snow.rates.at(-1)).toBe(10);
    expect(snow.starts).toBeGreaterThanOrEqual(1);
  });

  it("registers late emitters at the current density", () => {
    const mgr = new ParticleDensityManager();
    mgr.setDensity(0.25);
    const blood = fakeEmitter();
    mgr.register("blood", blood, 200);
    expect(blood.rates.at(-1)).toBe(50);
  });

  it("unregisters and disposes cleanly", () => {
    const mgr = new ParticleDensityManager();
    const dust = fakeEmitter();
    mgr.register("dust", dust, 100);
    mgr.unregister("dust");
    expect(mgr.registeredIds()).toHaveLength(0);
    mgr.setDensity(0.1);
    expect(dust.rates).toHaveLength(1); // no further updates after unregister
    mgr.dispose();
  });
});
