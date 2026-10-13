/**
 * Tests for the music manager: scene pools, no-repeat shuffle, stingers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getMusicManager, type MusicScene } from "../musicManager.js";
import { getAudioManager } from "../AudioManager.js";

vi.mock("../AudioManager.js", () => {
  const playMusic = vi.fn().mockResolvedValue(undefined);
  const playSfx = vi.fn().mockResolvedValue(undefined);
  const stopMusic = vi.fn();
  return {
    getAudioManager: () => ({ playMusic, playSfx, stopMusic }),
  };
});

describe("MusicManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the scene pool on setScene", async () => {
    const mgr = getMusicManager();
    mgr.setScene("battle");
    const audio = getAudioManager();
    expect(audio.playMusic).toHaveBeenCalledTimes(1);
    const track = (audio.playMusic as any).mock.calls[0][0];
    expect(typeof track).toBe("string");
  });

  it("does not restart when the scene is unchanged", () => {
    const mgr = getMusicManager();
    mgr.setScene("town");
    const audio = getAudioManager();
    const calls = (audio.playMusic as any).mock.calls.length;
    mgr.setScene("town");
    expect((audio.playMusic as any).mock.calls.length).toBe(calls);
  });

  it("advances the pool after the track interval", () => {
    const mgr = getMusicManager();
    mgr.setScene("campaign");
    const audio = getAudioManager();
    const first = (audio.playMusic as any).mock.calls.length;
    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    expect((audio.playMusic as any).mock.calls.length).toBeGreaterThan(first);
  });

  it("plays the victory stinger then resumes", async () => {
    const mgr = getMusicManager();
    mgr.setScene("battle");
    const audio = getAudioManager();
    await mgr.playResult(true);
    expect(audio.playSfx).toHaveBeenCalledWith("victory-fanfare", { volume: 0.9 });
    const before = (audio.playMusic as any).mock.calls.length;
    vi.advanceTimersByTime(4001);
    expect((audio.playMusic as any).mock.calls.length).toBeGreaterThan(before);
  });

  it("plays the defeat stinger on loss", async () => {
    const mgr = getMusicManager();
    await mgr.playResult(false);
    const audio = getAudioManager();
    expect(audio.playSfx).toHaveBeenCalledWith("defeat", { volume: 0.9 });
  });

  it("stops music on stop()", () => {
    const mgr = getMusicManager();
    mgr.setScene("town");
    mgr.stop();
    expect(getAudioManager().stopMusic).toHaveBeenCalled();
  });

  it("each scene has a non-empty pool", () => {
    const mgr = getMusicManager();
    const scenes: MusicScene[] = ["menu", "campaign", "town", "battle", "court"];
    for (const scene of scenes) {
      mgr.setScene(scene);
      const audio = getAudioManager();
      expect((audio.playMusic as any).mock.calls.length).toBeGreaterThan(0);
      vi.clearAllMocks();
    }
  });
});
