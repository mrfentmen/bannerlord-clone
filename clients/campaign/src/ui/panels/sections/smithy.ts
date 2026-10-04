/**
 * The smithy section spec (tasks 119-121). The bench (recipes, open noble
 * orders, the smith's stamina) is fetched when the player steps inside; the
 * simulation owns the forge, the crucible, and every refusal.
 */
import { h } from "../../dom.js";
import type { TownPanelOptions, SmithyOrder, SmithyRecipe, SmithyView } from "../TownPanel.js";
import { type TownSectionRuntime, type TownSectionSpec } from "../townSections.js";

function smithyBenchRow(recipe: SmithyRecipe, options: TownPanelOptions, rt: TownSectionRuntime): HTMLElement {
  const card = h("div", { class: "field-row", "data-testid": `smithy-recipe-${recipe.id}`, style: "margin-bottom:var(--space-3)" });

  const head = h("div");
  head.append(h("strong", {}, recipe.name));
  const cost = h(
    "p",
    { class: "caption", style: "margin:0" },
    `${Math.round(recipe.metal)} metal \u00b7 ${Math.round(recipe.fuel)} fuel`,
  );

  const forge = h(
    "button",
    { type: "button", class: "btn", "data-testid": `smithy-forge-${recipe.id}`, "aria-label": `Forge ${recipe.name}` },
    `Forge ${recipe.name}`,
  );
  forge.addEventListener("click", () => {
    forge.disabled = true;
    void options.onForgeItem!(recipe.id).then(
      (result) => {
        rt.say(`Forged: ${result.name}.`);
        rt.reload();
      },
      (err: unknown) => {
        forge.disabled = false;
        // The simulation's own refusal, verbatim: a short bin of metal, no
        // fuel, a smith too tired to swing the hammer again today.
        rt.say(err instanceof Error && err.message ? err.message : "The forge refused.");
      },
    );
  });

  card.append(head, cost, forge);
  return card;
}

function smithyOrderRow(order: SmithyOrder, options: TownPanelOptions, rt: TownSectionRuntime): HTMLElement {
  const card = h("div", { class: "field-row", "data-testid": `smithy-order-${order.id}`, style: "margin-bottom:var(--space-3)" });

  const head = h("div");
  head.append(h("strong", {}, order.patron));
  const facts = h(
    "p",
    { class: "caption", style: "margin:0" },
    `${order.patronTitle} \u2014 wants a ${order.recipeName} \u00b7 ${order.daysLeft} day${order.daysLeft === 1 ? "" : "s"} left \u00b7 $${Math.round(order.reward).toLocaleString("en-US")}`,
  );

  const fulfill = h(
    "button",
    {
      type: "button",
      class: "btn",
      "data-testid": `smithy-fulfill-${order.id}`,
      "aria-label": `Deliver the ${order.recipeName} to ${order.patron} for $${Math.round(order.reward)}`,
    },
    `Deliver \u2014 $${Math.round(order.reward).toLocaleString("en-US")}`,
  );
  fulfill.addEventListener("click", () => {
    fulfill.disabled = true;
    void options.onFulfillOrder!(order.id).then(
      (result) => {
        rt.say(result.line || `Delivered \u2014 $${Math.round(result.reward).toLocaleString("en-US")} earned.`);
        rt.reload();
      },
      (err: unknown) => {
        fulfill.disabled = false;
        rt.say(err instanceof Error && err.message ? err.message : "The patron refused the delivery.");
      },
    );
  });

  card.append(head, facts, fulfill);
  return card;
}

export const smithySectionSpec: TownSectionSpec<SmithyView> = {
  id: "smithy",
  header: "Smithy",
  enterLabel: "Enter the smithy",
  loadingLabel: "Lighting the forge...",
  failureLabel: "The smithy could not be read.",
  available: (options) =>
    options.onLoadSmithy !== undefined &&
    options.onForgeItem !== undefined &&
    options.onSmeltArms !== undefined &&
    options.onFulfillOrder !== undefined,
  load: (options) => options.onLoadSmithy!(),
  render: (list, view, rt, options) => {
    const stamina = h(
      "p",
      { class: "caption", "data-testid": "smithy-stamina", style: "margin:0 0 var(--space-3)" },
      `Stamina ${Math.round(view.stamina.stamina)}/${Math.round(view.stamina.max)} \u2014 forging and smelting spend it; it refills at dawn.`,
    );
    list.appendChild(stamina);

    for (const recipe of view.recipes) {
      list.appendChild(smithyBenchRow(recipe, options, rt));
    }

    const smelt = h("div", { class: "field-row", "data-testid": "smithy-smelt-row", style: "margin-bottom:var(--space-3)" });
    const smeltText = h("p", { class: "caption", style: "margin:0" }, "Break finished arms back down at the crucible.");
    const smeltBtn = h(
      "button",
      { type: "button", class: "btn", "data-testid": "smithy-smelt", "aria-label": "Smelt one arms into metal" },
      "Smelt 1 arms",
    );
    smeltBtn.addEventListener("click", () => {
      smeltBtn.disabled = true;
      void options.onSmeltArms!(1).then(
        (result) => {
          rt.say(`Smelted 1 arms into ${Math.round(result.metal)} metal.`);
          rt.reload();
        },
        (err: unknown) => {
          smeltBtn.disabled = false;
          rt.say(err instanceof Error && err.message ? err.message : "The crucible refused.");
        },
      );
    });
    smelt.append(smeltText, smeltBtn);
    list.appendChild(smelt);

    const ordersHead = h("p", { class: "caption", style: "margin:var(--space-3) 0 var(--space-2)" }, "Open orders");
    list.appendChild(ordersHead);
    if (view.orders.length === 0) {
      const none = h("p", { class: "caption", "data-testid": "smithy-orders-empty", style: "margin:0" }, "No open orders at the smithy tonight.");
      list.appendChild(none);
    }
    for (const order of view.orders) {
      list.appendChild(smithyOrderRow(order, options, rt));
    }
  },
};
