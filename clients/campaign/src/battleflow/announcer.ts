/**
 * Screen-reader battle announcements (Rowan solo task 18).
 *
 * Battles are visual chaos; a screen-reader player needs the beats as text.
 * The announcer owns one polite live region and exposes the battle events
 * worth announcing: kills (batched — a rout is one line, not twenty),
 * objective changes, phase changes, and the battle result. The battle UI
 * calls these; nothing here touches the sim.
 */

import { liveRegion, announce } from "../ui/dom.js";

export interface BattleAnnouncer {
  /** The live region element — mount it once inside the battle UI. */
  readonly region: HTMLElement;
  /** A unit was killed/routed. Batched: frequent calls collapse into one line. */
  kill(unitLabel: string, friendly: boolean): void;
  /** A new objective, e.g. "Defend the ridge". Announced immediately. */
  objective(text: string): void;
  /** Phase change, e.g. "Enemy reinforcements arrive". Announced immediately. */
  phase(text: string): void;
  /** Battle result. Announced immediately. */
  result(text: string): void;
  /** Flush any pending batched kills (call on battle end). */
  flush(): void;
}

/** Kills within this window collapse into a single announcement. */
const KILL_BATCH_MS = 2500;

export function createBattleAnnouncer(now: () => number = Date.now): BattleAnnouncer {
  const region = liveRegion();
  region.setAttribute("data-testid", "battle-announcer");
  let pendingKills = 0;
  let pendingFriendly = 0;
  let batchStart = 0;

  const flushKills = (): void => {
    if (pendingKills === 0 && pendingFriendly === 0) return;
    const parts: string[] = [];
    if (pendingKills > 0) parts.push(`${pendingKills} ${pendingKills === 1 ? "enemy" : "enemies"} down`);
    if (pendingFriendly > 0) parts.push(`${pendingFriendly} ${pendingFriendly === 1 ? "ally" : "allies"} lost`);
    announce(region, parts.join(", ") + ".");
    pendingKills = 0;
    pendingFriendly = 0;
  };

  return {
    region,
    kill(_unitLabel, friendly) {
      const t = now();
      if (pendingKills + pendingFriendly === 0) batchStart = t;
      if (friendly) pendingFriendly++;
      else pendingKills++;
      if (t - batchStart >= KILL_BATCH_MS) flushKills();
    },
    objective(text) {
      flushKills();
      announce(region, `Objective: ${text}`);
    },
    phase(text) {
      flushKills();
      announce(region, text);
    },
    result(text) {
      flushKills();
      announce(region, `Battle over: ${text}`);
    },
    flush: flushKills,
  };
}

/** Mount helper: appends the announcer region to a battle UI root. */
export function mountAnnouncer(root: HTMLElement, announcer: BattleAnnouncer): void {
  root.appendChild(announcer.region);
}
