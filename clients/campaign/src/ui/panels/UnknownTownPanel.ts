/**
 * What a fogged settlement's panel says.
 *
 * Task 65, and the reason this file exists rather than a branch inside `TownPanel`.
 *
 * Clicking a town that is not in sight is a real case with two quite different answers,
 * and picking the wrong one is a lie with numbers in it:
 *
 *  - A **remembered** town has real data in the snapshot — last tick's unrest, last
 *    tick's garrison — and the temptation is to render the ordinary town panel. That
 *    would present stale figures under a heading that says nothing about time. The
 *    player would read a month's-old number as this morning's and make a decision on
 *    it. So the panel says what it knows, marks it as last-known, and shows the
 *    numbers anyway, because a player who scouted a place and marched away wants to
 *    remember what they found.
 *
 *  - An **unseen** town has no standing to have data shown at all. The panel says the
 *    side has never been there and stops. It does not print the population, because the
 *    population is in the survey the client is holding and printing it is the exact leak
 *    `UNSEEN_POLICY` in `src/data/fog.ts` exists to prevent.
 *
 * Both answers are gated on `SettlementFogView.current`, which is false for both
 * remembered and unseen. That is the whole mechanism: one boolean, checked here, rather
 * than each panel deciding for itself whether "old" counts as "showable".
 */

import { h, row, sectionHeader } from "../dom.js";
import { panel, statusChip, type StatusKind } from "../kit.js";
import { settlementFogView, type SettlementFogView } from "../../data/fogView.js";
import type { TownRecency } from "../../data/fog.js";
import type { TownState, TownVisibility } from "../../data/types.js";

/** Which status shape each state wears. Shape carries it; colour is the third signal. */
const STATE_KIND: Record<TownVisibility, StatusKind> = {
  visible: "good",
  remembered: "info",
  unseen: "neutral",
};

export interface UnknownTownPanelOptions {
  /** The client's settlement id, so the player can see which place this is about. */
  settlementName: string;
  /** The simulation town, when there is one. Null for a place the simulation runs no town for. */
  town: TownState | null;
  /** The state, already read from the snapshot. Never inferred here. */
  state: TownVisibility;
  /**
   * How old the last sighting is, already read from the snapshot. Never inferred here.
   *
   * Optional and defaulting to `unknown`, which produces no age line at all: a panel
   * without one still says the numbers are last-known, and a panel that could not state an
   * age must not print "0 days ago" to stand in for one.
   */
  recency?: TownRecency;
  /** The age in the simulation's ticks, alongside `recency`. Null when unknown. */
  days?: number | null;
  /** Day the player is looking at, for the "last seen" framing. */
  day: number;
  /** Sends the player to the Why panel, for a field that has a cause chain. */
  onWhy?: (field: string) => void;
  testId?: string;
}

/**
 * The panel for a settlement the player cannot currently see.
 *
 * `settlementName` is the real survey name and it is shown even for an unseen town. That
 * is not a leak in the sense `UNSEEN_POLICY` means, and the distinction is worth being
 * careful about: the *marker* and the *label* are hidden because they place the town on
 * the map, but the player only reaches this panel by clicking something already on the
 * map, so the name came from their own click. Hiding the name here would mean a panel
 * with a title that cannot identify its own subject.
 */
export function unknownTownPanel(options: UnknownTownPanelOptions): HTMLElement {
  const view = settlementFogView(options.state, options.recency ?? "unknown", options.days ?? null);
  const { root, body } = panel({
    title: options.settlementName,
    testId: options.testId ?? "unknown-town-panel",
  });

  // The state chip first, before any number. Whatever follows is read in the light of
  // this, and a panel that puts a figure above its own caveat is a panel whose caveat
  // does not work.
  body.appendChild(
    h(
      "div",
      { class: "fogstate" },
      statusChip(STATE_KIND[options.state], view.label, {
        testId: "fog-state-chip",
        title: view.detail,
      }),
      h("p", { class: "caption fogstate__detail", "data-testid": "fog-state-detail" }, view.detail),
    ),
  );

  if (!view.current) {
    // The banner, in words, before the figures. A player who scrolls straight to the
    // number still had to pass it.
    body.appendChild(
      h(
        "p",
        {
          class: "fogstate__banner",
          role: "status",
          "data-testid": "fog-stale-banner",
        },
        options.state === "remembered"
          ? `Last known as of the last time this side had it in sight. It may have changed since. Reading on day ${options.day}.`
          : "Nothing is known about this place. Your side has never had it in sight.",
      ),
    );
    // The age, on its own line, and only when one could be stated.
    //
    // "Last known" tells the player the numbers are not current; it does not tell them how
    // far back they reach, and that is the number they would act on. Placed immediately
    // under the banner so the two read together — a figure about how old the news is is
    // itself a figure, and the rule this panel already follows is that no number appears
    // above its own caveat.
    if (view.age) {
      body.appendChild(
        h("p", { class: "caption fogstate__age", "data-testid": "fog-age" }, view.age),
      );
    }
  }

  if (!view.known) {
    // The unseen case ends here. No numbers, not even the ones the client is holding.
    body.appendChild(
      sectionHeader("What is here", h("span", { class: "caption" }, "Not observed")),
    );
    body.appendChild(
      h(
        "p",
        { class: "caption", "data-testid": "fog-unseen-detail" },
        "The survey records that a settlement stands here, with real ground and a real name. Your side has " +
          "never had it in sight, so it has no population, no garrison, no unrest and no market to report. " +
          "Marching here will find it.",
      ),
    );
    return root;
  }

  const town = options.town;
  if (!town) {
    // Remembered but the simulation runs no town: the one case where "remembered" and
    // "no data" coincide, and it needs saying because otherwise it reads as the panel
    // having failed rather than as the simulation having nothing.
    body.appendChild(
      h(
        "p",
        { class: "caption", "data-testid": "fog-no-town-record" },
        "Your side has been here, but the simulation is not running a town for this settlement, so there is " +
          "nothing to report about it. The ground and the roads are still on the map.",
      ),
    );
    return root;
  }

  // Remembered, with real last-known data. Shown, and shown as last-known.
  body.appendChild(sectionHeader("Last known", h("span", { class: "caption" }, `as of day ${options.day}`)));

  // `population` is the one nullable figure here, and "Not surveyed" is `TownPanel`'s own
  // wording for it. Reusing the word rather than printing 0 matters for a *fogged* town
  // more than for a live one: zero would read as a place that has emptied out, which is a
  // claim about the world rather than a statement about the survey.
  const figures: [string, string, keyof TownState][] = [
    ["Population", town.population === null ? "Not surveyed" : town.population.toLocaleString("en-US"), "population"],
    ["Unrest", town.unrest.toFixed(2), "unrest"],
    ["Loyalty", town.loyalty.toFixed(2), "loyalty"],
    ["Garrison", town.garrison.toLocaleString("en-US"), "garrison"],
    ["Prosperity", town.prosperity.toFixed(2), "prosperity"],
  ];

  for (const [label, value, field] of figures) {
    const line = row(label, value, { mono: true });
    // The Why link is kept: the cause chain for a remembered figure is real, and the
    // panel is not the place to decide that the player has lost interest in one.
    if (options.onWhy && field in town) {
      const why = h(
        "button",
        { type: "button", class: "why__link", "data-testid": `fog-why-${String(field)}` },
        "Why?",
      );
      why.addEventListener("click", () => options.onWhy?.(String(field)));
      line.appendChild(why);
    }
    body.appendChild(line);
  }

  body.appendChild(
    h(
      "p",
      { class: "caption", style: "margin-top:var(--space-3)", "data-testid": "fog-recruit-blocked" },
      "You cannot order anything here while the place is out of sight. March on it to take orders again.",
    ),
  );

  return root;
}

/**
 * The reason a remembered town is not orderable, as a single sentence.
 *
 * A function rather than a constant so the town panel and this panel cannot drift, and
 * so the wording has one owner.
 */
export function staleOrderReason(state: TownVisibility): string | null {
  return state === "visible" ? null : settlementFogView(state).detail;
}

export type { SettlementFogView };