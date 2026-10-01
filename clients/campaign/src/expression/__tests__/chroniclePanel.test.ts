/**
 * @vitest-environment jsdom
 *
 * Chronicle panel tests (Rowan).
 */

import { describe, expect, it, vi } from "vitest";
import { chroniclePanel, seasonForDay, type ChroniclePanelOptions } from "../chroniclePanel.js";
import type { ChronicleEvent, Oath } from "../chronicle.js";

function options(overrides: Partial<ChroniclePanelOptions> = {}): ChroniclePanelOptions {
  return {
    events: () => [],
    oath: () => null,
    setOath: () => {},
    currentSeason: () => 3,
    ...overrides,
  };
}

describe("seasonForDay", () => {
  it("maps 90-day blocks to seasons starting at 1", () => {
    expect(seasonForDay(0)).toBe(1);
    expect(seasonForDay(89)).toBe(1);
    expect(seasonForDay(90)).toBe(2);
    expect(seasonForDay(180)).toBe(3);
  });

  it("clamps negative days to season 1", () => {
    expect(seasonForDay(-5)).toBe(1);
  });
});

describe("chroniclePanel", () => {
  it("shows the empty state when no deeds are recorded", () => {
    const { root } = chroniclePanel(options());
    expect(root.getAttribute("data-testid")).toBe("chronicle-panel");
    expect(root.textContent).toContain("No history yet");
    expect(root.querySelectorAll('[data-testid="chronicle-chapter"]')).toHaveLength(0);
  });

  it("renders one chapter per season from the canonical digest", () => {
    const events: ChronicleEvent[] = [
      { season: 2, kind: "battle", text: "Won a battle." },
      { season: 1, kind: "treaty", text: "Signed a treaty." },
      { season: 2, kind: "building", text: "Raised a hall." },
    ];
    const { root } = chroniclePanel(options({ events: () => events }));
    const chapters = root.querySelectorAll('[data-testid="chronicle-chapter"]');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.textContent).toBe("Season 1: Signed a treaty.");
    expect(chapters[1]?.textContent).toBe("Season 2: Won a battle. Raised a hall.");
  });

  it("shows the sworn oath with its season", () => {
    const oath: Oath = { text: "We ride at dawn.", swornSeason: 2 };
    const { root } = chroniclePanel(options({ oath: () => oath }));
    expect(root.querySelector(".chronicle-oath__text")?.textContent).toBe("We ride at dawn.");
    expect(root.querySelector(".chronicle-oath__meta")?.textContent).toContain("season 2");
    expect(root.querySelector('[data-testid="swear-oath"]')?.textContent).toBe("Swear a new oath");
  });

  it("swearing an oath calls setOath with trimmed text and the current season", () => {
    const setOath = vi.fn();
    const { root } = chroniclePanel(options({ setOath, currentSeason: () => 5 }));
    const input = root.querySelector('[data-testid="oath-input"]') as HTMLInputElement;
    input.value = "  Never kneel.  ";
    (root.querySelector('[data-testid="swear-oath"]') as HTMLButtonElement).click();
    expect(setOath).toHaveBeenCalledTimes(1);
    expect(setOath.mock.calls[0]?.[0]).toEqual({ text: "Never kneel.", swornSeason: 5 });
  });

  it("shows an error and does not call setOath for a blank oath", () => {
    const setOath = vi.fn();
    const { root } = chroniclePanel(options({ setOath }));
    (root.querySelector('[data-testid="oath-input"]') as HTMLInputElement).value = "   ";
    (root.querySelector('[data-testid="swear-oath"]') as HTMLButtonElement).click();
    expect(setOath).not.toHaveBeenCalled();
    expect(root.querySelector(".chronicle-error")?.textContent).toContain("empty");
  });

  it("wires onClose to the panel close button", () => {
    const onClose = vi.fn();
    const { root } = chroniclePanel(options({ onClose }));
    (root.querySelector(".panel__close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
