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

export interface AudioAsset {
  id: string;
  path: string;
  category?: string;
  loop?: boolean;
  volume?: number;
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
 * Task 554: how long one music track takes to hand over to the next, in seconds.
 * Long enough that the two are heard as one move rather than a cut, short enough
 * that the battle theme is in place before the first volley.
 */
export const MUSIC_CROSSFADE_SECONDS = 2;

/** One playing music track: its source and the gain that carries its fade. */
interface MusicVoice {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private manifest = new Map<string, AudioAsset>();

  private currentVoice: MusicVoice | null = null;

  private muted = false;

  async init(): Promise<void> {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) {
      console.warn('AudioManager: Web Audio not supported');
      return;
    }
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.7;
    this.musicGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.masterGain);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.5;
    this.ambientGain.connect(this.masterGain);
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
          const resp = await fetch(asset.path);
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
    if (this.currentVoice?.id === track) return;

    if (!this.buffers.has(track)) {
      await this.preload([track]);
    }
    const buffer = this.buffers.get(track);
    if (!buffer) return;

    const previous = this.currentVoice;
    if (previous) this.fadeOutVoice(previous, MUSIC_CROSSFADE_SECONDS);
    this.currentVoice = this.startVoice(track, buffer, MUSIC_CROSSFADE_SECONDS);
  }

  /** Builds a music voice: silent, then up to full over `seconds` (task 554). */
  private startVoice(track: string, buffer: AudioBuffer, seconds: number): MusicVoice {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + seconds);
    gain.connect(this.musicGain!);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    return { id: track, source, gain };
  }

  /** Ramps one voice to silence and stops its source after the fade (task 554). */
  private fadeOutVoice(voice: MusicVoice, seconds: number): void {
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

  playWeaponSound(type: 'shot' | 'dry-fire' | 'reload' = 'shot'): void {
    const map = {
      'shot': 'sfx-weapon-gunshot',
      'dry-fire': 'sfx-weapon-dry-fire',
      'reload': 'sfx-weapon-reload',
    };
    this.playSfx(map[type], { volume: 0.8 });
  }

  playUiSound(type: 'click' | 'confirm' | 'error' | 'hover' | 'toggle' = 'click'): void {
    this.playSfx(`sfx-ui-${type}`, { volume: 0.5 });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
  }

  setVolume(category: 'music' | 'sfx' | 'ambient', volume: number): void {
    if (!this.ctx) return;
    const gain = { music: this.musicGain, sfx: this.sfxGain, ambient: this.ambientGain }[category];
    if (gain) {
      gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime);
    }
  }
}

let instance: AudioManager | null = null;
export function getAudioManager(): AudioManager {
  if (!instance) instance = new AudioManager();
  return instance;
}
