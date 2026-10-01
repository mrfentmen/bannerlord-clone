/**
 * Radio integration. MASTER_PLAN.md section 4E, task 149.
 *
 * Plays the radio/SFX pipeline outputs from `public/audio/radio/`. The
 * campaign client starts the radio when the tavern or town screens open and
 * stops it when they close. Stations are plain audio files; the pipeline
 * drops one file per station into `public/audio/radio/<id>.mp3`.
 *
 * Fault tolerance: a station that fails to load is skipped to the next one,
 * and if nothing plays the radio simply stays silent. The game never breaks
 * because a pipeline file is missing.
 *
 * Same pattern as the other modules: playback goes through an injected
 * AudioPlayer (see audio.ts); this module owns no sim connection and no
 * fetch.
 */

/** A radio station: one pipeline file under public/audio/radio/. */
export interface RadioStation {
  /** Station id, also the file name: `public/audio/radio/<id>.mp3`. */
  id: string;
  /** Display name shown on the tavern/town radio UI. */
  name: string;
}

/** Stations shipped with the client. Add a row per pipeline output. */
export const RADIO_STATIONS: RadioStation[] = [
  { id: "station-street", name: "Street Radio" },
  { id: "station-night", name: "Night Shift" },
  { id: "station-talk", name: "Corner Talk" },
];

export interface Radio {
  /** Start playing, defaulting to the first station. Restarts are no-ops. */
  start(stationId?: string): void;
  /** Stop playback. */
  stop(): void;
  /** The station currently selected, or null when stopped. */
  current(): RadioStation | null;
  /** Move to the next station, wrapping around. No-op when stopped. */
  next(): void;
  /** Whether audio is currently playing. */
  isPlaying(): boolean;
  /** Release resources. */
  destroy(): void;
}

export interface RadioCallbacks {
  /** Fired when the playing station changes, for the radio UI label. */
  onStationChange?: (station: RadioStation | null) => void;
}

import type { AudioPlayer, SoundHandle } from "./audio.js";
import { browserAudioPlayer } from "./audio.js";

/** Create the tavern/town radio. */
export function createRadio(
  player: AudioPlayer = browserAudioPlayer(),
  callbacks: RadioCallbacks = {},
): Radio {
  let handle: SoundHandle | null = null;
  let index = 0;
  let destroyed = false;

  function stationFile(station: RadioStation): string {
    return `/audio/radio/${station.id}.mp3`;
  }

  function announce(): void {
    const station = handle ? RADIO_STATIONS[index] : null;
    callbacks.onStationChange?.(station ?? null);
  }

  function tryPlay(offset: number): void {
    if (RADIO_STATIONS.length === 0) return;
    for (let attempt = 0; attempt < RADIO_STATIONS.length; attempt += 1) {
      const i = (index + offset + attempt) % RADIO_STATIONS.length;
      const station = RADIO_STATIONS[i];
      if (!station) continue;
      try {
        handle = player.playSound(stationFile(station), { volume: 0.5, loop: true });
        index = i;
        announce();
        return;
      } catch {
        // Skip broken stations; keep trying the rest.
      }
    }
    handle = null;
    announce();
  }

  return {
    start(stationId) {
      if (destroyed || handle) return;
      if (stationId !== undefined) {
        const found = RADIO_STATIONS.findIndex((s) => s.id === stationId);
        index = found >= 0 ? found : 0;
      }
      tryPlay(0);
    },
    stop() {
      handle?.stop();
      handle = null;
      announce();
    },
    current: () => {
      if (!handle) return null;
      return RADIO_STATIONS[index] ?? null;
    },
    next() {
      if (destroyed || !handle) return;
      handle.stop();
      handle = null;
      tryPlay(1);
    },
    isPlaying: () => handle !== null,
    destroy() {
      destroyed = true;
      handle?.stop();
      handle = null;
    },
  };
}
