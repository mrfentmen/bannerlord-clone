/**
 * Task 84: companion loyalty. Tracked 0..100; below 30 the panel raises
 * warnings, below 15 it emits desertion-risk events. Influence actions
 * (gift, praise, reprimand) move loyalty with diminishing returns at the
 * extremes. Events are data — the campaign layer decides what to do with a
 * desertion.
 */

import type { Companion } from "./types.js";

export const LOYALTY_WARNING = 30;
export const LOYALTY_CRITICAL = 15;

export interface LoyaltyEvent {
  companionId: string;
  level: "warning" | "critical";
  text: string;
}

export type InfluenceAction = "gift" | "praise" | "reprimand";

const ACTION_DELTA: Record<InfluenceAction, number> = {
  gift: 8,
  praise: 4,
  reprimand: -10,
};

export function influenceLoyalty(companion: Companion, action: InfluenceAction): Companion {
  const delta = ACTION_DELTA[action];
  // Diminishing returns near the caps.
  const scaled = companion.loyalty > 80 && delta > 0 ? delta / 2 : delta;
  return { ...companion, loyalty: Math.min(100, Math.max(0, companion.loyalty + scaled)) };
}

/** Current warnings/events for one companion. Empty when loyalty is healthy. */
export function loyaltyAlerts(companion: Companion): LoyaltyEvent[] {
  if (companion.loyalty >= LOYALTY_WARNING) return [];
  if (companion.loyalty < LOYALTY_CRITICAL) {
    return [
      {
        companionId: companion.id,
        level: "critical",
        text: `${companion.name} is about to desert. Act now or lose them.`,
      },
    ];
  }
  return [
    {
      companionId: companion.id,
      level: "warning",
      text: `${companion.name}'s loyalty is slipping (${Math.round(companion.loyalty)}). Consider a gift or praise.`,
    },
  ];
}
