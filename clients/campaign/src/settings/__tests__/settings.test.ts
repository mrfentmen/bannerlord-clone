/**
 * Settings contract: garbage in, valid settings out; migrations absorb legacy keys;
 * the store persists and notifies.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  parseSettings,
  SETTINGS_VERSION,
} from "../schema.js";
import { createSettingsStore, type StorageLike } from "../store.js";

function memStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("settings schema", () => {
  it("parses a full valid blob", () => {
    const s = parseSettings({
      version: 1,
      graphicsQuality: "ultra",
      uiScale: 115,
      cameraSpeed: 1.5,
      masterVolume: 0.5,
      musicVolume: 0.5,
      sfxVolume: 0.5,
      language: "en",
      reduceMotion: true,
      keyBindings: { "ui.cancel": [{ key: "F9" }] },
    });
    expect(s.graphicsQuality).toBe("ultra");
    expect(s.uiScale).toBe(115);
    expect(s.reduceMotion).toBe(true);
    expect(s.keyBindings["ui.cancel"]).toEqual([{ key: "F9" }]);
  });

  it("falls back per-field on garbage, never throws", () => {
    const s = parseSettings({
      graphicsQuality: "potato",
      uiScale: "huge",
      cameraSpeed: NaN,
      masterVolume: 47,
      musicVolume: -3,
      language: "not a tag!",
      reduceMotion: "yes",
      keyBindings: { "ui.cancel": [{ key: "" }, { nope: 1 }, "x"] },
    });
    expect(s.graphicsQuality).toBe(DEFAULT_SETTINGS.graphicsQuality);
    expect(s.uiScale).toBe(DEFAULT_SETTINGS.uiScale);
    expect(s.cameraSpeed).toBe(DEFAULT_SETTINGS.cameraSpeed);
    expect(s.masterVolume).toBe(1); // clamped, not defaulted
    expect(s.musicVolume).toBe(0); // clamped, not defaulted
    expect(s.language).toBe("en");
    expect(s.reduceMotion).toBe(false);
    expect(s.keyBindings).toEqual({});
  });

  it("snaps uiScale to the nearest offered step", () => {
    expect(parseSettings({ uiScale: 112 }).uiScale).toBe(115);
    expect(parseSettings({ uiScale: 200 }).uiScale).toBe(150);
    expect(parseSettings({ uiScale: 60 }).uiScale).toBe(80);
    expect(parseSettings({ uiScale: 150 }).uiScale).toBe(150);
  });

  it("validates the task-17–23 accessibility fields", () => {
    const s = parseSettings({
      colorblindMode: "deuteranopia",
      highContrast: 1, // truthy but not boolean: strict false
      subtitleSize: "large",
      subtitleBackground: "solid",
      holdToggles: true,
    });
    expect(s.colorblindMode).toBe("deuteranopia");
    expect(s.highContrast).toBe(false);
    expect(s.subtitleSize).toBe("large");
    expect(s.subtitleBackground).toBe("solid");
    expect(s.holdToggles).toBe(true);
  });

  it("rejects unknown accessibility enum values", () => {
    const s = parseSettings({
      colorblindMode: "infrared",
      subtitleSize: "huge",
      subtitleBackground: "blur",
    });
    expect(s.colorblindMode).toBe("off");
    expect(s.subtitleSize).toBe("medium");
    expect(s.subtitleBackground).toBe("translucent");
  });

  it("validates the task-8/12 graphics and mouse fields", () => {
    const s = parseSettings({
      renderScale: 1.25,
      antialias: false,
      terrainDetail: "low",
      maxFps: 60,
      powerPreference: "high-performance",
      mouseSensitivity: 2,
      invertMouseX: true,
      invertMouseY: 1, // truthy but not boolean: strict false
      shadowQuality: "high",
      viewDistance: "ultra",
      autoQualityDone: 1, // truthy but not boolean: strict false
    });
    expect(s.renderScale).toBe(1.25);
    expect(s.antialias).toBe(false);
    expect(s.terrainDetail).toBe("low");
    expect(s.maxFps).toBe(60);
    expect(s.powerPreference).toBe("high-performance");
    expect(s.mouseSensitivity).toBe(2);
    expect(s.invertMouseX).toBe(true);
    expect(s.invertMouseY).toBe(false);
    expect(s.shadowQuality).toBe("high");
    expect(s.viewDistance).toBe("ultra");
    expect(s.autoQualityDone).toBe(false);
  });

  it("clamps and enum-falls-back the new fields on garbage", () => {
    const s = parseSettings({
      renderScale: 99,
      antialias: "no",
      terrainDetail: "ultra-hd",
      maxFps: 144,
      powerPreference: "nuclear",
      mouseSensitivity: -5,
    });
    expect(s.renderScale).toBe(2); // clamped, not defaulted
    expect(s.antialias).toBe(true);
    expect(s.terrainDetail).toBe(DEFAULT_SETTINGS.terrainDetail);
    expect(s.maxFps).toBe(DEFAULT_SETTINGS.maxFps);
    expect(s.powerPreference).toBe(DEFAULT_SETTINGS.powerPreference);
    expect(s.mouseSensitivity).toBe(0.25); // clamped to range floor
  });

  it("accepts undefined/null/strings as empty", () => {
    expect(parseSettings(undefined)).toEqual({ ...DEFAULT_SETTINGS });
    expect(parseSettings("nope")).toEqual({ ...DEFAULT_SETTINGS });
  });
});

describe("settings migration", () => {
  it("validates a current-version blob as-is", () => {
    const s = migrateSettings({ raw: { version: 1, uiScale: 90 }, readLegacy: () => null });
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(s.uiScale).toBe(90);
  });

  it("absorbs the legacy campaign.uiScale key exactly once", () => {
    const s = migrateSettings({
      raw: {},
      readLegacy: (k) => (k === "campaign.uiScale" ? "130" : null),
    });
    expect(s.uiScale).toBe(130);
  });

  it("prefers an explicit uiScale over the legacy key", () => {
    const s = migrateSettings({
      raw: { uiScale: 90 },
      readLegacy: (k) => (k === "campaign.uiScale" ? "130" : null),
    });
    expect(s.uiScale).toBe(90);
  });

  it("treats a future version as unknown and falls back to defaults", () => {
    const s = migrateSettings({ raw: { version: 99, uiScale: 90 }, readLegacy: () => null });
    expect(s).toEqual({ ...DEFAULT_SETTINGS });
  });

  it("defaults the v3 look fields on older blobs and keeps valid ones", () => {
    const fromV2 = migrateSettings({ raw: { version: 2, uiScale: 90 }, readLegacy: () => null });
    expect(fromV2.version).toBe(3);
    expect(fromV2.lookPreset).toBe("standard");
    expect(fromV2.grainIntensity).toBe(DEFAULT_SETTINGS.grainIntensity);
    const kept = migrateSettings({
      raw: { version: 3, lookPreset: "noir", grainIntensity: 0.9 },
      readLegacy: () => null,
    });
    expect(kept.lookPreset).toBe("noir");
    expect(kept.grainIntensity).toBe(0.9);
  });

  it("falls back to Standard and clamps grain on corrupt look fields", () => {
    const s = parseSettings({ lookPreset: "sepia-x", grainIntensity: 7 });
    expect(s.lookPreset).toBe("standard");
    expect(s.grainIntensity).toBe(1);
    const s2 = parseSettings({ lookPreset: null, grainIntensity: -2 });
    expect(s2.lookPreset).toBe("standard");
    expect(s2.grainIntensity).toBe(0);
  });
});

describe("settings store", () => {
  it("loads defaults from empty storage and persists on set", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    expect(store.get().graphicsQuality).toBe("high");
    store.set({ graphicsQuality: "low" });
    const raw = JSON.parse(storage.getItem("campaign.settings")!);
    expect(raw.graphicsQuality).toBe("low");
    expect(raw.version).toBe(SETTINGS_VERSION);
    // A second store over the same storage sees the persisted value.
    expect(createSettingsStore(storage).get().graphicsQuality).toBe("low");
  });

  it("set validates: invalid fields fall back instead of persisting garbage", () => {
    const storage = memStorage();
    const store = createSettingsStore(storage);
    store.set({ graphicsQuality: "potato" as never, uiScale: 112 });
    expect(store.get().graphicsQuality).toBe("high");
    expect(store.get().uiScale).toBe(115);
  });

  it("notifies subscribers synchronously with the new settings", () => {
    const store = createSettingsStore(memStorage());
    const seen: number[] = [];
    const off = store.subscribe((s) => seen.push(s.uiScale));
    store.set({ uiScale: 130 });
    store.set({ uiScale: 90 });
    off();
    store.set({ uiScale: 100 });
    expect(seen).toEqual([130, 90]);
  });

  it("reset restores defaults but keeps custom key bindings", () => {
    const store = createSettingsStore(memStorage());
    store.set({ graphicsQuality: "low", keyBindings: { "ui.cancel": [{ key: "F9" }] } });
    store.reset();
    expect(store.get().graphicsQuality).toBe("high");
    expect(store.get().keyBindings["ui.cancel"]).toEqual([{ key: "F9" }]);
  });

  it("survives a throwing storage backend", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const store = createSettingsStore(broken);
    expect(store.get().uiScale).toBe(100);
    expect(() => store.set({ uiScale: 130 })).not.toThrow();
    expect(store.get().uiScale).toBe(130);
  });

  it("recovers from a corrupt JSON blob", () => {
    const storage = memStorage({ "campaign.settings": "{not json" });
    const store = createSettingsStore(storage);
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS });
  });
});
