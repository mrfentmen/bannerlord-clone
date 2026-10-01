/**
 * @vitest-environment jsdom
 *
 * Difficulty section (MASTER_PLAN task 144): 8 sliders + 4 presets,
 * wired into the Settings panel's Gameplay tab.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { settings, DIFFICULTY_PRESETS, DIFFICULTY_SLIDERS } from "../../../settings/index.js";
import { difficultySection } from "../DifficultyPanel.js";
import { settingsPanel } from "../SettingsPanel.js";

beforeEach(() => {
  document.body.innerHTML = "";
  settings.reset();
});

function openSettings(): HTMLElement {
  const root = settingsPanel({ onClose: () => {} });
  document.body.appendChild(root);
  return root;
}

function gameplayTab(root: HTMLElement): void {
  (root.querySelector('[data-testid="settings-tab-gameplay"]') as HTMLButtonElement).click();
}

function moveDifficultySlider(root: HTMLElement, id: string, value: number): void {
  const el = root.querySelector(`[data-testid="difficulty-${id}"]`) as HTMLInputElement;
  el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("difficultySection", () => {
  it("renders 8 sliders and 4 preset buttons", () => {
    const el = difficultySection();
    document.body.appendChild(el);
    for (const s of DIFFICULTY_SLIDERS) {
      expect(el.querySelector(`[data-testid="difficulty-${s.id}"]`), s.id).not.toBeNull();
    }
    for (const id of ["story", "normal", "veteran", "nightmare"]) {
      expect(el.querySelector(`[data-testid="difficulty-preset-${id}"]`), id).not.toBeNull();
    }
    expect(el.querySelector('[data-testid="difficulty-current"]')!.textContent).toContain("Normal");
  });

  it("preset click applies the whole bundle and marks the button active", () => {
    const el = difficultySection();
    document.body.appendChild(el);
    (el.querySelector('[data-testid="difficulty-preset-veteran"]') as HTMLButtonElement).click();
    expect(settings.get().difficulty.values).toEqual(DIFFICULTY_PRESETS.veteran.values);
    expect(el.querySelector('[data-testid="difficulty-current"]')!.textContent).toContain("Veteran");
    const btn = el.querySelector('[data-testid="difficulty-preset-veteran"]')!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.classList.contains("settings__preset--active")).toBe(true);
  });

  it("moving a slider flips the label to Custom and writes through to the store", () => {
    const el = difficultySection();
    document.body.appendChild(el);
    moveDifficultySlider(el, "playerDamage", 1.5);
    expect(settings.get().difficulty.values.playerDamage).toBe(1.5);
    expect(settings.get().difficulty.preset).toBe("custom");
    expect(el.querySelector('[data-testid="difficulty-current"]')!.textContent).toContain("Custom");
    expect(
      el.querySelector('[data-testid="difficulty-playerDamage-value"]')!.textContent,
    ).toBe("150%");
    // No preset button stays active once custom.
    for (const id of ["story", "normal", "veteran", "nightmare"]) {
      expect(
        el.querySelector(`[data-testid="difficulty-preset-${id}"]`)!.getAttribute("aria-pressed"),
      ).toBe("false");
    }
  });
});

describe("difficulty in the settings panel", () => {
  it("shows the difficulty section on the gameplay tab only", () => {
    const root = openSettings();
    expect(root.querySelector('[data-testid="difficulty-section"]')).toBeNull();
    gameplayTab(root);
    expect(root.querySelector('[data-testid="difficulty-section"]')).not.toBeNull();
    (root.querySelector('[data-testid="settings-tab-audio"]') as HTMLButtonElement).click();
    expect(root.querySelector('[data-testid="difficulty-section"]')).toBeNull();
  });

  it("finds the section through search", () => {
    const root = openSettings();
    const search = root.querySelector('[data-testid="settings-search"]') as HTMLInputElement;
    search.value = "difficulty";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector('[data-testid="difficulty-section"]')).not.toBeNull();
  });

  it("cancel reverts difficulty changes made since the panel opened", () => {
    const root = openSettings();
    gameplayTab(root);
    (root.querySelector('[data-testid="difficulty-preset-nightmare"]') as HTMLButtonElement).click();
    expect(settings.get().difficulty.preset).toBe("nightmare");
    (root.querySelector('[data-testid="settings-cancel"]') as HTMLButtonElement).click();
    expect(settings.get().difficulty.preset).toBe("normal");
    expect(settings.get().difficulty.values.playerDamage).toBe(1);
  });
});
