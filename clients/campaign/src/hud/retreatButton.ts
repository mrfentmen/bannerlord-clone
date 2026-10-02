/**
 * Task 30: the retreat button.
 *
 * Retreating costs the battle rather than the campaign, but it still ends the
 * fight, so it is behind the same confirmation the surrender button uses — one
 * dialog, two questions, so the two controls cannot drift apart in behaviour.
 *
 * The wording comes from the order itself. `battleflow/types.ts` documents
 * `BattleOrders.retreat` as "Withdraw. Ends the battle if both sides retreat or
 * morale breaks", and `BattleEndReason` carries `retreat`, so the dialog says
 * the fight is recorded as a retreat and stops there.
 *
 * The button only opens the dialog and reports the decision. Issuing the order
 * is the caller's: `battle.retreatHorn` in the input catalog is the action that
 * sounds it for the whole force.
 */

import "./retreatButton.css";
import { h } from "../ui/dom.js";
import { createConfirmDialog, type ConfirmDialog } from "./confirmDialog.js";

export interface RetreatButtonOptions {
  /** Fired once the player has confirmed. */
  onRetreat: () => void;
  /** Where the confirmation is mounted; defaults to `document.body`. */
  parent?: HTMLElement;
  /** Shown before the player agrees. */
  body?: string;
}

export interface RetreatButton {
  root: HTMLElement;
  /** The open dialog, or null while none is. */
  dialog(): ConfirmDialog | null;
  destroy(): void;
}

export const RETREAT_TITLE = "Break off the battle?";
export const RETREAT_BODY =
  "Your soldiers give up the field and march off it. The battle is recorded as a retreat, and you keep the men who walk away.";

export function createRetreatButton(opts: RetreatButtonOptions): RetreatButton {
  const button = h(
    "button",
    { type: "button", class: "hud-retreat", "data-testid": "hud-retreat" },
    "Retreat",
  );
  const root = h("div", { class: "hud-retreat-wrap", role: "group", "aria-label": "Retreat" }, button);

  let open: ConfirmDialog | null = null;

  const onClick = (): void => {
    if (open) return; // one dialog at a time
    open = createConfirmDialog({
      title: RETREAT_TITLE,
      body: opts.body ?? RETREAT_BODY,
      confirmLabel: "Retreat",
      ...(opts.parent ? { parent: opts.parent } : {}),
      onConfirm: () => {
        open = null;
        opts.onRetreat();
      },
      onCancel: () => {
        open = null;
      },
    });
  };
  button.addEventListener("click", onClick);

  return {
    root,
    dialog: () => open,
    destroy() {
      button.removeEventListener("click", onClick);
      open?.destroy();
      open = null;
      root.remove();
    },
  };
}