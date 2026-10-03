/**
 * @vitest-environment jsdom
 */
/**
 * Task 571: an ambient bed — starting with a town by day — loops under the music
 * on its own bus, and changing beds is a crossfade, not a cut.
 *
 * The town's daytime bed is the real manifest asset `sfx-ambience-town-day`, so a
 * wrong id would fail the load path here rather than going silent on the map.
 * The fake `AudioContext` records the gain automation and the bus each voice is
 * connected to, which is the part that decides what a volume slider moves.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AMBIENT_CROSSFADE_SECONDS, AudioManager } from "../AudioManager.js";

class FakeParam {
  value = 0;
  events: Array<{ kind: "set" | "ramp"; value: number; time: number }> = [];
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
  connectedTo: unknown[] = [];
  connect(target: unknown): void {
    this.connectedTo.push(target);
  }
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

const BEDS = [
  { id: "sfx-ambience-town-day", path: "/audio/sfx/ambience/town-day.mp3" },
  { id: "sfx-ambience-rain", path: "/audio/sfx/ambience/rain.mp3" },
];

const TOWN_DAY = "sfx-ambience-town-day";

let ctx: FakeAudioContext;

beforeEach(() => {
  ctx = new FakeAudioContext();
  (window as unknown as { AudioContext: new () => unknown }).AudioContext = class {
    constructor() {
      return ctx;
    }
  };
  vi.stubGlobal("fetch", async () => ({
    json: async () => ({ assets: BEDS }),
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

/** The mixer builds four gains first: master, music, sfx, ambient. */
const AMBIENT_BUS = 4;
/** The first voice's gain comes right after the mixer's. */
function firstVoiceGain(): FakeGain {
  const gain = ctx.gains[5];
  expect(gain, "no voice gain was built").toBeTruthy();
  return gain!;
}

describe("ambient bed (task 571)", () => {
  it("plays the town's daytime bed as a looping voice on the ambient bus", async () => {
    const audio = await readyAudio();
    ctx.currentTime = 4;
    await audio.playAmbient(TOWN_DAY);

    expect(ctx.sources.length).toBe(1);
    const bed = ctx.sources[0]!;
    expect(bed.started).toBe(true);
    expect(bed.loop).toBe(true);

    const gain = firstVoiceGain();
    expect(gain.connectedTo).toContain(ctx.gains[AMBIENT_BUS]);
    expect(gain.gain.events).toEqual([
      { kind: "set", value: 0, time: 4 },
      { kind: "ramp", value: 1, time: 4 + AMBIENT_CROSSFADE_SECONDS },
    ]);
  });

  it("crossfades when the bed changes", async () => {
    const audio = await readyAudio();
    await audio.playAmbient(TOWN_DAY);
    ctx.currentTime = 30;
    await audio.playAmbient("sfx-ambience-rain");

    expect(ctx.sources.length).toBe(2);
    expect(ctx.sources[0]!.stoppedAt).toBeCloseTo(30 + AMBIENT_CROSSFADE_SECONDS + 0.1, 5);
    expect(firstVoiceGain().gain.events.at(-1)).toEqual({
      kind: "ramp",
      value: 0,
      time: 30 + AMBIENT_CROSSFADE_SECONDS,
    });
  });

  it("does not restart a bed that is already playing", async () => {
    const audio = await readyAudio();
    await audio.playAmbient(TOWN_DAY);
    await audio.playAmbient(TOWN_DAY);
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.stoppedAt).toBeNull();
  });

  it("keeps the playing bed when the next one cannot be loaded", async () => {
    const audio = await readyAudio();
    await audio.playAmbient(TOWN_DAY);
    await audio.playAmbient("sfx-ambience-nonexistent");
    expect(ctx.sources.length).toBe(1);
    expect(ctx.sources[0]!.stoppedAt).toBeNull();
  });

  it("fades the bed out on stop", async () => {
    const audio = await readyAudio();
    await audio.playAmbient(TOWN_DAY);
    ctx.currentTime = 7;
    audio.stopAmbient();
    expect(ctx.sources[0]!.stoppedAt).toBeCloseTo(7.6, 5);
    expect(firstVoiceGain().gain.events.at(-1)).toEqual({ kind: "ramp", value: 0, time: 7.5 });
  });
});
