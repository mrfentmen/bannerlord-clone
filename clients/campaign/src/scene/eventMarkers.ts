/**
 * Battle/siege map markers, derived from the simulation's own notifications
 * (mandate §17: battle indicators, siege indicators).
 *
 * The apiserver tags battle/siege notifications with `entityId: "town-<sim id>"`, which
 * is exactly `TownState.id`, so the join is a lookup rather than a guess. Only recent
 * notifications are drawn — the notification list accumulates for the whole session,
 * and a map of old news is worse than none. Latest notification wins per town.
 *
 * Pure, so it is unit-tested without a GPU. The scene decides visibility (fog); this
 * decides which settlements have something to show.
 */

import type { MapEventMarker } from "./CampaignScene.js";
import type { Notification, TownState } from "../data/types.js";

/** How many recent battle/siege notifications the map marks. */
export const EVENT_MARKER_LIMIT = 8;

export function buildEventMarkers(
  notifications: readonly Notification[],
  towns: readonly TownState[],
  limit: number = EVENT_MARKER_LIMIT,
): MapEventMarker[] {
  const recent = notifications.filter(
    (n) =>
      (n.kind === "battle" || n.kind === "siege") &&
      typeof n.entityId === "string" &&
      n.entityId.startsWith("town-"),
  );
  const townById = new Map(towns.map((town) => [town.id, town] as const));
  const markers: MapEventMarker[] = [];
  const seen = new Set<string>();
  for (let i = recent.length - 1; i >= 0 && markers.length < limit; i -= 1) {
    const n = recent[i]!;
    const town = townById.get(n.entityId!);
    if (!town || seen.has(town.settlementId)) continue;
    seen.add(town.settlementId);
    markers.push({ settlementId: town.settlementId, kind: n.kind as "battle" | "siege" });
  }
  return markers;
}
