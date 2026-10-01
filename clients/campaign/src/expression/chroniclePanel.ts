/**
 * Chronicle panel mount (Rowan).
 *
 * Mounts the expression/chronicle logic into the app: the clan oath the
 * player swears, and the season-by-season digest of recorded deeds.
 * Pure DOM over chronicle.ts — no simulation or storage of its own; the
 * caller owns the event list and the oath (main.ts persists both).
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import { swearOath, writeChronicle, type ChronicleEvent, type Oath } from "./chronicle.js";
import "./chroniclePanel.css";

/** Campaign days are grouped into 90-day seasons for the chronicle. */
export function seasonForDay(day: number): number {
  return Math.floor(Math.max(0, day) / 90) + 1;
}

export interface ChroniclePanelOptions {
  /** All recorded deeds, oldest first. */
  events: () => ChronicleEvent[];
  /** The currently sworn oath, if any. */
  oath: () => Oath | null;
  /** Persist a newly sworn oath. */
  setOath: (oath: Oath) => void;
  /** Season number "now", for stamping a new oath. */
  currentSeason: () => number;
  onClose?: () => void;
}

export function chroniclePanel(options: ChroniclePanelOptions): { root: HTMLElement } {
  const { root, body } = panel({
    title: "Chronicle",
    testId: "chronicle-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const oathSection = h("section", { class: "chronicle-oath" });
  const oathError = h("p", { class: "chronicle-error", role: "alert" });

  function renderOath(): void {
    oathSection.textContent = "";
    oathSection.appendChild(h("h3", { class: "chronicle-heading" }, "Clan oath"));
    const current = options.oath();
    if (current) {
      oathSection.append(
        h("blockquote", { class: "chronicle-oath__text" }, current.text),
        h("p", { class: "chronicle-oath__meta" }, `Sworn in season ${current.swornSeason}`),
      );
    }
    const input = h("input", {
      type: "text",
      id: "oath-input",
      class: "field__input",
      maxlength: "500",
      placeholder: "Write your clan's oath…",
      "aria-label": "Clan oath text",
      "data-testid": "oath-input",
    }) as HTMLInputElement;
    const swearBtn = h(
      "button",
      { type: "button", class: "btn btn--primary", "data-testid": "swear-oath" },
      current ? "Swear a new oath" : "Swear oath",
    );
    swearBtn.addEventListener("click", () => {
      try {
        options.setOath(swearOath(input.value, options.currentSeason()));
        oathError.textContent = "";
        renderOath();
      } catch (e) {
        oathError.textContent = e instanceof Error ? e.message : "That oath could not be sworn.";
      }
    });
    const form = h("div", { class: "field" }, h("label", { class: "field__label", for: "oath-input" }, "Oath"), input);
    oathSection.append(form, swearBtn, oathError);
  }

  function renderChapters(): HTMLElement {
    const chapters = writeChronicle(options.events());
    const wrap = h("section", { class: "chronicle-chapters" });
    wrap.appendChild(h("h3", { class: "chronicle-heading" }, "Deeds of the clan"));
    if (chapters.length === 0) {
      wrap.appendChild(emptyState("No history yet", "Your clan's deeds will be written here, season by season."));
      return wrap;
    }
    for (const chapter of chapters) {
      wrap.appendChild(h("p", { class: "chronicle-chapter", "data-testid": "chronicle-chapter" }, chapter));
    }
    return wrap;
  }

  renderOath();
  body.append(oathSection, renderChapters());
  return { root };
}
