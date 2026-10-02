/**
 * Game audio: music state machine + named SFX player.
 *
 * Everything here is original and synthesized in-house (see
 * `~/workspace/game-music/`): ten music mixes under `audio/music/` and
 * thirty-seven effects under `audio/sfx/`. No samples, no licensed material.
 *
 * Music follows the game situation and crossfades between tracks; SFX are
 * fire-and-forget through a small pool so overlaps don't cut each other off.
 * Browsers block audio before a user gesture, so nothing plays until
 * `unlock()` runs — call it from the first pointer/key interaction.
 */

/** Every situation that has its own music. */
export type MusicScene =
  | "menu"
  | "loading"
  | "campaign-day"
  | "campaign-night"
  | "battle"
  | "siege"
  | "last-stand"
  | "victory"
  | "defeat"
  | "tavern"
  | "homestead"
  | "oath"
  | "pursuit";

/** Track file for each scene. Pure data, so it is unit-testable. */
export const SCENE_TRACKS: Record<MusicScene, string> = {
  menu: "menu-theme-mix.mp3",
  loading: "loading-theme-mix.mp3",
  "campaign-day": "ambient-exploration-mix.mp3",
  "campaign-night": "night-patrol-mix.mp3",
  battle: "battle-theme-mix.mp3",
  siege: "siege-assault-mix.mp3",
  "last-stand": "last-stand-mix.mp3",
  victory: "victory-fanfare-mix.mp3",
  defeat: "defeat-mix.mp3",
  tavern: "tavern-rest-mix.mp3",
  homestead: "homestead-mix.mp3",
  oath: "oath-ceremony-mix.mp3",
  pursuit: "pursuit-mix.mp3",
};

/** Every playable effect, as a path under `audio/sfx/`. */
export const SFX_FILES: Record<string, string> = {
  // ui
  "click": "ui/click.mp3",
  "hover": "ui/hover.mp3",
  "confirm": "ui/confirm.mp3",
  "error": "ui/error.mp3",
  "toggle": "ui/toggle.mp3",
  "panel-open": "ui/panel-open.mp3",
  "panel-close": "ui/panel-close.mp3",
  "warning": "ui/warning.mp3",
  "coin": "ui/coin.mp3",
  "quest-complete": "ui/quest-complete.mp3",
  "notify": "ui/notify.mp3",
  "level-up": "ui/level-up.mp3",
  // battle
  "horn": "battle/horn.mp3",
  "crowd-cheer": "battle/crowd-cheer.mp3",
  "melee-hit": "battle/melee-hit.mp3",
  "arrow-volley": "battle/arrow-volley.mp3",
  "distant-gunfire": "battle/distant-gunfire.mp3",
  // weapons
  "pistol": "weapon/pistol.mp3",
  "rifle": "weapon/rifle.mp3",
  "shotgun": "weapon/shotgun.mp3",
  "smg-burst": "weapon/smg-burst.mp3",
  "explosion": "weapon/explosion.mp3",
  "explosion-small": "weapon/explosion-small.mp3",
  "reload": "weapon/reload.mp3",
  "dry-fire": "weapon/dry-fire.mp3",
  "thunder": "weapon/thunder.mp3",
  "knife-slash": "weapon/knife-slash.mp3",
  // vehicles
  "engine-idle": "vehicle/engine-idle.mp3",
  "engine-cruise": "vehicle/engine-cruise.mp3",
  "engine-load": "vehicle/engine-load.mp3",
  "helicopter": "vehicle/helicopter.mp3",
  "siren": "vehicle/siren.mp3",
  // foley
  "footstep-concrete": "foley/footstep-concrete.mp3",
  "footstep-dirt": "foley/footstep-dirt.mp3",
  "footstep-grass": "foley/footstep-grass.mp3",
  "car-door": "foley/car-door.mp3",
  // ambience beds (loop these with loop: true)
  "ambience-town-day": "ambience/town-day.mp3",
  "ambience-town-night": "ambience/town-night.mp3",
  "ambience-city-day": "ambience/city-day.mp3",
  "ambience-rain": "ambience/rain.mp3",
  "ambience-wind": "ambience/wind.mp3",
  "ambience-distant-battle": "ambience/distant-battle.mp3",
  // stingers (one-shot; battle-outcome hooks pending sim support)
  "stinger-victory": "stinger/victory.mp3",
  "stinger-defeat": "stinger/defeat.mp3",
  // radio
  "radio-squelch": "radio/squelch.mp3",
  "radio-blip": "radio/blip.mp3",
  "radio-static": "radio/static.mp3",
};

export type SfxName = keyof typeof SFX_FILES;

export interface AudioOptions {
  /** URL prefix for audio files. Default "audio/". */
  basePath?: string;
  /** Show the floating mute button. Default true. */
  muteButton?: boolean;
  /** Crossfade time between music tracks in ms. Default 2000. */
  crossfadeMs?: number;
  /** Max concurrent SFX voices. Default 8. */
  sfxVoices?: number;
}

const MUTE_KEY = "bannerlord-clone.muted";

/**
 * Resolve the music track URL for a scene. Exported for tests.
 */
export function trackUrl(scene: MusicScene, basePath = "audio/"): string {
  return `${basePath}music/${SCENE_TRACKS[scene]}`;
}

/**
 * Resolve an SFX URL. Exported for tests.
 */
export function sfxUrl(name: SfxName, basePath = "audio/"): string {
  return `${basePath}sfx/${SFX_FILES[name]}`;
}

export class GameAudio {
  private base: string;
  private crossfadeMs: number;
  private musicA: HTMLAudioElement;
  private musicB: HTMLAudioElement;
  private active: HTMLAudioElement;
  private idle: HTMLAudioElement;
  private currentScene: MusicScene | null = null;
  private fadeTimer: number | null = null;
  private sfxPool: HTMLAudioElement[] = [];
  private muted = false;
  private unlocked = false;
  private pendingScene: MusicScene | null = null;
  private muteBtn: HTMLButtonElement | null = null;
  /** Tension layer under the music, driven by live critical warnings. */
  private dangerEl: HTMLAudioElement;
  private dangerOn = false;
  private dangerFade: number | null = null;

  constructor(options: AudioOptions = {}) {
    this.base = options.basePath ?? "audio/";
    this.crossfadeMs = options.crossfadeMs ?? 2000;
    const voices = options.sfxVoices ?? 8;

    this.musicA = this.makeMusicEl();
    this.musicB = this.makeMusicEl();
    this.active = this.musicA;
    this.idle = this.musicB;
    this.dangerEl = this.makeMusicEl();
    for (let i = 0; i < voices; i++) {
      const el = new Audio();
      el.preload = "auto";
      this.sfxPool.push(el);
    }

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
    this.applyMute();

    if (options.muteButton ?? true) {
      this.mountMuteButton();
    }
  }

  private makeMusicEl(): HTMLAudioElement {
    const el = new Audio();
    el.preload = "auto";
    el.loop = true;
    return el;
  }

  /**
   * Enable audio. Browsers require a user gesture first; call this from a
   * pointerdown/keydown handler. A scene requested before unlock is remembered
   * and starts here.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pendingScene) {
      const s = this.pendingScene;
      this.pendingScene = null;
      this.setScene(s);
    }
    if (this.dangerOn) {
      // setDanger early-returned before unlock; re-apply now that we can play.
      this.dangerOn = false;
      this.setDanger(true);
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Move the music to a new scene, crossfading from whatever is playing.
   * Calling with the current scene is a no-op.
   */
  setScene(scene: MusicScene): void {
    if (scene === this.currentScene) return;
    if (!this.unlocked) {
      this.pendingScene = scene;
      return;
    }
    this.currentScene = scene;
    const next = this.idle;
    next.src = trackUrl(scene, this.base);
    next.volume = 0;
    void next.play().catch(() => {
      /* autoplay still blocked; will retry on next unlock */
    });

    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
    }
    const from = this.active;
    const steps = 20;
    const stepMs = Math.max(25, this.crossfadeMs / steps);
    let i = 0;
    const target = this.muted ? 0 : 1;
    this.fadeTimer = window.setInterval(() => {
      i++;
      const t = Math.min(1, i / steps);
      next.volume = target * t;
      from.volume = target * (1 - t);
      if (t >= 1 && this.fadeTimer !== null) {
        window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        from.pause();
        // swap roles so the next crossfade reuses the idle channel
        this.active = next;
        this.idle = from;
      }
    }, stepMs);
  }

  get scene(): MusicScene | null {
    return this.currentScene;
  }

  /**
   * A tension layer under the music, driven by live game state (critical
   * resource warnings). Fades in/out on its own channel, independent of the
   * scene crossfader. Calling with the current state is a no-op.
   */
  setDanger(active: boolean): void {
    if (active === this.dangerOn) return;
    this.dangerOn = active;
    if (!this.unlocked) return;
    const el = this.dangerEl;
    if (active && !el.src) el.src = `${this.base}music/danger-pulse.mp3`;
    if (active) {
      void el.play().catch(() => {
        /* autoplay still blocked; will retry on next unlock */
      });
    }
    if (this.dangerFade !== null) {
      window.clearInterval(this.dangerFade);
      this.dangerFade = null;
    }
    const steps = 20;
    const stepMs = 50;
    let i = 0;
    const from = el.volume;
    const target = this.muted ? 0 : active ? 0.35 : 0;
    this.dangerFade = window.setInterval(() => {
      i++;
      const t = Math.min(1, i / steps);
      el.volume = from + (target - from) * t;
      if (t >= 1) {
        if (this.dangerFade !== null) {
          window.clearInterval(this.dangerFade);
          this.dangerFade = null;
        }
        if (!active) el.pause();
      }
    }, stepMs);
  }

  get danger(): boolean {
    return this.dangerOn;
  }

  /**
   * Play a named effect once. Unknown names are ignored, never thrown.
   */
  playSfx(name: string, options: { volume?: number; loop?: boolean } = {}): void {
    if (!this.unlocked || !(name in SFX_FILES)) return;
    const voice =
      this.sfxPool.find((el) => el.paused || el.ended) ?? this.sfxPool[0];
    if (!voice) return;
    voice.src = sfxUrl(name as SfxName, this.base);
    voice.loop = options.loop ?? false;
    voice.volume = this.muted ? 0 : (options.volume ?? 1);
    void voice.play().catch(() => {
      /* transient failure; the game must not care */
    });
  }

  /** Stop every looping SFX voice (ambience beds). */
  stopLoops(): void {
    for (const el of this.sfxPool) {
      if (el.loop) {
        el.pause();
        el.loop = false;
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* private mode; mute still applies for the session */
    }
    this.applyMute();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  private applyMute(): void {
    const v = this.muted ? 0 : 1;
    this.musicA.volume = v;
    this.musicB.volume = v;
    this.dangerEl.volume = this.muted ? 0 : this.dangerOn ? 0.35 : 0;
    for (const el of this.sfxPool) el.volume = v;
    if (this.muteBtn) {
      this.muteBtn.textContent = this.muted ? "🔇" : "🔊";
      this.muteBtn.setAttribute("aria-pressed", String(this.muted));
    }
  }

  private mountMuteButton(): void {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "audio-mute-btn";
    btn.title = "Mute / unmute audio";
    btn.setAttribute("aria-label", "Mute or unmute game audio");
    btn.textContent = this.muted ? "🔇" : "🔊";
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.unlock();
      this.toggleMuted();
      this.playSfx("click");
    });
    document.body.appendChild(btn);
    this.muteBtn = btn;
    this.applyMute();
  }
}

/** One shared instance for the app. Created lazily by main.ts. */
let shared: GameAudio | null = null;

export function gameAudio(options?: AudioOptions): GameAudio {
  if (!shared) shared = new GameAudio(options);
  return shared;
}
