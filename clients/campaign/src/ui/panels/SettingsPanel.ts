/**
 * Tabbed settings panel (MASTER_PLAN tasks 10, 12, 14, 15, 16).
 *
 * Every scalar settings-schema field gets a control, grouped into
 * Graphics / Audio / Gameplay / Accessibility tabs. Changes apply live the
 * moment a control moves (the settings store persists + notifies, and main.ts
 * applies the live subset). Closing via Save or the ✕ keeps everything;
 * Cancel reverts to the snapshot taken when the panel opened. Presets apply
 * the task-12 bundle in one click; search filters rows by name.
 */

import { h } from "../dom.js";
import { panel } from "../kit.js";
import { difficultySection } from "./DifficultyPanel.js";
import {
  settings,
  DEFAULT_SETTINGS,
  UI_SCALE_STEPS,
  presetPatch,
  describePreset,
  GRAPHICS_PRESETS,
  type Settings,
  type GraphicsQuality,
} from "../../settings/index.js";
import { LOOK_PRESETS } from "../../design/lookPresets.js";
import { SHADOW_LEVELS, shadowConfigFor } from "../../design/shadows.js";

export interface SettingsPanelOptions {
  onClose: () => void;
}

type TabId = "graphics" | "audio" | "gameplay" | "accessibility";

const TABS: { id: TabId; label: string }[] = [
  { id: "graphics", label: "Graphics" },
  { id: "audio", label: "Audio" },
  { id: "gameplay", label: "Gameplay" },
  { id: "accessibility", label: "Accessibility" },
];

type ControlKind =
  | { type: "slider"; min: number; max: number; step: number; format: (v: number) => string }
  | { type: "toggle" }
  | { type: "select"; options: { value: string; label: string }[] }
  | { type: "preset" };

/** Search haystack for the difficulty section (task 144), which is not a scalar control. */
const DIFFICULTY_SEARCH_HAY =
  "difficulty sliders damage economy ai aggression battle skill income wages market prices preset custom";

interface ControlDef {
  key: keyof Settings;
  tab: TabId;
  label: string;
  hint: string;
  keywords: string[];
  needsReload?: boolean;
  kind: ControlKind;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const num1 = (v: number): string => String(Math.round(v * 10) / 10);

const CONTROLS: ControlDef[] = [
  {
    key: "graphicsQuality", tab: "graphics", label: "Quality preset",
    hint: "One click applies the whole bundle below. " +
      "Anti-aliasing, terrain detail and GPU preference need a reload.",
    keywords: ["preset", "low", "medium", "high", "ultra", "quality"],
    kind: { type: "preset" },
  },
  {
    key: "renderScale", tab: "graphics", label: "Render scale",
    hint: "Resolution the 3D scene renders at. Above 100% is sharper but slower.",
    keywords: ["resolution", "scaling", "render"],
    kind: { type: "slider", min: 0.5, max: 2, step: 0.05, format: pct },
  },
  {
    key: "antialias", tab: "graphics", label: "Anti-aliasing",
    hint: "Smooths jagged edges. Takes effect after a reload.",
    keywords: ["aa", "msaa", "edges", "jagged"],
    needsReload: true,
    kind: { type: "toggle" },
  },
  {
    key: "terrainDetail", tab: "graphics", label: "Terrain detail",
    hint: "Mesh density of the campaign terrain. Takes effect after a reload.",
    keywords: ["terrain", "mesh", "detail"],
    needsReload: true,
    kind: { type: "select", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] },
  },
  {
    key: "maxFps", tab: "graphics", label: "Frame rate cap",
    hint: "Caps the render loop. Useful on laptops and high-refresh displays.",
    keywords: ["fps", "frame", "cap", "vsync"],
    kind: {
      type: "select",
      options: [
        { value: "0", label: "Uncapped" },
        { value: "30", label: "30 fps" },
        { value: "60", label: "60 fps" },
        { value: "120", label: "120 fps" },
      ],
    },
  },
  {
    key: "powerPreference", tab: "graphics", label: "GPU preference",
    hint: "Which GPU the browser should prefer. Takes effect after a reload.",
    keywords: ["gpu", "power", "battery"],
    needsReload: true,
    kind: {
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "low-power", label: "Power saving" },
        { value: "high-performance", label: "High performance" },
      ],
    },
  },
  {
    key: "shadowQuality", tab: "graphics", label: "Shadow quality",
    hint: "Real-time shadows from the sun. Each level states its cost; switching levels reports the measured fps. Applies immediately.",
    keywords: ["shadow", "shadows", "sun", "lighting", "cascade"],
    kind: {
      type: "select",
      // Options come from the shadow policy (design/shadows.ts) so the
      // labels can never drift from what the scene actually builds.
      options: SHADOW_LEVELS.map((level) => {
        const cfg = shadowConfigFor(level);
        return {
          value: level,
          label: cfg ? `${cfg.label} — ${cfg.blurb}` : "Off — no shadow maps (fastest)",
        };
      }),
    },
  },
  {
    key: "viewDistance", tab: "graphics", label: "View distance",
    hint: "How far the camera sees, with matching haze. Distant towns pop in/out at the set range. Applies immediately.",
    keywords: ["view", "distance", "fog", "far", "draw", "lod", "towns"],
    kind: {
      type: "slider",
      min: 80_000,
      max: 400_000,
      step: 10_000,
      format: (v) => `${Math.round(v / 1000)} km`,
    },
  },
  {
    key: "lookPreset", tab: "graphics", label: "Look preset",
    hint: "Film grain + color grading preset. Applies immediately.",
    keywords: ["look", "preset", "grade", "grading", "film", "color", "noir", "cinematic", "gritty", "vintage"],
    kind: {
      type: "select",
      options: LOOK_PRESETS.map((p) => ({ value: p.id, label: `${p.name} — ${p.blurb}` })),
    },
  },
  {
    key: "grainIntensity", tab: "graphics", label: "Grain intensity",
    hint: "How much film grain the scene renders. 0% turns grain off. Applies immediately.",
    keywords: ["grain", "film", "noise", "grit"],
    kind: { type: "slider", min: 0, max: 1, step: 0.05, format: pct },
  },
  {
    key: "particleDensity", tab: "graphics", label: "Particle density",
    hint: "How much dust, snow, and battle debris the scene renders. 0% disables all particles. Applies immediately.",
    keywords: ["particle", "particles", "dust", "snow", "blood", "debris", "fx"],
    kind: { type: "slider", min: 0, max: 1, step: 0.05, format: pct },
  },
  {
    key: "bloomEnabled", tab: "graphics", label: "Bloom",
    hint: "Soft glow around bright lights and the sun. Applies immediately.",
    keywords: ["bloom", "glow", "post", "processing", "fx"],
    kind: { type: "toggle" },
  },
  {
    key: "ragdollEnabled", tab: "graphics", label: "Ragdoll physics",
    hint: "Dead soldiers collapse with Havok ragdoll physics. Turn off for a performance boost on low-end machines. Applies immediately.",
    keywords: ["ragdoll", "physics", "death", "corpse", "havok"],
    kind: { type: "toggle" },
  },
  {
    key: "vignetteEnabled", tab: "graphics", label: "Vignette",
    hint: "Darkened frame corners from the look grade. Applies immediately.",
    keywords: ["vignette", "corners", "post", "fx"],
    kind: { type: "toggle" },
  },
  {
    key: "depthOfFieldEnabled", tab: "graphics", label: "Depth of field",
    hint: "Softens what's far from the camera focus. Applies immediately.",
    keywords: ["depth", "field", "dof", "blur", "focus", "post", "fx"],
    kind: { type: "toggle" },
  },
  {
    key: "motionBlurEnabled", tab: "graphics", label: "Motion blur",
    hint: "Blurs fast camera moves. Forced off while reduced motion is on. Applies immediately.",
    keywords: ["motion", "blur", "post", "fx"],
    kind: { type: "toggle" },
  },
  {
    key: "damageVignetteEnabled", tab: "graphics", label: "Damage vignette",
    hint: "Red edge flash when you take damage, plus the low-health vignette near death. Turn off for a calmer screen. Never flashes under reduced motion. Applies to battles started after the change.",
    keywords: ["damage", "vignette", "flash", "hit", "health", "low"],
    kind: { type: "toggle" },
  },
  {
    key: "masterVolume", tab: "audio", label: "Master volume",
    hint: "Overall loudness.", keywords: ["volume", "master", "loud"],
    kind: { type: "slider", min: 0, max: 1, step: 0.05, format: pct },
  },
  {
    key: "musicVolume", tab: "audio", label: "Music volume",
    hint: "Background music level.", keywords: ["music", "volume"],
    kind: { type: "slider", min: 0, max: 1, step: 0.05, format: pct },
  },
  {
    key: "sfxVolume", tab: "audio", label: "Effects volume",
    hint: "Interface and world sound effects.", keywords: ["sfx", "effects", "volume"],
    kind: { type: "slider", min: 0, max: 1, step: 0.05, format: pct },
  },
  {
    key: "cameraSpeed", tab: "gameplay", label: "Camera speed",
    hint: "Keyboard and stick pan speed on the campaign map.",
    keywords: ["camera", "pan", "speed"],
    kind: { type: "slider", min: 0.25, max: 3, step: 0.25, format: (v) => `${num1(v)}×` },
  },
  {
    key: "mouseSensitivity", tab: "gameplay", label: "Mouse sensitivity",
    hint: "Orbit and wheel-zoom speed on the 3D canvas. Applies immediately.",
    keywords: ["mouse", "sensitivity", "orbit", "zoom"],
    kind: { type: "slider", min: 0.25, max: 3, step: 0.25, format: (v) => `${num1(v)}×` },
  },
  {
    key: "invertMouseX", tab: "gameplay", label: "Invert mouse X",
    hint: "Flip horizontal mouse orbit.", keywords: ["mouse", "invert", "horizontal"],
    kind: { type: "toggle" },
  },
  {
    key: "invertMouseY", tab: "gameplay", label: "Invert mouse Y",
    hint: "Flip vertical mouse orbit.", keywords: ["mouse", "invert", "vertical"],
    kind: { type: "toggle" },
  },
  {
    key: "gamepadEnabled", tab: "gameplay", label: "Gamepad input",
    hint: "Detect controllers automatically for menus and camera.",
    keywords: ["gamepad", "controller"],
    kind: { type: "toggle" },
  },
  {
    key: "hapticsEnabled", tab: "gameplay", label: "Controller rumble",
    hint: "Vibrate the gamepad on battle events.",
    keywords: ["haptics", "rumble", "vibration"],
    kind: { type: "toggle" },
  },
  {
    key: "language", tab: "gameplay", label: "Language",
    hint: "Only English has strings today.", keywords: ["language", "locale"],
    kind: { type: "select", options: [{ value: "en", label: "English" }] },
  },
  {
    key: "uiScale", tab: "accessibility", label: "UI scale",
    hint: "Scales panels and text. Applies immediately.",
    keywords: ["ui", "scale", "text", "size"],
    kind: {
      type: "select",
      options: UI_SCALE_STEPS.map((s) => ({ value: String(s), label: `${s}%` })),
    },
  },
  {
    key: "reduceMotion", tab: "accessibility", label: "Reduce motion",
    hint: "Freezes animated film grain and disables non-essential UI animation.",
    keywords: ["motion", "reduce", "animation"],
    kind: { type: "toggle" },
  },
  {
    key: "floatingDamageNumbers", tab: "accessibility", label: "Damage numbers",
    hint: "Floating damage numbers over hits in battle. Pooled, cheap.",
    keywords: ["damage", "numbers", "floating", "battle"],
    kind: { type: "toggle" },
  },
  {
    key: "hitStop", tab: "accessibility", label: "Hit-stop",
    hint: "Brief freeze-frame on heavy hits. Forced off by Reduce motion.",
    keywords: ["hit", "stop", "freeze", "impact"],
    kind: { type: "toggle" },
  },
  {
    key: "screenShake", tab: "accessibility", label: "Screen shake",
    hint: "Camera shake on heavy hits. Forced off by Reduce motion.",
    keywords: ["shake", "screen", "camera", "impact"],
    kind: { type: "toggle" },
  },
  {
    key: "colorblindMode", tab: "accessibility", label: "Color vision",
    hint: "Remaps faction colors so they stay distinguishable.",
    keywords: ["colorblind", "color", "vision", "deuteranopia", "protanopia", "tritanopia", "faction"],
    kind: {
      type: "select",
      options: [
        { value: "off", label: "Off" },
        { value: "deuteranopia", label: "Deuteranopia (green-blind)" },
        { value: "protanopia", label: "Protanopia (red-blind)" },
        { value: "tritanopia", label: "Tritanopia (blue-blind)" },
      ],
    },
  },
  {
    key: "highContrast", tab: "accessibility", label: "High contrast",
    hint: "Black-on-white UI theme. Applies immediately.",
    keywords: ["contrast", "high", "theme"],
    kind: { type: "toggle" },
  },
  {
    key: "subtitleSize", tab: "accessibility", label: "Subtitle size",
    hint: "Size of dialogue subtitles.",
    keywords: ["subtitle", "caption", "text", "size", "dialogue"],
    kind: {
      type: "select",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
    },
  },
  {
    key: "subtitleBackground", tab: "accessibility", label: "Subtitle background",
    hint: "Background behind dialogue subtitles.",
    keywords: ["subtitle", "caption", "background", "dialogue"],
    kind: {
      type: "select",
      options: [
        { value: "off", label: "None" },
        { value: "translucent", label: "Translucent" },
        { value: "solid", label: "Solid" },
      ],
    },
  },
  {
    key: "holdToggles", tab: "accessibility", label: "Hold-to-open as toggle",
    hint: "Press Space once to open the command radial, press again to confirm — no holding required.",
    keywords: ["hold", "toggle", "radial", "command", "space"],
    kind: { type: "toggle" },
  },
];

const RELOAD_KEYS: (keyof Settings)[] = CONTROLS.filter((c) => c.needsReload).map((c) => c.key);

export function settingsPanel(options: SettingsPanelOptions): HTMLElement {
  const snapshot: Settings = { ...settings.get() };
  let tab: TabId = "graphics";
  let query = "";

  const { root, body } = panel({
    title: "Settings",
    testId: "settings-panel",
    onClose: () => {
      // ✕ keeps the live-applied changes.
      options.onClose();
    },
  });
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Settings");

  const searchInput = h("input", {
    type: "search",
    class: "settings__search",
    placeholder: "Search settings…",
    "aria-label": "Search settings",
    "data-testid": "settings-search",
  });
  const tablist = h("div", { class: "settings__tabs", role: "tablist", "aria-label": "Settings sections" });
  const rowsEl = h("div", { class: "settings__rows", role: "tabpanel" });
  const banner = h("div", { class: "settings__banner", hidden: true, "data-testid": "settings-reload-banner" });
  const dirtyNote = h("span", { class: "settings__dirty", hidden: true, "data-testid": "settings-dirty" }, "Unsaved changes");

  const footer = h("div", { class: "settings__footer" });
  const resetBtn = h("button", { type: "button", class: "btn btn--quiet", "data-testid": "settings-reset" }, "Reset to defaults");
  const resetConfirm = h(
    "span",
    { class: "settings__reset-confirm", hidden: true },
    "Reset everything to defaults? ",
    h("button", { type: "button", class: "btn btn--danger", "data-testid": "settings-reset-confirm" }, "Confirm reset"),
    " ",
    h("button", { type: "button", class: "btn btn--quiet", "data-testid": "settings-reset-cancel" }, "Keep mine"),
  );
  const cancelBtn = h("button", { type: "button", class: "btn", "data-testid": "settings-cancel" }, "Cancel");
  const saveBtn = h("button", { type: "button", class: "btn btn--primary", "data-testid": "settings-save" }, "Save");
  footer.append(resetBtn, resetConfirm, h("span", { class: "settings__spacer" }), dirtyNote, cancelBtn, saveBtn);

  body.append(searchInput, tablist, banner, rowsEl, footer);

  function isDirty(): boolean {
    const cur = settings.get();
    return (Object.keys(snapshot) as (keyof Settings)[]).some((k) => cur[k] !== snapshot[k]);
  }

  function refreshChrome(): void {
    const dirty = isDirty();
    dirtyNote.hidden = !dirty;
    cancelBtn.textContent = dirty ? "Cancel (revert changes)" : "Cancel";
    const pending = RELOAD_KEYS.filter((k) => settings.get()[k] !== snapshot[k]);
    if (pending.length > 0) {
      const labels = pending.map((k) => CONTROLS.find((c) => c.key === k)?.label ?? String(k));
      banner.textContent = `Restart the client to apply: ${labels.join(", ")}.`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function readValue(def: ControlDef): string | number | boolean {
    return settings.get()[def.key] as string | number | boolean;
  }

  function writeValue(def: ControlDef, value: string | number | boolean, rerender = true): void {
    let v: unknown = value;
    if (def.key === "maxFps" || def.key === "uiScale") v = Number(value);
    settings.set({ [def.key]: v } as Partial<Settings>);
    refreshChrome();
    if (rerender) renderRows();
  }

  function presetActive(q: GraphicsQuality): boolean {
    const b = GRAPHICS_PRESETS[q];
    const s = settings.get();
    return (
      s.renderScale === b.renderScale &&
      s.antialias === b.antialias &&
      s.terrainDetail === b.terrainDetail &&
      s.maxFps === b.maxFps &&
      s.powerPreference === b.powerPreference &&
      s.shadowQuality === b.shadowQuality &&
      s.viewDistance === b.viewDistance
    );
  }

  function controlFor(def: ControlDef): HTMLElement {
    const value = readValue(def);
    const id = `setting-${String(def.key)}`;
    if (def.kind.type === "toggle") {
      const box = h("input", {
        type: "checkbox",
        id,
        class: "settings__toggle",
        "aria-label": def.label,
        "data-testid": id,
      }) as HTMLInputElement;
      box.checked = value === true;
      box.addEventListener("change", () => writeValue(def, box.checked));
      return box;
    }
    if (def.kind.type === "slider") {
      const format = def.kind.format;
      const wrap = h("span", { class: "settings__slider" });
      const range = h("input", {
        type: "range",
        id,
        min: String(def.kind.min),
        max: String(def.kind.max),
        step: String(def.kind.step),
        "aria-label": def.label,
        "data-testid": id,
      }) as HTMLInputElement;
      range.value = String(value);
      const out = h("span", { class: "settings__value", "aria-hidden": "true" }, format(value as number));
      range.addEventListener("input", () => {
        const v = Number(range.value);
        out.textContent = format(v);
        writeValue(def, v, false); // no re-render: the thumb is being dragged
      });
      wrap.append(range, out);
      return wrap;
    }
    if (def.kind.type === "select") {
      const sel = h("select", {
        class: "settings__select",
        id,
        "aria-label": def.label,
        "data-testid": id,
      }) as HTMLSelectElement;
      for (const o of def.kind.options) {
        const opt = h("option", { value: o.value }, o.label) as HTMLOptionElement;
        if (String(value) === o.value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => writeValue(def, sel.value));
      return sel;
    }
    // Preset buttons (task 12).
    const group = h("div", { class: "settings__presets", role: "group", "aria-label": def.label });
    for (const q of ["low", "medium", "high", "ultra"] as GraphicsQuality[]) {
      const btn = h(
        "button",
        {
          type: "button",
          class: "btn settings__preset" + (presetActive(q) ? " settings__preset--active" : ""),
          "aria-pressed": presetActive(q) ? "true" : "false",
          title: describePreset(q),
          "data-testid": `setting-preset-${q}`,
        },
        q[0]!.toUpperCase() + q.slice(1),
      );
      btn.addEventListener("click", () => {
        settings.set(presetPatch(q));
        refreshChrome();
        renderRows();
      });
      group.appendChild(btn);
    }
    const desc = h("div", { class: "settings__preset-desc" }, describePreset(settings.get().graphicsQuality));
    group.appendChild(desc);
    // Auto-detect (task 13): re-run the first-launch benchmark on demand.
    const autoBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn--quiet",
        title: "Run the hardware benchmark again and apply the preset it picks.",
        "data-testid": "setting-autodetect",
      },
      "Auto-detect quality",
    );
    autoBtn.addEventListener("click", () => {
      settings.set({ autoQualityDone: false });
      location.reload();
    });
    group.appendChild(autoBtn);
    return group;
  }

  function matches(def: ControlDef): boolean {
    if (query === "") return def.tab === tab;
    const hay = `${def.label} ${def.hint} ${def.keywords.join(" ")}`.toLowerCase();
    return hay.includes(query);
  }

  function renderRows(): void {
    rowsEl.replaceChildren();
    const list = CONTROLS.filter(matches);
    // Difficulty (task 144): object-valued, so it gets its own section rather
    // than a scalar row. Lives on the Gameplay tab; searchable like the rest.
    const wantDifficulty =
      query === "" ? tab === "gameplay" : DIFFICULTY_SEARCH_HAY.includes(query);
    if (list.length === 0 && !wantDifficulty) {
      rowsEl.append(h("p", { class: "settings__empty" }, "No settings match."));
      return;
    }
    let lastTab: TabId | null = null;
    for (const def of list) {
      if (query !== "" && def.tab !== lastTab) {
        lastTab = def.tab;
        rowsEl.append(h("h3", { class: "settings__group" }, TABS.find((t) => t.id === def.tab)!.label));
      }
      const row = h(
        "div",
        { class: "settings__row", "data-testid": `setting-row-${String(def.key)}` },
        h(
          "div",
          { class: "settings__label" },
          h("label", { class: "settings__name", for: `setting-${String(def.key)}` }, def.label),
          def.needsReload ? h("span", { class: "settings__reload-tag", title: "Takes effect after a reload" }, "reload") : null,
          h("div", { class: "settings__hint" }, def.hint),
        ),
        h("div", { class: "settings__control" }, controlFor(def)),
      );
      rowsEl.appendChild(row);
    }
    // (wantDifficulty is computed above, before the empty-list early return.)
    if (wantDifficulty) {
      if (query !== "" && lastTab !== "gameplay") {
        rowsEl.append(h("h3", { class: "settings__group" }, "Gameplay"));
      }
      rowsEl.appendChild(difficultySection());
    }
  }

  function renderTabs(): void {
    tablist.replaceChildren();
    for (const t of TABS) {
      const btn = h(
        "button",
        {
          type: "button",
          role: "tab",
          class: "settings__tab" + (t.id === tab ? " settings__tab--active" : ""),
          "aria-selected": t.id === tab ? "true" : "false",
          "data-testid": `settings-tab-${t.id}`,
        },
        t.label,
      );
      btn.addEventListener("click", () => {
        tab = t.id;
        renderTabs();
        renderRows();
      });
      tablist.appendChild(btn);
    }
    tablist.style.display = query !== "" ? "none" : "";
  }

  searchInput.addEventListener("input", () => {
    query = (searchInput as HTMLInputElement).value.trim().toLowerCase();
    renderTabs();
    renderRows();
  });

  resetBtn.addEventListener("click", () => {
    resetConfirm.hidden = false;
    resetBtn.hidden = true;
  });
  const cancelReset = (): void => {
    resetConfirm.hidden = true;
    resetBtn.hidden = false;
  };
  resetConfirm.querySelector('[data-testid="settings-reset-cancel"]')!.addEventListener("click", cancelReset);
  resetConfirm.querySelector('[data-testid="settings-reset-confirm"]')!.addEventListener("click", () => {
    settings.set({ ...DEFAULT_SETTINGS });
    cancelReset();
    refreshChrome();
    renderRows();
  });

  cancelBtn.addEventListener("click", () => {
    settings.set({ ...snapshot }); // revert everything, live
    options.onClose();
  });
  saveBtn.addEventListener("click", () => {
    options.onClose(); // already persisted + applied live
  });

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      settings.set({ ...snapshot });
      options.onClose();
    }
  });

  renderTabs();
  renderRows();
  refreshChrome();
  return root;
}
