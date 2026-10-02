/**
 * @vitest-environment jsdom
 */
/**
 * Task 563: the combat bed gains layers as the fight closes.
 *
 * The ladder is pure and checked first; then a fake `AudioContext` proves the
 * mixer's half — every stem starts together and silent, `setCombatIntensity`
 * ramps layers in and out (leaving a layer that is already right alone), and the
 * plain battle track is faded out so the two beds never double up. The four stem
 * ids are checked against the real manifest and the files on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, COMBAT_LAYER_RAMP_SECONDS } from "../AudioManager.js";
import { COMBAT_LAYERS, battleLayersFor } from "../combatLayers.js";

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
  connect(): void {}
  disconnect(): void {}
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  connect(): void {}
  disconnect(): void {}
  start(when?: number): void {
    this.startedAt = when ?? 0;
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
    return Promise.resolve({ duration: 8 });
  }
}

const TRACKS = [
  { id: "menu-theme", path: "/audio/menu-theme.mp3" },
  ...COMBAT_LAYERS.map((layer) => ({ id: layer.id, path: `/audio/${layer.id}.mp3` })),
];

// jsdom gives `import.meta.url` a browser scheme, so anchor to the package root
// that vitest runs from instead of to the module URL.
const CAMPAIGN_DIR = process.cwd();
const REPO_ROOT = resolve(CAMPAIGN_DIR, "..", "..");
const MANIFEST = JSON.parse(
  readFileSync(join(CAMPAIGN_DIR, "public/audio-manifest.json"), "utf8"),
) as { assets: Array<{ id: string; path: string }> };

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

/** The mixer builds four gains first; the next four are the stems in ladder order. */
function stemGain(index: number): FakeGain {
  const gain = ctx.gains[4 + index];
  expect(gain, `no stem gain at index ${index}`).toBeTruthy();
  return gain!;
}

describe("battleLayersFor (task 563)", () => {
  it("adds layers as intensity rises", () => {
    expect(battleLayersFor(0)).toEqual([]);
    expect(battleLayersFor(0.2)).toEqual(["battle-theme-stem-drums"]);
    expect(battleLayersFor(0.4)).toEqual(["battle-theme-stem-drums", "battle-theme-stem-bass"]);
    expect(battleLayersFor(0.6)).toEqual([
      "battle-theme-stem-drums",
      "battle-theme-stem-bass",
      "battle-theme-stem-fx",
    ]);
    expect(battleLayersFor(1)).toEqual(COMBAT_LAYERS.map((layer) => layer.id));
  });

  it("clamps a caller's number instead of trusting it", () => {
    expect(battleLayersFor(Number.NaN)).toEqual([]);
    expect(battleLayersFor(-3)).toEqual([]);
    expect(battleLayersFor(9)).toEqual(COMBAT_LAYERS.map((layer) => layer.id));
  });
});

describe("startCombatMusic and setCombatIntensity (task 563)", () => {
  it("starts every stem together, looping and silent", async () => {
    const audio = await readyAudio();
    ctx.currentTime = 12;
    await audio.startCombatMusic();

    expect(ctx.sources.length).toBe(COMBAT_LAYERS.length);
    for (const source of ctx.sources) {
      expect(source.loop).toBe(true);
      expect(source.startedAt).toBe(12);
    }
    for (let index = 0; index < COMBAT_LAYERS.length; index++) {
      const gain = stemGain(index);
      expect(gain.gain.value).toBe(0);
      expect(gain.gain.events).toEqual([{ kind: "set", value: 0, time: 12 }]);
    }
  });

  it("fades the plain battle track out so the two beds never double up", async () => {
    const audio = await readyAudio();
    await audio.playMusic("menu-theme");
    ctx.currentTime = 5;
    await audio.startCombatMusic();
    expect(ctx.sources[0]!.stoppedAt).toBeCloseTo(5.6, 5);
  });

  it("ramps the layers in as the fight closes and out as it opens", async () => {
    const audio = await readyAudio();
    await audio.startCombatMusic();

    ctx.currentTime = 30;
    audio.setCombatIntensity(0.9);
    for (let index = 0; index < COMBAT_LAYERS.length; index++) {
      expect(stemGain(index).gain.events.at(-1)).toEqual({
        kind: "ramp",
        value: 1,
        time: 30 + COMBAT_LAYER_RAMP_SECONDS,
      });
    }

    ctx.currentTime = 40;
    const drums = stemGain(0);
    const before = drums.gain.events.length;
    audio.setCombatIntensity(0.25);
    // The drums belong at this intensity already: nothing is re-sent.
    expect(drums.gain.events.length).toBe(before);
    expect(drums.gain.value).toBe(1);
    // The other three ramp back down.
    for (let index = 1; index < COMBAT_LAYERS.length; index++) {
      expect(stemGain(index).gain.events.at(-1)).toEqual({
        kind: "ramp",
        value: 0,
        time: 40 + COMBAT_LAYER_RAMP_SECONDS,
      });
    }
  });

  it("stops the whole bed with a fade", async () => {
    const audio = await readyAudio();
    await audio.startCombatMusic();
    ctx.currentTime = 60;
    audio.stopCombatMusic();
    for (const source of ctx.sources) {
      expect(source.stoppedAt).toBeCloseTo(60.6, 5);
    }
  });
});

describe("the combat stems are real assets", () => {
  it.each(COMBAT_LAYERS.map((layer) => layer.id))(
    "%s is in the manifest with its file on disk",
    (id) => {
      const asset = MANIFEST.assets.find((entry) => entry.id === id);
      expect(asset, `${id} is not in public/audio-manifest.json`).toBeTruthy();
      expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
    },
  );
});
