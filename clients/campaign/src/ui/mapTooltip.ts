/**
 * Settlement hover cards for the campaign map (mandate §17: hover cards, contextual
 * map information).
 *
 * The card is built from the real `TownState` the snapshot publishes — name, class,
 * holder, population, prosperity, loyalty, garrison, unrest, and the treaty/town-entry
 * access the simulation already computes. Nothing here is invented: a field the
 * snapshot does not publish does not appear on the card.
 *
 * `buildSettlementHoverCard` is pure so the content can be unit-tested without a GPU.
 * `MapTooltip` is the thin DOM layer that shows the card next to the cursor; the scene
 * owns picking and reports which settlement (if any) is under the pointer.
 */

import { h } from "./dom.js";
import type { TownState } from "../data/types.js";

export type HoverTone = "ok" | "warn" | "bad" | "muted";

export interface HoverRow {
  label: string;
  value: string;
  tone?: HoverTone;
}

export interface HoverCard {
  title: string;
  subtitle: string;
  rows: HoverRow[];
  /** Small footer line, e.g. "Click to open". Omitted when there is no action. */
  hint?: string;
}

const KLASS_LABEL: Record<TownState["klass"], string> = {
  city: "City",
  town: "Town",
  village: "Village",
};

function pct01(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function hoverRow(label: string, value: string, tone?: HoverTone): HoverRow {
  // exactOptionalPropertyTypes is on: a present-but-undefined tone is a type error, so
  // the property is omitted entirely when there is no tone.
  return tone === undefined ? { label, value } : { label, value, tone };
}

/**
 * Build the hover card for a settlement from its live town state.
 *
 * Tones follow the same thresholds the town panel uses: unrest above 0.8 is bad, above
 * 0.6 is a warning; closed gates are a warning because the player cannot enter. The
 * card never decides anything — it reads the simulation's numbers and labels them.
 */
export function buildSettlementHoverCard(town: TownState): HoverCard {
  const rows: HoverRow[] = [];

  rows.push(
    hoverRow(
      "Population",
      town.population == null ? "unknown" : town.population.toLocaleString("en-US"),
      town.population == null ? "muted" : undefined,
    ),
  );
  rows.push(hoverRow("Prosperity", pct01(town.prosperity)));
  rows.push(
    hoverRow("Loyalty", pct01(town.loyalty), town.loyalty < 0.3 ? "warn" : undefined),
  );
  rows.push(
    hoverRow(
      "Unrest",
      pct01(town.unrest),
      town.unrest > 0.8 ? "bad" : town.unrest > 0.6 ? "warn" : undefined,
    ),
  );
  rows.push(hoverRow("Garrison", town.garrison.toLocaleString("en-US")));
  if (!town.access.allowed) {
    rows.push(hoverRow("Gates", `closed — ${town.access.reason}`, "warn"));
  }

  return {
    title: town.name,
    subtitle: `${KLASS_LABEL[town.klass]} · held by ${town.holderName}`,
    rows,
    hint: "Click to open",
  };
}

const TONE_CLASS: Record<HoverTone, string> = {
  ok: "tone-ok",
  warn: "tone-warn",
  bad: "tone-bad",
  muted: "tone-muted",
};

/**
 * A single absolutely-positioned tooltip that follows the pointer.
 *
 * One element reused for every hover, so hovering across fifty towns does not grow the
 * DOM. `show` clamps to the viewport so a town at the screen edge never pushes the
 * card off-screen.
 */
export class MapTooltip {
  readonly #el: HTMLElement;

  constructor(root: HTMLElement) {
    this.#el = h("div", {
      class: "map-tooltip",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    });
    root.appendChild(this.#el);
  }

  show(clientX: number, clientY: number, card: HoverCard): void {
    const hint = card.hint ? [h("div", { class: "map-tooltip-hint", text: card.hint })] : [];
    this.#el.replaceChildren(
      h("div", { class: "map-tooltip-title", text: card.title }),
      h("div", { class: "map-tooltip-sub", text: card.subtitle }),
      h(
        "dl",
        { class: "map-tooltip-rows" },
        card.rows.map((row) =>
          h("div", { class: "map-tooltip-row" }, [
            h("dt", { text: row.label }),
            h("dd", { class: row.tone ? TONE_CLASS[row.tone] : "", text: row.value }),
          ]),
        ),
      ),
      ...hint,
    );
    this.#el.hidden = false;
    // Position after content so offsetWidth/Height are the card's, not the old one's.
    const pad = 14;
    const w = this.#el.offsetWidth;
    const hgt = this.#el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = clientX + 18;
    let y = clientY + 16;
    if (x + w + pad > vw) x = clientX - w - 18;
    if (y + hgt + pad > vh) y = clientY - hgt - 16;
    this.#el.style.left = `${Math.max(pad, x)}px`;
    this.#el.style.top = `${Math.max(pad, y)}px`;
  }

  hide(): void {
    this.#el.hidden = true;
  }
}
