/**
 * Settings entry point.
 *
 * `settings` is the app's one settings store. Panels and scenes read it and
 * subscribe to it; it persists to localStorage. Outside the browser (node tests)
 * it falls back to an in-memory backend so importing it never throws.
 */

import { createSettingsStore, type SettingsStore, type StorageLike } from "./store.js";

function appStorage(): StorageLike {
  try {
    if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  } catch {
    // Storage access itself threw (blocked cookies in some browsers surface here).
  }
  const map = new Map<string, string>();
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

export const settings: SettingsStore = createSettingsStore(appStorage());

export * from "./schema.js";
export * from "./store.js";
