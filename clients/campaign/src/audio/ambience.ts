/**
 * Battle ambience hook. MASTER_PLAN.md section 4E, task 150.
 *
 * Crowd noise that scales with the live unit count. The campaign client
 * calls `update(liveUnitCount)` on every battle tick (or whenever the count
 * changes); the loop starts on the first non-zero update and its gain
 * follows the count from then on. `stop()` kills the loop when the battle
 * ends.
 *
 * Gain curve (exported as crowdGainFor so tests and tuners can see it):
 *   gain = clamp(0.2 + unitCount / 500, 0.2, 1.0)
 * An empty field still murmurs at 0.2; 400 live units hit full volume.
 *
 * Same pattern as the other modules: playback goes through an injected
 * AudioPlayer (see audio.ts); the loop file is `public/audio/ambience/`
 * `crowd-loop.mp3` from the SFX pipeline, and a missing file just means
 * silence.
 */

import type { AudioPlayer, SoundHandle } from "./audio.js";
import { browserAudioPlayer } from "./audio.js";

/** The battle crowd loop from the SFX pipeline. */
export const CROWD_LOOP_FILE = "/audio/ambience/crowd-loop.mp3";

/**
 * Crowd gain for a live unit count. Pure, so tests can pin the curve.
 * 0 units -> 0.2 (quiet murmur), 400 units -> 1.0 (full roar), clamped.
 */
export function crowdGainFor(liveUnitCount: number): number {
  const count = Math.max(0, Math.floor(liveUnitCount));
  const gain = 0.2 + count / 500;
  return Math.min(1, Math.max(0.2, gain));
}

export interface BattleAmbience {
  /**
   * Feed the live unit count. Starts the loop on the first call with
   * count > 0; later calls just move the gain. A count of 0 keeps the
   * loop at its quiet murmur rather than stopping it mid-battle.
   */
  update(liveUnitCount: number): void;
  /** The gain currently applied, 0 when the loop has never started. */
  currentGain(): number;
  /** Stop the loop; the next update() starts it fresh. */
  stop(): void;
  /** Release resources. */
  destroy(): void;
}

/** Create the battle ambience hook. */
export function createBattleAmbience(
  player: AudioPlayer = browserAudioPlayer(),
): BattleAmbience {
  let handle: SoundHandle | null = null;
  let gain = 0;
  let destroyed = false;

  return {
    update(liveUnitCount) {
      if (destroyed) return;
      const target = crowdGainFor(liveUnitCount);
      if (!handle) {
        if (liveUnitCount <= 0) return;
        try {
          handle = player.playSound(CROWD_LOOP_FILE, { volume: target, loop: true });
        } catch {
          handle = null;
          return;
        }
      } else {
        handle.setVolume(target);
      }
      gain = target;
    },
    currentGain: () => gain,
    stop() {
      handle?.stop();
      handle = null;
      gain = 0;
    },
    destroy() {
      destroyed = true;
      handle?.stop();
      handle = null;
      gain = 0;
    },
  };
}
