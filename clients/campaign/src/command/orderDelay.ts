/**
 * Task 46: order-delay visualization. When the commander issues an order, a
 * courier dot runs from the bottom edge of the screen to the order's
 * destination (or the centroid of the ordered units) over the estimated
 * delay, with a live countdown. The duration is the scene's estimate
 * (`order.delayMs`); without one we show 1.5 s and the badge says
 * "courier's best guess", so an unknown is never dressed up as a fact.
 *
 * requestAnimationFrame drives the motion; everything is cleaned up when the
 * courier arrives or `destroy()` runs.
 */

import { h } from "../ui/dom.js";
import { ORDER_LABEL, type Order } from "./types.js";

export interface OrderDelayHandle {
  destroy(): void;
}

/**
 * @param atScreen  screen position the courier runs toward (target or unit centroid)
 * @param delayMs   estimated travel time; null/undefined = unknown, shown honestly
 */
export function showOrderDelay(
  overlay: HTMLElement,
  order: Order,
  atScreen: { x: number; y: number },
  delayMs?: number | null,
): OrderDelayHandle {
  const estimated = delayMs ?? order.delayMs ?? null;
  const duration = estimated ?? 1500;
  const from = { x: window.innerWidth / 2, y: window.innerHeight - 8 };

  const badge = h("div", {
    class: "cmd-courier",
    role: "status",
    "data-testid": "cmd-courier",
    "aria-label": `${ORDER_LABEL[order.kind]} order on its way`,
  });
  const dot = h("div", { class: "cmd-courier-dot", "aria-hidden": "true" });
  const label = h("div", { class: "cmd-courier-label" });
  badge.append(dot, label);
  overlay.appendChild(badge);
  // The label is meaningful before the first frame runs (and in tests).
  label.textContent =
    estimated != null
      ? `${ORDER_LABEL[order.kind]} · ${(duration / 1000).toFixed(1)}s`
      : `${ORDER_LABEL[order.kind]} · courier's best guess`;

  let raf = 0;
  let dead = false;
  const start = performance.now();

  function frame(now: number): void {
    if (dead) return;
    const t = Math.min(1, (now - start) / duration);
    const x = from.x + (atScreen.x - from.x) * t;
    const y = from.y + (atScreen.y - from.y) * t;
    badge.style.left = `${x}px`;
    badge.style.top = `${y}px`;
    const remain = Math.max(0, duration - (now - start));
    label.textContent =
      estimated != null
        ? `${ORDER_LABEL[order.kind]} · ${(remain / 1000).toFixed(1)}s`
        : `${ORDER_LABEL[order.kind]} · courier's best guess`;
    if (t >= 1) {
      badge.classList.add("is-arrived");
      window.setTimeout(() => badge.remove(), 600);
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      badge.remove();
    },
  };
}
