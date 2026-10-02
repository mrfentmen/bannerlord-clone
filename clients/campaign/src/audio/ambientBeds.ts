/**
 * Task 572: the town's ambient bed follows the clock.
 *
 * The game already has one four-part day — dawn, day, dusk, night — in
 * `scene/BattleUI.ts` and again in the after-action report. The mixer keeps its
 * own copy of that union rather than importing the scene into the audio layer,
 * and the mapping is deliberately blunt: one daytime bed and one night bed.
 * Dusk takes the night bed because the evening is when a town goes quiet, and
 * dawn takes the day bed because the morning is when it wakes.
 *
 * The two ids are the real manifest entries — `sfx-ambience-town-day` and
 * `sfx-ambience-town-night` — and the test checks both against
 * `public/audio-manifest.json` and the files on disk, so a renamed asset fails
 * here instead of going silent on the map.
 */

import type { AudioManager, SfxId } from "./AudioManager.js";

/** The four phases the rest of the game already uses (e.g. `DeploymentTimeOfDay`). */
export type AmbientTimeOfDay = "dawn" | "day" | "dusk" | "night";

/** The town's daytime bed. */
export const TOWN_DAY_BED: SfxId = "sfx-ambience-town-day";
/** The town's night bed. */
export const TOWN_NIGHT_BED: SfxId = "sfx-ambience-town-night";

/** Which bed a town plays at this time of day (task 572). */
export function townAmbientBed(time: AmbientTimeOfDay): SfxId {
  return time === "night" || time === "dusk" ? TOWN_NIGHT_BED : TOWN_DAY_BED;
}

/**
 * Puts the town's bed for this time of day on the ambient bus. The mixer keeps
 * one bed at a time, so calling this as the clock turns crossfades rather than
 * stacking tracks (task 571).
 */
export async function playTownAmbient(audio: AudioManager, time: AmbientTimeOfDay): Promise<void> {
  await audio.playAmbient(townAmbientBed(time));
}
