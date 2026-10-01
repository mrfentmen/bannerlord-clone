/**
 * Task 85: court events feed. Feasts, trials, petitions, edicts, war plans,
 * and treaties arrive as events; each event is clickable through to its UI
 * via the handler the app registers per kind.
 */

import type { CourtEvent, CourtEventKind } from "./types.js";

export interface EventsFeed {
  events(): CourtEvent[];
  unread(): number;
  push(event: Omit<CourtEvent, "id" | "read">): CourtEvent;
  markRead(id: string): void;
  onOpen(kind: CourtEventKind, fn: (event: CourtEvent) => void): () => void;
  open(eventId: string): void;
}

let nextId = 1;

export function createEventsFeed(): EventsFeed {
  const list: CourtEvent[] = [];
  const handlers = new Map<CourtEventKind, Set<(e: CourtEvent) => void>>();

  return {
    events: () => [...list],
    unread: () => list.filter((e) => !e.read).length,
    push(partial) {
      const event: CourtEvent = { ...partial, id: `evt-${nextId++}`, read: false };
      list.unshift(event);
      return event;
    },
    markRead(id) {
      const e = list.find((x) => x.id === id);
      if (e) e.read = true;
    },
    onOpen(kind, fn) {
      const set = handlers.get(kind) ?? new Set();
      set.add(fn);
      handlers.set(kind, set);
      return () => {
        set.delete(fn);
      };
    },
    open(eventId) {
      const e = list.find((x) => x.id === eventId);
      if (!e) return;
      e.read = true;
      for (const fn of handlers.get(e.kind) ?? []) fn(e);
    },
  };
}
