/**
 * The stance selector (Buffy task 72): aggressive, defensive, or passive — plus
 * "Default", which is the honest fourth answer: "I have not said".
 *
 * Like the formation (task 70) this is intent, not behaviour. The commander puts
 * the chosen stance on the next order it issues and the sim decides how the troops
 * actually fight. Choosing nothing leaves the order without a stance rather than
 * defaulting it to passive, which is a stance the player did not pick.
 */

import "./stance.css";
import { h } from "../ui/dom.js";
import type { StanceKind } from "./types.js";

export interface StanceChoice {
  /** null = no stance asked for; the order says nothing about posture. */
  stance: StanceKind | null;
  label: string;
  /** One line for the tooltip, saying what the choice means in play. */
  hint: string;
  testId: string;
}

/** In display order, most eager first, with the no-choice option first. */
export const STANCE_CHOICES: readonly StanceChoice[] = [
  {
    stance: null,
    label: "Default",
    hint: "No stance chosen: units fight however they were already set to.",
    testId: "cmd-stance-default",
  },
  {
    stance: "aggressive",
    label: "Aggressive",
    hint: "Close with anything in reach, and keep pressing.",
    testId: "cmd-stance-aggressive",
  },
  {
    stance: "defensive",
    label: "Defensive",
    hint: "Hold the ground you have; engage what comes to you.",
    testId: "cmd-stance-defensive",
  },
  {
    stance: "passive",
    label: "Passive",
    hint: "Never start a fight. Take no action unless directly ordered.",
    testId: "cmd-stance-passive",
  },
];

export interface StanceSelectorOptions {
  /** Fired on every pick, including picking "Default". */
  onPick: (stance: StanceKind | null) => void;
  choices?: readonly StanceChoice[];
}

export interface StanceSelector {
  root: HTMLElement;
  current(): StanceKind | null;
  /** Set without firing `onPick` — for restoring state, not a player action. */
  set(stance: StanceKind | null): void;
  destroy(): void;
}

export function createStanceSelector(options: StanceSelectorOptions): StanceSelector {
  const choices = options.choices ?? STANCE_CHOICES;
  const buttons = new Map<StanceKind | null, HTMLButtonElement>();

  const root = h("div", {
    class: "cmd-stance",
    role: "group",
    "aria-label": "Stance",
    "data-testid": "cmd-stance",
  });

  for (const choice of choices) {
    const btn = h("button", {
      type: "button",
      class: "cmd-stance__choice",
      "aria-pressed": "false",
      "data-testid": choice.testId,
      title: choice.hint,
    }) as HTMLButtonElement;
    btn.appendChild(h("span", { class: "cmd-stance__label" }, choice.label));
    btn.addEventListener("click", () => {
      set(choice.stance);
      options.onPick(choice.stance);
    });
    root.appendChild(btn);
    buttons.set(choice.stance, btn);
  }

  function set(stance: StanceKind | null): void {
    for (const [kind, btn] of buttons) {
      btn.setAttribute("aria-pressed", kind === stance ? "true" : "false");
      btn.classList.toggle("is-active", kind === stance);
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