/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createTournament, defaultFighters } from "../tournament.js";
import { tournamentBracket } from "../tournamentBracket.js";

describe("tournament bracket viewer (solo task 31)", () => {
  it("renders all rounds and matches", () => {
    const t = createTournament(defaultFighters());
    const el = tournamentBracket({ tournament: t });
    // 16 fighters -> 4 rounds (8 + 4 + 2 + 1 matches).
    expect(el.querySelectorAll('[data-testid^="bracket-round-"]').length).toBe(4);
    expect(el.querySelectorAll('[data-testid^="bracket-match-"]').length).toBe(15);
  });

  it("names the rounds", () => {
    const t = createTournament(defaultFighters());
    const el = tournamentBracket({ tournament: t });
    const text = el.textContent ?? "";
    expect(text).toContain("Quarterfinals");
    expect(text).toContain("Semifinals");
    expect(text).toContain("Final");
  });

  it("reporting a winner updates the bracket", () => {
    const t = createTournament(defaultFighters());
    const onReportWinner = vi.fn((matchId: string, winnerId: string) => {
      t.reportWinner(matchId, winnerId);
    });
    let el = tournamentBracket({ tournament: t, onReportWinner });
    const pick = el.querySelector('[data-testid^="bracket-pick-r0m0-"]') as HTMLButtonElement;
    pick.click();
    expect(onReportWinner).toHaveBeenCalledTimes(1);
    // Re-render: the winner is now marked.
    el = tournamentBracket({ tournament: t, onReportWinner });
    const matchId = onReportWinner.mock.calls[0]![0] as string;
    const winnerId = onReportWinner.mock.calls[0]![1] as string;
    const winnerSpan = el.querySelector(`[data-testid="bracket-side-${matchId}-${winnerId}"]`);
    expect(winnerSpan?.className).toContain("bracket__winner");
  });

  it("shows the champion when the tournament completes", () => {
    const t = createTournament(defaultFighters());
    // Report winners round by round until complete.
    for (let round = 0; round < 4; round++) {
      for (const match of t.rounds()[round]!) {
        if (!match.winnerId && match.a && match.b) t.reportWinner(match.id, match.a.id);
      }
    }
    expect(t.isComplete()).toBe(true);
    const el = tournamentBracket({ tournament: t });
    expect(el.querySelector('[data-testid="bracket-champion"]')).not.toBeNull();
  });
});
