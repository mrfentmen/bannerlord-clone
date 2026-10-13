/**
 * Task 576: rain takes the ambient bus while it falls.
 *
 * The mixer plays one bed at a time, so the scene rule is ordered rather than
 * mixed: rain wins over the clock, and the town bed comes back when the rain
 * stops — each change is a crossfade because the bed id changes. The rain asset
 * is checked against the real manifest and the file on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { type AudioManager, type SfxId } from "../AudioManager.js";
import {
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

describe("sceneAmbientBed (task 576)", () => {
  it("plays the rain bed while it rains, whatever the clock says", () => {
    expect(sceneAmbientBed({ time: "day", raining: true })).toBe(RAIN_BED);
    expect(sceneAmbientBed({ time: "night", raining: true })).toBe(RAIN_BED);
  });

  it("returns to the town bed when the rain stops", () => {
    expect(sceneAmbientBed({ time: "day", raining: false })).toBe(TOWN_DAY_BED);
    expect(sceneAmbientBed({ time: "day" })).toBe(TOWN_DAY_BED);
    expect(sceneAmbientBed({ time: "night", raining: false })).toBe(TOWN_NIGHT_BED);
  });

  it("tells the mixer the new bed when the weather turns, so it crossfades", async () => {
    const playAmbient = vi.fn(async (_id: SfxId) => {});
    const mixer = { playAmbient } as unknown as AudioManager;

    await playSceneAmbient(mixer, { time: "day" });
    await playSceneAmbient(mixer, { time: "day", raining: true });
    await playSceneAmbient(mixer, { time: "day", raining: false });

    expect(playAmbient.mock.calls.map(([id]) => id)).toEqual([
      TOWN_DAY_BED,
      RAIN_BED,
      TOWN_DAY_BED,
    ]);
  });
});

describe("the rain bed is a real asset", () => {
  it("is in the manifest with its file on disk", () => {
    const asset = MANIFEST.assets.find((entry) => entry.id === RAIN_BED);
    expect(asset, `${RAIN_BED} is not in public/audio-manifest.json`).toBeTruthy();
    expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
    expect(asset!.path).toContain("/audio/sfx/ambience/rain.mp3");
  });
});
