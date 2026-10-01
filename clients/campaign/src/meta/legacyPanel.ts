/**
 * Legacy panel (MASTER_PLAN task 142, New Game+).
 *
 * Mid-campaign home for the legacy record: shows the banked carryover (if
 * any), what the current campaign would bank, and the two actions — bank
 * this campaign as the next heir's legacy (two-step, overwrites), or discard
 * the banked legacy. Banking does not end the current campaign; the record
 * is offered on the start screen of the next one.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import {
  bankCampaign,
  carryoverLines,
  type BankInput,
  type NewGamePlusRecord,
} from "./newgameplus.js";

export interface LegacyPanelOptions {
  /** The currently banked legacy, if any. */
  record: () => NewGamePlusRecord | null;
  /** What the current campaign would bank, for the preview. */
  preview: () => BankInput;
  /** Persist a banked record. Returns false when storage failed. */
  onBank: (record: NewGamePlusRecord) => boolean;
  onDiscard: () => void;
  onClose: () => void;
}

export function legacyPanel(options: LegacyPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Legacy — New Game+",
    testId: "legacy-panel",
    onClose: options.onClose,
  });

  const render = (): void => {
    body.replaceChildren();
    const record = options.record();

    if (record) {
      body.appendChild(
        h("p", { class: "caption", "data-testid": "legacy-banked-note" }, "A legacy is banked. It will be offered on the next start screen."),
      );
      const list = h("ul", { class: "legacy__lines", "data-testid": "legacy-carryover" });
      for (const line of carryoverLines(record)) {
        list.appendChild(h("li", {}, line));
      }
      body.appendChild(list);
      const discard = h("button", { type: "button", class: "btn btn--quiet", "data-testid": "legacy-discard" }, "Discard legacy");
      discard.addEventListener("click", () => {
        if (discard.dataset.armed === "1") {
          options.onDiscard();
          render();
        } else {
          discard.dataset.armed = "1";
          discard.textContent = "Click again to discard the banked legacy";
        }
      });
      body.appendChild(discard);
    } else {
      body.appendChild(
        emptyState("No legacy banked", "Bank this campaign and your heir starts the next one with an inheritance."),
      );
    }

    // What banking right now would carry over.
    const previewRecord = bankCampaign(options.preview());
    body.appendChild(h("h3", { class: "legacy__sub" }, "Bank this campaign"));
    const preview = h("ul", { class: "legacy__lines", "data-testid": "legacy-preview" });
    for (const line of carryoverLines(previewRecord)) {
      preview.appendChild(h("li", {}, line));
    }
    body.appendChild(preview);

    const bank = h(
      "button",
      { type: "button", class: "btn", "data-testid": "legacy-bank" },
      record ? "Bank this campaign (replaces the old legacy)" : "Bank this campaign as legacy",
    );
    const note = h("p", { class: "caption", role: "status" });
    bank.addEventListener("click", () => {
      if (bank.dataset.armed !== "1" && record) {
        bank.dataset.armed = "1";
        bank.textContent = "Click again to replace the banked legacy";
        return;
      }
      const ok = options.onBank(previewRecord);
      note.textContent = ok ? "Legacy banked. It will be offered on the next start screen." : "Could not write the legacy — browser storage is unavailable.";
      if (ok) render();
    });
    body.appendChild(bank);
    body.appendChild(note);
  };

  render();
  return root;
}
