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
import { AudioManager } from "../AudioManager.js";
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

/** The mixer's four buses, in the order `init()` creates them. */
const MASTER = 0;
const MUSIC = 1;
const SFX = 2;
const AMBIENT = 3;

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
    expect(bus(SFX).gain.value).toBe(0.9);
    expect(bus(AMBIENT).gain.value).toBe(0.5);
  });

  it("applies the sliders to their buses even when set before the context exists", async () => {
    const audio = new AudioManager();
    // The settings store loads synchronously while the audio boot is async, so
    // the levels must survive being set before `init()`.
    applyAudioSettings(audio, { masterVolume: 0.5, musicVolume: 0.25, sfxVolume: 0.75 });
    await audio.init();

    expect(bus(MASTER).gain.value).toBe(0.5);
    expect(bus(MUSIC).gain.value).toBe(0.25);
    expect(bus(SFX).gain.value).toBe(0.75);
    expect(bus(AMBIENT).gain.value).toBe(0.25);
  });

  it("applies a slider move live, after the context exists", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { masterVolume: 0.2, musicVolume: 0.4, sfxVolume: 0.9 });

    expect(bus(MASTER).gain.value).toBe(0.2);
    expect(bus(MUSIC).gain.value).toBe(0.4);
    expect(bus(SFX).gain.value).toBe(0.9);
    expect(bus(AMBIENT).gain.value).toBe(0.4);
  });

  it("the ambient bed follows the music slider", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { masterVolume: 1, musicVolume: 0.3, sfxVolume: 1 });
    expect(bus(AMBIENT).gain.value).toBe(0.3);

    applyAudioSettings(audio, { masterVolume: 1, musicVolume: 0, sfxVolume: 1 });
    expect(bus(AMBIENT).gain.value).toBe(0);
  });

  it("clamps out-of-range and garbage values to silence, never louder", async () => {
    const audio = new AudioManager();
    await audio.init();

    applyAudioSettings(audio, { masterVolume: 1.5, musicVolume: -2, sfxVolume: NaN });

    expect(bus(MASTER).gain.value).toBe(1);
    expect(bus(MUSIC).gain.value).toBe(0);
    expect(bus(SFX).gain.value).toBe(0);
  });

  it("unmuting restores the master slider, not full volume", async () => {
    const audio = new AudioManager();
    await audio.init();
    applyAudioSettings(audio, { masterVolume: 0.4, musicVolume: 0.5, sfxVolume: 0.5 });

    audio.setMuted(true);
    expect(bus(MASTER).gain.value).toBe(0);

    audio.setMuted(false);
    expect(bus(MASTER).gain.value).toBe(0.4);
  });

  it("a muted mixer stays silent when the master slider moves", async () => {
    const audio = new AudioManager();
    await audio.init();

    audio.setMuted(true);
    applyAudioSettings(audio, { masterVolume: 0.9, musicVolume: 0.9, sfxVolume: 0.9 });

    expect(bus(MASTER).gain.value).toBe(0);
    expect(bus(MUSIC).gain.value).toBe(0.9);
    expect(bus(SFX).gain.value).toBe(0.9);
  });
});
