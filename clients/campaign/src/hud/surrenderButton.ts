/**
 * Task 29: the surrender button.
 *
 * Surrendering is the one decision in a battle that ends it, so it is behind a
 * confirmation and the confirmation says what the simulation actually does.
 * `internal/battle/battle.go`'s `checkEnding` records a yielding side as
 * `ReasonEnemyBroke` and counts its standing soldiers as `Surrendered`, so the
 * dialog says exactly that rather than a vaguer threat about losing.
 *
 * The button itself only opens the dialog. What surrender means for the campaign
 * is the caller's to apply through `onSurrender`, because that consequence
 * belongs to the flow, not to the HUD.
 */

import "./surrenderButton.css";
import { h } from "../ui/dom.js";
import { createConfirmDialog, type ConfirmDialog } from "./confirmDialog.js";

export interface SurrenderButtonOptions {
  /** Fired once the player has confirmed. */
  onSurrender: () => void;
  /** Where the confirmation is mounted; defaults to `document.body`. */
  parent?: HTMLElement;
  /** Shown before the player agrees. Overridable, but the default is the rule. */
  body?: string;
}

export interface SurrenderButton {
  root: HTMLElement;
  /** The open dialog, or null while none is. */
  dialog(): ConfirmDialog | null;
  destroy(): void;
}

export const SURRENDER_TITLE = "Surrender the battle?";
export const SURRENDER_BODY =
  "The fight ends at once and is recorded against you. Every soldier still standing is counted as surrendered.";

export function createSurrenderButton(opts: SurrenderButtonOptions): SurrenderButton {
  const button = h(
    "button",
    { type: "button", class: "hud-surrender", "data-testid": "hud-surrender" },
    "Surrender",
  );
  const root = h("div", { class: "hud-surrender-wrap", role: "group", "aria-label": "Surrender" }, button);

  let open: ConfirmDialog | null = null;

  const onClick = (): void => {
    if (open) return; // one dialog at a time; a double press is not two surrenders
    open = createConfirmDialog({
      title: SURRENDER_TITLE,
      body: opts.body ?? SURRENDER_BODY,
      confirmLabel: "Surrender",
      // exactOptionalPropertyTypes: an absent mount point and an explicit
      // undefined are different, and only the first means "document.body".
      ...(opts.parent ? { parent: opts.parent } : {}),
      onConfirm: () => {
        open = null;
        opts.onSurrender();
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
      // A button that is destroyed with its dialog still open must not leave the
      // dialog on screen, or the next battle starts behind a sheet.
      open?.destroy();
      open = null;
      root.remove();
    },
  };
}