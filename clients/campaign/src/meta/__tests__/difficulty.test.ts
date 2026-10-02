/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  DIFFICULTY_MODIFIERS,
  difficultyOptions,
  enemyDamage,
  moraleWithDifficulty,
  parseDifficulty,
  wageCost,
} from "../difficulty.js";
import { difficultySelector } from "../../ui/panels/DifficultySelector.js";

describe("campaign difficulty (solo task 6)", () => {
  it("easy lowers wages and raises morale; hard does the opposite", () => {
    expect(wageCost(100, "easy")).toBe(80);
    expect(wageCost(100, "hard")).toBe(125);
    expect(wageCost(100, "normal")).toBe(100);
    expect(moraleWithDifficulty(50, "easy")).toBe(60);
    expect(moraleWithDifficulty(50, "hard")).toBe(40);
    expect(enemyDamage(100, "easy")).toBe(85);
    expect(enemyDamage(100, "hard")).toBe(115);
  });

  it("clamps morale to 0-100 and wages to at least 1", () => {
    expect(moraleWithDifficulty(95, "easy")).toBe(100);
    expect(moraleWithDifficulty(5, "hard")).toBe(0);
    expect(wageCost(1, "easy")).toBe(1);
  });

  it("parses stored values safely", () => {
    expect(parseDifficulty("hard")).toBe("hard");
    expect(parseDifficulty("nightmare")).toBe("normal");
    expect(parseDifficulty(null)).toBe("normal");
  });

  it("describes all three options", () => {
    const opts = difficultyOptions();
    expect(opts.map((o) => o.id)).toEqual(["easy", "normal", "hard"]);
    for (const o of opts) {
      expect(o.description.length).toBeGreaterThan(10);
      expect(DIFFICULTY_MODIFIERS[o.id]).toBeTruthy();
    }
  });

  it("selector defaults to normal and reports selection", () => {
    const onSelect = vi.fn();
    const el = difficultySelector({ onSelect });
    expect(el.querySelector('[data-testid="difficulty-normal"]')?.getAttribute("aria-checked")).toBe("true");
    (el.querySelector('[data-testid="difficulty-hard"]') as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith("hard");
    expect(el.querySelector('[data-testid="difficulty-hard"]')?.getAttribute("aria-checked")).toBe("true");
    expect(el.querySelector('[data-testid="difficulty-normal"]')?.getAttribute("aria-checked")).toBe("false");
  });
});
