/**
 * @vitest-environment jsdom
 */
/**
 * Task 561: the volume sliders reach the mixer.
 *
 * The test drives the real code path — `applyAudioSettings` calls into
 * `AudioManager`, which writes Web Audio gain automation — through a fake
 * `AudioContext` whose gain nodes record every `setValueAtTime`. That is the
 * same contract the browser honours, so the assertions are about what the
 * engine would actually do.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioManager,
  DIALOGUE_DUCK_RAMP_SECONDS,
  DIALOGUE_MUSIC_DUCK_LEVEL,
} from "../AudioManager.js";
import { applyAudioSettings } from "../applySettings.js";

interface ParamEvent {
  kind: "set" | "ramp";
  value: number;
  time: number;
}

class FakeParam {
  value = 0;
  events: ParamEvent[] = [];
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: "set", value, time });
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: "ramp", value, time });
  }
  cancelScheduledValues(): void {}
}

class FakeGain {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
  started = false;
  stoppedAt: number | null = null;
  connect(): void {}
  disconnect(): void {}
  start(): void {
    this.started = true;
  }
  stop(when?: number): void {
    this.stoppedAt = when ?? null;
  }
}

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({ duration: 1 });
  }
}

/** The mixer's buses, in the order `init()` creates them. */
const MASTER = 0;
const MUSIC = 1;
const DUCK = 2;
const SFX = 3;
const AMBIENT = 4;

let ctx: FakeAudioContext;

beforeEach(() => {
  ctx = new FakeAudioContext();
  (window as unknown as { AudioContext: new () => unknown }).AudioContext = class {
    constructor() {
      return ctx;
    }
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function bus(index: number): FakeGain {
  const gain = ctx.gains[index];
  expect(gain, `no mixer gain at index ${index}`).toBeTruthy();
  return gain!;
}

describe("volume slider wiring (task 561)", () => {
  it("keeps the mixer's balance defaults when nothing is applied", async () => {
    const audio = new AudioManager();
    await audio.init();

    expect(bus(MASTER).gain.value).toBe(1);
    expect(bus(MUSIC).gain.value).toBe(0.7);
    expect(bus(DUCK).gain.value).toBe(1);
    expect(bus(SFX).gain.value).toBe(0.9);
    expect(bus(AMBIENT).gain.value).toBe(0.5);
  });

  it("applies the sliders to their buses even when set before the context exists", async () => {
    const audio = new AudioManager();
    // The settings store loads synchronously while the audio boot is async, so
    // the levels must survive being set before `init()`.
    applyAudioSettings(audio, { audioMuted: false, masterVolume: 0.5, musicVolume: 0.25, sfxVolume: 0.75 });
    await audio.init();

    expect(bus(MASTER).gain.value).toBe(0.5);
    expect(bus(MUSIC).gain.value).toBe(0.25);
    expect(bus(SFX).gain.value).toBe(0.75);
    expect(bus(AMBIENT).gain.value).toBe(0.25);
  });

  it("applies a slider move live, after the context exists", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { audioMuted: false, masterVolume: 0.2, musicVolume: 0.4, sfxVolume: 0.9 });

    expect(bus(MASTER).gain.value).toBe(0.2);
    expect(bus(MUSIC).gain.value).toBe(0.4);
    expect(bus(SFX).gain.value).toBe(0.9);
    expect(bus(AMBIENT).gain.value).toBe(0.4);
  });

  it("the ambient bed follows the music slider", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { audioMuted: false, masterVolume: 1, musicVolume: 0.3, sfxVolume: 1 });
    expect(bus(AMBIENT).gain.value).toBe(0.3);

    applyAudioSettings(audio, { audioMuted: false, masterVolume: 1, musicVolume: 0, sfxVolume: 1 });
    expect(bus(AMBIENT).gain.value).toBe(0);
  });

  it("clamps out-of-range and garbage values to silence, never louder", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { audioMuted: false, masterVolume: 1.5, musicVolume: -2, sfxVolume: NaN });

    expect(bus(MASTER).gain.value).toBe(1);
    expect(bus(MUSIC).gain.value).toBe(0);
    expect(bus(SFX).gain.value).toBe(0);
  });

  it("the settings mute switch silences all buses without changing their slider values", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { audioMuted: true, masterVolume: 0.4, musicVolume: 0.5, sfxVolume: 0.6 });

    expect(bus(MASTER).gain.value).toBe(0);
    expect(bus(MUSIC).gain.value).toBe(0.5);
    expect(bus(SFX).gain.value).toBe(0.6);
    expect(bus(AMBIENT).gain.value).toBe(0.5);

    applyAudioSettings(audio, { audioMuted: false, masterVolume: 0.4, musicVolume: 0.5, sfxVolume: 0.6 });
    expect(bus(MASTER).gain.value).toBe(0.4);
  });

  it("unmuting restores the master slider, not full volume", async () => {
    const audio = new AudioManager();
    await audio.init();
    applyAudioSettings(audio, { audioMuted: false, masterVolume: 0.4, musicVolume: 0.5, sfxVolume: 0.5 });

    audio.setMuted(true);
    expect(bus(MASTER).gain.value).toBe(0);

    audio.setMuted(false);
    expect(bus(MASTER).gain.value).toBe(0.4);
  });

  it("a muted mixer stays silent when the master slider moves", async () => {
    const audio = new AudioManager();
    await audio.init();

    audio.setMuted(true);
    applyAudioSettings(audio, { audioMuted: true, masterVolume: 0.9, musicVolume: 0.9, sfxVolume: 0.9 });

    expect(bus(MASTER).gain.value).toBe(0);
    expect(bus(MUSIC).gain.value).toBe(0.9);
    expect(bus(SFX).gain.value).toBe(0.9);
  });

  it("ducks only the post-slider music gain while dialogue is visible", async () => {
    const audio = new AudioManager();
    await audio.init();
    applyAudioSettings(audio, { audioMuted: false, masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.8 });
    ctx.currentTime = 12;

    audio.setDialogueDucked(true);

    expect(bus(MUSIC).gain.value).toBe(0.6);
    expect(bus(DUCK).gain.value).toBe(DIALOGUE_MUSIC_DUCK_LEVEL);
    expect(bus(DUCK).gain.events.at(-1)).toEqual({
      kind: "ramp",
      value: DIALOGUE_MUSIC_DUCK_LEVEL,
      time: 12 + DIALOGUE_DUCK_RAMP_SECONDS,
    });
    expect(bus(SFX).gain.value).toBe(0.8);
    expect(bus(AMBIENT).gain.value).toBe(0.6);
  });

  it("restores music when dialogue hides and ignores repeated state", async () => {
    const audio = new AudioManager();
    await audio.init();
    audio.setDialogueDucked(true);
    const duck = bus(DUCK);
    const eventCount = duck.gain.events.length;

    audio.setDialogueDucked(true);
    expect(duck.gain.events).toHaveLength(eventCount);

    ctx.currentTime = 3;
    audio.setDialogueDucked(false);
    expect(duck.gain.events.at(-1)).toEqual({
      kind: "ramp",
      value: 1,
      time: 3 + DIALOGUE_DUCK_RAMP_SECONDS,
    });
  });

  it("remembers dialogue ducking requested before the audio context", async () => {
    const audio = new AudioManager();
    audio.setDialogueDucked(true);
    await audio.init();
    expect(bus(DUCK).gain.value).toBe(DIALOGUE_MUSIC_DUCK_LEVEL);
  });
});
