/**
 * Task 572: the town's ambient bed follows the clock.
 *
 * Two layers of evidence: the mapping is pure and checked across the four phases,
 * and the two bed ids are checked against the real `public/audio-manifest.json`
 * and the files on disk, so a renamed asset fails here rather than going silent.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { webAudioPath, type AudioManager, type SfxId } from "../AudioManager.js";
import {
  TOWN_DAY_BED,
  TOWN_NIGHT_BED,
  playTownAmbient,
  townAmbientBed,
  type AmbientTimeOfDay,
} from "../ambientBeds.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../../public/audio-manifest.json", import.meta.url), "utf8"),
) as { assets: Array<{ id: string; path: string }> };

describe("townAmbientBed (task 572)", () => {
  it("plays the day bed from dawn through the day", () => {
    expect(townAmbientBed("dawn")).toBe(TOWN_DAY_BED);
    expect(townAmbientBed("day")).toBe(TOWN_DAY_BED);
  });

  it("plays the night bed from dusk through the night", () => {
    expect(townAmbientBed("dusk")).toBe(TOWN_NIGHT_BED);
    expect(townAmbientBed("night")).toBe(TOWN_NIGHT_BED);
  });

  it("hands the bed to the mixer's ambient bus", async () => {
    const playAmbient = vi.fn(async (_id: SfxId) => {});
    const mixer = { playAmbient } as unknown as AudioManager;
    for (const time of ["dawn", "day", "dusk", "night"] satisfies AmbientTimeOfDay[]) {
      playAmbient.mockClear();
      await playTownAmbient(mixer, time);
      expect(playAmbient).toHaveBeenCalledWith(townAmbientBed(time));
    }
  });
});

describe("the beds are real assets", () => {
  it.each([TOWN_DAY_BED, TOWN_NIGHT_BED])("%s is in the manifest with its file on disk", (id) => {
    const asset = MANIFEST.assets.find((entry) => entry.id === id);
    expect(asset, `${id} is not in public/audio-manifest.json`).toBeTruthy();
    expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
    expect(webAudioPath(asset!.path)).toBe(`/audio/sfx/ambience/${id.slice("sfx-ambience-".length)}.mp3`);
  });
});
