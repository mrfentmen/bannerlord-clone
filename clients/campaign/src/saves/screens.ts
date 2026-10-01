/**
 * Save/load screens, built on PAX's `SaveManager` (`../data/saves.ts`).
 *
 * This module is the UI layer only: it owns no storage. All persistence
 * goes through PAX's manager (IndexedDB, named slots, autosave,
 * export/import) exactly as he built it. The app wires two callbacks:
 * `currentSnapshot` supplies the live snapshot when the player hits
 * save, and `onLoad` applies a loaded snapshot back to the running game.
 *
 * Screens covered:
 * - Slot list: named slots newest-first plus the autosave banner.
 * - Save: name the slot, write it.
 * - Load: restore a slot's snapshot into the game.
 * - Delete: remove a named slot (the autosave cannot be deleted).
 * - Export: download a slot as a `.bcsave.json` file.
 * - Import: restore a slot from an exported file.
 */

import {
  AUTOSAVE_ID,
  SaveManager,
  type SaveMetadata,
} from "../data/saves.js";
import type { SimSnapshot } from "../data/types.js";

export interface SaveScreenDeps {
  /** PAX's save manager. Tests construct their own. */
  manager: SaveManager;
  /** The live snapshot to store when the player hits save. */
  currentSnapshot: () => SimSnapshot;
  /**
   * Apply a loaded snapshot to the running game. Implemented by the app;
   * this module never touches game state itself.
   */
  onLoad: (snapshot: SimSnapshot) => void | Promise<void>;
}

/** One row in the slot list. */
export interface SlotCard {
  id: string;
  name: string;
  day: number;
  updatedAt: string;
  createdAt: string;
  isAutosave: boolean;
  /** "Day 42 · Oct 1, 2026, 3:04 PM" — ready to render. */
  subtitle: string;
}

/** Player-facing failure. `playerMessage` is safe to show on screen. */
export class SaveUiError extends Error {
  readonly playerMessage: string;

  constructor(playerMessage: string, detail?: string) {
    super(detail ?? playerMessage);
    this.name = "SaveUiError";
    this.playerMessage = playerMessage;
  }
}

const MAX_NAME_LENGTH = 60;

function subtitleFor(day: number, updatedAt: string): string {
  const when = updatedAt ? ` · ${formatWhen(updatedAt)}` : "";
  return `Day ${day}${when}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toCard(meta: SaveMetadata, isAutosave: boolean): SlotCard {
  return {
    id: meta.id,
    name: meta.name,
    day: meta.day,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
    isAutosave,
    subtitle: subtitleFor(meta.day, meta.updatedAt),
  };
}

export class SaveScreens {
  readonly #deps: SaveScreenDeps;

  constructor(deps: SaveScreenDeps) {
    this.#deps = deps;
  }

  /**
   * The whole screen: named slots newest-first, plus the autosave card
   * (or null when no autosave exists yet).
   */
  async overview(): Promise<{ named: SlotCard[]; autosave: SlotCard | null }> {
    const { manager } = this.#deps;
    let named: SlotCard[];
    try {
      named = (await manager.listSlots()).map((m) => toCard(m, false));
    } catch (err) {
      throw new SaveUiError(
        "The save list could not be read.",
        `listSlots threw: ${String(err)}`
      );
    }
    let autosave: SlotCard | null = null;
    try {
      const snapshot = await manager.loadAutosave();
      if (snapshot) {
        autosave = {
          id: AUTOSAVE_ID,
          name: "Autosave",
          day: snapshot.day,
          updatedAt: "",
          createdAt: "",
          isAutosave: true,
          subtitle: subtitleFor(snapshot.day, ""),
        };
      }
    } catch {
      // A broken autosave must not hide the named slots.
      autosave = null;
    }
    return { named, autosave };
  }

  /**
   * Save the current snapshot under a player-chosen name. A name that
   * slugifies to an existing slot id overwrites that slot (the
   * manager's rule, surfaced here so the UI can warn).
   */
  async save(name: string): Promise<SlotCard> {
    const clean = name.trim();
    if (!clean) {
      throw new SaveUiError("Give the save a name first.");
    }
    if (clean.length > MAX_NAME_LENGTH) {
      throw new SaveUiError(
        `Keep the name under ${MAX_NAME_LENGTH} characters.`
      );
    }
    const { manager, currentSnapshot } = this.#deps;
    let snapshot: SimSnapshot;
    try {
      snapshot = currentSnapshot();
    } catch (err) {
      throw new SaveUiError(
        "The game state could not be read for saving.",
        `currentSnapshot threw: ${String(err)}`
      );
    }
    try {
      const slot = await manager.saveSlot(clean, snapshot);
      return toCard(
        {
          id: slot.id,
          name: slot.name,
          createdAt: slot.createdAt,
          updatedAt: slot.updatedAt,
          day: slot.day,
        },
        false
      );
    } catch (err) {
      throw new SaveUiError(
        "The save did not go through.",
        `saveSlot threw: ${String(err)}`
      );
    }
  }

  /** Load a slot's snapshot and hand it to the app. */
  async load(id: string): Promise<void> {
    const { manager, onLoad } = this.#deps;
    let snapshot: SimSnapshot | null;
    try {
      snapshot = await manager.loadSlot(id);
    } catch (err) {
      throw new SaveUiError(
        "That save could not be read.",
        `loadSlot threw: ${String(err)}`
      );
    }
    if (!snapshot) {
      throw new SaveUiError("That save is gone. It may have been deleted.");
    }
    try {
      await onLoad(snapshot);
    } catch (err) {
      throw new SaveUiError(
        "The save loaded, but the game could not take it.",
        `onLoad threw: ${String(err)}`
      );
    }
  }

  /** Delete a named slot. The autosave refuses (the manager's rule). */
  async remove(id: string): Promise<void> {
    if (id === AUTOSAVE_ID) {
      throw new SaveUiError("The autosave cannot be deleted.");
    }
    try {
      await this.#deps.manager.deleteSlot(id);
    } catch (err) {
      throw new SaveUiError(
        "That save could not be deleted.",
        `deleteSlot threw: ${String(err)}`
      );
    }
  }

  /** Download a slot as a `.bcsave.json` file. */
  async exportSave(id: string): Promise<void> {
    try {
      await this.#deps.manager.exportSlot(id);
    } catch (err) {
      if (err instanceof SaveUiError) throw err;
      throw new SaveUiError(
        "That save could not be exported.",
        `exportSlot threw: ${String(err)}`
      );
    }
  }

  /**
   * Import a previously exported file. Returns the card of the slot it
   * landed in. Invalid files fail with a readable message, and nothing
   * is written.
   */
  async importSave(file: File): Promise<SlotCard> {
    try {
      const slot = await this.#deps.manager.importSlot(file);
      return toCard(
        {
          id: slot.id,
          name: slot.name,
          createdAt: slot.createdAt,
          updatedAt: slot.updatedAt,
          day: slot.day,
        },
        false
      );
    } catch (err) {
      if (err instanceof SaveUiError) throw err;
      const message =
        err instanceof Error ? err.message : "The file could not be read.";
      // The manager's import errors are already player-readable.
      throw new SaveUiError(message, `importSlot threw: ${String(err)}`);
    }
  }
}

export { AUTOSAVE_ID, SaveManager };
