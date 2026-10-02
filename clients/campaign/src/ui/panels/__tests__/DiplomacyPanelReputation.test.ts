/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import {
  REPUTATION_ACTIONS,
  REPUTATION_DRIFT,
  REPUTATION_EFFECTS,
} from "../../../diplomacy/reputation.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function legend(): HTMLElement {
  document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
  return document.body.querySelector<HTMLElement>('[data-testid="reputation-effects"]')!;
}

describe("diplomacy panel reputation effects (task 225)", () => {
  it("sits under the reputation meter", () => {
    const root = legend();
    expect(root).not.toBeNull();
    const body = document.body.textContent ?? "";
    expect(body.indexOf("Diplomatic reputation")).toBeLessThan(
      body.indexOf("What moves your reputation"),
    );
  });

  it("is a real disclosure, not a title attribute — tooltips are unreachable by keyboard", () => {
    const root = legend();
    expect(root.tagName).toBe("DETAILS");
    expect(root.querySelector("summary")!.textContent).toBe("What moves your reputation");
  });

  it("lists every action the reputation module defines, and no others", () => {
    const rows = [...legend().querySelectorAll(".reputation-legend__row")];
    expect(rows).toHaveLength(REPUTATION_ACTIONS.length);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(
      REPUTATION_ACTIONS.map((a) => `reputation-effect-${a}`),
    );
  });

  it("prints each action's weight from REPUTATION_EFFECTS, not a restated figure", () => {
    const root = legend();
    for (const action of REPUTATION_ACTIONS) {
      const effect = REPUTATION_EFFECTS[action];
      const row = root.querySelector(`[data-testid="reputation-effect-${action}"]`)!;
      const value = row.querySelector(".row__value")!.textContent;
      expect(value).toBe(effect >= 0 ? `gains ${effect}` : `costs ${Math.abs(effect)}`);
    }
  });

  it("names each action in a sentence rather than printing its slug", () => {
    const row = legend().querySelector('[data-testid="reputation-effect-broke-treaty"]')!;
    expect(row.textContent).toContain("Broke a treaty");
    expect(row.textContent).not.toContain("broke-treaty");
  });

  it("carries the direction in the word as well as the rule, so colour is not alone", () => {
    const root = legend();
    const down = root.querySelector('[data-testid="reputation-effect-betrayed-ally"]')!;
    const up = root.querySelector('[data-testid="reputation-effect-kept-treaty"]')!;
    expect(down.getAttribute("data-direction")).toBe("down");
    expect(up.getAttribute("data-direction")).toBe("up");
    expect(down.textContent).toContain("costs");
    expect(up.textContent).toContain("gains");
  });

  it("shows the betrayal as the worst thing on the list, because it is", () => {
    const worst = Math.min(...Object.values(REPUTATION_EFFECTS));
    expect(REPUTATION_EFFECTS["betrayed-ally"]).toBe(worst);
  });

  it("names the seasonal drift the reputation module applies", () => {
    expect(legend().textContent).toContain(`drifts ${REPUTATION_DRIFT} a season toward neutral`);
  });
});