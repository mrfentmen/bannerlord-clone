/**
 * Custom difficulty section (MASTER_PLAN task 144).
 *
 * Renders inside the Settings panel's Gameplay tab: four preset buttons and
 * the eight fine-tune sliders (damage / economy / AI). Every change writes a
 * fresh difficulty object to the settings store, so cancel-revert and the
 * dirty check in SettingsPanel keep working by object identity.
 */

import { h } from "../dom.js";
import {
  settings,
  DIFFICULTY_CATEGORIES,
  DIFFICULTY_PRESET_IDS,
  DIFFICULTY_PRESETS,
  DIFFICULTY_SLIDERS,
  applyDifficultyPreset,
  difficultySummary,
  withDifficultyValue,
  type DifficultyPresetId,
  type DifficultySliderId,
} from "../../settings/index.js";

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export function difficultySection(): HTMLElement {
  const root = h("div", { class: "difficulty", "data-testid": "difficulty-section" });

  function refreshPresetChrome(): void {
    const d = settings.get().difficulty;
    const label = root.querySelector('[data-testid="difficulty-current"]');
    if (label) label.textContent = `Current: ${difficultySummary(d)}`;
    for (const id of DIFFICULTY_PRESET_IDS) {
      const btn = root.querySelector(`[data-testid="difficulty-preset-${id}"]`);
      if (!btn) continue;
      const active = d.preset === id;
      btn.classList.toggle("settings__preset--active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function render(): void {
    root.replaceChildren();
    const d = settings.get().difficulty;

    root.append(
      h("h3", { class: "settings__group" }, "Difficulty"),
      h("div", { class: "settings__hint" }, "Fine-tune the campaign. Presets are one click; moving any slider makes it Custom."),
    );

    const presetGroup = h("div", {
      class: "settings__presets",
      role: "group",
      "aria-label": "Difficulty presets",
    });
    for (const id of DIFFICULTY_PRESET_IDS) {
      const p = DIFFICULTY_PRESETS[id];
      const btn = h(
        "button",
        {
          type: "button",
          class: "btn settings__preset" + (d.preset === id ? " settings__preset--active" : ""),
          "aria-pressed": d.preset === id ? "true" : "false",
          title: p.description,
          "data-testid": `difficulty-preset-${id}`,
        },
        p.label,
      ) as HTMLButtonElement;
      btn.addEventListener("click", () => {
        settings.set({ difficulty: applyDifficultyPreset(id) });
        render();
      });
      presetGroup.appendChild(btn);
    }
    const current = h(
      "span",
      { class: "settings__value", "data-testid": "difficulty-current" },
      `Current: ${difficultySummary(d)}`,
    );
    presetGroup.appendChild(current);
    root.appendChild(presetGroup);

    for (const cat of DIFFICULTY_CATEGORIES) {
      root.appendChild(h("h4", { class: "settings__group" }, cat.label));
      for (const s of DIFFICULTY_SLIDERS.filter((x) => x.category === cat.id)) {
        const inputId = `difficulty-${s.id}`;
        const range = h("input", {
          type: "range",
          id: inputId,
          min: String(s.min),
          max: String(s.max),
          step: String(s.step),
          "aria-label": s.label,
          "data-testid": inputId,
        }) as HTMLInputElement;
        range.value = String(d.values[s.id]);
        const out = h(
          "span",
          { class: "settings__value", "aria-hidden": "true", "data-testid": `${inputId}-value` },
          pct(d.values[s.id]),
        );
        range.addEventListener("input", () => {
          const v = Number(range.value);
          out.textContent = pct(v);
          // No re-render while dragging: the thumb must not jump.
          settings.set({
            difficulty: withDifficultyValue(settings.get().difficulty, s.id as DifficultySliderId, v),
          });
          refreshPresetChrome();
        });
        root.appendChild(
          h(
            "div",
            { class: "settings__row", "data-testid": `difficulty-row-${s.id}` },
            h(
              "div",
              { class: "settings__label" },
              h("label", { class: "settings__name", for: inputId }, s.label),
              h("div", { class: "settings__hint" }, s.hint),
            ),
            h("div", { class: "settings__control" }, h("span", { class: "settings__slider" }, range, out)),
          ),
        );
      }
    }
  }

  render();
  return root;
}

/** Re-exported for callers that only need the preset type. Kept here so the panel is the single import. */
export type { DifficultyPresetId };
