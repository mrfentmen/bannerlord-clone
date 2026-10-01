/**
 * Tavern screen UI. MASTER_PLAN.md section 4D (task 145).
 *
 *  - Recruit: fighters for hire, each row showing tier, wage, and how
 *    many are looking for work. The Hire button fires `onRecruit`,
 *    which the caller wires to the sim's recruit provider endpoint.
 *  - Rumors: tavern talk fed from the sim through `update()`. The
 *    "Ask around" button fires `onAskRumors`, wired to the sim's
 *    rumor endpoint; fresh rumors arrive on the next `update()`.
 *  - Games: dice and card tables with wagers and waiting players. The
 *    Sit down button fires `onPlayGame`, wired to the sim's game
 *    endpoint. A table the player cannot afford is disabled with a
 *    plain reason, not a silent dead button.
 *
 * Same pattern as the other UI modules: this module owns no sim
 * connection and no fetch. The caller (Rowan's campaign client)
 * injects the action callbacks, wires each to its provider endpoint,
 * and feeds state via `update()`; this module renders.
 */

import { announce, button, h, liveRegion, sectionHeader } from "./dom.js";
import { emptyState, panel, statusChip } from "./kit.js";

/** A fighter looking for work in the tavern (task 145). */
export interface TavernRecruit {
  id: string;
  name: string;
  /** Troop tier label from the sim, e.g. "Tier 3". */
  tier: string;
  /** Daily wage in gold, from the sim. */
  wagePerDay: number;
  /** How many fighters of this kind are waiting to be hired. */
  available: number;
}

/** A scrap of tavern talk (task 145). */
export interface TavernRumor {
  id: string;
  text: string;
  /** Who said it, e.g. "the bartender". Absent = nobody remembers. */
  source?: string;
}

/** A game table: dice, cards, knucklebones (task 145). */
export interface TavernGame {
  id: string;
  name: string;
  description: string;
  /** Entry cost in gold. */
  wager: number;
  /** Players already waiting at the table. */
  playersWaiting: number;
  /** True when the player's purse covers the wager. */
  canAfford: boolean;
}

/** Sim-fed tavern state. */
export interface TavernState {
  townName: string;
  recruits: TavernRecruit[];
  rumors: TavernRumor[];
  games: TavernGame[];
  /** The player's gold, shown so wagers make sense. */
  purse: number;
}

export interface TavernCallbacks {
  /** Wires to the sim's recruit endpoint (task 145). */
  onRecruit: (recruitId: string) => void;
  /** Wires to the sim's rumor endpoint (task 145). */
  onAskRumors: () => void;
  /** Wires to the sim's game endpoint (task 145). */
  onPlayGame: (gameId: string) => void;
  onClose?: () => void;
}

export interface TavernHandle {
  root: HTMLElement;
  update: (state: TavernState) => void;
  destroy: () => void;
}

export function createTavern(initial: TavernState, callbacks: TavernCallbacks): TavernHandle {
  let state = initial;
  const region = liveRegion();
  const { root, body } = panel({
    title: `Tavern — ${initial.townName}`,
    testId: "tavern-screen",
    ...(callbacks.onClose ? { onClose: callbacks.onClose } : {}),
  });

  function render(): void {
    body.replaceChildren();

    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:0 0 var(--space-3)" },
        h("span", { "data-testid": "tavern-purse" }, `Your purse: ${gold(state.purse)}.`),
      ),
    );

    // -- recruit ----------------------------------------------------------
    body.appendChild(sectionHeader("Fighters for hire"));
    if (state.recruits.length === 0) {
      body.appendChild(
        emptyState(
          "Nobody is looking for work.",
          "The benches are empty. Check back after a battle or a harvest.",
          undefined,
        ),
      );
    } else {
      const list = h("div", { class: "tavern-list", "data-testid": "tavern-recruits" });
      for (const recruit of state.recruits) {
        list.appendChild(recruitRow(recruit));
      }
      body.appendChild(list);
    }

    // -- rumors -----------------------------------------------------------
    body.appendChild(sectionHeader("Rumors"));
    if (state.rumors.length === 0) {
      body.appendChild(
        emptyState(
          "Nobody is talking yet.",
          "Buy a round or ask around to loosen some tongues.",
          button("Ask around", () => {
            announce(region, "Asking around the tavern.");
            callbacks.onAskRumors();
          }, { testId: "tavern-ask-rumors" }),
        ),
      );
    } else {
      const list = h("div", { class: "tavern-list", "data-testid": "tavern-rumors" });
      for (const rumor of state.rumors) {
        list.appendChild(rumorRow(rumor));
      }
      list.appendChild(
        h(
          "div",
          { class: "tavern-row" },
          button("Ask around", () => {
            announce(region, "Asking around the tavern.");
            callbacks.onAskRumors();
          }, { variant: "quiet", testId: "tavern-ask-rumors" }),
        ),
      );
      body.appendChild(list);
    }

    // -- games ------------------------------------------------------------
    body.appendChild(sectionHeader("Games"));
    if (state.games.length === 0) {
      body.appendChild(emptyState("No tables are running.", "The dice are quiet tonight."));
    } else {
      const list = h("div", { class: "tavern-list", "data-testid": "tavern-games" });
      for (const game of state.games) {
        list.appendChild(gameRow(game));
      }
      body.appendChild(list);
    }

    body.appendChild(region);
  }

  function recruitRow(recruit: TavernRecruit): HTMLElement {
    const hire = button("Hire", () => {
      announce(region, `${recruit.name} hired.`);
      callbacks.onRecruit(recruit.id);
    }, {
      testId: `tavern-hire-${recruit.id}`,
      disabled: recruit.available < 1,
      describedBy: `tavern-recruit-${recruit.id}`,
    });
    return h(
      "div",
      { class: "tavern-row", "data-testid": `tavern-recruit-${recruit.id}` },
      h(
        "div",
        { class: "tavern-row__main" },
        h("p", { class: "label", style: "margin:0" }, recruit.name),
        h(
          "p",
          { class: "caption", style: "margin:0" },
          `${recruit.tier} · ${gold(recruit.wagePerDay)} a day · ${recruit.available} waiting`,
        ),
      ),
      hire,
    );
  }

  function rumorRow(rumor: TavernRumor): HTMLElement {
    return h(
      "div",
      { class: "tavern-row tavern-rumor", "data-testid": `tavern-rumor-${rumor.id}` },
      h(
        "div",
        { class: "tavern-row__main" },
        h("p", { class: "tavern-rumor__text", style: "margin:0" }, `“${rumor.text}”`),
        rumor.source
          ? h("p", { class: "caption", style: "margin:0" }, `Heard from ${rumor.source}.`)
          : null,
      ),
    );
  }

  function gameRow(game: TavernGame): HTMLElement {
    const sit = button(`Sit down (${gold(game.wager)})`, () => {
      announce(region, `Joining ${game.name}.`);
      callbacks.onPlayGame(game.id);
    }, {
      testId: `tavern-game-${game.id}`,
      disabled: !game.canAfford,
      describedBy: `tavern-game-desc-${game.id}`,
    });
    return h(
      "div",
      { class: "tavern-row", "data-testid": `tavern-game-row-${game.id}` },
      h(
        "div",
        { class: "tavern-row__main" },
        h("p", { class: "label", style: "margin:0" }, game.name),
        h(
          "p",
          { class: "caption", style: "margin:0", id: `tavern-game-desc-${game.id}` },
          `${game.description} Wager ${gold(game.wager)}. ${game.playersWaiting} waiting.`,
        ),
        game.canAfford
          ? null
          : h("p", { class: "caption", style: "margin:0" },
              statusChip("warning", "Short of the wager.", { testId: `tavern-game-${game.id}-poor` })),
      ),
      sit,
    );
  }

  render();

  return {
    root,
    update(next: TavernState) {
      state = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}

/** Rows are thin horizontal cards; a "Wanted" style is beyond the token budget. */
export function gold(amount: number): string {
  return `${Math.round(amount)}g`;
}
