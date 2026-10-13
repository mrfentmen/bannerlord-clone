/**
 * Per-campaign store isolation (Rowan).
 *
 * The campaign client keeps several localStorage-backed stores that belong
 * to ONE campaign: the chronicle of deeds, the battle-site heatmap, the war
 * memorial, clan laws, pinned quests, and the caravan trade-route books.
 * Quit-to-title reloads the page, which clears module state — but
 * localStorage survives, so the next campaign silently inherits the
 * previous campaign's history: old deeds in the chronicle, old battle
 * sites on the heatmap, a predecessor's laws on the throne.
 *
 * This module owns the reset decision. The fingerprint identifies the
 * mounted campaign from the snapshot itself (the sim issues no campaign
 * id): a fingerprint matching the last mount means the same campaign
 * resumed and its stores are kept; a different fingerprint means a new
 * campaign and the per-campaign keys are cleared. Clearing is best-effort
 * per key — blocked or full storage degrades to a session-only reset of
 * the in-memory stores, never a crash.
 *
 * Deliberately NOT reset: lifetime statistics, local leaderboards, and
 * achievements are the player's across campaigns; settings, install-prompt
 * dismissal, loading-tip rotation, deployment presets, quest-tracker UI
 * collapse state, and the arena / tournament / daily / betting mode stores
 * are player- or mode-level, not campaign-level. Ironman and New Game+
 * records are owned by their own mount logic in main.ts.
 */

/** Where the last mounted campaign's fingerprint lives. */
export const CAMPAIGN_FINGERPRINT_KEY = "fentmen.campaignFingerprint.v1";

/**
 * The snapshot fields that identify one campaign. Structural (not the full
 * SimSnapshot) so tests and future callers stay light. `day` matters: a
 * resumed campaign keeps advancing its clock, a new campaign restarts it.
 */
export interface CampaignIdentity {
  characterName: string;
  factionId: string;
  ethnicityId: string;
  age: number;
  day: number;
}

/** Deterministic fingerprint for the mounted campaign. Never throws. */
export function campaignFingerprint(id: CampaignIdentity): string {
  const parts = [id.characterName, id.factionId, id.ethnicityId, id.age, id.day];
  return `v1:${JSON.stringify(parts)}`;
}

/** The stored fingerprint, or null when none was recorded (or storage is hostile). */
export function readStoredFingerprint(storage: Pick<Storage, "getItem">): string | null {
  try {
    return storage.getItem(CAMPAIGN_FINGERPRINT_KEY);
  } catch {
    return null;
  }
}

/** Record the mounted campaign's fingerprint. Storage failures stay silent. */
export function writeStoredFingerprint(
  storage: Pick<Storage, "setItem">,
  fingerprint: string,
): void {
  try {
    storage.setItem(CAMPAIGN_FINGERPRINT_KEY, fingerprint);
  } catch {
    // Storage full or blocked: the in-memory stores were still reset for
    // this session; the next mount simply decides again.
  }
}

/**
 * True when the mounted campaign differs from the last recorded one: its
 * per-campaign stores must be reset. A missing record (first campaign ever,
 * or unreadable storage) counts as different — clearing absent keys is a
 * no-op, so this direction is always safe.
 */
export function shouldResetCampaignStores(stored: string | null, fingerprint: string): boolean {
  return stored !== fingerprint;
}

/**
 * Remove each key, best-effort. Returns the keys removed without error so
 * callers can log what actually happened.
 */
export function clearStorageKeys(
  storage: Pick<Storage, "removeItem">,
  keys: readonly string[],
): string[] {
  const removed: string[] = [];
  for (const key of keys) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // One hostile key must not block the rest.
    }
  }
  return removed;
}
