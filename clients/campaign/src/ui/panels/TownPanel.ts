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
 *
 * **The read is a machine, not a boolean.** `loading?: boolean` was a flag that could
 * only say "draw a shape", and every question it left open — which shape, what the
 * failure was, whether repeating the request could help, and whether an answer that
 * arrives after a newer one still belongs on screen — was being answered one panel at a
 * time. The four phases live in `skeletons.ts` next to the shapes, and this panel keeps
 * them in one place:
 *
 *   idle ──▶ loading ──▶ ready
 *               │
 *               └──────▶ error ──(retry)──▶ loading
 *
 * The load is written in the order `CONSTITUTION.md` section 3.2 asks for: the skeleton
 * goes up before the request goes out, so there is never a frame with neither data nor
 * placeholder, and the complaint only replaces the placeholder once the request has
 * actually failed. The delay belongs to the provider, not to this file — a panel with a
 * timer in it would be a panel that can only be tested against its own timer.
 */

import { h, row, sectionHeader } from "../dom.js";
import { emptyState, errorState, gauge, panel, statusChip, type StatusKind } from "../kit.js";
import {
  failedLoad,
  idleLoad,
  loadingLoad,
  readyLoad,
  townSkeletonBody,
  type LoadPhase,
  type LoadState,
} from "./skeletons.js";
import { asBottomSheet } from "./narrow.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import type { SimulationProvider, TownState } from "../../data/types.js";

export interface TownPanelOptions {
  /**
   * `null` when the map has nothing selected. The panel then says what to do about
   * it rather than rendering an empty sheet of headings.
   */
  town: TownState | null;
  /** Previous tick's values, for the trend arrows. Null on the very first render. */
  previous?: TownState | null;
  /**
   * The data source seam. Give the panel a provider and it will go and read the survey
   * itself, which is what makes the retry button honest: a retry that re-renders the
   * same missing data is a lie told to the player.
   */
  provider?: SimulationProvider;
  /** Which town to read. Defaults to the id of `town`. */
  townId?: string;
  /**
   * The name to use before the survey lands, so the title bar and the failure copy can
   * say which town this is about rather than "the town". The market panel is given the
   * same pair, for the same reason.
   */
  townName?: string;
  onWhy: (field: string) => void;
  onOpenMarket: () => void;
  onMarchHere: () => void;
  onRoster: () => void;
  /**
   * The caller is already reading the survey. `town-skeleton` goes up, which mirrors
   * this panel's sections, so the context region does not change height when the town
   * lands. Drawn before the request, never after it (CONSTITUTION.md section 3.2).
   */
  loading?: boolean;
  testId?: string;
}

export interface TownPanelHandle {
  root: HTMLElement;
  /** Where the read has got to. One of the four phases in `skeletons.ts`. */
  phase(): LoadPhase;
  /** Re-read the survey. Backs the "Try again" button. */
  reload(): Promise<void>;
  /** Resolves when the read in flight has answered. Already resolved if none is. */
  settled(): Promise<void>;
}

/** The empty-state copy, verbatim from ART_DIRECTION.md section 10.2. */
const NO_TOWN_HEADLINE = "No town selected.";
const NO_TOWN_DETAIL = "Choose a settlement on the map, or press Tab to cycle holdings.";

/** The title bar while the survey is on its way, rather than a name nobody has yet. */
const READING_TITLE = "Town";
const NO_TOWN_TITLE = "No town";

/** The failure copy, ART_DIRECTION.md section 10.2, with the town named in it. */
function noSurvey(townName: string): string {
  return `The town ledger did not load. The connection to the simulation was refused, and ${townName} could not be read.`;
}

/**
 * The other failure. The snapshot answered, so nothing refused the connection: it came
 * back without this town on it. Saying the connection was refused here would blame the
 * wrong thing, and the player would go looking for a server that is working fine.
 */
function noSurveyRecord(townName: string): string {
  return `The town ledger for ${townName} did not load. The simulation answered, and it carries no survey for that town.`;
}

/**
 * The town panel. Returns the root element, which is all the context region has ever
 * needed from it; `townPanelWithLoad` is the same panel with the read exposed, for a
 * caller that has to know which phase it is in or has to wait for the answer.
 */
export function townPanel(options: TownPanelOptions): HTMLElement {
  return townPanelWithLoad(options).root;
}

export function townPanelWithLoad(options: TownPanelOptions): TownPanelHandle {
  const { root, body } = panel({ title: READING_TITLE, testId: options.testId ?? "town-panel" });
  // The town panel is the context panel, so it does not close itself; the HUD owns it.
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);
  const title = root.querySelector<HTMLElement>(".panel__title")!;

  /** Where the survey comes from. Absent, the panel only ever draws what it was handed. */
  const source = options.provider;
  const targetId = options.townId ?? options.town?.id ?? null;
  const canRead = source !== undefined && targetId !== null && targetId !== "";
  /** The best name available for copy written before the survey lands. */
  const named = (): string => options.town?.name ?? options.townName ?? "that town";

  let state: LoadState<TownState> = starting();
  let previous = options.previous ?? null;
  /** Guards against a late answer overwriting a newer one. */
  let loadToken = 0;
  let inFlight: Promise<void> = Promise.resolve();

  /**
   * Where the panel starts.
   *
   * A panel asked for a town it does not have, and able to go and get one, is about to
   * be answered: its first frame is the skeleton and not a complaint about data that was
   * never on its way. A caller that passes `loading` has asked for that same frame
   * itself, whether or not it handed over a town. Anything else draws what it was given.
   */
  function starting(): LoadState<TownState> {
    const seed: LoadState<TownState> = options.town ? readyLoad(options.town) : idleLoad<TownState>();
    return options.loading === true || (canRead && options.town === null) ? loadingLoad(seed) : seed;
  }

  function transition(next: LoadState<TownState>): void {
    state = next;
    render();
  }

  /**
   * Ask the simulation for the survey again.
   *
   * The token is the whole of the ordering rule: an answer that arrives after the player
   * has already asked again belongs to a request nobody is waiting for, so it is dropped
   * rather than drawn. That is the difference between a panel that recovers and a panel
   * that flickers back to a stale survey.
   */
  function reload(): Promise<void> {
    if (source === undefined || targetId === null || targetId === "") return Promise.resolve();
    const token = ++loadToken;
    transition(loadingLoad(state));
    const read = fetchSurvey(source, targetId, token);
    inFlight = read;
    return read;
  }

  async function fetchSurvey(source: SimulationProvider, id: string, token: number): Promise<void> {
    try {
      const snapshot = await source.getSnapshot();
      if (token !== loadToken) return; // A newer request already answered.
      const found = snapshot.towns.find((t) => t.id === id || t.settlementId === id);
      if (!found) {
        transition(failedLoad<TownState>(noSurveyRecord(named()), `getSnapshot carried no town for ${id}.`));
        return;
      }
      // The survey on screen before the answer is what the trend arrows compare against.
      previous = state.value ?? previous;
      transition(readyLoad(found));
    } catch (err) {
      if (token !== loadToken) return;
      // The simulation's own sentence when it sent one; the panel's when it threw.
      const refused = err instanceof SimulationUnavailableError;
      transition(
        failedLoad<TownState>(
          refused ? err.playerMessage : noSurvey(named()),
          refused ? err.developerDetail : String(err),
          refused ? err.retryable : true,
        ),
      );
    }
  }

  function render(): void {
    title.textContent = state.value?.name ?? (state.phase === "idle" ? NO_TOWN_TITLE : READING_TITLE);
    body.replaceChildren();

    // Drawn before the request, and held until the request answers: a skeleton that
    // blinks out before the data is in is the jump it exists to prevent.
    if (state.phase === "loading") {
      body.appendChild(townSkeletonBody());
      return;
    }
    if (state.phase === "error") {
      body.appendChild(failure());
      return;
    }
    // `idle` with nothing to show, which is the one state that is not a failure.
    if (state.value === null) {
      body.appendChild(emptyNode());
      return;
    }
    drawTown(body, state.value, previous, options);
  }

  /**
   * The failed read: the plain sentence, and a way out of the panel.
   *
   * "Try again" only appears while repeating the request could work. When the simulation
   * has said it will not, the door out is offered instead — a button that repeats a
   * request it knows will fail is as much a lie as one that re-renders missing data.
   */
  function failure(): HTMLElement {
    const roster = h("button", { type: "button", class: "btn", "data-testid": "town-error-roster" }, "Open the roster");
    roster.addEventListener("click", () => options.onRoster());
    return townPanelFailure(
      state.failure ?? noSurvey(named()),
      state.detail,
      state.retryable ? () => void reload() : null,
      roster,
    );
  }

  /**
   * Nothing is selected. `ART_DIRECTION.md` section 10.2 gives the wording, and the
   * roster is offered as the way out of the state, because an empty panel that only
   * explains itself is a dead end.
   */
  function emptyNode(): HTMLElement {
    const roster = h("button", { type: "button", class: "btn", "data-testid": "empty-open-roster" }, "Open the roster");
    roster.addEventListener("click", () => options.onRoster());
    return emptyState(NO_TOWN_HEADLINE, NO_TOWN_DETAIL, roster);
  }

  render();
  // Gated on the state, not on `loading`: the panel asked for is the one that needs a
  // read, and `loading` is true precisely because it is already in one.
  if (state.phase === "loading") void reload();

  return {
    root,
    phase: () => state.phase,
    reload,
    settled: () => inFlight,
  };
}

/**
 * The town sheet itself, drawn into `body`.
 *
 * Nothing here reads or writes the load state: given a town, this is the whole panel,
 * and the read is the caller's business. That split is why the trend arrows can be shown
 * for a town that arrived in this frame.
 */
function drawTown(body: HTMLElement, town: TownState, previous: TownState | null, options: TownPanelOptions): void {
  // food_stock is person-days (CAUSE_EFFECT.md section 2). Days is what a player can
  // act on, and dividing by demand is the only way to get it. Showing the raw field
  // labelled "days" is how a town with 8,166 person-days ends up claiming 8,166 days.
  const demand = Math.max(1, town.foodDemand);
  const daysOfFood = town.foodStock / demand;
  const foodBalance = town.foodProduction - town.foodDemand;
  const daysToEmpty = foodBalance < 0 ? daysOfFood / ((-foodBalance) / demand) : null;
  const loyaltyDays = town.loyalty < 0.2 ? 12 : null;

  // -- population and workers ------------------------------------------------
  body.appendChild(
    h(
      "div",
      { class: "field-row", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, `Held by ${town.holderName}`),
        h("p", { class: "caption", style: "margin:0" }, `A ${town.klass} on the surveyed road network`),
      ),
      statusChip(unrestKind(town.unrest), `Unrest ${town.unrest.toFixed(2)}`, { testId: "town-unrest-chip" }),
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
      row("Tax rate", `${(town.taxRate * 100).toFixed(1)}%`, { mono: true, testId: "town-tax" }),
      row("Prosperity", town.prosperity.toFixed(2), { mono: true, testId: "town-prosperity" }),
    ),
  );

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
 * The town panel's error state: a plain sentence and a way to recover
 * (CONSTITUTION.md section 1.3). `onRetry` is null when repeating the request would not
 * help, in which case `secondary` is the door out instead.
 */
function townPanelFailure(
  message: string,
  detail: string,
  onRetry: (() => void) | null,
  secondary?: Node,
): HTMLElement {
  return errorState({
    message,
    detail,
    ...(onRetry ? { onRetry } : {}),
    ...(secondary ? { secondary } : {}),
    testId: "town-error",
  });
}

/**
 * The town panel's error state, shared with the HUD so both read the same. A plain
 * sentence and a way to recover (CONSTITUTION.md section 1.3); the cause goes to the
 * console, never to the screen.
 */
export function townPanelError(townName: string, detail: string, onRetry: () => void): HTMLElement {
  return townPanelFailure(noSurvey(townName), detail, onRetry);
}
