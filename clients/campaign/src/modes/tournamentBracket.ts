/**
 * Tournament bracket viewer (Rowan solo task 31).
 *
 * Renders the tournament bracket from the tournament model: rounds as
 * columns, matches as cards, winners highlighted. Re-render on every
 * reportWinner to show the bracket updating per round.
 */

import { h } from "../ui/dom.js";
import type { BracketMatch, Tournament } from "./tournament.js";

export interface TournamentBracketOptions {
  tournament: Tournament;
  /** Called when the player picks a winner for an undecided match. */
  onReportWinner?: (matchId: string, winnerId: string) => void;
}

export function tournamentBracket(options: TournamentBracketOptions): HTMLElement {
  const { tournament } = options;
  const root = h(
    "div",
    { class: "bracket", "data-testid": "tournament-bracket" },
    h("h2", {}, "Tournament bracket"),
  );

  const rounds = tournament.rounds();
  rounds.forEach((matches, roundIdx) => {
    const col = h(
      "section",
      { class: "bracket__round", "data-testid": `bracket-round-${roundIdx}` },
      h("h3", {}, roundName(roundIdx, rounds.length)),
    );
    for (const match of matches) {
      col.appendChild(matchCard(match, options));
    }
    root.appendChild(col);
  });

  const champion = tournament.champion();
  if (champion) {
    root.appendChild(
      h("p", { class: "bracket__champion", "data-testid": "bracket-champion" }, `Champion: ${champion.name}`),
    );
  }
  return root;
}

function roundName(roundIdx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${roundIdx + 1}`;
}

function matchCard(match: BracketMatch, options: TournamentBracketOptions): HTMLElement {
  const card = h("div", { class: "bracket__match", "data-testid": `bracket-match-${match.id}` });
  for (const side of [match.a, match.b] as const) {
    const isWinner = side !== null && match.winnerId === side.id;
    const name = side ? side.name : "TBD";
    if (!match.winnerId && side && options.onReportWinner) {
      const btn = h(
        "button",
        {
          type: "button",
          class: `btn btn--quiet${isWinner ? " bracket__winner" : ""}`,
          "data-testid": `bracket-pick-${match.id}-${side.id}`,
        },
        name,
      );
      btn.addEventListener("click", () => options.onReportWinner!(match.id, side.id));
      card.appendChild(btn);
    } else {
      card.appendChild(
        h(
          "span",
          { class: isWinner ? "bracket__winner" : "", "data-testid": `bracket-side-${match.id}-${side?.id ?? "tbd"}` },
          name,
        ),
      );
    }
  }
  return card;
}
