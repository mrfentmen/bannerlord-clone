/**
 * Task 89: "Fight again" — the rematch control on the after-action report.
 *
 * A rematch is a decision about the next battle, not a report line, so it lives
 * here rather than in the end-screen data. Two rules earn their keep:
 *
 * - The button exists only when the caller can honour it. `onRematch` is
 *   required, so a report mounted where no second fight is possible shows no
 *   button at all rather than one that does nothing.
 * - It fires once. A double click, or a click that lands while the flow is
 *   already tearing the overlay down, must not open two battles; the button
 *   disables itself before the callback runs.
 */

import { h } from "../ui/dom.js";

export interface RematchOptions {
  /** Start the same battle again. Required: without it there is no button. */
  onRematch(): void;
  /** Who is waiting on the field, named for the button's description. */
  opponent?: string | undefined;
}

export interface RematchHandle {
  root: HTMLElement;
  button: HTMLButtonElement;
  destroy(): void;
}

/** The hint id the button points at when it knows who the opponent is. */
export const REMATCH_HINT_ID = "afteraction-rematch-hint";

export function createRematchButton(opts: RematchOptions): RematchHandle {
  const button = h("button", {
    type: "button",
    class: "btn btn--primary aa-rematch",
    "data-testid": "afteraction-rematch",
  }) as HTMLButtonElement;
  button.appendChild(h("span", { class: "btn__label" }, "Fight again"));
  if (opts.opponent) {
    // The button's name stays "Fight again"; the description carries who, so a
    // screen reader hears "Fight again, button, against the Vaylen company"
    // instead of a name that repeats itself.
    button.setAttribute("aria-describedby", REMATCH_HINT_ID);
  }

  const root = h("div", { class: "aa-rematch-row" }, button);
  if (opts.opponent) {
    root.appendChild(
      h("span", { class: "aa-rematch-hint caption", id: REMATCH_HINT_ID }, `Same field, same enemy: ${opts.opponent}.`),
    );
  }

  let taken = false;
  button.addEventListener("click", () => {
    if (taken) return;
    taken = true;
    button.disabled = true;
    opts.onRematch();
  });

  return {
    root,
    button,
    destroy() {
      root.remove();
    },
  };
}