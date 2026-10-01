/**
 * Task 127: music player. The track list and play/pause/queue state live
 * here; actual audio decoding and output is Hana's audio pipeline, reached
 * through the narrow AudioTarget interface.
 */

import type { MusicTrack } from "./types.js";

/** Narrow interface Hana's audio pipeline implements. */
export interface AudioTarget {
  playTrack(trackId: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "drums-of-harbor", title: "Drums of the Harbor", mood: "war", duration: "3:12" },
  { id: "iron-march", title: "Iron March", mood: "war", duration: "4:05" },
  { id: "court-of-candles", title: "Court of Candles", mood: "court", duration: "2:48" },
  { id: "neon-deal", title: "Neon Deal", mood: "court", duration: "3:33" },
  { id: "freeway-dust", title: "Freeway Dust", mood: "travel", duration: "5:01" },
  { id: "gravel-road", title: "Gravel Road", mood: "travel", duration: "3:57" },
  { id: "static-hymn", title: "Static Hymn", mood: "somber", duration: "4:44" },
  { id: "ashfall", title: "Ashfall", mood: "somber", duration: "3:26" },
];

export type PlayerState = "stopped" | "playing" | "paused";

export interface MusicPlayer {
  state(): PlayerState;
  current(): MusicTrack | null;
  queue(): MusicTrack[];
  play(trackId: string, audio: AudioTarget): void;
  pause(audio: AudioTarget): void;
  resume(audio: AudioTarget): void;
  next(audio: AudioTarget): MusicTrack | null;
  tracksByMood(mood: MusicTrack["mood"]): MusicTrack[];
}

export function createMusicPlayer(): MusicPlayer {
  let playerState: PlayerState = "stopped";
  let current: MusicTrack | null = null;
  const upcoming: MusicTrack[] = [];
  return {
    state: () => playerState,
    current: () => current,
    queue: () => [...upcoming],
    play(trackId, audio) {
      const track = MUSIC_TRACKS.find((t) => t.id === trackId);
      if (!track) throw new Error(`unknown track: ${trackId}`);
      current = track;
      playerState = "playing";
      audio.playTrack(trackId);
    },
    pause(audio) {
      if (playerState !== "playing") return;
      playerState = "paused";
      audio.pause();
    },
    resume(audio) {
      if (playerState !== "paused" || !current) return;
      playerState = "playing";
      audio.resume();
    },
    next(audio) {
      const track = upcoming.shift() ?? null;
      if (track) {
        current = track;
        playerState = "playing";
        audio.playTrack(track.id);
      } else {
        current = null;
        playerState = "stopped";
        audio.stop();
      }
      return track;
    },
    tracksByMood: (mood) => MUSIC_TRACKS.filter((t) => t.mood === mood),
  };
}
