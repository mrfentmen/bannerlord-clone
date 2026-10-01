/**
 * Task 49: the kill feed. Notable (hero) kills scroll by; the newest is on
 * top. A kill renders synchronously when the event arrives, so it is always
 * visible well inside the 1s accept window. Capped at 20 rows — older rows
 * are removed from the DOM, not hidden.
 */

import { h } from "../ui/dom.js";
import type { FeedbackSource, HeroKill, Unsubscribe } from "./types.js";

const MAX_ROWS = 20;

export interface KillFeed {
  root: HTMLElement;
  destroy(): void;
}

function rowText(k: HeroKill): string {
  const killer = k.killerSide === "ally" ? "▲" : "▼";
  const victim = k.victimSide === "ally" ? "▲" : "▼";
  return `${killer} ${k.killerName}  ⚔  ${victim} ${k.victimName}`;
}

export function createKillFeed(source: FeedbackSource): KillFeed {
  const list = h("ol", { class: "fb-killfeed", "data-testid": "fb-killfeed" });
  const unsubs: Unsubscribe[] = [source.onHeroKill(onKill)];

  function onKill(k: HeroKill): void {
    const li = h("li", { class: `fb-killfeed-row is-${k.killerSide}` });
    li.textContent = rowText(k);
    list.prepend(li);
    while (list.children.length > MAX_ROWS) list.lastElementChild?.remove();
  }

  return {
    root: list,
    destroy() {
      for (const u of unsubs) u();
      list.remove();
    },
  };
}
