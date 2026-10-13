/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { evaluateDefeat, shouldAnnounceDefeat, type DefeatStanding } from "../defeat.js";
import { defeatPanel } from "../defeatPanel.js";

const standing = (living: number): DefeatStanding => ({
  livingMembers: living,
  clanName: "Fentmen",
  daysElapsed: 150,
  battlesWon: 8,
});

describe("campaign defeat (solo task 2)", () => {
  it("is not wiped out while members live", () => {
    const r = evaluateDefeat(standing(3));
    expect(r.wipedOut).toBe(false);
    expect(r.epitaph).toBe("");
  });

  it("is wiped out at zero living members with an epitaph", () => {
    const r = evaluateDefeat(standing(0));
    expect(r.wipedOut).toBe(true);
    expect(r.epitaph).toContain("Fentmen");
    expect(r.summaryLines.length).toBeGreaterThan(0);
  });

  it("announces exactly once", () => {
    expect(shouldAnnounceDefeat(standing(0), false)).toBe(true);
    expect(shouldAnnounceDefeat(standing(0), true)).toBe(false);
    expect(shouldAnnounceDefeat(standing(2), false)).toBe(false);
  });

  it("continue-as-heir is disabled without an heir", () => {
    const onHeir = vi.fn();
    const el = defeatPanel({
      standing: () => standing(0),
      hasHeir: () => false,
      onContinueAsHeir: onHeir,
      onNewCampaign: () => {},
      onTitle: () => {},
      onClose: () => {},
    });
    const btn = el.querySelector('[data-testid="defeat-continue-heir"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(onHeir).not.toHaveBeenCalled();
  });

  it("continue-as-heir works when an heir exists", () => {
    const onHeir = vi.fn();
    const onNew = vi.fn();
    const onTitle = vi.fn();
    const el = defeatPanel({
      standing: () => standing(0),
      hasHeir: () => true,
      onContinueAsHeir: onHeir,
      onNewCampaign: onNew,
      onTitle: onTitle,
      onClose: () => {},
    });
    (el.querySelector('[data-testid="defeat-continue-heir"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="defeat-new-campaign"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="defeat-to-title"]') as HTMLButtonElement).click();
    expect(onHeir).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onTitle).toHaveBeenCalledTimes(1);
  });
});
