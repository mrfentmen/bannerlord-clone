/**
 * @vitest-environment jsdom
 *
 * Expression tests (MASTER_PLAN 3G, tasks 123-131).
 */

import { describe, expect, it } from "vitest";
import {
  COSMETICS,
  createMusicPlayer,
  createNicknames,
  createPhotoMode,
  createWardrobe,
  customizePortrait,
  engraveMotto,
  MUSIC_TRACKS,
  portraitKey,
  seasonEpithet,
  swearOath,
  VICTORY_POSES,
  weaponTooltip,
  writeChronicle,
  type AudioTarget,
} from "../index.js";

const NULL_AUDIO: AudioTarget = {
  playTrack: () => {},
  pause: () => {},
  resume: () => {},
  stop: () => {},
};

describe("photo mode (task 123)", () => {
  it("pauses, hides UI, orbits, and captures", () => {
    const pm = createPhotoMode();
    expect(pm.state().active).toBe(false);
    pm.enter();
    expect(pm.state().uiHidden).toBe(true);
    pm.orbit(0.5, 0.1);
    expect(pm.state().yaw).toBeCloseTo(0.5, 5);
    pm.zoom(0.5);
    expect(pm.state().distance).toBe(5);
    const shot = pm.capture({ captureFrame: () => "data:image/png,xxx" });
    expect(shot).toContain("data:image/png");
    pm.exit();
    expect(pm.state().active).toBe(false);
    expect(() => pm.capture({ captureFrame: () => "" })).toThrow();
  });
});

describe("wardrobe (tasks 124, 128)", () => {
  it("unlocks and equips cosmetics and poses", () => {
    expect(COSMETICS.length).toBeGreaterThanOrEqual(6);
    expect(VICTORY_POSES.length).toBeGreaterThanOrEqual(4);
    const w = createWardrobe();
    expect(() => w.equip("war-paint", "paint-ash")).toThrow(); // not unlocked
    w.unlock("paint-ash");
    w.equip("war-paint", "paint-ash");
    expect(w.equipped()["war-paint"]).toBe("paint-ash");
    w.unlock("pose-fist");
    w.setVictoryPose("pose-fist");
    expect(w.victoryPose()).toBe("pose-fist");
  });
});

describe("oaths and chronicle (tasks 125-126)", () => {
  it("swears oaths and writes the story", () => {
    const oath = swearOath("I will hold the river.", 12);
    expect(oath.text).toContain("river");
    expect(() => swearOath("   ", 1)).toThrow();
    const chapters = writeChronicle([
      { season: 2, kind: "battle", text: "Beat the raiders." },
      { season: 1, kind: "marriage", text: "Wed Lady B." },
      { season: 2, kind: "treaty", text: "Signed the mill pact." },
    ]);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toContain("Season 1");
    expect(chapters[1]).toContain("Beat the raiders.");
    expect(seasonEpithet([], 5)).toContain("quiet");
  });
});

describe("music player (task 127)", () => {
  it("lists tracks and drives the audio target", () => {
    expect(MUSIC_TRACKS.length).toBeGreaterThanOrEqual(8);
    const played: string[] = [];
    const audio: AudioTarget = { ...NULL_AUDIO, playTrack: (id) => played.push(id) };
    const player = createMusicPlayer();
    expect(player.tracksByMood("war").length).toBeGreaterThanOrEqual(2);
    player.play("iron-march", audio);
    expect(player.state()).toBe("playing");
    expect(player.current()!.title).toBe("Iron March");
    expect(played).toEqual(["iron-march"]);
    player.pause(audio);
    expect(player.state()).toBe("paused");
    player.resume(audio);
    expect(player.state()).toBe("playing");
    expect(() => player.play("nope", audio)).toThrow();
  });
});

describe("identity (tasks 129-131)", () => {
  it("earns nicknames from deeds", () => {
    const n = createNicknames();
    expect(n.displayName("Aldric")).toBe("Aldric");
    expect(n.earn("win-outnumbered")).toBe("the Bold");
    expect(n.displayName("Aldric")).toBe("Aldric the Bold");
    expect(n.earn("win-outnumbered")).toBeNull(); // no duplicates
    expect(n.earn("unknown-deed")).toBeNull();
  });

  it("customizes portraits with stable keys", () => {
    const opts = customizePortrait({ hair: "red", scar: true });
    expect(portraitKey(opts)).toBe("tan|red|none|scar");
    expect(portraitKey(customizePortrait({}))).toBe("tan|brown|none|clean");
  });

  it("engraves mottos shown in tooltips", () => {
    const w = engraveMotto("Oathkeeper", "Hold the line.");
    expect(weaponTooltip(w)).toBe('Oathkeeper — "Hold the line."');
    expect(weaponTooltip({ name: "Plain", motto: null })).toBe("Plain");
    expect(() => engraveMotto("X", "")).toThrow();
  });
});
