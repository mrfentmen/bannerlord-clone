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

import { h } from "../dom.js";
import { emptyState, errorState, panel, statusChip } from "../kit.js";
import type { MarchPlan, PartyState, SettlementOption, SimulationProvider } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

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
    title: "March planner",
    testId: options.testId ?? "march-planner",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  // Default to the nearest destination the simulation can write an order for. A place
  // with no town record is a legitimate thing to see in the list and a useless thing
  // to open first.
  let selected =
    options.destinations.find((d) => d.simulationId !== null)?.id ?? options.destinations[0]?.id ?? "";
  let plan: MarchPlan | null = null;
  let planning = false;
  let planningUnavailable = false;
  let planToken = 0;

  const target = h(
    "select",
    { id: "march-target", class: "field__input label", "data-testid": "march-target" },
    options.destinations.map((d) =>
      h("option", { value: d.id, selected: d.id === selected }, `${d.name} — ${d.distanceHint}`),
    ),
  );
  target.addEventListener("change", () => {
    selected = target.value;
    void replan();
  });

  function render(): void {
    body.replaceChildren();

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
      // The skeleton mirrors the real layout: a wide route block, then a row of
      // three cost cells, then a row of warnings.
      const sk = h("div", { class: "skeleton skeleton--march", "data-testid": "march-skeleton", "aria-busy": "true", role: "status" });
      sk.appendChild(h("span", { class: "visually-hidden" }, "Pricing the march."));
      const block = h("div", { class: "skeleton__block" });
      block.style.height = "74px";
      sk.appendChild(block);
      for (let i = 0; i < 3; i += 1) {
        const cell = h("div", { class: "skeleton__block" });
        cell.style.height = "54px";
        sk.appendChild(cell);
      }
      body.appendChild(sk);
      return;
    }

    if (!plan) {
      body.appendChild(
        h("p", { class: "caption" }, "Choose a destination to see the travel time and the cost before you commit."),
      );
      return;
    }

    if (plan.unmapped) {
      body.appendChild(
        h(
          "div",
          { class: "warnings", "data-testid": "march-unmapped" },
          h("p", { class: "warning", "data-severity": "warning" }, plan.warnings[0] ?? "No surveyed route."),
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
      costCell("Grain", `${plan.cost.food.toFixed(1)}`, `days`, `party holds ${options.party.food.toFixed(1)}`, "march-cost-food"),
      costCell("Money", `$${Math.round(plan.cost.money).toLocaleString("en-US")}`, `wages, ${headcount} troops`, `purse $${Math.round(options.party.money).toLocaleString("en-US")}`, "march-cost-money"),
      costCell("Metal", `${plan.cost.metal.toFixed(1)}`, "ammunition and repair", `party holds ${Math.round(options.party.metal)}`, "march-cost-metal"),
    );
    body.appendChild(costs);

    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin-top:var(--space-2)", "data-testid": "march-supply" },
        plan.daysOfFoodOnArrival === null
          ? "No grain left on arrival. The march outlasts the food."
          : plan.daysOfFoodOnArrival > 0
            ? `About ${plan.daysOfFoodOnArrival.toFixed(1)} days of grain left on arrival.`
            : "The grain runs out before the party arrives.",
      ),
    );

    // -- warnings ------------------------------------------------------------
    if (plan.warnings.length > 0) {
      const list = h("ul", { class: "warnings", "data-testid": "march-warnings" });
      for (const w of plan.warnings) {
        const severe = w.startsWith("Short") || w.startsWith("Wages") || w.startsWith("The grain");
        list.appendChild(h("li", { class: "warning", "data-severity": severe ? "critical" : "warning" }, w));
      }
      body.appendChild(list);
    }

    // -- commit --------------------------------------------------------------
    const commitBtn = h(
      "button",
      { type: "button", class: "btn btn--primary", "data-testid": "march-commit", style: "margin-top:var(--space-3);width:100%" },
      `March on ${plan.destinationName}`,
    );
    commitBtn.addEventListener("click", () => void commitMarch());
    body.appendChild(commitBtn);
    body.appendChild(
      h(
        "p",
        { class: "caption", style: "text-align:center" },
        "The cost is drawn down a day at a time. If something changes on the road, the bill changes with it.",
      ),
    );
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
    render();
    try {
      const result = await options.provider.planMarch({
        partyId: options.party.id,
        destinationSettlementId: simId,
        departure: "now",
      });
      if (token !== planToken) return;
      plan = result;
    } catch (err) {
      if (token !== planToken) return;
      const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The march could not be priced.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      options.onError?.(`${message} :: ${detail}`);
      plan = null;
      body.replaceChildren();
      body.appendChild(errorState({ message, detail, onRetry: () => void replan(), testId: "march-error" }));
    } finally {
      if (token === planToken) {
        planning = false;
        render();
      }
    }
  }

  async function commitMarch(): Promise<void> {
    const simId = simIdFor(selected);
    if (!simId) return;
    try {
      await options.provider.commitMarch({
        partyId: options.party.id,
        destinationSettlementId: simId,
        departure: "now",
      });
      if (plan) options.onCommitted?.(plan);
    } catch (err) {
      const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The order to march was refused.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      options.onError?.(`${message} :: ${detail}`);
      body.appendChild(errorState({ message, detail, onRetry: () => void commitMarch(), testId: "march-commit-error" }));
    }
  }

  void replan();
  return { root, refresh: () => void replan() };
}

function costCell(key: string, value: string, unit: string, note: string, testId: string): HTMLElement {
  return h(
    "div",
    { class: "cost", "data-testid": testId },
    h("div", { class: "cost__key" }, key),
    h("div", { class: "data" }, value),
    h("div", { class: "caption" }, unit),
    h("div", { class: "caption" }, note),
  );
}
