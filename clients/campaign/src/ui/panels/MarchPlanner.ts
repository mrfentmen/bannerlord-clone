/**
 * The march planner. `UI_UX.md` section 7, `MARCH_AND_WAR.md` section 11.
 *
 * The point of this panel is that the cost is visible *before* the player commits.
 * Travel time, food, money, metal, days of supply on arrival, and a warning for every
 * reason this march is a bad idea, all shown for a plan that has not been accepted.
 *
 * It plans, it does not decide. `provider.planMarch` is the authority on distance,
 * time and cost, because those are the March and Supply systems' output
 * (CAUSE_EFFECT.md section 9), and the client must not compute a second opinion.
 */

import { announce, h, liveRegion } from "../dom.js";
import { emptyState, errorState, panel, statusChip, type StatusKind } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { marchSkeletonBody } from "./panel-skeletons.js";
import type { MarchPlan, PartyState, SettlementOption, SimulationProvider } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/** The panel's title. Also its accessible name: `kit.panel` gives it a heading, not a name. */
const TITLE = "March planner";

/** The destination field's handle. A stable id, because the node outlives every render. */
const TARGET_ID = "march-target";

export interface MarchPlannerOptions {
  party: PartyState;
  /** Real places, from the loaded world data. Destinations, not invented names. */
  destinations: SettlementOption[];
  provider: SimulationProvider;
  onClose?: () => void;
  onCommitted?: (plan: MarchPlan) => void;
  onError?: (message: string) => void;
  testId?: string;
}

export interface MarchPlannerHandle {
  root: HTMLElement;
  refresh(): void;
}

export function marchPlanner(options: MarchPlannerOptions): MarchPlannerHandle {
  const simIdFor = (clientId: string): string | null =>
    options.destinations.find((d) => d.id === clientId)?.simulationId ?? null;

  const { root, body } = panel({
    title: TITLE,
    testId: options.testId ?? "march-planner",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);
  // `kit.panel` gives the sheet an `h2` and no name, which leaves it an unnamed `section`:
  // a landmark a screen reader cannot list and a keyboard user cannot be told about. The
  // title is already the panel's name, so it is named with it.
  root.setAttribute("aria-label", TITLE);

  /**
   * Announcements, for the prices.
   *
   * The keyboard stays on the destination field while the price is being asked for, which
   * is right — that is where the player's hands are — and means nothing is announced when
   * the answer lands. So the answer is said: a route, a time and a day are the whole point
   * of this panel and a player who never looks at the meter must still hear them. It is
   * polite rather than assertive because a price is never an emergency; the warnings for
   * that are on screen in full regardless.
   */
  const prices = liveRegion("");
  root.appendChild(prices);

  // Default to the nearest destination the simulation can write an order for. A place
  // with no town record is a legitimate thing to see in the list and a useless thing
  // to open first.
  let selected =
    options.destinations.find((d) => d.simulationId !== null)?.id ?? options.destinations[0]?.id ?? "";
  let plan: MarchPlan | null = null;
  let planning = false;
  let planningUnavailable = false;
  let planToken = 0;
  /**
   * The confirm step. `MARCH_AND_WAR.md` section 11 is explicit that the cost is shown
   * before the player commits, and a single button that both shows the price and takes
   * the order is not a confirmation of anything — it is a price tag on the commit. So
   * the first press arms the order and the second gives it, and the second press is
   * never the first thing on screen.
   */
  let confirming = false;
  let committing = false;
  /** The last pricing failure, or `null`. Held in state so `render` can draw it. */
  let priceError: { message: string; detail: string } | null = null;

  /**
   * The control that should hold the keyboard once the next render is on screen.
   *
   * Every render replaces the whole body, and an element that leaves the document takes
   * the focus with it: `document.activeElement` falls back to `<body>` and the next `Tab`
   * restarts from the top of the page. Changing the destination is the single most common
   * thing to do in this panel and it re-renders twice — once for the skeleton, once for
   * the price — so a panel that did not put the keyboard back would throw it away on the
   * first thing the player does. `null` means "hold whatever was held", which is the
   * common case: the re-render is not the event, the choice is.
   */
  let wantedFocus: string | null = null;

  const target = h(
    "select",
    { id: TARGET_ID, class: "field__input label", "data-testid": TARGET_ID },
    options.destinations.map((d) =>
      h("option", { value: d.id, selected: d.id === selected }, `${d.name} — ${d.distanceHint}`),
    ),
  );
  target.addEventListener("change", () => {
    selected = target.value;
    // Changing the destination disarms any armed order. An armed order is a statement
    // about a specific place, and it must not survive being pointed somewhere else.
    confirming = false;
    // The field the player is standing on is the field they must come back to when the
    // price lands. `MarketPanel` already sets this precedent for the quantity input.
    wantedFocus = TARGET_ID;
    void replan();
  });

  /**
   * Escape, in the order the panel's own decisions are stacked.
   *
   * An armed order is a decision in progress, so Escape backs out of that decision before
   * it backs out of the panel: one press is an alias for "Change the plan", which is the
   * same escape hatch already sitting on the same row, and only a second press closes.
   * `stopPropagation` is what keeps the host's own Escape handler from doing both at once
   * — it sits on `window`, above this panel, and would otherwise fire on the same press.
   *
   * With no `onClose` there is nothing to close, and nothing is stopped: the host owns the
   * panel's lifetime and its global Escape handler is the correct thing to let through.
   */
  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (confirming) {
      ev.preventDefault();
      ev.stopPropagation();
      confirming = false;
      render();
      return;
    }
    if (!options.onClose) return;
    ev.preventDefault();
    ev.stopPropagation();
    options.onClose();
  });

  function render(): void {
    const held = heldFocus();
    paint();
    settleFocus(held);
  }

  /** The test id of the control the keyboard is on, or `null` if it is not in the panel. */
  function heldFocus(): string | null {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !body.contains(el)) return null;
    return el.dataset.testid ?? el.id ?? null;
  }

  /**
   * Puts the keyboard back after a re-render.
   *
   * Nothing is grabbed when nothing was held: the panel itself carries the focus while it
   * is loading, and a re-render that ended the load must not move the keyboard off it and
   * onto the order button, which is the one control in here that spends money. Only a
   * control that was genuinely in the body and is genuinely gone gets a replacement.
   *
   * The destination field is a single node built once and re-appended by every render, so
   * it is focused through the reference rather than through a fresh lookup — the node the
   * player was on and the node that is back on screen are the same object. Anything else
   * that has gone falls back to the panel's first control, which in every state that loses
   * one is the single action that state offers: the retry after a failure, the arm button
   * after an Escape. The panel itself is the last resort, for a state with no control in it
   * at all, because `<body>` is worse than either — `Tab` from there restarts the page.
   */
  function settleFocus(held: string | null): void {
    const wanted = wantedFocus ?? held;
    wantedFocus = null;
    if (!wanted) return;
    if (wanted === TARGET_ID) {
      target.focus();
      return;
    }
    const el = byTestId(wanted);
    if (el) {
      el.focus();
      return;
    }
    const first = body.querySelector<HTMLElement>("button");
    if (first) first.focus();
    else root.focus();
  }

  function byTestId(testId: string): HTMLElement | null {
    for (const el of Array.from(body.querySelectorAll<HTMLElement>("[data-testid]"))) {
      if (el.dataset.testid === testId) return el;
    }
    return null;
  }

  function paint(): void {
    body.replaceChildren();

    // A pricing failure is drawn first, and it is drawn by `render` rather than
    // appended, so the retry and the re-render cannot disagree about what is on screen.
    if (priceError) {
      body.appendChild(
        errorState({
          message: priceError.message,
          detail: priceError.detail,
          onRetry: () => void replan(),
          testId: "march-error",
        }),
      );
      return;
    }

    if (options.destinations.length === 0) {
      body.appendChild(
        emptyState(
          "Nowhere to march to.",
          "No surveyed road connects anywhere from here. Move to a town with a road first.",
        ),
      );
      return;
    }

    body.appendChild(
      h(
        "div",
        { class: "field", style: "margin-bottom:var(--space-3)" },
        h("label", { class: "field__label label", for: "march-target" }, "Destination"),
        target,
      ),
    );

    if (planningUnavailable) {
      const name = options.destinations.find((d) => d.id === selected)?.name ?? "there";
      body.appendChild(
        emptyState(
          `The simulation is not running a town for ${name}.`,
          "The place is on the real map, with real roads and a real name, but no town record " +
            "exists for it, so no march can be ordered. Choose somewhere the simulation knows.",
        ),
      );
      return;
    }

    if (planning) {
      // Named and shaped like the real layout: the destination field, the priced
      // route, three cost cells, the supply line and the order button.
      body.appendChild(marchSkeletonBody());
      return;
    }

    if (!plan) {
      // The destination is set but no price has come back yet. The skeleton is already
      // on screen for that case, so what is left is a price the simulation declined to
      // price, and the panel says so rather than showing a blank sheet.
      body.appendChild(
        emptyState(
          "No price for that march yet.",
          "The simulation did not return a cost, so the travel time and the bill are unknown. Choose a different destination, or ask again.",
        ),
      );
      body.appendChild(
        h("button", { type: "button", class: "btn", "data-testid": "march-reprice" }, "Price it again"),
      );
      body.querySelector<HTMLButtonElement>("[data-testid='march-reprice']")?.addEventListener("click", () => void replan());
      return;
    }

    if (plan.unmapped) {
      // There is no order to confirm, so there is no order button. The panel says why
      // the plan failed in the simulation's own words and stops there.
      body.appendChild(
        h(
          "div",
          { class: "warnings", "data-testid": "march-unmapped" },
          h(
            "p",
            { class: "warning", "data-severity": "warning" },
            plan.warnings[0] ?? "No surveyed road connects these two towns.",
          ),
        ),
      );
      return;
    }

    // -- the route, priced --------------------------------------------------
    body.appendChild(
      h(
        "div",
        { class: "field-row", style: "margin-bottom:var(--space-3)" },
        h(
          "div",
          { style: "flex:1 1 auto;min-width:0" },
          h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, "Route"),
          h(
            "p",
            { class: "data", style: "margin:0", "data-testid": "march-summary" },
            `${plan.distanceKm.toFixed(0)} km · ${plan.days} ${plan.days === 1 ? "day" : "days"} · arrives day ${plan.arrivalDay}`,
          ),
        ),
        statusChip(
          plan.roadDanger > 0.6 ? "critical" : plan.roadDanger > 0.4 ? "warning" : "good",
          `Road danger ${plan.roadDanger.toFixed(2)}`,
          { testId: "march-danger" },
        ),
      ),
    );

    // -- the cost ------------------------------------------------------------
    const costs = h("div", { class: "costs", "data-testid": "march-costs" });
    const headcount = options.party.troops.reduce((a, t) => a + t.count, 0);
    costs.append(
      costCell("Grain", `${plan.cost.food.toFixed(1)}`, "person-days, every one of them eaten", `party holds ${options.party.food.toFixed(1)} days`, "march-cost-food"),
      costCell("Money", `$${Math.round(plan.cost.money).toLocaleString("en-US")}`, `wages for ${headcount} troops`, `purse $${Math.round(options.party.money).toLocaleString("en-US")}`, "march-cost-money"),
      costCell("Metal", `${plan.cost.metal.toFixed(1)}`, "units for ammunition and repair", `party holds ${Math.round(options.party.metal)} units`, "march-cost-metal"),
    );
    body.appendChild(costs);

    // The days-of-supply meter MARCH_AND_WAR.md section 11 asks for beside the price.
    // It is a gauge rather than a sentence because the player acts on the number.
    body.appendChild(
      h(
        "div",
        { class: "march__supply", "data-testid": "march-supply" },
        h("span", { class: "label" }, "Days of grain on arrival"),
        h(
          "div",
          {
            class: "gauge__track",
            role: "meter",
            "aria-label": "Days of grain on arrival",
            "aria-valuemin": "0",
            "aria-valuemax": String(Math.max(1, plan.days)),
            "aria-valuenow": supplyValue(plan),
            "aria-valuetext": supplyText(plan),
          },
          h("span", {
            class: "gauge__fill",
            style: `width:${supplyPct(plan)}%;background:var(--status-${supplyKind(plan) === "critical" ? "critical" : supplyKind(plan) === "warning" ? "warning" : "good"}-mark)`,
          }),
        ),
        h("p", { class: "caption march__supply-note" }, supplyText(plan)),
      ),
    );

    // -- warnings ------------------------------------------------------------
    // Every warning is shown whether the plan is accepted or not, and the plan can be
    // accepted with warnings on it. Hiding them behind the confirm step would be a way
    // of making a bad march look like a clean one.
    if (plan.warnings.length > 0) {
      const list = h("ul", { class: "warnings", "data-testid": "march-warnings" });
      for (const w of plan.warnings) {
        const kind = warningKind(w);
        const item = h("li", { class: "warning march__warning", "data-severity": kind === "critical" ? "critical" : "warning" });
        // Glyph, colour and the word, per ART_DIRECTION.md section 5.3. The severity of
        // a supply warning is a matter of arithmetic, so it is worked out here and
        // printed, not left to the colour of a border.
        item.appendChild(statusChip(kind, severityHeadline(kind), { testId: "march-warning-chip" }));
        item.appendChild(h("span", { class: "march__warning-text" }, w));
        list.appendChild(item);
      }
      body.appendChild(list);
    }

    // -- commit --------------------------------------------------------------
    body.appendChild(confirmBlock());
  }

  /**
   * The confirm step, and the only place an order can be given from.
   *
   * Step one arms the order and repeats the bill, because a player who has scrolled
   * past the cost cells deserves to see them again at the moment they commit rather
   * than trust their memory of them. Step two gives it, and only step two calls the
   * simulation. Cancelling is on the same row as the commit rather than hidden, because
   * an order that cannot be backed out of without finding a close button is not a
   * decision the player is really being asked to make.
   */
  function confirmBlock(): HTMLElement {
    if (!plan) return h("div", {});
    const wrap = h("section", { class: "march__confirm", "data-testid": "march-confirm-block" });
    const headcount = options.party.troops.reduce((a, t) => a + t.count, 0);

    if (!confirming) {
      const arm = h(
        "button",
        {
          type: "button",
          class: "btn btn--primary march__action",
          "data-testid": "march-commit",
        },
        `March on ${plan.destinationName}`,
      );
      arm.addEventListener("click", () => {
        confirming = true;
        // Focus the commit, not the cancel. The default focus on a confirmation is the
        // affirmative one, and the dangerous default is the one you do not mean — so the
        // arm button names the destination the keyboard is being handed to, rather than
        // leaving it to whichever control happens to come first in the body.
        wantedFocus = "march-commit-confirm";
        render();
      });
      wrap.appendChild(arm);
      wrap.appendChild(
        h(
          "p",
          { class: "caption", style: "text-align:center" },
          "The cost is drawn down a day at a time. If something changes on the road, the bill changes with it.",
        ),
      );
      return wrap;
    }

    wrap.appendChild(
      h("h3", { class: "section-header", "data-testid": "march-confirm-head" }, "Confirm the order"),
    );
    const summary = h("div", { class: "march__bill", "data-testid": "march-bill" });
    summary.appendChild(
      h(
        "p",
        { class: "data march__bill-route" },
        `${plan.destinationName} · ${plan.distanceKm.toFixed(0)} km · ${plan.days} ${plan.days === 1 ? "day" : "days"} · arrives day ${plan.arrivalDay}`,
      ),
    );
    const rows: [string, string][] = [
      ["Grain", `${plan.cost.food.toFixed(1)} days`],
      ["Money", `$${Math.round(plan.cost.money).toLocaleString("en-US")}`],
      ["Metal", `${plan.cost.metal.toFixed(1)} units`],
    ];
    const table = h("ul", { class: "march__bill-list" });
    for (const [key, value] of rows) {
      table.appendChild(
        h(
          "li",
          { class: "ledger__item", "data-testid": `march-bill-${key.toLowerCase()}` },
          h("span", { class: "ledger__item-label" }, `${key}, over ${plan.days} ${plan.days === 1 ? "day" : "days"} for ${headcount} troops`),
          h("span", { class: "ledger__amount data", "data-sign": "negative" }, `−${value}`),
        ),
      );
    }
    summary.appendChild(table);
    wrap.appendChild(summary);

    const row = h("div", { class: "field-row march__actions" });
    const confirm = h(
      "button",
      {
        type: "button",
        class: "btn btn--primary",
        "data-testid": "march-commit-confirm",
        disabled: committing,
      },
      committing ? "Giving the order" : `Give the order. March on ${plan.destinationName}`,
    );
    confirm.addEventListener("click", () => void commitMarch());
    const cancel = h("button", { type: "button", class: "btn", "data-testid": "march-cancel" }, "Change the plan");
    cancel.addEventListener("click", () => {
      confirming = false;
      // The keyboard goes back to the button that armed the order, not to the first
      // control in the panel, so a player who backed out lands on the decision they were
      // making rather than at the top of a form they have already read.
      wantedFocus = "march-commit";
      render();
    });
    row.append(confirm, cancel);
    wrap.appendChild(row);
    return wrap;
  }

  async function replan(): Promise<void> {
    const simId = simIdFor(selected);
    if (!simId) {
      // The place is on the real map but the simulation is not running a town for it.
      // No order can be written, and saying so beats sending something wrong.
      plan = null;
      planning = false;
      planningUnavailable = true;
      render();
      return;
    }
    planningUnavailable = false;
    const token = ++planToken;
    planning = true;
    plan = null;
    // Re-pricing disarms the order. A price the player has not seen is not a price
    // they agreed to.
    confirming = false;
    priceError = null;
    render();
    try {
      const result = await options.provider.planMarch({
        partyId: options.party.id,
        destinationSettlementId: simId,
        departure: "now",
      });
      if (token !== planToken) return;
      plan = result;
      priceError = null;
      // Said, not just drawn. The route, the time and the day it lands are what the panel
      // exists to report, and a player who is on the destination field when they arrive
      // has not been told any of it.
      announce(
        prices,
        `${result.destinationName}. ${result.distanceKm.toFixed(0)} kilometres, ${result.days} ${result.days === 1 ? "day" : "days"}, arriving day ${result.arrivalDay}. ${supplyText(result)}`,
      );
    } catch (err) {
      if (token !== planToken) return;
      const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The march could not be priced.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      options.onError?.(`${message} :: ${detail}`);
      plan = null;
      // Held in state rather than written straight into the body, because `render` runs
      // again in the `finally` below and would wipe a node appended here.
      priceError = { message, detail };
      // The destination field is not drawn in the failure state, so the keyboard would
      // have nothing to return to. The retry is the only action this state offers and it
      // is the safe default: it asks for a price again, it does not give an order.
      wantedFocus = "march-error-retry";
    } finally {
      if (token === planToken) {
        planning = false;
        render();
      }
    }
  }

  async function commitMarch(): Promise<void> {
    const simId = simIdFor(selected);
    if (!simId || !plan) return;
    committing = true;
    render();
    try {
      await options.provider.commitMarch({
        partyId: options.party.id,
        destinationSettlementId: simId,
        departure: "now",
      });
      committing = false;
      confirming = false;
      // Redraw before handing the order on. The retry path comes straight back into this
      // function without a render of its own, so a retry that *succeeds* would otherwise
      // leave the panel showing the refusal for an order that was in fact given — with the
      // only control on screen being one more retry. The price on screen is the price that
      // was agreed, and the host normally replaces the panel from `onCommitted`; this only
      // matters when it does not, and a stale failure is worse than a stale price.
      render();
      options.onCommitted?.(plan);
      // The host replaces this panel the moment the order lands, and the node the keyboard
      // was on goes with it — leaving the focus on `<body>`, from which Tab starts the
      // page again. So it is parked on the panel first, which at least says where the
      // keyboard is until the host has something to put it on.
      root.focus();
    } catch (err) {
      committing = false;
      const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The order to march was refused.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      options.onError?.(`${message} :: ${detail}`);
      // The order failed, so the panel keeps the armed state: the player has already
      // read the bill and the cheapest way back is to give the same order again rather
      // than re-plan from the top.
      body.replaceChildren();
      body.appendChild(
        errorState({
          message,
          detail,
          onRetry: () => void commitMarch(),
          testId: "march-commit-error",
        }),
      );
      // The confirm button that was pressed is gone with the rest of the body. Focus goes
      // to the retry: it is the action this state exists to offer, and it is the same
      // order, not a new one.
      byTestId("march-commit-error-retry")?.focus();
    }
  }

  void replan();
  // The panel takes focus once it is in the document, which `kit.panel` cannot do for
  // itself: the host builds the panel, then mounts it, so a `.focus()` in here lands on a
  // detached node. Checked for connection because a panel built and never mounted, as in
  // the tests, has nothing to take focus. `root` carries `tabindex="-1"` from `kit.panel`,
  // so this is a focus target and not a new tab stop in the middle of the HUD.
  //
  // Guarded on nothing having claimed the keyboard inside the panel already, because this
  // runs after the first price request has already been answered: a request that came
  // back a failure puts the keyboard on the retry, and an open panel must not drag it off
  // that and back onto the sheet.
  queueMicrotask(() => {
    if (root.isConnected && !body.contains(document.activeElement)) root.focus();
  });
  return { root, refresh: () => void replan() };
}

function costCell(key: string, value: string, unit: string, note: string, testId: string): HTMLElement {
  return h(
    "div",
    { class: "cost", "data-testid": testId },
    h("div", { class: "cost__key" }, key),
    // Monospaced, because these three numbers are read against each other and against
    // the bill in the confirm step (ART_DIRECTION.md section 3.1).
    h("div", { class: "data" }, value),
    h("div", { class: "caption" }, unit),
    h("div", { class: "caption" }, note),
  );
}

/**
 * How bad a planner warning is, from what it says rather than from how it is coloured.
 *
 * A shortage that will not reach the destination, or a wage bill the purse cannot
 * cover, is critical. A road that is merely watched is a warning. The words are the
 * simulation's; the classification is the client's, and it is printed next to them so
 * the player can disagree with it.
 */
function warningKind(warning: string): StatusKind {
  return /^Short |^Wages |^The grain |^No grain /.test(warning) ? "critical" : "warning";
}

function severityHeadline(kind: StatusKind): string {
  return kind === "critical" ? "Will not hold" : "On the road";
}

// -- days of supply on arrival ------------------------------------------------
//
// `MARCH_AND_WAR.md` section 11: the map shows march time and cost to a target before
// the player commits, and a supply meter shows days of food remaining. Three cases are
// genuinely different and are worded separately, because "0.0 days" reads as "fine until
// tonight" when it in fact means the party arrives with nothing.

/** The arrival figure as a number of days, or `null` when there is none to show. */
function supplyDays(plan: MarchPlan): number | null {
  return plan.daysOfFoodOnArrival;
}

function supplyText(plan: MarchPlan): string {
  const days = supplyDays(plan);
  if (days === null) return "No grain left on arrival. The march outlasts the food.";
  if (days <= 0) return "The grain runs out before the party arrives.";
  return `About ${days.toFixed(1)} days of grain left on arrival.`;
}

function supplyKind(plan: MarchPlan): StatusKind {
  const days = supplyDays(plan);
  if (days === null || days <= 0) return "critical";
  if (days < 1) return "warning";
  return "good";
}

/** The meter is scaled to the march itself: enough grain to last the whole march is full. */
function supplyPct(plan: MarchPlan): number {
  const days = supplyDays(plan);
  if (days === null) return 0;
  return Math.max(0, Math.min(100, (days / Math.max(1, plan.days)) * 100));
}

function supplyValue(plan: MarchPlan): string {
  const days = supplyDays(plan);
  return days === null ? "0" : String(Number(Math.max(0, days).toFixed(1)));
}
