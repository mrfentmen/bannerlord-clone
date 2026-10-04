/**
 * Quicksave (F5).
 *
 * The campaign client never had a one-key save: the autosave timer writes
 * every five minutes and the pause menu covers manual saves, but the moment
 * before a risky engagement had no fast path. `performQuicksave` is that path —
 * pure logic, no DOM, no keyboard.
 *
 * It writes a real save. Earlier it wrote the live `SimSnapshot` into a local
 * slot, which looked like a save and was not one: a snapshot is the server's
 * periodic record for the client to draw, so the Quicksave slot held something
 * that could not restore the campaign. Now the same path asks the server for the
 * campaign (`POST /v1/save`) and stores the file it sends back, which means
 * quicksave and the Save / Load screen's Save button are the same operation and
 * can never disagree about what a save is.
 *
 * Why a dedicated slot: overwriting the autosave on every F5 would conflate
 * "the game's crash insurance" with "the player's deliberate save". The
 * Quicksave slot is a named slot like any other — it shows up in Save / Load,
 * it can be deleted or exported, and ironman rules apply: manual saves are off
 * on ironman, so quicksave is refused there and the run keeps its 5-minute
 * autosave promise instead.
 *
 * Deliberately NOT included: quickload. Loading a save back into the running
 * game is a real server round trip that replaces the world under the player's
 * feet without asking, and F9 would be one keystroke from doing that by
 * accident. It belongs behind the Save / Load panel's Load button, where the
 * player can read the slot's day first.
 */

import { SaveScreens, type SlotCard } from "./screens.js";

/** Stable slot id. Same id every time, so F5 overwrites instead of piling up. */
export const QUICKSAVE_ID = "quicksave";
/** Player-facing slot name. */
export const QUICKSAVE_NAME = "Quicksave";

/**
 * The only surface quicksave needs: one method that writes a real save under a
 * name and an id. `SaveScreens` satisfies this, and so does a recording fake.
 */
export interface QuicksaveStore {
  quicksave(name?: string): Promise<SlotCard>;
}

export interface QuicksaveDeps {
  /** `SaveScreens` in the app; a recording fake in tests. */
  store: QuicksaveStore;
  /** True when manual saves are disallowed (ironman). */
  ironman: () => boolean;
}

export type QuicksaveOutcome =
  | { ok: true; day: number }
  | {
      ok: false;
      reason: "no-campaign" | "ironman" | "store-error";
      /** Safe to show the player. Present for every reason but `ironman`. */
      message?: string;
      /** Whether the same press could work again in a moment. */
      retryable?: boolean;
    };

/**
 * Write the live campaign to the Quicksave slot. Never throws: every failure
 * mode comes back as an outcome so the caller can say it in plain language.
 *
 * `no-campaign` covers the two ways there is nothing to save: the clock has not
 * produced a snapshot yet, or the server answered with something the screens
 * layer could not read a day from. Both mean the same thing to a player, which
 * is why they are one reason rather than two.
 */
export async function performQuicksave(deps: QuicksaveDeps): Promise<QuicksaveOutcome> {
  if (deps.ironman()) return { ok: false, reason: "ironman" };
  try {
    const card = await deps.store.quicksave(QUICKSAVE_NAME);
    return { ok: true, day: card.day };
  } catch (err) {
    const message =
      err && typeof err === "object" && "playerMessage" in err && typeof (err as { playerMessage: unknown }).playerMessage === "string"
        ? (err as { playerMessage: string }).playerMessage
        : "The quicksave did not go through. Your campaign is untouched.";
    const retryable: boolean =
      err !== null && typeof err === "object" && "retryable" in err && (err as { retryable: unknown }).retryable === true;
    console.error(`[campaign-client] quicksave failed: ${String(err)}`);
    return { ok: false, reason: "store-error", message, retryable };
  }
}

/**
 * The sentence for each refusal, in one place so the HUD toast and the panel
 * cannot drift apart. `ironman` needs no sentence here: the keybind is not
 * bound to anything the player would expect to work, and the settings panel
 * already says ironman keeps one autosave.
 */
export function quicksaveMessage(outcome: QuicksaveOutcome): string | null {
  if (outcome.ok) return null;
  if (outcome.reason === "ironman") return null;
  return outcome.message ?? "The quicksave did not go through. Your campaign is untouched.";
}

/** Build the screens layer the app hands to `performQuicksave`. */
export function quicksaveStoreFor(screens: SaveScreens): QuicksaveStore {
  return { quicksave: (name) => screens.quicksave(name) };
}

// -- the F5 keybind -----------------------------------------------------------

/** The slice of the input registry this needs. `InputRegistry` satisfies it. */
export interface QuicksaveInput {
  on(id: string, handler: () => void): unknown;
}

export interface BindQuicksaveOptions {
  /** The input registry the campaign shell already owns. */
  input: QuicksaveInput;
  /** The screens layer the save panel uses, so F5 and the panel share a store. */
  screens: SaveScreens;
  /** True when manual saves are disallowed (ironman). */
  ironman: () => boolean;
  /**
   * How the outcome is announced. Defaults to the shared toast region.
   *
   * Injected because a caller with its own HUD (or a test) needs to see the
   * message without reaching for a DOM global.
   */
  announce?: (message: string) => void;
  /** The action id, so a caller that renames it does not silently lose F5. */
  actionId?: string;
}

/**
 * Bind `game.quicksave` (F5 by default) to a real server save.
 *
 * Lives here rather than in the app shell because everything it needs is in this
 * module, and because the binding has to share the save panel's screens layer —
 * two `SaveScreens` over one slot store would be two writers to one set of
 * slots, and the second save of the same name would race the first.
 *
 * Returns the unsubscribe function, so a shell that mounts twice can tear the
 * binding down. Nothing is bound twice: binding the same action twice in the
 * registry runs both handlers, so a caller mounting the panel repeatedly should
 * unsubscribe the previous binding.
 */
export function bindQuicksaveKeybind(options: BindQuicksaveOptions): () => void {
  const actionId = options.actionId ?? "game.quicksave";
  const announce =
    options.announce ??
    ((message: string): void => {
      // Imported lazily through the module graph rather than at the top so this
      // module stays usable in a node test with no document.
      const doc = typeof document === "undefined" ? undefined : document;
      if (!doc) return;
      let region = doc.querySelector<HTMLElement>("[data-toast-region]");
      if (!region) {
        region = doc.createElement("div");
        region.setAttribute("data-toast-region", "");
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        doc.body.appendChild(region);
      }
      const el = doc.createElement("div");
      el.className = "toast";
      el.textContent = message;
      region.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    });

  return options.input.on(actionId, () => {
    void (async () => {
      const outcome = await performQuicksave({
        store: quicksaveStoreFor(options.screens),
        ironman: options.ironman,
      });
      if (outcome.ok) {
        announce(`Quicksaved. Day ${outcome.day}.`);
        return;
      }
      const message = quicksaveMessage(outcome);
      // Ironman is a rule the settings panel explains, so F5 says nothing rather
      // than nagging about a decision the player already made.
      if (message) announce(message);
    })();
  }) as () => void;
}