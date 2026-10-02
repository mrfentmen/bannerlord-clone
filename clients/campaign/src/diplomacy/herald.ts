/**
 * Task 113: herald/announcement system. Proclaim an announcement and it is
 * delivered to every town — the receipt lists each town, so "announcements
 * reach all towns" (the task's acceptance) is checkable, not assumed.
 */

export interface Announcement {
  id: string;
  text: string;
  day: number;
  /** Town ids that received it. */
  deliveredTo: string[];
}

let nextAnnouncement = 1;

/** Proclaim to every town in `townIds`. Empty town list = no delivery. */
export function proclaim(text: string, townIds: string[], day: number): Announcement {
  return {
    id: `herald-${nextAnnouncement++}`,
    text,
    day,
    deliveredTo: [...townIds],
  };
}

/** True when every town in `townIds` received the announcement. */
export function reachedAllTowns(announcement: Announcement, townIds: string[]): boolean {
  return townIds.every((t) => announcement.deliveredTo.includes(t));
}
