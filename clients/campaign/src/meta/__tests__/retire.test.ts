/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { generateEpilogue, nextRetireState, type RetirementDeeds } from "../retire.js";
import { retirePanel } from "../retirePanel.js";

const deeds: RetirementDeeds = {
  clanName: "Fentmen",
  rulerName: "Del",
  daysElapsed: 300,
  battlesWon: 20,
  battlesLost: 5,
  townsControlled: 5,
  renown: 85,
};

describe("retirement (solo task 3)", () => {
  it("generates a deterministic epilogue from deeds", () => {
    const a = generateEpilogue(deeds);
    const b = generateEpilogue(deeds);
    expect(a).toEqual(b);
    expect(a.join(" ")).toContain("Del");
    expect(a.join(" ")).toContain("Fentmen");
    expect(a.join(" ")).toContain("Magnificent");
  });

  it("picks epithets by renown band", () => {
    expect(generateEpilogue({ ...deeds, renown: 10 }).join(" ")).toContain("Forgotten");
    expect(generateEpilogue({ ...deeds, renown: 50 }).join(" ")).toContain("Steadfast");
  });

  it("state machine requires arming before confirm", () => {
    expect(nextRetireState("idle", "confirm")).toBe("idle");
    expect(nextRetireState("idle", "arm")).toBe("armed");
    expect(nextRetireState("armed", "cancel")).toBe("idle");
    expect(nextRetireState("armed", "confirm")).toBe("done");
    expect(nextRetireState("done", "cancel")).toBe("done");
  });

  it("panel asks twice before retiring", () => {
    const onRetire = vi.fn();
    const el = retirePanel({ deeds: () => deeds, onRetire, onClose: () => {} });
    const btn = el.querySelector('[data-testid="retire-confirm"]') as HTMLButtonElement;
    btn.click(); // arms
    expect(onRetire).not.toHaveBeenCalled();
    expect(btn.textContent).toContain("Confirm retirement");
    btn.click(); // confirms
    expect(onRetire).toHaveBeenCalledTimes(1);
  });

  it("cancel disarms", () => {
    const onRetire = vi.fn();
    const el = retirePanel({ deeds: () => deeds, onRetire, onClose: () => {} });
    const btn = el.querySelector('[data-testid="retire-confirm"]') as HTMLButtonElement;
    btn.click();
    (el.querySelector('[data-testid="retire-cancel"]') as HTMLButtonElement).click();
    expect(btn.textContent).toBe("Retire this ruler");
    expect(onRetire).not.toHaveBeenCalled();
  });
});
