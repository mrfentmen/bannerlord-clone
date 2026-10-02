/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  ADULT_AGE,
  applyComingOfAge,
  checkComingOfAge,
  comingOfAgePanel,
  type ComingOfAgeEvent,
} from "../comingOfAge.js";
import type { ClanMember } from "../types.js";

function member(overrides: Partial<ClanMember> & { id: string; name: string }): ClanMember {
  return {
    gender: "m",
    birthYear: 2020,
    traits: [],
    skills: {},
    ...overrides,
  };
}

describe("coming-of-age events (solo task 9)", () => {
  it("fires when a child crosses adulthood between ticks", () => {
    const kid = member({ id: "k1", name: "Ari", birthYear: 2026 - 17 });
    const events = checkComingOfAge([kid], 2026, 2027);
    expect(events).toHaveLength(1);
    expect(events[0]!.memberId).toBe("k1");
    expect(events[0]!.name).toBe("Ari");
    expect(ADULT_AGE).toBe(18);
  });

  it("does not fire twice for the same child", () => {
    const kid = member({ id: "k1", name: "Ari", birthYear: 2026 - 18 });
    expect(checkComingOfAge([kid], 2026, 2027)).toHaveLength(0);
    expect(checkComingOfAge([kid], 2026, 2028)).toHaveLength(0);
  });

  it("skips dead members and young children", () => {
    const dead = member({ id: "d1", name: "Ghost", birthYear: 2026 - 17, deathYear: 2026 });
    const young = member({ id: "y1", name: "Pip", birthYear: 2026 - 5 });
    expect(checkComingOfAge([dead, young], 2026, 2027)).toHaveLength(0);
  });

  it("assigns the trait deterministically", () => {
    const kid = member({ id: "k1", name: "Ari", birthYear: 2026 - 17 });
    const a = checkComingOfAge([kid], 2026, 2027);
    const b = checkComingOfAge([kid], 2026, 2027);
    expect(a[0]!.trait).toBe(b[0]!.trait);
  });

  it("applies the trait to the member", () => {
    const kid = member({ id: "k1", name: "Ari", birthYear: 2026 - 17 });
    const map = new Map([[kid.id, kid]]);
    const [event] = checkComingOfAge([kid], 2026, 2027) as [ComingOfAgeEvent];
    expect(applyComingOfAge(map, event)).toBe(true);
    expect(kid.traits).toContain(event.trait);
    expect(applyComingOfAge(new Map(), event)).toBe(false);
  });

  it("panel names the new adults and dismisses", () => {
    const onDismiss = vi.fn();
    const el = comingOfAgePanel({
      events: [{ memberId: "k1", name: "Ari", trait: "brave" }],
      onDismiss,
    });
    expect(el.querySelector('[data-testid="coa-item-k1"]')?.textContent).toContain("Ari");
    expect(el.querySelector('[data-testid="coa-item-k1"]')?.textContent).toContain("brave");
    (el.querySelector('[data-testid="coa-dismiss"]') as HTMLButtonElement).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
