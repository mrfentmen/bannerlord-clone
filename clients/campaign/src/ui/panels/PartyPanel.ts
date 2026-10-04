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
import type {
  PartyState,
  ResourceWarning,
  TroopStack,
  UpgradeTroopsResult,
} from "../../data/types.js";
import { troopTier, TROOP_TIERS } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import { SMITHING_RECIPES } from "../../campaign/fieldSystems.js";

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
  /**
   * Promote one troop stack a tier. Task 146.
   *
   * The panel decides whether the button is live from the stack's own XP bank and
   * the tier ladder in `data/types.ts`; the simulation owns whether the promotion
   * happens and what it costs, and its answer — including the reason a promotion
   * was refused — is printed verbatim.
   */
  onUpgradeTroops?: (stackId: string) => Promise<UpgradeTroopsResult>;
  /**
   * Toggle forced march (+30% speed, daily morale/food cost). Only drawn when
   * the caller can actually send the order.
   */
  onToggleForcedMarch?: (active: boolean) => Promise<void>;
  /**
   * Smelt captured arms into metal. Only drawn when the caller can send it.
   */
  onSmeltArms?: (quantity: number) => Promise<{ metal: number }>;
  /**
   * Forge a bench recipe. Only drawn when the caller can send it.
   */
  onForgeItem?: (recipeId: string) => Promise<{ name: string }>;
  /**
   * Attempt a prison break against a holder. Only drawn when the caller can
   * send it and the party has imprisoned troops.
   */
  onPrisonBreak?: (holderId: string, teamSize: number) => Promise<{ success: boolean; freed: number; wounded: number; caught: boolean }>;
  /** Open crafting orders. Only drawn with the bench. */
  craftingOrders?: { id: string; patron: string; patronTitle: string; recipeId: string; recipeName: string; daysLeft: number; reward: number }[];
  /** Fulfill a crafting order. Only drawn when the caller can send it. */
  onFulfillOrder?: (orderId: string) => Promise<{ reward: number; line: string }>;
  /**
   * Ransom prisoners for gold. The panel sends the troop id and count; the
   * simulation owns the price and the result. Only drawn when the caller can
   * actually send the order.
   */
  onRansomPrisoners?: (troopId: string, count: number) => Promise<{ gold: number }>;
  /**
   * Recruit prisoners into the party. The panel sends the troop id and count;
   * the simulation owns the cost and the result. Only drawn when the caller can
   * actually send the order.
   */
  onRecruitPrisoners?: (troopId: string, count: number) => Promise<void>;
  /**
   * Split troops off into a new party. The panel sends the stacks and the new
   * party's name; the simulation owns whether the split happens. Only drawn
   * when the caller can actually send the order.
   */
  onSplitParty?: ((input: { troopIds: { stackId: string; count: number }[]; name: string }) => Promise<{ partyId: string }>) | undefined;
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
      // Forced march toggle: Bannerlord's push-harder button.
      ...(options.onToggleForcedMarch
        ? [
            h(
              "div",
              { class: "row", "data-testid": "party-forced-march-row" },
              h("span", { class: "row__label label" }, "Forced march"),
              h(
                "span",
                { class: "row__value" },
                h(
                  "button",
                  {
                    class: "btn",
                    "data-testid": "party-forced-march-toggle",
                    "aria-pressed": String(party.forcedMarch ?? false),
                    onclick: async () => {
                      await options.onToggleForcedMarch?.(!(party.forcedMarch ?? false));
                    },
                  },
                  party.forcedMarch ? "On (+30%, costs morale)" : "Off",
                ),
              ),
            ),
          ]
        : []),
      // Bannerlord-style speed breakdown: each factor that moved the number,
      // with the reason. Only rendered when the provider supplies it.
      ...(party.speedFactors && party.speedFactors.length > 0
        ? [
            h(
              "div",
              { class: "row", "data-testid": "party-speed-factors" },
              h("span", { class: "row__label label" }, "Speed factors"),
              h(
                "span",
                { class: "row__value" },
                ...party.speedFactors.map((f) =>
                  h(
                    "div",
                    { class: "data", title: f.detail },
                    `${f.name} ${f.mult >= 1 ? "+" : ""}${((f.mult - 1) * 100).toFixed(0)}%`,
                  ),
                ),
              ),
            ),
          ]
        : []),
    ),
  );

  // -- smithing ---------------------------------------------------------------
  // Bannerlord's workshop bench: smelt captured arms for metal, forge recipes.
  if (options.onSmeltArms || options.onForgeItem) {
    body.appendChild(sectionHeader("Workshop bench"));
    const bench = h("div", { class: "ledger__list" });
    const arms = party.goods.find((g) => g.goodId === "arms");
    bench.appendChild(
      row(
        "Arms stock",
        `${arms?.quantity ?? 0} (${party.metal} metal)`,
        { mono: true, testId: "party-arms-stock" },
      ),
    );
    if (options.onSmeltArms && (arms?.quantity ?? 0) > 0) {
      bench.appendChild(
        h(
          "div",
          { class: "row" },
          h("span", { class: "row__label label" }, "Smelt"),
          h(
            "span",
            { class: "row__value" },
            h(
              "button",
              {
                class: "btn",
                "data-testid": "party-smelt-arms",
                onclick: async () => {
                  await options.onSmeltArms?.(Math.min(10, arms?.quantity ?? 0));
                },
              },
              `Smelt 10 arms → 20 metal`,
            ),
          ),
        ),
      );
    }
    for (const recipe of SMITHING_RECIPES) {
      const canAfford =
        party.metal >= recipe.metal &&
        (party.goods.find((g) => g.goodId === "fuel")?.quantity ?? 0) >= recipe.fuel;
      bench.appendChild(
        h(
          "div",
          { class: "row" },
          h("span", { class: "row__label label" }, recipe.name),
          h(
            "span",
            { class: "row__value" },
            options.onForgeItem
              ? h(
                  "button",
                  {
                    class: "btn",
                    "data-testid": `party-forge-${recipe.id}`,
                    disabled: canAfford ? undefined : "disabled",
                    title: `${recipe.metal} metal, ${recipe.fuel} fuel`,
                    onclick: async () => {
                      await options.onForgeItem?.(recipe.id);
                    },
                  },
                  `Forge (${recipe.metal}M ${recipe.fuel}F)`,
                )
              : h("span", { class: "data" }, `${recipe.metal} metal, ${recipe.fuel} fuel`),
          ),
        ),
      );
    }
    if ((party.crafted ?? []).length > 0) {
      bench.appendChild(
        row(
          "Stockpile",
          party.crafted!.map((c) => `${c.name} ×${c.count}`).join(", "),
          { testId: "party-crafted" },
        ),
      );
    }
    // Crafting orders: nobles want forged pieces. Bannerlord's smithy loop.
    for (const order of options.craftingOrders ?? []) {
      const hasPiece = (party.crafted ?? []).some((c) => c.recipeId === order.recipeId && c.count > 0);
      bench.appendChild(
        h(
          "div",
          { class: "row" },
          h("span", { class: "row__label label" }, `Order: ${order.recipeName}`),
          h(
            "span",
            { class: "row__value" },
            h("span", { class: "caption" }, `${order.patron} (${order.patronTitle}) — ${order.reward}g, ${order.daysLeft}d left. `),
            options.onFulfillOrder
              ? h(
                  "button",
                  {
                    class: "btn",
                    "data-testid": `party-fulfill-${order.id}`,
                    disabled: hasPiece ? undefined : "disabled",
                    title: hasPiece ? "Deliver the forged piece" : `Forge a ${order.recipeName} first`,
                    onclick: async () => {
                      await options.onFulfillOrder?.(order.id);
                    },
                  },
                  "Deliver",
                )
              : null,
          ),
        ),
      );
    }
    body.appendChild(bench);
  }

  // -- imprisoned --------------------------------------------------------------
  // Bannerlord's roguery: troops captured by enemies can be broken out.
  if ((party.imprisoned ?? []).length > 0) {
    body.appendChild(sectionHeader("Imprisoned"));
    const held = h("div", { class: "ledger__list" });
    for (const entry of party.imprisoned!) {
      held.appendChild(
        h(
          "div",
          { class: "row" },
          h("span", { class: "row__label label" }, `${entry.count} held by ${entry.holderName}`),
          h(
            "span",
            { class: "row__value" },
            options.onPrisonBreak
              ? h(
                  "button",
                  {
                    class: "btn",
                    "data-testid": `party-break-${entry.holderId}`,
                    title: "Roguery: sneak a team in. Small teams are sneakier.",
                    onclick: async () => {
                      await options.onPrisonBreak?.(entry.holderId, 4);
                    },
                  },
                  "Break them out",
                )
              : h("span", { class: "caption" }, "No team available."),
          ),
        ),
      );
    }
    body.appendChild(held);
  }

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
      { header: "Wounded", numeric: true, testId: "troop-wounded", render: (t) => String(t.wounded) },
      { header: "Quality", numeric: true, testId: "troop-quality", render: (t) => `${t.quality}/5` },
      { header: "Morale", numeric: true, testId: "troop-morale", render: (t) => t.morale.toFixed(2) },
      { header: "Wage a day", numeric: true, testId: "troop-wage", render: (t) => rate(t.count * t.wage) },
    ];
    body.appendChild(stackable(dataTable("Party troops", columns, party.troops, "party-troops")));
  }

  // -- training (tasks 146, 147) ---------------------------------------------
  // Only drawn when the caller can actually send the order: a training section
  // whose button does nothing is worse than no training section, because it tells
  // the player their troops can be trained when no order can leave the panel.
  if (options.onUpgradeTroops) {
    body.appendChild(trainingSection(party, options));
  }

  // -- prisoners -------------------------------------------------------------
  body.appendChild(sectionHeader("Prisoners"));
  if (party.prisoners.length === 0) {
    body.appendChild(emptyState("No prisoners.", "Take captives in battle to ransom or recruit them."));
  } else {
    const prisonerColumns: Column<{ troopId: string; name: string; count: number; tier: number }>[] = [
      { header: "Unit", render: (p) => h("span", { class: "label" }, p.name) },
      { header: "Count", numeric: true, testId: "prisoner-count", render: (p) => String(p.count) },
      { header: "Tier", numeric: true, testId: "prisoner-tier", render: (p) => String(p.tier) },
    ];
    // The actions column only appears when the caller can actually send the orders.
    // A ransom button that does nothing is worse than no ransom button.
    if (options.onRansomPrisoners || options.onRecruitPrisoners) {
      prisonerColumns.push({
        header: "Actions",
        render: (p) => {
          const wrap = h("span", { class: "row__actions" });
          if (options.onRansomPrisoners) {
            const ransomBtn = h(
              "button",
              { type: "button", class: "btn btn--small", "data-testid": `ransom-${p.troopId}` },
              "Ransom",
            );
            ransomBtn.addEventListener("click", () => {
              ransomBtn.setAttribute("disabled", "");
              void options.onRansomPrisoners!(p.troopId, p.count).finally(() => {
                ransomBtn.removeAttribute("disabled");
              });
            });
            wrap.appendChild(ransomBtn);
          }
          if (options.onRecruitPrisoners) {
            const recruitBtn = h(
              "button",
              { type: "button", class: "btn btn--small", "data-testid": `recruit-${p.troopId}` },
              "Recruit",
            );
            recruitBtn.addEventListener("click", () => {
              recruitBtn.setAttribute("disabled", "");
              void options.onRecruitPrisoners!(p.troopId, p.count).finally(() => {
                recruitBtn.removeAttribute("disabled");
              });
            });
            wrap.appendChild(recruitBtn);
          }
          return wrap;
        },
      });
    }
    body.appendChild(stackable(dataTable("Prisoners held", prisonerColumns, party.prisoners, "party-prisoners")));
  }

  // -- split party ------------------------------------------------------------
  // Send troops off under a new banner. The form collects which stacks go and
  // the new party's name; the simulation owns whether the split happens.
  // Only drawn when the caller can actually send the order.
  if (options.onSplitParty && party.troops.length > 0) {
    body.appendChild(sectionHeader("Split party"));
    const nameInput = h("input", {
      type: "text",
      class: "field__input",
      placeholder: "New party name",
      "data-testid": "split-party-name",
      "aria-label": "New party name",
    });
    const checks: { stackId: string; input: HTMLInputElement }[] = [];
    const list = h("div", { class: "stack" });
    for (const stack of party.troops) {
      const check = h("input", {
        type: "checkbox",
        "data-testid": `split-${stack.id}`,
        "aria-label": `Send ${stack.count} ${stack.name} to the new party`,
      }) as HTMLInputElement;
      checks.push({ stackId: stack.id, input: check });
      list.appendChild(
        h("label", { class: "row" },
          check,
          h("span", { class: "label" }, `${stack.count} ${stack.name}`),
        ),
      );
    }
    const splitBtn = h("button", { type: "button", class: "btn", "data-testid": "split-party-confirm" }, "Split off new party");
    const message = h("p", { class: "caption", role: "status", style: "display:none" });
    splitBtn.addEventListener("click", () => {
      const chosen = checks.filter((c) => c.input.checked).map((c) => {
        const stack = party.troops.find((s) => s.id === c.stackId)!;
        return { stackId: c.stackId, count: stack.count };
      });
      const name = (nameInput as HTMLInputElement).value.trim();
      if (chosen.length === 0 || name.length === 0) {
        message.style.display = "";
        message.textContent = "Choose at least one stack and name the new party.";
        return;
      }
      splitBtn.setAttribute("disabled", "");
      void options.onSplitParty!({ troopIds: chosen, name }).then(
        () => {
          splitBtn.removeAttribute("disabled");
          message.style.display = "";
          message.textContent = `${name} marches under its own banner now.`;
        },
        (err) => {
          splitBtn.removeAttribute("disabled");
          message.style.display = "";
          message.textContent = err instanceof SimulationUnavailableError ? err.playerMessage : "The split did not go through.";
        },
      );
    });
    body.appendChild(h("div", { class: "stack" }, nameInput, list, splitBtn, message));
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

/**
 * Training: what each stack has banked, what the next tier costs in experience,
 * and the button that sends the order. Tasks 146 and 147.
 *
 * Two rules shape this. The panel reads the ladder from `troopTier` — the same
 * `TROOP_TIERS` table the simulation walks — so the XP a stack is shown as needing
 * is the XP the simulation will ask for, not a number typed here. And the panel
 * never decides the promotion: the button sends a stack id and the simulation's
 * answer is printed verbatim, refusal included, because "you cannot afford that" and
 * "they have not trained long enough" are different problems with different answers.
 *
 * A stack at the top of the ladder has no next tier, so it gets a line saying so
 * rather than a disabled button and a blank cost.
 */
function trainingSection(party: PartyState, options: PartyPanelOptions): HTMLElement {
  const wrap = h("section", { "data-testid": "party-training" });
  wrap.appendChild(sectionHeader("Training"));

  const stackable_ = party.troops.filter((t) => t.count > 0);
  if (stackable_.length === 0) {
    wrap.appendChild(emptyState("No troops to train.", "A party with nobody in it has nothing to train."));
    return wrap;
  }

  const message = h("p", {
    class: "caption",
    "data-testid": "party-training-message",
    role: "status",
    style: "margin:var(--space-2) 0 0",
  });
  message.style.display = "none";

  for (const stack of stackable_) {
    wrap.appendChild(trainingRow(stack, options, message));
  }
  wrap.appendChild(message);
  return wrap;
}

function trainingRow(
  stack: TroopStack,
  options: PartyPanelOptions,
  message: HTMLElement,
): HTMLElement {
  const tier = troopTier(stack.tier);
  const next = tier.tier >= TROOP_TIERS.length ? null : troopTier(tier.tier + 1);
  // XP thresholds are per soldier, and the threshold belongs to the tier being
  // left: a stack of N at tier 2 needs `troopTier(2).xpToNext * N` banked to become
  // tier 3. That is the arithmetic the simulation runs, so the button unlocks at
  // exactly the point the order will be accepted rather than a tier early or late.
  const needed = next && tier.xpToNext !== null ? tier.xpToNext * stack.count : 0;
  const ready = next !== null && tier.xpToNext !== null && stack.xp >= needed;

  const row = h("div", {
    class: "training-row",
    "data-testid": `training-${stack.id}`,
    "data-ready": String(ready),
  });

  const head = h("div", { class: "field-row", style: "justify-content:space-between;align-items:baseline;gap:var(--space-2)" });
  head.append(
    h("strong", { class: "label" }, stack.name),
    h(
      "span",
      { class: "mono caption", "data-testid": `training-tier-${stack.id}` },
      next ? `Tier ${tier.tier} ${tier.name} → ${next.name}` : `Tier ${tier.tier} ${tier.name} — top of the ladder`,
    ),
  );
  row.appendChild(head);

  if (!next) {
    row.appendChild(
      h("p", { class: "caption", style: "margin:var(--space-1) 0 0" },
        "There is nothing above this tier. Only time or numbers will change it."),
    );
    return row;
  }

  // The path, not just the price: what the promotion makes them better at and what
  // it adds to the wage bill, both straight off the tier table.
  row.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-1) 0 0", "data-testid": `training-path-${stack.id}` },
      `${next.name}: ×${next.combatMultiplier.toFixed(1)} in a line fight, ` +
        `×${next.wageMultiplier.toFixed(1)} on the wage bill.`,
    ),
  );

  const bar = gauge({
    label: "Experience banked",
    value: needed > 0 ? Math.min(1, stack.xp / needed) : 0,
    format: () => `${Math.round(stack.xp).toLocaleString("en-US")} / ${Math.round(needed).toLocaleString("en-US")} XP`,
    thresholds: { warningBelow: 0.5, goodAbove: 1 },
    testId: `training-xp-${stack.id}`,
  });
  row.appendChild(bar);

  const foot = h("div", { class: "field-row", style: "justify-content:space-between;align-items:center;gap:var(--space-2)" });
  foot.appendChild(
    h("span", { class: "caption" },
      ready
        ? "Trained out. The order goes to the simulation."
        : `${Math.max(0, Math.round(needed - stack.xp)).toLocaleString("en-US")} XP short for ${next.name}.`),
  );

  const btn = h("button", {
    type: "button",
    class: "btn",
    "data-testid": `upgrade-${stack.id}`,
    ...(ready ? {} : { disabled: "true" }),
    "aria-label": ready
      ? `Train ${stack.name} up to ${next.name}`
      : `${stack.name} cannot be trained to ${next.name} yet`,
  }, ready ? `Train to ${next.name}` : "Not ready");
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    btn.disabled = true;
    void options.onUpgradeTroops!(stack.id).then(
      (result) => {
        btn.disabled = false;
        message.style.display = "";
        if (result.upgraded) {
          message.textContent =
            `${stack.name} trained up to tier ${result.toTier}. ` +
            `${Math.round(result.xpSpent).toLocaleString("en-US")} XP and ${money(result.goldSpent)} spent.`;
        } else {
          message.textContent = result.reason ?? "The training order was refused.";
        }
      },
      () => {
        btn.disabled = false;
        message.style.display = "";
        message.textContent = "The training order did not go through.";
      },
    );
  });
  foot.appendChild(btn);
  row.appendChild(foot);
  return row;
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

