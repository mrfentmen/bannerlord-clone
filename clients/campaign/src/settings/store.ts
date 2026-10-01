/**
 * The settings store: one versioned blob in localStorage, validated on the way in
 * and on the way out, with synchronous subscribers so changes apply live.
 *
 * Storage failures (private mode, disabled cookies) are swallowed on purpose: the
 * game keeps running with session-only settings, which is not worth interrupting
 * the player over.
 */

import {
  DEFAULT_SETTINGS,
  migrateSettings,
  parseSettings,
  type Settings,
} from "./schema.js";

export const SETTINGS_STORAGE_KEY = "campaign.settings";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SettingsStore {
  get(): Settings;
  /** Merge a patch, validate, persist, notify. Invalid fields fall back to defaults. */
  set(patch: Partial<Settings>): void;
  reset(): void;
  subscribe(fn: (s: Settings) => void): () => void;
}

function safeParse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createSettingsStore(storage: StorageLike): SettingsStore {
  const readLegacy = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  let current: Settings = migrateSettings({ raw: safeParse(readLegacy(SETTINGS_STORAGE_KEY)), readLegacy });
  const listeners = new Set<(s: Settings) => void>();

  const persist = (): void => {
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Session-only settings. Not worth interrupting the player.
    }
  };

  const notify = (): void => {
    for (const fn of listeners) fn(current);
  };

  return {
    get() {
      return current;
    },
    set(patch) {
      current = parseSettings({ ...current, ...patch, version: current.version });
      persist();
      notify();
    },
    reset() {
      // Keep custom key bindings across a settings reset: wiping a player's
      // muscle memory because they wanted default graphics would be hostile.
      const keyBindings = current.keyBindings;
      current = { ...DEFAULT_SETTINGS, keyBindings };
      persist();
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
