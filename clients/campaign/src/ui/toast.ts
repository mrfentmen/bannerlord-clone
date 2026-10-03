/**
 * Transient toast notifications (mandate §19: quest completion feedback, reward
 * feedback).
 *
 * A small stack at the bottom centre of the screen: a title, a line of text, and an
 * auto-dismiss after a few seconds. One element pool, reused — toasts are frequent
 * and must not grow the DOM. `role="status"` so screen readers announce them.
 */

import { h } from "./dom.js";

const TOAST_MS = 4500;
const MAX_TOASTS = 3;

export class Toast {
  readonly #layer: HTMLElement;

  constructor(root: HTMLElement) {
    this.#layer = h("div", { class: "toasts", "aria-live": "polite" });
    root.appendChild(this.#layer);
  }

  show(title: string, text: string): void {
    // Oldest goes first when the stack is full: a new completion matters more than
    // an old one still on screen.
    while (this.#layer.children.length >= MAX_TOASTS) {
      this.#layer.firstElementChild?.remove();
    }
    const el = h("div", { class: "toast", role: "status" }, [
      h("div", { class: "toast__title", text: title }),
      h("div", { class: "toast__text", text }),
    ]);
    this.#layer.appendChild(el);
    // Animate in on the next frame: the class has to land after first paint.
    requestAnimationFrame(() => el.classList.add("toast--in"));
    window.setTimeout(() => {
      el.classList.remove("toast--in");
      el.classList.add("toast--out");
      window.setTimeout(() => el.remove(), 400);
    }, TOAST_MS);
  }
}
