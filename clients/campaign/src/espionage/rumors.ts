/**
 * Task 96: rumor system. The court hears things; some are true, some are
 * planted. Verification (against intel or events) marks each rumor true or
 * FALSE — false rumors stay in the log, visibly marked, so a planted lie
 * can't quietly pass as fact later.
 */

export type RumorStatus = "unverified" | "true" | "false";

export interface Rumor {
  id: string;
  text: string;
  /** Who passed it on. */
  source: string;
  /** Campaign day it was heard. */
  day: number;
  status: RumorStatus;
}

let nextRumor = 1;

export function hearRumor(text: string, source: string, day: number): Rumor {
  return { id: `rumor-${nextRumor++}`, text, source, day, status: "unverified" };
}

/** Verify a rumor against evidence. The rumor keeps its false mark forever. */
export function verifyRumor(rumor: Rumor, isTrue: boolean): Rumor {
  return { ...rumor, status: isTrue ? "true" : "false" };
}

export function isFalseRumor(rumor: Rumor): boolean {
  return rumor.status === "false";
}

/** Newest first, for the rumors UI. */
export function sortRumors(rumors: Rumor[]): Rumor[] {
  return [...rumors].sort((a, b) => b.day - a.day);
}
