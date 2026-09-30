/**
 * The ruler roster and ruler card. `RULERS.md` section 9, `UI_UX.md` section 2.
 *
 * RULERS.md section 9 asks for two things: a roster with filters by side, location,
 * rank and relation to the player, and a card showing traits, holdings, army, wealth
 * and recent events, with a Why entry for recent decisions. The second half matters more
 * than the first, because section 5 says a ruler's decisions must be explainable — "Lord
 * Reyes attacked Millbrook because it had 4 days of food, his valor is high, and he owed
 * a debt to the enemy" — so every event on the card is a doorway into the Why panel
 * rather than a line of prose.
 *
 * The traits are the part most likely to become decoration, and RULERS.md section 4 is
 * firm that a trait is never arbitrary flavour: each is drawn with a centre mark, a
 * numeric figure in mono, and a written reading, so "high" is a number the player can
 * compare against another ruler rather than a feeling about a bar.
 */

import { clear, h, row, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, statusChip, type Column, type StatusKind } from "../kit.js";
import { asBottomSheet, stackable } from "./narrow.js";
import { rosterSkeletonBody, rulerCardSkeletonBody } from "./panel-skeletons.js";
import type { RulerState, RulerTraits } from "../../data/types.js";

/** `RULERS.md` section 2. Ordered from the top of the hierarchy down. */
const TIERS: RulerState["tier"][] = [
  "side-leader",
  "state-governor",
  "city-ruler",
  "lord",
  "local-warlord",
  "mercenary-captain",
];

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
  generosity: "Generosity",
  calculation: "Calculation",
};

const TRAIT_ORDER: (keyof RulerTraits)[] = ["valor", "mercy", "honor", "generosity", "calculation"];

/** `ECONOMY.md` section 1 order, so the wealth block reads like every other stock list. */
const WEALTH_ORDER: (keyof RulerState["wealth"])[] = ["money", "gold", "food", "metal", "medicine"];

const WEALTH_LABEL: Record<keyof RulerState["wealth"], string> = {
  money: "Money",
  gold: "Gold",
  food: "Grain",
  metal: "Metal",
  medicine: "Medicine",
};

// -- roster -------------------------------------------------------------------

export interface RosterOptions {
  rulers: RulerState[];
  playerFactionId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose?: () => void;
  /** The roster is still being read. Renders `ruler-roster-skeleton`. */
  loading?: boolean;
  testId?: string;
}

type RankFilter = RulerState["tier"] | "all";
type StandingFilter = "all" | "friendly" | "neutral" | "hostile";

export function rulerRoster(options: RosterOptions): HTMLElement {
  if (options.loading) return rosterSkeleton();

  const { root, body } = panel({
    title: "Rulers",
    testId: options.testId ?? "ruler-roster",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  let sideFilter = "all";
  let rankFilter: RankFilter = "all";
  let standingFilter: StandingFilter = "all";
  let search = "";

  const sideSelect = h(
    "select",
    { id: "roster-side", class: "field__input label", "data-testid": "roster-side-filter" },
    h("option", { value: "all" }, "Every side"),
    ...uniqueSides(options.rulers).map((s) => h("option", { value: s.id }, s.name)),
  );
  sideSelect.addEventListener("change", () => {
    sideFilter = sideSelect.value;
    render();
  });

  // RULERS.md section 9 lists rank as a filter alongside side, so it gets one.
  const rankSelect = h(
    "select",
    { id: "roster-rank", class: "field__input label", "data-testid": "roster-rank-filter" },
    h("option", { value: "all" }, "Every rank"),
    ...TIERS.filter((t) => options.rulers.some((r) => r.tier === t)).map((t) =>
      h("option", { value: t }, TIER_LABEL[t]),
    ),
  );
  rankSelect.addEventListener("change", () => {
    rankFilter = rankSelect.value as RankFilter;
    render();
  });

  const relSelect = h(
    "select",
    { id: "roster-relation", class: "field__input label", "data-testid": "roster-relation-filter" },
    h("option", { value: "all" }, "Any standing"),
    h("option", { value: "friendly" }, "Friendly"),
    h("option", { value: "neutral" }, "Neutral"),
    h("option", { value: "hostile" }, "Hostile"),
  );
  relSelect.addEventListener("change", () => {
    standingFilter = relSelect.value as StandingFilter;
    render();
  });

  // A roster of three hundred names needs a way to find one. This is a real labelled
  // input rather than a hidden shortcut, because the player should be able to see that
  // filtering is what they are doing.
  const searchField = h("input", {
    type: "search",
    id: "roster-search",
    class: "field__input label",
    "data-testid": "roster-search",
    placeholder: "Name or holding",
    autocomplete: "off",
  });
  searchField.addEventListener("input", () => {
    search = searchField.value.trim().toLowerCase();
    render();
  });

  function matches(ruler: RulerState): boolean {
    if (sideFilter !== "all" && ruler.factionId !== sideFilter) return false;
    if (rankFilter !== "all" && ruler.tier !== rankFilter) return false;
    if (standingFilter === "friendly" && ruler.relationToPlayer < 20) return false;
    if (standingFilter === "neutral" && (ruler.relationToPlayer <= -20 || ruler.relationToPlayer >= 20)) return false;
    if (standingFilter === "hostile" && ruler.relationToPlayer >= -20) return false;
    if (search.length > 0) {
      const inName = ruler.name.toLowerCase().includes(search);
      const inHolding = ruler.holdings.some((hold) => hold.name.toLowerCase().includes(search));
      if (!inName && !inHolding) return false;
    }
    return true;
  }

  function render(): void {
    clear(body);
    const filters = h("div", { class: "field-row roster__filters" });
    filters.append(
      field("Side", "roster-side", sideSelect),
      field("Rank", "roster-rank", rankSelect),
      field("Standing", "roster-relation", relSelect),
      h(
        "div",
        { class: "field roster__search" },
        h("label", { class: "field__label label", for: "roster-search" }, "Find"),
        searchField,
      ),
    );
    body.appendChild(filters);

    const filtered = options.rulers.filter(matches);

    if (options.rulers.length === 0) {
      body.appendChild(
        emptyState(
          "No rulers on the record.",
          "The simulation has not written anyone yet. Start the clock, or take the snapshot again.",
        ),
      );
      return;
    }

    // The count is stated whether or not anything was filtered out, so a filter that
    // silently hides the whole world is visible as such. The figures lead, because the
    // count is the number being read and the noun is the noise around it.
    body.appendChild(
      h(
        "p",
        { class: "caption roster__count", "data-testid": "roster-count", role: "status" },
        filtered.length === options.rulers.length
          ? `${options.rulers.length} on the record.`
          : `${filtered.length} of ${options.rulers.length} on the record match these filters.`,
      ),
    );

    if (filtered.length === 0) {
      body.appendChild(
        emptyState(
          "No rulers match those filters.",
          "Widen the side, the rank or the standing filter to see more of the world.",
          h("button", { type: "button", class: "btn", "data-testid": "roster-clear" }, "Clear the filters"),
        ),
      );
      body.querySelector<HTMLButtonElement>("[data-testid='roster-clear']")?.addEventListener("click", () => {
        sideFilter = "all";
        rankFilter = "all";
        standingFilter = "all";
        search = "";
        sideSelect.value = "all";
        rankSelect.value = "all";
        relSelect.value = "all";
        searchField.value = "";
        render();
      });
      return;
    }

    const list = h("div", { class: "rulers", "data-testid": "ruler-list" });
    for (const ruler of filtered) list.appendChild(rosterCard(ruler));
    body.appendChild(list);
  }

  function rosterCard(ruler: RulerState): HTMLElement {
    const mine = ruler.factionId === options.playerFactionId;
    const card = h(
      "button",
      {
        type: "button",
        class: "ruler",
        "data-testid": `ruler-${ruler.id}`,
        "aria-pressed": ruler.id === options.selectedId ? "true" : "false",
        // The whole card is the control, so the name is its accessible name and the
        // supporting facts ride along as the value.
        "aria-label": `${ruler.name}, ${TIER_LABEL[ruler.tier]} of the ${ruler.factionName}, ${standingText(ruler.relationToPlayer)}`,
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
      h(
        "span",
        { class: "ruler__foot" },
        statusChip(standing(ruler.relationToPlayer), standingText(ruler.relationToPlayer)),
        h("span", { class: "caption" }, mine ? "Your side" : holdingSummary(ruler)),
      ),
    );
    card.addEventListener("click", () => options.onSelect(ruler.id));
    return card;
  }

  render();
  return root;
}

// -- card ---------------------------------------------------------------------

export interface RulerCardOptions {
  ruler: RulerState;
  onClose?: () => void;
  /** Opens the Why panel on one of this ruler's fields. */
  onWhy?: (field: string) => void;
  loading?: boolean;
  testId?: string;
}

export function rulerCard(options: RulerCardOptions): HTMLElement {
  if (options.loading) return rulerCardLoading(options);

  const { root, body } = panel({
    title: options.ruler.name,
    testId: options.testId ?? "ruler-card",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);
  const r = options.ruler;

  // Carbon triplicate, ART_DIRECTION.md section 6.4: a ruler card is a copy with a copy
  // behind it, which is what makes it read as a filed record rather than a dialog.
  body.classList.add("triplicate");

  body.appendChild(
    h(
      "div",
      { class: "field-row ruler-card__head" },
      h(
        "div",
        { class: "ruler-card__id" },
        h("p", { class: "caption ruler-card__line" }, `${r.factionName} · ${TIER_LABEL[r.tier]} · age ${r.age}`),
        h("p", { class: "caption ruler-card__line" }, `Wants: ${ambitionsText(r.ambitions)}`),
      ),
      statusChip(standing(r.relationToPlayer), standingText(r.relationToPlayer), { testId: "ruler-standing" }),
    ),
  );

  // -- traits ---------------------------------------------------------------
  body.appendChild(sectionHeader("Traits"));
  body.appendChild(
    h("p", { class: "caption ruler-card__note" }, "Zero is a coin toss, one is the strongest of their generation."),
  );
  const traits = h("div", { class: "traits", "data-testid": "ruler-traits" });
  for (const key of TRAIT_ORDER) {
    traits.appendChild(traitRow(key, r.traits[key]));
  }
  body.appendChild(traits);

  // -- holdings and army ----------------------------------------------------
  body.appendChild(sectionHeader("Holdings and army"));
  const holdings = h("div", {});
  holdings.appendChild(row("Garrison", `${r.garrison.toLocaleString("en-US")} soldiers`, { mono: true }));
  holdings.appendChild(
    row("Holdings", r.holdings.length > 0 ? h("span", {}, holdingNames(r)) : h("span", { class: "caption" }, NO_HOLDINGS)),
  );
  holdings.appendChild(
    row(
      "Loyalty to leader",
      h(
        "span",
        { class: "row__inline" },
        h("span", { class: "data" }, r.loyaltyToLeader.toFixed(2)),
        // Loyalty is a 0-to-1 with a threshold that matters, so the reading is in words
        // beside the number rather than left to the player.
        h("span", { class: "caption" }, loyaltyText(r.loyaltyToLeader)),
      ),
      { mono: false },
    ),
  );
  holdings.appendChild(row("Influence", String(r.influence), { mono: true }));
  holdings.appendChild(row("Renown", String(r.renown), { mono: true }));
  body.appendChild(holdings);

  // -- wealth ---------------------------------------------------------------
  body.appendChild(sectionHeader("Wealth"));
  const wealth = h("div", {});
  for (const key of WEALTH_ORDER) {
    wealth.appendChild(row(WEALTH_LABEL[key], formatWealth(key, r.wealth[key]), { mono: true }));
  }
  body.appendChild(wealth);

  // -- recent events --------------------------------------------------------
  body.appendChild(sectionHeader("Recent events"));
  if (r.recentEvents.length === 0) {
    body.appendChild(
      emptyState(
        "Nothing on the record yet.",
        "Decisions this ruler makes will show up here, each with a reason attached.",
      ),
    );
    return root;
  }
  const columns: Column<RulerState["recentEvents"][number]>[] = [
    { header: "Day", numeric: true, render: (e) => String(e.day) },
    { header: "What happened", render: (e) => h("span", {}, e.text) },
    {
      // RULERS.md section 9: a Why entry for recent decisions, and section 5 insists the
      // decisions be explainable. So each event gets its own affordance, and an event
      // the log never wrote a cause for says so rather than offering a button that
      // opens an empty chain.
      header: "Reason",
      render: (e) => {
        if (!options.onWhy) return h("span", { class: "caption" }, "no reason on file");
        if (!e.causedBy) return h("span", { class: "caption" }, "no reason on file");
        const ask = h(
          "button",
          {
            type: "button",
            class: "why__disclose",
            "data-testid": "ruler-why",
            "aria-label": `Why ${rulerNameOn(e.text)} did that`,
          },
          "Why?",
        );
        ask.addEventListener("click", () => options.onWhy?.("loyalty_to_leader"));
        return ask;
      },
    },
  ];
  body.appendChild(stackable(dataTable("Recent events for this ruler", columns, r.recentEvents, "ruler-events")));
  return root;
}

/** The first capitalised word of an event sentence, for a button name that reads. */
function rulerNameOn(text: string): string {
  const first = text.split(/\s+/)[0] ?? text;
  return first.replace(/[^A-Za-z-]/g, "");
}

/**
 * One trait, drawn so it can be compared between rulers.
 *
 * The bar is a value around a centre mark, and the figure beside it is `type-data-sm`
 * in mono, so two rulers' valor can be read against each other rather than guessed at
 * from two bars of different lengths.
 */
function traitRow(key: keyof RulerTraits, value: number): HTMLElement {
  const clamped = Math.max(0, Math.min(1, value));
  const reading = traitReading(clamped);
  const wrap = h("div", { class: "trait", "data-testid": `trait-${key}` });
  wrap.appendChild(h("span", { class: "trait__label" }, TRAIT_LABEL[key]));
  const bar = h("span", { class: "trait__bar" }, h("span", { class: "trait__centre", "aria-hidden": "true" }));
  const fill = h("span", { class: "trait__fill" });
  // Negative traits grow left from the centre, positive ones grow right. A bar that
  // always grew right would read a cruel ruler and a generous one as the same shape.
  fill.style.left = `${clamped >= 0.5 ? 50 : clamped * 100}%`;
  fill.style.width = `${Math.abs(clamped - 0.5) * 100}%`;
  bar.appendChild(fill);
  wrap.appendChild(bar);
  wrap.appendChild(h("span", { class: "data-sm trait__value", "data-testid": `trait-${key}-value` }, value.toFixed(2)));
  wrap.appendChild(h("span", { class: "caption trait__reading" }, reading));
  return wrap;
}

/** A trait in words, so a bar is not the only way to read it. */
function traitReading(value: number): string {
  if (value >= 0.8) return "Very high";
  if (value >= 0.65) return "High";
  if (value >= 0.45) return "Middling";
  if (value >= 0.3) return "Low";
  return "Very low";
}

function loyaltyText(loyalty: number): string {
  if (loyalty < 0.25) return "openly disloyal";
  if (loyalty < 0.45) return "restless";
  if (loyalty < 0.7) return "holds for now";
  return "sworn";
}

const NO_HOLDINGS = "No land. A mercenary.";

function holdingSummary(ruler: RulerState): string {
  if (ruler.holdings.length === 0) return NO_HOLDINGS;
  if (ruler.holdings.length === 1) return ruler.holdings[0]!.name;
  return `${ruler.holdings.length} holdings`;
}

function holdingNames(ruler: RulerState): string {
  return ruler.holdings.map((hold) => hold.name).join(", ");
}

function ambitionsText(ambitions: string[]): string {
  if (ambitions.length === 0) return "nothing on record";
  return ambitions.join(", ");
}

/**
 * A ruler's wealth, in the unit that makes the figure mean something.
 *
 * `ECONOMY.md` section 1: money and gold are currency, grain is person-days, medicine is
 * doses, and metal is an industrial stock. A dollar sign on a ruler's metal would be a
 * lie about the resource, and it is the kind of lie a player stops believing the rest
 * of the panel over.
 */
function formatWealth(key: keyof RulerState["wealth"], value: number): string {
  switch (key) {
    case "food":
      return `${value.toFixed(0)} person-days`;
    case "medicine":
      return `${Math.round(value)} doses`;
    case "metal":
      return `${Math.round(value)} units`;
    default:
      return `$${Math.round(value).toLocaleString("en-US")}`;
  }
}

function field(label: string, id: string, control: HTMLElement): HTMLElement {
  return h(
    "div",
    { class: "field roster__filter" },
    h("label", { class: "field__label label", for: id }, label),
    control,
  );
}

function uniqueSides(rulers: RulerState[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const r of rulers) if (!map.has(r.factionId)) map.set(r.factionId, r.factionName);
  return [...map].map(([id, name]) => ({ id, name }));
}

/**
 * The standing chip's kind.
 *
 * Relation is -100 to 100. The three bands are the ones a player acts on: an ally, an
 * unknown quantity, an enemy. The colour follows the band and the glyph follows the
 * kind, so a hostile ruler is a ◆ and cannot be mistaken for a neutral ■.
 */
function standing(relation: number): StatusKind {
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

// -- the loading states -------------------------------------------------------

/** The roster sheet at skeleton scale, so the context region does not change height. */
export function rosterSkeleton(title = "Rulers"): HTMLElement {
  const { root, body } = panel({ title, testId: "ruler-roster" });
  asBottomSheet(root);
  body.appendChild(rosterSkeletonBody());
  return root;
}

/** The card sheet at skeleton scale, with the ruler's name in the title bar. */
export function rulerCardLoading(options: RulerCardOptions): HTMLElement {
  const { root, body } = panel({ title: options.ruler.name, testId: options.testId ?? "ruler-card" });
  asBottomSheet(root);
  body.appendChild(rulerCardSkeletonBody());
  return root;
}
