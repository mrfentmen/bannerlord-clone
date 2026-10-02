/**
 * Petition queue with deadlines (Rowan solo task 55).
 *
 * Petitions arrive with a deadline (campaign day). The queue tracks them;
 * advancing past a deadline expires the petition with a consequence —
 * the petitioner feels ignored (rep loss), shown in the expiry report.
 * Resolving a petition removes it from the queue.
 */

import type { Petition, PetitionKind } from "./types.js";

export interface QueuedPetition extends Petition {
  /** Campaign day the petition expires. */
  deadlineDay: number;
  /** Campaign day it was filed. */
  filedDay: number;
}

export interface PetitionExpiry {
  petition: QueuedPetition;
  /** Rep lost to the expiry. */
  repDelta: number;
  line: string;
}

const STORE_KEY = "campaign.petition-queue.v1";

function load(): QueuedPetition[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(queue: QueuedPetition[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(queue));
  } catch {
    // Session-only queue.
  }
}

/** File a petition with a deadline daysAfterFiling days out. */
export function filePetition(
  petition: Petition,
  filedDay: number,
  daysAfterFiling: number,
): QueuedPetition[] {
  const queue = load();
  const queued: QueuedPetition = {
    ...petition,
    filedDay,
    deadlineDay: filedDay + Math.max(1, daysAfterFiling),
  };
  queue.push(queued);
  save(queue);
  return queue;
}

/** The current queue, soonest deadline first. */
export function petitionQueue(): QueuedPetition[] {
  return load().sort((a, b) => a.deadlineDay - b.deadlineDay);
}

/** Remove a petition from the queue (resolved by grant/deny/defer). */
export function dequeuePetition(petitionId: string): QueuedPetition[] {
  const queue = load().filter((p) => p.id !== petitionId);
  save(queue);
  return queue;
}

/**
 * Expire petitions past their deadline. Returns the expiries with their
 * consequences; expired petitions leave the queue.
 */
export function expirePetitions(currentDay: number): PetitionExpiry[] {
  const queue = load();
  const expired = queue.filter((p) => p.deadlineDay < currentDay);
  if (expired.length === 0) return [];
  const remaining = queue.filter((p) => p.deadlineDay >= currentDay);
  save(remaining);
  return expired.map((p) => ({
    petition: p,
    repDelta: -6,
    line: `The ${p.kind} petition from ${p.petitioner} expired unanswered (−6 rep). They will remember the silence.`,
  }));
}

/** Days left before a petition expires (negative when overdue). */
export function daysLeft(petition: QueuedPetition, currentDay: number): number {
  return petition.deadlineDay - currentDay;
}

export type { PetitionKind };
