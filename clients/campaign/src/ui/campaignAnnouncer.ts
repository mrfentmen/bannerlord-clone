/**
 * Screen-reader campaign announcements (Rowan solo task 19).
 *
 * One polite live region for the campaign layer: town entries, dilemma
 * events, season ticks, and other map-side happenings. A singleton — the
 * campaign mounts it once and every subsystem announces through it.
 * Battle has its own announcer (battleflow/announcer.ts) because battles
 * need kill batching; the campaign does not.
 */

import { liveRegion, announce } from "./dom.js";

let region: HTMLElement | null = null;

/** Mount the campaign live region. Idempotent — safe to call twice. */
export function mountCampaignAnnouncer(into: ParentNode = document.body): HTMLElement {
  if (region && region.isConnected) return region;
  region = liveRegion();
  region.setAttribute("data-testid", "campaign-announcer");
  into.appendChild(region);
  return region;
}

/** Announce a campaign event to screen readers. No-op before mounting. */
export function announceCampaign(message: string): void {
  if (region && region.isConnected) announce(region, message);
}

/** The region, for tests. */
export function campaignAnnouncerRegion(): HTMLElement | null {
  return region;
}

/** Reset the singleton (tests only). */
export function _resetCampaignAnnouncerForTests(): void {
  region?.remove();
  region = null;
}
