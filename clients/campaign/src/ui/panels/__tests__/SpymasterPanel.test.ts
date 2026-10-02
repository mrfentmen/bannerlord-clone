/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { spymasterPanel } from "../SpymasterPanel.js";
import { fileAlert, raiseAlert } from "../../../espionage/spyAlerts.js";
import { placeSpy } from "../../../espionage/roster.js";

beforeEach(() => localStorage.clear());

describe("spymaster panel (integration)", () => {
  it("places a spy and assigns a mission", () => {
    document.body.innerHTML = "";
    document.body.appendChild(spymasterPanel({ currentDay: 100 }));
    const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    (q("spy-name-input") as HTMLInputElement).value = "Rook";
    (q("spy-post-input") as HTMLInputElement).value = "kings-landing";
    (q("spy-place") as HTMLButtonElement).click();

    const table = q("spymaster-spies");
    expect(table).not.toBeNull();
    expect(table!.textContent).toContain("Rook");

    const spyId = [...table!.querySelectorAll("[data-testid^='spy-assign-']")][0]!
      .getAttribute("data-testid")!.replace("spy-assign-", "");
    const select = q(`spy-mission-select-${spyId}`) as HTMLSelectElement;
    select.value = "sabotage";
    (q(`spy-assign-${spyId}`) as HTMLButtonElement).click();

    expect(document.body.textContent).toContain("sabotage");
    expect(document.body.textContent).toContain("day 114");
    document.body.innerHTML = "";
  });

  it("shows enemy spy alerts and answers them", () => {
    placeSpy({ id: "s1", name: "Rook", post: "kings-landing", cover: 60, skill: 5 });
    fileAlert(raiseAlert("Varys", "kings-landing", "King's Landing", 80));

    const root = spymasterPanel({ currentDay: 100 });
    const cards = root.querySelectorAll("[data-testid^='spy-alert-']");
    expect(cards.length).toBeGreaterThan(0);
    expect(root.textContent).toContain("Varys");

    const arrestBtn = [...root.querySelectorAll("button")].find((b) =>
      b.getAttribute("data-testid")?.includes("-arrest-"),
    )!;
    arrestBtn.click();
    expect(root.textContent).toMatch(/rots in a cell|slipped the arrest/);
  });

  it("shows empty states with no spies or alerts", () => {
    const root = spymasterPanel({ currentDay: 100 });
    expect(root.textContent).toContain("No spies placed");
    expect(root.textContent).toContain("No alerts");
  });
});
