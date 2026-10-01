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

/**
 * How the roster is drawn when there are eight hundred of them.
 *
 * `RULERS.md` section 9 asks for a roster of every ruler on the record, and section 2
 * says the world holds three hundred to eight hundred names. A DOM node per name is not
 * a roster at that size: it is a scrollbar that stutters, because each scroll tick
 * relayouts every card that has ever been built. So the list is windowed. The spacer is
 * the full height of the filtered set, so the scrollbar is honest about how much there
 * is, and only the rows actually on screen — plus a few either side, so a fast flick
 * never shows bare paper — are ever in the document.
 *
 * **The assumption is a fixed row height.** A roster card is one line of name and
 * renown, one caption line, and a status chip beside a holding: 22 + 16 + 20 of type,
 * plus two 4px gaps and 8px of padding inside the card, which is 82px of card. On the
 * 4px grid `ROSTER_ROW_HEIGHT_PX` rounds that up to 88, so a card is never clipped even
 * if a face metric lands a pixel differently. `ROSTER_ROW_PITCH_PX` adds the `--space-2`
 * gap that `.rulers` puts between cards, and that pitch is what every piece of the
 * windowing arithmetic uses. A card that grew a fourth line would move these two
 * constants and nothing else — which is why they are named, exported and asserted on
 * rather than scattered through the maths.
 *
 * Paging is the fallback, not a second list. `ROSTER_PAGE_SIZE` rows at a time, driven
 * by real buttons, for a player who would rather jump than sweep, or who is on a
 * keyboard and cannot scroll the list at all. It drives the same window, so the two can
 * never disagree about what is on screen.
 */
export const ROSTER_ROW_HEIGHT_PX = 88;
const ROSTER_ROW_GAP_PX = 8;
export const ROSTER_ROW_PITCH_PX = ROSTER_ROW_HEIGHT_PX + ROSTER_ROW_GAP_PX;
export const ROSTER_PAGE_SIZE = 50;
/** Rows kept above and below the screen, so a fast flick does not show bare paper. */
const ROSTER_OVERSCAN_ROWS = 3;
/**
 * The height of the scroll window, and the height assumed when there is no layout to
 * measure — which is every DOM without a layout engine, jsdom included. Six rows of
 * pitch, so the fallback is a whole number of cards rather than a partial one.
 */
const ROSTER_VIEWPORT_PX = ROSTER_ROW_PITCH_PX * 6;

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

  // -- the windowed list ----------------------------------------------------
  //
  // Three pieces of state carry the whole thing: what the filters kept, which slice of
  // it is on screen, and where keyboard focus is. Everything else is derived from those,
  // so the pager and the scrollbar cannot end up telling different stories.

  /** Every ruler the current filters kept, in roster order. */
  let filtered: RulerState[] = [];
  /** Row pitch in px. The one place the fixed-height assumption is spent. */
  const rowPitch = ROSTER_ROW_PITCH_PX;
  /** The slice last painted, as a cheap "has anything changed" key. */
  let paintedKey = "";
  /** The row the keyboard is on, or null when the list itself holds focus. */
  let focusIndex: number | null = null;
  /** A scroll event that has not been turned into a repaint yet. */
  let pendingFrame = 0;

  /** The height of the scroll window, with the laid-out height preferred. */
  function viewHeight(): number {
    const measured = list.clientHeight;
    return measured > 0 ? measured : ROSTER_VIEWPORT_PX;
  }

  /**
   * The rows to paint, in roster indices.
   *
   * The screen rows come first, then `ROSTER_OVERSCAN_ROWS` either side, so a flick
   * lands on paper rather than on a gap. The visible span is measured rather than
   * counted, which is what lets the same code run in a browser and in a DOM with no
   * layout engine at all.
   */
  function windowRange(): { first: number; last: number } {
    const total = filtered.length;
    const view = viewHeight();
    const top = Math.max(0, list.scrollTop);
    const first = Math.max(0, Math.floor(top / rowPitch) - ROSTER_OVERSCAN_ROWS);
    const last = Math.min(total, Math.ceil((top + view) / rowPitch) + ROSTER_OVERSCAN_ROWS);
    return { first, last: Math.max(first, last) };
  }

  function pageCount(): number {
    return Math.max(1, Math.ceil(filtered.length / ROSTER_PAGE_SIZE));
  }

  /**
   * Which page the list is on.
   *
   * Derived from the scroll offset rather than stored, so scrolling by hand and paging
   * by button land in the same place. The bottom of the list is the last page even when
   * the offset maths says otherwise, which is the case where the final page is shorter
   * than the window and the browser refuses to scroll any further.
   */
  function currentPage(): number {
    const pages = pageCount();
    if (pages <= 1) return 1;
    const floorTop = Math.max(0, filtered.length * rowPitch - viewHeight());
    if (list.scrollTop >= floorTop - 1) return pages;
    return Math.min(pages, Math.floor(Math.max(0, list.scrollTop) / (ROSTER_PAGE_SIZE * rowPitch)) + 1);
  }

  function syncPager(): void {
    const pages = pageCount();
    const page = currentPage();
    pageLabel.textContent = `${page} of ${pages}`;
    prevPage.disabled = page <= 1;
    nextPage.disabled = page >= pages;
  }

  /**
   * Move the window, then repaint.
   *
   * The repaint is forced rather than left to the scroll event, because a page turn is
   * a deliberate act and must not wait for the browser to get round to telling us we
   * scrolled.
   */
  function goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), pageCount());
    list.scrollTop = (clamped - 1) * ROSTER_PAGE_SIZE * rowPitch;
    paintWindow(true);
    syncPager();
  }

  /**
   * Paint the rows on screen.
   *
   * Skipped entirely when the window has not moved, which is most scroll events: the
   * cost of a flick through eight hundred rulers is one repaint per row of travel, not
   * one per event. When it does run it rebuilds a dozen nodes, never the whole roster.
   */
  function paintWindow(force = false): void {
    const total = filtered.length;
    const { first, last } = windowRange();
    const key = `${first}:${last}:${total}:${options.selectedId}`;
    if (!force && key === paintedKey) return;
    paintedKey = key;

    sizer.style.height = `${total * rowPitch}px`;

    // Focus is restored rather than left to the browser, because the node that had it
    // is about to be replaced. `list.contains` has to be asked before the clear.
    const hadFocus = list.contains(document.activeElement);
    clear(sizer);
    for (let index = first; index < last; index += 1) {
      const ruler = filtered[index];
      if (ruler) sizer.appendChild(rosterRow(ruler, index, total));
    }
    if (hadFocus) {
      const row =
        focusIndex === null ? null : sizer.querySelector<HTMLElement>(`[data-roster-index='${focusIndex}'] .ruler`);
      (row ?? list).focus({ preventScroll: true });
    }
  }

  function onScroll(): void {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      paintWindow();
      syncPager();
    });
  }

  /** The roster index the keyboard is on, or -1 when focus has not entered a row. */
  function activeIndex(): number {
    const active = document.activeElement;
    if (active instanceof Element) {
      const row = active.closest("[data-roster-index]");
      const raw = row?.getAttribute("data-roster-index");
      if (raw !== null && raw !== undefined) {
        const parsed = Number(raw);
        if (Number.isInteger(parsed)) return parsed;
      }
    }
    return -1;
  }

  /** Scroll a row into the window, and put the keyboard on it. */
  function focusRow(index: number, align: "nearest" | "top" = "nearest"): void {
    const total = filtered.length;
    if (total === 0) return;
    const clamped = Math.min(Math.max(0, index), total - 1);
    const view = viewHeight();
    const top = clamped * rowPitch;
    if (align === "top") list.scrollTop = top;
    else if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROSTER_ROW_HEIGHT_PX > list.scrollTop + view) {
      list.scrollTop = top + ROSTER_ROW_HEIGHT_PX - view;
    }
    focusIndex = clamped;
    // Repaint only when the row is not already in the document. Rebuilding on every
    // arrow press would throw away and remake a dozen cards per keystroke, and with them
    // the very node the keyboard is sitting on. Asking the document rather than the
    // window maths is what makes this correct: the maths describes where the window
    // *would* be after the scroll above, and the document describes where the cards
    // *are*.
    const row = () => sizer.querySelector<HTMLElement>(`[data-roster-index='${clamped}'] .ruler`);
    if (!row()) paintWindow(true);
    row()?.focus({ preventScroll: true });
    syncPager();
  }

  /**
   * The keyboard, for a list the Tab key cannot walk.
   *
   * Only the rows on screen are focusable, because only the rows on screen exist. So
   * the arrows, Home, End and Page Up/Down are what actually move through eight hundred
   * rulers. Page Up/Down and Home/End put the row they land on at the top of the window
   * rather than nudging it into view, because that is what makes the pager's page number
   * agree with where the keyboard is: a row that lands at the bottom edge is on the page
   * above it, and saying so would be a small lie.
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const total = filtered.length;
    if (total === 0) return;
    const from = activeIndex();
    let target: number;
    let align: "nearest" | "top" = "nearest";
    switch (event.key) {
      case "ArrowDown":
        target = from + 1;
        break;
      case "ArrowUp":
        target = from - 1;
        break;
      case "Home":
        target = 0;
        align = "top";
        break;
      case "End":
        target = total - 1;
        align = "top";
        break;
      case "PageDown":
        target = from + ROSTER_PAGE_SIZE;
        align = "top";
        break;
      case "PageUp":
        target = from - ROSTER_PAGE_SIZE;
        align = "top";
        break;
      default:
        return;
    }
    event.preventDefault();
    focusRow(target, align);
  }

  function clearFilters(): void {
    sideFilter = "all";
    rankFilter = "all";
    standingFilter = "all";
    search = "";
    sideSelect.value = "all";
    rankSelect.value = "all";
    relSelect.value = "all";
    searchField.value = "";
    render();
  }

  function showEmpty(headline: string, detail: string, action?: HTMLElement): void {
    clear(empty);
    empty.appendChild(emptyState(headline, detail, action));
    setShown(empty, true, "block");
    setShown(list, false, "block");
    setShown(pager, false, "flex");
  }

  function render(): void {
    const total = options.rulers.length;
    filtered = options.rulers.filter(matches);

    // The chrome is built once and never torn down. Rebuilding it would mean detaching
    // the search field the player is typing into on every keystroke, which throws the
    // caret away — the one bug a filter box cannot have.
    if (total === 0) {
      countLine.textContent = "";
      showEmpty(
        "No rulers on the record.",
        "The simulation has not written anyone yet. Start the clock, or take the snapshot again.",
      );
      return;
    }

    // The count is stated whether or not anything was filtered out, so a filter that
    // silently hides the whole world is visible as such. The figures lead, because the
    // count is the number being read and the noun is the noise around it.
    countLine.textContent =
      filtered.length === total
        ? `${total} on the record.`
        : `${filtered.length} of ${total} on the record match these filters.`;

    if (filtered.length === 0) {
      showEmpty(
        "No rulers match those filters.",
        "Widen the side, the rank or the standing filter to see more of the world.",
        h("button", { type: "button", class: "btn", "data-testid": "roster-clear" }, "Clear the filters"),
      );
      empty.querySelector<HTMLButtonElement>("[data-testid='roster-clear']")?.addEventListener("click", clearFilters);
      return;
    }

    clear(empty);
    setShown(empty, false, "block");
    setShown(list, true, "block");
    setShown(pager, true, "flex");
    list.scrollTop = 0;
    focusIndex = null;
    paintedKey = "";
    paintWindow(true);
    syncPager();
  }

  // -- the chrome ------------------------------------------------------------
  //
  // Built once, before the first render, because `render` only ever changes what is in
  // them.

  /**
   * Show or hide a region, saying so in the accessibility tree as well as on screen.
   *
   * `hidden` alone is not enough, because a class that sets `display` beats the user
   * agent's rule for `[hidden]` and the region would stay on screen while announcing
   * itself as gone. So the attribute carries the semantics and the inline `display`
   * carries the layout, and both are written here rather than left to cascade order.
   */
  function setShown(node: HTMLElement, shown: boolean, display: string): void {
    node.hidden = !shown;
    node.style.display = shown ? display : "none";
  }

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

  const countLine = h("p", { class: "caption roster__count", "data-testid": "roster-count", role: "status" });

  const pageLabel = h("span", { class: "data roster__page", "data-testid": "roster-page" }, "1 of 1");
  const prevPage = h(
    "button",
    {
      type: "button",
      class: "btn",
      "data-testid": "roster-page-prev",
      "aria-label": "Previous page of rulers",
    },
    "Previous page",
  );
  const nextPage = h(
    "button",
    {
      type: "button",
      class: "btn",
      "data-testid": "roster-page-next",
      "aria-label": "Next page of rulers",
    },
    "Next page",
  );
  prevPage.addEventListener("click", () => goToPage(currentPage() - 1));
  nextPage.addEventListener("click", () => goToPage(currentPage() + 1));

  // The pager sits under the window rather than over it, on a hairline rule like every
  // other section break in the client. The figures are `data`, so they are mono with
  // tabular figures and the readout does not change width as the count changes — which
  // is the whole reason ART_DIRECTION.md section 3.1 has a numeral face at all. The
  // spacing is `space-2`/`space-3` and nothing else; no value here is invented.
  const pager = h(
    "nav",
    {
      class: "roster__pager",
      "data-testid": "roster-pager",
      "aria-label": "Roster pages",
      style: [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:var(--space-2)",
        `margin-top:var(--space-2)`,
        `padding-top:var(--space-2)`,
        "border-top:1px solid var(--paper-300)",
      ].join(";"),
    },
    prevPage,
    h("p", { class: "caption roster__page-line", style: "margin:0" }, "Page ", pageLabel),
    nextPage,
  );

  // The scroll window. `max-height` is the one number here, and it is the same one the
  // windowing maths falls back to when there is no layout to measure, so the two can
  // never disagree about how many rows are on screen.
  const sizer = h("div", {
    class: "ruler-roster__sizer",
    role: "presentation",
    style: "position:relative;width:100%",
  });
  const list = h(
    "div",
    {
      class: "rulers ruler-roster__window",
      "data-testid": "ruler-list",
      role: "list",
      "aria-label": "Rulers on the record",
      tabindex: "0",
      style: [
        "display:block",
        "position:relative",
        "overflow-y:auto",
        "overscroll-behavior:contain",
        `max-height:${ROSTER_VIEWPORT_PX}px`,
      ].join(";"),
    },
    sizer,
  );
  list.addEventListener("scroll", onScroll, { passive: true });
  list.addEventListener("keydown", onKeyDown);
  list.addEventListener("focusin", (event) => {
    const target = event.target;
    const row = target instanceof Element ? target.closest("[data-roster-index]") : null;
    const raw = row?.getAttribute("data-roster-index");
    focusIndex = raw === null || raw === undefined ? null : Number(raw);
  });

  const empty = h("div", { class: "roster__empty", hidden: true, style: "display:none" });

  body.append(filters, countLine, list, pager, empty);

  function rosterRow(ruler: RulerState, index: number, total: number): HTMLElement {
    const row = h("div", {
      class: "ruler-roster__row",
      role: "listitem",
      // A windowed list is still a list of everything, and these are what say so to a
      // screen reader: eight hundred rows exist even though a dozen are in the document.
      "aria-setsize": String(total),
      "aria-posinset": String(index + 1),
      "data-roster-index": String(index),
      style: `position:absolute;top:${index * rowPitch}px;left:0;right:0;height:${ROSTER_ROW_HEIGHT_PX}px`,
    });
    row.appendChild(rosterCard(ruler));
    return row;
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
        style: `height:${ROSTER_ROW_HEIGHT_PX}px`,
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
