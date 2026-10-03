/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { markTerm, signTreaty } from "../../../diplomacy/treaties.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function panel(): void {
  document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
}

describe("diplomacy treaty terms (task 228)", () => {
  it("lists no terms when no treaty is signed", () => {
    panel();
    expect(document.body.querySelector('[data-testid="diplomacy-treaties"]')).toBeNull();
    expect(document.body.querySelector(".treaty-terms")).toBeNull();
  });

  it("prints each term's text, not just a count of broken ones", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids across the border", party: "them" },
      { text: "Open the crossing at Red Hook", party: "us" },
    ]);
    panel();
    const card = document.body.querySelector(`[data-testid="treaty-terms-${treaty.id}"]`)!;
    expect(card.textContent).toContain("No raids across the border");
    expect(card.textContent).toContain("Open the crossing at Red Hook");
  });

  it("names whose obligation each term is, in words rather than as a storage value", () => {
    const treaty = signTreaty("Trade pact", "glu", "Great Lakes Union", 12, [
      { text: "They stop the raids", party: "them" },
      { text: "We open the crossing", party: "us" },
    ]);
    panel();
    const card = document.body.querySelector(`[data-testid="treaty-terms-${treaty.id}"]`)!;
    expect(card.textContent).toContain("Theirs");
    expect(card.textContent).toContain("Your obligation");
    expect(card.textContent).not.toMatch(/party: (us|them)/);
  });

  it("distinguishes a term nobody has reported on from one that is being kept", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids", party: "them" },
    ]);
    panel();
    const term = document.body.querySelector(`[data-testid="treaty-term-${treaty.terms[0]!.id}"]`)!;
    // A fresh treaty is pending, and printing that as "kept" would be a lie.
    expect(term.getAttribute("data-term-status")).toBe("pending");
    expect(term.textContent).toContain("Not yet reported");
    expect(term.textContent).not.toContain("Kept");
  });

  it("says a term is broken once it has been, and never calls it kept", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids", party: "them" },
    ]);
    markTerm(treaty.id, treaty.terms[0]!.id, false);
    panel();
    const term = document.body.querySelector(`[data-testid="treaty-term-${treaty.terms[0]!.id}"]`)!;
    expect(term.getAttribute("data-term-status")).toBe("broken");
    expect(term.textContent).toContain("Broken");
  });

  it("reports the seasons a kept term has stood", () => {
    const treaty = signTreaty("Trade pact", "glu", "Great Lakes Union", 12, [
      { text: "Open the crossing", party: "us" },
    ]);
    markTerm(treaty.id, treaty.terms[0]!.id, true);
    panel();
    const term = document.body.querySelector(`[data-testid="treaty-term-${treaty.terms[0]!.id}"]`)!;
    expect(term.getAttribute("data-term-status")).toBe("kept");
    expect(term.textContent).toContain("Kept");
  });

  it("says in the summary whether the treaty is strained, and how many terms", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids", party: "them" },
      { text: "Open the crossing", party: "us" },
    ]);
    markTerm(treaty.id, treaty.terms[0]!.id, false);
    panel();
    const card = document.body.querySelector(`[data-testid="treaty-terms-${treaty.id}"]`)!;
    expect(card.getAttribute("data-under-strain")).toBe("true");
    expect(card.querySelector("summary")!.textContent).toContain("1 term broken");
  });

  it("uses the plural for more than one broken term", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids", party: "them" },
      { text: "Open the crossing", party: "us" },
    ]);
    markTerm(treaty.id, treaty.terms[0]!.id, false);
    markTerm(treaty.id, treaty.terms[1]!.id, false);
    panel();
    expect(
      document.body.querySelector(`[data-testid="treaty-terms-${treaty.id}"] summary`)!.textContent,
    ).toContain("2 terms broken");
  });

  it("says all terms honoured when none has been broken", () => {
    const treaty = signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [
      { text: "No raids", party: "them" },
    ]);
    markTerm(treaty.id, treaty.terms[0]!.id, true);
    panel();
    const card = document.body.querySelector(`[data-testid="treaty-terms-${treaty.id}"]`)!;
    expect(card.getAttribute("data-under-strain")).toBe("false");
    expect(card.querySelector("summary")!.textContent).toContain("all terms honoured");
  });

  it("gives a card per treaty", () => {
    signTreaty("Non-aggression", "glu", "Great Lakes Union", 12, [{ text: "No raids", party: "them" }]);
    signTreaty("Trade pact", "pc", "Pacific Compact", 13, [{ text: "Open the border", party: "them" }]);
    panel();
    expect(document.body.querySelectorAll(".treaty-terms")).toHaveLength(2);
  });
});
