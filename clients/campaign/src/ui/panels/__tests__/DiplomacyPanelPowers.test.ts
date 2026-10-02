/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { powerScore, type ClanPower } from "../../../diplomacy/greatPowers.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

const POWERS: ClanPower[] = [
  { clanId: "c1", clanName: "Great Lakes Union", troops: 4000, towns: 6, treasury: 20000, reputation: 70 },
  { clanId: "c2", clanName: "Pacific Compact", troops: 9000, towns: 9, treasury: 60000, reputation: 55 },
  { clanId: "c3", clanName: "Harbor Row Crew", troops: 300, towns: 1, treasury: 900, reputation: 20 },
];

function board(): HTMLElement | null {
  return document.body.querySelector('[data-testid="diplomacy-power-table"]');
}

describe("diplomacy panel power board (task 221)", () => {
  it("draws no power board when the caller supplies no roster", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    // No faction roster exists in the diplomacy layer's own state; a table of
    // invented strengths would be a map made of guesses.
    expect(document.body.querySelector('[data-testid="diplomacy-powers"]')).toBeNull();
  });

  it("says so plainly when the roster it was handed is empty", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: [] }));
    const section = document.body.querySelector('[data-testid="diplomacy-powers"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("No powers to compare");
  });

  it("ranks the powers with the shared scorer, not with a second opinion", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    const table = board()!;
    const names = [...table.querySelectorAll("tbody tr td:nth-child(2)")].map((td) => td.textContent);
    // Ordered by rankGreatPowers, which is the module that owns the scoring.
    expect(names).toEqual([
      "Pacific Compact",
      "Great Lakes Union",
      "Harbor Row Crew",
    ]);
  });

  it("prints each power's score as the scorer computed it", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    const table = board()!;
    const scores = [...table.querySelectorAll("tbody tr td:nth-child(3)")].map((td) =>
      Number((td.textContent ?? "").replace(/,/g, "")),
    );
    expect(scores).toEqual([
      powerScore(POWERS[1]!),
      powerScore(POWERS[0]!),
      powerScore(POWERS[2]!),
    ]);
  });

  it("shows the gap to the leader, and a dash for the leader", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    const gaps = [...board()!.querySelectorAll("tbody tr td:nth-child(4)")].map((td) => td.textContent);
    expect(gaps[0]).toBe("—");
    expect(Number((gaps[1] ?? "").replace(/,/g, ""))).toBe(
      powerScore(POWERS[1]!) - powerScore(POWERS[0]!),
    );
  });

  it("carries the verdict the ranking gives, so the number is readable in words", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    const rows = board()!.textContent ?? "";
    expect(rows).toContain("The great power");
    expect(rows).toContain("A minor clan");
  });

  it("labels the table with a caption rather than leaving it unlabelled", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    const caption = board()!.querySelector("caption")!;
    expect(caption.textContent).toBe("Power ranking");
  });

  it("says the figure is an estimate, not a count", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    expect(document.body.querySelector('[data-testid="diplomacy-powers"]')!.textContent).toContain(
      "It is an estimate, not a count",
    );
  });

  it("does not disturb the sections around it", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12, powers: POWERS }));
    expect(document.body.querySelector('[data-testid="diplomacy-reputation"]')).not.toBeNull();
    expect(document.body.textContent).toContain("No changes recorded");
    expect(document.body.querySelector('[data-testid="tribute-suggestion"]')).not.toBeNull();
    expect(document.body.textContent).toContain("No declared wars");
  });
});