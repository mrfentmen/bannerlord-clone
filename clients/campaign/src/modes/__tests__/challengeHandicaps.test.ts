import { describe, expect, it } from "vitest";
import { applyModifiers, CHALLENGE_MODIFIERS } from "../challenge.js";
import { generateSkirmish } from "../skirmish.js";

describe("challenge modifiers (solo task 37)", () => {
  it("catalog includes the outnumbered handicap", () => {
    const m = CHALLENGE_MODIFIERS.find((x) => x.id === "outnumbered");
    expect(m).toBeDefined();
    const config = generateSkirmish(5);
    const before = config.enemy.units.reduce((s, u) => s + u.count, 0);
    applyModifiers(config, ["outnumbered"]);
    const after = config.enemy.units.reduce((s, u) => s + u.count, 0);
    expect(after).toBeGreaterThan(before);
  });

  it("wounded start marks the player's force", () => {
    const config = generateSkirmish(5);
    applyModifiers(config, ["wounded-start"]);
    expect(config.playerWounded).toBe(0.25);
    expect(config.modifiers).toContain("wounded-start");
  });

  it("handicaps combine", () => {
    const config = generateSkirmish(5);
    applyModifiers(config, ["outnumbered", "wounded-start"]);
    expect(config.playerWounded).toBe(0.25);
    expect(config.modifiers).toEqual(["outnumbered", "wounded-start"]);
  });

  it("unknown modifiers throw with a reason", () => {
    const config = generateSkirmish(5);
    expect(() => applyModifiers(config, ["nope"])).toThrow("unknown challenge modifier");
  });
});
