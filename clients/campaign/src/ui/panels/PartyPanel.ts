/**
 * The party panel. `UI_UX.md` section 2.
 *
 * Troops, roles, goods, and the supplies that run down every day. The supplies are
 * shown as days remaining, not as raw numbers, because "46 grain" is not information
 * a player can act on and "3.1 days of grain" is.
 */

import { h, row, sectionHeader } from "../dom.js";
import { emptyState, gauge, panel, statusChip, dataTable, type Column } from "../kit.js";
import type { PartyState, TroopStack } from "../../data/types.js";

export interface PartyPanelOptions {
  party: PartyState;
  previous?: PartyState | null;
  onClose?: () => void;
  onWhy: (field: string) => void;
  testId?: string;
}

export function partyPanel(options: PartyPanelOptions): HTMLElement {
  const { party, previous } = options;
  const { root, body } = panel({
    title: party.name,
    testId: options.testId ?? "party-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  root.querySelector(".panel__close")?.remove();

  const headcount = party.troops.reduce((a, t) => a + t.count, 0);
  const dailyWages = party.troops.reduce((a, t) => a + t.count * t.wage, 0);
  const dailyFood = headcount * 0.85;

  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `Led by ${party.leaderName}`),
        h("p", { class: "data", style: "margin:0" }, `${headcount} in the party`),
      ),
      party.destination
        ? statusChip("info", `Marching on ${party.destination.name}`, { testId: "party-marching" })
        : statusChip("good", "In camp", { testId: "party-camped" }),
    ),
  );

  // -- supplies, as days -----------------------------------------------------
  body.appendChild(sectionHeader("Supplies", whyBtn("food", () => options.onWhy("food"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Grain",
        value: Math.min(1, party.food / 60),
        format: () => `${party.food.toFixed(1)} days · ${(dailyFood).toFixed(1)}/day`,
        trend: previous ? trend(party.food, previous.food) : "down",
        note: `Runs out in ${(party.food / dailyFood).toFixed(1)} days at this rate.`,
        thresholds: { criticalBelow: 0.05, warningBelow: 0.2, goodAbove: 0.5 },
        testId: "party-food-gauge",
      }),
      gauge({
        label: "Medicine",
        value: Math.min(1, party.medicine / 20),
        format: () => `${Math.round(party.medicine)} doses`,
        trend: previous ? trend(party.medicine, previous.medicine) : "flat",
        note: party.medicine <= 0 ? "Wounded will go untreated." : "Used by the surgeon.",
        thresholds: { criticalBelow: 0.05, warningBelow: 0.2, goodAbove: 0.5 },
        testId: "party-medicine-gauge",
      }),
      gauge({
        label: "Metal",
        value: Math.min(1, party.metal / 100),
        format: () => `${Math.round(party.metal)}`,
        trend: previous ? trend(party.metal, previous.metal) : "flat",
        note: "Ammunition and repair.",
        thresholds: { criticalBelow: 0.1, warningBelow: 0.3, goodAbove: 0.6 },
        testId: "party-metal-gauge",
      }),
    ),
  );

  // -- condition ------------------------------------------------------------
  body.appendChild(sectionHeader("Condition", whyBtn("morale", () => options.onWhy("morale"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Morale",
        value: party.morale,
        trend: previous ? trend(party.morale, previous.morale) : "flat",
        note: party.morale < 0.4 ? "They will not hold a line for long." : "Holding.",
        thresholds: { criticalBelow: 0.3, warningBelow: 0.5, goodAbove: 0.75 },
        testId: "party-morale-gauge",
      }),
      gauge({
        label: "Fatigue",
        value: party.fatigue,
        trend: previous ? trend(party.fatigue, previous.fatigue) : "flat",
        note: party.fatigue > 0.6 ? "Attrition is taking hold." : "Rested enough.",
        thresholds: { criticalBelow: 0, warningBelow: 0, goodAbove: 0.35 },
        testId: "party-fatigue-gauge",
      }),
      row("Wages owed", `$${Math.round(party.wagesOwed).toLocaleString("en-US")}`, { mono: true, testId: "party-wages-owed" }),
      row("Daily wages", `$${dailyWages.toFixed(2)}`, { mono: true }),
      row("Daily rations", `${dailyFood.toFixed(1)} person-days`, { mono: true }),
      row("March speed", `${party.speedKmPerDay.toFixed(0)} km/day`, { mono: true }),
    ),
  );

  // -- roles ----------------------------------------------------------------
  body.appendChild(sectionHeader("Roles"));
  const roles = h("div", { class: "ledger__list" });
  const roleRows: [string, string | undefined][] = [
    ["Quartermaster", party.roles.quartermaster],
    ["Surgeon", party.roles.surgeon],
    ["Scout", party.roles.scout],
    ["Engineer", party.roles.engineer],
  ];
  for (const [label, who] of roleRows) {
    roles.appendChild(
      row(
        label,
        who ?? h("span", { class: "caption" }, "Nobody. This role is unfilled."),
      ),
    );
  }
  body.appendChild(roles);

  // -- troops ---------------------------------------------------------------
  body.appendChild(sectionHeader("Troops"));
  if (party.troops.length === 0) {
    body.appendChild(emptyState("Nobody is following you.", "Recruit in a town before you march anywhere."));
  } else {
    const columns: Column<TroopStack>[] = [
      { header: "Unit", render: (t) => h("span", { class: "label" }, t.name) },
      { header: "Count", numeric: true, testId: "troop-count", render: (t) => String(t.count) },
      { header: "Quality", numeric: true, render: (t) => `${t.quality}/5` },
      { header: "Morale", numeric: true, render: (t) => t.morale.toFixed(2) },
      { header: "Wage/day", numeric: true, render: (t) => `$${(t.count * t.wage).toFixed(2)}` },
    ];
    body.appendChild(dataTable("Party troops", columns, party.troops, "party-troops"));
  }

  // -- goods ----------------------------------------------------------------
  body.appendChild(sectionHeader("Goods in the wagons"));
  if (party.goods.filter((g) => g.quantity > 0).length === 0) {
    body.appendChild(
      emptyState(
        "The wagons are empty.",
        "Caravan holds no goods. Buy something in a market before hauling.",
      ),
    );
  } else {
    const held = party.goods.filter((g) => g.quantity > 0);
    body.appendChild(
      dataTable(
        "Goods carried",
        [
          { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
          { header: "Quantity", numeric: true, testId: "party-good-qty", render: (g) => String(g.quantity) },
          { header: "Paid", numeric: true, render: (g) => `$${g.avgPaid.toFixed(2)}` },
        ],
        held,
        "party-goods",
      ),
    );
  }

  return root;
}

function whyBtn(field: string, onClick: () => void): HTMLElement {
  const btn = h("button", { type: "button", class: "btn btn--quiet why__disclose", "data-testid": `party-why-${field}` }, "Why?");
  btn.addEventListener("click", onClick);
  return btn;
}

function trend(now: number, before: number): "up" | "down" | "flat" {
  const d = now - before;
  if (Math.abs(d) < 1e-6) return "flat";
  return d > 0 ? "up" : "down";
}
