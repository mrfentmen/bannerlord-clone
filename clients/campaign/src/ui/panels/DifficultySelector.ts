/**
 * Difficulty selector (Rowan solo task 6).
 *
 * Radio-group card for the start screen: three difficulties with their
 * effects spelled out. The host reads the selection when creating the
 * campaign and persists it with the save.
 */

import { h } from "../dom.js";
import { difficultyOptions, type Difficulty } from "../../meta/difficulty.js";

export interface DifficultySelectorOptions {
  initial?: Difficulty;
  onSelect: (difficulty: Difficulty) => void;
}

export function difficultySelector(options: DifficultySelectorOptions): HTMLElement {
  const group = h("div", {
    class: "difficulty-selector",
    role: "radiogroup",
    "aria-label": "Campaign difficulty",
    "data-testid": "difficulty-selector",
  });

  let selected: Difficulty = options.initial ?? "normal";
  const buttons: HTMLButtonElement[] = [];

  const render = (): void => {
    for (const btn of buttons) {
      const active = btn.dataset.difficulty === selected;
      btn.setAttribute("aria-checked", active ? "true" : "false");
      btn.classList.toggle("difficulty-selector__option--selected", active);
    }
  };

  for (const opt of difficultyOptions()) {
    const btn = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: "difficulty-selector__option",
        "data-testid": `difficulty-${opt.id}`,
        "data-difficulty": opt.id,
      },
      h("strong", {}, opt.label),
      h("small", { class: "caption" }, opt.description),
    ) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      selected = opt.id;
      render();
      options.onSelect(opt.id);
    });
    buttons.push(btn);
    group.appendChild(btn);
  }

  render();
  return group;
}
