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

/** Task 576: the rain bed, the real `sfx-ambience-rain` asset. */
export const RAIN_BED: SfxId = "sfx-ambience-rain";

/** Task 577: the distant-battle rumble, the real `sfx-ambience-distant-battle`. */
export const BATTLEFIELD_BED: SfxId = "sfx-ambience-distant-battle";

/** What the map is doing right now, as far as the ambient bus cares. */
export interface AmbientScene {
  /** The clock's phase, as in {@link townAmbientBed}. */
  time: AmbientTimeOfDay;
  /** True while rain is falling over the player (task 576). */
  raining?: boolean;
  /** True while a battle is close enough to be heard (task 577). */
  battle?: boolean;
}

/**
 * Tasks 576/577: the bed for the whole scene. The mixer plays one bed at a time,
 * so the rules are ordered rather than mixed — the nearest thing to the player
 * wins. A battle carries further than rain and far further than the town, so it
 * takes the bus first; rain takes it from the town bed while it falls; and the
 * town comes back when neither holds. Every transition is a crossfade because
 * that is what the mixer does when the bed id changes.
 */
export function sceneAmbientBed(scene: AmbientScene): SfxId {
  if (scene.battle) return BATTLEFIELD_BED;
  if (scene.raining) return RAIN_BED;
  return townAmbientBed(scene.time);
}

/** Puts the scene's bed on the ambient bus (task 576). */
export async function playSceneAmbient(
  audio: AudioManager,
  scene: AmbientScene,
): Promise<void> {
  await audio.playAmbient(sceneAmbientBed(scene));
}
