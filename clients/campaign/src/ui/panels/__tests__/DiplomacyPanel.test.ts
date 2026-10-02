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

  it("shows empty states with nothing recorded", () => {
    const root = diplomacyPanel({ currentSeason: 12 });
    expect(root.textContent).toContain("Quiet borders");
    expect(root.textContent).toContain("No treaties");
  });
});
