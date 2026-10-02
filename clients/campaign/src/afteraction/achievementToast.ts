/**
 * Task 91: achievement unlock toasts.
 *
 * A battle is when most achievements fall, and a toast is the only form that
 * reaches the player mid-flow: the report is a document they read, the toast is
 * something that catches the eye. `AchievementStore.record()` already returns
 * the definitions it unlocked, so this module presents those and decides
 * nothing — which achievement is earned, and when, belongs to the store.
 *
 * The toasts are a polite live region, so a screen reader hears an unlock as
 * well as seeing it. They dismiss themselves on a timer, and `destroy()` clears
 * those timers: a toast that fires after the report closed would be writing to
 * a detached node, and one that fires after a rematch would announce the old
 * battle over the new one.
 *
 * `src/ui/kit.ts` already has a generic string toast, which main.ts uses for
 * unlocks anywhere in the client. These are the after-action ones: they carry
 * the achievement's description, category and trophy points, which a single
 * string cannot, and they live on the report rather than in the global region.
 */

import { h } from "../ui/dom.js";
import { ACHIEVEMENT_CATEGORY_LABEL, type AchievementDef } from "../achievements/types.js";
import "./achievementToast.css";

/** How long an unlock toast stays up before it dismisses itself. */
export const ACHIEVEMENT_TOAST_MS = 6000;

export interface AchievementToastOptions {
  /** Definitions the store just unlocked — the return value of `record()`. */
  unlocked: readonly AchievementDef[];
  /** Override the dismissal timer, mostly for tests. */
  timeoutMs?: number;
}

export interface AchievementToasts {
  root: HTMLElement;
  /** The achievements shown, in the order they were passed. */
  shown(): AchievementDef[];
  destroy(): void;
}

/** One unlock, as the toast states it. */
function toastEl(def: AchievementDef): HTMLElement {
  const card = h("div", { class: "aa-ach-toast", "data-achievement-id": def.id });
  card.append(
    h("p", { class: "aa-ach-toast__title" }, `Achievement unlocked: ${def.title}`),
    h("p", { class: "aa-ach-toast__desc" }, def.description),
    h("p", { class: "aa-ach-toast__meta" }, `${ACHIEVEMENT_CATEGORY_LABEL[def.category]} · ${def.points} points`),
  );
  return card;
}

export function showAchievementToasts(opts: AchievementToastOptions): AchievementToasts {
  const defs = [...opts.unlocked];
  const root = h("div", { class: "aa-ach-toasts", "data-testid": "aa-ach-toasts", role: "status", "aria-live": "polite" });
  // Nothing earned, nothing said: an empty stack of toasts is just a container.
  root.hidden = defs.length === 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const timeoutMs = opts.timeoutMs ?? ACHIEVEMENT_TOAST_MS;
  for (const def of defs) {
    const card = toastEl(def);
    root.appendChild(card);
    timers.push(setTimeout(() => card.remove(), timeoutMs));
  }
  return {
    root,
    shown: () => defs,
    destroy() {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
      root.remove();
    },
  };
}