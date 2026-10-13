/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { suggestTribute } from "../../../diplomacy/tributeCalculator.js";
import { diplomaticReputation } from "../../../diplomacy/reputation.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function read(): { line: string; payable: string; amount: string } {
  const root = document.body;
  return {
    line: root.querySelector('[data-testid="tribute-suggestion"]')!.textContent ?? "",
    payable: root.querySelector('[data-testid="tribute-payable"]')!.textContent ?? "",
    amount: (root.querySelector("#tribute-amount") as HTMLInputElement).value,
  };
}

function set(id: string, value: string): void {
  (document.querySelector(`#${id}`) as HTMLInputElement).value = value;
}

function press(): void {
  (document.querySelector('[data-testid="tribute-read"]') as HTMLButtonElement).click();
}

describe("diplomacy panel tribute (task 214)", () => {
  it("draws the tribute section with the calculator's own line after a read", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "3000");
    set("tribute-their-power", "1000");
    set("tribute-income", "2000");
    press();
    const expected = suggestTribute(3000, 1000, 2000);
    expect(read().line).toBe(expected.line);
    expect(read().line).toContain("stronger power");
  });

  it("prices the demand from the power differential, not from a constant", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "3000");
    set("tribute-their-power", "1000");
    set("tribute-income", "2000");
    press();
    expect(read().amount).toBe(String(suggestTribute(3000, 1000, 2000).amount));
    expect(Number(read().amount)).toBeGreaterThan(0);
  });

  it("says who pays, from the calculator, and not from the panel", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    // The stronger side is you.
    set("tribute-your-power", "4000");
    set("tribute-their-power", "500");
    set("tribute-income", "1000");
    press();
    expect(read().line).toContain("Demand");

    // The stronger side is them: the panel must not keep saying "demand".
    set("tribute-your-power", "500");
    set("tribute-their-power", "4000");
    set("tribute-income", "1000");
    press();
    expect(read().line).toContain("Offer");
  });

  it("leaves the amount at zero when the powers are balanced", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "1000");
    set("tribute-their-power", "1000");
    set("tribute-income", "1000");
    press();
    expect(read().line).toBe(suggestTribute(1000, 1000, 1000).line);
    expect(read().amount).toBe("0");
  });

  it("refuses negative power and non-positive income rather than pricing them", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "-5");
    set("tribute-their-power", "100");
    set("tribute-income", "1000");
    press();
    expect(read().line).toBe("Power scores cannot be negative.");
    expect(read().payable).toBe("Nothing is payable until the calculator names an amount.");

    set("tribute-your-power", "100");
    set("tribute-their-power", "100");
    set("tribute-income", "0");
    press();
    expect(read().line).toContain("Income has to be positive");
  });

  it("says nothing is payable until the calculator has named a figure", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    expect(read().payable).toContain("Nothing is payable until the calculator names an amount");
  });

  it("keeps the amount editable, because the player decides what to send", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "3000");
    set("tribute-their-power", "1000");
    set("tribute-income", "2000");
    press();
    const field = document.querySelector("#tribute-amount") as HTMLInputElement;
    expect(field.disabled).toBe(false);
    field.value = "500";
    expect((document.querySelector("#tribute-amount") as HTMLInputElement).value).toBe("500");
    // Editing the figure must not rewrite the calculator's own advice.
    expect(read().line).toBe(suggestTribute(3000, 1000, 2000).line);
  });

  it("does not record a payment — the panel prices, it does not settle", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    set("tribute-your-power", "3000");
    set("tribute-their-power", "1000");
    set("tribute-income", "2000");
    press();
    // A paid tribute would move reputation ("paid-tribute" is one of its actions).
    // Nothing here touches it: the panel prices a demand, it does not settle one.
    expect(document.body.textContent).toContain("Nothing here records a payment.");
    expect(diplomaticReputation()).toBe(50);
    expect(
      Object.keys(localStorage).some((key) => key.includes("tribute")),
    ).toBe(false);
  });
});