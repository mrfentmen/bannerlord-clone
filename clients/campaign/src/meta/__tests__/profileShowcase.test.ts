import { describe, expect, it } from "vitest";
import { buildShowcase, parseShowcaseCode, type ProfileShowcase } from "../profileShowcase.js";

const profile = (): ProfileShowcase => ({
  playerName: "Del",
  clanName: "Fentmen",
  rank: "Warlord",
  seasonsPlayed: 42,
  battlesWon: 30,
  coinEarned: 120000,
  achievementsUnlocked: 25,
  achievementsTotal: 52,
  reputationTitle: "Honored",
});

describe("player profile showcase (solo task 100)", () => {
  it("builds a shareable summary card", () => {
    const card = buildShowcase(profile());
    expect(card.card).toContain("Del of Fentmen");
    expect(card.card).toContain("Warlord");
    expect(card.card).toContain("30 battles won");
    expect(card.card).toContain("25/52");
    expect(card.shareCode.length).toBeGreaterThan(0);
  });

  it("round-trips through the share code", () => {
    const card = buildShowcase(profile());
    const parsed = parseShowcaseCode(card.shareCode);
    expect(parsed).toEqual(profile());
  });

  it("share codes are URL-safe", () => {
    const { shareCode } = buildShowcase(profile());
    expect(shareCode).not.toMatch(/[+/=]/);
  });

  it("rejects bad share codes", () => {
    expect(() => parseShowcaseCode("!!!")).toThrow("invalid showcase share code");
    expect(() => parseShowcaseCode(btoa("42"))).toThrow("invalid showcase share code");
  });

  it("works in the browser (no Buffer)", () => {
    // atob/btoa/TextEncoder are browser globals; this runs in node too.
    const card = buildShowcase({ ...profile(), playerName: "Zoë ñ" });
    expect(parseShowcaseCode(card.shareCode).playerName).toBe("Zoë ñ");
  });
});
