/**
 * Taxes and construction, driven through the provider the way the town panel
 * does: set the town rate, set the state rate, queue a project, and watch the
 * project complete over ticks.
 */

import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "./index.js";

describe("taxes", () => {
  it("sets a town's tax rate and clamps it to 0-50%", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    await provider.setTaxRate(town.id, 0.35);
    const after = await provider.getSnapshot();
    expect(after.towns.find((t) => t.id === town.id)!.taxRate).toBeCloseTo(0.35);

    await provider.setTaxRate(town.id, 0.99);
    const clamped = await provider.getSnapshot();
    expect(clamped.towns.find((t) => t.id === town.id)!.taxRate).toBeCloseTo(0.5);
  });

  it("sets the state rate for every town in the state", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const state = before.towns[0]!.state;
    await provider.setStateTaxRate(state, 0.08);
    const after = await provider.getSnapshot();
    for (const t of after.towns) {
      if (t.state === state) expect(t.stateTaxRate).toBeCloseTo(0.08);
    }
  });

  it("rejects an unknown state", async () => {
    const provider = createFixtureSimulationProvider();
    await expect(provider.setStateTaxRate("ZZ", 0.08)).rejects.toThrow();
  });
});

describe("construction", () => {
  it("queues a project, deducts the cost, and completes it over days", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const town = before.towns.find((t) => t.id === "town-denver")!;
    const watch = town.buildings.find((b) => b.id === "watch")!;
    const levelBefore = watch.level;

    const res = await provider.startConstruction(town.id, "watch");
    expect(res.ok).toBe(true);

    // Fast-forward: run the clock until the project completes.
    provider.setTimeScale(365);
    await new Promise((r) => setTimeout(r, 2500));
    provider.setTimeScale(0);

    const after = await provider.getSnapshot();
    const done = after.towns.find((t) => t.id === town.id)!;
    const watchAfter = done.buildings.find((b) => b.id === "watch")!;
    expect(watchAfter.level).toBe(levelBefore + 1);
    expect(done.constructionBuilding).toBeNull();
  });

  it("refuses a second project while one is active", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const town = before.towns.find((t) => t.id === "town-denver")!;
    const first = await provider.startConstruction(town.id, "watch");
    expect(first.ok).toBe(true);
    const second = await provider.startConstruction(town.id, "farms");
    expect(second.ok).toBe(false);
  });

  it("refuses an unknown building", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const res = await provider.startConstruction(before.towns[0]!.id, "death-ray");
    expect(res.ok).toBe(false);
  });
});
