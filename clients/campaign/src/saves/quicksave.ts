/**
 * Quicksave (F5).
 *
 * The campaign client never had a one-key save: the autosave timer writes
 * every five minutes and the pause menu covers manual saves, but the moment
 * before a risky engagement had no fast path. `performQuicksave` is that
 * path — pure logic, no DOM, no keyboard. It writes the live snapshot into
 * the dedicated Quicksave slot through whatever store the caller hands it
 * (the app passes PAX's `SaveManager`, whose `saveSlot` accepts an explicit
 * id; tests pass a recording fake).
 *
 * Why a dedicated slot: overwriting the autosave on every F5 would conflate
 * "the game's crash insurance" with "the player's deliberate save". The
 * Quicksave slot is a named slot like any other — it shows up in Save / Load,
 * it can be deleted or exported, and ironman rules apply: manual saves are
 * off on ironman, so quicksave is refused there and the run keeps its
 * 5-minute autosave promise instead.
 *
 * Deliberately NOT included: quickload. Loading a snapshot back into the
 * running game does not exist yet (the Save / Load screen says so itself),
 * so an F9 would be a button that lies. Quicksave stands alone until the
 * data lane builds a real restore path.
 */

import type { SimSnapshot } from "../data/types.js";

/** Stable slot id. Same id every time, so F5 overwrites instead of piling up. */
export const QUICKSAVE_ID = "quicksave";
/** Player-facing slot name. */
export const QUICKSAVE_NAME = "Quicksave";

/**
 * The only store surface quicksave needs. `SaveManager` satisfies this
 * structurally; tests supply a recording fake.
 */
export interface QuicksaveStore {
  saveSlot(name: string, snapshot: SimSnapshot, id?: string): Promise<unknown>;
}

export interface QuicksaveDeps {
  /** PAX's `SaveManager` in the app; a recording fake in tests. */
  store: QuicksaveStore;
  /** The live campaign snapshot, or null before a campaign mounts. */
  currentSnapshot: () => SimSnapshot | null;
  /** True when manual saves are disallowed (ironman). */
  ironman: () => boolean;
}

export type QuicksaveOutcome =
  | { ok: true; day: number }
  | { ok: false; reason: "no-campaign" | "ironman" | "store-error" };

/**
 * Write the live snapshot to the Quicksave slot. Never throws: every failure
 * mode comes back as an outcome so the caller can say it in plain language.
 */
export async function performQuicksave(deps: QuicksaveDeps): Promise<QuicksaveOutcome> {
  const snap = deps.currentSnapshot();
  if (!snap) return { ok: false, reason: "no-campaign" };
  if (deps.ironman()) return { ok: false, reason: "ironman" };
  try {
    await deps.store.saveSlot(QUICKSAVE_NAME, snap, QUICKSAVE_ID);
    return { ok: true, day: snap.day };
  } catch {
    return { ok: false, reason: "store-error" };
  }
}
