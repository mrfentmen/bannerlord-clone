/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { fileBorderIncident, raiseBorderIncident } from "../../../diplomacy/borderIncidents.js";
import { adjustRelation } from "../../../diplomacy/relationNotifications.js";

beforeEach(() => localStorage.clear());

describe("diplomacy panel (integration)", () => {
  it("answers a border incident and logs the relation change", () => {
    fileBorderIncident(raiseBorderIncident("skirmish", "f1", "The North"));
    document.body.innerHTML = "";
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    expect(document.body.textContent).toContain("The North");

    const overlookBtn = [...document.body.querySelectorAll("button")].find((b) =>
      b.getAttribute("data-testid")?.includes("-overlook-"),
    )!;
    overlookBtn.click();

    // The panel re-rendered with the outcome notice and the updated feed.
    expect(document.body.textContent).toContain("border stays quiet");
    const feed = document.body.querySelector("[data-testid='diplomacy-relations']");
    expect(feed).not.toBeNull();
    expect(feed!.textContent).toContain("border incident: overlook");
    document.body.innerHTML = "";
  });

  it("shows the reputation meter", () => {
    const root = diplomacyPanel({ currentSeason: 12 });
    expect(root.querySelector("[data-testid='diplomacy-reputation']")).not.toBeNull();
  });

  it("lists relation changes newest first", () => {
    adjustRelation("f1", "The North", -10, "raided their farms", 11);
    adjustRelation("f1", "The North", 5, "returned hostages", 12);
    const root = diplomacyPanel({ currentSeason: 12 });
    const feed = root.querySelector("[data-testid='diplomacy-relations']")!;
    const firstRow = feed.querySelector("tbody tr");
    expect(firstRow!.textContent).toContain("returned hostages");
  });

  it("shows the intro hint at most once per 10 minutes", () => {
    const first = diplomacyPanel({ currentSeason: 12 });
    expect(first.querySelector("[data-testid='hint-diplomacy-intro']")).not.toBeNull();
    const second = diplomacyPanel({ currentSeason: 12 });
    expect(second.querySelector("[data-testid='hint-diplomacy-intro']")).toBeNull();
  });

  it("shows empty states with nothing recorded", () => {
    const root = diplomacyPanel({ currentSeason: 12 });
    expect(root.textContent).toContain("Quiet borders");
    expect(root.textContent).toContain("No treaties");
  });
});

describe("diplomacy panel war goals (integration)", () => {
  it("declares a war goal and ticks weariness", () => {
    document.body.innerHTML = "";
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    expect(document.body.textContent).toContain("No declared wars");

    (document.body.querySelector('[data-testid="war-enemy-input"]') as HTMLInputElement).value = "The Ironborn";
    (document.body.querySelector('[data-testid="war-goal-select"]') as HTMLSelectElement).value = "conquest";
    (document.body.querySelector('[data-testid="war-declare"]') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain("The Ironborn");
    expect(document.body.textContent).toContain("conquest");

    (document.body.querySelector('[data-testid="war-tick"]') as HTMLButtonElement).click();
    const table = document.body.querySelector('[data-testid="diplomacy-wars"]')!;
    expect(table.textContent).toContain("8"); // conquest gains 8/season

    const end = [...document.body.querySelectorAll("button")].find((b) =>
      b.getAttribute("data-testid")?.startsWith("war-end-"),
    )!;
    end.click();
    expect(document.body.textContent).toContain("No declared wars");
    document.body.innerHTML = "";
  });
});
