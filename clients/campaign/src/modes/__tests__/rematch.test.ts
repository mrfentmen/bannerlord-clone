/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { canRematch, lastBattle, rematch, rememberBattle } from "../rematch.js";
import { generateSkirmish } from "../skirmish.js";

beforeEach(() => localStorage.clear());

describe("quick battle rematch (solo task 39)", () => {
  it("no rematch before any battle", () => {
    expect(canRematch()).toBe(false);
    expect(rematch()).toBeNull();
  });

  it("remembers and replays the same setup", () => {
    const config = generateSkirmish(4242);
    rememberBattle(config);
    expect(canRematch()).toBe(true);
    const again = rematch()!;
    expect(again.player).toEqual(config.player);
    expect(again.enemy).toEqual(config.enemy);
    expect(again.biome).toBe(config.biome);
    expect(again.modifiers).toEqual(config.modifiers);
  });

  it("fresh seed by default, same seed on request", () => {
    const config = generateSkirmish(4242);
    rememberBattle(config);
    const fresh = rematch()!;
    expect(typeof fresh.seed).toBe("number");
    const same = rematch(false)!;
    expect(same.seed).toBe(4242);
  });

  it("survives reload", () => {
    rememberBattle(generateSkirmish(11));
    expect(lastBattle()?.seed).toBe(11);
  });

  it("rejects corrupted stored setups", () => {
    localStorage.setItem("campaign.last-battle.v1", "{broken");
    expect(canRematch()).toBe(false);
  });
});
