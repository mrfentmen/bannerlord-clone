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
 *
 * Sections follow `UI_UX.md` section 6 in order: population and workers, food and
 * supply days, health, sanitation and infrastructure, unrest and loyalty, media trust,
 * garrison, and the market link. Two of the sections that document lists — the
 * projects queue and notables and quests — have no field in the simulation contract,
 * and the panel does not draw an empty section for data it does not have. That gap is
 * recorded rather than filled with a placeholder.
 */

import { button, h, numberField, row, sectionHeader } from "../dom.js";
import { emptyState, errorState, gauge, panel, statusChip, type StatusKind } from "../kit.js";
import { townSkeleton } from "./skeletons.js";
import { asBottomSheet } from "./narrow.js";
import type { BuildingInfo, ConstructionResult, RecruitableUnit, RecruitResult, TavernCompanion, TownState, Workshop } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import { simulateTaxPolicy } from "../../economy/taxSimulator.js";
import { answerProposal, proposeTradeDeal } from "../../economy/tradeDeals.js";
import { PLAYABLE_SIDE_IDS, factionPalette, type FactionSwatch } from "../../design/factions.js";
import { relationBand } from "../../diplomacy/notables.js";
import type { NotableType, Notification } from "../../data/types.js";
import { BANNER_COLORS } from "../../clan/bannerPalette.js";
import type { ColorblindMode } from "../../settings/schema.js";
import { notablesForCity } from "../../data/notables/index.js";
import { buildingOwnersForCity } from "../../data/buildingOwners.js";
import { townSectionFromSpec } from "./townSections.js";
import { TOWN_SECTIONS } from "./sections/index.js";
import { greetNpc, voiceForNpc } from "../../audio/greetDialogue.js";
import "./townPanel.css";

/** One bench recipe at the smithy (tasks 119–121). Shape owned by the simulation. */
export interface SmithyRecipe {
  id: string;
  name: string;
  metal: number;
  fuel: number;
  result: string;
}

/** An open noble order waiting for a forged piece. Shape owned by the simulation. */
export interface SmithyOrder {
  id: string;
  patron: string;
  patronTitle: string;
  recipeId: string;
  recipeName: string;
  daysLeft: number;
  reward: number;
}

/** What stepping inside the smithy shows: the bench, the orders, the smith's stamina. */
export interface SmithyView {
  recipes: SmithyRecipe[];
  orders: SmithyOrder[];
  stamina: { stamina: number; max: number };
}

/**
 * Map a settlement id to its codex lore entry, if one exists.
 * (Rowan, del order 2026-10-03): wires city lore into town panels.
 */
function settlementLoreEntry(settlementId: string): string | null {
  const map: Record<string, string> = {
    // Front Range (fixture towns) — entries in codex/entries7.ts
    denver: "lore-city-denver",
    boulder: "lore-city-boulder",
    golden: "lore-city-golden",
    // National cities — entries in codex/entries6.ts and entries9.ts
    "new-york": "lore-city-new-york",
    "los-angeles": "lore-city-los-angeles",
    houston: "lore-city-houston",
    miami: "lore-city-miami",
    chicago: "lore-city-chicago",
    seattle: "lore-city-seattle",
    atlanta: "lore-city-atlanta",
    dallas: "lore-city-dallas",
    phoenix: "lore-city-phoenix",
    "san-francisco": "lore-city-san-francisco",
    boston: "lore-city-boston",
    philadelphia: "lore-city-philadelphia",
    "new-orleans": "lore-city-new-orleans",
    detroit: "lore-city-detroit",
    nashville: "lore-city-nashville",
    "las-vegas": "lore-city-las-vegas",
  };
  return map[settlementId] ?? null;
}

export interface TownPanelOptions {
  /**
   * `null` when the map has nothing selected. The panel then says what to do about
   * it rather than rendering an empty sheet of headings.
   */
  town: TownState | null;
  /** Previous tick's values, for the trend arrows. Null on the very first render. */
  previous?: TownState | null;
  onWhy: (field: string) => void;
  onOpenMarket: () => void;
  onMarchHere: () => void;
  onRoster: () => void;
  /** Open a codex lore entry (e.g. city lore from the town header). */
  onOpenLore?: (entryId: string) => void;
  /**
   * Set the town's tax rate. The panel sends the order; the simulation clamps
   * and applies it. Resolves when the order is accepted.
   */
  onSetTaxRate?: (rate: number) => Promise<void>;
  /** Set the state-level tax rate for the town's US state. */
  onSetStateTaxRate?: (rate: number) => Promise<void>;
  /**
   * Queue a settlement project. Resolves with the simulation's answer so the
   * panel can show the reason verbatim when the order is refused.
   */
  onStartConstruction?: (buildingId: string) => Promise<ConstructionResult>;
  /**
   * Hire soldiers. The panel sends the order; the simulation decides if it happens.
   * Resolves with the simulation's answer so the panel can show the reason verbatim.
   */
  onRecruit?: (unitId: string, quantity: number) => Promise<RecruitResult>;
  /** The player's purse, for the hiring cost labels. */
  purse?: number;
  /**
   * The campaign's notification feed, as the caller holds it.
   *
   * The town panel does not poll for it and does not filter it beyond `entityId`:
   * whatever the caller passes is what this town did. Omitted, the section is not
   * drawn at all rather than drawn empty — see task 138.
   */
  notifications?: Notification[];
  /**
   * The faction that holds this town, by display name ("Pacific Compact").
   *
   * The simulation does not put a faction on `TownState`, so the header banner is
   * drawn only when the caller supplies this. Omitted, the header shows the town
   * name and the holder and nothing else — see task 101.
   */
  holderFaction?: string;
  /** The day the player is looking at, sent with the hire order. */
  day?: number;
  /**
   * The player's workshops in this town. Omitted, the section is not drawn —
   * a workshop list the player cannot act on is worse than no list.
   */
  workshops?: Workshop[];
  /**
   * Buy a workshop of the given type in this town. The panel sends the type;
   * the simulation owns the price and the result.
   */
  onBuyWorkshop?: (type: string) => Promise<{ workshopId: string }>;
  /**
   * Sell a workshop by id. The panel sends the id; the simulation owns the
   * price and the result.
   */
  onSellWorkshop?: (workshopId: string) => Promise<void>;
  /**
   * Hire militia for the town's garrison. The panel sends the count; the
   * simulation owns the cost and the result. Only drawn when the caller can
   * actually send the order.
   */
  onRecruitMilitia?: (count: number) => Promise<void>;
  /**
   * Read the tavern roster (tasks 115–117). Only drawn when the caller can
   * actually read it; the section fetches on demand, when the player steps
   * inside, not on every panel render.
   */
  onLoadTavern?: () => Promise<TavernCompanion[]>;
  /**
   * Hire a tavern companion. Resolves when the simulation accepts the order;
   * rejects with the simulation's own reason when it refuses (short purse,
   * not enough renown, no battle wins yet).
   */
  onHireCompanion?: (companionId: string) => Promise<void>;
  /**
   * Read the smithy bench (tasks 119–121): recipes, open noble orders and the
   * smith's stamina. Fetched on demand, when the player steps inside, not on
   * every panel render. Rejects with the simulation's own reason when the
   * bench cannot be read.
   */
  onLoadSmithy?: () => Promise<SmithyView>;
  /**
   * Forge a recipe. Rejects with the simulation's own reason (short metal,
   * no fuel, a tired smith).
   */
  onForgeItem?: (recipeId: string) => Promise<{ name: string }>;
  /** Smelt one arms into metal. Rejects with the simulation's own reason. */
  onSmeltArms?: (quantity: number) => Promise<{ metal: number }>;
  /** Deliver a forged piece against a noble order. Rejects with the simulation's own reason. */
  onFulfillOrder?: (orderId: string) => Promise<{ reward: number; line: string }>;
  /**
   * Play tavern dice (task block 6b7229ff): stake gold, best of three takes
   * the pot. Rejects with the simulation's own reason (short purse, no game
   * tonight).
   */
  onPlayDice?: (stake: number) => Promise<{ won: boolean; payout: number; line: string }>;
  /**
   * The survey is still being read. Renders `town-skeleton`, which mirrors this
   * panel's sections, so the context region does not change height when the town
   * lands. Drawn before the request, never after it (CONSTITUTION.md section 3.2).
   */
  loading?: boolean;
  testId?: string;
}

/** The empty-state copy, verbatim from ART_DIRECTION.md section 10.2. */
const NO_TOWN_HEADLINE = "No town selected.";
const NO_TOWN_DETAIL = "Choose a settlement on the map, or press Tab to cycle holdings.";

/** The failure copy, ART_DIRECTION.md section 10.2, with the town named in it. */
function noSurvey(townName: string): string {
  return `The town ledger did not load. The connection to the simulation was refused, and ${townName} could not be read.`;
}

export function townPanel(options: TownPanelOptions): HTMLElement {
  if (options.loading) return townSkeleton(options.town?.name ?? "Town");

  const { town, previous } = options;
  if (!town) return townPanelEmpty(options);

  const { root, body } = panel({
    title: town.name,
    testId: options.testId ?? "town-panel",
    ...(options.testId ? {} : { onClose: () => undefined }),
  });
  // The town panel is the context panel, so it does not close itself; the HUD owns it.
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);

  // food_stock is person-days (CAUSE_EFFECT.md section 2). Days is what a player can
  // act on, and dividing by demand is the only way to get it. Showing the raw field
  // labelled "days" is how a town with 8,166 person-days ends up claiming 8,166 days.
  const demand = Math.max(1, town.foodDemand);
  const daysOfFood = town.foodStock / demand;
  const foodBalance = town.foodProduction - town.foodDemand;
  const daysToEmpty = foodBalance < 0 ? daysOfFood / ((-foodBalance) / demand) : null;
  const loyaltyDays = town.loyalty < 0.2 ? 12 : null;

  // -- the town header: name, then who holds it and under whose banner -------
  // Task 101. `TownState` carries `holderName` (a person) but no faction field, so
  // the banner can only be drawn when the caller supplies the holding faction by
  // name. Without one the header says who holds the town and stops, rather than
  // guessing a side from the holder's name or the state's code — a banner is a
  // claim about who controls a place, and an invented one is a lie about the map.
  //
  // Rowan (del order 2026-10-03): lore button deep-links to the codex when a
  // lore entry exists for this settlement.
  const loreEntryId = settlementLoreEntry(town.settlementId);
  const headerActions = h("div", { style: "display:flex;gap:var(--space-1)" });
  if (loreEntryId && options.onOpenLore) {
    const loreBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn--quiet btn--xs",
        "data-testid": "town-lore",
        title: `Read the lore of ${town.name}`,
      },
      "📖 Lore",
    ) as HTMLButtonElement;
    loreBtn.addEventListener("click", () => options.onOpenLore?.(loreEntryId));
    headerActions.appendChild(loreBtn);
  }
  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      holderBanner(options.holderFaction),
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `Held by ${town.holderName}`),
        h("p", { class: "caption", style: "margin:0" }, `A ${town.klass} on the surveyed road network`),
      ),
      statusChip(unrestKind(town.unrest), `Unrest ${town.unrest.toFixed(2)}`, { testId: "town-unrest-chip" }),
      headerActions,
    ),
  );
  body.appendChild(
    h(
      "div",
      {},
      row("Population", town.population === null ? "Not surveyed" : town.population.toLocaleString("en-US"), { mono: true, testId: "town-population" }),
      row("Workers", town.workers.toLocaleString("en-US"), { mono: true, testId: "town-workers" }),
      row("Production", `${Math.round(town.foodProduction).toLocaleString("en-US")} person-days a day`, { mono: true, testId: "town-production" }),
    ),
  );

  // -- food, the thing that kills towns ------------------------------------
  body.appendChild(sectionHeader("Food and supply", whyButton("foodStock", () => options.onWhy("foodStock"))));
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
        { class: "annotation", style: "font-size:var(--type-caption-size)", "data-testid": "town-food-note" },
        "The store is empty. People are already going without.",
      ),
    );
  } else if (daysToEmpty !== null) {
    body.appendChild(
      h(
        "p",
        { class: "annotation", style: "font-size:var(--type-caption-size)", "data-testid": "town-food-note" },
        `At the current rate the store empties in about ${daysToEmpty.toFixed(1)} days.`,
      ),
    );
  }

  // -- health ---------------------------------------------------------------
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
        thresholds: { criticalBelow: 0.05, warningBelow: 0.02, goodAbove: 0 },
        testId: "town-infection-gauge",
      }),
      row(
        "Medicine in store",
        town.medicineStock <= 0
          ? h("span", { class: "caption", "data-testid": "town-medicine" }, "No doses. Nobody is being treated.")
          : `${Math.round(town.medicineStock).toLocaleString("en-US")} doses`,
        { mono: true, testId: "town-medicine" },
      ),
    ),
  );

  // -- sanitation and infrastructure ----------------------------------------
  body.appendChild(sectionHeader("Sanitation and housing", whyButton("sanitation", () => options.onWhy("sanitation"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Sanitation",
        value: town.sanitation,
        trend: previous ? trendOf(town.sanitation, previous.sanitation) : "flat",
        note: town.sanitation < 0.5 ? "Water and waste handling is failing." : "Water and waste are being handled.",
        thresholds: { criticalBelow: 0.4, warningBelow: 0.6, goodAbove: 0.8 },
        testId: "town-sanitation-gauge",
      }),
      row("Crowding", `${(town.crowding * 100).toFixed(0)}% of housing capacity`, { mono: true, testId: "town-crowding" }),
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
      row("Prosperity", town.prosperity.toFixed(2), { mono: true, testId: "town-prosperity" }),
    ),
  );

  // -- taxes: the holder sets the town rate and the state rate ---------------
  body.appendChild(taxSection(town, options));

  // -- projects: Bannerlord's "Manage Town" building list --------------------
  body.appendChild(projectsSection(town, options));

  // -- media trust ----------------------------------------------------------
  body.appendChild(sectionHeader("Media trust", whyButton("informationTrust", () => options.onWhy("informationTrust"))));
  body.appendChild(
    h(
      "div",
      {},
      gauge({
        label: "Trust in what is published",
        value: town.informationTrust,
        trend: previous ? trendOf(town.informationTrust, previous.informationTrust) : "flat",
        note:
          town.informationTrust < 0.4
            ? "The town's figures are being disbelieved. Warnings about it travel further than warnings about it."
            : "What the town publishes is taken at face value.",
        thresholds: { criticalBelow: 0.25, warningBelow: 0.45, goodAbove: 0.7 },
        testId: "town-trust-gauge",
      }),
    ),
  );

  // -- garrison and roads ---------------------------------------------------
  body.appendChild(sectionHeader("Garrison and roads", whyButton("road_safety", () => options.onWhy("road_safety"))));
  body.appendChild(
    h(
      "div",
      {},
      row("Garrison", `${town.garrison.toLocaleString("en-US")} soldiers`, { mono: true, testId: "town-garrison" }),
      gauge({
        label: "Garrison conduct",
        value: town.garrisonConduct,
        trend: previous ? trendOf(town.garrisonConduct, previous.garrisonConduct) : "flat",
        note: town.garrisonConduct < 0.5 ? "The garrison is treating residents badly. That shows up in unrest." : "The garrison is behaving.",
        thresholds: { criticalBelow: 0.4, warningBelow: 0.6, goodAbove: 0.8 },
        testId: "town-conduct-gauge",
      }),
      gauge({
        label: "Road safety",
        value: town.roadSafety,
        trend: previous ? trendOf(town.roadSafety, previous.roadSafety) : "flat",
        note: town.roadSafety < 0.35 ? "No patrols. Caravans get taken here." : "Patrols are running.",
        thresholds: { criticalBelow: 0.3, warningBelow: 0.5, goodAbove: 0.7 },
        testId: "town-road-gauge",
      }),
    ),
  );
  // Militia recruitment: the order goes to the simulation, which owns the cost
  // and the result. The button only appears when the caller can send the order.
  if (options.onRecruitMilitia !== undefined) {
    const qty = numberField("militia-qty", "Militia to hire", 10, { min: 1, max: 100 });
    const hireBtn = h("button", { type: "button", class: "btn btn--small", "data-testid": "hire-militia" }, "Hire militia");
    hireBtn.addEventListener("click", () => {
      const n = Math.max(1, Math.floor(Number(qty.input.value) || 1));
      hireBtn.setAttribute("disabled", "");
      void options.onRecruitMilitia!(n).finally(() => hireBtn.removeAttribute("disabled"));
    });
    body.appendChild(h("div", { style: "margin-top:var(--space-2)" }, qty.field, hireBtn));
  }

  // -- money ----------------------------------------------------------------
  body.appendChild(sectionHeader("Money", whyButton("money", () => options.onWhy("money"))));
  body.appendChild(
    h(
      "div",
      {},
      row("Money", `$${Math.round(town.money).toLocaleString("en-US")}`, { mono: true, testId: "town-money" }),
      row("Gold", `$${Math.round(town.gold).toLocaleString("en-US")}`, { mono: true, testId: "town-gold" }),
      row("Metal", `${Math.round(town.metal).toLocaleString("en-US")}`, { mono: true, testId: "town-metal" }),
    ),
  );

  // -- workshops ------------------------------------------------------------
  // Player-owned businesses in this town. The list and the buy/sell orders come
  // from the caller; a workshop section the player cannot act on is worse than
  // no section, because it tells them they own businesses they cannot touch.
  if (options.workshops !== undefined || options.onBuyWorkshop !== undefined) {
    body.appendChild(sectionHeader("Workshops"));
    const owned = (options.workshops ?? []).filter((w) => w.townId === town.id);
    if (owned.length === 0) {
      body.appendChild(emptyState("No workshops here.", "Buy a business to earn daily income from this town."));
    } else {
      const list = h("div", { class: "ledger__list" });
      for (const w of owned) {
        const sellBtn =
          options.onSellWorkshop !== undefined
            ? (() => {
                const btn = h("button", { type: "button", class: "btn btn--small", "data-testid": `sell-workshop-${w.id}` }, "Sell");
                btn.addEventListener("click", () => {
                  btn.setAttribute("disabled", "");
                  void options.onSellWorkshop!(w.id).finally(() => btn.removeAttribute("disabled"));
                });
                return btn;
              })()
            : null;
        list.appendChild(
          row(
            w.name,
            h(
              "span",
              { class: "data" },
              `$${Math.round(w.dailyIncome).toLocaleString("en-US")}/day`,
              sellBtn ? h("span", { style: "margin-left:var(--space-2)" }, sellBtn) : null,
            ),
            { testId: `workshop-${w.id}` },
          ),
        );
      }
      body.appendChild(list);
    }
    if (options.onBuyWorkshop !== undefined) {
      const typeSelect = h("select", {
        class: "field__input",
        "data-testid": "buy-workshop-type",
        "aria-label": "Workshop type",
      }) as HTMLSelectElement;
      for (const [value, label] of [
        ["smithy", "Smithy"],
        ["brewery", "Brewery"],
        ["weavery", "Weavery"],
        ["tannery", "Tannery"],
        ["press", "Press"],
      ]) {
        const opt = h("option", { value }, label) as HTMLOptionElement;
        typeSelect.appendChild(opt);
      }
      const buyBtn = h("button", { type: "button", class: "btn", "data-testid": "buy-workshop" }, "Buy a workshop");
      buyBtn.addEventListener("click", () => {
        buyBtn.setAttribute("disabled", "");
        void options.onBuyWorkshop!(typeSelect.value).finally(() => buyBtn.removeAttribute("disabled"));
      });
      body.appendChild(h("div", { style: "margin-top:var(--space-2)" }, typeSelect, buyBtn));
    }
  }

  // -- trade agreement (solo task 76): propose a deal, the town answers ---
  body.appendChild(sectionHeader("Trade agreement"));
  const { field: dealOfferField, input: dealOffer } = numberField("deal-offer", "Up-front offer", 0, { min: 0 });
  const { field: dealDiscountField, input: dealDiscount } = numberField("deal-discount", "Discount on your goods (0-50)", 0, { min: 0, max: 50 });
  const { field: dealTariffField, input: dealTariff } = numberField("deal-tariff", "Tariff relief asked (0-50)", 0, { min: 0, max: 50 });
  const dealPriority = h("input", {
    type: "checkbox",
    id: "deal-priority",
    "aria-label": "Priority market access",
    "data-testid": "deal-priority",
  }) as HTMLInputElement;
  const dealResult = h("p", { class: "caption", "data-testid": "deal-result", role: "status" },
    "Propose terms; the town answers accept, counter, or refuse.");
  const dealBtn = button("Propose deal", () => {
    const offer = Number(dealOffer.value);
    const discount = Number(dealDiscount.value);
    const tariffAsk = Number(dealTariff.value);
    if (!Number.isFinite(offer) || offer < 0 || !Number.isFinite(discount) || discount < 0 || discount > 50 ||
        !Number.isFinite(tariffAsk) || tariffAsk < 0 || tariffAsk > 50) {
      dealResult.textContent = "Terms out of range.";
      return;
    }
    try {
      const proposal = proposeTradeDeal(
        town.id, town.name, town.loyalty, offer, discount, tariffAsk, dealPriority.checked,
      );
      const answer = answerProposal(proposal, (options.day ?? 0) >>> 0);
      dealResult.textContent = answer.line;
    } catch (e) {
      dealResult.textContent = e instanceof Error ? e.message : "The deal fell through.";
    }
  }, { testId: "deal-propose" });
  body.appendChild(
    h("div", { class: "form-row" }, dealOfferField, dealDiscountField, dealTariffField,
      h("label", { for: "deal-priority" }, "Priority access", dealPriority)),
  );
  body.appendChild(dealBtn);
  body.appendChild(dealResult);
  body.appendChild(
    h("p", { class: "caption" },
      `Standing here is the town's loyalty (${Math.round(town.loyalty)}); the deal is binding once the town answers.`),
  );

  // -- actions: the market link, the march, the rulers ----------------------
  const actions = h("div", { class: "field-row", style: "margin-top:var(--space-4)" });
  const marketBtn = h("button", { type: "button", class: "btn btn--primary", "data-testid": "open-market" }, "Open the market");
  marketBtn.addEventListener("click", () => options.onOpenMarket());
  const marchBtn = h("button", { type: "button", class: "btn", "data-testid": "open-march-planner" }, "March here");
  marchBtn.addEventListener("click", () => options.onMarchHere());
  const rosterBtn = h("button", { type: "button", class: "btn", "data-testid": "open-roster" }, "Rulers");
  rosterBtn.addEventListener("click", () => options.onRoster());
  actions.append(marketBtn, marchBtn, rosterBtn);
  body.appendChild(actions);

  // -- recruit ----------------------------------------------------------------
  if (options.onRecruit) {
    body.appendChild(recruitSection(town, options));
  }

  // -- notables (task 129) ----------------------------------------------------
  body.appendChild(notablesSection(town));

  // Rowan (del order 2026-10-04): city notables with portraits and lore.
  // These are the 12 hand-written NPCs per city from the name generator.
  const cityNotables = notablesForCity(town.settlementId);
  if (cityNotables.length > 0) {
    body.appendChild(cityNotablesSection(cityNotables));
  }

  // Rowan (del order 2026-10-04): named building owners (taverns, workshops, etc.)
  const buildingOwners = buildingOwnersForCity(town.settlementId);
  if (buildingOwners.length > 0) {
    body.appendChild(buildingOwnersSection(buildingOwners));
  }

  // -- simulated town facilities (tavern, dice, smithy, ...) --------------------
  // The town-sections pipeline: each registered spec renders itself when the
  // caller passed the handlers that make it real. A new facility is a spec
  // file in sections/ plus a handler here — the panel needs nothing else.
  for (const spec of TOWN_SECTIONS) {
    const section = townSectionFromSpec(spec, options);
    if (section) body.appendChild(section);
  }

  // -- what happened here (task 138) ------------------------------------------
  const events = eventsSection(town, options);
  if (events) body.appendChild(events);

  return root;
}

/**
 * Recent events in this town. Task 138.
 *
 * The entries are the campaign's own `Notification` records, filtered to this town
 * by `entityId` and newest first. The panel writes nothing of its own — it prints
 * the simulation's sentence and the day it happened on, and offers a "Why"
 * affordance for any entry that names a field, which goes to the same
 * `onWhy` handler the rest of the panel uses. Priority is carried by the status
 * chip's glyph and word as well as its colour, so a critical notice does not
 * depend on hue (ART_DIRECTION.md 5.3).
 *
 * Without a feed the section is not drawn. An empty list is a different claim — it
 * says nothing has happened, which is only true when the caller actually looked —
 * so the panel distinguishes "no feed" from "a feed with nothing in it".
 */
function eventsSection(town: TownState, options: TownPanelOptions): HTMLElement | null {
  if (options.notifications === undefined) return null;
  const mine = options.notifications
    .filter((n) => n.entityId === town.id)
    .sort((a, b) => b.day - a.day)
    .slice(0, RECENT_EVENT_LIMIT);

  const wrap = h("section", { "data-testid": "town-events" });
  wrap.appendChild(sectionHeader("Recent events"));

  if (mine.length === 0) {
    wrap.appendChild(
      emptyState(
        "Nothing has changed here.",
        "No recorded events for this town. Watch the unrest and supply figures above for what is building up.",
      ),
    );
    return wrap;
  }

  const list = h("ol", { class: "event-list" });
  for (const notice of mine) {
    const item = h("li", {
      class: "event",
      "data-testid": `town-event-${notice.id}`,
      "data-priority": notice.priority,
    });
    item.appendChild(
      h(
        "div",
        { class: "field-row", style: "gap:var(--space-2);align-items:flex-start" },
        statusChip(EVENT_PRIORITY_KIND[notice.priority], notice.text, {
          testId: `town-event-chip-${notice.id}`,
        }),
        h("span", { class: "event__day mono caption", "data-testid": `town-event-day-${notice.id}` }, `Day ${notice.day}`),
      ),
    );
    const field = notice.field;
    if (field) {
      item.appendChild(whyButton(field, () => options.onWhy(field)));
    }
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * Who is worth knowing in this town. Task 129.
 *
 * `town.notables` is in the simulation contract and this is the first thing that
 * draws it: a per-settlement roster with the two numbers that gate anything — the
 * notable's power, which unlocks recruits, and their standing with you, which
 * unlocks prices and work. Both come from the simulation; the panel prints them and
 * nothing else. The band a relation falls into is `relationBand` from
 * `src/diplomacy/notables.ts`, shared with the rest of the client rather than
 * re-decided here, so a notable reads the same in this panel and anywhere else.
 *
 * A town with no notables gets the empty state, not a fabricated list.
 */
function notablesSection(town: TownState): HTMLElement {
  const wrap = h("section", { "data-testid": "town-notables" });
  wrap.appendChild(sectionHeader("Notable residents"));

  // `notables` is non-optional on `TownState`, but it is not in every payload the
  // client is handed: a town record from a simulation that predates the field
  // arrives without the key. A missing roster and an empty roster make the same
  // claim — nobody here — so both take the empty state rather than throwing on
  // `undefined.length`.
  const notables = town.notables ?? [];

  if (notables.length === 0) {
    wrap.appendChild(
      emptyState(
        "Nobody here is worth knowing yet.",
        "No notable residents are recorded in this town. Work and prices stay locked until one is.",
      ),
    );
    return wrap;
  }

  const list = h("ul", { class: "notable-list" });
  for (const notable of notables) {
    const band = relationBand(notable.relation);
    const item = h("li", {
      class: "notable",
      "data-testid": `town-notable-${notable.id}`,
      "data-band": band,
    });
    item.append(
      h(
        "div",
        { class: "field-row", style: "justify-content:space-between;align-items:baseline;gap:var(--space-2)" },
        h("strong", { class: "label" }, notable.name),
        h("span", { class: "notable__type caption" }, NOTABLE_TYPE_LABEL[notable.type]),
      ),
      h("p", { class: "caption", style: "margin:var(--space-1) 0 0" }, notable.blurb),
      h(
        "div",
        { class: "field-row", style: "gap:var(--space-3);margin-top:var(--space-2)" },
        h(
          "span",
          { class: "row__value data", "data-testid": `town-notable-power-${notable.id}` },
          `Power ${Math.round(notable.power)}`,
        ),
        h(
          "span",
          { class: "row__value data", "data-testid": `town-notable-relation-${notable.id}` },
          `${RELATION_BAND_LABEL[band]} (${signed(notable.relation)})`,
        ),
      ),
    );
    list.appendChild(item);
  }
  wrap.appendChild(list);
  wrap.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-2) 0 0" },
      "Power decides who will sign on for you. Standing decides what they will tell you.",
    ),
  );
  return wrap;
}

/**
 * City notables with portraits and lore (del order 2026-10-04).
 * The 12 hand-written NPCs per city from the name generator, with AI-generated
 * portraits and 2-sentence lore. These supplement the sim's notables.
 */
function cityNotablesSection(notables: import("../../data/notables/index.js").CityNotable[]): HTMLElement {
  const wrap = h("section", { "data-testid": "town-city-notables" });
  wrap.appendChild(sectionHeader("City notables"));

  const grid = h("div", { class: "city-notables-grid", style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-3)" });
  for (const notable of notables) {
    // Portrait key is like "german-male-middle"; we have 18 base portraits (ethnicity-gender).
    const baseKey = notable.portraitKey.split("-").slice(0, 2).join("-");
    const portraitUrl = `/portraits/portrait-${baseKey}.webp`;

    const card = h("div", {
      class: "city-notable-card",
      "data-testid": `city-notable-${notable.id}`,
      style: "border:1px solid var(--border);border-radius:var(--radius);padding:var(--space-2);background:var(--surface);cursor:pointer",
    });
    // Greet when the player clicks a notable to talk.
    card.addEventListener("click", () => {
      greetNpc(voiceForNpc(notable.id));
    });
    card.append(
      h("img", {
        src: portraitUrl,
        alt: `Portrait of ${notable.name}`,
        style: "width:64px;height:64px;border-radius:50%;object-fit:cover;float:left;margin-right:var(--space-2)",
        "data-testid": `city-notable-portrait-${notable.id}`,
      }),
      h("div", {},
        h("strong", { class: "label" }, notable.name),
        h("div", { class: "caption" }, `${notable.title} • Power ${notable.power}`),
      ),
      h("p", { class: "caption", style: "margin:var(--space-2) 0 0;clear:both" }, notable.lore),
    );
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  return wrap;
}

/**
 * Building owners section (del order 2026-10-04).
 * Named proprietors for taverns, workshops, markets, stables, smithies.
 */
function buildingOwnersSection(owners: import("../../data/buildingOwners.js").BuildingOwner[]): HTMLElement {
  const wrap = h("section", { "data-testid": "town-building-owners" });
  wrap.appendChild(sectionHeader("Establishments"));

  const list = h("ul", { class: "building-list" });
  for (const owner of owners) {
    const portraitUrl = `/portraits/portrait-${owner.portraitKey}.webp`;
    const item = h("li", {
      class: "building",
      "data-testid": `building-${owner.id}`,
      style: "display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-2)",
    });
    item.append(
      h("img", {
        src: portraitUrl,
        alt: `Portrait of ${owner.ownerName}`,
        style: "width:48px;height:48px;border-radius:50%;object-fit:cover",
      }),
      h("div", {},
        h("strong", { class: "label" }, owner.buildingName),
        h("div", { class: "caption" }, `${owner.ownerName} — ${owner.ownerTitle}`),
      ),
    );
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * Taxes the holder can set: the town's own rate and the US-state rate that
 * applies to every town in the state. Steppers move in whole points; the
 * simulation clamps and applies the order.
 */
function taxSection(town: TownState, options: TownPanelOptions): HTMLElement {
  const wrap = h("section", { "data-testid": "tax-section" });
  wrap.appendChild(sectionHeader("Taxes", whyButton("taxRate", () => options.onWhy("taxRate"))));

  const townPct = Math.round(town.taxRate * 100);
  const statePct = Math.round(town.stateTaxRate * 100);

  const townRow = h("div", { class: "field-row", style: "align-items:center;justify-content:space-between" });
  townRow.append(
    h("span", {}, `Town tax — ${townPct}%`),
    taxStepper(townPct, 0, 50, 5, (next) => options.onSetTaxRate?.(next / 100), "town-tax"),
  );
  const stateRow = h("div", { class: "field-row", style: "align-items:center;justify-content:space-between" });
  stateRow.append(
    h("span", {}, `${town.state} state tax — ${statePct}%`),
    taxStepper(statePct, 0, 15, 1, (next) => options.onSetStateTaxRate?.(next / 100), "state-tax"),
  );

  // What-if preview from the tax simulator (solo task 77): the simulator's
  // estimate at the current rate and one step up, before anything is applied.
  const pop = town.population ?? 0;
  const here = simulateTaxPolicy(town.taxRate, town.taxRate, town.prosperity, pop);
  const lines = [h("p", { class: "caption", "data-testid": "tax-sim-current" }, `Simulator estimate at ${townPct}%: ${here.line}`)];
  if (townPct + 5 <= 50) {
    const up = simulateTaxPolicy(town.taxRate, town.taxRate + 0.05, town.prosperity, pop);
    lines.push(h("p", { class: "caption", "data-testid": "tax-sim-up" }, `One step up (${townPct + 5}%): ${up.line}`));
  }

  wrap.append(
    townRow,
    stateRow,
    h("p", { class: "caption", style: "margin:var(--space-1) 0 0" },
      "High town taxes feed unrest and cost loyalty. The state cut goes to the controlling faction's treasury."),
    ...lines,
  );
  return wrap;
}

/** A − value + stepper. Calls onChange with the new integer percent. */
function taxStepper(
  current: number, min: number, max: number, step: number,
  onChange: (next: number) => Promise<void> | void, testId: string,
): HTMLElement {
  const wrap = h("div", { class: "field-row", style: "gap:var(--space-1)", "data-testid": testId });
  const label = h("span", { class: "mono", style: "min-width:3ch;text-align:center" }, `${current}%`);
  const busy = { on: false };
  const set = async (next: number) => {
    next = Math.min(max, Math.max(min, next));
    if (next === current || busy.on) return;
    busy.on = true;
    try {
      await onChange(next);
    } finally {
      busy.on = false;
    }
  };
  const minus = h("button", { type: "button", class: "btn btn--small", "aria-label": "Lower tax" }, "−");
  const plus = h("button", { type: "button", class: "btn btn--small", "aria-label": "Raise tax" }, "+");
  minus.addEventListener("click", () => void set(current - step));
  plus.addEventListener("click", () => void set(current + step));
  wrap.append(minus, label, plus);
  return wrap;
}

/**
 * Settlement projects: Bannerlord's "Manage Town" building list. Each row
 * shows the tier pips, what the next tier does and costs, and a build button.
 * The panel sends the order; the simulation decides if it happens and says why.
 */
function projectsSection(town: TownState, options: TownPanelOptions): HTMLElement {
  const wrap = h("section", { "data-testid": "projects-section" });
  wrap.appendChild(sectionHeader("Projects"));

  if (town.constructionBuilding) {
    const active = town.buildings.find((b) => b.id === town.constructionBuilding);
    wrap.appendChild(
      h("p", { class: "caption", style: "margin:0 0 var(--space-2)", "data-testid": "construction-active" },
        `Building ${active?.name ?? town.constructionBuilding} — ${Math.ceil(town.constructionDaysLeft)} days left.`),
    );
  }

  const list = h("div", { style: "display:grid;gap:var(--space-2)" });
  for (const b of town.buildings) {
    list.appendChild(projectRow(town, b, options));
  }
  wrap.appendChild(list);
  return wrap;
}

function projectRow(town: TownState, b: BuildingInfo, options: TownPanelOptions): HTMLElement {
  const maxed = b.level >= b.maxLevel;
  const busy = town.constructionBuilding !== null;
  const afford = town.money >= b.nextCost;

  const pips = "●".repeat(b.level) + "○".repeat(Math.max(0, b.maxLevel - b.level));
  const head = h("div", { class: "field-row", style: "justify-content:space-between;align-items:baseline" });
  head.append(
    h("strong", {}, b.name),
    h("span", { class: "mono caption", "aria-label": `Tier ${b.level} of ${b.maxLevel}` }, pips),
  );

  const sub = h("p", { class: "caption", style: "margin:0" },
    `${b.blurb} · Bannerlord: ${b.bannerlord}.`);

  const foot = h("div", { class: "field-row", style: "justify-content:space-between;align-items:center" });
  const msg = h("span", { class: "caption", role: "status" });
  if (maxed) {
    foot.append(h("span", { class: "caption" }, "Max tier."));
  } else {
    foot.append(
      h("span", { class: "caption mono" },
        `Tier ${b.level + 1}: $${b.nextCost.toLocaleString("en-US")} · ${b.nextDays}d`),
    );
    const btn = h("button", {
      type: "button",
      class: "btn btn--small",
      "data-testid": `build-${b.id}`,
      ...(busy || !afford ? { disabled: "true" } : {}),
    }, busy ? "Busy" : "Build");
    if (!busy && afford && options.onStartConstruction) {
      btn.addEventListener("click", () => {
        btn.setAttribute("disabled", "true");
        void options.onStartConstruction!(b.id).then((res) => {
          msg.textContent = res.message;
          if (!res.ok) btn.removeAttribute("disabled");
        });
      });
    } else if (!afford && !maxed) {
      msg.textContent = "Cannot afford.";
    }
    foot.append(btn);
  }
  foot.append(msg);

  const rowEl = h("div", { "data-testid": `project-${b.id}` });
  rowEl.append(head, sub, foot);
  return rowEl;
}

/**
 * Who is willing to sign on here. The list comes from the simulation; the panel
 * sends the order and shows the simulation's answer verbatim.
 */
function recruitSection(town: TownState, options: TownPanelOptions): HTMLElement {
  const wrap = h("section", { "data-testid": "recruit-section" });
  wrap.appendChild(sectionHeader("Recruit"));

  if (town.recruitable.length === 0) {
    wrap.appendChild(
      emptyState(
        "Nobody is signing on here.",
        "No willing recruits in this town right now. Try a larger town.",
      ),
    );
    return wrap;
  }

  const message = h("p", { class: "caption", "data-testid": "recruit-message", role: "status", style: "margin:0 0 var(--space-3)" });
  message.style.display = "none";
  wrap.appendChild(message);

  const purse = options.purse ?? 0;
  wrap.appendChild(
    h("p", { class: "caption", style: "margin:0 0 var(--space-3)" },
      `Purse $${Math.round(purse).toLocaleString("en-US")}. The hiring bonus is paid now; wages join the daily bill.`),
  );

  for (const unit of town.recruitable) {
    wrap.appendChild(recruitRow(unit, options, message));
  }
  return wrap;
}

function recruitRow(
  unit: RecruitableUnit,
  options: TownPanelOptions,
  message: HTMLElement,
): HTMLElement {
  const rowEl = h("div", { class: "field-row", style: "margin-bottom:var(--space-3)" });
  const qty = numberField(`recruit-qty-${unit.unitId}`, "Number", 10, {
    min: 1,
    max: unit.available,
    step: 1,
  });
  const hire = h(
    "button",
    { type: "button", class: "btn", "data-testid": `recruit-${unit.unitId}` },
    `Hire ${unit.name}`,
  );

  const updateLabel = (): void => {
    const n = Math.max(1, Math.floor(Number(qty.input.value) || 1));
    const cost = n * unit.hireCost;
    hire.setAttribute("aria-label", `Hire ${n} ${unit.name} for $${cost.toLocaleString("en-US")}`);
    hire.title = `${n} × $${unit.hireCost} hiring bonus, $${unit.wage.toFixed(2)} a day each after.`;
  };
  qty.input.addEventListener("input", updateLabel);
  updateLabel();

  hire.disabled = unit.available < 1;
  hire.addEventListener("click", () => {
    if (hire.disabled) return;
    hire.disabled = true;
    const n = Math.max(1, Math.floor(Number(qty.input.value) || 1));
    void options.onRecruit!(unit.unitId, n).then(
      (result) => {
        hire.disabled = false;
        message.style.display = "";
        if (result.accepted) {
          message.textContent =
            `Hired ${result.quantity} ${result.unitName.toLowerCase()} for $${Math.round(result.totalCost).toLocaleString("en-US")}. ` +
            `${result.newCount} in the party now.`;
        } else {
          message.textContent = result.reason ?? "The hire was refused.";
        }
      },
      (err) => {
        hire.disabled = false;
        message.style.display = "";
        message.textContent =
          err instanceof SimulationUnavailableError ? err.playerMessage : "The hire did not go through.";
      },
    );
  });

  rowEl.append(
    h(
      "div",
      { style: "flex:1 1 auto;min-width:0" },
      h("p", { class: "label", style: "margin:0 0 var(--space-1)" },
        `${unit.name} — ${unit.available} willing`,
      ),
      h("p", { class: "caption", style: "margin:0" },
        `${unit.blurb} Quality ${unit.quality}/5. $${unit.hireCost} to sign, $${unit.wage.toFixed(2)} a day.`,
      ),
    ),
    qty.field,
    hire,
  );
  return rowEl;
}

/**
 * The tavern (tasks 115–117): recruitable NPCs, hire button, and what each one
 * wants before they follow the player. The roster is fetched when the player
 * steps inside, not on every panel render, so a town panel costs one request
 * no matter how often it repaints. Task 118 (rumors) is not drawn: the
 * simulation publishes no rumor field, and the panel does not invent one.
 */
/**
 * Nothing is selected. `ART_DIRECTION.md` section 10.2 gives the wording, and the
 * roster is offered as the way out of the state, because an empty panel that only
 * explains itself is a dead end.
 */
function townPanelEmpty(options: TownPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "No town",
    testId: options.testId ?? "town-panel",
    ...(options.testId ? {} : { onClose: () => undefined }),
  });
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);

  const roster = h("button", { type: "button", class: "btn", "data-testid": "empty-open-roster" }, "Open the roster");
  roster.addEventListener("click", () => options.onRoster());
  body.appendChild(
    h("div", { style: "margin-top:var(--space-2)" }, emptyState(NO_TOWN_HEADLINE, NO_TOWN_DETAIL, roster)),
  );
  return root;
}

/**
 * The holding faction's banner, or nothing at all (task 101).
 *
 * The cloth comes from the locked faction palette in whichever colour-blind mode
 * the app is running, and the ink from the same swatch, so the pairing is one the
 * palette has already checked rather than one chosen here. A name that is not a
 * playable side — a local clan holding one town — takes a stable pick from the
 * locked clan-banner palette, so the same name is always the same cloth.
 *
 * The banner carries the identity and the name carries the information: the name
 * sits on the panel's own ground, not on the cloth, because no contrast test has
 * verified an arbitrary ink-over-arbitrary-cloth pairing. When no faction name is
 * supplied at all, nothing is returned and the header keeps its two caption lines.
 */
function holderBanner(factionName: string | undefined): HTMLElement | null {
  const name = factionName?.trim();
  if (!name) return null;
  const swatch = bannerSwatch(name);
  return h(
    "div",
    { class: "town-banner", "data-testid": "town-banner", role: "img", "aria-label": `Held by ${name}` },
    h("span", {
      class: "town-banner__field",
      "aria-hidden": "true",
      "data-faction": name,
      style: `background:${swatch.color}`,
    }),
    h("span", { class: "town-banner__name" }, name),
  );
}

/** The cloth and ink a faction name wears. Both come from a locked palette. */
function bannerSwatch(name: string): FactionSwatch {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const side = PLAYABLE_SIDE_IDS.find((id) => id === slug);
  if (side) return factionPalette(activeColorblindMode())[side];
  // Not a playable side: the same stable pick the battle deployment banner makes,
  // so a clan's cloth is the same cloth wherever it is shown.
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % BANNER_COLORS.length;
  const color = BANNER_COLORS[hash] ?? BANNER_COLORS[0];
  return { color, ink: color };
}

/** The four notable roles, in the product's words rather than the type ids. */
const NOTABLE_TYPE_LABEL: Record<NotableType, string> = {
  merchant: "Merchant",
  "gang-leader": "Organised crime",
  veteran: "Veteran",
  "community-leader": "Community organiser",
};

/**
 * The band a relation falls into, printed as a word.
 *
 * The bands themselves come from `relationBand`, which is the client's shared
 * definition; this is only the wording, so a relation reads as a judgement the
 * player can act on rather than a bare -40.
 */
const RELATION_BAND_LABEL: Record<ReturnType<typeof relationBand>, string> = {
  hostile: "Hostile",
  cold: "Cold",
  neutral: "Neutral",
  warm: "Warm",
  allied: "Allied",
};

/** A signed number, with the sign explicit so +5 never reads as 5. */
function signed(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

/**
 * How many events the panel prints.
 *
 * A town that has been busy is not more useful past a screenful, and an unbounded
 * feed would push the sections below it — the notables roster, the actions — off
 * the bottom of the panel entirely.
 */
const RECENT_EVENT_LIMIT = 8;

/** Notification priority mapped onto the client's four status kinds. */
const EVENT_PRIORITY_KIND: Record<Notification["priority"], StatusKind> = {
  critical: "critical",
  important: "warning",
  informational: "info",
};

/** The colour-blind mode the app is running in, which `main.ts` records on the root. */
function activeColorblindMode(): ColorblindMode {
  const mode = document.documentElement.getAttribute("data-colorblind-mode");
  return mode === "deuteranopia" || mode === "protanopia" || mode === "tritanopia" ? mode : "off";
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

function unrestKind(unrest: number): StatusKind {
  if (unrest > 0.8) return "critical";
  if (unrest > 0.6) return "warning";
  return "good";
}

/**
 * The town panel's error state, shared with the HUD so both read the same. A plain
 * sentence and a way to recover (CONSTITUTION.md section 1.3); the cause goes to the
 * console, never to the screen.
 */
export function townPanelError(townName: string, detail: string, onRetry: () => void): HTMLElement {
  return errorState({
    message: noSurvey(townName),
    detail,
    onRetry,
    testId: "town-error",
  });
}
