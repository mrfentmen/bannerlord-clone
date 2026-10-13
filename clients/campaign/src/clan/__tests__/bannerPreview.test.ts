/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { bannerShieldSvg, shieldPreview } from "../bannerPreview.js";

const banner = { primary: "#b03030", secondary: "#e8d060", pattern: "chevron" as const, sigil: "star" as const };

describe("banner preview on troops (solo task 58)", () => {
  it("renders the banner inside a shield outline", () => {
    const svg = bannerShieldSvg(banner);
    expect(svg).toContain("<svg");
    expect(svg).toContain("clipPath");
    expect(svg).toContain(banner.primary);
    expect(svg).toContain(banner.secondary);
  });

  it("differs from the square banner", () => {
    const svg = bannerShieldSvg(banner);
    expect(svg).toContain("viewBox=\"0 0 100 120\"");
  });

  it("preview shows shields per unit kind", () => {
    const el = shieldPreview({ banner });
    expect(el.dataset.testid).toBe("shield-preview");
    expect(el.querySelector('[data-testid="shield-infantry"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="shield-archers"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="shield-cavalry"]')).not.toBeNull();
  });

  it("respects custom unit kinds", () => {
    const el = shieldPreview({ banner, unitKinds: ["skirmishers"] });
    expect(el.querySelector('[data-testid="shield-skirmishers"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="shield-infantry"]')).toBeNull();
  });
});
