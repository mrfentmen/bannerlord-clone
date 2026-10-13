/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  isMemorable,
  memorableTales,
  recordWarStory,
  tellTale,
  warStories,
} from "../warStories.js";

beforeEach(() => localStorage.clear());

const upset = {
  battleName: "Dust Bowl",
  playerWon: true,
  winChance: 0.2,
  playerLosses: 30,
  enemyLosses: 80,
  mvpName: "Longbows",
};

describe("war stories log (solo task 47)", () => {
  it("flags heroic upsets as memorable", () => {
    expect(isMemorable(upset)).toBe(true);
  });

  it("flags costly victories", () => {
    expect(isMemorable({ ...upset, winChance: 0.8, playerLosses: 90, enemyLosses: 40 })).toBe(true);
  });

  it("routine wins are not memorable", () => {
    expect(
      isMemorable({ battleName: "X", playerWon: true, winChance: 0.8, playerLosses: 10, enemyLosses: 80 }),
    ).toBe(false);
  });

  it("tells a narrative with the facts", () => {
    const tale = tellTale(upset);
    expect(tale).toContain("Dust Bowl");
    expect(tale).toContain("desperate odds");
    expect(tale).toContain("Longbows");
  });

  it("records and retrieves tales", () => {
    recordWarStory(upset);
    recordWarStory({ battleName: "Harbor", playerWon: true, winChance: 0.9, playerLosses: 5, enemyLosses: 60 });
    expect(warStories()).toHaveLength(2);
    expect(memorableTales()).toHaveLength(1);
    expect(memorableTales()[0]!.title).toBe("Dust Bowl");
  });
});
