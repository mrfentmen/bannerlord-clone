/**
 * Relation change notifications (Rowan solo task 81).
 *
 * Every relation change shows its reason: adjust a relation with a named
 * cause, and the notification queue records who, how much, why, and the
 * new standing. Persists in localStorage.
 */

export interface RelationNotification {
  id: string;
  factionId: string;
  factionName: string;
  delta: number;
  reason: string;
  newValue: number;
  season: number;
  line: string;
}

const STORE_KEY = "campaign.relation-notifications.v1";
const RELATIONS_KEY = "campaign.relations.v1";

function loadNotifications(): RelationNotification[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveNotifications(n: RelationNotification[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(n));
  } catch {
    // Session-only notifications.
  }
}

function loadRelations(): Record<string, { name: string; value: number }> {
  try {
    const raw = localStorage.getItem(RELATIONS_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

function saveRelations(r: Record<string, { name: string; value: number }>): void {
  try {
    localStorage.setItem(RELATIONS_KEY, JSON.stringify(r));
  } catch {
    // ignore
  }
}

/** Current relation with a faction (-100..100), default 0. */
export function relationWith(factionId: string): number {
  return loadRelations()[factionId]?.value ?? 0;
}

/**
 * Adjust a relation with a stated reason. Records a notification showing
 * the reason, delta, and new standing.
 */
export function adjustRelation(
  factionId: string,
  factionName: string,
  delta: number,
  reason: string,
  season: number,
): RelationNotification {
  if (!reason.trim()) throw new Error("a reason is required for relation changes");
  const relations = loadRelations();
  const current = relations[factionId]?.value ?? 0;
  const newValue = Math.max(-100, Math.min(100, current + delta));
  relations[factionId] = { name: factionName, value: newValue };
  saveRelations(relations);
  const arrow = delta >= 0 ? "▲" : "▼";
  const notification: RelationNotification = {
    id: `rel-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    factionId,
    factionName,
    delta,
    reason,
    newValue,
    season,
    line: `${factionName}: ${arrow}${Math.abs(delta)} — ${reason} (now ${newValue})`,
  };
  const notifications = loadNotifications();
  notifications.push(notification);
  saveNotifications(notifications);
  return notification;
}

/** All notifications, newest first. */
export function relationNotifications(): RelationNotification[] {
  return loadNotifications().reverse();
}
