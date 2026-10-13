/**
 * Task 46: hit marker — an X that flashes at screen centre when one of the
 * player's blows lands.
 *
 * It fires only on strikes the player's side actually made (attackerTeam 0)
 * that did not kill: kills get the skull instead, so the two never double up
 * on the same blow. Purely visual, never a live region — a flash on every hit
 * would talk over the kill feed.
 */

import "./hitMarker.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource } from "../scene/combatEvents.js";

export interface HitMarker {
  root: HTMLElement;
  destroy(): void;
}

/** ms the X stays visible. Injected for tests. */
export const HIT_MARKER_MS = 180;

export function createHitMarker(
  source: CombatEventSource,
  opts: { showMs?: number; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): HitMarker {
  const showMs = opts.showMs ?? HIT_MARKER_MS;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  const root = h(
    "div",
    { class: "hud-hitmarker", "aria-hidden": "true" },
    h("span", { class: "hud-hitmarker__x" }, "✕"),
  );

  const unsubscribe = source.onStrike((e) => {
    if (e.attackerTeam !== 0 || e.killed) return;
    root.classList.add("hud-hitmarker--show");
    later(() => {
      root.classList.remove("hud-hitmarker--show");
    }, showMs);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
