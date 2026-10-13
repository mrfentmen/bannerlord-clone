/**
 * Task 31: kill feed — the last 5 kills, auto-fading.
 *
 * Every entry is a kill the combat bus actually reported: which side lost the
 * soldier and which side struck the blow. Entries fade out after a few seconds
 * and the list never holds more than five, so the feed is a glanceable recent
 * history, not a log. Feed text is a live region: a kill is exactly the kind
 * of event a screen-reader player needs announced.
 */

import "./killFeed.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource, KillEvent } from "../scene/combatEvents.js";

export interface KillFeed {
  root: HTMLElement;
  destroy(): void;
}

/** How many entries the feed keeps. */
export const KILL_FEED_MAX = 5;
/** ms before an entry starts fading. Injected for tests. */
export const KILL_FEED_FADE_MS = 6000;

export function createKillFeed(
  source: CombatEventSource,
  opts: { fadeMs?: number; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): KillFeed {
  const fadeMs = opts.fadeMs ?? KILL_FEED_FADE_MS;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  const list = h("ol", { class: "hud-killfeed", "aria-live": "polite", "aria-label": "Recent kills" });
  const root = h("div", { class: "hud-killfeed__wrap" }, list);

  function describeKill(e: KillEvent): { text: string; side: "player" | "enemy" } {
    // The feed is written from the victim's side: what the player lost is the
    // news, what the player killed is the triumph.
    if (e.victimTeam === 0) return { text: "Your soldier has fallen", side: "player" };
    return { text: "Enemy soldier down", side: "enemy" };
  }

  const timers = new Set<unknown>();
  const unsubscribe = source.onKill((e) => {
    const { text, side } = describeKill(e);
    const item = h(
      "li",
      { class: `hud-killfeed__item hud-killfeed__item--${side}` },
      h("span", { class: "hud-killfeed__glyph", "aria-hidden": "true" }, "⚔"),
      h("span", { class: "hud-killfeed__text" }, text),
    );
    list.prepend(item);
    while (list.children.length > KILL_FEED_MAX) list.lastChild?.remove();
    const slot: { id: unknown } = { id: null };
    slot.id = later(() => {
      timers.delete(slot.id);
      item.classList.add("hud-killfeed__item--fading");
    }, fadeMs);
    timers.add(slot.id);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
