/**
 * The formation selector (Buffy task 70): line, column, wedge, circle, or no
 * choice at all. Picking a shape is intent, not behaviour — the commander
 * attaches it to the next order it issues and the sim decides what the troops
 * actually do with it.
 *
 * "Loose" is a real choice, not an escape hatch: it is how the player says
 * "whatever formation they are already in".
 */

import "./formation.css";
import { h } from "../ui/dom.js";
import { FORMATION_LABEL, type FormationKind } from "./types.js";

export interface FormationChoice {
  /** null = no formation asked for; the order says nothing about shape. */
  formation: FormationKind | null;
  label: string;
  testId: string;
}

/** In display order, with the "no choice" option first. */
export const FORMATION_CHOICES: readonly FormationChoice[] = [
  { formation: null, label: "Loose", testId: "cmd-formation-loose" },
  { formation: "line", label: FORMATION_LABEL.line, testId: "cmd-formation-line" },
  { formation: "column", label: FORMATION_LABEL.column, testId: "cmd-formation-column" },
  { formation: "wedge", label: FORMATION_LABEL.wedge, testId: "cmd-formation-wedge" },
  { formation: "circle", label: FORMATION_LABEL.circle, testId: "cmd-formation-circle" },
];

export interface FormationSelectorOptions {
  /** Fired on every pick, including picking "Loose". */
  onPick: (formation: FormationKind | null) => void;
  choices?: readonly FormationChoice[];
}

export interface FormationSelector {
  root: HTMLElement;
  current(): FormationKind | null;
  /** Set without firing `onPick` — for restoring state, not for a player action. */
  set(formation: FormationKind | null): void;
  destroy(): void;
}

export function createFormationSelector(options: FormationSelectorOptions): FormationSelector {
  const choices = options.choices ?? FORMATION_CHOICES;
  const buttons = new Map<FormationKind | null, HTMLButtonElement>();

  const root = h("div", {
    class: "cmd-formation",
    role: "group",
    "aria-label": "Formation",
    "data-testid": "cmd-formation",
  });

  for (const choice of choices) {
    const btn = h("button", {
      type: "button",
      class: "cmd-formation__choice",
      "aria-pressed": "false",
      "data-testid": choice.testId,
      title: choice.formation
        ? `Hold this shape until you change it: ${choice.label.toLowerCase()}.`
        : "Give no shape: units keep whatever formation they have.",
    }) as HTMLButtonElement;
    btn.appendChild(h("span", { class: "cmd-formation__label" }, choice.label));
    btn.addEventListener("click", () => {
      set(choice.formation);
      options.onPick(choice.formation);
    });
    root.appendChild(btn);
    buttons.set(choice.formation, btn);
  }

  function set(formation: FormationKind | null): void {
    for (const [kind, btn] of buttons) {
      btn.setAttribute("aria-pressed", kind === formation ? "true" : "false");
      btn.classList.toggle("is-active", kind === formation);
    }
  }
  set(null);

  return {
    root,
    current: () => {
      for (const [kind, btn] of buttons) {
        if (btn.getAttribute("aria-pressed") === "true") return kind;
      }
      return null;
    },
    set,
    destroy() {
      root.remove();
    },
  };
}