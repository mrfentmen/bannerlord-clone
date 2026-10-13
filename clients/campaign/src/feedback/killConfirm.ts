/**
 * Task 47: kill confirm. A skull pops the moment a killing blow lands for the
 * player's side — the same hero-kill event the kill feed renders, filtered to
 * `killerSide === "ally"`. One element, re-triggered per kill rather than
 * stacked, removed {@link KILL_CONFIRM_MS} after the last one. The kill feed
 * remains the record, so this layer is `aria-hidden` and the feed carries the
 * accessible name.
 *
 * Reduced motion (`html[data-reduce-motion]` or the OS setting): the skull
 * still appears, but the pop animation is skipped.
 */

import "./killConfirm.css";
import { h } from "../ui/dom.js";
import { prefersReducedMotion } from "./motion.js";
import type { FeedbackSource, Unsubscribe } from "./types.js";

/** How long the skull stays on screen after a kill. */
export const KILL_CONFIRM_MS = 700;

export interface KillConfirm {
  root: HTMLElement;
  destroy(): void;
}

export function createKillConfirm(source: FeedbackSource): KillConfirm {
  const root = h("div", {
    class: "fb-killconfirm-layer",
    "data-testid": "fb-killconfirm-layer",
    "aria-hidden": "true",
  });
  let node: HTMLElement | null = null;
  let timer = 0;

  const unsub: Unsubscribe = source.onHeroKill((k) => {
    if (k.killerSide !== "ally") return; // the kill feed already covers the other side
    node?.remove();
    node = h("div", { class: "fb-killconfirm" }, "☠");
    root.appendChild(node);
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => node?.classList.add("is-pop"));
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      node?.remove();
      node = null;
    }, KILL_CONFIRM_MS);
  });

  return {
    root,
    destroy() {
      unsub();
      window.clearTimeout(timer);
      node = null;
      root.remove();
    },
  };
}
