/**
 * @vitest-environment jsdom
 */
/**
 * Task 554: a music change is a two-second crossfade, not a cut.
 *
 * The test watches the real code path — `AudioManager` drives Web Audio's gain
 * automation — through a fake `AudioContext` that records every `setValueAtTime`,
 * `linearRampToValueAtTime` and `stop`. That is the same contract the browser
 * honours, so the assertions are about what the engine would actually do, not
 * about a mock's bookkeeping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, MUSIC_CROSSFADE_SECONDS } from "../AudioManager.js";

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

const TRACKS = [
  { id: "menu-theme", path: "/audio/menu-theme.mp3" },
  { id: "battle-theme", path: "/audio/battle-theme.mp3" },
];

let ctx: FakeAudioContext;

beforeEach(() => {
  ctx = new FakeAudioContext();
  (window as unknown as { AudioContext: new () => unknown }).AudioContext = class {
    constructor() {
      return ctx;
    }
  };
  vi.stubGlobal("fetch", async () => ({
    json: async () => ({ assets: TRACKS }),
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function readyAudio(): Promise<AudioManager> {
  const audio = new AudioManager();
  await audio.init();
  await audio.loadManifest("/audio-manifest.json");
  return audio;
}

/** The gain a voice was built with: the four mixer gains come first. */
function voiceGain(index: number): FakeGain {
  const gain = ctx.gains[5 + index];
  expect(gain, `no voice gain at index ${index}`).toBeTruthy();
  return gain!;
}

describe("music crossfade (task 554)", () => {
  it("fades the old track out while the new one fades in, over two seconds", async () => {
    const audio = await readyAudio();
    await audio.playMusic("menu-theme");

    ctx.currentTime = 10;
    await audio.playMusic("battle-theme");

    expect(ctx.sources.length).toBe(2);
    const [menu, battle] = ctx.sources;
    expect(menu!.started).toBe(true);
    expect(battle!.started).toBe(true);

    // The new voice ramps from silence to full over the crossfade.
    const incoming = voiceGain(1);
    expect(incoming.gain.events).toEqual([
      { kind: "set", value: 0, time: 10 },
      { kind: "ramp", value: 1, time: 10 + MUSIC_CROSSFADE_SECONDS },
    ]);

    // The outgoing voice is still running while that happens, then stops.
    const outgoing = voiceGain(0);
    expect(outgoing.gain.events.at(-1)).toEqual({
      kind: "ramp",
      value: 0,
      time: 10 + MUSIC_CROSSFADE_SECONDS,
    });
    expect(menu!.stoppedAt).toBeCloseTo(10 + MUSIC_CROSSFADE_SECONDS + 0.1, 5);
  });

  it("does not restart the track that is already playing", async () => {
    const audio = await readyAudio();
    await audio.playMusic("menu-theme");
    await audio.playMusic("menu-theme");
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.stoppedAt).toBeNull();
  });

  it("keeps the playing track when the next one cannot be loaded", async () => {
    const audio = await readyAudio();
    await audio.playMusic("menu-theme");
    await audio.playMusic("not-in-the-manifest");
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.stoppedAt).toBeNull();
  });

  it("stops the music with a short fade when there is nothing to cross into", async () => {
    const audio = await readyAudio();
    await audio.playMusic("menu-theme");
    ctx.currentTime = 5;
    audio.stopMusic();
    expect(ctx.sources[0]!.stoppedAt).toBeCloseTo(5.6, 5);
    expect(voiceGain(0).gain.events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 5.5 });
  });
});
