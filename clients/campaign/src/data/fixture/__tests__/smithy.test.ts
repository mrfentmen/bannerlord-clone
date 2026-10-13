/**
 * Smithy bench tests (tasks 119-121): the fixture's forge, crucible, and
 * noble orders behave as the town panel's smithy section promises.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("the smithy bench", () => {
  it("lists the bench recipes with the costs the forge order spends", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const recipes = await provider.getSmithingRecipes();
    expect(recipes.length).toBeGreaterThan(0);
    for (const recipe of recipes) {
      expect(recipe.metal).toBeGreaterThan(0);
      expect(recipe.fuel).toBeGreaterThan(0);
      expect(recipe.name.length).toBeGreaterThan(0);
    }
  });

  it("forges an affordable recipe: consumes metal, stocks the piece, spends stamina", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    // The party starts with metal but no fuel in the sacks, so buy fuel at the
    // town market the way the player would, then forge against real stock.
    await provider.trade({
      partyId: before.party.id,
      townId: before.towns[0]!.id,
      goodId: "fuel",
      side: "buy",
      quantity: 3,
      expectedDay: before.day,
    });
    const stocked = await provider.getSnapshot();
    const recipes = await provider.getSmithingRecipes();
    const fuel = stocked.party.goods.find((g) => g.goodId === "fuel")?.quantity ?? 0;
    const affordable = recipes.find((r) => r.metal <= stocked.party.metal && r.fuel <= fuel);
    expect(affordable).toBeDefined();
    const staminaBefore = await provider.getSmithingStamina();

    const result = await provider.forgeItem(affordable!.id);

    const after = await provider.getSnapshot();
    expect(result.name.length).toBeGreaterThan(0);
    expect(after.party.metal).toBe(stocked.party.metal - affordable!.metal);
    const stock = after.party.crafted ?? [];
    expect(stock.length).toBeGreaterThan(0);
    const staminaAfter = await provider.getSmithingStamina();
    expect(staminaAfter.stamina).toBeLessThan(staminaBefore.stamina);
  });

  it("refuses an unknown recipe", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.forgeItem("plasma-rifle")).rejects.toThrow(/Unknown recipe/);
  });

  it("smelts arms when the party carries them, refuses when it does not", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const snap = await provider.getSnapshot();
    const arms = snap.party.goods.find((g) => g.goodId === "arms");
    if ((arms?.quantity ?? 0) > 0) {
      const before = snap.party.metal;
      const result = await provider.smeltArms(1);
      expect(result.metal).toBeGreaterThan(0);
      const after = await provider.getSnapshot();
      expect(after.party.metal).toBeGreaterThan(before);
    } else {
      await expect(provider.smeltArms(1)).rejects.toThrow(/No arms to smelt/);
    }
  });

  it("refuses to deliver against an order the smithy has not posted", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.fulfillCraftingOrder("order-none")).rejects.toThrow(/Order not found/);
  });

  it("reports the smith's stamina against a positive max", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const stamina = await provider.getSmithingStamina();
    expect(stamina.max).toBeGreaterThan(0);
    expect(stamina.stamina).toBeGreaterThanOrEqual(0);
    expect(stamina.stamina).toBeLessThanOrEqual(stamina.max);
  });
});
