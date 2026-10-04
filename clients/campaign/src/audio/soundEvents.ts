/**
 * The named sound bus, ported from `milo/tasks-101-200:src/audio/audio.ts` and
 * `milo/world-ai:src/audio/audio.ts` (task 148).
 *
 * The parked module was right about the shape and wrong about everything else.
 * Its shape: every sound the game can make is a name in one table, the name
 * carries the file and the level, and callers say `bus.play("combat.hit")`
 * instead of knowing a path. That is kept. Its contents: the ten events named
 * files that do not exist anywhere in the library (`/audio/sfx/ui-click.mp3`,
 * `/audio/sfx/hit.mp3`), and playback went through a raw `HTMLAudioElement`,
 * which cannot share a bus with the rest of the mixer, cannot duck under music
 * and cannot be turned down by the volume sliders.
 *
 * So the events are re-pointed at assets that are really there — the 1,342
 * `sfx-*` files and 3,513 barks that ship — and playback is injected. The
 * default player routes through {@link getAudioManager}, so a `combat.hit`
 * lands on the same Web Audio graph as the music and obeys the same mute.
 * `createSoundBus` still takes a player, so a test can record calls.
 *
 * Events are grouped by the hook that fires them: UI, combat, campaign, town.
 * Every id is checked against the real manifest by `soundEvents.test.ts`, so a
 * renamed asset fails there instead of going silent in the game.
 */

import { getAudioManager, type SfxId } from "./AudioManager.js";

/** A handle to a playing sound. The player implementation owns the resource. */
export interface SoundHandle {
  /** Change the playback volume, 0 (silent) to 1 (full). */
  setVolume(volume: number): void;
  /** Stop playback and release the resource. */
  stop(): void;
}

/**
 * The playback provider, injected so tests can fake it. Implementations must
 * not throw when the file is missing or the browser refuses autoplay; return a
 * silent handle instead.
 */
export interface AudioPlayer {
  /** Start playing a cue. Returns a handle, or null when it could not start. */
  playSound(id: SfxId, opts: { volume: number; loop?: boolean }): SoundHandle | null;
}

/** A handle that does nothing, for a player that cannot or will not play. */
export function silentHandle(): SoundHandle {
  return { setVolume: () => undefined, stop: () => undefined };
}

/**
 * The real player: the campaign mixer. One-shots go to the SFX bus, so they
 * share the graph with music, obey the mute, and are affected by the SFX
 * slider. A looping cue gets a voice the caller can move.
 */
export function mixerPlayer(): AudioPlayer {
  return {
    playSound(id, opts) {
      const audio = getAudioManager();
      if (opts.loop) {
        // Synchronous handle: the mixer resolves the loop asynchronously, so the
        // volume moves are queued on the AudioContext rather than raced.
        let pendingVolume = opts.volume;
        const handle: SoundHandle = {
          setVolume(volume: number): void {
            pendingVolume = volume;
          },
          stop(): void {
            loop?.stop();
          },
        };
        let loop: { setVolume(volume: number): void; stop(): void } | null = null;
        void audio.playLoopingSfx(id, { volume: pendingVolume }).then((voice) => {
          if (!voice) return;
          if (pendingVolume !== opts.volume) voice.setVolume(pendingVolume);
          loop = voice;
        });
        return handle;
      }
      void audio.playSfx(id, { volume: opts.volume });
      return silentHandle();
    },
  };
}

/**
 * Every documented hook point, and what fires it.
 *
 * `volume` is the cue's own weight before the player's master level: a UI tick
 * must not be as loud as an explosion, and that ordering lives here rather than
 * at each call site.
 */
export const SOUND_EVENTS = {
  // -- UI ------------------------------------------------------------------
  "ui.click": { id: "sfx-ui-click", volume: 0.5, hook: "Any button or tab. Click." },
  "ui.hover": { id: "sfx-ui-hover", volume: 0.3, hook: "Pointer enters an interactive element." },
  "ui.toggle": { id: "sfx-ui-toggle", volume: 0.5, hook: "Any checkbox or switch." },
  "ui.confirm": { id: "sfx-ui-confirm", volume: 0.55, hook: "An action is accepted." },
  "ui.error": { id: "sfx-ui-error", volume: 0.5, hook: "An action is refused." },
  "ui.back": { id: "sfx-ui-back", volume: 0.45, hook: "Closing a panel or stepping back." },
  "ui.pause": { id: "sfx-ui-pause", volume: 0.5, hook: "The game is paused." },
  "ui.resume": { id: "sfx-ui-resume", volume: 0.5, hook: "The game is unpaused." },
  "ui.panel-open": { id: "sfx-ui-dialogue-open", volume: 0.45, hook: "A panel or screen opens." },
  "ui.panel-close": { id: "sfx-ui-back", volume: 0.45, hook: "A panel or screen closes." },
  "ui.map-open": { id: "sfx-ui-map-open", volume: 0.5, hook: "The campaign map is opened." },
  "ui.paper": { id: "sfx-ui-paper", volume: 0.45, hook: "A document, ledger line or report is read." },
  "ui.save": { id: "sfx-ui-save-game", volume: 0.55, hook: "A save completes." },
  "ui.load": { id: "sfx-ui-load-game", volume: 0.55, hook: "A save is loaded." },
  "ui.tutorial-ping": { id: "sfx-ui-tutorial-ping", volume: 0.45, hook: "A tutorial step becomes available." },

  // -- Feedback -----------------------------------------------------------
  "objective.update": { id: "sfx-ui-objective-update", volume: 0.55, hook: "An objective advances or fails." },
  "objective.complete": { id: "sfx-ui-quest-complete", volume: 0.6, hook: "A quest is completed." },
  "objective.failed": { id: "sfx-ui-quest-fail", volume: 0.55, hook: "A quest is failed." },
  "objective.accepted": { id: "sfx-ui-quest-accept", volume: 0.55, hook: "A quest is taken." },
  "achievement": { id: "sfx-ui-achievement", volume: 0.65, hook: "An achievement unlocks." },
  "level-up": { id: "sfx-ui-level-up", volume: 0.65, hook: "A character or troop tier advances." },
  "skill-point": { id: "sfx-ui-skill-point", volume: 0.6, hook: "A skill point is spent." },
  "morale-up": { id: "sfx-ui-morale-up", volume: 0.55, hook: "Party morale improves." },
  "notification.alert": { id: "sfx-ui-notification", volume: 0.6, hook: "An alert the player should notice." },
  "notification.critical": { id: "sfx-ui-error-critical", volume: 0.7, hook: "A critical alert." },

  // -- Combat --------------------------------------------------------------
  "combat.hit": { id: "sfx-melee-warhammer-hit", volume: 0.7, hook: "A melee blow lands." },
  "combat.hit-armour": { id: "sfx-melee-helmet-clank", volume: 0.7, hook: "A blow lands on armour." },
  "combat.shot": { id: "sfx-weapon-rifle", volume: 0.6, hook: "A shot is fired." },
  "combat.kill": { id: "sfx-melee-sword-clash", volume: 0.65, hook: "A combatant goes down." },
  "combat.wounded": { id: "sfx-melee-mace-thud", volume: 0.6, hook: "A combatant is wounded but lives." },
  "combat.charge": { id: "sfx-signal-trumpet-charge", volume: 0.7, hook: "A charge is ordered or sounds." },
  "combat.horn": { id: "sfx-horn-war-horn", volume: 0.7, hook: "A war horn calls." },
  "combat.drum-roll": { id: "sfx-misc-drum-roll", volume: 0.65, hook: "A battle drum rolls." },
  "combat.horse": { id: "sfx-horse-neigh", volume: 0.6, hook: "A horse in the line." },
  "combat.explosion": { id: "sfx-weapon-explosion", volume: 0.9, hook: "A shell or charge goes off." },
  "combat.reload": { id: "sfx-weapon-reload", volume: 0.5, hook: "A weapon is reloaded." },
  "combat.dry-fire": { id: "sfx-weapon-dry-fire", volume: 0.45, hook: "An empty trigger is pulled." },
  "combat.formation": { id: "sfx-melee-shield-raise", volume: 0.55, hook: "A formation changes." },

  // -- Campaign ------------------------------------------------------------
  "construction.complete": { id: "sfx-forge-steel-pour", volume: 0.7, hook: "A building or project finishes." },
  "trade.accepted": { id: "sfx-ui-trade", volume: 0.55, hook: "A trade is confirmed." },
  "trade.coin": { id: "sfx-ui-coin", volume: 0.5, hook: "Coins change hands." },
  "workshop.craft": { id: "sfx-ui-craft", volume: 0.6, hook: "A workshop finishes a batch." },
  "party.depart": { id: "sfx-misc-caravan-bell", volume: 0.55, hook: "The player's party sets out." },
  "party.arrive": { id: "sfx-signal-bell-alarm", volume: 0.5, hook: "The player's party reaches its destination." },
  "siege.begun": { id: "sfx-horn-war-horn", volume: 0.75, hook: "A siege starts." },
  "siege.wall-breach": { id: "sfx-siege-wall-breach", volume: 0.9, hook: "A wall or gate is breached." },
  "siege.ram": { id: "sfx-siege-battering-ram", volume: 0.85, hook: "A battering ram strikes." },
  "alarm.air-raid": { id: "sfx-alarm-air-raid", volume: 0.8, hook: "A civil-defence siren; also a pursuit siren." },
  "alarm.gong": { id: "sfx-alarm-gong", volume: 0.7, hook: "The outcome of a fight is struck." },

  // -- Town ----------------------------------------------------------------
  "tavern.game-win": { id: "sfx-tavern-coin-purse", volume: 0.7, hook: "The player wins a tavern game." },
  "tavern.game-lose": { id: "sfx-tavern-mug-slam", volume: 0.6, hook: "The player loses a tavern game." },
  "tavern.crowd": { id: "sfx-crowd-cheer-loop", volume: 0.4, hook: "A full tavern, looped under the room." },
  "market.trade": { id: "sfx-foley-coins-pour", volume: 0.5, hook: "A market purchase." },
  "prison.lock": { id: "sfx-prison-manacle-rattle", volume: 0.6, hook: "A prisoner is taken." },
} as const satisfies Record<string, { id: SfxId; volume: number; hook: string }>;

export type SoundEventName = keyof typeof SOUND_EVENTS;

/** Every documented event name, for wiring checks and docs. */
export const SOUND_EVENT_NAMES = Object.keys(SOUND_EVENTS) as SoundEventName[];

export interface SoundBus {
  /** Play a documented event. Unknown or muted playback is a no-op. */
  play(event: SoundEventName): void;
  /** Master multiplier, 0 to 1, applied on top of each event's own weight. */
  setMasterVolume(volume: number): void;
  masterVolume(): number;
  mute(): void;
  unmute(): void;
  isMuted(): boolean;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Create the sound bus. The caller injects the player — a fake in tests,
 * `mixerPlayer()` in the real client — and calls `play()` at each hook point.
 */
export function createSoundBus(player: AudioPlayer = mixerPlayer()): SoundBus {
  let masterVolume = 1;
  let muted = false;

  return {
    play(event) {
      if (muted) return;
      const spec = SOUND_EVENTS[event];
      if (!spec) return;
      player.playSound(spec.id, { volume: clamp01(spec.volume * masterVolume) });
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
 * Delegate clicks on buttons inside `root` to the bus's `ui.click`. Buttons that
 * play their own sound opt out with `data-no-click-sound`; a disabled button is
 * silent because it did nothing. Returns a cleanup function.
 */
export function attachClickSounds(root: HTMLElement, bus: SoundBus): () => void {
  const onClick = (ev: Event): void => {
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

let instance: SoundBus | null = null;
/** The shared sound bus. */
export function getSoundBus(): SoundBus {
  if (!instance) instance = createSoundBus();
  return instance;
}