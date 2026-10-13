import { describe, expect, it } from "vitest";
import { WORKSHOP_RECIPES, runWorkshopDay } from "../../economy/workshopChains.js";
import { branchChoices, getBranch, isValidBranch } from "../../troop/branches.js";
import {
  emptyEnginePark,
  queueEngine,
  moveEngine,
  tickEngines,
  deployedDamage,
  engineType,
} from "../../siege/engines.js";
import {
  startDiceGame,
  playDiceRound,
  settleDiceGame,
  diceGameOver,
  npcStake,
} from "../../tavern/games.js";
import { saveTemplate, refitToward, templateSummary } from "../../party/templates.js";
import {
  maxStamina,
  checkStamina,
  spendStamina,
  recoverStamina,
  forgeStaminaCost,
} from "../../campaign/smithingStamina.js";
import { influenceGain, spendInfluence, INFLUENCE_COSTS } from "../../court/influence.js";

describe("workshop production chains", () => {
  const marketOf = () =>
    new Map([
      ["metal", { goodId: "metal", price: 55, stock: 100 }],
      ["fuel", { goodId: "fuel", price: 30, stock: 100 }],
      ["arms", { goodId: "arms", price: 210, stock: 10 }],
      ["grain", { goodId: "grain", price: 12, stock: 100 }],
      ["beer", { goodId: "beer", price: 18, stock: 5 }],
    ]);

  it("every workshop type has a recipe", () => {
    for (const t of ["smithy", "brewery", "weavery", "tannery", "press"]) {
      expect(WORKSHOP_RECIPES[t]).toBeDefined();
    }
  });

  it("a smithy consumes inputs and produces arms for a profit", () => {
    const market = marketOf();
    const result = runWorkshopDay(WORKSHOP_RECIPES.smithy, market, "Smithy");
    expect(result.runs).toBe(3);
    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputValue).toBeGreaterThan(0);
    expect(market.get("metal")!.stock).toBe(100 - 2 * 3);
    expect(market.get("arms")!.stock).toBe(10 + 3);
    expect(result.line).toMatch(/Smithy/);
  });

  it("a starved workshop idles and bleeds wages", () => {
    const market = new Map([
      ["metal", { goodId: "metal", price: 55, stock: 1 }],
      ["fuel", { goodId: "fuel", price: 30, stock: 0 }],
      ["arms", { goodId: "arms", price: 210, stock: 10 }],
    ]);
    const result = runWorkshopDay(WORKSHOP_RECIPES.smithy, market, "Smithy");
    expect(result.runs).toBe(0);
    expect(result.profit).toBeLessThan(0);
    expect(result.line).toMatch(/idles/);
  });
});

describe("troop branching", () => {
  it("tiers 2 and 4 fork, others go straight", () => {
    expect(branchChoices(2)).toHaveLength(2);
    expect(branchChoices(4)).toHaveLength(2);
    expect(branchChoices(1)).toHaveLength(0);
    expect(branchChoices(3)).toHaveLength(0);
    expect(branchChoices(5)).toHaveLength(0);
  });

  it("branches are lookup-able and tier-validated", () => {
    expect(getBranch("raider")?.name).toBe("Raider");
    expect(getBranch("nope")).toBeNull();
    expect(isValidBranch(2, "raider")).toBe(true);
    expect(isValidBranch(2, "marksman")).toBe(false);
  });
});

describe("siege engines", () => {
  it("engines queue, build, and move to reserve", () => {
    const park = emptyEnginePark();
    const { cost } = queueEngine(park, "breaching-truck");
    expect(cost).toBeGreaterThan(0);
    expect(park.queue).toHaveLength(1);
    // 3 build days.
    tickEngines(park, () => 0.99);
    tickEngines(park, () => 0.99);
    expect(park.reserve).toHaveLength(0);
    const done = tickEngines(park, () => 0.99);
    expect(done.completed).toContain("breaching-truck");
    expect(park.reserve).toContain("breaching-truck");
  });

  it("engines move between reserve and deployed", () => {
    const park = emptyEnginePark();
    queueEngine(park, "assault-ladder");
    tickEngines(park, () => 0.99); // 1 build day
    moveEngine(park, "assault-ladder", "deployed");
    expect(park.deployed).toContain("assault-ladder");
    expect(park.reserve).toHaveLength(0);
    moveEngine(park, "assault-ladder", "reserve");
    expect(park.reserve).toContain("assault-ladder");
  });

  it("deployed engines do wall damage; counter-battery destroys them", () => {
    const park = emptyEnginePark();
    queueEngine(park, "artillery");
    for (let i = 0; i < 5; i++) tickEngines(park, () => 0.99);
    moveEngine(park, "artillery", "deployed");
    expect(deployedDamage(park)).toBeCloseTo(0.35);
    // Force a counter-battery kill with roll 0.
    const result = tickEngines(park, () => 0);
    expect(result.destroyed).toContain("artillery");
    expect(deployedDamage(park)).toBe(0);
  });

  it("fire variants double damage", () => {
    const park = emptyEnginePark();
    queueEngine(park, "breaching-truck");
    for (let i = 0; i < 3; i++) tickEngines(park, () => 0.99);
    park.reserve.push("breaching-truck");
    park.deployed.push("breaching-truck");
    park.fireVariants.push("breaching-truck");
    expect(deployedDamage(park)).toBeCloseTo(engineType("breaching-truck")!.siegeDamage * 2);
  });

  it("unknown engine types throw", () => {
    expect(() => queueEngine(emptyEnginePark(), "trebuchet")).toThrow();
  });
});

describe("tavern dice", () => {
  it("plays three rounds and settles the pot", () => {
    const game = startDiceGame("Player", 50, [{ name: "Reg", stake: 40 }]);
    expect(game.pot).toBe(90);
    // Rigged rolls: player always 12, Reg always 2.
    let calls = 0;
    const rigged = () => (calls++ % 4 < 2 ? 0.99 : 0.0);
    for (let r = 0; r < 3; r++) playDiceRound(game, rigged);
    expect(diceGameOver(game)).toBe(true);
    const result = settleDiceGame(game, "Player");
    expect(result.pot).toBe(90);
    expect(result.line).toMatch(/Player/);
  });

  it("the loser gets nothing", () => {
    const game = startDiceGame("Player", 50, [{ name: "Reg", stake: 40 }]);
    let calls = 0;
    const rigged = () => (calls++ % 4 < 2 ? 0.0 : 0.99);
    for (let r = 0; r < 3; r++) playDiceRound(game, rigged);
    const result = settleDiceGame(game, "Player");
    expect(result.pot).toBe(0);
  });

  it("richer towns stake more", () => {
    expect(npcStake(90, () => 0.5)).toBeGreaterThan(npcStake(10, () => 0.5));
  });
});

describe("party templates", () => {
  const stacks = [
    { tier: 1, branch: null, count: 10 },
    { tier: 2, branch: null, count: 6 },
  ];

  it("saves and summarizes a template", () => {
    const t = saveTemplate("t1", "Skirmishers", stacks, 5);
    expect(templateSummary(t)).toMatch(/Skirmishers/);
    expect(t.entries).toHaveLength(2);
  });

  it("refit produces recruit orders for deficits", () => {
    const t = saveTemplate("t1", "Big", [...stacks, { tier: 3, branch: null, count: 4 }], 5);
    const orders = refitToward(t, stacks);
    expect(orders).toContainEqual({ action: "recruit", tier: 3, branch: null, count: 4 });
  });

  it("refit produces dismiss orders for surpluses, cheapest first", () => {
    const t = saveTemplate("t1", "Small", [{ tier: 1, branch: null, count: 4 }], 5);
    const orders = refitToward(t, stacks);
    const dismiss = orders.filter((o) => o.action === "dismiss");
    expect(dismiss[0]).toMatchObject({ tier: 1, count: 6 });
    // Tier 2 has no template entry: the whole stack is surplus.
    expect(dismiss).toContainEqual({ action: "dismiss", tier: 2, branch: null, count: 6 });
  });
});

describe("smithing stamina", () => {
  it("max stamina grows with crafting", () => {
    expect(maxStamina(10)).toBeGreaterThan(maxStamina(0));
    expect(maxStamina(0)).toBe(100);
  });

  it("exhaustion blocks work with a reason", () => {
    expect(checkStamina({ crafting: 0, stamina: 100 }, 50).ok).toBe(true);
    const blocked = checkStamina({ crafting: 0, stamina: 5 }, 50);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/exhausted/);
  });

  it("spending floors at zero; dawn refills", () => {
    expect(spendStamina({ crafting: 0, stamina: 10 }, 50)).toBe(0);
    expect(recoverStamina(5)).toBe(maxStamina(5));
  });

  it("forge costs scale with recipe size", () => {
    expect(forgeStaminaCost(3)).toBeGreaterThan(forgeStaminaCost(1));
  });
});

describe("influence economy", () => {
  it("gains scale with renown", () => {
    const low = influenceGain("battle-victory", 0, () => 0.5);
    const high = influenceGain("battle-victory", 100, () => 0.5);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it("spending fails without enough influence", () => {
    const broke = spendInfluence("muster-army", 5);
    expect(broke.ok).toBe(false);
    const rich = spendInfluence("muster-army", 100);
    expect(rich.ok).toBe(true);
    if (rich.ok) expect(rich.spent).toBe(INFLUENCE_COSTS["muster-army"]);
  });
});
