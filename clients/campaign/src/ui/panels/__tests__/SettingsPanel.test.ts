/**
 * @vitest-environment jsdom
 *
 * Settings panel tests (MASTER_PLAN tasks 10, 12, 14, 15, 16):
 * tabbed layout with a control for every schema field, preset bundles,
 * live-apply with cancel-revert, search, and confirmed reset.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { settings, DEFAULT_SETTINGS } from "../../../settings/index.js";
import { settingsPanel } from "../SettingsPanel.js";

const GRAPHICS_KEYS = [
  "graphicsQuality",
  "renderScale",
  "antialias",
  "terrainDetail",
  "maxFps",
  "powerPreference",
  "shadowQuality",
  "viewDistance",
  "lookPreset",
  "grainIntensity",
  "bloomEnabled",
  "vignetteEnabled",
  "depthOfFieldEnabled",
  "motionBlurEnabled",
  "particleDensity",
  "damageVignetteEnabled",
  "ragdollEnabled",
];
const AUDIO_KEYS = ["masterVolume", "musicVolume", "sfxVolume"];
const GAMEPLAY_KEYS = [
  "cameraSpeed",
  "mouseSensitivity",
  "invertMouseX",
  "invertMouseY",
  "gamepadEnabled",
  "hapticsEnabled",
  "language",
];
const ACCESSIBILITY_KEYS = [
  "uiScale",
  "reduceMotion",
  "colorblindMode",
  "highContrast",
  "subtitleSize",
  "subtitleBackground",
  "holdToggles",
  "floatingDamageNumbers",
  "hitStop",
  "screenShake",
];

beforeEach(() => {
  document.body.innerHTML = "";
  settings.reset();
});

function open(): { root: HTMLElement; closed: () => boolean } {
  let wasClosed = false;
  const root = settingsPanel({ onClose: () => { wasClosed = true; } });
  document.body.appendChild(root);
  return { root, closed: () => wasClosed };
}

function tab(root: HTMLElement, id: string): void {
  (root.querySelector(`[data-testid="settings-tab-${id}"]`) as HTMLButtonElement).click();
}

function setSlider(root: HTMLElement, key: string, value: number): void {
  const el = root.querySelector(`[data-testid="setting-${key}"]`) as HTMLInputElement;
  el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setToggle(root: HTMLElement, key: string, value: boolean): void {
  const el = root.querySelector(`[data-testid="setting-${key}"]`) as HTMLInputElement;
  el.checked = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelect(root: HTMLElement, key: string, value: string): void {
  const el = root.querySelector(`[data-testid="setting-${key}"]`) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("settingsPanel", () => {
  it("renders four tabs, graphics first", () => {
    const { root } = open();
    for (const t of ["graphics", "audio", "gameplay", "accessibility"]) {
      expect(root.querySelector(`[data-testid="settings-tab-${t}"]`)).not.toBeNull();
    }
    expect(root.querySelector('[data-testid="setting-row-renderScale"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-row-masterVolume"]')).toBeNull();
  });

  it("gives every scalar schema field a control on its tab", () => {
    const { root } = open();
    const tabs: [string, string[]][] = [
      ["graphics", GRAPHICS_KEYS],
      ["audio", AUDIO_KEYS],
      ["gameplay", GAMEPLAY_KEYS],
      ["accessibility", ACCESSIBILITY_KEYS],
    ];
    const covered = new Set<string>();
    for (const [t, keys] of tabs) {
      tab(root, t);
      for (const key of keys) {
        covered.add(key);
        if (key === "graphicsQuality") {
          expect(root.querySelector('[data-testid="setting-preset-low"]')).not.toBeNull();
        } else {
          expect(root.querySelector(`[data-testid="setting-${key}"]`), key).not.toBeNull();
        }
      }
    }
    // autoQualityDone is benchmark bookkeeping, not a user-facing setting.
    // difficulty is object-valued with its own custom section (task 144), not a scalar control.
    const scalars = Object.keys(DEFAULT_SETTINGS).filter(
      (k) => k !== "version" && k !== "keyBindings" && k !== "autoQualityDone" && k !== "difficulty",
    );
    expect([...covered].sort()).toEqual(scalars.sort());
  });

  it("preset click applies the whole bundle at once", () => {
    const { root } = open();
    (root.querySelector('[data-testid="setting-preset-low"]') as HTMLButtonElement).click();
    const s = settings.get();
    expect(s.graphicsQuality).toBe("low");
    expect(s.renderScale).toBe(1.5);
    expect(s.antialias).toBe(false);
    expect(s.terrainDetail).toBe("low");
    expect(s.maxFps).toBe(30);
    expect(s.powerPreference).toBe("low-power");
  });

  it("applies slider and toggle changes live to the store", () => {
    const { root } = open();
    setSlider(root, "renderScale", 1.5);
    expect(settings.get().renderScale).toBe(1.5);
    tab(root, "gameplay");
    setSlider(root, "mouseSensitivity", 2);
    setToggle(root, "invertMouseY", true);
    expect(settings.get().mouseSensitivity).toBe(2);
    expect(settings.get().invertMouseY).toBe(true);
  });

  it("task 145: look preset select and grain slider write to the store", () => {
    const { root } = open();
    setSelect(root, "lookPreset", "noir");
    expect(settings.get().lookPreset).toBe("noir");
    setSlider(root, "grainIntensity", 0.9);
    expect(settings.get().grainIntensity).toBeCloseTo(0.9, 10);
    setSelect(root, "lookPreset", "gritty");
    expect(settings.get().lookPreset).toBe("gritty");
  });

  it("task 146: post-processing toggles write to the store independently", () => {
    const { root } = open();
    setToggle(root, "bloomEnabled", true);
    setToggle(root, "depthOfFieldEnabled", true);
    expect(settings.get().bloomEnabled).toBe(true);
    expect(settings.get().depthOfFieldEnabled).toBe(true);
    // Untouched toggles keep their defaults.
    expect(settings.get().vignetteEnabled).toBe(true);
    expect(settings.get().motionBlurEnabled).toBe(false);
    setToggle(root, "vignetteEnabled", false);
    expect(settings.get().vignetteEnabled).toBe(false);
    expect(settings.get().bloomEnabled).toBe(true);
  });

  it("cancel reverts every change made since the panel opened", () => {
    const { root, closed } = open();
    setSlider(root, "renderScale", 1.5);
    tab(root, "gameplay");
    setToggle(root, "invertMouseX", true);
    setSelect(root, "language", "en");
    expect(root.querySelector('[data-testid="settings-dirty"]')!.hasAttribute("hidden")).toBe(false);
    (root.querySelector('[data-testid="settings-cancel"]') as HTMLButtonElement).click();
    expect(settings.get().renderScale).toBe(DEFAULT_SETTINGS.renderScale);
    expect(settings.get().invertMouseX).toBe(false);
    expect(closed()).toBe(true);
  });

  it("save keeps live-applied changes and closes", () => {
    const { root, closed } = open();
    tab(root, "audio");
    setSlider(root, "masterVolume", 0.5);
    (root.querySelector('[data-testid="settings-save"]') as HTMLButtonElement).click();
    expect(settings.get().masterVolume).toBe(0.5);
    expect(closed()).toBe(true);
  });

  it("escape reverts and closes", () => {
    const { root, closed } = open();
    setSlider(root, "renderScale", 2);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(settings.get().renderScale).toBe(DEFAULT_SETTINGS.renderScale);
    expect(closed()).toBe(true);
  });

  it("reset asks for confirmation before restoring defaults", () => {
    const { root } = open();
    tab(root, "audio");
    setSlider(root, "masterVolume", 0.2);
    (root.querySelector('[data-testid="settings-reset"]') as HTMLButtonElement).click();
    // Not yet reset: the confirm step is showing instead.
    expect(settings.get().masterVolume).toBe(0.2);
    expect(root.querySelector('[data-testid="settings-reset-confirm"]')!.hasAttribute("hidden")).toBe(false);
    (root.querySelector('[data-testid="settings-reset-confirm"]') as HTMLButtonElement).click();
    expect(settings.get().masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(settings.get().renderScale).toBe(DEFAULT_SETTINGS.renderScale);
  });

  it("reset cancellation keeps current values", () => {
    const { root } = open();
    tab(root, "audio");
    setSlider(root, "masterVolume", 0.2);
    (root.querySelector('[data-testid="settings-reset"]') as HTMLButtonElement).click();
    (root.querySelector('[data-testid="settings-reset-cancel"]') as HTMLButtonElement).click();
    expect(settings.get().masterVolume).toBe(0.2);
  });

  it("search finds rows by label, hint, or keyword across tabs", () => {
    const { root } = open();
    const search = root.querySelector('[data-testid="settings-search"]') as HTMLInputElement;
    search.value = "mouse";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector('[data-testid="setting-row-mouseSensitivity"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-row-invertMouseX"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-row-renderScale"]')).toBeNull();
    // Task-15 acceptance, verbatim: searching "shadow" finds shadow quality.
    search.value = "shadow";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector('[data-testid="setting-row-shadowQuality"]')).not.toBeNull();
    search.value = "rumble";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector('[data-testid="setting-row-hapticsEnabled"]')).not.toBeNull();
    // Task-145: searching "grain" finds the look preset and grain slider.
    search.value = "grain";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector('[data-testid="setting-row-lookPreset"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-row-grainIntensity"]')).not.toBeNull();
  });

  it("graphics tab has the shadow, view-distance, and auto-detect controls", () => {
    const { root } = open();
    tab(root, "graphics");
    expect(root.querySelector('[data-testid="setting-shadowQuality"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-viewDistance"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="setting-autodetect"]')).not.toBeNull();
  });

  it("flags reload-needed changes with a banner", () => {
    const { root } = open();
    const banner = root.querySelector('[data-testid="settings-reload-banner"]')!;
    expect(banner.hasAttribute("hidden")).toBe(true);
    setToggle(root, "antialias", false);
    expect(banner.hasAttribute("hidden")).toBe(false);
    expect(banner.textContent).toContain("Anti-aliasing");
  });

  it("marks reload-needed controls with a tag", () => {
    const { root } = open();
    const row = root.querySelector('[data-testid="setting-row-antialias"]')!;
    expect(row.querySelector(".settings__reload-tag")).not.toBeNull();
  });
});
