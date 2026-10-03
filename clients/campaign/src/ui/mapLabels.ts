/**
 * Zoom-dependent settlement labels (mandate §17: zoom-dependent information).
 *
 * HTML labels over the 3D settlements, shown only when the camera is close enough
 * for names to be useful. A fixed pool of divs is reused — no DOM churn per update —
 * and labels are prioritised by settlement class and screen centrality, so a crowded
 * region shows its cities first rather than its villages.
 *
 * The scene owns projection (`toScreen`); this owns the DOM. Unseen-fog settlements
 * are never labelled: a label is a claim about where something is.
 */

import { h } from "./dom.js";
import type { Vector3 } from "@babylonjs/core";
import type { TownClassName } from "../design/tokens.js";
import type { TownVisibility } from "../data/types.js";

export interface LabelCandidate {
  settlementId: string;
  name: string;
  klass: TownClassName;
  /** World position to anchor the label to (the marker). */
  anchor: Vector3;
}

/** Labels appear at this camera distance and closer. */
export const LABEL_RADIUS_M = 30_000;
/** The pool cap: a map with more labels than this is a map nobody can read. */
export const LABEL_POOL_SIZE = 40;

const KLASS_RANK: Record<TownClassName, number> = { city: 0, town: 1, village: 2 };

export class MapLabels {
  readonly #pool: HTMLElement[] = [];
  readonly #layer: HTMLElement;

  constructor(root: HTMLElement) {
    this.#layer = h("div", { class: "map-labels", "aria-hidden": "true" });
    root.appendChild(this.#layer);
    for (let i = 0; i < LABEL_POOL_SIZE; i += 1) {
      const el = h("div", { class: "map-label", hidden: true });
      this.#layer.appendChild(el);
      this.#pool.push(el);
    }
  }

  /**
   * Reposition labels for the current camera. Cheap enough to run on an interval:
   * candidates that fail the cheap tests (zoom, fog) never reach projection.
   */
  update(
    candidates: readonly LabelCandidate[],
    toScreen: (world: Vector3) => { x: number; y: number } | null,
    radius: number,
    visibilityOf: (settlementId: string) => TownVisibility | undefined,
  ): void {
    if (radius >= LABEL_RADIUS_M) {
      this.hideAll();
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const cy = vh / 2;
    const scored: { candidate: LabelCandidate; x: number; y: number; score: number }[] = [];
    for (const candidate of candidates) {
      if (visibilityOf(candidate.settlementId) === "unseen") continue;
      const p = toScreen(candidate.anchor);
      if (!p) continue;
      // Off-screen with a margin: labels near the edge are still useful.
      if (p.x < -80 || p.x > vw + 80 || p.y < -40 || p.y > vh + 40) continue;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      scored.push({ candidate, x: p.x, y: p.y, score: KLASS_RANK[candidate.klass] * 10_000 + dist });
    }
    scored.sort((a, b) => a.score - b.score);
    const shown = scored.slice(0, LABEL_POOL_SIZE);
    for (let i = 0; i < this.#pool.length; i += 1) {
      const el = this.#pool[i]!;
      const item = shown[i];
      if (!item) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      if (el.textContent !== item.candidate.name) el.textContent = item.candidate.name;
      el.style.transform = `translate(${Math.round(item.x)}px, ${Math.round(item.y)}px) translate(-50%, -130%)`;
      el.dataset.klass = item.candidate.klass;
    }
  }

  hideAll(): void {
    for (const el of this.#pool) el.hidden = true;
  }
}
