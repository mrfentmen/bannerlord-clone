/**
 * Full campaign reset (Rowan solo task 9).
 *
 * Removes every known campaign-state key from storage in one pass and
 * reports which keys were actually cleared, so the caller can confirm the
 * wipe landed. Deliberately NOT cleared:
 *
 * - `campaign.settings` — player preferences (graphics/audio), not campaign
 *   state. Wiping them on a campaign reset would be hostile.
 * - keybindings — same reason.
 * - IndexedDB saves (Pax's SaveManager) — zero-overlap lane boundary; the
 *   slot system has its own delete path.
 */

/** Every localStorage key that holds campaign state (no prefs, no saves). */
export const CAMPAIGN_STORAGE_KEYS: readonly string[] = [
  "fentmen.achievements.v1",
  "fentmen.battleSites.v1",
  "fentmen.chronicle.v1",
  "fentmen.clanLaws.v1",
  "fentmen.ironman.v1",
  "fentmen.leaderboards.v1",
  "fentmen.lifetimestats.v1",
  "fentmen.newgameplus.v1",
  "campaign.arena.v1",
  "campaign.daily.v1",
  "campaign.deployments.v1",
  "campaign.guidedStart.v1",
  "campaign.installPromptDismissed",
  "campaign.leaderboards.v1",
  "campaign.loadingTips.recent.v1",
  "campaign.memorial.v1",
  "campaign.purse.v1",
  "campaign.questTracker.collapsed.v1",
  "campaign.questTracker.pins.v1",
  "campaign.tournament.v1",
  "campaign.tradeRoutes.v1",
  "campaign.tutorialProgress.v1",
  "campaign.warstats.v1",
  "campaign.uiScale",
];

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Remove every known campaign-state key. Returns the keys that were
 * actually removed (i.e. present before the wipe), in registry order.
 */
export function resetCampaign(provided?: Storage): string[] {
  const storage = resolveStorage(provided);
  if (!storage) return [];
  const removed: string[] = [];
  for (const key of CAMPAIGN_STORAGE_KEYS) {
    try {
      if (storage.getItem(key) !== null) {
        storage.removeItem(key);
        removed.push(key);
      }
    } catch {
      // A hostile key must not abort the rest of the wipe.
    }
  }
  return removed;
}
