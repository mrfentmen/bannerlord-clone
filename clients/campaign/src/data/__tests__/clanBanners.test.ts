/**
 * Clan banner system tests (del order 2026-10-04).
 */

import { describe, expect, it } from "vitest";
import {
  BANNER_SHAPES,
  BANNER_SYMBOLS,
  BANNER_PALETTES,
  buildClanBanner,
  shapeAssetUrl,
  symbolAssetUrl,
  bannerForEthnicity,
  ETHNICITY_BANNERS,
} from "../clanBanners.js";

describe("clan banners", () => {
  it("has 6 shapes", () => {
    expect(BANNER_SHAPES.length).toBe(6);
  });

  it("has 76 symbols (40 icons + 36 letters/numbers)", () => {
    expect(BANNER_SYMBOLS.length).toBe(76);
  });

  it("has 8 palettes", () => {
    expect(Object.keys(BANNER_PALETTES).length).toBe(8);
  });

  it("builds a banner from components", () => {
    const banner = buildClanBanner("heater", "wolf", "crimsonGold");
    expect(banner.shape).toBe("heater");
    expect(banner.symbol).toBe("wolf");
    expect(banner.primaryColor).toBe("#8B0000");
    expect(banner.secondaryColor).toBe("#FFD700");
  });

  it("generates asset URLs", () => {
    expect(shapeAssetUrl("rectangle")).toBe("/banners/shapes/shape-rectangle.webp");
    expect(symbolAssetUrl("wolf")).toBe("/banners/symbols/symbol-wolf.webp");
  });

  it("has ethnicity default banners for all 9 cultures", () => {
    const ethnicities = ["italian", "irish", "chinese", "korean", "african", "jamaican", "mexican", "german", "russian"];
    for (const eth of ethnicities) {
      const banner = bannerForEthnicity(eth);
      expect(banner.shape).toBeDefined();
      expect(banner.symbol).toBeDefined();
      expect(ETHNICITY_BANNERS[eth]).toBeDefined();
    }
  });
});
