/**
 * Arena screen UI. MASTER_PLAN.md section 4D (task 146).
 *
 *  - Practice fights: a sparring entry that fires `onPracticeFight`.
 *    The caller transitions into the battle scene against training
 *    opponents.
 *  - Tournaments: the sim-fed list of upcoming tournaments. Each card
 *    shows rounds, prize, entry fee, and entrants; the Enter button
 *    fires `onEnterTournament`, and the caller transitions into the
 *    battle scene for the real fight.
 *
 * Same pattern as the other UI modules: this module owns no sim
 * connection and no fetch. The caller (Rowan's campaign client)
 * injects the entry callbacks, wires them to the battle scene
 * transition, and feeds tournament state via `update()`; this
 * module renders.
 */

import { announce, button, h, liveRegion, sectionHeader } from "./dom.js";
import { emptyState, panel, statusChip } from "./kit.js";

/** A tournament on the arena bill (task 146). */
export interface ArenaTournament {
  id: string;
  name: string;
  /** Number of rounds to win the prize. */
  rounds: number;
  /** Prize purse in gold. */
  prizeGold: number;
  /** Entry fee in gold. */
  entryFee: number;
  /** Fighters already entered. */
  entrants: number;
  /** True when the player's purse covers the entry fee. */
  canAfford: boolean;
  /** True when the entry list is full. */
  full: boolean;
  /** Days until the first round starts. */
  startsInDays: number;
}

/** Sim-fed arena state. */
export interface ArenaState {
  townName: string;
  tournaments: ArenaTournament[];
  /** The player's gold, shown so entry fees make sense. */
  purse: number;
}

export interface ArenaCallbacks {
  /**
   * Enter a practice fight. The caller transitions into the battle
   * scene against training opponents (task 146).
   */
  onPracticeFight: () => void;
  /**
   * Enter a tournament. The caller transitions into the battle scene
   * for the tournament fight (task 146).
   */
  onEnterTournament: (tournamentId: string) => void;
  onClose?: () => void;
}

export interface ArenaHandle {
  root: HTMLElement;
  update: (state: ArenaState) => void;
  destroy: () => void;
}

export function createArena(initial: ArenaState, callbacks: ArenaCallbacks): ArenaHandle {
  let state = initial;
  const region = liveRegion();
  const { root, body } = panel({
    title: `Arena — ${initial.townName}`,
    testId: "arena-screen",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });

  function render(): void {
    body.replaceChildren();

    // -- practice fight --------------------------------------------------
    body.appendChild(sectionHeader("Practice"));
    body.appendChild(
      h(
        "div",
        { class: "arena-row" },
        h(
          "div",
          { class: "arena-row__main" },
          h("p", { class: "label", style: "margin:0" }, "Sparring ring"),
          h(
            "p",
            { class: "caption", style: "margin:0" },
            "A friendly bout against the arena's sparring partners. No prize, no injuries, no entry fee.",
          ),
        ),
        button("Enter a practice fight", () => {
          announce(region, "Entering a practice fight.");
          callbacks.onPracticeFight();
        }, { variant: "primary", testId: "arena-practice" }),
      ),
    );

    // -- tournaments -----------------------------------------------------
    body.appendChild(sectionHeader("Tournaments"));
    if (state.tournaments.length === 0) {
      body.appendChild(emptyState("No tournaments are scheduled.", "The bill is empty. Check back after the season turns."));
    } else {
      const list = h("div", { class: "arena-list", "data-testid": "arena-tournaments" });
      for (const tournament of state.tournaments) {
        list.appendChild(tournamentCard(tournament));
      }
      body.appendChild(list);
    }

    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:var(--space-3) 0 0" },
        h("span", { "data-testid": "arena-purse" }, `Your purse: ${state.purse}g.`),
      ),
    );

    body.appendChild(region);
  }

  function tournamentCard(tournament: ArenaTournament): HTMLElement {
    const blocked = tournament.full || !tournament.canAfford;
    const enter = button(`Enter (${tournament.entryFee}g)`, () => {
      announce(region, `Entering ${tournament.name}.`);
      callbacks.onEnterTournament(tournament.id);
    }, {
      testId: `arena-enter-${tournament.id}`,
      disabled: blocked,
      describedBy: `arena-tournament-desc-${tournament.id}`,
    });
    return h(
      "div",
      { class: "arena-card", "data-testid": `arena-tournament-${tournament.id}` },
      h(
        "div",
        { class: "arena-card__head" },
        h("p", { class: "label", style: "margin:0" }, tournament.name),
        tournament.full
          ? statusChip("critical", "Full", { testId: `arena-tournament-${tournament.id}-full` })
          : !tournament.canAfford
            ? statusChip("warning", "Cannot afford the fee", { testId: `arena-tournament-${tournament.id}-poor` })
            : statusChip("good", `Prize ${tournament.prizeGold}g`, { testId: `arena-tournament-${tournament.id}-prize` }),
      ),
      h(
        "p",
        { class: "caption", style: "margin:0", id: `arena-tournament-desc-${tournament.id}` },
        `${tournament.rounds} rounds · ${tournament.entrants} entered · starts in ${tournament.startsInDays}d.`,
      ),
      enter,
    );
  }

  render();

  return {
    root,
    update(next: ArenaState) {
      state = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}
