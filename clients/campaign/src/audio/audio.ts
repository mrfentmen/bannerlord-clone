/**
 * Audio hooks. MASTER_PLAN.md section 4E, task 148.
 *
 * The central sound bus for the campaign client. Every sound the game can
 * make is triggered through a named event in SOUND_EVENTS below, and each
 * event name is documented next to its entry. The caller (Rowan's campaign
 * client) creates the bus once, then:
 *
 *   - calls `bus.play("ui.click")` (or a convenience helper) wherever the
 *     documented hook points fire: UI clicks, combat hits, construction
 *     completion, notifications, and so on (task 148);
 *   - hands the same injected player to the radio module, which starts and
 *     stops the tavern/town radio (task 149);
 *   - hands the battle ambience module the live unit count each tick so
 *     crowd noise scales with the battle (task 150).
 *
 * Same pattern as the other modules: this module owns no sim connection and
 * no fetch. Sound *playback* goes through an injected AudioPlayer so tests
 * can record calls with a fake and the real client can pass the browser
 * implementation. Files live under `public/audio/` and are produced by the
 * radio/SFX pipeline; loading is lazy and every failure is silent, so the
 * game runs fine with no audio files present yet.
 *
 * Expected pipeline layout (documented contract, files optional):
 *   public/audio/sfx/ui-click.mp3            UI button clicks
 *   public/audio/sfx/panel-open.mp3          panels opening
 *   public/audio/sfx/panel-close.mp3         panels closing
 *   public/audio/sfx/hit.mp3                 a hit lands in combat
 *   public/audio/sfx/shot.mp3                a shot is fired
 *   public/audio/sfx/kill.mp3                a combatant goes down
 *   public/audio/sfx/construction-complete.mp3  a town project finishes
 *   public/audio/sfx/notification.mp3        an alert or notification
 *   public/audio/sfx/game-win.mp3            tavern game won
 *   public/audio/sfx/game-lose.mp3           tavern game lost
 *   public/audio/radio/<station>.mp3         radio stations (see radio.ts)
 *   public/audio/ambience/crowd-loop.mp3    battle crowd loop (see ambience.ts)
 */

/** A handle to a playing sound. The player implementation owns the resource. */
export interface SoundHandle {
  /** Change the playback volume, 0 (silent) to 1 (full). */
  setVolume(volume: number): void;
  /** Stop playback and release the resource. */
  stop(): void;
}

/**
 * The playback provider, injected so tests can fake it. The default
 * `browserAudioPlayer()` wraps HTMLAudioElement and never throws.
 */
export interface AudioPlayer {
  /**
   * Start playing a file. Implementations must not throw when the file is
   * missing or the browser refuses autoplay; return a silent handle instead.
   */
  playSound(file: string, opts: { volume: number; loop?: boolean }): SoundHandle;
}

/** A no-op handle for players that cannot or will not play. */
export function silentHandle(): SoundHandle {
  return { setVolume: () => undefined, stop: () => undefined };
}

/**
 * Browser player built on HTMLAudioElement. Safe to construct anywhere:
 * where `Audio` is unavailable (tests, SSR) every call returns a silent
 * handle. Playback rejections (autoplay policy, missing file) are swallowed.
 */
export function browserAudioPlayer(): AudioPlayer {
  return {
    playSound(file, opts) {
      if (typeof Audio === "undefined") return silentHandle();
      try {
        const el = new Audio(file);
        el.volume = clamp01(opts.volume);
        el.loop = opts.loop ?? false;
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => undefined);
        return {
          setVolume: (v) => {
            el.volume = clamp01(v);
          },
          stop: () => {
            el.pause();
          },
        };
      } catch {
        return silentHandle();
      }
    },
  };
}

/** Every SFX hook point in the game, documented with its event name (task 148). */
export const SOUND_EVENTS = {
  "ui.click": {
    file: "/audio/sfx/ui-click.mp3",
    volume: 0.5,
    description: "Any UI button or tab click. Fire from button handlers or use attachClickSounds.",
  },
  "ui.panel-open": {
    file: "/audio/sfx/panel-open.mp3",
    volume: 0.4,
    description: "A panel or screen opens (tavern, arena, market, diplomacy, and so on).",
  },
  "ui.panel-close": {
    file: "/audio/sfx/panel-close.mp3",
    volume: 0.4,
    description: "A panel or screen closes.",
  },
  "combat.hit": {
    file: "/audio/sfx/hit.mp3",
    volume: 0.7,
    description: "A melee or ranged hit lands in battle.",
  },
  "combat.shot": {
    file: "/audio/sfx/shot.mp3",
    volume: 0.6,
    description: "A shot is fired in battle.",
  },
  "combat.kill": {
    file: "/audio/sfx/kill.mp3",
    volume: 0.6,
    description: "A combatant goes down in battle.",
  },
  "construction.complete": {
    file: "/audio/sfx/construction-complete.mp3",
    volume: 0.8,
    description: "A town construction project (walls, buildings) finishes.",
  },
  "notification.alert": {
    file: "/audio/sfx/notification.mp3",
    volume: 0.7,
    description: "An alert or notification the player should notice.",
  },
  "tavern.game-win": {
    file: "/audio/sfx/game-win.mp3",
    volume: 0.7,
    description: "The player wins a tavern dice or card game.",
  },
  "tavern.game-lose": {
    file: "/audio/sfx/game-lose.mp3",
    volume: 0.6,
    description: "The player loses a tavern dice or card game.",
  },
} as const;

export type SoundEventName = keyof typeof SOUND_EVENTS;

/** All documented SFX event names, for wiring checks and docs. */
export const SOUND_EVENT_NAMES = Object.keys(SOUND_EVENTS) as SoundEventName[];

export interface AudioBus {
  /** Play a documented SFX event. Unknown or muted playback is a no-op. */
  play(event: SoundEventName): void;
  /** Master volume multiplier, 0 to 1. Defaults to 1. */
  setMasterVolume(volume: number): void;
  masterVolume(): number;
  mute(): void;
  unmute(): void;
  isMuted(): boolean;
}

/**
 * Create the sound bus. The caller injects the player (a fake in tests,
 * `browserAudioPlayer()` in the real client) and calls `play()` at each
 * documented hook point.
 */
export function createAudioBus(player: AudioPlayer = browserAudioPlayer()): AudioBus {
  let masterVolume = 1;
  let muted = false;

  return {
    play(event) {
      if (muted) return;
      const spec = SOUND_EVENTS[event];
      if (!spec) return;
      player.playSound(spec.file, { volume: spec.volume * masterVolume });
    },
    setMasterVolume(volume) {
      masterVolume = clamp01(volume);
    },
    masterVolume: () => masterVolume,
    mute: () => {
      muted = true;
    },
    unmute: () => {
      muted = false;
    },
    isMuted: () => muted,
  };
}

/**
 * Convenience hook point for UI clicks: delegate clicks on buttons inside
 * `root` to the bus's `ui.click` event. Buttons that already play their own
 * sound can opt out with `data-no-click-sound`. Returns a cleanup function.
 */
export function attachClickSounds(root: HTMLElement, bus: AudioBus): () => void {
  const onClick = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    const button = target?.closest?.("button");
    if (!button) return;
    if (button.hasAttribute("data-no-click-sound")) return;
    if (button.disabled) return;
    bus.play("ui.click");
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
