import { describe, expect, it } from "vitest";
import { canCraft, craftKit, KIT_QUALITIES, KIT_RECIPES } from "../disguiseKits.js";

const rich = { cloth: 10, dye: 10, papers: 5, cosmetics: 5 };
const poor = { cloth: 1 };

describe("disguise kit crafting (solo task 63)", () => {
  it("has three quality tiers with rising bonuses", () => {
    expect(KIT_QUALITIES).toHaveLength(3);
    expect(KIT_RECIPES.crude.coverBonus).toBeLessThan(KIT_RECIPES.good.coverBonus);
    expect(KIT_RECIPES.good.coverBonus).toBeLessThan(KIT_RECIPES.masterwork.coverBonus);
  });

  it("crafts from resources and deducts the cost", () => {
    const r = craftKit("good", rich);
    expect(r.ok).toBe(true);
    expect(r.kit!.quality).toBe("good");
    expect(r.kit!.coverBonus).toBe(25);
    expect(r.stock!.cloth).toBe(rich.cloth - 4);
    expect(r.stock!.papers).toBe(rich.papers - 1);
  });

  it("refuses when resources are short, with a reason", () => {
    const r = craftKit("masterwork", poor);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not enough resources");
    expect(r.reason).toContain("cloth");
  });

  it("canCraft checks affordability", () => {
    expect(canCraft("crude", poor)).toBe(false);
    expect(canCraft("crude", { cloth: 2, dye: 1 })).toBe(true);
  });

  it("does not mutate the stockpile", () => {
    const stock = { ...rich };
    craftKit("good", stock);
    expect(stock).toEqual(rich);
  });

  it("unknown qualities fail", () => {
    expect(craftKit("legendary" as never, rich).ok).toBe(false);
  });
});
