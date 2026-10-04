/**
 * Task 47: kill confirm — a skull that flashes when the player's side lands a
 * killing blow.
 *
 * The complement of the hit marker: non-lethal player strikes flash the X,
 * lethal ones flash the skull, so the player always knows which of their blows
 * ended the fight for someone. Enemy kills never confirm — the feed reports
 * those, and a skull for every casualty on both sides would read as noise.
 */

import "./killConfirm.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource } from "../scene/combatEvents.js";

export interface KillConfirm {
  root: HTMLElement;
  destroy(): void;
}

/** ms the skull stays visible. Injected for tests. */
export const KILL_CONFIRM_MS = 450;

export function createKillConfirm(
  source: CombatEventSource,
  opts: { showMs?: number; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): KillConfirm {
  const showMs = opts.showMs ?? KILL_CONFIRM_MS;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  const root = h(
    "div",
    { class: "hud-killconfirm", "aria-hidden": "true" },
    h("span", { class: "hud-killconfirm__skull" }, "💀"),
  );

  const unsubscribe = source.onKill((e) => {
    if (e.killerTeam !== 0) return;
    root.classList.add("hud-killconfirm--show");
    later(() => root.classList.remove("hud-killconfirm--show"), showMs);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
