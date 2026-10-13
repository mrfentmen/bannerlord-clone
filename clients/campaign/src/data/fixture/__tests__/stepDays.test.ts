/**
 * The wait order in the fixture (task 132). Waiting runs the fixture's own
 * daily tick — the same `#step()` the wall clock uses — so a waited day moves
 * the world exactly the way a lived day does: day counter, upkeep, sieges,
 * wars, quests, dynasty.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("stepDays (task 132)", () => {
  it("advances the day counter by the requested count", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const result = await provider.stepDays({ days: 3 });
    const after = await provider.getSnapshot();
    expect(result.ok).toBe(true);
    expect(result.day).toBe((before.day + 3) > 28 ? (before.day + 3 - 28) : before.day + 3);
    expect(after.day).toBe(result.day);
  });

  it("runs the daily tick: a waited day costs wages and food like a lived day", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const foodBefore = before.party.food;
    const owedBefore = before.party.wagesOwed;

    await provider.stepDays({ days: 1 });
    const after = await provider.getSnapshot();
    // Upkeep ran: the pantry is smaller, or the bill moved. Which one moves
    // depends on whether the purse covered the wages — either way the world
    // did the day's work, which is the promise of the order.
    const changed = after.party.food < foodBefore || after.party.wagesOwed !== owedBefore || after.party.money !== before.party.money;
    expect(changed).toBe(true);
  });

  it("one day at a time lands where a batch does", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    await provider.stepDays({ days: 1 });
    await provider.stepDays({ days: 1 });
    await provider.stepDays({ days: 1 });
    const stepped = await provider.getSnapshot();

    const batched = createFixtureSimulationProvider({ seed: 42 });
    const batchBefore = await batched.getSnapshot();
    await batched.stepDays({ days: 3 });
    const batchAfter = await batched.getSnapshot();

    expect(stepped.day).toBe(batchAfter.day);
    expect(batchBefore.day).toBe(before.day);
    // Same seed, same days served, same purse: determinism is the point.
    expect(batchAfter.party.money).toBe(stepped.party.money);
  });
});
