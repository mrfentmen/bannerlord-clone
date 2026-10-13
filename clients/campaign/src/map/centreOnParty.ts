/**
 * The map's "centre on party" control (Buffy task 200).
 *
 * CampaignScene already frames the party pin; this is the DOM affordance that asks
 * for it, so the player can get back to their own convoy after panning off to
 * look at something else. It owns no camera: it calls the caller, which frames
 * whatever the caller considers the party.
 *
 * The button is hidden when there is nothing to centre on. A "centre on party"
 * button over a map with no party on it promises a view of nothing, so the
 * control reports `available: false` from the caller and the widget does not draw.
 *
 * **Binding note.** Task 200 names the Space key, and Space is already
 * `ui.confirm` in the app's input catalog (`src/input/actions.ts`), which belongs
 * to another lane. This widget therefore does not listen for keys at all: rebinding
 * it is a decision about the shared catalog, and a raw `keydown` listener here
 * would fight the registry that already owns that chord. Pass an `inputAction` to
 * route it through the registry once the catalog has an id for it.
 */

import { h } from "../ui/dom.js";
import { input, type InputRegistry } from "../input/index.js";
import "./mapOverlay.css";

export interface CentreOnPartyOptions {
  /** Frame the player's party. The caller decides what that means for its camera. */
  onCentre: () => void;
  /**
   * False when there is no party on the map to frame; the control then draws
   * nothing rather than a button that centres on nothing.
   */
  available?: boolean;
  /**
   * An input-catalog action id to bind the control to. Omit for a button only.
   * The registry is injectable so a test does not have to touch the singleton.
   */
  inputAction?: string;
  registry?: InputRegistry;
  testId?: string;
}

export interface CentreOnPartyHandle {
  root: HTMLElement;
  destroy(): void;
}

export function createCentreOnParty(options: CentreOnPartyOptions): CentreOnPartyHandle {
  // Nothing to frame, so nothing is drawn. There is no root to unhook either, but
  // `destroy` is still part of the shape every map overlay exposes.
  if (options.available === false) {
    const empty = h("div", { "data-testid": "map-centre-on-party-absent" });
    return { root: empty, destroy: () => undefined };
  }

  const btn = h(
    "button",
    {
      type: "button",
      class: "btn map-overlay__btn map-overlay--centre",
      "data-testid": options.testId ?? "map-centre-on-party",
      "aria-label": "Centre on party",
      title: "Centre the map on your party",
    },
    h("span", { class: "btn__label" }, "Centre on party"),
  );

  const onClick = (): void => options.onCentre();
  btn.addEventListener("click", onClick);

  let stop: (() => void) | null = null;
  if (options.inputAction) {
    const registry = options.registry ?? input;
    try {
      stop = registry.on(options.inputAction, onClick);
    } catch {
      // An id the catalog does not declare yet must not take the button down with
      // it: the control is still useful, and the caller can add the binding later.
      stop = null;
    }
  }

  return {
    root: btn,
    destroy(): void {
      btn.removeEventListener("click", onClick);
      stop?.();
    },
  };
}