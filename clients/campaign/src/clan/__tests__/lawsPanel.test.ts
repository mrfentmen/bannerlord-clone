/**
 * @vitest-environment jsdom
 *
 * Clan laws panel tests (MASTER_PLAN task 82).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { lawsPanel, type LawsRoster } from "../lawsPanel.js";
import { DEFAULT_LAWS, type ClanLaws, type ClanMember } from "../types.js";

function member(over: Partial<ClanMember> = {}): ClanMember {
  return {
    id: "m1",
    name: "Rowan of the Fent",
    gender: "m",
    birthYear: 1000,
    traits: [],
    skills: { command: 80, charm: 40 },
    ...over,
  };
}

/** Ruler with two living children: eldest born 1020, youngest born 1030. */
function roster(): LawsRoster {
  return {
    rulerId: "ruler",
    members: [
      member({ id: "ruler", name: "The Ruler", birthYear: 1000, skills: { command: 90, charm: 90 } }),
      member({ id: "eldest", name: "Eldest Child", birthYear: 1020, fatherId: "ruler" }),
      member({ id: "youngest", name: "Youngest Child", birthYear: 1030, fatherId: "ruler" }),
    ],
  };
}

function setup(over: Partial<Parameters<typeof lawsPanel>[0]> = {}) {
  let laws: ClanLaws = { ...DEFAULT_LAWS };
  const onChange = vi.fn((next: ClanLaws) => {
    laws = next;
  });
  const onReset = vi.fn(() => {
    laws = { ...DEFAULT_LAWS };
  });
  const panel = lawsPanel({
    laws: () => laws,
    onChange,
    onReset,
    roster,
    holdings: () => ["New York", "Los Angeles"],
    onClose: () => {},
    ...over,
  });
  document.body.appendChild(panel.root);
  return { panel, onChange, onReset, get laws() { return laws; }, setLaws: (l: ClanLaws) => { laws = l; } };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("clan laws panel", () => {
  it("renders all four inheritance laws and all three marriage policies", () => {
    setup();
    for (const id of ["primogeniture", "ultimogeniture", "partible", "elective"]) {
      expect(document.querySelector(`[data-testid="law-inheritance-${id}"]`)).not.toBeNull();
    }
    for (const id of ["alliance-first", "love-match", "dowry-first"]) {
      expect(document.querySelector(`[data-testid="law-marriage-${id}"]`)).not.toBeNull();
    }
  });

  it("checks the currently active laws", () => {
    setup();
    const inherit = document.querySelector<HTMLInputElement>('[data-testid="law-inheritance-primogeniture"]');
    const marriage = document.querySelector<HTMLInputElement>('[data-testid="law-marriage-alliance-first"]');
    expect(inherit?.checked).toBe(true);
    expect(marriage?.checked).toBe(true);
  });

  it("changing the inheritance law fires onChange and re-renders the heir", () => {
    const { panel, onChange } = setup();
    const radio = document.querySelector<HTMLInputElement>('[data-testid="law-inheritance-ultimogeniture"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ inheritance: "ultimogeniture", marriagePolicy: "alliance-first" });
    // Ultimogeniture names the youngest; the outlook re-rendered with it.
    const heir = panel.root.querySelector('[data-testid="succession-heir"]')?.textContent ?? "";
    expect(heir).toContain("Youngest Child");
  });

  it("shows the realm split under partible law (laws affect outcomes)", () => {
    const { setLaws, panel } = setup();
    setLaws({ inheritance: "partible", marriagePolicy: "alliance-first" });
    panel.refresh();
    const rows = [...panel.root.querySelectorAll('[data-testid="succession-split-row"]')];
    expect(rows).toHaveLength(2);
    const text = rows.map((r) => r.textContent ?? "").join(" ");
    // Round-robin, eldest first: New York -> Eldest Child, Los Angeles -> Youngest Child.
    expect(text).toContain("New York");
    expect(text).toContain("Eldest Child");
    expect(text).toContain("Youngest Child");
  });

  it("names the eldest heir under primogeniture", () => {
    const { panel } = setup();
    const heir = panel.root.querySelector('[data-testid="succession-heir"]')?.textContent ?? "";
    expect(heir).toContain("Eldest Child");
  });

  it("shows an honest empty state when no clan roster is recorded", () => {
    setup({ roster: () => null });
    const outlook = document.querySelector('[data-testid="succession-outlook"]')?.textContent ?? "";
    expect(outlook).toContain("No clan roster recorded");
    expect(outlook).not.toContain("Eldest Child");
  });

  it("reset is two-step and restores the ancient laws", () => {
    const { setLaws, onReset, panel } = setup();
    setLaws({ inheritance: "elective", marriagePolicy: "dowry-first" });
    panel.refresh();
    const confirm = document.querySelector<HTMLElement>('[data-testid="laws-reset-confirm"]')!;
    const confirmBox = confirm.parentElement!;
    expect(confirmBox.hidden).toBe(true);
    document.querySelector<HTMLElement>('[data-testid="laws-reset"]')!.click();
    expect(confirmBox.hidden).toBe(false);
    confirm.click();
    expect(onReset).toHaveBeenCalled();
    // After reset the primogeniture radio is checked again.
    const radio = document.querySelector<HTMLInputElement>('[data-testid="law-inheritance-primogeniture"]')!;
    expect(radio.checked).toBe(true);
  });

  it("exposes accessible labels on the radios", () => {
    setup();
    const radios = [...document.querySelectorAll('input[type="radio"]')];
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio.getAttribute("aria-label") ?? radio.textContent).toBeTruthy();
    }
  });
});
