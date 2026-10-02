import { describe, expect, it } from "vitest";
import { SCENE_TRACKS, SFX_FILES, sfxUrl, trackUrl } from "../audio.js";

describe("trackUrl", () => {
  it("maps every scene to an mp3 under audio/music/", () => {
    const scenes = Object.keys(SCENE_TRACKS) as (keyof typeof SCENE_TRACKS)[];
    expect(scenes.length).toBe(10);
    for (const scene of scenes) {
      const url = trackUrl(scene);
      expect(url.startsWith("audio/music/")).toBe(true);
      expect(url.endsWith(".mp3")).toBe(true);
    }
  });

  it("resolves the ten known tracks", () => {
    expect(trackUrl("menu")).toBe("audio/music/menu-theme-mix.mp3");
    expect(trackUrl("battle")).toBe("audio/music/battle-theme-mix.mp3");
    expect(trackUrl("siege")).toBe("audio/music/siege-assault-mix.mp3");
    expect(trackUrl("tavern")).toBe("audio/music/tavern-rest-mix.mp3");
    expect(trackUrl("pursuit")).toBe("audio/music/pursuit-mix.mp3");
    expect(trackUrl("campaign-night")).toBe("audio/music/night-patrol-mix.mp3");
  });

  it("honors a custom base path", () => {
    expect(trackUrl("menu", "/static/")).toBe("/static/music/menu-theme-mix.mp3");
  });
});

describe("sfxUrl", () => {
  it("covers all 37 effects", () => {
    expect(Object.keys(SFX_FILES).length).toBe(37);
  });

  it("resolves known effects under audio/sfx/", () => {
    expect(sfxUrl("coin")).toBe("audio/sfx/ui/coin.mp3");
    expect(sfxUrl("horn")).toBe("audio/sfx/battle/horn.mp3");
    expect(sfxUrl("helicopter")).toBe("audio/sfx/vehicle/helicopter.mp3");
    expect(sfxUrl("quest-complete")).toBe("audio/sfx/ui/quest-complete.mp3");
  });

  it("every entry ends in .mp3", () => {
    for (const name of Object.keys(SFX_FILES)) {
      expect(SFX_FILES[name]?.endsWith(".mp3")).toBe(true);
    }
  });
});
