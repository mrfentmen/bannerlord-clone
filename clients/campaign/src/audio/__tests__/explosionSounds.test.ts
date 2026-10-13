/**
 * Task 509: the grenade (and shell) explosion cues name real assets.
 *
 * The manifest carries a small explosion for a grenade and a large one for a
 * shell; both are checked against the manifest and the files on disk, and the
 * routing through the mixer is asserted at the explosion volume.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AudioManager, EXPLOSION_SFX, type ExplosionKind } from "../AudioManager.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../../public/audio-manifest.json", import.meta.url), "utf8"),
) as { assets: Array<{ id: string; path: string; contents?: string }> };

const KINDS = Object.keys(EXPLOSION_SFX) as ExplosionKind[];

describe("the explosion cue map (task 509)", () => {
  it.each(KINDS)("%s names an asset that is in the manifest and on disk", (kind) => {
    const id = EXPLOSION_SFX[kind];
    const asset = MANIFEST.assets.find((entry) => entry.id === id);
    expect(asset, `${kind} points at ${id}, which is not in the manifest`).toBeTruthy();
    expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
  });

  it("uses the manifest's grenade asset for the grenade", () => {
    const asset = MANIFEST.assets.find((entry) => entry.id === EXPLOSION_SFX.grenade);
    expect(asset?.contents?.toLowerCase()).toContain("grenade");
  });

  it("routes each explosion through the mixer louder than a gunshot", () => {
    const audio = new AudioManager();
    const playSfx = vi.spyOn(audio, "playSfx").mockResolvedValue(undefined);
    for (const kind of KINDS) {
      playSfx.mockClear();
      audio.playExplosion(kind);
      expect(playSfx).toHaveBeenCalledWith(EXPLOSION_SFX[kind], { volume: 0.9 });
    }
  });

  it("defaults to a grenade", () => {
    const audio = new AudioManager();
    const playSfx = vi.spyOn(audio, "playSfx").mockResolvedValue(undefined);
    audio.playExplosion();
    expect(playSfx).toHaveBeenCalledWith(EXPLOSION_SFX.grenade, { volume: 0.9 });
  });
});
