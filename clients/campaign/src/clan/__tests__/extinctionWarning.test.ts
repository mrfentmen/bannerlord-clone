/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { checkExtinctionRisk, extinctionWarningPanel } from "../extinctionWarning.js";
import type { ClanMember } from "../types.js";

function member(overrides: Partial<ClanMember> & { id: string; name: string }): ClanMember {
  return { gender: "m", birthYear: 2000, traits: [], skills: {}, ...overrides };
}

describe("clan extinction warning (solo task 10)", () => {
  it("returns null for a healthy clan", () => {
    const members = ["a", "b", "c"].map((id) => member({ id, name: id }));
    expect(checkExtinctionRisk(members, 2026)).toBeNull();
  });

  it("warns at two living members with marriage and heir hints", () => {
    const members = [
      member({ id: "a", name: "Del", birthYear: 2000 }),
      member({ id: "b", name: "Sam", birthYear: 2002 }),
    ];
    const w = checkExtinctionRisk(members, 2026)!;
    expect(w).not.toBeNull();
    expect(w.livingCount).toBe(2);
    expect(w.hints.map((h) => h.id)).toContain("marry");
    expect(w.hints.map((h) => h.id)).toContain("recruit");
    expect(w.hints.map((h) => h.id)).toContain("heir");
    expect(w.hints.find((h) => h.id === "marry")!.detail).toContain("Del");
  });

  it("uses the last-of-the-line headline for a single survivor", () => {
    const members = [member({ id: "a", name: "Del", birthYear: 2000, spouseId: "gone" })];
    const w = checkExtinctionRisk(members, 2026)!;
    expect(w.livingCount).toBe(1);
    // married, so no marry hint; no child, so heir hint stays
    expect(w.hints.map((h) => h.id)).not.toContain("marry");
    expect(w.hints.map((h) => h.id)).toContain("heir");
    const el = extinctionWarningPanel({ warning: w, onDismiss: () => {} });
    expect(el.querySelector('[data-testid="extw-headline"]')?.textContent).toBe("Last of the line");
    expect(el.getAttribute("role")).toBe("alert");
  });

  it("drops the heir hint when a child exists", () => {
    const members = [
      member({ id: "a", name: "Del", birthYear: 2000 }),
      member({ id: "b", name: "Kid", birthYear: 2020, fatherId: "a" }),
    ];
    const w = checkExtinctionRisk(members, 2026)!;
    expect(w.hints.map((h) => h.id)).not.toContain("heir");
  });

  it("panel lists hints and dismisses", () => {
    const onDismiss = vi.fn();
    const w = checkExtinctionRisk([member({ id: "a", name: "Del", birthYear: 2000 })], 2026)!;
    const el = extinctionWarningPanel({ warning: w, onDismiss });
    expect(el.querySelector('[data-testid="extw-hint-marry"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="extw-hint-recruit"]')).not.toBeNull();
    (el.querySelector('[data-testid="extw-dismiss"]') as HTMLButtonElement).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
