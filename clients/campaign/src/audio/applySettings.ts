/**
 * Task 561: the bridge between the settings store and the mixer.
 *
 * The three volume sliders (`masterVolume`, `musicVolume`, `sfxVolume`) are the
 * player's contract; this module is the one place that turns them into bus
 * levels. There is no ambient slider in the schema, so the ambient bed follows
 * the music slider — it is background music by another name.
 *
 * Values are clamped again inside the mixer even though `parseSettings`
 * validates them: a hand-built settings-shaped object must never make the game
 * louder than a slider asks.
 */

import type { AudioManager } from "./AudioManager.js";

/** The three volume fields the mixer reads; the settings `Settings` satisfies it. */
export interface AudioVolumeSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

/** Applies the player's volume sliders to the mixer's buses. */
export function applyAudioSettings(audio: AudioManager, settings: AudioVolumeSettings): void {
  audio.setMasterVolume(settings.masterVolume);
  audio.setVolume("music", settings.musicVolume);
  audio.setVolume("sfx", settings.sfxVolume);
  audio.setVolume("ambient", settings.musicVolume);
}
