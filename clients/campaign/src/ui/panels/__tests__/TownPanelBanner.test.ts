/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import { factionPalette } from "../../../design/factions.js";
import { BANNER_COLORS } from "../../../clan/bannerPalette.js";
import type { TownState } from "../../../data/types.js";

function town(): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Brooklyn",
    klass: "town",
    holderId: "h1",
    holderName: "Del",
    population: 1000,
    workers: 400,
    foodStock: 100,
    foodProduction: 50,
    foodDemand: 40,
    medicineStock: 10,
    sanitation: 0.6,
    infected: 0.01,
    crowding: 0.2,
    unrest: 0.1,
    loyalty: 0.7,
    security: 0.5,
    crimeRating: 0.15,
    culture: "american",
    holderCulture: "american",
    rebellious: false,
    prosperity: 0.6,
    taxRate: 0.2,
    stateTaxRate: 0.05,
    state: "NY",
    buildings: [],
    constructionBuilding: null,
    constructionDaysLeft: 0,
    garrison: 50,
    garrisonConduct: 0.6,
    roadSafety: 0.7,
    informationTrust: 0.6,
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables: [],
  } as TownState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    town: town(),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  } as Parameters<typeof townPanel>[0];
}

describe("town panel faction banner (task 101)", () => {
  it("names the town in the panel title", () => {
    const root = townPanel(options());
    expect(root.querySelector(".panel__title")!.textContent).toBe("Brooklyn");
  });

  it("draws no banner when the caller supplies no holding faction", () => {
    const root = townPanel(options());
    // `TownState` has no faction field, so an absent faction must read as absent
    // rather than being guessed from the holder's name or the state code.
    expect(root.querySelector('[data-testid="town-banner"]')).toBeNull();
    expect(root.textContent).toContain("Held by Del");
  });

  it("draws the banner from the locked faction palette when a faction is supplied", () => {
    const root = townPanel(options({ holderFaction: "Great Lakes Union" }));
    const banner = root.querySelector('[data-testid="town-banner"]')!;
    expect(banner).not.toBeNull();
    const field = banner.querySelector(".town-banner__field")!;
    expect(field.getAttribute("style")).toContain(
      `background:${factionPalette("off")["great-lakes-union"].color}`,
    );
    expect(banner.textContent).toContain("Great Lakes Union");
  });

  it("carries the faction in the accessible name, not only in the colour", () => {
    const root = townPanel(options({ holderFaction: "Pacific Compact" }));
    const banner = root.querySelector('[data-testid="town-banner"]')!;
    expect(banner.getAttribute("role")).toBe("img");
    expect(banner.getAttribute("aria-label")).toBe("Held by Pacific Compact");
    // The decorative cloth is hidden from assistive tech; the name beside it is not.
    expect(banner.querySelector(".town-banner__field")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows the colour-blind mode the app records on the root element", () => {
    document.documentElement.setAttribute("data-colorblind-mode", "deuteranopia");
    const root = townPanel(options({ holderFaction: "Great Lakes Union" }));
    expect(
      root.querySelector(".town-banner__field")!.getAttribute("style"),
    ).toContain(`background:${factionPalette("deuteranopia")["great-lakes-union"].color}`);
    document.documentElement.removeAttribute("data-colorblind-mode");
  });

  it("falls back to a stable clan colour for a name that is not a playable side", () => {
    const first = townPanel(options({ holderFaction: "Harbor Row Crew" }));
    const second = townPanel(options({ holderFaction: "Harbor Row Crew" }));
    const styleOf = (root: HTMLElement): string | null =>
      root.querySelector(".town-banner__field")!.getAttribute("style");
    const colours = BANNER_COLORS.map((c) => `background:${c}`);
    // Stable: the same name always wears the same cloth, so a clan's banner can be
    // recognised across panels. The specific pick is the palette's business.
    expect(styleOf(first)).toBe(styleOf(second));
    expect(colours).toContain(styleOf(first));
  });

  it("ignores a blank faction rather than drawing an unnamed banner", () => {
    const root = townPanel(options({ holderFaction: "   " }));
    expect(root.querySelector('[data-testid="town-banner"]')).toBeNull();
  });
});