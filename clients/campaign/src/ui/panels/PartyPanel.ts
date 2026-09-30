/**
 * The party panel. `UI_UX.md` section 2.
 *
 * Troops, roles, goods, and the supplies that run down every day. The supplies are
 * shown as days remaining, not as raw numbers, because "46 grain" is not information
 * a player can act on and "3.1 days of grain" is.
 *
 * The warnings at the top are the point of the panel. `UI_UX.md` section 1 says warn
 * early, and `ART_DIRECTION.md` section 5.3 says a status is carried by its glyph as
 * well as its colour, so each one is a `statusChip`: the glyph alone is enough to
 * read it, the word "Critical" or "Warning" is in the accessible name, and the colour
 * is the third signal rather than the only one.
 *
 * Where a warning comes from matters, so both sources are kept distinct. Anything the
 * simulation hands in through `warnings` is its own answer and is shown as sent. The
 * rest is arithmetic on a number the player can already see on this panel, printed
 * next to the value it came from — the same rule the town panel follows, and for the
 * same reason: the client runs no simulation of its own.
 */

import { h, row, sectionHeader } from "../dom.js";
import { emptyState, errorState, gauge, panel, stamp, statusChip, dataTable, type Column, type StatusKind } from "../kit.js";
import { partySkeleton } from "./skeletons.js";
import { asBottomSheet, stackable } from "./narrow.js";
import type { PartyState, ResourceWarning, TroopStack } from "../../data/types.js";

/** The empty-wagon copy, verbatim from ART_DIRECTION.md section 10.2. */
const NOTHING_TO_HAUL = "Caravan holds no goods. Buy something in a market before hauling.";

export interface PartyPanelOptions {
  /** `null` when nothing is under the player's command. */
  party: PartyState | null;
  previous?: PartyState | null;
  onClose?: () => void;
  onWhy: (field: string) => void;
  /**
   * Warnings the simulation has already raised about this party. Shown as sent,
   * alongside the ones this panel derives from its own figures.
   */
  warnings?: ResourceWarning[];
  /** The party roll is still being read. `party-skeleton` goes up first. */
  loading?: boolean;
  testId?: string;
}

export function partyPanel(options: PartyPanelOptions): HTMLElement {
  if (options.loading) return partySkeleton(options.party?.name ?? "Party");

  const { party, previous } = options;
  if (!party) return partyPanelEmpty(options);

  const { root, body } = panel({
    title: party.name,
    testId: options.testId ?? "party-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);

  const headcount = party.troops.reduce((a, t) => a + t.count, 0);
  const dailyWages = party.troops.reduce((a, t) => a + t.count * t.wage, 0);
  // One person-day of rations per person per day, the unit CAUSE_EFFECT.md section 2
  // uses for food everywhere in this client.
  const dailyFood = headcount * 0.85;
  const daysOfFood = dailyFood > 0 ? party.food / dailyFood : 0;
  const warnings = collectWarnings(party, { headcount, dailyWages, dailyFood, daysOfFood }, options.warnings ?? []);

  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `Led by ${party.leaderName}`),
        h("p", { class: "caption", style: "margin:0" }, `${headcount} in the party`),
      ),
      party.destination
        ? statusChip("info", `Marching on ${party.destination.name}`, { testId: "party-marching" })
        : statusChip("good", "In camp", { testId: "party-camped" }),
    ),
  );

  // -- shortages, before anything else --------------------------------------
  // The section is drawn whether or not anything is short. A header that appears and
  // disappears with the state is a jump, and "nothing is short" is itself worth
  // saying: it is the answer to the question the section asks.
  body.appendChild(sectionHeader("Shortages", whyBtn("food", () => options.onWhy("food"))));
  if (warnings.length === 0) {
    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:0 0 var(--space-4)", "data-testid": "party-warnings-clear" },
        "Nothing short. Grain, medicine, metal and wages are all holding.",
      ),
    );
  } else {
    const list = h("ul", { class: "warnings party__warnings", "data-testid": "party-warnings" });
    for (const w of warnings) {
      const item = h("li", { class: "party__warning-item" });
      item.appendChild(
        h(
          "div",
          { class: "warning", "data-severity": w.severity, "data-testid": `party-warning-${w.id}` },
          statusChip(w.kind, w.headline, { testId: `party-warning-chip-${w.id}` }),
          h("p", { class: "caption", style: "margin:var(--space-1) 0 0" }, w.detail),
        ),
      );
      item.appendChild(whyBtn(w.field, () => options.onWhy(w.field)));
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  // -- supplies, as days -----------------------------------------------------
  body.appendChild(sectionHeader("Supplies", whyBtn("food", () => options.onWhy("food"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Grain",
        value: Math.min(1, party.food / 60),
        format: () => `${party.food.toFixed(1)} days`,
        trend: previous ? trend(party.food, previous.food) : "flat",
        note:
          dailyFood > 0
            ? `${dailyFood.toFixed(1)} person-days a day. Runs out in ${daysOfFood.toFixed(1)} days at this rate.`
            : "Nobody is eating. The ration line is nil until troops are raised.",
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
        label: "Ammunition and metal",
        value: Math.min(1, party.metal / 100),
        format: () => `${Math.round(party.metal)} units`,
        trend: previous ? trend(party.metal, previous.metal) : "flat",
        note: party.metal <= 0 ? "Nothing to fire and nothing to repair with." : "Rounds, and material for the workshop.",
        thresholds: { criticalBelow: 0.1, warningBelow: 0.3, goodAbove: 0.6 },
        testId: "party-metal-gauge",
      }),
    ),
  );

  // -- condition and money ---------------------------------------------------
  body.appendChild(sectionHeader("Condition and wages", whyBtn("morale", () => options.onWhy("morale"))));
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
        thresholds: { warningBelow: 0.45, criticalBelow: 0.7, goodAbove: 0 },
        testId: "party-fatigue-gauge",
      }),
      // The stamp is the ART_DIRECTION.md section 6.2 motif, and it is only warranted
      // when money is actually owed: a wage bill unpaid is a confirmed state, not a
      // forecast.
      h(
        "div",
        { class: "row", "data-testid": "party-wages-row" },
        h("span", { class: "row__label label" }, "Wages owed"),
        h(
          "span",
          { class: "row__value" },
          h("span", { class: "data", "data-testid": "party-wages-owed" }, money(party.wagesOwed)),
          party.wagesOwed > 0 ? stamp("Owed", "critical") : null,
        ),
      ),
      row("Daily wage bill", rate(dailyWages), { mono: true, testId: "party-daily-wages" }),
      row("Daily rations", `${dailyFood.toFixed(1)} person-days`, { mono: true, testId: "party-daily-rations" }),
      row("Purse", money(party.money), { mono: true, testId: "party-purse" }),
      row("March speed", `${party.speedKmPerDay.toFixed(0)} km/day`, { mono: true, testId: "party-speed" }),
    ),
  );

  // -- roles -----------------------------------------------------------------
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

  // -- troops ----------------------------------------------------------------
  body.appendChild(sectionHeader("Troops"));
  if (party.troops.length === 0) {
    body.appendChild(
      emptyState(
        "Nobody is following you.",
        "Recruit in a town before you march anywhere. A party on its own is not a party.",
      ),
    );
  } else {
    const columns: Column<TroopStack>[] = [
      { header: "Unit", render: (t) => h("span", { class: "label" }, t.name) },
      { header: "Count", numeric: true, testId: "troop-count", render: (t) => String(t.count) },
      { header: "Quality", numeric: true, testId: "troop-quality", render: (t) => `${t.quality}/5` },
      { header: "Morale", numeric: true, testId: "troop-morale", render: (t) => t.morale.toFixed(2) },
      { header: "Wage a day", numeric: true, testId: "troop-wage", render: (t) => rate(t.count * t.wage) },
    ];
    body.appendChild(stackable(dataTable("Party troops", columns, party.troops, "party-troops")));
  }

  // -- goods -----------------------------------------------------------------
  body.appendChild(sectionHeader("Goods in the wagons"));
  const held = party.goods.filter((g) => g.quantity > 0);
  if (held.length === 0) {
    body.appendChild(emptyState("The wagons are empty.", NOTHING_TO_HAUL));
  } else {
    body.appendChild(
      stackable(
        dataTable(
          "Goods carried",
          [
            { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
            { header: "Quantity", numeric: true, testId: "party-good-qty", render: (g) => String(g.quantity) },
            { header: "Paid", numeric: true, render: (g) => money(g.avgPaid) },
          ],
          held,
          "party-goods",
        ),
      ),
    );
  }

  return root;
}

/** Nothing under command. The roster is the way out of the state, so it is offered. */
function partyPanelEmpty(options: PartyPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "No party",
    testId: options.testId ?? "party-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);
  body.appendChild(
    h(
      "div",
      { style: "margin-top:var(--space-2)" },
      emptyState(
        "No party under your command.",
        "Troops, supplies and wages appear once a company is raised. Take a ruler from the roster, or raise a company of your own.",
      ),
    ),
  );
  return root;
}

/**
 * The party panel's error state: a plain sentence and a way to recover
 * (CONSTITUTION.md section 1.3). The cause goes to the console, not to the screen.
 */
export function partyPanelError(detail: string, onRetry: () => void): HTMLElement {
  return errorState({
    message: "The party roll did not load. The connection to the simulation was refused.",
    detail,
    onRetry,
    testId: "party-error",
  });
}

function whyBtn(field: string, onClick: () => void): HTMLElement {
  const btn = h("button", { type: "button", class: "btn btn--quiet why__disclose", "data-testid": `party-why-${field}` }, "Why?");
  btn.addEventListener("click", onClick);
  return btn;
}

/** Whole dollars, for the balances a player thinks in. */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** Cents, for the daily figures, where a rounded dollar hides the rate. */
function rate(v: number): string {
  return `$${v.toFixed(2)}`;
}

function trend(now: number, before: number): "up" | "down" | "flat" {
  const d = now - before;
  if (Math.abs(d) < 1e-6) return "flat";
  return d > 0 ? "up" : "down";
}

// -- warnings -----------------------------------------------------------------

interface PartyWarning {
  id: string;
  kind: StatusKind;
  severity: "critical" | "warning";
  headline: string;
  detail: string;
  /** The field to open the Why panel on. */
  field: string;
  /** The number the warning was calculated from, so it can be de-duplicated. */
  about: string;
}

/**
 * The warnings this panel raises itself.
 *
 * Each one is `value / rate`, where the rate is printed on the gauge two sections
 * below, and each is written in the form ART_DIRECTION.md section 10.2 sets out: the
 * figure in the headline, the arithmetic underneath in captions. Nothing here is
 * forecast, and nothing here is a second opinion about a balance the simulation owns.
 */
function deriveWarnings(
  party: PartyState,
  figures: { headcount: number; dailyWages: number; dailyFood: number; daysOfFood: number },
): PartyWarning[] {
  const out: PartyWarning[] = [];
  const { headcount, dailyWages, dailyFood, daysOfFood } = figures;

  if (headcount > 0) {
    if (daysOfFood < 3) {
      out.push({
        id: "grain",
        kind: "critical",
        severity: "critical",
        headline: `GRAIN ${daysOfFood.toFixed(1)} DAYS`,
        detail: `${party.food.toFixed(1)} person-days of grain left for ${headcount} people, eating ${dailyFood.toFixed(1)} a day.`,
        field: "food",
        about: "food",
      });
    } else if (daysOfFood < 10) {
      out.push({
        id: "grain",
        kind: "warning",
        severity: "warning",
        headline: `GRAIN ${daysOfFood.toFixed(1)} DAYS`,
        detail: `${daysOfFood.toFixed(1)} days of grain at the current ration. Buy before the road, not on it.`,
        field: "food",
        about: "food",
      });
    }
  }

  if (party.medicine <= 0) {
    out.push({
      id: "medicine",
      kind: "critical",
      severity: "critical",
      headline: "MEDICINE 0 DOSES",
      detail: "Wounded will go untreated. The surgeon has nothing to work with.",
      field: "medicine",
      about: "medicine",
    });
  } else if (party.medicine < 5) {
    out.push({
      id: "medicine",
      kind: "warning",
      severity: "warning",
      headline: `MEDICINE ${Math.round(party.medicine)} DOSES`,
      detail: `${Math.round(party.medicine)} doses left. Enough for the next few casualties, not the next few days.`,
      field: "medicine",
      about: "medicine",
    });
  }

  if (party.metal <= 0) {
    out.push({
      id: "metal",
      kind: "critical",
      severity: "critical",
      headline: "AMMUNITION 0 UNITS",
      detail: "Nothing to fire and nothing to repair with. A march in this state is a fight with no second half.",
      field: "metal",
      about: "metal",
    });
  } else if (party.metal < 20) {
    out.push({
      id: "metal",
      kind: "warning",
      severity: "warning",
      headline: `AMMUNITION ${Math.round(party.metal)} UNITS`,
      detail: `${Math.round(party.metal)} units of metal for rounds and repair. Below a full load.`,
      field: "metal",
      about: "metal",
    });
  }

  if (party.morale < 0.3) {
    out.push({
      id: "morale",
      kind: "critical",
      severity: "critical",
      headline: `MORALE ${party.morale.toFixed(2)}`,
      detail: "They will break rather than hold a line. Morale recovers slowly and not on the road.",
      field: "morale",
      about: "morale",
    });
  } else if (party.morale < 0.5) {
    out.push({
      id: "morale",
      kind: "warning",
      severity: "warning",
      headline: `MORALE ${party.morale.toFixed(2)}`,
      detail: "Below the level where a unit is worth sending into a line fight.",
      field: "morale",
      about: "morale",
    });
  }

  if (party.wagesOwed > 0) {
    const daysOfWages = dailyWages > 0 ? party.wagesOwed / dailyWages : 0;
    const short = party.wagesOwed - party.money;
    out.push({
      id: "wages",
      kind: short > 0 ? "critical" : "warning",
      severity: short > 0 ? "critical" : "warning",
      headline: `WAGES OWED ${money(party.wagesOwed)}`,
      detail:
        short > 0
          ? `Short ${money(short)} against a purse of ${money(party.money)}. That is ${daysOfWages.toFixed(1)} days of the current wage bill, unpaid.`
          : `${daysOfWages.toFixed(1)} days of the current wage bill, unpaid. It is ${money(dailyWages)} a day to clear.`,
      field: "wagesOwed",
      about: "wages",
    });
  } else if (dailyWages > party.money) {
    out.push({
      id: "purse",
      kind: "critical",
      severity: "critical",
      headline: `PURSE ${money(party.money)}`,
      detail: `One day of wages costs ${rate(dailyWages)}. The purse will not cover a single day of the bill.`,
      field: "money",
      about: "wages",
    });
  }

  return out;
}

/**
 * The simulation's own warnings first, then the ones derived here, with anything the
 * simulation has already said about a field left out of the derived list. Two warnings
 * about the same field would be noise, and the simulation's is the authoritative one.
 */
function collectWarnings(
  party: PartyState,
  figures: { headcount: number; dailyWages: number; dailyFood: number; daysOfFood: number },
  fromSimulation: ResourceWarning[],
): PartyWarning[] {
  const heard = fromSimulation.filter((w) => w.entityId === party.id || w.entityId === "");
  const out: PartyWarning[] = heard.map((w) => ({
    id: w.id,
    kind: (w.severity === "critical" ? "critical" : "warning") as StatusKind,
    severity: w.severity,
    headline: w.headline,
    detail: w.detail,
    field: w.field,
    about: w.field,
  }));
  const spoken = new Set(out.map((w) => w.about));
  for (const w of deriveWarnings(party, figures)) {
    if (spoken.has(w.about)) continue;
    spoken.add(w.about);
    out.push(w);
  }
  return out;
}

