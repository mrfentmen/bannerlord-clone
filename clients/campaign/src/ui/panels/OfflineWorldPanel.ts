/**
 * The world without a simulation: the map, and only what the map can honestly say.
 *
 * `DATA-MANIFEST.md` section 1 splits the client in two. The geography is real public
 * data; the state of the world — who holds what, prices, unrest, the ledger, the cause
 * log — belongs to a simulation. When the simulation is not running, this is the whole of
 * what may be drawn, and it is worth offering: a real terrain map with real roads and real
 * places is a far better answer than a white screen.
 *
 * The rule this module exists to hold: **nothing here is a simulation figure.** There is no
 * price, no unrest, no garrison, no date and no clock, because the only source for every
 * one of them was the snapshot that did not arrive. What is shown per place is:
 *
 *  - the name, the position and the state, from OpenStreetMap;
 *  - the class, from `classifySettlement`, which is a real Census population read against
 *    a threshold and which reports `fromRealData: false` where no figure exists;
 *  - the population, or the words "not surveyed" when there is none;
 *  - the ground height under the place, from the elevation tiles the terrain was drawn
 *    from, or nothing at all when the tiles did not decode there.
 *
 * A place with no population gets the smallest silhouette on the map and the words "not
 * surveyed" here, which is what `townSilhouette` and `gauge` already do elsewhere in the
 * client. This is the Golden-settlement rule applied to every place on the map rather than
 * to one town.
 */

import { button, clear, h } from "../dom.js";
import { dataTable } from "../kit.js";
import { classifySettlement } from "../../world/load.js";
import { UNSURVEYED, type SurveyFacts } from "../../boot/bootFailure.js";
import type { TownClassName } from "../../design/tokens.js";
import type { WorldSettlement } from "../../world/types.js";

export interface OfflineWorldOptions {
  facts: SurveyFacts;
  /** The places already loaded from the survey. Not refetched, and not simulated. */
  places: WorldSettlement[];
  /**
   * Ground height in metres at a place, or `null` where the elevation tiles did not decode.
   * Supplied by the caller so this file needs no projection and no heightfield, and so a
   * test can pass a fixed number.
   */
  groundAt: (place: WorldSettlement) => number | null;
  /** Asks the simulation again. The caller owns the request and the handover. */
  onRetry: () => void;
  /** A place was chosen, from the list or from the map itself. */
  onSelect: (id: string) => void;
}

export interface OfflineWorldHandle {
  root: HTMLElement;
  /** Shows one place's real record, or the region's own facts when given nothing. */
  showPlace(place: WorldSettlement | undefined): void;
}

/**
 * How many places the list shows.
 *
 * Sorted by real population, so the ones cut are the smallest surveyed places. It is a
 * limit rather than a scroll because this panel sits over the map, and a 487-row list is a
 * document rather than a panel.
 */
const LIST_LIMIT = 24;

const CLASS_WORD: Record<TownClassName, string> = {
  city: "City",
  town: "Town",
  village: "Village",
};

export function offlineWorldPanel(options: OfflineWorldOptions): OfflineWorldHandle {
  const places = [...options.places].sort(byPopulationThenName);

  const banner = h("div", { class: "offline-banner", "data-testid": "offline-banner", role: "status" });
  // Glyph, then the words. The shape is the primary signal and the filled banner is the
  // third, per ART_DIRECTION.md section 5.3.
  banner.appendChild(h("span", { class: "offline-banner__glyph", "aria-hidden": "true" }, "▲"));
  banner.appendChild(h("span", { class: "label offline-banner__key" }, "Simulation not running"));
  banner.appendChild(
    h(
      "span",
      { class: "offline-banner__text" },
      "The terrain, roads and places below are real survey data. There is no simulation, so nothing about " +
        "the state of the world is shown.",
    ),
  );
  banner.appendChild(button("Try the simulation again", options.onRetry, { testId: "offline-retry" }));

  const panel = h("section", {
    class: "sheet panel offline-world",
    "data-testid": "offline-world",
    tabindex: "-1",
    "aria-label": "The world survey",
  });
  panel.appendChild(
    h("header", { class: "panel__header" }, h("h2", { class: "panel__title" }, "The world survey")),
  );
  const body = h("div", { class: "panel__body", "data-testid": "offline-world-body" });
  panel.appendChild(body);

  const root = h("div", { class: "offline" }, banner, panel);

  function showPlace(place: WorldSettlement | undefined): void {
    clear(body);
    if (!place) {
      body.appendChild(regionFacts(options.facts, places, options.onSelect));
      return;
    }
    body.appendChild(placeRecord(place, options.groundAt, options.facts));
  }

  showPlace(undefined);
  return { root, showPlace };
}

/**
 * Places with a real population first, largest first; then the places with none.
 *
 * The split is load-bearing. Treating `null` as zero in a single sort would also order the
 * places correctly, but it would interleave an unsurveyed place among villages with a few
 * hundred people, which reads as "almost nobody lives here" rather than "nobody has ever
 * counted here". They sit in their own block at the end, labelled, so the two cannot be
 * mistaken for each other.
 */
function byPopulationThenName(a: WorldSettlement, b: WorldSettlement): number {
  const av = a.population;
  const bv = b.population;
  if (av === null && bv === null) return a.name.localeCompare(b.name);
  if (av === null) return 1;
  if (bv === null) return -1;
  return bv - av || a.name.localeCompare(b.name);
}

/** The region on its own: the counts, the list of places, and nothing else. */
function regionFacts(facts: SurveyFacts, places: WorldSettlement[], onSelect: (id: string) => void): HTMLElement {
  const frag = document.createDocumentFragment();

  frag.appendChild(
    h(
      "p",
      { class: "caption" },
      facts.regionName
        ? `${facts.regionName}. ${facts.settlements.toLocaleString("en-US")} places are on this map, with ` +
            `${facts.roads.toLocaleString("en-US")} roads and ${facts.rail.toLocaleString("en-US")} rail lines.`
        : `${facts.settlements.toLocaleString("en-US")} places are on this map.`,
    ),
  );

  frag.appendChild(
    h(
      "p",
      { class: "danger", "data-testid": "offline-world-absent" },
      h("span", { class: "label" }, "Not available"),
      h(
        "span",
        { class: "caption" },
        " Prices, unrest, holdings, the ledger and the cause log. They come from the simulation, which is not " +
          "running, and this client shows no figure for any of them rather than inventing one.",
      ),
    ),
  );

  const rows = places.slice(0, LIST_LIMIT);
  const table = dataTable(
    "Places on the map, largest surveyed population first",
    [
      { header: "Place", render: (s: WorldSettlement) => s.name },
      { header: "Class", render: (s: WorldSettlement) => CLASS_WORD[classifySettlement(s).klass] },
      {
        header: "Population",
        numeric: true,
        render: (s: WorldSettlement) => (s.population === null ? UNSURVEYED : s.population.toLocaleString("en-US")),
      },
      { header: "State", render: (s: WorldSettlement) => s.state ?? "Not tagged" },
    ],
    rows,
    "offline-world-table",
  );
  frag.appendChild(table);

  // Every row carries a real control for the same map the player is looking at. A list of
  // places that cannot be operated from the keyboard is a picture of a list, and the
  // canvas is not reachable by Tab at all, so this is the only keyboard route to a place.
  const trs = Array.from(table.querySelectorAll("tbody tr"));
  rows.forEach((place, index) => {
    const tr = trs[index];
    if (!tr) return;
    const open = h(
      "button",
      {
        type: "button",
        class: "table__row-open",
        "data-testid": `offline-place-${place.id}`,
        "aria-label": `Show ${place.name} on the map`,
      },
      "Show",
    );
    open.addEventListener("click", () => onSelect(place.id));
    const cell = h("td", { class: "table__td table__td--actions" }, open);
    tr.appendChild(cell);
  });

  if (places.length > rows.length) {
    frag.appendChild(
      h(
        "p",
        { class: "caption" },
        `The ${rows.length.toLocaleString("en-US")} largest of ` +
          `${places.length.toLocaleString("en-US")} places are listed. Every one of them is on the map, and ` +
          "clicking a pin on the map shows it.",
      ),
    );
  }

  return h("div", {}, frag);
}

/** One place: what the survey says about it, and the sentence saying what is missing. */
function placeRecord(
  place: WorldSettlement,
  groundAt: (p: WorldSettlement) => number | null,
  facts: SurveyFacts,
): HTMLElement {
  const frag = document.createDocumentFragment();
  const { klass, fromRealData } = classifySettlement(place);
  const ground = groundAt(place);

  frag.appendChild(h("h3", { class: "section-header" }, place.name));

  const list = h("dl", { class: "start__facts" });
  list.appendChild(fact("Class", `${CLASS_WORD[klass]}${fromRealData ? "" : " — no population figure behind it"}`));
  list.appendChild(fact("Population", place.population === null ? UNSURVEYED : place.population.toLocaleString("en-US")));
  if (place.populationSource) list.appendChild(fact("Population source", place.populationSource));
  list.appendChild(fact("State", place.state ?? "Not tagged"));
  list.appendChild(fact("Position", `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`));
  if (ground !== null) list.appendChild(fact("Ground here", `${Math.round(ground).toLocaleString("en-US")} m`));
  frag.appendChild(list);

  frag.appendChild(
    h(
      "p",
      { class: "caption", "data-testid": "offline-world-place-absent" },
      "This place is real: its name, its position and " +
        (place.population === null ? "the fact that nobody has counted it" : "its population") +
        " come from the survey. " +
        "Everything about who holds it, what it costs and how it is doing comes from the simulation, which is " +
        `not running, so nothing is shown for it. The map is ${facts.regionName || "this region"}.`,
    ),
  );

  return h("div", {}, frag);
}

function fact(label: string, value: string): HTMLElement {
  return h(
    "div",
    { class: "start__fact" },
    h("dt", { class: "label" }, label),
    h("dd", { class: "start__fact-value" }, value),
  );
}
