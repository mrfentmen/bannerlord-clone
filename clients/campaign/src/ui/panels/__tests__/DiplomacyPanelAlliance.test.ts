/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { adjustRelation } from "../../../diplomacy/relationNotifications.js";
import { allianceAcceptOdds, negotiateRound } from "../../../diplomacy/negotiation.js";
import { diplomaticReputation, recordReputationAction } from "../../../diplomacy/reputation.js";

const GLU = { id: "great-lakes-union", name: "Great Lakes Union" };
const PC = { id: "pacific-compact", name: "Pacific Compact" };

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function panel(factions: { id: string; name: string }[] = [GLU, PC]): void {
  document.body.appendChild(diplomacyPanel({ currentSeason: 12, factions }));
}

function select(id: string): HTMLInputElement {
  return document.body.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!;
}

function field(id: string): HTMLInputElement {
  return document.body.querySelector<HTMLInputElement>(`#${id}`)! as HTMLInputElement;
}

function read(): void {
  (document.body.querySelector('[data-testid="alliance-read"]') as HTMLButtonElement).click();
}

function oddsText(): string {
  return document.body.querySelector('[data-testid="alliance-odds"]')!.textContent ?? "";
}

function counterText(): string {
  return document.body.querySelector('[data-testid="alliance-counter"]')!.textContent ?? "";
}

describe("diplomacy propose alliance (task 210)", () => {
  it("draws no alliance block without a faction roster to propose to", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    expect(document.body.querySelector('[data-testid="diplomacy-alliance"]')).toBeNull();
  });

  it("offers every faction in the roster", () => {
    panel();
    const options = [...select("alliance-faction").querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Great Lakes Union", "Pacific Compact"]);
  });

  it("prices the offer with allianceAcceptOdds, not with a second opinion", () => {
    adjustRelation(GLU.id, GLU.name, -30, "raided their farms", 12);
    panel();
    field("alliance-demand").value = "40";
    field("alliance-terms").value = "Mutual defence, Shared ports";
    read();
    const expected = allianceAcceptOdds(-30, 40, diplomaticReputation());
    expect(oddsText()).toContain(`${Math.round(expected * 100)}%`);
  });

  it("raises the odds with a better standing and lowers them with a bigger demand", () => {
    adjustRelation(GLU.id, GLU.name, 40, "returned hostages", 12);
    panel();
    field("alliance-demand").value = "20";
    field("alliance-terms").value = "Mutual defence";
    read();
    const warm = oddsText();

    field("alliance-demand").value = "90";
    read();
    const greedy = oddsText();
    expect(Number(greedy.match(/(\d+)%/)?.[1])).toBeLessThan(Number(warm.match(/(\d+)%/)?.[1]));
  });

  it("says a bad reputation costs the offer", () => {
    panel();
    field("alliance-demand").value = "20";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(oddsText()).toContain(`reputation of ${diplomaticReputation()}/100`);
  });

  it("refuses a demand outside 0-100 rather than pricing it", () => {
    panel();
    field("alliance-demand").value = "150";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(oddsText()).toBe("A demand is 0 to 100.");
  });

  it("refuses an alliance with no terms", () => {
    panel();
    field("alliance-demand").value = "20";
    field("alliance-terms").value = "   ";
    read();
    expect(oddsText()).toBe("An alliance needs at least one term.");
  });

  it("records nothing: reading the odds is not sending the offer", () => {
    panel();
    field("alliance-demand").value = "20";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(document.body.textContent).toContain("nothing here records a signed alliance");
    // No alliance kind was signed into any store.
    expect(Object.keys(localStorage).some((k) => /deal|alliance/i.test(k))).toBe(false);
  });

  it("does not move reputation — an alliance is not an honour kept yet", () => {
    recordReputationAction("kept-treaty");
    const before = diplomaticReputation();
    panel();
    field("alliance-demand").value = "20";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(diplomaticReputation()).toBe(before);
  });
});

describe("diplomacy alliance requirements (task 211)", () => {
  it("names the terms on the table, in full", () => {
    panel();
    field("alliance-demand").value = "30";
    field("alliance-terms").value = "Mutual defence, Shared ports, No raids";
    read();
    expect(counterText()).toContain("Mutual defence; Shared ports; No raids");
  });

  it("shows where the counter-offer lands, using the module's own counter", () => {
    adjustRelation(GLU.id, GLU.name, 10, "traded at the border", 12);
    panel();
    field("alliance-demand").value = "80";
    field("alliance-terms").value = "Mutual defence";
    read();
    const round = negotiateRound(
      { from: "you", to: GLU.id, terms: ["Mutual defence"], demand: 80 },
      1,
      10,
      diplomaticReputation(),
      0,
    );
    expect(counterText()).toContain(`Against a demand of ${round.offer.demand}`);
    expect(counterText()).toContain(`counter at ${round.counter.demand}`);
  });

  it("quotes the standing it used, so the number is traceable", () => {
    adjustRelation(GLU.id, GLU.name, -40, "closed the border", 12);
    panel();
    field("alliance-demand").value = "30";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(oddsText()).toContain("standing of -40");
  });

  it("clears the counter line when the inputs are refused", () => {
    panel();
    field("alliance-demand").value = "30";
    field("alliance-terms").value = "Mutual defence";
    read();
    expect(counterText()).not.toBe("");
    field("alliance-demand").value = "500";
    read();
    // A stale counter from a valid read would describe an offer that no longer exists.
    expect(counterText()).toBe("Their counter-offer appears here once the odds are read.");
  });

  it("says nothing about an alliance when the roster is empty", () => {
    panel([]);
    const section = document.body.querySelector('[data-testid="diplomacy-alliance"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("Nobody to propose to");
  });
});