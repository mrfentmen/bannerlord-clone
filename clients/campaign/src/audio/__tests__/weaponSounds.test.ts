/**
 * Tasks 501–505: the weapon cues name real assets.
 *
 * `shot` used to point at `sfx-weapon-gunshot`, which is not in the manifest, so
 * a trigger pull was silent while reload and dry-fire worked. Every entry is now
 * checked against the real manifest and the file on disk, the routing through the
 * mixer is asserted, and the broken id is asserted gone.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { AudioManager, WEAPON_SFX, type WeaponSound } from "../AudioManager.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../../public/audio-manifest.json", import.meta.url), "utf8"),
) as { assets: Array<{ id: string; path: string }> };

const CUES = Object.keys(WEAPON_SFX) as WeaponSound[];

describe("the weapon cue map (tasks 501–505)", () => {
  it.each(CUES)("%s names an asset that is in the manifest and on disk", (cue) => {
    const id = WEAPON_SFX[cue];
    const asset = MANIFEST.assets.find((entry) => entry.id === id);
    expect(asset, `${cue} points at ${id}, which is not in the manifest`).toBeTruthy();
    expect(existsSync(join(REPO_ROOT, asset!.path)), `${asset!.path} is missing`).toBe(true);
  });

  it("no longer points any cue at the id that never existed", () => {
    expect(Object.values(WEAPON_SFX)).not.toContain("sfx-weapon-gunshot");
  });

  it("routes each cue through the mixer at the weapon volume", async () => {
    const audio = new AudioManager();
    const playSfx = vi.spyOn(audio, "playSfx").mockResolvedValue(undefined);
    for (const cue of CUES) {
      playSfx.mockClear();
      audio.playWeaponSound(cue);
      expect(playSfx).toHaveBeenCalledWith(WEAPON_SFX[cue], { volume: 0.8 });
    }
  });

  it("defaults to a shot, which is the rifle", () => {
    const audio = new AudioManager();
    const playSfx = vi.spyOn(audio, "playSfx").mockResolvedValue(undefined);
    audio.playWeaponSound();
    expect(playSfx).toHaveBeenCalledWith(WEAPON_SFX.rifle, { volume: 0.8 });
  });
});
