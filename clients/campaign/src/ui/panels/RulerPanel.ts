/**
 * The ruler roster and ruler card. `RULERS.md` section 9, `UI_UX.md` section 2.
 *
 * Filter by side, rank, and relation to the player. The card shows traits, holdings,
 * army, wealth, and recent events, and every recent event links into the Why panel,
 * because `RULERS.md` section 5 says a ruler's decisions must be explainable.
 */

import { clear, h, row, sectionHeader } from "../dom.js";
import { emptyState, panel, statusChip, dataTable, type Column } from "../kit.js";
import type { RulerState, RulerTraits } from "../../data/types.js";

const TIER_LABEL: Record<RulerState["tier"], string> = {
  "side-leader": "Side leader",
  "state-governor": "State governor",
  "city-ruler": "City ruler",
  lord: "Lord",
  "local-warlord": "Local warlord",
  "mercenary-captain": "Mercenary captain",
};

const TRAIT_LABEL: Record<keyof RulerTraits, string> = {
  valor: "Valor",
  mercy: "Mercy",
  honor: "Honor",
  generosity: "Generance",
  calculation: "Calculation",
};

export interface RosterOptions {
  rulers: RulerState[];
  playerFactionId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose?: () => void;
  testId?: string;
}

export function rulerRoster(options: RosterOptions): HTMLElement {
  const { root, body } = panel({
    title: "Rulers",
    testId: options.testId ?? "ruler-roster",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  let sideFilter = "all";
  let relationFilter = "all";

  const sideSelect = h("select", { id: "roster-side", class: "field__input label", "data-testid": "roster-side-filter" },
    h("option", { value: "all" }, "Every side"),
    ...uniqueSides(options.rulers).map((s) => h("option", { value: s.id }, s.name)),
  );
  sideSelect.addEventListener("change", () => { sideFilter = sideSelect.value; render(); });

  const relSelect = h("select", { id: "roster-relation", class: "field__input label", "data-testid": "roster-relation-filter" },
    h("option", { value: "all" }, "Any standing"),
    h("option", { value: "friendly" }, "Friendly"),
    h("option", { value: "neutral" }, "Neutral"),
    h("option", { value: "hostile" }, "Hostile"),
  );
  relSelect.addEventListener("change", () => { relationFilter = relSelect.value; render(); });

  function render(): void {
    clear(body);
    body.appendChild(
      h(
        "div",
        { class: "field-row", style: "margin-bottom:var(--space-3)" },
        h("div", { class: "field", style: "flex:1 1 var(--space-6)" }, h("label", { class: "field__label", for: "roster-side" }, "Side"), sideSelect),
        h("div", { class: "field", style: "flex:1 1 var(--space-6)" }, h("label", { class: "field__label", for: "roster-relation" }, "Standing"), relSelect),
      ),
    );

    const filtered = options.rulers.filter((r) => {
      if (sideFilter !== "all" && r.factionId !== sideFilter) return false;
      if (relationFilter === "friendly" && r.relationToPlayer < 20) return false;
      if (relationFilter === "neutral" && (r.relationToPlayer <= -20 || r.relationToPlayer >= 20)) return false;
      if (relationFilter === "hostile" && r.relationToPlayer >= -20) return false;
      return true;
    });

    if (filtered.length === 0) {
      body.appendChild(
        emptyState(
          "No rulers match those filters.",
          "Widen the side or the standing filter to see more of the world.",
        ),
      );
      return;
    }

    const list = h("div", { class: "rulers", "data-testid": "ruler-list" });
    for (const ruler of filtered) {
      const card = h(
        "button",
        {
          type: "button",
          class: "ruler",
          "data-testid": `ruler-${ruler.id}`,
          "aria-pressed": ruler.id === options.selectedId ? "true" : "false",
        },
        h(
          "span",
          { class: "ruler__head" },
          h("span", { class: "ruler__name" }, ruler.name),
          h("span", { class: "data-sm" }, `${ruler.renown} renown`),
        ),
        h(
          "span",
          { class: "caption" },
          `${ruler.factionName} · ${TIER_LABEL[ruler.tier]} · age ${ruler.age}`,
        ),
        h("span", {}, statusChip(standing(ruler.relationToPlayer), standingText(ruler.relationToPlayer))),
      );
      card.addEventListener("click", () => options.onSelect(ruler.id));
      list.appendChild(card);
    }
    body.appendChild(list);
  }

  render();
  return root;
}

export interface RulerCardOptions {
  ruler: RulerState;
  onClose?: () => void;
  onWhy?: (field: string) => void;
  testId?: string;
}

export function rulerCard(options: RulerCardOptions): HTMLElement {
  const { root, body } = panel({
    title: options.ruler.name,
    testId: options.testId ?? "ruler-card",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  const r = options.ruler;

  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `${r.factionName} · ${TIER_LABEL[r.tier]} · age ${r.age}`),
        h("p", { class: "caption", style: "margin:0" }, `Wants: ${r.ambitions.join(", ")}`),
      ),
      statusChip(standing(r.relationToPlayer), standingText(r.relationToPlayer), { testId: "ruler-standing" }),
    ),
  );

  body.appendChild(sectionHeader("Traits"));
  const traits = h("div", { class: "traits", "data-testid": "ruler-traits" });
  for (const [key, value] of Object.entries(r.traits) as [keyof RulerTraits, number][]) {
    traits.appendChild(
      h(
        "div",
        { class: "trait" },
        h("span", {}, TRAIT_LABEL[key]),
        h("span", { class: "trait__bar" }, h("span", { style: `left:${Math.min(50, value * 50)}%;width:${Math.abs(value - 0.5) * 100}%` })),
        h("span", { class: "data-sm" }, value.toFixed(2)),
      ),
    );
  }
  body.appendChild(traits);

  body.appendChild(sectionHeader("Holdings and army"));
  body.appendChild(
    h(
      "div",
      {},
      row("Garrison", `${r.garrison.toLocaleString("en-US")} soldiers`, { mono: true }),
      row("Holdings", r.holdings.length > 0 ? h("span", {}, r.holdings.map((hh) => hh.name).join(", ")) : h("span", { class: "caption" }, "No land. A mercenary.")),
      row("Loyalty to leader", r.loyaltyToLeader.toFixed(2), { mono: true }),
      row("Influence", String(r.influence), { mono: true }),
      row("Renown", String(r.renown), { mono: true }),
    ),
  );

  body.appendChild(sectionHeader("Wealth"));
  body.appendChild(
    h(
      "div",
      {},
      row("Money", `$${Math.round(r.wealth.money).toLocaleString("en-US")}`, { mono: true }),
      row("Gold", `$${Math.round(r.wealth.gold).toLocaleString("en-US")}`, { mono: true }),
      row("Grain", `${r.wealth.food.toFixed(0)} person-days`, { mono: true }),
      row("Metal", `${Math.round(r.wealth.metal).toLocaleString("en-US")}`, { mono: true }),
      row("Medicine", `${Math.round(r.wealth.medicine).toLocaleString("en-US")} doses`, { mono: true }),
    ),
  );

  body.appendChild(sectionHeader("Recent events"));
  if (r.recentEvents.length === 0) {
    body.appendChild(
      emptyState("Nothing on the record yet.", "Decisions this ruler makes will show up here with a reason attached."),
    );
  } else {
    const columns: Column<RulerState["recentEvents"][number]>[] = [
      { header: "Day", numeric: true, render: (e) => String(e.day) },
      { header: "What happened", render: (e) => h("span", {}, e.text) },
    ];
    body.appendChild(dataTable("Recent events for this ruler", columns, r.recentEvents, "ruler-events"));
    if (options.onWhy) {
      const why = h("button", { type: "button", class: "why__disclose", "data-testid": "ruler-why" }, "Why did they do that?");
      why.addEventListener("click", () => options.onWhy?.("loyalty_to_leader"));
      body.appendChild(why);
    }
  }

  return root;
}

function uniqueSides(rulers: RulerState[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rulers) if (!map.has(r.factionId)) map.set(r.factionId, r.factionName);
  return [...map].map(([id, name]) => ({ id, name }));
}

function standing(relation: number): "good" | "info" | "critical" {
  if (relation >= 20) return "good";
  if (relation <= -20) return "critical";
  return "info";
}

function standingText(relation: number): string {
  if (relation >= 60) return "Sworn to you";
  if (relation >= 20) return "Friendly";
  if (relation > -20) return "Neutral";
  if (relation > -60) return "Cold";
  return "Hostile";
}
