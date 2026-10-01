/**
 * Tasks 140-142: credits, patch notes, and the feedback reporter.
 */

import type { PatchNote } from "./types.js";

export interface Contributor {
  name: string;
  role: string;
}

export const CREDITS: Contributor[] = [
  { name: "del", role: "Creator & design" },
  { name: "Rowan", role: "Campaign client" },
  { name: "PAX", role: "Saves, HTTP, party & inventory UI" },
  { name: "Hana", role: "Battle scenes, settlements, audio" },
  { name: "milo", role: "Battle simulation & encounters" },
];

export function creditsList(): Contributor[] {
  return [...CREDITS];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.9.0",
    date: "2026-10-01",
    notes: [
      "Clan & family: family tree viewer, marriages, education, succession, banners, companions.",
      "Court & politics: feasts, edicts, petitions, trials, war council, treaties.",
      "Espionage: spy networks, schemes, informants, cipher minigame, assassination plots.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-30",
    notes: [
      "Battle command UX: radial orders, control groups, waypoints, pings.",
      "After-action reports with replays and shareable summaries.",
    ],
  },
];

export function patchNotes(): PatchNote[] {
  return [...PATCH_NOTES];
}

export type FeedbackKind = "bug" | "suggestion" | "praise";

export interface FeedbackReport {
  kind: FeedbackKind;
  title: string;
  body: string;
  screen: string;
  createdAt: string;
}

export function buildFeedback(
  kind: FeedbackKind,
  title: string,
  body: string,
  screen: string,
): FeedbackReport {
  if (title.trim().length === 0) throw new Error("feedback needs a title");
  if (body.trim().length < 10) throw new Error("describe the issue in at least 10 characters");
  return { kind, title: title.trim(), body: body.trim(), screen, createdAt: new Date().toISOString() };
}
