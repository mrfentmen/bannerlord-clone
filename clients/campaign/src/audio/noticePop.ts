/**
 * Tasks 545/546: the notification feed's cues.
 *
 * The campaign feed is append-only, so a notice whose id was not in the
 * previous snapshot means something new happened; everything else — the same
 * feed after a repaint, a tick with no news — stays silent. One cue per
 * change: a new critical notice is the warning alert, any other new notice is
 * the pop. Both are the bank's shortest cues that do not say a word; the radio
 * voice sets are tasks 591–600.
 */

import type { Notification } from "../data/types.js";
import { getAudioManager } from "./AudioManager.js";

/** Which feed cue a change earned. */
export type NoticeCue = "none" | "pop" | "alert";

/** The sound each cue plays, and the volume it plays at. */
const CUE_SFX: Record<Exclude<NoticeCue, "none">, { id: string; volume: number }> = {
  pop: { id: "sfx-radio-blip", volume: 0.5 },
  alert: { id: "sfx-ui-error", volume: 0.5 },
};

/**
 * The cue for a feed change: a new critical notice is an alert, any other new
 * notice is a pop, and no new notice is silence (tasks 545/546).
 */
export function noticeCueFor(
  before: readonly Notification[],
  after: readonly Notification[],
): NoticeCue {
  const known = new Set(before.map((notice) => notice.id));
  const fresh = after.filter((notice) => !known.has(notice.id));
  if (fresh.some((notice) => notice.priority === "critical")) return "alert";
  return fresh.length > 0 ? "pop" : "none";
}

/**
 * Plays the feed's cue when a notice landed. `before` is null until the first
 * snapshot exists; the feed a player boots into is history, not news, so it
 * stays silent.
 */
export function playNoticeCue(
  before: readonly Notification[] | null,
  after: readonly Notification[],
): void {
  if (!before) return;
  const cue = noticeCueFor(before, after);
  if (cue === "none") return;
  const sfx = CUE_SFX[cue];
  void getAudioManager().playSfx(sfx.id, { volume: sfx.volume }).catch(() => {});
}
