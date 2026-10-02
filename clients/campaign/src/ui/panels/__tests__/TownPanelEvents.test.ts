/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { Notification, TownState } from "../../../data/types.js";

function town(): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Red Hook",
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

function notice(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "e1",
    day: 40,
    priority: "important",
    text: "Garrison conduct fell this week.",
    entityId: "t1",
    field: "garrisonConduct",
    ...overrides,
  };
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

describe("town panel recent events (task 138)", () => {
  it("draws no events section when the caller supplies no feed", () => {
    const root = townPanel(options());
    // "No feed" and "nothing happened" are different claims; only the second may
    // print an empty state, so the whole section is absent without a feed.
    expect(root.querySelector('[data-testid="town-events"]')).toBeNull();
  });

  it("prints the simulation's own sentences and the day each happened", () => {
    const root = townPanel(options({ notifications: [notice()] }));
    const item = root.querySelector('[data-testid="town-event-e1"]')!;
    expect(item.textContent).toContain("Garrison conduct fell this week.");
    expect(root.querySelector('[data-testid="town-event-day-e1"]')!.textContent).toBe("Day 40");
  });

  it("shows only this town's events", () => {
    const root = townPanel(
      options({
        notifications: [
          notice(),
          notice({ id: "other", entityId: "t2", text: "Somewhere else, a bridge fell." }),
          notice({ id: "world", entityId: null, text: "The season turned." }),
        ],
      }),
    );
    expect(root.textContent).toContain("Garrison conduct fell this week.");
    expect(root.textContent).not.toContain("a bridge fell");
    expect(root.textContent).not.toContain("The season turned");
    expect(root.querySelectorAll(".event")).toHaveLength(1);
  });

  it("orders newest first", () => {
    const root = townPanel(
      options({
        notifications: [
          notice({ id: "old", day: 12, text: "Older news." }),
          notice({ id: "new", day: 44, text: "Newer news." }),
          notice({ id: "mid", day: 30, text: "Middle news." }),
        ],
      }),
    );
    const ids = [...root.querySelectorAll(".event")].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["town-event-new", "town-event-mid", "town-event-old"]);
  });

  it("carries priority as a status chip, so the glyph and word carry it too", () => {
    const root = townPanel(
      options({
        notifications: [
          notice({ id: "crit", priority: "critical", text: "The store is empty." }),
          notice({ id: "info", priority: "informational", text: "A new road opened." }),
        ],
      }),
    );
    expect(
      root.querySelector('[data-testid="town-event-chip-crit"]')!.getAttribute("data-status"),
    ).toBe("critical");
    const infoChip = root.querySelector('[data-testid="town-event-chip-info"]')!;
    expect(infoChip.getAttribute("data-status")).toBe("info");
    expect(infoChip.getAttribute("aria-label")).toContain("For information");
  });

  it("offers Why for an event that names a field, wired to the caller's handler", () => {
    const onWhy = vi.fn();
    const root = townPanel(options({ notifications: [notice()], onWhy }));
    (root.querySelector('[data-testid="why-garrisonConduct"]') as HTMLButtonElement).click();
    expect(onWhy).toHaveBeenCalledWith("garrisonConduct");
  });

  it("draws no Why affordance for an event that names no field", () => {
    const root = townPanel(options({ notifications: [notice({ field: null })] }));
    const item = root.querySelector('[data-testid="town-event-e1"]')!;
    expect(item.querySelector(".why__disclose")).toBeNull();
  });

  it("says nothing has happened only when a feed was actually supplied", () => {
    const root = townPanel(options({ notifications: [] }));
    const section = root.querySelector('[data-testid="town-events"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("Nothing has changed here");
  });

  it("caps the list so a busy town cannot push the actions off the panel", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      notice({ id: `n${i}`, day: 100 - i, text: `Event ${i}.` }),
    );
    const root = townPanel(options({ notifications: many }));
    const rows = root.querySelectorAll(".event");
    expect(rows.length).toBe(8);
    // The newest survives the cut.
    expect(rows[0]!.textContent).toContain("Event 0.");
  });
});