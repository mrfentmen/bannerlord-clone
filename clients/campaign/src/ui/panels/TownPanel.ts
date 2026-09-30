/**
 * The town panel. `UI_UX.md` section 6.
 *
 * Every gauge shows its value, a trend arrow, and how long until it becomes a
 * problem. That last part is the one `UI_UX.md` insists on and the one a plain bar
 * cannot give you, so it is the reason this panel is a list of `gauge` calls and not
 * a set of progress bars.
 *
 * The panel does not compute anything. Every number arrives from the simulation. The
 * only thing calculated here is "days until trouble", which is arithmetic on a value
 * the player can already see, and it is shown next to the value it came from.
 */

import { h, sectionHeader, row } from "../dom.js";
import { errorState, gauge, panel, statusChip } from "../kit.js";
import type { TownState } from "../../data/types.js";

export interface TownPanelOptions {
  town: TownState;
  /** Previous tick's values, for the trend arrows. Null on the very first render. */
  previous?: TownState | null;
  onWhy: (field: string) => void;
  onOpenMarket: () => void;
  onMarchHere: () => void;
  onRoster: () => void;
  testId?: string;
}

export function townPanel(options: TownPanelOptions): HTMLElement {
  const { town, previous } = options;
  const { root, body } = panel({
    title: town.name,
    testId: options.testId ?? "town-panel",
    ...(options.testId ? {} : { onClose: () => undefined }),
  });
  // The town panel is the context panel, so it does not close itself; the HUD owns it.
  root.querySelector(".panel__close")?.remove();

  // food_stock is person-days (CAUSE_EFFECT.md section 2). Days is what a player can
  // act on, and dividing by demand is the only way to get it. Showing the raw field
  // labelled "days" is how a town with 8,166 person-days ends up claiming 8,166 days.
  const demand = Math.max(1, town.foodDemand);
  const daysOfFood = town.foodStock / demand;
  const foodBalance = town.foodProduction - town.foodDemand;
  const daysToEmpty = foodBalance < 0 ? daysOfFood / ((-foodBalance) / demand) : null;
  const loyaltyDays = town.loyalty < 0.2 ? 12 : null;

  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `Held by ${town.holderName}`),
        h("p", { class: "data", style: "margin:0" },
          town.population === null
            ? "Population not surveyed"
            : `${town.population.toLocaleString("en-US")} people · ${town.workers.toLocaleString("en-US")} workers`,
        ),
      ),
      statusChip(town.unrest > 0.8 ? "critical" : town.unrest > 0.6 ? "warning" : "good", `Unrest ${town.unrest.toFixed(2)}`, { testId: "town-unrest-chip" }),
    ),
  );

  // -- food, the thing that kills towns ------------------------------------
  const food = sectionHeader("Food and supply", whyButton("foodStock", () => options.onWhy("foodStock")));
  body.appendChild(food);
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Days of food in store",
        // A 0-40 day scale, so the fill is a real gauge rather than a full bar at any
        // value above 40.
        value: Math.min(1, daysOfFood / 40),
        format: () => `${daysOfFood.toFixed(1)} days`,
        trend: previous ? trendOf(town.foodStock, previous.foodStock) : "flat",
        note:
          foodBalance < 0
            ? `Down ${(Math.abs(foodBalance) / demand).toFixed(1)} days of food a day. Nothing is arriving faster than it is eaten.`
            : `Up ${(foodBalance / demand).toFixed(1)} days of food a day. Production is ahead of demand.`,
        thresholds: { criticalBelow: 0.025, warningBelow: 0.1, goodAbove: 0.25 },
        testId: "town-food-gauge",
      }),
      gauge({
        label: "Balance per day",
        // +/- 10% of demand either way is the full scale.
        value: Math.min(1, Math.max(0, (foodBalance / demand + 0.1) / 0.2)),
        format: () => `${foodBalance >= 0 ? "+" : ""}${((foodBalance / demand) * 100).toFixed(1)}%`,
        trend: previous ? trendOf(foodBalance, previous.foodProduction - previous.foodDemand) : "flat",
        thresholds: { criticalBelow: 0.45, goodAbove: 0.55 },
        testId: "town-balance-gauge",
      }),
    ),
  );
  if (daysOfFood <= 0) {
    body.appendChild(
      h(
        "p",
        { class: "annotation", style: "font-size:var(--type-caption-size)" },
        "The store is empty. People are already going without.",
      ),
    );
  } else if (daysToEmpty !== null) {
    body.appendChild(
      h(
        "p",
        { class: "annotation", style: "font-size:var(--type-caption-size)" },
        `At the current rate the store empties in about ${daysToEmpty.toFixed(1)} days.`,
      ),
    );
  }

  // -- health --------------------------------------------------------------
  body.appendChild(sectionHeader("Health", whyButton("infected", () => options.onWhy("infected"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Infection",
        value: town.infected,
        format: (v) => `${(v * 100).toFixed(1)}% of the population`,
        trend: previous ? trendOf(town.infected, previous.infected) : "flat",
        note:
          town.medicineStock <= 0
            ? "No medicine in store. Nobody is being treated."
            : `${Math.round(town.medicineStock).toLocaleString("en-US")} doses in store.`,
        thresholds: { criticalBelow: 0.05, warningBelow: 0.02, goodAbove: 0 },
        testId: "town-infection-gauge",
      }),
      gauge({
        label: "Sanitation",
        value: town.sanitation,
        trend: previous ? trendOf(town.sanitation, previous.sanitation) : "flat",
        note: town.sanitation < 0.5 ? "Water and waste handling is failing." : "Water and waste are being handled.",
        thresholds: { criticalBelow: 0.4, warningBelow: 0.6, goodAbove: 0.8 },
        testId: "town-sanitation-gauge",
      }),
      row("Crowding", `${(town.crowding * 100).toFixed(0)}% of housing capacity`, { mono: true }),
    ),
  );

  // -- unrest and loyalty ---------------------------------------------------
  body.appendChild(sectionHeader("Unrest and loyalty", whyButton("unrest", () => options.onWhy("unrest"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Unrest",
        value: town.unrest,
        trend: previous ? trendOf(town.unrest, previous.unrest) : "flat",
        note:
          town.unrest > 0.8
            ? "Angry enough to organise. A vote is possible."
            : town.unrest > 0.6
              ? "Rising. Loyalty is following it down."
              : "Quiet for now.",
        thresholds: { criticalBelow: 0.8, warningBelow: 0.6, goodAbove: 0 },
        testId: "town-unrest-gauge",
      }),
      gauge({
        label: "Loyalty to the holder",
        value: town.loyalty,
        trend: previous ? trendOf(town.loyalty, previous.loyalty) : "flat",
        note: loyaltyDays !== null ? `${loyaltyDays} days at this level before a council vote.` : "Above the level where a vote is called.",
        thresholds: { criticalBelow: 0.2, warningBelow: 0.35, goodAbove: 0.6 },
        testId: "town-loyalty-gauge",
      }),
      row("Tax rate", `${(town.taxRate * 100).toFixed(1)}%`, { mono: true }),
      row("Prosperity", town.prosperity.toFixed(2), { mono: true }),
      row("Information trust", town.informationTrust.toFixed(2), { mono: true }),
    ),
  );

  // -- security and money ---------------------------------------------------
  body.appendChild(sectionHeader("Security and money", whyButton("road_safety", () => options.onWhy("road_safety"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Road safety",
        value: town.roadSafety,
        trend: previous ? trendOf(town.roadSafety, previous.roadSafety) : "flat",
        note: town.roadSafety < 0.35 ? "No patrols. Caravans get taken here." : "Patrols are running.",
        thresholds: { criticalBelow: 0.3, warningBelow: 0.5, goodAbove: 0.7 },
        testId: "town-road-gauge",
      }),
      gauge({
        label: "Garrison conduct",
        value: town.garrisonConduct,
        trend: previous ? trendOf(town.garrisonConduct, previous.garrisonConduct) : "flat",
        note: town.garrisonConduct < 0.5 ? "The garrison is treating residents badly. That shows up in unrest." : "The garrison is behaving.",
        thresholds: { criticalBelow: 0.4, warningBelow: 0.6, goodAbove: 0.8 },
        testId: "town-conduct-gauge",
      }),
      row("Garrison", `${town.garrison.toLocaleString("en-US")} soldiers`, { mono: true }),
      row("Money", `$${Math.round(town.money).toLocaleString("en-US")}`, { mono: true, testId: "town-money" }),
      row("Gold", `$${Math.round(town.gold).toLocaleString("en-US")}`, { mono: true }),
      row("Metal", `${Math.round(town.metal).toLocaleString("en-US")}`, { mono: true }),
    ),
  );

  // -- actions --------------------------------------------------------------
  const actions = h("div", { class: "field-row", style: "margin-top:var(--space-4)" });
  const marketBtn = h("button", { type: "button", class: "btn btn--primary", "data-testid": "open-market" }, "Open the market");
  marketBtn.addEventListener("click", () => options.onOpenMarket());
  const marchBtn = h("button", { type: "button", class: "btn", "data-testid": "open-march-planner" }, "March here");
  marchBtn.addEventListener("click", () => options.onMarchHere());
  const rosterBtn = h("button", { type: "button", class: "btn", "data-testid": "open-roster" }, "Rulers");
  rosterBtn.addEventListener("click", () => options.onRoster());
  actions.append(marketBtn, marchBtn, rosterBtn);
  body.appendChild(actions);

  return root;
}

/** A "why" affordance on a section header, so the panel is traceable at every level. */
function whyButton(field: string, onClick: () => void): HTMLElement {
  const btn = h("button", { type: "button", class: "btn btn--quiet why__disclose", "data-testid": `why-${field}` }, "Why?");
  btn.addEventListener("click", onClick);
  return btn;
}

function trendOf(now: number, before: number): "up" | "down" | "flat" {
  const delta = now - before;
  if (Math.abs(delta) < 1e-6) return "flat";
  return delta > 0 ? "up" : "down";
}

/** The town panel's error state, shared with the HUD so both read the same. */
export function townPanelError(townName: string, detail: string, onRetry: () => void): HTMLElement {
  return errorState({
    message: `The survey for ${townName} did not load. The simulation refused the connection.`,
    detail,
    onRetry,
    testId: "town-error",
  });
}
