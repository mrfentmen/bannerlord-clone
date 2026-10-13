/**
 * Save/load screens: the view models between the DOM and the server.
 *
 * The layering, strictly:
 *
 *   DOM (mount.ts) -> SaveScreens (this file) -> SaveServer (POST /v1/save,
 *   POST /v1/load) + SlotStore (IndexedDB, holding the save file verbatim)
 *
 * This module owns no storage and no transport. It owns the parts neither
 * should: what a slot is called, what a player is told when a name is unusable,
 * what the subtitle on a slot row reads, and — the one that matters most —
 * whether an outcome is a success the player should see or a failure the player
 * should be able to retry.
 *
 * What changed and why it was not optional: this used to sit on a store of
 * `SimSnapshot`s and hand a loaded snapshot back to the app. A snapshot is the
 * server's periodic inspection record for the client to draw; it cannot restore
 * a campaign. Loading one would have made the client draw a world that never
 * existed. Now saving asks the server for the real save file, storing it is
 * local bookkeeping, and loading posts those bytes back to the server, which is
 * the only party that can put a world back together.
 *
 * One consequence worth stating plainly, because it changes who is responsible
 * for what: `onLoad` is now an *after* hook, not the mechanism. The restore
 * happens on the server. A hook that throws is logged, not surfaced as a failed
 * load, because the campaign the player asked for is already running and telling
 * them it failed to load would be the lie. The app shell still needs to drop its
 * cached snapshot so the next tick repaints from the restored world, but that is
 * a repaint concern, not a restore one.
 */

import {
  AUTOSAVE_ID,
  IndexedDbSlotStore,
  slugifySlotId,
  type SlotStore,
  type SlotSummary,
  type StoredSlot,
} from "./slots.js";
import { saveFileProblem, SaveServer, SaveServerError } from "./server.js";
import type { SimSnapshot } from "../data/types.js";

export interface SaveScreenDeps {
  /** The campaign server. Defaults to a live one pointed at the configured API. */
  server?: SaveServer;
  /** Where slots are kept. Defaults to IndexedDB. */
  store?: SlotStore;
  /** The live snapshot, read for the day a new slot is labelled with. */
  currentSnapshot: () => SimSnapshot;
  /**
   * Called after the server has restored the campaign.
   *
   * Advisory. Use it to drop cached state so the next tick repaints. A throw
   * here is logged and does not turn a successful load into a reported failure.
   */
  onLoad?: (snapshot: SimSnapshot) => void | Promise<void>;
}

/** One row in the slot list. */
export interface SlotCard {
  id: string;
  name: string;
  day: number;
  updatedAt: string;
  createdAt: string;
  isAutosave: boolean;
  bytes: number;
  /** "Day 42 · Oct 1, 2026, 3:04 PM" — ready to render. */
  subtitle: string;
}

/** Player-facing failure. `playerMessage` is safe to show on screen. */
export class SaveUiError extends Error {
  readonly playerMessage: string;
  /** True when trying the same thing again could plausibly work. */
  readonly retryable: boolean;

  constructor(playerMessage: string, detail?: string, retryable = false) {
    super(detail ?? playerMessage);
    this.name = "SaveUiError";
    this.playerMessage = playerMessage;
    this.retryable = retryable;
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

function toCard(slot: StoredSlot, isAutosave: boolean): SlotCard {
  return {
    id: slot.id,
    name: slot.name,
    day: slot.day,
    updatedAt: slot.updatedAt,
    createdAt: slot.createdAt,
    isAutosave,
    bytes: slot.payload.length,
    subtitle: subtitleFor(slot.day, slot.updatedAt),
  };
}

export class SaveScreens {
  readonly #deps: SaveScreenDeps;
  readonly #server: SaveServer;
  readonly #store: SlotStore;

  constructor(deps: SaveScreenDeps) {
    this.#deps = deps;
    this.#server = deps.server ?? new SaveServer();
    this.#store = deps.store ?? defaultStore();
  }

  /** The campaign server, for a panel that wants to name it in an error. */
  get server(): SaveServer {
    return this.#server;
  }

  /**
   * The whole screen: named slots newest-first, plus the autosave card
   * (or null when no autosave exists yet).
   *
   * A broken autosave must not hide the player's own slots, so the two halves
   * are read independently and only the autosave is allowed to fail quietly.
   */
  async overview(): Promise<{ named: SlotCard[]; autosave: SlotCard | null }> {
    let named: SlotSummary[];
    try {
      named = await this.#store.list();
    } catch (err) {
      throw new SaveUiError(
        "The save list could not be read.",
        `store.list threw: ${String(err)}`,
        true,
      );
    }
    let autosave: StoredSlot | null = null;
    try {
      autosave = await this.#store.read(AUTOSAVE_ID);
    } catch (err) {
      console.warn(`[campaign-client] the autosave slot could not be read: ${String(err)}`);
      autosave = null;
    }
    return {
      named: named.map((summary) => ({
        id: summary.id,
        name: summary.name,
        day: summary.day,
        updatedAt: summary.updatedAt,
        createdAt: summary.createdAt,
        isAutosave: false,
        bytes: summary.bytes,
        subtitle: subtitleFor(summary.day, summary.updatedAt),
      })),
      autosave: autosave ? toCard(autosave, true) : null,
    };
  }

  /**
   * Ask the server to write the campaign out, then keep the file under a name
   * the player chose.
   *
   * The name is validated before the request, not after: a blank name is a
   * mistake the panel can catch without spending a round trip on a save the
   * player is going to be told is unnamed.
   *
   * A name that slugifies to an existing slot id overwrites that slot. That is
   * the store's rule and it is the same rule the old screen had, so the warning
   * belongs to the panel rather than to this layer.
   */
  async save(name: string): Promise<SlotCard> {
    const clean = name.trim();
    if (!clean) {
      throw new SaveUiError("Give the save a name first.");
    }
    if (clean.length > MAX_NAME_LENGTH) {
      throw new SaveUiError(`Keep the name under ${MAX_NAME_LENGTH} characters.`);
    }

    const file = await this.#writeToServer("save");
    return this.#storeSlot(clean, slugifySlotId(clean), file.payload, false);
  }

  /**
   * The autosave: a save under a reserved id and a fixed name.
   *
   * Exposed because the game's own autosave timer needs it, and because F5 and
   * the timer writing to two different places is how a player ends up with an
   * autosave from one world and a quicksave from another.
   */
  async autosave(): Promise<SlotCard> {
    const file = await this.#writeToServer("save");
    return this.#storeSlot("Autosave", AUTOSAVE_ID, file.payload, true);
  }

  /** Write the named Quicksave slot. Same path as every other save. */
  async quicksave(name = "Quicksave"): Promise<SlotCard> {
    const file = await this.#writeToServer("save");
    return this.#storeSlot(name, slugifySlotId(name), file.payload, false);
  }

  /**
   * Load a slot: read the stored save file, post it to `POST /v1/load`, then
   * let the app repaint.
   *
   * The day the server answers with replaces the day on the card, because the
   * server is the authority on what day it is now — the client's cached day is
   * whatever the last tick happened to say.
   */
  async load(id: string): Promise<SlotCard> {
    const slot = await this.#readSlot(id);
    const outcome = await this.#send(() => this.#server.load(slot.payload), "load");
    await this.#afterRestore();
    return { ...toCard(slot, id === AUTOSAVE_ID), day: outcome.day, subtitle: subtitleFor(outcome.day, slot.updatedAt) };
  }

  /** Delete a named slot. The autosave refuses (the store's rule). */
  async remove(id: string): Promise<void> {
    if (id === AUTOSAVE_ID) {
      throw new SaveUiError("The autosave cannot be deleted.");
    }
    try {
      await this.#store.remove(id);
    } catch (err) {
      throw new SaveUiError("That save could not be deleted.", `store.remove threw: ${String(err)}`, true);
    }
  }

  /**
   * Download a slot's save file.
   *
   * The file goes out exactly as the server wrote it — same format marker,
   * same version — so it is something `POST /v1/load` will accept, and an
   * import on another machine restores the same campaign.
   */
  async exportSave(id: string): Promise<void> {
    const slot = await this.#readSlot(id);
    try {
      downloadText(slot.payload, `${exportFileName(slot.name)}`);
    } catch (err) {
      throw new SaveUiError(
        "That save could not be exported.",
        `downloadText threw: ${String(err)}`,
        true,
      );
    }
  }

  /**
   * Import a previously exported save file. Returns the card of the slot it
   * landed in. An invalid file fails with a readable message and writes nothing.
   */
  async importSave(file: File): Promise<SlotCard> {
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      throw new SaveUiError("That file could not be read.", `file.text threw: ${String(err)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new SaveUiError("That file is not readable JSON, so nothing was imported.");
    }
    const problem = saveFileProblem(parsed);
    if (problem) {
      // The reason is developer-readable, so it goes to the console; the player
      // gets the sentence and the file is left alone.
      console.error(`[campaign-client] imported save file failed validation: ${problem}`);
      throw new SaveUiError(
        "That is not a save file from this game, so nothing was imported.",
      );
    }

    const day = dayFromSaveFile(parsed);
    const name = importedName(file.name);
    const payload = await this.#storeSlot(name, importedId(name), text, false);
    return { ...payload, day: payload.day === 0 ? day : payload.day };
  }

  // -- internals -------------------------------------------------------------

  /** One server round trip, with every failure turned into a `SaveUiError`. */
  async #writeToServer(what: "save"): Promise<{ payload: string }> {
    return this.#send(() => this.#server.save(), what);
  }

  async #send<T>(call: () => Promise<T>, what: "save" | "load"): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof SaveServerError) {
        // The sentence comes from the transport, where the endpoint's own
        // reason is known, and is already written for a player.
        if (err.developerDetail) console.error(`[campaign-client] ${what} failed: ${err.developerDetail}`);
        throw new SaveUiError(err.playerMessage, err.developerDetail, err.retryable);
      }
      throw new SaveUiError(
        `The campaign could not be ${what === "save" ? "saved" : "loaded"}. The game itself is untouched.`,
        `${what} threw something that was not a SaveServerError: ${String(err)}`,
        true,
      );
    }
  }

  /** Put a freshly written save file into a slot. */
  async #storeSlot(name: string, id: string, payload: string, isAutosave: boolean): Promise<SlotCard> {
    const day = this.#currentDay();
    try {
      const record = await this.#store.write({ id, name, day, payload });
      return toCard(record, isAutosave);
    } catch (err) {
      throw new SaveUiError(
        "The campaign was written out but this browser would not keep the file, so nothing was saved.",
        `store.write threw: ${String(err)}`,
        true,
      );
    }
  }

  async #readSlot(id: string): Promise<StoredSlot> {
    let slot: StoredSlot | null;
    try {
      slot = await this.#store.read(id);
    } catch (err) {
      throw new SaveUiError("That save could not be read.", `store.read threw: ${String(err)}`, true);
    }
    if (!slot) {
      throw new SaveUiError("That save is gone. It may have been deleted.");
    }
    return slot;
  }

  /**
   * The day to label a new slot with.
   *
   * Read from the client's snapshot because that is the day the player was just
   * looking at. A failure here is not worth blocking a save over — the save
   * file itself is what matters, and the server has the real tick — so the day
   * falls back to zero and the subtitle says Day 0 rather than the save failing.
   */
  #currentDay(): number {
    try {
      const day = this.#deps.currentSnapshot().day;
      return typeof day === "number" && Number.isFinite(day) ? day : 0;
    } catch (err) {
      console.warn(`[campaign-client] could not read the campaign day for the slot label: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Tell the app the world was restored.
   *
   * The restore already happened on the server, so a throwing hook is logged
   * and swallowed: the player's campaign is the one they asked for and calling
   * that a failed load would be the worse lie.
   */
  async #afterRestore(): Promise<void> {
    if (!this.#deps.onLoad) return;
    let snapshot: SimSnapshot;
    try {
      snapshot = this.#deps.currentSnapshot();
    } catch (err) {
      console.warn(`[campaign-client] no snapshot to hand the restore hook: ${String(err)}`);
      return;
    }
    try {
      await this.#deps.onLoad(snapshot);
    } catch (err) {
      console.error(
        `[campaign-client] the campaign was restored on the server but the restore hook threw: ${String(err)}`,
      );
    }
  }
}

/**
 * One store for the session.
 *
 * `IndexedDbSlotStore` caches its open database per instance, so a new
 * instance per panel open would queue another `indexedDB.open` behind the
 * first. Sharing one keeps the slot list and a save racing for the same
 * connection instead of racing to open it.
 */
let sessionStore: SlotStore | null = null;
function defaultStore(): SlotStore {
  if (!sessionStore) sessionStore = new IndexedDbSlotStore();
  return sessionStore;
}

/** Replace the session store. Tests use this; the game never calls it. */
export function setDefaultSlotStore(store: SlotStore | null): void {
  sessionStore = store;
}

/** The in-game day inside a save file, or 0 when the client cannot read it. */
function dayFromSaveFile(parsed: unknown): number {
  const campaign = (parsed as { campaign?: { ticksRun?: unknown } }).campaign;
  const ticks = campaign?.ticksRun;
  return typeof ticks === "number" && Number.isFinite(ticks) ? ticks : 0;
}

/**
 * The slot name an imported file lands under.
 *
 * The double extension is stripped whole. `exportFileName` writes
 * `name.mbclone-save.json`, and stripping only the last segment leaves
 * "Cincinnati before the flood.mbclone-save" sitting on the player's save list,
 * which is a filename masquerading as a name.
 */
function importedName(fileName: string): string {
  let base = fileName.trim();
  for (const suffix of [".mbclone-save.json", ".bcsave.json", ".json"]) {
    if (base.toLowerCase().endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base.trim() || "Imported save";
}

/**
 * The id an imported file lands under.
 *
 * A fresh id rather than the name's slug, so importing a friend's campaign
 * beside your own of the same name keeps both. The name still shows on the row,
 * which is what the player is reading.
 */
let importCounter = 0;
function importedId(name: string): string {
  importCounter += 1;
  return `${slugifySlotId(name)}-import-${importCounter}`;
}

/** `Cincinnati before the flood` -> `cincinnati-before-the-flood.mbclone-save.json`. */
export function exportFileName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "campaign";
  return `${slug}.mbclone-save.json`;
}

/** Hand a string to the player as a file download. */
function downloadText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { AUTOSAVE_ID, SaveServer, SaveServerError };
export type { SlotStore, SlotSummary, StoredSlot };