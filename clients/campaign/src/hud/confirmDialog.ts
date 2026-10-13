/**
 * A confirmation dialog for an action that cannot be taken back.
 *
 * Both of the HUD's end-of-battle controls need one, and they need it to behave
 * identically: Escape backs out, focus lands somewhere safe, focus cannot walk
 * out of the dialog while it is open, and confirming fires exactly once.
 *
 * Escape handling and the focus trap come from `ui/focusTrap.ts`'s `modalize`,
 * which is the one modal stack in the client — a second Escape handler here
 * would close two things at once.
 *
 * Focus starts on the *cancel* button. Both dialogs this serves cost the player
 * something they cannot undo, so the default a stray Enter falls on is the one
 * that changes nothing.
 */

import "./confirmDialog.css";
import { h } from "../ui/dom.js";
import { modalize } from "../ui/focusTrap.js";

export interface ConfirmDialogOptions {
  /** The heading. */
  title: string;
  /** What agreeing means, in the words of whoever is asking. */
  body: string;
  /** The button that goes ahead. */
  confirmLabel: string;
  /** The button that backs out; defaults to "Cancel". */
  cancelLabel?: string;
  /** Fired when the player agrees. */
  onConfirm: () => void;
  /** Fired when the player backs out, including by Escape. */
  onCancel?: () => void;
  /** Where the dialog is mounted; defaults to `document.body`. */
  parent?: HTMLElement;
  /** Id given to the heading, for the dialog's own labelling. */
  id?: string;
}

export interface ConfirmDialog {
  root: HTMLElement;
  /** Backs out, exactly as pressing Cancel does. */
  cancel(): void;
  destroy(): void;
}

let nextDialogId = 0;

export function createConfirmDialog(opts: ConfirmDialogOptions): ConfirmDialog {
  const id = opts.id ?? `hud-confirm-${nextDialogId++}`;
  const bodyId = `${id}-body`;

  const cancelBtn = h(
    "button",
    { type: "button", class: "hud-confirm__btn hud-confirm__btn--cancel", "data-testid": "hud-confirm-cancel" },
    opts.cancelLabel ?? "Cancel",
  );
  const confirmBtn = h(
    "button",
    {
      type: "button",
      class: "hud-confirm__btn hud-confirm__btn--confirm",
      "data-testid": "hud-confirm-confirm",
    },
    opts.confirmLabel,
  );
  const root = h(
    "div",
    {
      class: "hud-confirm",
      "data-testid": "hud-confirm",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": `${id}-title`,
      "aria-describedby": bodyId,
    },
    h("div", { class: "hud-confirm__panel" },
      h("h2", { class: "hud-confirm__title", id: `${id}-title` }, opts.title),
      h("p", { class: "hud-confirm__body", id: bodyId }, opts.body),
      h("div", { class: "hud-confirm__actions" }, cancelBtn, confirmBtn),
    ),
  );

  let closed = false;
  let release = () => {};

  /** The one way the dialog leaves the screen: unwired, removed, then reported. */
  function close(reported: () => void): void {
    // Confirm and Escape can both land on a click away; whichever gets here
    // first ends it, and the other becomes a no-op rather than a second
    // surrender.
    if (closed) return;
    closed = true;
    release();
    root.remove();
    reported();
  }

  const onCancelClick = (): void => close(() => opts.onCancel?.());
  const onConfirmClick = (): void => close(() => opts.onConfirm());
  cancelBtn.addEventListener("click", onCancelClick);
  confirmBtn.addEventListener("click", onConfirmClick);

  (opts.parent ?? document.body).appendChild(root);
  release = modalize(root, onCancelClick);
  // The safe default, as documented: a stray Enter backs out rather than
  // surrendering.
  cancelBtn.focus();

  return {
    root,
    cancel: onCancelClick,
    destroy() {
      if (closed) return;
      closed = true;
      release();
      cancelBtn.removeEventListener("click", onCancelClick);
      confirmBtn.removeEventListener("click", onConfirmClick);
      root.remove();
    },
  };
}