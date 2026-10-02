/**
 * Task 577: a battle close enough to hear owns the ambient bus.
 *
 * The mixer plays one bed at a time, so the nearness order is battle, then rain,
 * then the town's clock. The rumble asset is checked against the real manifest
 * and the file on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { type AudioManager, type SfxId } from "../AudioManager.js";
import {
  BATTLEFIELD_BED,
  RAIN_BED,
  TOWN_DAY_BED,
  TOWN_NIGHT_BED,
  playSceneAmbient,
  sceneAmbientBed,
} from "../ambientBeds.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../../public/audio-manifest.json", import.meta.url), "utf8"),
) as { assets: Array<{ id: string; path: string }> };

describe("sceneAmbientBed with a battle nearby (task 577)", () => {
  it("gives the bus to the battle rumble over rain and the clock", () => {
    expect(sceneAmbientBed({ time: "day", battle: true })).toBe(BATTLEFIELD_BED);
    expect(sceneAmbientBed({ time: "night", raining: true, battle: true })).toBe(BATTLEFIELD_BED);
  });

  it("hands the bus back to the scene when the battle ends", () => {
    expect(sceneAmbientBed({ time: "night", battle: false })).toBe(TOWN_NIGHT_BED);
    expect(sceneAmbientBed({ time: "day", raining: true, battle: false })).toBe(RAIN_BED);
  });

  it("moves the mixer from the town to the battle and back as the fight comes and goes", async () => {
    const playAmbient = vi.fn(async (_id: SfxId) => {});
    const mixer = { playAmbient } as unknown as AudioManager;

    await playSceneAmbient(mixer, { time: "day" });
    await playSceneAmbient(mixer, { time: "day", battle: true });
    await playSceneAmbient(mixer, { time: "day", battle: false });

    expect(playAmbient.mock.calls.map(([id]) => id)).toEqual([
      TOWN_DAY_BED,
      BATTLEFIELD_BED,
      TOWN_DAY_BED,
    ]);
  });
});

describe("the battlefield bed is a real asset", () => {
  it("is in the manifest with its file on disk", () => {
    const asset = MANIFEST.assets.find((entry) => entry.id === BATTLEFIELD_BED);
    expect(asset, `${BATTLEFIELD_BED} is not in public/audio-manifest.json`).toBeTruthy();
    expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
    expect(asset!.path).toContain("/audio/sfx/ambience/distant-battle.mp3");
  });
});
