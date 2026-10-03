/**
 * The tutorial hint banner (mandate §13).
 *
 * A small dismissible card under the top bar: the hint's title, its text, a "Got it"
 * button that dismisses this hint, and a "Disable tips" button that turns hints off
 * entirely. One element reused for every hint, like the map tooltip.
 */

import { h } from "./dom.js";
import type { TutorialHint } from "../data/tutorial.js";

export interface TutorialBannerCallbacks {
  onDismiss: (hintId: string) => void;
  onDisable: () => void;
}

export class TutorialBanner {
  readonly #el: HTMLElement;
  readonly #callbacks: TutorialBannerCallbacks;
  #hintId: string | null = null;

  constructor(root: HTMLElement, callbacks: TutorialBannerCallbacks) {
    this.#callbacks = callbacks;
    this.#el = h("div", {
      class: "tutorial-banner",
      role: "status",
      "aria-live": "polite",
      hidden: true,
    });
    root.appendChild(this.#el);
  }

  /** Show the hint, or hide when `null`. Rebuilds only when the hint changes. */
  show(hint: TutorialHint | null): void {
    if (!hint) {
      this.#hintId = null;
      this.#el.hidden = true;
      return;
    }
    if (hint.id === this.#hintId && !this.#el.hidden) return;
    this.#hintId = hint.id;
    const dismiss = h("button", { type: "button", class: "btn btn--quiet" }, "Got it");
    dismiss.addEventListener("click", () => this.#callbacks.onDismiss(hint.id));
    const disable = h("button", { type: "button", class: "btn btn--quiet" }, "Disable tips");
    disable.addEventListener("click", () => this.#callbacks.onDisable());
    this.#el.replaceChildren(
      h("div", { class: "tutorial-banner__title", text: hint.title }),
      h("p", { class: "tutorial-banner__text", text: hint.text }),
      h("div", { class: "tutorial-banner__actions" }, [dismiss, disable]),
    );
    this.#el.hidden = false;
  }
}
