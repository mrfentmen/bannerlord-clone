/**
 * Battle crowd noise that scales with the live unit count, ported from
 * `milo/tasks-101-200:src/audio/ambience.ts` (task 150).
 *
 * The parked module got the idea right and the file wrong. The curve is kept
 * exactly as it was — `0.2 + count/500`, clamped to 0.2..1.0, exported as a
 * pure function so it can be pinned — because an empty field murmuring at 0.2
 * and 400 bodies hitting full roar is the right shape for a melee. What it
 * played, `/audio/ambience/crowd-loop.mp3`, is not in the library at all.
 *
 * So the crowd is built from what does ship: a loop bed picked by how the fight
 * is going, plus the one-shot cries that punctuate it. `sfx/crowd/` carries
 * `cheer-loop`, `angry-loop`, `chant-loop` and `gasp`, and `vox/` carries 42
 * recorded cries across both sexes — six battle cries, six cheers, six deaths,
 * six fears, six groans, six grunts, six pain screams. Those are chosen by the
 * beat that fired them, so a rout sounds different from a charge.
 *
 * Playback is injected. The default routes through the campaign mixer, so the
 * crowd obeys the SFX slider and the mute like everything else.
 */

import { getAudioManager, type SfxId } from "./AudioManager.js";
import { type AudioPlayer, silentHandle } from "./soundEvents.js";

/** The library's crowd beds, keyed by how the fight is going. */
export const CROWD_BEDS = {
  /** Ordinary pressure: the line is holding. */
  build: "sfx-crowd-cheer-loop",
  /** A fight that is turning ugly on both sides. */
  brawl: "sfx-crowd-angry-loop",
  /** A side is calling cadence — a charge, a rally, a rout in progress. */
  cadence: "sfx-crowd-chant-loop",
} as const satisfies Record<string, SfxId>;

/** How a bed is chosen, from the fight's own numbers rather than a timer. */
export type CrowdMood = keyof typeof CROWD_BEDS;

/**
 * The bed for a fight. A rout or a charge is loud and rhythmic, so it gets the
 * chant; a fight with the numbers against you gets the angry bed; everything
 * else is the ordinary cheer.
 *
 *   rout      the other side is breaking
 *   charge    an order to close
 *   pressured a lot of your own people are down
 */
export function crowdMoodFor(input: {
  rout: boolean;
  charge: boolean;
  casualtyShare: number;
}): CrowdMood {
  if (input.rout) return "cadence";
  if (input.charge) return "cadence";
  // Above a third of your own strength down, the noise is not a cheer any more.
  if (input.casualtyShare > 1 / 3) return "brawl";
  return "build";
}

/**
 * Crowd gain for a live unit count. Pure, so tests can pin the curve.
 * 0 units -> 0.2 (quiet murmur), 400 units -> 1.0 (full roar), clamped.
 * The clamp is at both ends on purpose: a negative count from a caller that
 * has not loaded the roster yet must not make the bus louder.
 */
export function crowdGainFor(liveUnitCount: number): number {
  const count = Math.max(0, Math.floor(Number.isFinite(liveUnitCount) ? liveUnitCount : 0));
  const gain = 0.2 + count / 500;
  return Math.min(1, Math.max(0.2, gain));
}

/** The cry voices: six of each kind, in the library as `vox-<kind>-<f|m><n>`. */
export const CRY_KINDS = [
  "battle-cry",
  "cheer",
  "grunt",
  "pain-scream",
  "fear-scream",
  "death-scream",
  "groan",
] as const;
export type CryKind = (typeof CRY_KINDS)[number];

/** Which cry a beat earns, and the number of variants to pick between. */
const CRY_FOR_BEAT: Record<string, CryKind> = {
  charge: "battle-cry",
  "battle-start": "battle-cry",
  rally: "cheer",
  victory: "cheer",
  rout: "cheer",
  routBroken: "cheer",
  casualty: "pain-scream",
  wounded: "groan",
  killed: "death-scream",
  panic: "fear-scream",
  melee: "grunt",
};

/** Variants per cry: `<kind>-f1..3` and `-m1..3`, so six. */
const CRY_VARIANTS = 6;

/**
 * The cry id for a beat and a variant. `batteries` rather than a random number
 * so a caller can pin it; the battle wiring passes a value from its own RNG.
 */
export function cryIdFor(kind: CryKind, variant: number): SfxId {
  const index = ((Math.floor(variant) % CRY_VARIANTS) + CRY_VARIANTS) % CRY_VARIANTS;
  const voice = index < 3 ? `f${index + 1}` : `m${index - 2}`;
  return `vox-${kind}-${voice}`;
}

/** The cry a beat should play, or null when the beat is not worth a voice. */
export function cryForBeat(beat: string, variant = 0): SfxId | null {
  const kind = CRY_FOR_BEAT[beat];
  return kind ? cryIdFor(kind, variant) : null;
}

export interface BattleCrowd {
  /**
   * Feed the live unit count. Starts the bed on the first call with count > 0;
   * later calls just move the gain. A count of 0 keeps the bed at its quiet
   * murmur rather than stopping it mid-battle.
   */
  update(liveUnitCount: number): void;
  /** The bed for how the fight is going, moved when it changes. */
  setMood(mood: CrowdMood): void;
  /** One cry for a battle beat. No-op when the bed is not running. */
  cry(beat: string, variant?: number): void;
  /** The gain currently applied, 0 when the bed has never started. */
  currentGain(): number;
  /** Stop the bed and the cries; the next update starts fresh. */
  stop(): void;
  /** Release resources. */
  destroy(): void;
}

/** The real player: the campaign mixer. One-shots go to the SFX bus. */
function mixerCrowdPlayer(): AudioPlayer {
  return {
    playSound(id, opts) {
      if (!opts.loop) {
        void getAudioManager().playSfx(id, { volume: opts.volume });
        return silentHandle();
      }
      let voice: { setVolume(v: number): void; stop(): void } | null = null;
      let pending = opts.volume;
      void getAudioManager()
        .playLoopingSfx(id, { volume: pending, fadeSeconds: 0.8 })
        .then((started) => {
          if (!started) return;
          voice = started;
          if (pending !== opts.volume) voice.setVolume(pending);
        });
      return {
        setVolume(volume: number): void {
          pending = volume;
          voice?.setVolume(volume);
        },
        stop(): void {
          voice?.stop();
          voice = null;
        },
      };
    },
  };
}

/** Create the battle crowd hook. */
export function createBattleCrowd(player: AudioPlayer = mixerCrowdPlayer()): BattleCrowd {
  let handle: { setVolume(v: number): void; stop(): void } | null = null;
  let mood: CrowdMood = "build";
  let gain = 0;
  let destroyed = false;

  return {
    update(liveUnitCount) {
      if (destroyed) return;
      const target = crowdGainFor(liveUnitCount);
      if (!handle) {
        if (liveUnitCount <= 0) return;
        handle = player.playSound(CROWD_BEDS[mood], { volume: target, loop: true });
      } else {
        handle.setVolume(target);
      }
      gain = target;
    },
    setMood(next) {
      if (destroyed || handle === null || next === mood) return;
      mood = next;
      // The bed is a different loop; restarting it is what makes a rout sound
      // different from a charge rather than merely louder.
      handle.stop();
      handle = player.playSound(CROWD_BEDS[mood], { volume: gain, loop: true });
    },
    cry(beat, variant = 0) {
      if (destroyed || handle === null) return;
      const id = cryForBeat(beat, variant);
      if (!id) return;
      player.playSound(id, { volume: 0.7 });
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

let instance: BattleCrowd | null = null;
/** The shared battle crowd. */
export function getBattleCrowd(): BattleCrowd {
  if (!instance) instance = createBattleCrowd();
  return instance;
}