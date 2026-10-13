/**
 * Locked categorical palette for trade goods (MASTER_PLAN task 102).
 *
 * These are data colours for the campaign-map route layer — one hue per good,
 * chosen for separation on the dark map — not theme colours, so they live in
 * their own palette file like the faction palettes (design/factions.ts) and
 * the heraldic palette (clan/bannerPalette.ts), and are allowlisted in the
 * design-system test alongside them.
 */

import type { GoodId } from "../data/types.js";

export const GOOD_COLORS: Record<GoodId, string> = {
  grain: "#d9a441",
  medicine: "#e2e2e2",
  metal: "#9aa3ad",
  fuel: "#c96a2b",
  arms: "#d64545",
  textiles: "#7f6fd1",
  tools: "#4fa3a5",
  lumber: "#7a5c3e",
  beer: "#e8b93c",
  cloth: "#b48ce0",
  leather: "#8a5a2b",
};

/** Fallback for goods the palette does not know yet: parchment. */
export const UNKNOWN_GOOD_COLOR = "#cbb98a";

export function goodColor(goodId: string): string {
  return (GOOD_COLORS as Record<string, string>)[goodId] ?? UNKNOWN_GOOD_COLOR;
}
