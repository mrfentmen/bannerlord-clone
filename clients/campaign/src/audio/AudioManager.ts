/**
 * AudioManager for bannerlord-clone.
 *
 * Central audio system: music, ambient, SFX.
 * Loads from the audio manifest, plays via Web Audio API.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   await audio.loadManifest('/audio-manifest.json');
 *   audio.playMusic('battle-theme');
 *   audio.playSfx('sfx-weapon-gunshot');
 *   audio.playFootstep('concrete'); // foley based on surface
 */

import { COMBAT_LAYERS, battleLayersFor } from "./combatLayers.js";

export interface AudioAsset {
  id: string;
  path: string;
  category?: string;
  loop?: boolean;
  volume?: number;
}

/**
 * Clamps a bus level to 0..1. A garbage value can only make things quieter:
 * the mixer must never get louder than a slider asks because a caller built a
 * settings-shaped object by hand.
 */
function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.min(1, Math.max(0, volume));
}

export type MusicTrack =
  | 'loading-theme'
  | 'menu-theme'
  | 'battle-theme'
  | 'ambient-exploration'
  | 'victory-fanfare'
  | 'defeat';

export type SfxId = string;

/**
 * Audio lane prerequisite for tasks 501–600: the manifest's `path` values are
 * repository paths (`clients/campaign/public/audio/...`) because the file doubles
 * as the attribution ledger in `ART_AND_AUDIO.md`. The browser serves that same
 * directory as the web root, so fetching the stored path 404s and the whole game
 * runs silent. Normalising in one place keeps the ledger readable and the fetches
 * correct: the public dir's contents live at `/`.
 */
export function webAudioPath(path: string): string {
  const publicPrefix = "clients/campaign/public/";
  let webPath = path.trim();
  if (webPath.startsWith("./")) webPath = webPath.slice(2);
  if (webPath.startsWith(publicPrefix)) webPath = webPath.slice(publicPrefix.length);
  return webPath.startsWith("/") ? webPath : `/${webPath}`;
}

/**
 * The weapon cues the mixer knows (tasks 501–505). `shot` is the generic fire
 * cue an animation bridge can send without knowing the weapon; the named kinds
 * are for callers that do. `dry-fire` is the empty-trigger click and `reload`
 * the magazine sequence.
 */
export type WeaponSound =
  | "shot"
  | "rifle"
  | "pistol"
  | "shotgun"
  | "smg"
  | "dry-fire"
  | "reload";

/**
 * Real manifest ids. The map used to point `shot` at `sfx-weapon-gunshot`, which
 * is not in the manifest, so every trigger pull was silent while reload and
 * dry-fire worked (task 501). The generic fire cue is the assault rifle, which
 * is what the battle animation bridge is holding.
 */
export const WEAPON_SFX: Record<WeaponSound, SfxId> = {
  shot: "sfx-weapon-rifle",
  rifle: "sfx-weapon-rifle",
  pistol: "sfx-weapon-pistol",
  shotgun: "sfx-weapon-shotgun",
  smg: "sfx-weapon-smg-burst",
  "dry-fire": "sfx-weapon-dry-fire",
  reload: "sfx-weapon-reload",
};

/**
 * Task 509: the explosion cues. The manifest's small explosion is the grenade
 * (`sfx-weapon-explosion-small`) and the large one a shell or a charge
 * (`sfx-weapon-explosion`); both are real assets.
 */
export type ExplosionKind = "grenade" | "shell";
export const EXPLOSION_SFX: Record<ExplosionKind, SfxId> = {
  grenade: "sfx-weapon-explosion-small",
  shell: "sfx-weapon-explosion",
};

/**
 * Task 554: how long one music track takes to hand over to the next, in seconds.
 * Long enough that the two are heard as one move rather than a cut, short enough
 * that the battle theme is in place before the first volley.
 */
export const MUSIC_CROSSFADE_SECONDS = 2;

/**
 * Task 563: how long a combat layer takes to come in or drop out, in seconds.
 * Short enough to follow a charge, long enough that the change is heard as a
 * swell rather than a click.
 */
export const COMBAT_LAYER_RAMP_SECONDS = 0.5;

/**
 * Task 571: how long an ambient bed takes to hand over to the next, in seconds.
 * The same length as the music crossfade so a biome change and a track change
 * are heard as the same gesture.
 */
export const AMBIENT_CROSSFADE_SECONDS = 2;

/** Task 559: duck the music bus to 35% while dialogue subtitles are visible. */
export const DIALOGUE_MUSIC_DUCK_LEVEL = 0.35;
/** Task 559: soften duck and restore transitions instead of stepping the music. */
export const DIALOGUE_DUCK_RAMP_SECONDS = 0.25;

/** One playing looping bed — music or ambient: its source and its fade gain. */
interface Voice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  /** Dialogue-only attenuation after the music level slider (task 559). */
  private dialogueDuckGain: GainNode | null = null;
  private dialogueDucked = false;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private manifest = new Map<string, AudioAsset>();

  private currentVoice: Voice | null = null;
  private musicPreview: {
    token: number;
    track: string;
    activeTrack: string | null;
    previousTrack: string | null;
  } | null = null;
  private musicPreviewToken = 0;
  private currentAmbient: Voice | null = null;
  /** The combat bed's stems, keyed by id (task 563). */
  private combatVoices = new Map<SfxId, Voice>();

  private muted = false;
  /**
   * The live bus levels, 0..1 (task 561). Kept beside the Web Audio nodes for
   * two reasons: a level set before `init()` must be applied when the context
   * arrives (the settings sliders apply as soon as the store loads, which can
   * beat the async audio boot), and unmuting must restore the player's master
   * level rather than jumping back to full volume.
   *
   * Defaults match the bus gains `init()` used to hard-code.
   */
  private levels = { master: 1, music: 0.7, sfx: 0.9, ambient: 0.5 };

  async init(): Promise<void> {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) {
      console.warn('AudioManager: Web Audio not supported');
      return;
    }
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.dialogueDuckGain = this.ctx.createGain();
    this.musicGain.connect(this.dialogueDuckGain);
    this.dialogueDuckGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.connect(this.masterGain);
    this.applyLevels();
  }

  /** Pushes the stored levels and mute state onto the live buses (task 561). */
  private applyLevels(): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    this.masterGain?.gain.setValueAtTime(this.muted ? 0 : this.levels.master, at);
    this.musicGain?.gain.setValueAtTime(this.levels.music, at);
    this.dialogueDuckGain?.gain.setValueAtTime(
      this.dialogueDucked ? DIALOGUE_MUSIC_DUCK_LEVEL : 1,
      at,
    );
    this.sfxGain?.gain.setValueAtTime(this.levels.sfx, at);
    this.ambientGain?.gain.setValueAtTime(this.levels.ambient, at);
  }

  async loadManifest(manifestUrl: string): Promise<void> {
    const resp = await fetch(manifestUrl);
    const data = await resp.json();
    const assets: AudioAsset[] = data.assets || [];
    for (const asset of assets) {
      this.manifest.set(asset.id, asset);
    }
    console.log(`AudioManager: loaded ${assets.length} assets`);
    const preloadIds = assets
      .filter(a => a.id.startsWith('sfx-ui-'))
      .map(a => a.id);
    await this.preload(preloadIds);
  }

  async preload(ids: string[]): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx) return;
    await Promise.all(
      ids.map(async id => {
        if (this.buffers.has(id)) return;
        const asset = this.manifest.get(id);
        if (!asset) return;
        try {
          const resp = await fetch(webAudioPath(asset.path));
          const arrayBuffer = await resp.arrayBuffer();
          const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
          this.buffers.set(id, audioBuffer);
        } catch (err) {
          console.warn(`AudioManager: failed to load "${id}"`, err);
        }
      }),
    );
  }

  /**
   * Task 554: start a track, crossfading from whatever is playing into the new
   * one over {@link MUSIC_CROSSFADE_SECONDS}. The old track is faded and stopped,
   * not cut, and it keeps playing while the new buffer is fetched — a track that
   * is not loaded yet never silences the one that is.
   */
  async playMusic(track: string): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx || !this.musicGain) return;
    if (this.currentVoice?.id === track) {
      // A normal caller taking over the preview's same track means it should
      // keep playing after the Settings panel closes.
      this.musicPreview = null;
      this.musicPreviewToken++;
      return;
    }

    if (!this.buffers.has(track)) {
      await this.preload([track]);
    }
    const buffer = this.buffers.get(track);
    if (!buffer) return;

    // A different track owns playback only after it is ready to start. A failed
    // fetch leaves both the current audio and its preview lifecycle intact.
    this.musicPreview = null;
    this.musicPreviewToken++;
    const previous = this.currentVoice;
    if (previous) this.fadeOutVoice(previous, MUSIC_CROSSFADE_SECONDS);
    this.currentVoice = this.startVoice(track, buffer, MUSIC_CROSSFADE_SECONDS, this.musicGain);
  }

  /**
   * Task 570: preview a real music track, retaining the track that was playing
   * so the Settings panel can restore it. Returns false when the asset cannot
   * be loaded. A later preview or stop invalidates an in-flight load so it
   * cannot start after the panel has closed.
   */
  async previewMusic(track: string): Promise<boolean> {
    const priorPreview = this.musicPreview;
    const token = ++this.musicPreviewToken;
    const previousTrack = priorPreview ? priorPreview.previousTrack : this.currentVoice?.id ?? null;
    const activeTrack = priorPreview?.activeTrack ?? null;
    this.musicPreview = { token, track, activeTrack, previousTrack };

    try {
      if (!this.ctx) await this.init();
      if (this.musicPreview?.token !== token) return false;
      if (!this.ctx || !this.musicGain) {
        this.musicPreview = null;
        return false;
      }
      if (!this.buffers.has(track)) await this.preload([track]);

      if (this.musicPreview?.token !== token) return false;
      const buffer = this.buffers.get(track);
      if (!buffer) {
        this.musicPreview = null;
        return false;
      }

      // Start synchronously after the final token check. Calling playMusic here
      // would add another await; the panel could close during that gap and leave
      // preview audio playing after stopMusicPreview had already run.
      if (this.currentVoice?.id !== track) {
        if (this.currentVoice) this.fadeOutVoice(this.currentVoice, MUSIC_CROSSFADE_SECONDS);
        this.currentVoice = this.startVoice(track, buffer, MUSIC_CROSSFADE_SECONDS, this.musicGain);
      }
      if (this.musicPreview?.token === token) this.musicPreview.activeTrack = track;
      return this.musicPreview?.token === token && this.currentVoice?.id === track;
    } catch (error) {
      if (this.musicPreview?.token === token) this.musicPreview = null;
      throw error;
    }
  }

  /** Stops the settings preview and restores the prior track only if it still owns playback. */
  stopMusicPreview(): void {
    const preview = this.musicPreview;
    if (!preview) return;
    this.musicPreview = null;
    this.musicPreviewToken++;
    if (this.currentVoice?.id !== preview.track && this.currentVoice?.id !== preview.activeTrack) return;
    if (preview.previousTrack === this.currentVoice?.id) return;
    if (preview.previousTrack) {
      void this.playMusic(preview.previousTrack).catch(() => {});
    } else {
      this.stopMusic();
    }
  }

  /**
   * Task 571: an ambient bed under everything else — a town by day, weather, the
   * distant battlefield. One bed at a time: the previous bed fades out while the
   * new one fades in, and a bed that cannot be loaded leaves the playing one
   * alone, exactly as a track does.
   */
  async playAmbient(id: string): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx || !this.ambientGain) return;
    if (this.currentAmbient?.id === id) return;

    if (!this.buffers.has(id)) {
      await this.preload([id]);
    }
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    const previous = this.currentAmbient;
    if (previous) this.fadeOutVoice(previous, AMBIENT_CROSSFADE_SECONDS);
    this.currentAmbient = this.startVoice(id, buffer, AMBIENT_CROSSFADE_SECONDS, this.ambientGain);
  }

  /** Stops the ambient bed with its own short fade (task 571). */
  stopAmbient(): void {
    if (!this.ctx || !this.ambientGain) return;
    const voice = this.currentAmbient;
    this.currentAmbient = null;
    if (voice) this.fadeOutVoice(voice, 0.5);
  }

  /**
   * Builds a silent looping voice on `bus`; every stem started with the same
   * `at` stays in phase because they are the same length (task 563).
   */
  private buildVoice(id: string, buffer: AudioBuffer, bus: GainNode, at?: number): Voice {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.connect(bus);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(at);
    return { id, source, gain };
  }

  /** Builds a looping voice on `bus`: silent, then up to full over `seconds`. */
  private startVoice(id: string, buffer: AudioBuffer, seconds: number, bus: GainNode): Voice {
    const voice = this.buildVoice(id, buffer, bus);
    const now = this.ctx!.currentTime;
    voice.gain.gain.linearRampToValueAtTime(1, now + seconds);
    return voice;
  }

  /**
   * Task 563: start the layered combat bed. Every stem of `battle-theme` starts
   * together and stays silent until {@link setCombatIntensity} says which layers
   * should be heard; the plain battle track is faded out first so the two never
   * double up. A stem that will not load drops that layer only — the rest of the
   * bed still plays.
   */
  async startCombatMusic(): Promise<void> {
    this.musicPreview = null;
    this.musicPreviewToken++;
    if (!this.ctx) await this.init();
    if (!this.ctx || !this.musicGain) return;
    if (this.combatVoices.size > 0) return;
    this.stopMusic();
    await this.preload(COMBAT_LAYERS.map((layer) => layer.id));
    const at = this.ctx.currentTime;
    for (const layer of COMBAT_LAYERS) {
      const buffer = this.buffers.get(layer.id);
      if (!buffer) continue;
      this.combatVoices.set(layer.id, this.buildVoice(layer.id, buffer, this.musicGain, at));
    }
  }

  /**
   * Task 563: which layers the fight should be hearing, 0..1. Each stem ramps to
   * its target over {@link COMBAT_LAYER_RAMP_SECONDS}; a layer already where it
   * belongs is left alone, so calling this every frame is cheap and silent.
   */
  setCombatIntensity(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const wanted = new Set(battleLayersFor(intensity));
    const now = ctx.currentTime;
    for (const [id, voice] of this.combatVoices) {
      const target = wanted.has(id) ? 1 : 0;
      if (voice.gain.gain.value === target) continue;
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(target, now + COMBAT_LAYER_RAMP_SECONDS);
    }
  }

  /** Fades the whole combat bed out and forgets it (task 563). */
  stopCombatMusic(): void {
    if (!this.ctx) return;
    for (const voice of this.combatVoices.values()) this.fadeOutVoice(voice, 0.5);
    this.combatVoices.clear();
  }

  /** Ramps one voice to silence and stops its source after the fade. */
  private fadeOutVoice(voice: Voice, seconds: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    try {
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
      voice.source.stop(now + seconds + 0.1);
    } catch {
      try { voice.source.stop(); } catch { /* already stopped */ }
    }
  }

  /** Stops the music with its own short fade; there is nothing to cross into. */
  stopMusic(): void {
    this.musicPreview = null;
    this.musicPreviewToken++;
    if (!this.ctx || !this.musicGain) return;
    const voice = this.currentVoice;
    this.currentVoice = null;
    if (voice) this.fadeOutVoice(voice, 0.5);
  }

  async playSfx(id: SfxId, options: { volume?: number; rate?: number } = {}): Promise<void> {
    if (!this.ctx) await this.init();
    if (!this.ctx || !this.sfxGain || this.muted) return;
    if (!this.buffers.has(id)) {
      await this.preload([id]);
    }
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1.0;
    const gain = this.ctx.createGain();
    gain.gain.value = options.volume ?? 1.0;
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start();
  }

  playFootstep(surface: 'concrete' | 'dirt' | 'grass' = 'dirt'): void {
    const id = `sfx-foley-footstep-${surface}`;
    const rate = 0.9 + Math.random() * 0.2;
    this.playSfx(id, { volume: 0.6, rate });
  }

  playWeaponSound(type: WeaponSound = 'shot'): void {
    this.playSfx(WEAPON_SFX[type], { volume: 0.8 });
  }

  /** Task 509: a grenade or shell explosion, deliberately louder than a gunshot. */
  playExplosion(kind: ExplosionKind = 'grenade'): void {
    this.playSfx(EXPLOSION_SFX[kind], { volume: 0.9 });
  }

  playUiSound(type: 'click' | 'confirm' | 'error' | 'hover' | 'toggle' = 'click'): void {
    this.playSfx(`sfx-ui-${type}`, { volume: 0.5 });
  }

  /**
   * Task 562: silence everything without losing the slider values. Unmuting
   * restores the master level the player set, not full volume.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevels();
  }

  /**
   * Task 559: lower the music under a visible dialogue line. The attenuation
   * is its own gain node after the music level slider, so it leaves SFX,
   * ambient, and the player's saved music volume untouched. State is kept
   * before init and applied as soon as the context exists.
   */
  setDialogueDucked(ducked: boolean): void {
    if (this.dialogueDucked === ducked) return;
    this.dialogueDucked = ducked;
    const ctx = this.ctx;
    const gain = this.dialogueDuckGain?.gain;
    if (!ctx || !gain) return;

    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(
      ducked ? DIALOGUE_MUSIC_DUCK_LEVEL : 1,
      now + DIALOGUE_DUCK_RAMP_SECONDS,
    );
  }

  /**
   * Task 561: the master volume slider, 0..1. The level is remembered even
   * before `init()`; mute (task 562) still wins over it.
   */
  setMasterVolume(volume: number): void {
    this.levels.master = clampVolume(volume);
    this.applyLevels();
  }

  /**
   * Task 561: sets one bus level, 0..1. Remembered before `init()` so the
   * settings sliders can be applied at boot and not be lost to the async
   * audio startup.
   */
  setVolume(category: 'music' | 'sfx' | 'ambient', volume: number): void {
    this.levels[category] = clampVolume(volume);
    this.applyLevels();
  }
}

let instance: AudioManager | null = null;
export function getAudioManager(): AudioManager {
  if (!instance) instance = new AudioManager();
  return instance;
}
